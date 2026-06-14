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
    ALTER PUBLICATION supabase_realtime ADD TABLE teams;
  END IF;
  ALTER TABLE teams REPLICA IDENTITY FULL;

  -- Team Members
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'team_members'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE team_members;
  END IF;
  ALTER TABLE team_members REPLICA IDENTITY FULL;

  -- Settings
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'workspace_settings'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE workspace_settings;
  END IF;
  ALTER TABLE workspace_settings REPLICA IDENTITY FULL;

  -- Financial
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'workspace_financial'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE workspace_financial;
  END IF;
  ALTER TABLE workspace_financial REPLICA IDENTITY FULL;

  -- Integrations
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'workspace_integrations'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE workspace_integrations;
  END IF;
  ALTER TABLE workspace_integrations REPLICA IDENTITY FULL;

  -- Sessions
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'workspace_sessions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE workspace_sessions;
  END IF;
  ALTER TABLE workspace_sessions REPLICA IDENTITY FULL;

  -- Dashboard
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'workspace_dashboard'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE workspace_dashboard;
  END IF;
  ALTER TABLE workspace_dashboard REPLICA IDENTITY FULL;

  -- Analytics
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'workspace_analytics'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE workspace_analytics;
  END IF;
  ALTER TABLE workspace_analytics REPLICA IDENTITY FULL;
END $$;
