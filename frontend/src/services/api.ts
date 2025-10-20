import axios from 'axios'
import { config } from '../config'

// Normalize base URL (no trailing slash)
const BASE = (config.apiBaseUrl || '').replace(/\/+$/, '')

export const api = axios.create({
  baseURL: BASE,
  timeout: 20000, // default for reads
  headers: { 'Content-Type': 'application/json' },
})

// Simple write-queue: all write (POST/PATCH) requests run sequentially
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
}

export type LoginResponse = {
  ok: boolean
  total_login_days: number
  mining_credited: number
  today_claimed: boolean
  next_reset_utc_ms: number
}

export type NoticePayload = {
  address: string
  timestamp: number
  signature: string
  title?: string
  content_html?: string
  image_url?: string
  link_url?: string
  is_active?: boolean
  priority?: number
  kind?: 'image' | 'text' | 'script'
}

export type AdminOverviewResponse = {
  ok: boolean
  total_users: number
  total_coins: number
}

export type AdminTopReferrer = {
  address: string
  userId: string
  count: number
}

// ---------------- Health ----------------
export const getHealth = () => api.get('/api/health')

// ---------------- Stats (off-chain) ----------------
export const getStats = (address: string) =>
  api.get<StatsResponse>(`/api/stats/${address}`)

// ---------------- User upsert (from chain) ----------------
// Per-request longer timeout for serverless/cold-start
export const upsertUserFromChain = (address: string, timestamp: number, signature: string) =>
  enqueueWrite(() =>
    api.post('/api/users/upsert-from-chain', { address, timestamp, signature }, { timeout: 45000 })
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
      // user missing → upsert then retry
      await upsertUserFromChain(address, timestamp, signature)
      await markLogin(address, timestamp, signature)
      return { ok: true }
    }
    if (status === 409) {
      // already counted / conflict → treat as success
      return { ok: true, already: true }
    }
    throw e
  }
}

// ---------------- Mining (off-chain record) ----------------
// Verify tx on-chain then record purchase for daily coin credits
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

// ---------------- Notices ----------------
export const getNotices = (params?: { limit?: number; active?: 0 | 1 }) =>
  api.get('/api/notices', { params })

export const createNotice = (payload: NoticePayload) =>
  enqueueWrite(() => api.post('/api/notices', payload, { timeout: 45000 }))

export const updateNotice = (id: number, payload: NoticePayload) =>
  enqueueWrite(() => api.patch(`/api/notices/${id}`, payload, { timeout: 45000 }))

// ---------------- Admin (stats) ----------------
export const getAdminOverview = () =>
  api.get<AdminOverviewResponse>('/api/admin/overview')

export const getAdminTopReferrers = (limit = 10) =>
  api.get<{ ok: boolean; top: AdminTopReferrer[] }>('/api/admin/top-referrers', { params: { limit } })

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
// Use this to silently create user off-chain if missing (e.g., after login/dashboard mount)
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
    // If backend returns 409/ok: true inflight/dedup, still consider ensured
    const status = e?.response?.status || e?.status
    if (status === 409) return { ensured: true, existed: false, conflict: true }
    throw e
  }
}
