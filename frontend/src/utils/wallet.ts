// frontend/src/utils/wallet.ts
import { BrowserProvider } from 'ethers'
import type { Eip1193Provider } from 'ethers'
import { config } from '../config'

declare global {
  interface Window {
    ethereum?: Eip1193Provider
  }
}

export const isValidAddress = (a?: string | null) =>
  typeof a === 'string' && /^0x[0-9a-fA-F]{40}$/.test(a)

// Get injected provider (MetaMask/Wallet)
const getProvider = (): BrowserProvider | null => {
  if (typeof window === 'undefined' || !window.ethereum) {
    console.warn('Wallet provider (window.ethereum) not found.')
    return null
  }
  return new BrowserProvider(window.ethereum)
}

export const connectWallet = async (): Promise<string> => {
  const provider = getProvider()
  if (!provider) {
    throw new Error('Wallet not found. Please install MetaMask or a compatible wallet.')
  }

  try {
    const accounts = await provider.send('eth_requestAccounts', [])
    if (!accounts || accounts.length === 0) {
      throw new Error('Connection request rejected or no accounts found.')
    }
    return accounts[0]
  } catch (error: any) {
    if (error?.code === 4001) {
      // EIP-1193 user rejected request
      throw new Error('Request rejected in wallet.')
    }
    console.error('Failed to connect wallet:', error)
    throw new Error('Could not connect wallet. Please try again.')
  }
}

export const switchToBSC = async (): Promise<void> => {
  if (!window.ethereum) {
    throw new Error('Wallet not found.')
  }

  const targetChainIdHex = `0x${config.chainId.toString(16)}`

  try {
    await (window.ethereum as any).request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: targetChainIdHex }],
    })
  } catch (error: any) {
    // 4902: Unrecognized chain → add then retry
    if (error?.code === 4902) {
      try {
        const isMainnet = config.chainId === 56
        const networkDetails = isMainnet
          ? {
              chainId: targetChainIdHex,
              chainName: 'BNB Smart Chain',
              nativeCurrency: { name: 'BNB', symbol: 'BNB', decimals: 18 },
              rpcUrls: ['https://bsc-dataseed.binance.org/'],
              blockExplorerUrls: ['https://bscscan.com'],
            }
          : {
              chainId: targetChainIdHex,
              chainName: 'BSC Testnet',
              nativeCurrency: { name: 'tBNB', symbol: 'tBNB', decimals: 18 },
              rpcUrls: ['https://data-seed-prebsc-1-s1.binance.org:8545/'],
              blockExplorerUrls: ['https://testnet.bscscan.com'],
            }
        await (window.ethereum as any).request({
          method: 'wallet_addEthereumChain',
          params: [networkDetails],
        })
      } catch (addError: any) {
        if (addError?.code === 4001) {
          throw new Error('Network add request rejected in wallet.')
        }
        throw new Error('Could not add the required network to your wallet.')
      }
    } else if (error?.code === 4001) {
      throw new Error('Network switch request rejected in wallet.')
    } else {
      throw new Error('Could not switch to the required network.')
    }
  }
}
