-- Freeze public formation URLs independently of mutable editorial/source titles.
-- Backfill existing rows from the pre-enrichment backup with the server CLI.
-- Do not deploy consumers of canonical_slug before this migration and backfill.
BEGIN;

ALTER TABLE public.formation_france ADD COLUMN IF NOT EXISTS canonical_slug text;
CREATE UNIQUE INDEX IF NOT EXISTS formation_france_canonical_slug_unique
ON public.formation_france(canonical_slug) WHERE canonical_slug IS NOT NULL;

CREATE OR REPLACE FUNCTION public.formation_initial_canonical_slug(
  p_id bigint, p_nm text[], p_fl text[], p_nmc text, p_school text, p_city text
)
RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path = '' AS $$
DECLARE title text; base text;
BEGIN
  IF p_id IS NULL THEN RAISE EXCEPTION 'FORMATION_ID_REQUIRED'; END IF;
  title := coalesce(
    (SELECT v FROM unnest(p_nm) v WHERE v IS NOT NULL AND v <> '' LIMIT 1),
    (SELECT v FROM unnest(p_fl) v WHERE v IS NOT NULL AND v <> '' LIMIT 1),
    nullif(trim(replace(p_nmc, '-', ' ')), ''), 'Formation'
  );
  base := translate(lower(concat_ws(' ', title, nullif(p_school, ''), nullif(p_city, ''))),
    'àáâãäåçèéêëìíîïñòóôõöùúûüýÿ', 'aaaaaaceeeeiiiinooooouuuuyy');
  base := trim(both '-' FROM regexp_replace(base, '[^a-z0-9]+', '-', 'g'));
  base := rtrim(left(base, 80), '-');
  RETURN coalesce(nullif(base, ''), 'formation') || '-' || p_id::text;
END;
$$;

CREATE OR REPLACE FUNCTION public.formation_guard_canonical_slug()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.canonical_slug IS NOT NULL
     AND NEW.canonical_slug IS DISTINCT FROM OLD.canonical_slug THEN
    RAISE EXCEPTION 'FORMATION_CANONICAL_IS_IMMUTABLE' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'INSERT' AND NEW.canonical_slug IS NULL THEN
    NEW.canonical_slug := public.formation_initial_canonical_slug(
      NEW.id, NEW.nm, NEW.fl, NEW.nmc, NEW.etab_nom, NEW.commune);
  END IF;
  IF NEW.canonical_slug IS NOT NULL AND (
    length(NEW.canonical_slug) > 200
    OR NEW.canonical_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$'
    OR right(NEW.canonical_slug, length(NEW.id::text) + 1) <> '-' || NEW.id::text
  ) THEN
    RAISE EXCEPTION 'INVALID_FORMATION_CANONICAL' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS formation_canonical_slug_guard ON public.formation_france;
CREATE TRIGGER formation_canonical_slug_guard
BEFORE INSERT OR UPDATE ON public.formation_france
FOR EACH ROW EXECUTE FUNCTION public.formation_guard_canonical_slug();

CREATE OR REPLACE FUNCTION public.pin_formation_canonical_urls(p_rows jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE expected int; matched int; updated int;
BEGIN
  IF p_rows IS NULL OR jsonb_typeof(p_rows) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'INVALID_CANONICAL_BATCH' USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(p_rows) NOT BETWEEN 1 AND 1000 THEN
    RAISE EXCEPTION 'INVALID_CANONICAL_BATCH' USING ERRCODE = '22023';
  END IF;
  expected := jsonb_array_length(p_rows);
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_rows) r
    WHERE coalesce(r->>'id', '') !~ '^[0-9]+$'
      OR coalesce(r->>'slug', '') !~ '^[a-z0-9]+(-[a-z0-9]+)*$'
      OR right(r->>'slug', length(r->>'id') + 1) <> '-' || (r->>'id')
      OR length(r->>'slug') > 200
  ) OR (SELECT count(DISTINCT r->>'id') FROM jsonb_array_elements(p_rows) r) <> expected THEN
    RAISE EXCEPTION 'INVALID_CANONICAL_ROWS' USING ERRCODE = '22023';
  END IF;

  PERFORM f.id FROM public.formation_france f
  JOIN jsonb_to_recordset(p_rows) r(id bigint) ON r.id = f.id
  ORDER BY f.id FOR UPDATE OF f;

  SELECT count(*) INTO matched FROM public.formation_france f
  JOIN jsonb_to_recordset(p_rows) r(id bigint, annee text, gta text, etab_uai text) ON r.id = f.id
  WHERE f.annee IS NOT DISTINCT FROM r.annee
    AND f.gta IS NOT DISTINCT FROM r.gta AND f.etab_uai IS NOT DISTINCT FROM r.etab_uai;
  IF matched <> expected THEN
    RAISE EXCEPTION 'FORMATION_IDENTITY_CHANGED' USING ERRCODE = '40001';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.formation_france f
    JOIN jsonb_to_recordset(p_rows) r(id bigint, slug text) ON r.id = f.id
    WHERE f.canonical_slug IS NOT NULL AND f.canonical_slug <> r.slug
  ) THEN
    RAISE EXCEPTION 'FORMATION_CANONICAL_ALREADY_PINNED' USING ERRCODE = '40001';
  END IF;

  UPDATE public.formation_france f SET canonical_slug = r.slug
  FROM jsonb_to_recordset(p_rows) r(id bigint, slug text)
  WHERE f.id = r.id AND f.canonical_slug IS NULL;
  GET DIAGNOSTICS updated = ROW_COUNT;
  RETURN jsonb_build_object('updated', updated, 'already', expected - updated);
END;
$$;
REVOKE ALL ON FUNCTION public.pin_formation_canonical_urls(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pin_formation_canonical_urls(jsonb) TO service_role;
NOTIFY pgrst, 'reload schema';
COMMIT;
