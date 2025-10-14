// frontend/src/utils/contract.ts
import {
  BrowserProvider,
  Contract,
  Interface,
  JsonRpcProvider,
  ZeroAddress,
  ethers,
  parseUnits,
  formatUnits,
  zeroPadValue,
} from 'ethers'
import { config } from '../config'

/**
 * Lightweight contract helper:
 * - Frontend reads as much as possible directly from chain
 * - Backend only keeps minimal off-chain data (userId/ref counts/coins/notices)
 */

// ---------- Providers ----------
const readProvider = new JsonRpcProvider(config.readRpcUrl)

const getBrowserProvider = (): BrowserProvider => {
  if (typeof window === 'undefined' || !(window as any).ethereum) {
    throw new Error('Wallet not found. Please install a Web3 wallet.')
  }
  return new BrowserProvider((window as any).ethereum)
}

const getSigner = async () => {
  const provider = getBrowserProvider()
  return provider.getSigner()
}

// ---------- Addresses ----------
const PLATFORM_ADDRESS = config.contractAddress
const USDT_ADDRESS = config.usdtAddress
const USDT_DECIMALS = config.usdtDecimals ?? 18

// ---------- ABIs (minimal) ----------
const PLATFORM_ABI = [
  // reads
  'function isRegistered(address) view returns (bool)',
  'function addressToUserId(address) view returns (string)',
  'function referrerOf(address) view returns (address)',
  'function hasSetFundCode(address) view returns (bool)',
  'function userBalances(address) view returns (uint256)',
  'function registrationFee() view returns (uint256)',
  'function owner() view returns (address)',
  'function getContractBalance() view returns (uint256)',

  // optional admin (catch if missing)
  'function isAdmin(address) view returns (bool)',
  'function getAdminCommission(address) view returns (uint256)',

  // writes (optional presence — try/catch)
  'function withdrawCommission()',
  'function emergencyWithdrawAll()',
  'function withdrawWithFundCode(string fundCode)',
  'function buyMiner(uint256 amount)',
  'function withdrawLiquidity(uint256 amount)',

  // register (name may vary across deployments; adjust if needed)
  'function register(string userId, string referrerId, string fundCode)',

  // events
  'event UserRegistered(address indexed user, string userId, address indexed referrer)',
  'event MinerPurchased(address indexed user, uint256 amount, uint256 startTime, uint256 endTime)',
]

const ERC20_ABI = [
  'function approve(address spender, uint256 amount) returns (bool)',
  'function decimals() view returns (uint8)',
  'function balanceOf(address) view returns (uint256)',
]

// Interface for parsing events
const IFACE = new Interface(PLATFORM_ABI)

// Topics
const TOPIC_USER_REGISTERED = ethers.id('UserRegistered(address,string,address)')
const TOPIC_MINER_PURCHASED = ethers.id('MinerPurchased(address,uint256,uint256,uint256)')

// ---------- Internal helpers ----------
const platformRead = new Contract(PLATFORM_ADDRESS, PLATFORM_ABI, readProvider)

const platformWrite = async () => {
  const signer = await getSigner()
  return new Contract(PLATFORM_ADDRESS, PLATFORM_ABI, signer)
}
const usdtWrite = async () => {
  const signer = await getSigner()
  return new Contract(USDT_ADDRESS, ERC20_ABI, signer)
}

// small sleep to pace sequential scans
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

// Basic caches to avoid repeated heavy scans
const referralCache = new Map<string, { ts: number; list: string[] }>()
const miningCache = new Map<string, { ts: number; stats: { count: number; totalDeposited: string } }>()

const CACHE_TTL_MS = 60_000

// ---------- Auth/sign ----------
export const signAuthMessage = async (address: string) => {
  const signer = await getSigner()
  const ts = Math.floor(Date.now() / 1000)
  const msg = `I authorize the backend to sync my on-chain profile.
Address: ${ethers.getAddress(address)}
Timestamp: ${ts}`
  const signature = await signer.signMessage(msg)
  return { timestamp: ts, signature }
}

// ---------- Simple reads ----------
export const isRegistered = async (address: string) => {
  return Boolean(await platformRead.isRegistered(address))
}

export const addressToUserId = async (address: string) => {
  const id = await platformRead.addressToUserId(address)
  return String(id || '')
}

export const referrerOf = async (address: string) => {
  const r = await platformRead.referrerOf(address)
  return r && r !== ZeroAddress ? ethers.getAddress(r) : ZeroAddress
}

export const hasSetFundCode = async (address: string) => {
  return Boolean(await platformRead.hasSetFundCode(address))
}

export const getUserBalance = async (address: string) => {
  const raw: bigint = await platformRead.userBalances(address)
  return formatUnits(raw || 0n, USDT_DECIMALS)
}

export const getRegistrationFee = async () => {
  const raw: bigint = await platformRead.registrationFee()
  return formatUnits(raw || 0n, USDT_DECIMALS)
}

export const getOwner = async () => {
  const o = await platformRead.owner()
  return ethers.getAddress(o)
}

export const isAdmin = async (address: string) => {
  try {
    return Boolean(await platformRead.isAdmin(address))
  } catch {
    return false
  }
}

export const getAdminCommission = async (address: string) => {
  try {
    const raw: bigint = await platformRead.getAdminCommission(address)
    return formatUnits(raw || 0n, USDT_DECIMALS)
  } catch {
    return '0'
  }
}

