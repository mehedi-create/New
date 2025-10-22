-- backend/schema.sql
-- Cloudflare D1 (SQLite) schema for the referral platform
-- You can initialize with: `wrangler d1 execute referral_db --file=./schema.sql`

PRAGMA foreign_keys = ON;

BEGIN TRANSACTION;

-- Users table: on-chain registered users mirrored off-chain
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT UNIQUE,
  wallet_address TEXT UNIQUE,
  referrer_id TEXT,
  registration_tx_hash TEXT,
  is_active INTEGER DEFAULT 1,
  created_at TEXT
);

-- Helpful indexes
CREATE INDEX IF NOT EXISTS idx_users_referrer_id ON users(referrer_id);
CREATE INDEX IF NOT EXISTS idx_users_created_at ON users(created_at);

-- Daily login tracker (unique per day per wallet)
CREATE TABLE IF NOT EXISTS logins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  wallet_address TEXT NOT NULL,
  login_date TEXT NOT NULL,              -- YYYY-MM-DD
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(wallet_address, login_date)
);

CREATE INDEX IF NOT EXISTS idx_logins_wallet ON logins(wallet_address);
CREATE INDEX IF NOT EXISTS idx_logins_date ON logins(login_date);

-- Notice board: admin/owner can post announcements (HTML/script/image/link)
CREATE TABLE IF NOT EXISTS notices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT,
  content_html TEXT,
  image_url TEXT,
  link_url TEXT,
  is_active INTEGER DEFAULT 1,
  priority INTEGER DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_notices_active ON notices(is_active);
CREATE INDEX IF NOT EXISTS idx_notices_priority ON notices(priority);

-- Generic form submissions (optional base collection)
-- For dynamic forms, backend creates tables at runtime: form_<key>
CREATE TABLE IF NOT EXISTS form_submissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  form_key TEXT NOT NULL,
  wallet_address TEXT,
  fields_json TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_forms_key ON form_submissions(form_key);

COMMIT;
