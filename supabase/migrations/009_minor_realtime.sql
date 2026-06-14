-- ═══════════════════════════════════════════════════════════════════════════════
-- LokaSync Minor Endpoints Realtime Enable (009)
-- ═══════════════════════════════════════════════════════════════════════════════

DO $$
BEGIN
  -- Teams
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'teams'
  ) THEN
    DO $$BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE teams; EXCEPTION WHEN duplicate_object THEN NULL; END$$;
  END IF;
  ALTER TABLE teams REPLICA IDENTITY FULL;

  -- Team Members
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'team_members'
  ) THEN
    DO $$BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE team_members; EXCEPTION WHEN duplicate_object THEN NULL; END$$;
  END IF;
  ALTER TABLE team_members REPLICA IDENTITY FULL;

  -- Settings
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'workspace_settings'
  ) THEN
    DO $$BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE workspace_settings; EXCEPTION WHEN duplicate_object THEN NULL; END$$;
  END IF;
  ALTER TABLE workspace_settings REPLICA IDENTITY FULL;

  -- Financial
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'workspace_financial'
  ) THEN
    DO $$BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE workspace_financial; EXCEPTION WHEN duplicate_object THEN NULL; END$$;
  END IF;
  ALTER TABLE workspace_financial REPLICA IDENTITY FULL;

  -- Integrations
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'workspace_integrations'
  ) THEN
    DO $$BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE workspace_integrations; EXCEPTION WHEN duplicate_object THEN NULL; END$$;
  END IF;
  ALTER TABLE workspace_integrations REPLICA IDENTITY FULL;

  -- Sessions
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'workspace_sessions'
  ) THEN
    DO $$BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE workspace_sessions; EXCEPTION WHEN duplicate_object THEN NULL; END$$;
  END IF;
  ALTER TABLE workspace_sessions REPLICA IDENTITY FULL;

  -- Dashboard
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'workspace_dashboard'
  ) THEN
    DO $$BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE workspace_dashboard; EXCEPTION WHEN duplicate_object THEN NULL; END$$;
  END IF;
  ALTER TABLE workspace_dashboard REPLICA IDENTITY FULL;

  -- Analytics
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'workspace_analytics'
  ) THEN
    DO $$BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE workspace_analytics; EXCEPTION WHEN duplicate_object THEN NULL; END$$;
  END IF;
  ALTER TABLE workspace_analytics REPLICA IDENTITY FULL;
END $$;
