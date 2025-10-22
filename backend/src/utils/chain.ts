// backend/src/utils/chain.ts
import { Contract, Interface, JsonRpcProvider, ethers } from 'ethers'
import type { Bindings } from './types'

export const PLATFORM_ABI = [
  'function isRegistered(address) view returns (bool)',
  'function addressToUserId(address) view returns (string)',
  'function referrerOf(address) view returns (address)',
  'function owner() view returns (address)',
  'function usdtToken() view returns (address)',
  'event MinerPurchased(address indexed user, uint256 amount, uint256 startTime, uint256 endTime)',
  'event UserRegistered(address indexed user, string userId, address indexed referrer)',
] as const

export const ERC20_ABI = ['function decimals() view returns (uint8)'] as const

export const MINER_PURCHASED_TOPIC = ethers.id('MinerPurchased(address,uint256,uint256,uint256)')
export const IFACE = new Interface(PLATFORM_ABI)

// For register-lite parsing (several variants found commonly)
export const REG_IFACES = [
  new Interface(['event UserRegistered(address indexed user, string userId, address indexed referrer)']),
  new Interface(['event UserRegistered(address user, string userId, address referrer)']),
  new Interface(['event UserRegistered(address indexed user, bytes32 userId, address indexed referrer)']),
  new Interface(['event Registered(address indexed user, string userId, address indexed referrer)']),
  new Interface(['event Registered(address indexed user, bytes32 userId, address indexed referrer)']),
]
export const REG_TOPICS = [
  ethers.id('UserRegistered(address,string,address)'),
  ethers.id('UserRegistered(address,bytes32,address)'),
  ethers.id('UserRegistered(address,string)'),
  ethers.id('UserRegistered(address,bytes32)'),
  ethers.id('Registered(address,string,address)'),
  ethers.id('Registered(address,bytes32,address)'),
  ethers.id('Registered(address,string)'),
  ethers.id('Registered(address,bytes32)'),
]

export function getProvider(env: Bindings): JsonRpcProvider {
  const url = (env.BSC_RPC_URL || '').replace(/\/+$/, '')
  if (!url) throw new Error('BSC_RPC_URL is not configured')
  return new JsonRpcProvider(url)
}

export function getContract(env: Bindings, provider: JsonRpcProvider) {
  return new Contract(env.CONTRACT_ADDRESS, PLATFORM_ABI, provider)
}

// cache decimals and token address
let DECIMALS_CACHE: number | null = null
let USDT_ADDR_CACHE: string | null = null

export async function getTokenDecimals(env: Bindings): Promise<{ address: string; decimals: number }> {
  if (DECIMALS_CACHE && USDT_ADDR_CACHE) return { address: USDT_ADDR_CACHE!, decimals: DECIMALS_CACHE! }
  const provider = getProvider(env)
  const platform = getContract(env, provider)
  let usdtAddr = ''
  try { usdtAddr = await (platform as any).usdtToken() } catch {}
  let dec = 18
  if (usdtAddr && usdtAddr !== ethers.ZeroAddress) {
    const erc20 = new Contract(usdtAddr, ERC20_ABI, provider)
    try { dec = Number(await (erc20 as any).decimals()) || 18 } catch { dec = 18 }
  }
  DECIMALS_CACHE = dec
  USDT_ADDR_CACHE = usdtAddr || ethers.ZeroAddress
  return { address: USDT_ADDR_CACHE, decimals: DECIMALS_CACHE }
}

export async function computeDailyCoins(env: Bindings, amountRaw: bigint): Promise<number> {
  const { decimals } = await getTokenDecimals(env)
  const units = ethers.formatUnits(amountRaw, decimals)
  const val = Math.floor(Number(units))
  return isFinite(val) && val > 0 ? val : 0
}

// Topics helpers
export const BLOCKS_PER_DAY = 28800
export function addressTopic(addr: string) {
  const a = ethers.getAddress(addr).toLowerCase().replace('0x', '')
  return '0x' + '0'.repeat(24) + a
}
