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

export const WalletProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [account, setAccount] = useState<string | null>(null)
  const [isConnecting, setIsConnecting] = useState(false)
  const [isCheckingStatus, setIsCheckingStatus] = useState(false)
  const [onChainStatus, setOnChainStatus] = useState<OnChainStatus>('unregistered')
  const [userId, setUserId] = useState<string | null>(null)
  const queryClient = useQueryClient()

  const checkOnChainStatus = useCallback(async (address: string) => {
    if (!isValidAddress(address)) {
      setOnChainStatus('unregistered')
      setUserId(null)
      return
    }
    setIsCheckingStatus(true)
    setOnChainStatus('checking')
    try {
      const reg = await isRegistered(address)
      if (reg) {
        const id = await getUserIdFromChain(address)
        setUserId(id || null)
        setOnChainStatus('registered')
      } else {
        setUserId(null)
        setOnChainStatus('unregistered')
      }
    } catch (err) {
      console.warn('checkOnChainStatus failed:', err)
      setUserId(null)
      setOnChainStatus('unregistered')
    } finally {
      setIsCheckingStatus(false)
    }
  }, [])

  // Wallet connect
  const connect = async () => {
    if (isConnecting) return
    setIsConnecting(true)
    try {
      await switchToBSC()
      const addr = await connectWallet()
      const normalized = isValidAddress(addr) ? addr.toLowerCase() : null
      if (!normalized) throw new Error('Invalid wallet address returned by provider.')
      setAccount(normalized)
      // One-time status check on user action (no polling)
      await checkOnChainStatus(normalized)
    } catch (err: any) {
      showErrorToast(err)
    } finally {
      setIsConnecting(false)
    }
  }

  const disconnect = () => {
    setAccount(null)
    setUserId(null)
    setOnChainStatus('unregistered')
    // Clear all cached queries to avoid stale data cross-account
    try {
      queryClient.clear()
    } catch {}
  }

  const refreshStatus = async () => {
    if (account) {
      await checkOnChainStatus(account)
    }
  }

  // Listen for wallet/chain changes (lightweight)
  useEffect(() => {
    const eth = (window as any)?.ethereum
    if (!eth?.on) return

    const handleAccountsChanged = (accounts: string[]) => {
      const raw = accounts?.[0] || null
      const next = isValidAddress(raw) ? raw!.toLowerCase() : null
      setAccount(next)
      setUserId(null)
      setOnChainStatus('unregistered')
      // wipe cache on account switch
      try {
        queryClient.clear()
      } catch {}
    }

    const handleChainChanged = () => {
      // Don’t hard reload; just mark status unknown
      setOnChainStatus('unregistered')
    }

    eth.on('accountsChanged', handleAccountsChanged)
    eth.on('chainChanged', handleChainChanged)

    return () => {
      try {
        eth.removeListener('accountsChanged', handleAccountsChanged)
        eth.removeListener('chainChanged', handleChainChanged)
      } catch {}
    }
  }, [queryClient])

  const ctx: WalletContextType = {
    account,
    connect,
    disconnect,
    isConnecting,
    isCheckingStatus,
    onChainStatus,
    userId,
    refreshStatus,
  }

  return <WalletContext.Provider value={ctx}>{children}</WalletContext.Provider>
}

export const useWallet = (): WalletContextType => {
  const ctx = useContext(WalletContext)
  if (!ctx) throw new Error('useWallet must be used within a WalletProvider')
  return ctx
}
