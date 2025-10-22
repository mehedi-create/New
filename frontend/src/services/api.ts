import axios from 'axios'
import { config } from '../config'

// Normalize base URL (no trailing slash)
const BASE = (config.apiBaseUrl || '').replace(/\/+$/, '')

export const api = axios.create({
  baseURL: BASE,
  timeout: 20000, // default for reads
  headers: { 'Content-Type': 'application/json' },
})

// Simple write-queue: all write (POST/PATCH/DELETE) requests run sequentially
let writeChain: Promise<void> = Promise.resolve()
async function enqueueWrite<T>(fn: () => Promise<T>): Promise<T> {
  const p = writeChain.then(fn)
  writeChain = p.then(() => undefined).catch(() => undefined)
  return p
}

// ---------------- Types ----------------
export type StatsResponse = {
  userId: string
  coin_balance: number
  logins: {
    total_login_days: number
    today_claimed: boolean
    today_date: string
    next_reset_utc_ms: number
  }
  referrals?: {
    l1_count: number
  }
}

export type LoginResponse = {
  ok: boolean
  total_login_days: number
  mining_credited: number
  today_claimed: boolean
  next_reset_utc_ms: number
}

// Public notices (for user dashboard)
export type PublicNotice = {
  id: number
  kind: 'image' | 'script'
  image_url?: string
  link_url?: string
  content_html?: string
  priority?: number
  created_at?: string
  expires_at?: string | null
}

// Admin-side notice type
export type AdminNotice = {
  id: number
  kind: 'image' | 'script'
  is_active: 0 | 1
  priority: number
  image_url?: string
  link_url?: string
  content_html?: string
  created_at?: string
  expires_at?: string | null
}

// Admin: create/update payloads (no title; optional expiry)
export type CreateNoticePayload = {
  address: string
  timestamp: number
  signature: string
  kind: 'image' | 'script'
  // image
  image_url?: string
  link_url?: string
  // script
  content_html?: string
  // flags
  is_active?: boolean
  priority?: number
  // expiry (pick one or none)
  expires_in_sec?: number
  expires_at?: string
}

export type UpdateNoticePayload = Partial<Omit<CreateNoticePayload, 'kind'>> & {
  address: string
  timestamp: number
  signature: string
  kind?: 'image' | 'script'
}

// Mining history (backend DB)
// FIX: include id to match backend response used in AdminDashboard
export type MiningHistoryItem = {
  id: number
  tx_hash: string
  amount_usd: number
  daily_coins: number
  start_date: string // YYYY-MM-DD (UTC)
  total_days: number
  credited_days: number
  end_date: string // YYYY-MM-DD (UTC)
  active: boolean
  days_left: number
}

// Admin tools: user info/adjust coins/miner add/remove
export type AdminOverviewResponse = { ok: boolean; total_users: number; total_coins: number }
export type AdminTopReferrer = { address: string; userId: string; count: number }

export type AdminUserInfo = {
  ok: boolean
  user?: {
    user_id: string
    wallet_address: string
    coin_balance: number
    logins: number
    referral_coins: number
    mining: { purchases: number; mined_coins: number }
    created_at: string
  }
  error?: string
}

export type AdjustCoinsResponse = { ok: boolean; wallet: string; coin_balance: number; error?: string }
export type AdminMinerAddResponse = {
  ok: boolean
  wallet: string
  daily_coins: number
  total_days: number
  start_date: string
  credited_now: number
}
export type AdminMinerRemoveResponse = { ok: boolean; deducted: number }

// NEW: register-lite response
export type RegisterLiteResponse = {
  ok: boolean
  user: { address: string; userId: string; referrerId: string }
  referral_bonus?: { awarded: boolean; referrer: string }
}

// ---------------- Health ----------------
export const getHealth = () => api.get('/api/health')

// ---------------- Stats (off-chain) ----------------
export const getStats = (address: string) =>
  api.get<StatsResponse>(`/api/stats/${address}`)

// ---------------- User upsert (from chain) ----------------
export const upsertUserFromChain = (address: string, timestamp: number, signature: string) =>
  enqueueWrite(() =>
    api.post('/api/users/upsert-from-chain', { address, timestamp, signature }, { timeout: 45000 })
  )

// ---------------- NEW: Register-lite (no signature; only tx hash) ----------------
export const registerLite = (txHash: string) =>
  enqueueWrite(() =>
    api.post<RegisterLiteResponse>(
      '/api/users/register-lite',
      { tx_hash: txHash },
      { timeout: 45000 }
    )
  )

// ---------------- Daily login (signed) ----------------
export const markLogin = (address: string, timestamp: number, signature: string) =>
  enqueueWrite(() =>
    api.post<LoginResponse>(`/api/users/${address}/login`, { timestamp, signature }, { timeout: 45000 })
  )

