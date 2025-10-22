// backend/src/utils/db.ts
import { ethers } from 'ethers'
import type { Bindings } from './types'
import { getContract, getProvider } from './chain'

export function todayISODate() {
  return new Date().toISOString().slice(0, 10)
}

export function isoDateFromUnix(sec: number) {
  return new Date(sec * 1000).toISOString().slice(0, 10)
}

export function daysBetweenInclusive(startDate: string, endDate: string) {
  const a = new Date(`${startDate}T00:00:00Z`).getTime()
  const b = new Date(`${endDate}T00:00:00Z`).getTime()
  if (isNaN(a) || isNaN(b)) return 0
  const diffDays = Math.floor((b - a) / (24 * 3600 * 1000))
  return diffDays < 0 ? 0 : diffDays + 1
}

export async function upsertDbUser(
  db: D1Database,
  payload: { walletAddress: string; userId: string; referrerId: string }
) {
  const stmt = `INSERT INTO users (user_id, wallet_address, referrer_id, is_active)
                VALUES (?, ?, ?, 1)
                ON CONFLICT(wallet_address) DO UPDATE SET
                  user_id = excluded.user_id,
                  referrer_id = excluded.referrer_id,
                  is_active = 1`
  await db.prepare(stmt)
    .bind(
      payload.userId.toUpperCase(),
      payload.walletAddress.toLowerCase(),
      (payload.referrerId || '').toUpperCase()
    )
    .run()
}

export async function getChainProfile(
  env: Bindings,
  address: string
): Promise<{ userId: string; referrerId: string; referrerAddr?: string } | null> {
  const provider = getProvider(env)
  const contract = getContract(env, provider)
  const [registered, userId, refAddr] = await Promise.all([
    (contract as any).isRegistered(address),
    (contract as any).addressToUserId(address),
    (contract as any).referrerOf(address),
  ])
  if (!registered || !userId) return null
  let referrerId = ''
  if (refAddr && refAddr !== ethers.ZeroAddress) {
    try { referrerId = await (contract as any).addressToUserId(refAddr) } catch {}
  }
  return { userId, referrerId, referrerAddr: refAddr }
}

export async function ensureUserInDb(env: Bindings, address: string) {
  const lower = address.toLowerCase()
  const exists = await env.DB.prepare('SELECT 1 FROM users WHERE wallet_address = ?').bind(lower).first()
  if (exists) return true
  const profile = await getChainProfile(env, address)
  if (!profile) return false
  await upsertDbUser(env.DB, {
    walletAddress: address,
    userId: profile.userId,
    referrerId: profile.referrerId || '',
  })
  return true
}

export async function findUserByIdOrWallet(
  db: D1Database,
  q: { userId?: string; wallet?: string }
) {
  if (q.userId) {
    return db
      .prepare('SELECT id, user_id, wallet_address, coin_balance, created_at FROM users WHERE user_id = ?')
      .bind(q.userId.toUpperCase())
      .first()
  }
  if (q.wallet) {
    return db
      .prepare('SELECT id, user_id, wallet_address, coin_balance, created_at FROM users WHERE wallet_address = ?')
      .bind(q.wallet.toLowerCase())
      .first()
  }
  return null
}
