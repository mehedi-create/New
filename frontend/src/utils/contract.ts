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
  'function totalCollected() view returns (uint256)',

  // optional admin (catch if missing)
  'function isAdmin(address) view returns (bool)',
  'function getAdminCommission(address) view returns (uint256)',

  // writes (optional presence — try/catch)
  'function withdrawCommission()',
  'function emergencyWithdrawAll()',
  'function withdrawWithFundCode(string fundCode)',
  'function buyMiner(uint256 amount)',
  'function withdrawLiquidity(uint256 amount)',

  // register
  'function register(string userId, string referrerId, string fundCode)',

  // events
  'event UserRegistered(address indexed user, string userId, address indexed referrer)',
  'event MinerPurchased(address indexed user, uint256 amount, uint256 startTime, uint256 endTime)',
]

const ERC20_ABI = [
  'function approve(address spender, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
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
const usdtRead = new Contract(USDT_ADDRESS, ERC20_ABI, readProvider)
const usdtWrite = async () => {
  const signer = await getSigner()
  return new Contract(USDT_ADDRESS, ERC20_ABI, signer)
}

// small sleep to pace sequential scans
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

// Basic caches to avoid repeated heavy scans
const referralCache = new Map<string, { ts: number; list: string[] }>()
const miningCache = new Map<string, { ts: number; stats: { count: number; totalDeposited: string } }>()
const ANALYTICS_TTL_MS = 60_000

const totalUsersCache: { ts: number; value: number } = { ts: 0, value: 0 }
const topRefCache = new Map<string, { ts: number; list: { address: string; userId: string; count: number }[] }>()

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

export const getTotalCollected = async () => {
  try {
    const raw: bigint = await (platformRead as any).totalCollected()
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

// Approve USDT for platform (exact amount)
export const approveUSDT = async (amount: string) => {
  const amt = parseUnits(String(amount || '0'), USDT_DECIMALS)
  const usdt = await usdtWrite()
  return usdt.approve(PLATFORM_ADDRESS, amt)
}

// NEW: Approve USDT Unlimited (MaxUint256)
export const approveUSDTMax = async () => {
  const usdt = await usdtWrite()
  return usdt.approve(PLATFORM_ADDRESS, ethers.MaxUint256)
}

// NEW: Read allowance (view)
export const getUSDTAllowance = async (owner: string, spender = PLATFORM_ADDRESS) => {
  const raw: bigint = await usdtRead.allowance(owner, spender)
  return raw // bigint
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

  for (let from = fromBlock; from <= toBlock; from += step + 1) {
    const end = Math.min(from + step, toBlock)
    try {
      const logs = await readProvider.getLogs({
        address: PLATFORM_ADDRESS,
        fromBlock: from,
        toBlock: end,
        topics: [ethers.id('UserRegistered(address,string,address)'), null, paddedRef],
      })
      for (const lg of logs) {
        try {
          const parsed = IFACE.parseLog(lg)
          const uid = String(parsed?.args?.userId || '')
          if (uid) list.add(uid)
        } catch {}
      }
    } catch {}
    await sleep(120)
  }

  const out = Array.from(list)
  referralCache.set(key, { ts: now, list: out })
  return out
}

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
    } catch {}
    await sleep(120)
  }

  const stats = { count, totalDeposited: formatUnits(totalRaw, USDT_DECIMALS) }
  miningCache.set(key, { ts: now, stats })
  return stats
}

// ---------- Chain analytics ----------
export const getTotalUsersFromChain = async (opts?: {
  startBlock?: number
  maxBlocks?: number
  step?: number
}) => {
  const now = Date.now()
  if (now - totalUsersCache.ts < ANALYTICS_TTL_MS) return totalUsersCache.value

  const latest = await readProvider.getBlockNumber()
  const startConfigured = typeof config.startBlock === 'number' ? config.startBlock : Number(config.startBlock || 0)
  const maxBlocks = opts?.maxBlocks ?? 200_000
  const step = Math.min(Math.max(opts?.step ?? 50_000, 10_000), 100_000)

  const fromBlock = startConfigured > 0 ? startConfigured : Math.max(0, latest - maxBlocks)
  const toBlock = latest

  const users = new Set<string>()

  for (let from = fromBlock; from <= toBlock; from += step + 1) {
    const end = Math.min(from + step, toBlock)
    try {
      const logs = await readProvider.getLogs({
        address: PLATFORM_ADDRESS,
        fromBlock: from,
        toBlock: end,
        topics: [TOPIC_USER_REGISTERED],
      })
      for (const lg of logs) {
        try {
          const parsed = IFACE.parseLog(lg)
          const userAddr = ethers.getAddress(parsed?.args?.user || ethers.ZeroAddress)
          if (userAddr !== ethers.ZeroAddress) users.add(userAddr)
        } catch {}
      }
    } catch {}
    await sleep(120)
  }

  totalUsersCache.ts = now
  totalUsersCache.value = users.size
  return users.size
}

export const getTopReferrersFromChain = async (
  limit = 10,
  opts?: { startBlock?: number; maxBlocks?: number; step?: number }
) => {
  const key = `LIM:${limit}|SB:${opts?.startBlock ?? config.startBlock ?? 0}`
  const cached = topRefCache.get(key)
  const now = Date.now()
  if (cached && now - cached.ts < ANALYTICS_TTL_MS) return cached.list

  const latest = await readProvider.getBlockNumber()
  const startConfigured = typeof config.startBlock === 'number' ? config.startBlock : Number(config.startBlock || 0)
  const maxBlocks = opts?.maxBlocks ?? 200_000
  const step = Math.min(Math.max(opts?.step ?? 50_000, 10_000), 100_000)

  const fromBlock = startConfigured > 0 ? startConfigured : Math.max(0, latest - maxBlocks)
  const toBlock = latest

  const counts = new Map<string, number>()

  for (let from = fromBlock; from <= toBlock; from += step + 1) {
    const end = Math.min(from + step, toBlock)
    try {
      const logs = await readProvider.getLogs({
        address: PLATFORM_ADDRESS,
        fromBlock: from,
        toBlock: end,
        topics: [TOPIC_USER_REGISTERED],
      })
      for (const lg of logs) {
        try {
          const parsed = IFACE.parseLog(lg)
          const ref = parsed?.args?.referrer as string
          if (ref && ref !== ethers.ZeroAddress) {
            const addr = ethers.getAddress(ref)
            counts.set(addr, (counts.get(addr) || 0) + 1)
          }
        } catch {}
      }
    } catch {}
    await sleep(120)
  }

  const sorted = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).slice(0, limit)
  const out: { address: string; userId: string; count: number }[] = []

  for (const [address, count] of sorted) {
    let userId = ''
    try {
      userId = String(await platformRead.addressToUserId(address))
    } catch {}
    out.push({ address, userId, count })
  }

  topRefCache.set(key, { ts: now, list: out })
  return out
}
