-- One editorial page per official ROME fiche. Public job ads stay read-only.
-- The user explicitly approved a total budget of 3 USD, including past calls.
BEGIN;

ALTER TABLE seo.metier_generation_budget
  DROP CONSTRAINT IF EXISTS metier_generation_budget_limit_usd_check;
ALTER TABLE seo.metier_generation_budget
  ADD CONSTRAINT metier_generation_budget_limit_usd_check
  CHECK (limit_usd > 0 AND limit_usd <= 3);
UPDATE seo.metier_generation_budget SET limit_usd = 3 WHERE id;

ALTER TABLE seo.metier_pages
  ADD COLUMN IF NOT EXISTS catalog_kind text NOT NULL DEFAULT 'candidate'
    CHECK (catalog_kind IN ('candidate', 'canonical', 'legacy')),
  ADD COLUMN IF NOT EXISTS rome_code text CHECK (rome_code IS NULL OR rome_code ~ '^[A-Z][0-9]{4}$'),
  ADD COLUMN IF NOT EXISTS reference_version text,
  ADD COLUMN IF NOT EXISTS editorial_context jsonb,
  ADD COLUMN IF NOT EXISTS content_reference_version text;
CREATE UNIQUE INDEX IF NOT EXISTS metier_pages_canonical_rome
  ON seo.metier_pages (rome_code) WHERE catalog_kind = 'canonical';
ALTER TABLE seo.metier_generation_requests
  ADD COLUMN IF NOT EXISTS processed_at timestamptz;

CREATE TABLE IF NOT EXISTS seo.metier_catalog_state (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  reference_version text NOT NULL,
  expected_count integer NOT NULL CHECK (expected_count > 0),
  synced_at timestamptz
);
ALTER TABLE seo.metier_catalog_state ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON seo.metier_catalog_state FROM PUBLIC, anon, authenticated;
GRANT ALL ON seo.metier_catalog_state TO service_role;

CREATE OR REPLACE FUNCTION seo.metier_rome_inventory()
RETURNS TABLE(rome_code text, source_count bigint, aliases text[])
LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  SELECT upper(btrim(t.romecode)),
    sum(t.source_count)::bigint,
    array_agg(DISTINCT t.intitule ORDER BY t.intitule)
  FROM seo.metier_source_titles t
  GROUP BY upper(btrim(t.romecode))
  ORDER BY upper(btrim(t.romecode))
$$;
REVOKE ALL ON FUNCTION seo.metier_rome_inventory() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION seo.metier_rome_inventory() TO service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
