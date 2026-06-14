-- ============================================
-- 021_seed_test_subscription.sql
-- Set Phase Five Tester (phase5.test@loka.dev)
-- to Business Yearly for 1 year
-- ============================================

WITH target_user AS (
  SELECT id FROM auth.users WHERE email = 'phase5.test@loka.dev'
)
INSERT INTO subscriptions (
  user_id,
  plan_id,
  price,
  status,
  expires_at,
  next_billing,
  created_at,
  updated_at
)
SELECT
  id,
  'business',
  2990000,
  'active',
  now() + interval '1 year',
  (now() + interval '1 year')::text,
  now(),
  now()
FROM target_user
ON CONFLICT (user_id) DO UPDATE SET
  plan_id   = EXCLUDED.plan_id,
  price     = EXCLUDED.price,
  status    = EXCLUDED.status,
  expires_at = EXCLUDED.expires_at,
  next_billing = EXCLUDED.next_billing,
  updated_at = now();
