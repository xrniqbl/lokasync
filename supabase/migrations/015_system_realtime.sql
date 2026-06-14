-- ═══════════════════════════════════════════════════════════════════════════════
-- LokaSync System Realtime Enable (015)
-- ═══════════════════════════════════════════════════════════════════════════════

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;

  -- Profiles
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'profiles') THEN
    DO $$BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE profiles; EXCEPTION WHEN duplicate_object THEN NULL; END$$;
  END IF;
  ALTER TABLE profiles REPLICA IDENTITY FULL;

  -- Plans
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'plans') THEN
    DO $$BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE plans; EXCEPTION WHEN duplicate_object THEN NULL; END$$;
  END IF;
  ALTER TABLE plans REPLICA IDENTITY FULL;

  -- Subscriptions
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'subscriptions') THEN
    DO $$BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE subscriptions; EXCEPTION WHEN duplicate_object THEN NULL; END$$;
  END IF;
  ALTER TABLE subscriptions REPLICA IDENTITY FULL;

  -- Vouchers
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'vouchers') THEN
    DO $$BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE vouchers; EXCEPTION WHEN duplicate_object THEN NULL; END$$;
  END IF;
  ALTER TABLE vouchers REPLICA IDENTITY FULL;

  -- Transactions
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'transactions') THEN
    DO $$BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE transactions; EXCEPTION WHEN duplicate_object THEN NULL; END$$;
  END IF;
  ALTER TABLE transactions REPLICA IDENTITY FULL;

  -- System Config
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'system_config') THEN
    DO $$BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE system_config; EXCEPTION WHEN duplicate_object THEN NULL; END$$;
  END IF;
  ALTER TABLE system_config REPLICA IDENTITY FULL;
END $$;
