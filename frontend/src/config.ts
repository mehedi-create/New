// frontend/src/config.ts

// Tip: set startBlock to your contract's deploy block for faster on-chain scans.
type AppConfig = {
  apiBaseUrl: string
  contractAddress: string
  usdtAddress: string
  usdtDecimals: number
  readRpcUrl: string
  chainId: number
  startBlock: number
  registrationFee?: string
}

const testnetConfig: AppConfig = {
  // Backend API base (no trailing slash)
  apiBaseUrl:
    (import.meta as any)?.env?.VITE_API_URL?.replace(/\/+$/, '') ||
    'https://referral-backend.mehedi35x.workers.dev',

  // Smart contract addresses
  contractAddress:
    (import.meta as any)?.env?.VITE_PLATFORM_ADDRESS ||
    '0x6938008a060E8Bef0aB9CcB1d93aCF880602fAe6',
  usdtAddress:
    (import.meta as any)?.env?.VITE_USDT_ADDRESS ||
    '0x337610d27c682E347C9cD60BD4b3b107C9d34dDd',

  // Token/chain config
  usdtDecimals: Number((import.meta as any)?.env?.VITE_USDT_DECIMALS || 18),
  readRpcUrl:
    (import.meta as any)?.env?.VITE_READ_RPC_URL ||
    'https://data-seed-prebsc-1-s1.binance.org:8545/',
  chainId: Number((import.meta as any)?.env?.VITE_CHAIN_ID || 97),

  // Set to your contract deploy block (improves event scans in frontend)
  startBlock: Number((import.meta as any)?.env?.VITE_START_BLOCK || 0),

  // Optional static fee label (frontend display); actual fee read from chain in runtime
  registrationFee: '12',
}

export const config = testnetConfig

// Optional theme (shared)
export const theme = {
  colors: {
    bgLightGreen: '#e8f9f1',
    bgLightGreen2: '#e0f5ed',
    deepNavy: '#0b1b3b',
    navySoft: '#163057',
    accent: '#14b8a6',
    accentDark: '#0e9c8c',
    white: '#ffffff',
    danger: '#b91c1c',
    grayLine: 'rgba(11,27,59,0.10)',
  },
}
