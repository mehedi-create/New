// backend/src/utils/schema.ts

export async function ensureSchema(db: D1Database) {
  const stmts = [
    `CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT,
      wallet_address TEXT UNIQUE,
      referrer_id TEXT,
      is_active INTEGER DEFAULT 1,
      coin_balance INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE INDEX IF NOT EXISTS idx_users_referrer_id ON users(referrer_id)`,

    `CREATE TABLE IF NOT EXISTS logins (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      wallet_address TEXT NOT NULL,
      login_date TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(wallet_address, login_date)
    )`,

    `CREATE TABLE IF NOT EXISTS notices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT,
      content_html TEXT,
      image_url TEXT,
      link_url TEXT,
      kind TEXT DEFAULT 'text',
      is_active INTEGER DEFAULT 1,
      priority INTEGER DEFAULT 0,
      expires_at TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT
    )`,

    `CREATE TABLE IF NOT EXISTS referral_rewards (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      referred_wallet TEXT UNIQUE,
      referrer_id TEXT,
      reward_coins INTEGER DEFAULT 5,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`,

    `CREATE TABLE IF NOT EXISTS mining_purchases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      wallet_address TEXT NOT NULL,
      tx_hash TEXT UNIQUE,
      daily_coins INTEGER NOT NULL,
      total_days INTEGER DEFAULT 30,
      credited_days INTEGER DEFAULT 0,
      start_date TEXT NOT NULL,
      last_credit_date TEXT
    )`,

    `CREATE TABLE IF NOT EXISTS admin_coin_audit (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      wallet_address TEXT NOT NULL,
      delta INTEGER NOT NULL,
      reason TEXT,
      admin TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`,

    /* manual mining adjustments to reflect edited "Mining Coin" */
    `CREATE TABLE IF NOT EXISTS mining_adjustments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      wallet_address TEXT NOT NULL,
      delta INTEGER NOT NULL,
      reason TEXT,
      admin TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`
  ]

  await db.batch(stmts.map((sql) => db.prepare(sql)))

  // Safe migrations for older DBs (ignore errors if already applied)
  try { await db.prepare(`ALTER TABLE users ADD COLUMN coin_balance INTEGER DEFAULT 0`).run() } catch {}
  try { await db.prepare(`ALTER TABLE notices ADD COLUMN kind TEXT DEFAULT 'text'`).run() } catch {}
  try { await db.prepare(`ALTER TABLE notices ADD COLUMN expires_at TEXT`).run() } catch {}
  try { await db.prepare(`ALTER TABLE admin_coin_audit ADD COLUMN reason TEXT`).run() } catch {}
}
