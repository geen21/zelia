BEGIN;

CREATE OR REPLACE FUNCTION public.is_valid_partner_department(value text)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT coalesce(value = ANY(ARRAY[
    '01','02','03','04','05','06','07','08','09','10','11','12','13','14','15','16','17','18','19',
    '2A','2B','21','22','23','24','25','26','27','28','29','30','31','32','33','34','35','36','37','38','39',
    '40','41','42','43','44','45','46','47','48','49','50','51','52','53','54','55','56','57','58','59',
    '60','61','62','63','64','65','66','67','68','69','70','71','72','73','74','75','76','77','78','79',
    '80','81','82','83','84','85','86','87','88','89','90','91','92','93','94','95','971','972','973','974','976'
  ]), false)
$$;

ALTER TABLE public.ecoles_partenaires
  ADD COLUMN IF NOT EXISTS department text
    CHECK (department IS NULL OR public.is_valid_partner_department(department));

-- Known communes only; never infer a department by substring or postal prefix.
-- Reference: https://geo.api.gouv.fr/communes (codeDepartement).
WITH locations(city, department) AS (VALUES
  ('amiens','80'),('angers','49'),('annecy','74'),('bordeaux','33'),('caen','14'),
  ('grenoble','38'),('lens','62'),('lille','59'),('lyon','69'),('marseille','13'),
  ('melun','77'),('montpellier','34'),('muret','31'),('nancy','54'),('nantes','44'),
  ('narbonne','11'),('nice','06'),('paris','75'),('rennes','35'),('strasbourg','67'),
  ('toulouse','31'),('vannes','56'),
  ('st-quentin-en-yvelines','78'),('saint-quentin-en-yvelines','78')
)
UPDATE public.ecoles_partenaires partner SET department = locations.department
FROM locations
WHERE partner.department IS NULL AND lower(btrim(partner.city)) = locations.city;

-- Flers has homonyms in 61, 62 and 80: only this identified school is backfilled.
-- https://guehenno-flers.lycee.ac-normandie.fr/
UPDATE public.ecoles_partenaires SET department = '61'
WHERE department IS NULL AND lower(btrim(city)) = 'flers'
  AND school_name = 'Lycée Jean Guéhenno';

CREATE INDEX IF NOT EXISTS ecoles_partenaires_results_department_idx
  ON public.ecoles_partenaires(department) WHERE is_active AND show_in_results;

CREATE OR REPLACE FUNCTION public.require_partner_department()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF NEW.department IS NULL AND (TG_OP = 'INSERT' OR OLD.department IS NOT NULL OR NEW.city IS DISTINCT FROM OLD.city) THEN
    RAISE EXCEPTION 'PARTNER_DEPARTMENT_REQUIRED' USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS require_partner_department ON public.ecoles_partenaires;
CREATE TRIGGER require_partner_department BEFORE INSERT OR UPDATE OF city,department
  ON public.ecoles_partenaires FOR EACH ROW EXECUTE FUNCTION public.require_partner_department();

