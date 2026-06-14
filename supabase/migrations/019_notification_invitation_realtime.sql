-- ═══════════════════════════════════════════════════════════════════════════════
-- LokaSync Notification + Invitation Realtime Enable (019)
-- ═══════════════════════════════════════════════════════════════════════════════

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;

  -- Notifications
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'notifications') THEN
    DO $$BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE notifications; EXCEPTION WHEN duplicate_object THEN NULL; END$$;
  END IF;
  ALTER TABLE notifications REPLICA IDENTITY FULL;

  -- Notification Reads
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'notification_reads') THEN
    DO $$BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE notification_reads; EXCEPTION WHEN duplicate_object THEN NULL; END$$;
  END IF;
  ALTER TABLE notification_reads REPLICA IDENTITY FULL;

  -- Workspace Invitations
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'workspace_invitations') THEN
    DO $$BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE workspace_invitations; EXCEPTION WHEN duplicate_object THEN NULL; END$$;
  END IF;
  ALTER TABLE workspace_invitations REPLICA IDENTITY FULL;
END $$;
