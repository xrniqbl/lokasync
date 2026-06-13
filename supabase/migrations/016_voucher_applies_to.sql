-- ═══════════════════════════════════════════════════════════════════════════════
-- ALTER TABLE: Add applies_to JSONB column to vouchers
-- Needed because checkout validates voucher against plan IDs.
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER TABLE vouchers ADD COLUMN IF NOT EXISTS applies_to JSONB DEFAULT NULL;
