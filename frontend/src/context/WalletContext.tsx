// frontend/src/context/WalletContext.tsx
import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { switchToBSC, connectWallet } from '../utils/wallet';
import { isRegistered, addressToUserId as getUserIdFromChain } from '../utils/contract';
import { showErrorToast } from '../utils/notification';

type OnChainStatus = 'checking' | 'registered' | 'unregistered';

interface WalletContextType {
  account: string | null;
  connect: () => Promise<void>;
  disconnect: () => void;
  isConnecting: boolean;
  isCheckingStatus: boolean;
  onChainStatus: OnChainStatus;
  userId: string | null;
  refreshStatus: () => Promise<void>;
}

const WalletContext = createContext<WalletContextType | undefined>(undefined);

// Wait for injected provider (MetaMask/Coinbase, etc.)
const getEthereumProvider = (): Promise<any> => {
  return new Promise((resolve) => {
    if (window.ethereum) {
      resolve(window.ethereum);
    } else {
      window.addEventListener(
        'ethereum#initialized',
        () => resolve(window.ethereum),
        { once: true }
      );
      setTimeout(() => resolve(window.ethereum || null), 3000);
    }
  });
};

export const WalletProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [account, setAccount] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isCheckingStatus, setIsCheckingStatus] = useState(false); // no auto-check on load
  const [onChainStatus, setOnChainStatus] = useState<OnChainStatus>('unregistered');
  const [userId, setUserId] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const checkOnChainStatus = useCallback(async (address: string) => {
    setIsCheckingStatus(true);
    setOnChainStatus('checking');
    setUserId(null);
    try {
      const registered = await isRegistered(address);
      if (registered) {
        const id = await getUserIdFromChain(address);
        setUserId(id);
        setOnChainStatus('registered');
      } else {
        setOnChainStatus('unregistered');
      }
    } catch (error) {
      console.error('On-chain check failed:', error);
      setOnChainStatus('unregistered');
    } finally {
      setIsCheckingStatus(false);
    }
  }, []);

  // Minimal listeners: do not auto-check; only reflect account change
  useEffect(() => {
    const setup = async () => {
      const ethereum = await getEthereumProvider();
      if (!ethereum?.on) return;

      const handleAccountsChanged = (accounts: string[]) => {
        const newAccount = accounts.length > 0 ? accounts[0].toLowerCase() : null;
        setAccount(newAccount);
        // Do not auto check; wait for explicit user action
        if (!newAccount) {
          setOnChainStatus('unregistered');
          setUserId(null);
          queryClient.clear();
        } else {
          // When user changes account, mark as unknown/unregistered until they trigger a check
          setOnChainStatus('unregistered');
          setUserId(null);
        }
      };

      const handleChainChanged = () => {
        // Do not hard reload; require user action to reconnect/check
        setOnChainStatus('unregistered');
      };

      ethereum.on('accountsChanged', handleAccountsChanged);
      ethereum.on('chainChanged', handleChainChanged);

      return () => {
        try {
          ethereum.removeListener('accountsChanged', handleAccountsChanged);
          ethereum.removeListener('chainChanged', handleChainChanged);
        } catch {}
      };
    };

    setup();
  }, [queryClient]);

  const connect = async () => {
    if (isConnecting) return;
    setIsConnecting(true);
    try {
      const ethereum = await getEthereumProvider();
      if (!ethereum) {
        throw new Error('Wallet not found. Please install MetaMask or use a Web3-enabled browser.');
      }
      await switchToBSC();
      const newAccount = await connectWallet();
      setAccount(newAccount.toLowerCase());
      // User-initiated: now check status
      await checkOnChainStatus(newAccount);
    } catch (error: any) {
      showErrorToast(error);
    } finally {
      setIsConnecting(false);
    }
  };

  const disconnect = () => {
    setAccount(null);
    setOnChainStatus('unregistered');
    setUserId(null);
    queryClient.clear();
  };

  const refreshStatus = async () => {
    if (account) {
      await checkOnChainStatus(account);
    }
  };

  const contextValue: WalletContextType = {
    account,
    connect,
    disconnect,
    isConnecting,
    isCheckingStatus,
    onChainStatus,
    userId,
    refreshStatus,
  };

  return <WalletContext.Provider value={contextValue}>{children}</WalletContext.Provider>;
};

export const useWallet = (): WalletContextType => {
  const context = useContext(WalletContext);
  if (context === undefined) {
    throw new Error('useWallet must be used within a WalletProvider');
  }
  return context;
};
