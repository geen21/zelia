-- Independent editorial catalogue. Never update or delete historical job ads.
BEGIN;

CREATE SCHEMA IF NOT EXISTS seo;
REVOKE ALL ON SCHEMA seo FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA seo TO service_role;

CREATE TABLE IF NOT EXISTS seo.metier_source_titles (
  id text PRIMARY KEY,
  intitule text NOT NULL,
  romecode text NOT NULL,
  source_count bigint NOT NULL CHECK (source_count > 0)
);

CREATE TABLE IF NOT EXISTS seo.metier_pages (
  id text PRIMARY KEY CHECK (id ~ '^[a-f0-9]{64}$'),
  normalized_title text NOT NULL UNIQUE,
  title text NOT NULL,
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  aliases text[] NOT NULL,
  rome_codes text[] NOT NULL,
  source_count bigint NOT NULL CHECK (source_count > 0),
  review_reason text,
  reviewed_at timestamptz,
  content jsonb,
  content_updated_at timestamptz,
  model text,
  prompt_version text,
  last_error text,
  CHECK ((content IS NULL) = (content_updated_at IS NULL)),
  CHECK (content IS NULL OR (
    content ?& ARRAY['verdict', 'summary', 'explanation', 'missions', 'skills', 'access'] AND
    content->>'verdict' IN ('OUI', 'NON') AND
    jsonb_typeof(content->'summary') = 'string' AND
    jsonb_typeof(content->'explanation') = 'string' AND
    jsonb_typeof(content->'missions') = 'array' AND
    jsonb_typeof(content->'skills') = 'array' AND
    jsonb_typeof(content->'access') = 'array'
  ))
);

CREATE TABLE IF NOT EXISTS seo.metier_generation_budget (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  limit_usd numeric NOT NULL DEFAULT 2 CHECK (limit_usd > 0 AND limit_usd <= 2),
  sample_approved_at timestamptz
);
INSERT INTO seo.metier_generation_budget (id) VALUES (true) ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS seo.metier_generation_requests (
  id uuid PRIMARY KEY,
  mode text NOT NULL CHECK (mode IN ('standard', 'batch')),
  state text NOT NULL DEFAULT 'reserved' CHECK (state IN ('reserved', 'submitted', 'uncertain', 'settled')),
  reserved_usd numeric NOT NULL CHECK (reserved_usd >= 0),
  actual_usd numeric CHECK (actual_usd >= 0),
  items jsonb NOT NULL CHECK (jsonb_typeof(items) = 'array' AND jsonb_array_length(items) > 0),
  results jsonb,
  job_name text,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((state = 'settled') = (actual_usd IS NOT NULL))
);

ALTER TABLE seo.metier_source_titles ENABLE ROW LEVEL SECURITY;
ALTER TABLE seo.metier_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE seo.metier_generation_budget ENABLE ROW LEVEL SECURITY;
ALTER TABLE seo.metier_generation_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON seo.metier_source_titles, seo.metier_pages,
  seo.metier_generation_budget, seo.metier_generation_requests FROM PUBLIC, anon, authenticated;
GRANT ALL ON seo.metier_source_titles, seo.metier_pages,
  seo.metier_generation_budget, seo.metier_generation_requests TO service_role;

CREATE OR REPLACE FUNCTION seo.refresh_metier_inventory()
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE invalid_count bigint;
BEGIN
  PERFORM pg_advisory_xact_lock(79416321);
  INSERT INTO seo.metier_source_titles (id, intitule, romecode, source_count)
  SELECT md5(intitule || chr(31) || COALESCE(romecode, '')),
    intitule, COALESCE(romecode, ''), count(*)
  FROM public.metiers_france WHERE NULLIF(btrim(intitule), '') IS NOT NULL
  GROUP BY intitule, COALESCE(romecode, '')
  ON CONFLICT (id) DO UPDATE SET source_count = EXCLUDED.source_count;
  SELECT count(*) INTO invalid_count FROM public.metiers_france WHERE NULLIF(btrim(intitule), '') IS NULL;
  RETURN jsonb_build_object('invalid_titles', invalid_count,
    'distinct_sources', (SELECT count(*) FROM seo.metier_source_titles));
END $$;

CREATE OR REPLACE FUNCTION seo.reserve_metier_generation(
  p_id uuid, p_mode text, p_reserved_usd numeric, p_items jsonb
) RETURNS numeric LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE cap numeric; used numeric;
BEGIN
  SELECT limit_usd INTO cap FROM seo.metier_generation_budget WHERE id FOR UPDATE;
  IF p_mode = 'batch' AND NOT EXISTS (
    SELECT 1 FROM seo.metier_generation_budget WHERE id AND sample_approved_at IS NOT NULL
  ) THEN RAISE EXCEPTION 'Validate the sample before batch generation'; END IF;
  IF p_mode = 'standard' AND (
    SELECT count(DISTINCT item->>'id') FROM (
      SELECT jsonb_array_elements(items) item FROM seo.metier_generation_requests WHERE mode = 'standard'
      UNION ALL SELECT jsonb_array_elements(p_items)
    ) sample
  ) > 10 THEN RAISE EXCEPTION 'The standard sample is limited to ten metiers'; END IF;
  SELECT COALESCE(sum(COALESCE(actual_usd, reserved_usd)), 0) INTO used
    FROM seo.metier_generation_requests;
  IF p_reserved_usd < 0 OR used + p_reserved_usd > cap THEN
    RAISE EXCEPTION 'Metier generation budget exceeded (limit: % USD)', cap;
  END IF;
  IF EXISTS (
    SELECT 1 FROM seo.metier_generation_requests r,
      jsonb_array_elements(r.items) old_item, jsonb_array_elements(p_items) new_item
    WHERE r.state <> 'settled' AND old_item->>'id' = new_item->>'id'
  ) THEN RAISE EXCEPTION 'A generation request already owns one of these metiers'; END IF;
  INSERT INTO seo.metier_generation_requests(id, mode, reserved_usd, items)
    VALUES (p_id, p_mode, p_reserved_usd, p_items);
  RETURN cap - used - p_reserved_usd;
END $$;

REVOKE ALL ON FUNCTION seo.refresh_metier_inventory() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION seo.reserve_metier_generation(uuid, text, numeric, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION seo.refresh_metier_inventory() TO service_role;
GRANT EXECUTE ON FUNCTION seo.reserve_metier_generation(uuid, text, numeric, jsonb) TO service_role;

COMMIT;