// Smart helper (optional): ensure + login in one go
export const markLoginSmart = async (address: string) => {
  const { signAuthMessage } = await import('../utils/contract')
  const { timestamp, signature } = await signAuthMessage(address)
  try {
    await markLogin(address, timestamp, signature)
    return { ok: true }
  } catch (e: any) {
    const status = e?.response?.status || e?.status
    if (status === 404) {
      await upsertUserFromChain(address, timestamp, signature)
      await markLogin(address, timestamp, signature)
      return { ok: true }
    }
    if (status === 409) {
      return { ok: true, already: true }
    }
    throw e
  }
}

// ---------------- Mining (off-chain record) ----------------
export const recordMiningPurchase = async (address: string, txHash: string) => {
  const { signAuthMessage } = await import('../utils/contract')
  const { timestamp, signature } = await signAuthMessage(address)
  return enqueueWrite(() =>
    api.post(
      '/api/mining/record-purchase',
      { address, tx_hash: txHash, timestamp, signature },
      { timeout: 45000 }
    )
  )
}

// NEW: Lite recorder — only tx hash (no signature)
export const recordMiningPurchaseLite = async (txHash: string) =>
  enqueueWrite(() =>
    api.post(
      '/api/mining/record-purchase-lite',
      { tx_hash: txHash },
      { timeout: 45000 }
    )
  )

// Mining history
export const getMiningHistory = (address: string) =>
  api.get<{ items: MiningHistoryItem[] }>(`/api/mining/history/${address}`)

// ---------------- Public Notices ----------------
export const getNotices = (params?: { limit?: number; active?: 0 | 1 }) =>
  api.get<{ notices: PublicNotice[] }>('/api/notices', { params })

// ---------------- Admin Notices (create/update/delete/list) ----------------
export const createNotice = (payload: CreateNoticePayload) =>
  enqueueWrite(() => api.post('/api/notices', payload, { timeout: 45000 }))

export const updateNotice = (id: number, payload: UpdateNoticePayload) =>
  enqueueWrite(() => api.patch(`/api/notices/${id}`, payload, { timeout: 45000 }))

export const deleteNotice = (id: number, payload: { address: string; timestamp: number; signature: string }) =>
  enqueueWrite(() => api.delete(`/api/notices/${id}`, { data: payload, timeout: 45000 }))

export const getAdminNotices = (limit = 100) =>
  api.get<{ ok: boolean; notices: AdminNotice[] }>('/api/admin/notices', { params: { limit } })

// ---------------- Admin (stats) ----------------
export const getAdminOverview = () =>
  api.get<AdminOverviewResponse>('/api/admin/overview')

// Optional (if backend has it; safe to keep)
export const getAdminTopReferrers = (limit = 10) =>
  api.get<{ ok: boolean; top: AdminTopReferrer[] }>('/api/admin/top-referrers', { params: { limit } })

// ---------------- Admin Tools: user-info / adjust-coins / miner add-remove ----------------
export const getAdminUserInfo = (payload: {
  address: string
  timestamp: number
  signature: string
  user_id?: string
  wallet?: string
}) =>
  api.post<AdminUserInfo>('/api/admin/user-info', payload, { timeout: 30000 })

export const adjustUserCoins = (payload: {
  address: string
  timestamp: number
  signature: string
  user_id?: string
  wallet?: string
  delta: number
  reason?: string
}) =>
  enqueueWrite(() =>
    api.post<AdjustCoinsResponse>('/api/admin/adjust-coins', payload, { timeout: 45000 })
  )

export const adminMinerAdd = (payload: {
  address: string
  timestamp: number
  signature: string
  wallet: string
  amount_usd: number
  start_date?: string
  total_days?: number
  tx_hash?: string
}) =>
  enqueueWrite(() =>
    api.post<AdminMinerAddResponse>('/api/admin/miner-add', payload, { timeout: 45000 })
  )

export const adminMinerRemove = (payload: {
  address: string
  timestamp: number
  signature: string
  wallet: string
  id?: number
  tx_hash?: string
}) =>
  enqueueWrite(() =>
    api.post<AdminMinerRemoveResponse>('/api/admin/miner-remove', payload, { timeout: 45000 })
  )

// ---------------- Bootstrap helper (legacy) ----------------
export const getUserBootstrap = async (address: string) => {
  try {
    await getStats(address)
    return { data: { action: 'redirect_dashboard' } }
  } catch (e: any) {
    const status = e?.response?.status || e?.status
    if (status === 404) {
      return { data: { action: 'await_backend_sync' } }
    }
    throw e
  }
}

// ---------------- Ensure profile (optional helper) ----------------
export const ensureUserProfile = async (address: string) => {
  try {
    await getStats(address) // exists → ok
    return { ensured: true, existed: true }
  } catch (e: any) {
    const status = e?.response?.status || e?.status
    if (status !== 404) throw e
  }
  const { signAuthMessage } = await import('../utils/contract')
  const { timestamp, signature } = await signAuthMessage(address)
  try {
    await upsertUserFromChain(address, timestamp, signature)
    return { ensured: true, existed: false }
  } catch (e: any) {
    const status = e?.response?.status || e?.status
    if (status === 409) return { ensured: true, existed: false, conflict: true }
    throw e
  }
}
