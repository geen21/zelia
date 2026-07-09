-- Migration: Espace Écoles v2 (fix lead matching + team/status/stats/custom formations)
-- Run this after migration_school_portal.sql. Must be run MANUALLY in the Supabase SQL
-- editor — never executed automatically by the app.

-- ---------------------------------------------------------------------------
-- BUG FIX: rpc_school_leads used to require p.contact_preference IS TRUE even
-- when the student only ticked "Demande plus d'infos" on a formation without
-- accepting to be recontacted at registration (that checkbox is optional and
-- defaults to false). This silently hid otherwise-valid leads. Fixed by OR-ing
-- the two consent signals. Also adds `lead_key`/`source` output columns so the
-- backend can merge this with `formation_info_requests` leads uniformly.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_school_leads(
  p_school_name text,
  p_limit int DEFAULT 100,
  p_offset int DEFAULT 0
)
RETURNS TABLE (
  user_id uuid,
  lead_key text,
  source text,
  prenom text,
  nom text,
  email text,
  genre text,
  age int,
  departement text,
  classe_actuelle text,
  niveau_vise text,
  moyenne text,
  budget text,
  preference_geo text,
  matieres_fortes text,
  accepte_etre_recontacte boolean,
  metiers_proposes_par_zelia text,
  formations_proposees_par_zelia text,
  nb_formations_choisies_ecole int,
  formations_choisies_ecole text,
  formations_choisies_ecole_liens text,
  nb_demandes_infos_ecole int,
  inscrit_le timestamptz,
  total_count bigint
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, auth, pg_temp
AS $$
  WITH normalized_target AS (
    SELECT lower(unaccent(trim(coalesce(p_school_name, '')))) AS target
  ),
  ic AS (
    SELECT
      user_id,
      MAX(answer_text) FILTER (WHERE question_id = 'orientation_school_level')     AS classe_actuelle,
      MAX(answer_text) FILTER (WHERE question_id = 'orientation_target_level')     AS niveau_vise,
      MAX(answer_text) FILTER (WHERE question_id = 'orientation_budget')           AS budget,
      MAX(answer_text) FILTER (WHERE question_id = 'orientation_grade_confidence') AS moyenne,
      MAX(answer_text) FILTER (WHERE question_id = 'orientation_study_location')   AS preference_geo_brute,
      MAX(answer_text) FILTER (WHERE question_id = 'orientation_department')       AS departement_code,
      MAX(answer_text) FILTER (WHERE question_id = 'orientation_department_name')  AS departement_nom,
      MAX(answer_text) FILTER (WHERE question_id = 'orientation_strong_subjects')  AS matieres_fortes_json,
      MAX(answer_text) FILTER (WHERE question_id = 'orientation_final_selection')  AS final_selection
    FROM public.informations_complementaires
    WHERE question_id IN (
      'orientation_school_level','orientation_target_level','orientation_budget',
      'orientation_grade_confidence','orientation_study_location','orientation_department',
      'orientation_department_name','orientation_strong_subjects','orientation_final_selection'
    )
    GROUP BY user_id
  ),
  sel_items AS (
    SELECT
      ic.user_id,
      f,
      COALESCE(
        NULLIF(ff.etab_url, ''),
        NULLIF(ff.fiche, ''),
        NULLIF(f->'detail'->>'link', ''),
        NULLIF(f->>'link', ''),
        NULLIF(f->'raw'->>'etab_url', ''),
        NULLIF(f->'raw'->>'fiche', '')
      ) AS site_web,
      lower(unaccent(COALESCE(
        NULLIF(f->'raw'->>'etab_nom', ''),
        NULLIF(f->'raw'->>'school_name', ''),
        NULLIF(ff.etab_nom, ''),
        NULLIF(split_part(f->>'subtitle', ' - ', 1), '')
      ))) AS school_name_normalized
    FROM ic
    CROSS JOIN LATERAL jsonb_array_elements(NULLIF(ic.final_selection, '')::jsonb) AS f
    CROSS JOIN LATERAL (
      SELECT CASE
        WHEN COALESCE(NULLIF(f->>'rawId', ''), split_part(f->>'id', ':', 2)) ~ '^[0-9]+$'
        THEN COALESCE(NULLIF(f->>'rawId', ''), split_part(f->>'id', ':', 2))::bigint
        ELSE NULL
      END AS formation_id
    ) AS fid
    LEFT JOIN public.formation_france ff
      ON f->>'sourceTable' = 'formation_france'
     AND ff.id = fid.formation_id
  ),
  matched_items AS (
    SELECT si.*
    FROM sel_items si, normalized_target nt
    WHERE nt.target <> ''
      AND si.school_name_normalized IS NOT NULL
      AND si.school_name_normalized <> ''
      AND si.school_name_normalized LIKE '%' || nt.target || '%'
  ),
  selection AS (
    SELECT
      user_id,
      COUNT(*) FILTER (WHERE f->>'type' = 'formation')                        AS nb_formations_choisies,
      COUNT(*) FILTER (WHERE (f->>'requestMoreInformation')::boolean IS TRUE) AS nb_demandes_infos,
      string_agg(f->>'title', '  •  ') FILTER (WHERE f->>'type' = 'formation') AS formations_choisies,
      string_agg(
        f->>'title' || COALESCE(' [' || site_web || ']', ''),
        '  •  '
      ) FILTER (WHERE f->>'type' = 'formation')                               AS formations_choisies_avec_liens
    FROM matched_items
    GROUP BY user_id
  )
  SELECT
    au.id AS user_id,
    'user:' || au.id::text AS lead_key,
    'questionnaire'::text AS source,
    COALESCE(NULLIF(p.first_name, ''), au.raw_user_meta_data->>'first_name') AS prenom,
    COALESCE(NULLIF(p.last_name, ''),  au.raw_user_meta_data->>'last_name')  AS nom,
    au.email::text AS email,
    COALESCE(NULLIF(p.gender, ''), au.raw_user_meta_data->>'gender')         AS genre,
    p.age,
    COALESCE(ic.departement_nom, NULLIF(p.department, ''))                  AS departement,
    ic.classe_actuelle,
    ic.niveau_vise,
    ic.moyenne,
    ic.budget,
    CASE ic.preference_geo_brute
      WHEN 'near_home' THEN 'Proche de chez moi'
      WHEN 'both'      THEN 'Peu importe'
      WHEN 'away'      THEN 'Loin de chez moi'
      ELSE ic.preference_geo_brute
    END AS preference_geo,
    array_to_string(
      ARRAY(SELECT jsonb_array_elements_text(NULLIF(ic.matieres_fortes_json, '')::jsonb)),
      ', '
    ) AS matieres_fortes,
    p.contact_preference AS accepte_etre_recontacte,
    (SELECT string_agg(j->>'title', '  •  ') FROM jsonb_array_elements(ur.job_recommendations::jsonb) j) AS metiers_proposes_par_zelia,
    (SELECT string_agg(st->>'degree', '  •  ') FROM jsonb_array_elements(ur.study_recommendations::jsonb) st) AS formations_proposees_par_zelia,
    COALESCE(s.nb_formations_choisies, 0)::int AS nb_formations_choisies_ecole,
    s.formations_choisies AS formations_choisies_ecole,
    s.formations_choisies_avec_liens AS formations_choisies_ecole_liens,
    COALESCE(s.nb_demandes_infos, 0)::int AS nb_demandes_infos_ecole,
    p.created_at AS inscrit_le,
    COUNT(*) OVER()::bigint AS total_count
  FROM auth.users au
  JOIN public.profiles p ON p.id = au.id
  JOIN selection s ON s.user_id = p.id
  LEFT JOIN ic ON ic.user_id = p.id
  LEFT JOIN public.user_results ur ON ur.user_id = p.id AND ur.questionnaire_type = 'inscription'
  -- FIX: was "WHERE p.contact_preference IS TRUE" (hard AND) which hid any lead
  -- that only requested info on a formation without also opting into recontact.
  WHERE (p.contact_preference IS TRUE OR COALESCE(s.nb_demandes_infos, 0) > 0)
  ORDER BY p.created_at DESC
  LIMIT greatest(coalesce(p_limit, 100), 1)
  OFFSET greatest(coalesce(p_offset, 0), 0);
$$;

REVOKE ALL ON FUNCTION public.rpc_school_leads(text, int, int) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_school_leads(text, int, int) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_school_leads(text, int, int) TO service_role;

-- ---------------------------------------------------------------------------
-- school_lead_status: per-company CRM status + note on a lead (identified by
-- the same lead_key convention as school_lead_reveals: 'user:<uuid>' for
-- questionnaire leads, 'request:<id>' for direct formation_info_requests
-- leads). notified_at is used to dedupe "new lead" email notifications.
-- RLS enabled with NO policies: only the service role (server) can read/write it.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.school_lead_status (
  id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  company_id BIGINT REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL,
  lead_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'nouveau'
    CHECK (status IN ('nouveau', 'a_contacter', 'contacte', 'converti', 'archive')),
  note TEXT,
  notified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (company_id, lead_key)
);
ALTER TABLE public.school_lead_status ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- school_portal_members: additional (non-owner) user accounts granted access
-- to a school's portal (leads/stats/formations), separate from the unrelated
-- pre-existing `profiles.company_id` concept (that one is for student
-- profiles tied to a corporate license, a different product entirely).
-- RLS enabled with NO policies: only the service role (server) can read/write it.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.school_portal_members (
  id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  company_id BIGINT REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('member')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (company_id, user_id)
);
ALTER TABLE public.school_portal_members ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- custom_school_formations: formation listings a school manages themselves
-- from within their portal (distinct from the legacy, unused
-- `public.custom_formations` table from the old licensing product).
-- RLS enabled with NO policies: only the service role (server) can read/write it.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.custom_school_formations (
  id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  company_id BIGINT REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  diploma_level TEXT,
  city TEXT,
  domain TEXT,
  image_url TEXT,
  link TEXT,
  contact_email TEXT,
  is_published BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.custom_school_formations ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_custom_school_formations_company_id
  ON public.custom_school_formations (company_id);
