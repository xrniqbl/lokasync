-- ─────────────────────────────────────────────────────────────────────────────
-- LokaSync PM — add team column to invitations
--
-- Stores the team/division the invitee should be added to upon acceptance.
-- NULL means "no team assigned" (backwards-compatible with existing invites).
-- The accept-invite endpoint reads this column and auto-adds the new member
-- to the corresponding workspace_team, creating it on the fly if needed.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.invitations
  add column if not exists team text;
