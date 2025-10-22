// backend/src/utils/types.ts

export type Bindings = {
  DB: D1Database
  ALLOWED_ORIGINS: string
  BSC_RPC_URL?: string
  CONTRACT_ADDRESS: string
}

// Optional helper types (useful across modules)
export type LoginRow = { cnt: number }
export type SumRow = { sum: number }
export type CoinRow = { coin_balance: number }

export type MiningPurchaseDb = {
  id: number
  tx_hash: string
  daily_coins: number
  total_days: number
  credited_days: number
  start_date: string
  last_credit_date?: string | null
}
