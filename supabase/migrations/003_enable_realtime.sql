-- ═══════════════════════════════════════════════════════════════════════════════
-- LokaSync Realtime Enablement — Migration 003
-- Adds all tenant tables to the supabase_realtime publication and sets
-- replica identity to FULL so every INSERT/UPDATE/DELETE broadcasts the
-- complete row payload (required for Edge-Function broadcast pattern).
-- ═══════════════════════════════════════════════════════════════════════════════

-- NOTE: This migration assumes the `supabase_realtime` publication already
-- exists (created automatically by Supabase). If it does not exist, run:
--   CREATE PUBLICATION supabase_realtime FOR ALL TABLES;
-- or enable Realtime in the Supabase Dashboard (Database → Replication).

-- ── Add tables to Realtime publication ────────────────────────────────────────
DO $$BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE workspaces; EXCEPTION WHEN duplicate_object THEN NULL; END$$;
DO $$BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE workspace_members; EXCEPTION WHEN duplicate_object THEN NULL; END$$;
DO $$BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE projects; EXCEPTION WHEN duplicate_object THEN NULL; END$$;
DO $$BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE tasks; EXCEPTION WHEN duplicate_object THEN NULL; END$$;
DO $$BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE calendar_events; EXCEPTION WHEN duplicate_object THEN NULL; END$$;
DO $$BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE mentions; EXCEPTION WHEN duplicate_object THEN NULL; END$$;
DO $$BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE team_activity; EXCEPTION WHEN duplicate_object THEN NULL; END$$;
DO $$BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE file_folders; EXCEPTION WHEN duplicate_object THEN NULL; END$$;
DO $$BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE files; EXCEPTION WHEN duplicate_object THEN NULL; END$$;

-- ── Replica Identity FULL ─────────────────────────────────────────────────────
-- Without FULL, Postgres only sends the primary key on UPDATE/DELETE.
-- We need the entire old + new row so the Edge Function can broadcast
-- meaningful payloads (title, assignee, status, etc.) to subscribers.
ALTER TABLE workspaces REPLICA IDENTITY FULL;
ALTER TABLE workspace_members REPLICA IDENTITY FULL;
ALTER TABLE projects REPLICA IDENTITY FULL;
ALTER TABLE tasks REPLICA IDENTITY FULL;
ALTER TABLE calendar_events REPLICA IDENTITY FULL;
ALTER TABLE mentions REPLICA IDENTITY FULL;
ALTER TABLE team_activity REPLICA IDENTITY FULL;
ALTER TABLE file_folders REPLICA IDENTITY FULL;
ALTER TABLE files REPLICA IDENTITY FULL;
