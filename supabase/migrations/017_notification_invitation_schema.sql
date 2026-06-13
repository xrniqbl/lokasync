-- ═══════════════════════════════════════════════════════════════════════════════
-- LokaSync Notification + Invitation Schema (017)
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── Notifications ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'info',
  audience TEXT NOT NULL DEFAULT 'all' CHECK (audience IN ('all', 'free', 'pro', 'business')),
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_audience ON notifications(audience);
CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications(created_at);

CREATE TABLE IF NOT EXISTS notification_reads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id UUID NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  read_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(notification_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_notification_reads_user ON notification_reads(user_id);
CREATE INDEX IF NOT EXISTS idx_notification_reads_notification ON notification_reads(notification_id);

-- ── Workspace Invitations ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS workspace_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'revoked', 'expired')),
  expires_at TIMESTAMPTZ NOT NULL,
  invited_by UUID NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_invitations_workspace ON workspace_invitations(workspace_id);
CREATE INDEX IF NOT EXISTS idx_invitations_token ON workspace_invitations(token);
CREATE INDEX IF NOT EXISTS idx_invitations_status ON workspace_invitations(status);
CREATE INDEX IF NOT EXISTS idx_invitations_email ON workspace_invitations(email);

-- ── Auto-update triggers ──────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'tr_notifications_updated') THEN
    CREATE TRIGGER tr_notifications_updated BEFORE UPDATE ON notifications
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'tr_invitations_updated') THEN
    CREATE TRIGGER tr_invitations_updated BEFORE UPDATE ON workspace_invitations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
  END IF;
END $$;
