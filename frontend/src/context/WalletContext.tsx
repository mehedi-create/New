// frontend/src/context/WalletContext.tsx
import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { switchToBSC, connectWallet, isValidAddress } from '../utils/wallet'
import { isRegistered, addressToUserId as getUserIdFromChain } from '../utils/contract'
import { showErrorToast } from '../utils/notification'

type OnChainStatus = 'checking' | 'registered' | 'unregistered'

interface WalletContextType {
  account: string | null
  connect: () => Promise<void>
  disconnect: () => void
  isConnecting: boolean
  isCheckingStatus: boolean
  onChainStatus: OnChainStatus
  userId: string | null
  refreshStatus: () => Promise<void>
}

const WalletContext = createContext<WalletContextType | undefined>(undefined)

// Wait for injected provider (MetaMask/Coinbase, etc.)
const getEthereumProvider = (): Promise<any> => {
  return new Promise((resolve) => {
    if ((window as any).ethereum) {
      resolve((window as any).ethereum)
    } else {
      window.addEventListener('ethereum#initialized', () => resolve((window as any).ethereum), {
        once: true,
      })
      setTimeout(() => resolve((window as any).ethereum || null), 3000)
    }
  })
}

export const WalletProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [account, setAccount] = useState<string | null>(null)
  const [isConnecting, setIsConnecting] = useState(false)
  const [isCheckingStatus, setIsCheckingStatus] = useState(false) // no auto-check on load
  const [onChainStatus, setOnChainStatus] = useState<OnChainStatus>('unregistered')
  const [userId, setUserId] = useState<string | null>(null)
  const queryClient = useQueryClient()

  const checkOnChainStatus = useCallback(async (address: string) => {
    setIsCheckingStatus(true)
    setOnChainStatus('checking')
    setUserId(null)
    try {
      const registered = await isRegistered(address)
      if (registered) {
        const id = await getUserIdFromChain(address)
        setUserId(id)
        setOnChainStatus('registered')
      } else {
        setOnChainStatus('unregistered')
      }
    } catch (error) {
      console.error('On-chain check failed:', error)
      setOnChainStatus('unregistered')
    } finally {
      setIsCheckingStatus(false)
    }
  }, [])

  // Minimal listeners: do not auto-check; only reflect account change
  useEffect(() => {
    const setup = async () => {
      const ethereum = await getEthereumProvider()
      if (!ethereum?.on) return

      const handleAccountsChanged = (accounts: string[]) => {
        const raw = accounts.length > 0 ? accounts[0] : null
        const newAccount = isValidAddress(raw) ? raw!.toLowerCase() : null
        setAccount(newAccount)
        if (!newAccount) {
          setOnChainStatus('unregistered')
          setUserId(null)
          queryClient.clear()
        } else {
          setOnChainStatus('unregistered')
          setUserId(null)
        }
      }

      const handleChainChanged = () => {
        setOnChainStatus('unregistered')
      }

      ethereum.on('accountsChanged', handleAccountsChanged)
      ethereum.on('chainChanged', handleChainChanged)

      return () => {
        try {
          ethereum.removeListener('accountsChanged', handleAccountsChanged)
          ethereum.removeListener('chainChanged', handleChainChanged)
        } catch {}
      }
    }

    setup()
  }, [queryClient])

  const connect = async () => {
    if (isConnecting) return
    setIsConnecting(true)
    try {
      const ethereum = await getEthereumProvider()
      if (!ethereum) {
        throw new Error('Wallet not found. Please install MetaMask or use a Web3-enabled browser.')
      }
      await switchToBSC()
      const newAccount = await connectWallet()
      const normalized = isValidAddress(newAccount) ? newAccount.toLowerCase() : null
      if (!normalized) throw new Error('Invalid wallet address from provider.')
      setAccount(normalized)
      await checkOnChainStatus(normalized)
    } catch (error: any) {
      showErrorToast(error)
    } finally {
      setIsConnecting(false)
    }
  }

  const disconnect = () => {
    setAccount(null)
    setOnChainStatus('unregistered')
    setUserId(null)
    queryClient.clear()
  }

  const refreshStatus = async () => {
    if (account) {
      await checkOnChainStatus(account)
    }
  }

  const contextValue: WalletContextType = {
    account,
    connect,
    disconnect,
    isConnecting,
    isCheckingStatus,
    onChainStatus,
    userId,
    refreshStatus,
  }

  return <WalletContext.Provider value={contextValue}>{children}</WalletContext.Provider>
}

export const useWallet = (): WalletContextType => {
  const context = useContext(WalletContext)
  if (context === undefined) {
    throw new Error('useWallet must be used within a WalletProvider')
  }
  return context
}
