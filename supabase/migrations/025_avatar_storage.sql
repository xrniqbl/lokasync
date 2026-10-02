-- ═══════════════════════════════════════════════════════════════════════════════
-- 025_avatar_storage.sql
-- Creates the `avatars` bucket used by POST /profile/avatar. Avatar files are
-- small (2 MB cap enforced server-side) and served via short-lived signed URLs,
-- so the bucket stays private. The edge function uses the service role (which
-- bypasses RLS/storage policies by design), but browser-direct access is locked
-- down to the file owner via the (user_id/filename) path convention.
-- Safe to run multiple times.
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── Bucket ────────────────────────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', false)
ON CONFLICT (id) DO NOTHING;

-- ── Storage policies (defense in depth; edge function uses service role) ─────
DROP POLICY IF EXISTS avatars_owner_read ON storage.objects;
CREATE POLICY avatars_owner_read ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS avatars_owner_write ON storage.objects;
CREATE POLICY avatars_owner_write ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS avatars_owner_update ON storage.objects;
CREATE POLICY avatars_owner_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS avatars_owner_delete ON storage.objects;
CREATE POLICY avatars_owner_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);