DO $$
DECLARE definition text; original text; revised text; start_pos int; end_pos int;
BEGIN
  definition := pg_get_functiondef('public.backoffice_change(uuid,text,text,jsonb,text)'::regprocedure);
  IF strpos(definition, 'PARTNER_DEPARTMENT_REQUIRED') = 0 THEN
    start_pos := strpos(definition, $part$ELSIF p_kind = 'partner' THEN$part$);
    end_pos := strpos(definition, $part$ELSIF p_kind = 'partner_group' THEN$part$);
    IF start_pos = 0 OR end_pos <= start_pos OR strpos(definition, 'show_in_results') = 0 THEN
      RAISE EXCEPTION 'BACKOFFICE_FUNCTION_VERSION_MISMATCH';
    END IF;
    original := substring(definition FROM start_pos FOR end_pos - start_pos);
    revised := replace(original, $old$'formation_name','city','domain'$old$, $new$'formation_name','city','department','domain'$new$);
    revised := replace(revised, 'school_name,formation_name,city,domain', 'school_name,formation_name,city,department,domain');
    revised := replace(revised, $old$p_patch->>'formation_name',p_patch->>'city',p_patch->>'domain'$old$,
      $new$p_patch->>'formation_name',p_patch->>'city',p_patch->>'department',p_patch->>'domain'$new$);
    revised := replace(revised, $old$city = CASE WHEN p_patch ? 'city' THEN p_patch->>'city' ELSE city END,$old$,
      $new$city = CASE WHEN p_patch ? 'city' THEN p_patch->>'city' ELSE city END,
        department = CASE WHEN p_patch ? 'department' THEN p_patch->>'department' ELSE department END,$new$);
    revised := replace(revised, $old$ELSIF p_kind = 'partner' THEN$old$, $new$ELSIF p_kind = 'partner' THEN
    IF (p_id IS NULL OR p_patch ? 'city' OR p_patch ? 'department')
      AND NOT public.is_valid_partner_department(p_patch->>'department') THEN
      RAISE EXCEPTION 'PARTNER_DEPARTMENT_REQUIRED' USING ERRCODE = '22023';
    END IF;$new$);
    IF strpos(revised, $check$'city','department','domain'$check$) = 0
      OR strpos(revised, 'city,department,domain') = 0
      OR strpos(revised, $check$p_patch->>'city',p_patch->>'department',p_patch->>'domain'$check$) = 0
      OR strpos(revised, 'department = CASE') = 0 THEN
      RAISE EXCEPTION 'BACKOFFICE_FUNCTION_VERSION_MISMATCH';
    END IF;
    definition := replace(definition, original, revised);
    revised := replace(definition, $old$AND city = p_patch->>'city';$old$,
      $new$AND city = p_patch->>'city'
      AND (NOT p_patch ? 'department' OR department = p_patch->>'department');$new$);
    IF revised = definition THEN RAISE EXCEPTION 'BACKOFFICE_FUNCTION_VERSION_MISMATCH'; END IF;
    EXECUTE revised;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.backoffice_create_partner_campuses_with_departments(
  p_actor uuid, p_patch jsonb, p_campuses jsonb, p_reason text DEFAULT ''
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  school text; formation text; campus jsonb; city text; department text;
  campuses jsonb := '[]'::jsonb; items jsonb := '[]'::jsonb; item jsonb;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = p_actor AND lower(email) IN
    ('joris.geerdes@21datas.ch', 'nicolas.wiegele@zelia.io')) THEN
    RAISE EXCEPTION 'ADMIN_ACCESS_DENIED' USING ERRCODE = '42501';
  END IF;
  IF jsonb_typeof(p_patch) IS DISTINCT FROM 'object' OR p_patch ?| ARRAY['city','department'] THEN
    RAISE EXCEPTION 'INVALID_PATCH' USING ERRCODE = '22023';
  END IF;
  school := btrim(p_patch->>'school_name');
  formation := btrim(p_patch->>'formation_name');
  IF coalesce(school,'') = '' OR coalesce(formation,'') = ''
    OR length(school) > 500 OR length(formation) > 500 THEN
    RAISE EXCEPTION 'INVALID_PATCH' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(p_campuses) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'INVALID_CAMPUSES' USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(p_campuses) NOT BETWEEN 1 AND 20 THEN
    RAISE EXCEPTION 'INVALID_CAMPUSES' USING ERRCODE = '22023';
  END IF;
  FOR campus IN SELECT value FROM jsonb_array_elements(p_campuses) LOOP
    IF jsonb_typeof(campus) IS DISTINCT FROM 'object' THEN
      RAISE EXCEPTION 'INVALID_CAMPUSES' USING ERRCODE = '22023';
    END IF;
    IF EXISTS (SELECT 1 FROM jsonb_object_keys(campus) AS key WHERE key NOT IN ('city','department'))
      OR jsonb_typeof(campus->'city') IS DISTINCT FROM 'string'
      OR jsonb_typeof(campus->'department') IS DISTINCT FROM 'string' THEN
      RAISE EXCEPTION 'INVALID_CAMPUSES' USING ERRCODE = '22023';
    END IF;
    city := regexp_replace(btrim(campus->>'city'), '\s+', ' ', 'g');
    department := campus->>'department';
    IF coalesce(city,'') = '' OR length(city) > 500 OR NOT public.is_valid_partner_department(department) THEN
      RAISE EXCEPTION 'INVALID_CAMPUSES' USING ERRCODE = '22023';
    END IF;
    IF EXISTS (SELECT 1 FROM jsonb_array_elements(campuses) AS entry
      WHERE lower(entry->>'city') = lower(city) AND entry->>'department' = department) THEN
      RAISE EXCEPTION 'DUPLICATE_CAMPUS' USING ERRCODE = '22023';
    END IF;
    campuses := campuses || jsonb_build_array(jsonb_build_object('city',city,'department',department));
  END LOOP;

  PERFORM pg_advisory_xact_lock(hashtextextended(lower(school) || E'\n' || lower(formation),0));
  IF EXISTS (
    SELECT 1 FROM public.ecoles_partenaires partner, jsonb_array_elements(campuses) AS entry
    WHERE lower(btrim(partner.school_name)) = lower(school)
      AND lower(btrim(partner.formation_name)) = lower(formation)
      AND lower(regexp_replace(btrim(partner.city), '\s+', ' ', 'g')) = lower(entry->>'city')
      AND (partner.department IS NULL OR partner.department = entry->>'department')
  ) THEN
    RAISE EXCEPTION 'PARTNER_CAMPUS_EXISTS' USING ERRCODE = '23505';
  END IF;
  FOR campus IN SELECT value FROM jsonb_array_elements(campuses) LOOP
    item := public.backoffice_change(p_actor,'partner',NULL,
      p_patch || campus || jsonb_build_object('school_name',school,'formation_name',formation),p_reason);
    items := items || jsonb_build_array(item);
  END LOOP;
  RETURN jsonb_build_object('items',items,'total',jsonb_array_length(campuses));
END;
$$;
REVOKE ALL ON FUNCTION public.backoffice_create_partner_campuses_with_departments(uuid,jsonb,jsonb,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.backoffice_create_partner_campuses_with_departments(uuid,jsonb,jsonb,text) TO service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;

-- Review any unresolved locations in the back-office before enabling local recommendations.
SELECT id, school_name, city FROM public.ecoles_partenaires WHERE department IS NULL ORDER BY school_name, city;
