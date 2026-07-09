-- Migration: Espace Écoles (portail de leads pour les établissements)
-- Run this after the existing setup.sql / migration_ecoles_partenaires.sql

-- A "school portal" account is a row in public.companies (owner_id = the
-- auth.users id created at registration) plus two extra contact columns.
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS contact_first_name TEXT,
  ADD COLUMN IF NOT EXISTS contact_last_name TEXT;

-- A newly registered school account is pending until an admin approves it
-- (NULL = pending, non-null = approved at that timestamp). Leads/formations
-- endpoints are gated on this in server/routes/schoolPortal.js.
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;

-- Needed for accent/case-insensitive school name matching (e.g. "Ecole" vs "École").
CREATE EXTENSION IF NOT EXISTS unaccent;

-- Speeds up the autocomplete search on formation_france.etab_nom.
CREATE INDEX IF NOT EXISTS idx_formation_france_etab_nom_trgm
  ON public.formation_france USING gin (etab_nom gin_trgm_ops);

-- ---------------------------------------------------------------------------
-- search_partner_schools: autocomplete used on the school registration form.
-- Combines distinct establishment names from formation_france and
-- ecoles_partenaires so a school can find/confirm the exact name to register.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.search_partner_schools(
  p_query text,
  p_limit int DEFAULT 20
)
RETURNS TABLE (school_name text, source text)
LANGUAGE sql STABLE
AS $$
  WITH needle AS (
    SELECT lower(unaccent(trim(coalesce(p_query, '')))) AS value
  ),
  candidates AS (
    SELECT DISTINCT ff.etab_nom AS school_name, 'formation_france' AS source
    FROM public.formation_france ff
    WHERE ff.etab_nom IS NOT NULL AND ff.etab_nom <> ''

    UNION

    SELECT DISTINCT ep.school_name AS school_name, 'ecoles_partenaires' AS source
    FROM public.ecoles_partenaires ep
    WHERE ep.school_name IS NOT NULL AND ep.school_name <> ''
  )
  SELECT c.school_name, c.source
  FROM candidates c, needle n
  WHERE n.value = '' OR lower(unaccent(c.school_name)) LIKE '%' || n.value || '%'
  ORDER BY c.school_name
  LIMIT greatest(coalesce(p_limit, 20), 1);
$$;

-- ---------------------------------------------------------------------------
-- rpc_school_leads: leads matching a given school name, adapted from the
-- reporting query used to export student "final selection" data. Restricted
-- to students who selected this specific school AND who accepted to be
-- recontacted (profiles.contact_preference = true).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_school_leads(
  p_school_name text,
  p_limit int DEFAULT 100,
  p_offset int DEFAULT 0
)
RETURNS TABLE (
  user_id uuid,
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
  WHERE p.contact_preference IS TRUE
  ORDER BY p.created_at DESC
  LIMIT greatest(coalesce(p_limit, 100), 1)
  OFFSET greatest(coalesce(p_offset, 0), 0);
$$;

-- rpc_school_leads is SECURITY DEFINER (needed to read auth.users) and returns
-- other students' PII, so it must NEVER be callable directly by anon/authenticated
-- roles via PostgREST — only the backend (service_role via supabaseAdmin) may call it.
REVOKE ALL ON FUNCTION public.rpc_school_leads(text, int, int) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_school_leads(text, int, int) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_school_leads(text, int, int) TO service_role;

-- ---------------------------------------------------------------------------
-- school_lead_reveals: tracks which specific leads a school has "unmasked"
-- (email/nom are otherwise masked server-side, never sent unmasked to the
-- browser until explicitly revealed). lead_key is 'user:<uuid>' for
-- questionnaire-based leads or 'request:<id>' for direct formation requests.
-- RLS enabled with NO policies: only the service role (server) can read/write it.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.school_lead_reveals (
  id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  company_id BIGINT REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL,
  lead_key TEXT NOT NULL,
  revealed_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (company_id, lead_key)
);
ALTER TABLE public.school_lead_reveals ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- formation_info_requests: "demander plus d'informations" clicked on a public
-- formation page. user_id is NULL for anonymous visitors (email required in
-- that case). Also counted as a lead for the matching school in the portal.
-- RLS enabled with NO policies: only the service role (server) can read/write it.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.formation_info_requests (
  id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  formation_source TEXT NOT NULL,
  formation_ref TEXT NOT NULL,
  school_name TEXT NOT NULL,
  formation_title TEXT,
  email TEXT NOT NULL,
  first_name TEXT,
  last_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (formation_ref, email)
);
ALTER TABLE public.formation_info_requests ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_formation_info_requests_school_name
  ON public.formation_info_requests (school_name);