export const getContractBalance = async () => {
  try {
    const raw: bigint = await platformRead.getContractBalance()
    return formatUnits(raw || 0n, USDT_DECIMALS)
  } catch {
    return '0'
  }
}

// ---------- Writes (tx) ----------
export const withdrawCommission = async () => {
  const c = await platformWrite()
  // @ts-ignore
  return c.withdrawCommission()
}

export const emergencyWithdrawAll = async () => {
  const c = await platformWrite()
  // @ts-ignore
  return c.emergencyWithdrawAll()
}

export const withdrawWithFundCode = async (fundCode: string) => {
  const c = await platformWrite()
  // @ts-ignore
  return c.withdrawWithFundCode(fundCode)
}

// Approve USDT for platform
export const approveUSDT = async (amount: string) => {
  const amt = parseUnits(String(amount || '0'), USDT_DECIMALS)
  const usdt = await usdtWrite()
  return usdt.approve(PLATFORM_ADDRESS, amt)
}

// Buy miner with USDT amount (approved beforehand)
export const buyMiner = async (amount: string) => {
  const c = await platformWrite()
  const amt = parseUnits(String(amount || '0'), USDT_DECIMALS)
  // @ts-ignore
  return c.buyMiner(amt)
}

export const withdrawLiquidity = async (amount: string) => {
  const c = await platformWrite()
  const amt = parseUnits(String(amount || '0'), USDT_DECIMALS)
  // @ts-ignore
  return c.withdrawLiquidity(amt)
}

// Register — requires USDT approval first
export const registerUser = async (userId: string, referrerId: string, fundCode: string) => {
  const c = await platformWrite()
  // @ts-ignore
  return c.register(userId, referrerId, fundCode)
}

// ---------- On-chain derived data (referrals, mining) ----------

// Get L1 referrals (userIds) by scanning UserRegistered events where referrer == address
export const getLevel1ReferralIdsFromChain = async (referrerAddress: string, opts?: {
  startBlock?: number
  maxBlocks?: number
  step?: number
}) => {
  const key = ethers.getAddress(referrerAddress)
  const cached = referralCache.get(key)
  const now = Date.now()
  if (cached && now - cached.ts < CACHE_TTL_MS) return cached.list

  const latest = await readProvider.getBlockNumber()
  const startConfigured = typeof config.startBlock === 'number' ? config.startBlock : Number(config.startBlock || 0)
  const maxBlocks = opts?.maxBlocks ?? 200_000
  const step = Math.min(Math.max(opts?.step ?? 50_000, 10_000), 100_000)

  const fromBlock = startConfigured > 0 ? startConfigured : Math.max(0, latest - maxBlocks)
  const toBlock = latest

  const paddedRef = zeroPadValue(key, 32)

  const list = new Set<string>()

  // Sequential scan to avoid RPC burst
  for (let from = fromBlock; from <= toBlock; from += step + 1) {
    const end = Math.min(from + step, toBlock)
    try {
      const logs = await readProvider.getLogs({
        address: PLATFORM_ADDRESS,
        fromBlock: from,
        toBlock: end,
        topics: [TOPIC_USER_REGISTERED, null, paddedRef],
      })
      for (const lg of logs) {
        try {
          const parsed = IFACE.parseLog(lg)
          const uid = String(parsed?.args?.userId || '')
          if (uid) list.add(uid)
        } catch {}
      }
    } catch {
      // ignore range errors and keep scanning
    }
    // small delay to avoid rate limit
    await sleep(120)
  }

  const out = Array.from(list)
  referralCache.set(key, { ts: now, list: out })
  return out
}

// Mining stats derived from MinerPurchased events for the user
export const getUserMiningStats = async (userAddress: string, opts?: {
  startBlock?: number
  maxBlocks?: number
  step?: number
}) => {
  const key = ethers.getAddress(userAddress)
  const cached = miningCache.get(key)
  const now = Date.now()
  if (cached && now - cached.ts < CACHE_TTL_MS) return cached.stats

  const latest = await readProvider.getBlockNumber()
  const startConfigured = typeof config.startBlock === 'number' ? config.startBlock : Number(config.startBlock || 0)
  const maxBlocks = opts?.maxBlocks ?? 200_000
  const step = Math.min(Math.max(opts?.step ?? 50_000, 10_000), 100_000)

  const fromBlock = startConfigured > 0 ? startConfigured : Math.max(0, latest - maxBlocks)
  const toBlock = latest

  const paddedUser = zeroPadValue(key, 32)

  let count = 0
  let totalRaw = 0n

  for (let from = fromBlock; from <= toBlock; from += step + 1) {
    const end = Math.min(from + step, toBlock)
    try {
      const logs = await readProvider.getLogs({
        address: PLATFORM_ADDRESS,
        fromBlock: from,
        toBlock: end,
        topics: [TOPIC_MINER_PURCHASED, paddedUser],
      })
      for (const lg of logs) {
        try {
          const parsed = IFACE.parseLog(lg)
          const amountRaw = BigInt(parsed?.args?.amount || 0n)
          if (amountRaw > 0n) {
            count += 1
            totalRaw += amountRaw
          }
        } catch {}
      }
    } catch {
      // ignore errors and continue
    }
    await sleep(120)
  }

  const stats = { count, totalDeposited: formatUnits(totalRaw, USDT_DECIMALS) }
  miningCache.set(key, { ts: now, stats })
  return stats
}
