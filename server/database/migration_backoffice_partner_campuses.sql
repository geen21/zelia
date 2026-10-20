BEGIN;

CREATE OR REPLACE FUNCTION public.backoffice_create_partner_campuses(
  p_actor uuid, p_patch jsonb, p_cities text[], p_reason text DEFAULT ''
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  school text;
  formation text;
  cities text[] := '{}';
  city text;
  item jsonb;
  items jsonb := '[]'::jsonb;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = p_actor AND lower(email) IN
    ('joris.geerdes@21datas.ch', 'nicolas.wiegele@zelia.io')) THEN
    RAISE EXCEPTION 'ADMIN_ACCESS_DENIED' USING ERRCODE = '42501';
  END IF;
  IF jsonb_typeof(p_patch) IS DISTINCT FROM 'object' OR p_patch ? 'city' THEN
    RAISE EXCEPTION 'INVALID_PATCH' USING ERRCODE = '22023';
  END IF;
  school := btrim(p_patch->>'school_name');
  formation := btrim(p_patch->>'formation_name');
  IF coalesce(school,'') = '' OR coalesce(formation,'') = ''
    OR length(school) > 500 OR length(formation) > 500 THEN
    RAISE EXCEPTION 'INVALID_PATCH' USING ERRCODE = '22023';
  END IF;
  IF coalesce(array_ndims(p_cities),0) <> 1 OR cardinality(p_cities) NOT BETWEEN 1 AND 20 THEN
    RAISE EXCEPTION 'INVALID_CAMPUSES' USING ERRCODE = '22023';
  END IF;
  FOREACH city IN ARRAY p_cities LOOP
    city := regexp_replace(btrim(city), '\s+', ' ', 'g');
    IF coalesce(city,'') = '' OR length(city) > 500 THEN
      RAISE EXCEPTION 'INVALID_CAMPUSES' USING ERRCODE = '22023';
    END IF;
    IF lower(city) = ANY(SELECT lower(value) FROM unnest(cities) AS value) THEN
      RAISE EXCEPTION 'DUPLICATE_CAMPUS' USING ERRCODE = '22023';
    END IF;
    cities := array_append(cities,city);
  END LOOP;

  -- Serialize batches for the same formation before checking for existing campuses.
  PERFORM pg_advisory_xact_lock(hashtextextended(lower(school) || E'\n' || lower(formation),0));
  IF EXISTS (
    SELECT 1 FROM public.ecoles_partenaires partner
    WHERE lower(btrim(partner.school_name)) = lower(school)
      AND lower(btrim(partner.formation_name)) = lower(formation)
      AND lower(regexp_replace(btrim(partner.city), '\s+', ' ', 'g')) = ANY(SELECT lower(value) FROM unnest(cities) AS value)
  ) THEN
    RAISE EXCEPTION 'PARTNER_CAMPUS_EXISTS' USING ERRCODE = '23505';
  END IF;

  FOREACH city IN ARRAY cities LOOP
    item := public.backoffice_change(p_actor,'partner',NULL,
      p_patch || jsonb_build_object('school_name',school,'formation_name',formation,'city',city),p_reason);
    items := items || jsonb_build_array(item);
  END LOOP;
  RETURN jsonb_build_object('items',items,'total',cardinality(cities));
END;
$$;

REVOKE ALL ON FUNCTION public.backoffice_create_partner_campuses(uuid,jsonb,text[],text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.backoffice_create_partner_campuses(uuid,jsonb,text[],text) TO service_role;
NOTIFY pgrst, 'reload schema';
COMMIT;
