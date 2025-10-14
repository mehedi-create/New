// frontend/src/services/api.ts
import axios from 'axios'
import { config } from '../config'

// Normalize base URL (no trailing slash)
const BASE = (config.apiBaseUrl || '').replace(/\/+$/, '')

export const api = axios.create({
  baseURL: BASE,
  timeout: 20000,
  headers: { 'Content-Type': 'application/json' },
})

// Simple write-queue: all write (POST/PATCH) requests run sequentially
let writeChain: Promise<void> = Promise.resolve()
async function enqueueWrite<T>(fn: () => Promise<T>): Promise<T> {
  const p = writeChain.then(fn)
  writeChain = p.then(() => undefined).catch(() => undefined)
  return p
}

// Types
export type StatsResponse = {
  userId: string
  coin_balance: number
  logins: { total_login_days: number }
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

// Health (optional)
export const getHealth = () => api.get('/api/health')

// Off-chain only stats (lightweight)
export const getStats = (address: string) =>
  api.get<StatsResponse>(`/api/stats/${address}`)

// Upsert user meta from chain (signed) — queued to avoid burst
export const upsertUserFromChain = (address: string, timestamp: number, signature: string) =>
  enqueueWrite(() =>
    api.post('/api/users/upsert-from-chain', { address, timestamp, signature })
  )

// Daily login mark (signed) — queued to avoid burst
export const markLogin = (address: string, timestamp: number, signature: string) =>
  enqueueWrite(() =>
    api.post(`/api/users/${address}/login`, { timestamp, signature })
  )

// Notices
export const getNotices = (params?: { limit?: number; active?: 0 | 1 }) =>
  api.get('/api/notices', { params })

export const createNotice = (payload: NoticePayload) =>
  enqueueWrite(() => api.post('/api/notices', payload))

export const updateNotice = (id: number, payload: NoticePayload) =>
  enqueueWrite(() => api.patch(`/api/notices/${id}`, payload))

// Backward-compat bootstrap helper (for old code paths):
// If stats 200 → 'redirect_dashboard', if 404 → 'await_backend_sync'.
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
