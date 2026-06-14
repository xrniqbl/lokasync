-- ============================================
-- 022_fix_subscription_transaction_schema.sql
-- Fix missing columns in subscriptions & transactions
-- that backend expects but were never created in 013
-- ============================================

-- Subscriptions: fields the frontend Subscription interface requires
ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS interval TEXT,
  ADD COLUMN IF NOT EXISTS order_id TEXT,
  ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS current_period_end TIMESTAMPTZ;

-- Transactions: fields the backend INSERT sets but were never in schema
ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS plan_name TEXT,
  ADD COLUMN IF NOT EXISTS interval TEXT,
  ADD COLUMN IF NOT EXISTS base INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS discount INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS gross_amount INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS midtrans JSONB DEFAULT '{}';
