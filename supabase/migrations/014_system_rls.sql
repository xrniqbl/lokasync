-- ═══════════════════════════════════════════════════════════════════════════════
-- LokaSync System RLS Policies (014)
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── Profiles ──────────────────────────────────────────────────────────────────
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY profiles_select ON profiles FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY profiles_insert ON profiles FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY profiles_update ON profiles FOR UPDATE TO authenticated
  USING (user_id = auth.uid());

-- ── Plans ─────────────────────────────────────────────────────────────────────
ALTER TABLE plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY plans_select ON plans FOR SELECT TO authenticated
  USING (true);

-- ── Subscriptions ─────────────────────────────────────────────────────────────
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY subscriptions_select ON subscriptions FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY subscriptions_insert ON subscriptions FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY subscriptions_update ON subscriptions FOR UPDATE TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY subscriptions_delete ON subscriptions FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- ── Vouchers ──────────────────────────────────────────────────────────────────
ALTER TABLE vouchers ENABLE ROW LEVEL SECURITY;

CREATE POLICY vouchers_select ON vouchers FOR SELECT TO authenticated
  USING (true);

-- ── Transactions ──────────────────────────────────────────────────────────────
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY transactions_select ON transactions FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY transactions_insert ON transactions FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY transactions_update ON transactions FOR UPDATE TO authenticated
  USING (user_id = auth.uid());

-- ── System Config ─────────────────────────────────────────────────────────────
ALTER TABLE system_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY system_config_select ON system_config FOR SELECT TO authenticated
  USING (true);
