BEGIN;

CREATE TABLE IF NOT EXISTS public.school_catalog_links (
  company_id bigint NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  source text NOT NULL CHECK (source IN ('formation_france','ecoles_partenaires')),
  formation_ref text NOT NULL,
  campus text NOT NULL DEFAULT '',
  validated_by uuid NOT NULL REFERENCES auth.users(id),
  validated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (source,formation_ref),
  UNIQUE (company_id,source,formation_ref)
);
CREATE INDEX IF NOT EXISTS school_catalog_links_company_idx ON public.school_catalog_links(company_id,campus);

CREATE TABLE IF NOT EXISTS public.school_sharing_consents (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  version text NOT NULL CHECK (version = 'orientation-dossier-v1'),
  granted_at timestamptz,
  revoked_at timestamptz,
  CHECK (granted_at IS NOT NULL OR revoked_at IS NOT NULL)
);
CREATE TABLE IF NOT EXISTS public.school_sharing_blocks (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id bigint NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id,company_id)
);
CREATE TABLE IF NOT EXISTS public.school_portal_events (
  event_key text PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  request_id bigint REFERENCES public.formation_info_requests(id) ON DELETE CASCADE,
  source text NOT NULL CHECK (source IN ('formation_france','ecoles_partenaires')),
  formation_ref text NOT NULL,
  channel text NOT NULL CHECK (channel IN ('questionnaire','direct_request','partner_submission','legacy_contact')),
  recipient_company_id bigint REFERENCES public.companies(id) ON DELETE CASCADE,
  sharing_version text CHECK (sharing_version IS NULL OR sharing_version = 'orientation-dossier-v1'),
  sharing_granted_at timestamptz,
  occurred_at timestamptz NOT NULL,
  CHECK (user_id IS NOT NULL OR request_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS school_portal_events_source_idx ON public.school_portal_events(source,formation_ref,occurred_at);
CREATE INDEX IF NOT EXISTS school_portal_events_user_idx ON public.school_portal_events(user_id);
CREATE TABLE IF NOT EXISTS public.school_portal_migration_state(name text PRIMARY KEY);
ALTER TABLE public.school_portal_migration_state ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.school_portal_migration_state FROM PUBLIC,anon,authenticated;
ALTER TABLE public.formation_info_requests ADD COLUMN IF NOT EXISTS sharing_version text;
ALTER TABLE public.contact_submitted ADD COLUMN IF NOT EXISTS sharing_version text;
ALTER TABLE public.school_lead_status ADD COLUMN IF NOT EXISTS notification_error text;
ALTER TABLE public.school_lead_status ADD COLUMN IF NOT EXISTS notification_locked_at timestamptz;
ALTER TABLE public.school_registration_requests ADD COLUMN IF NOT EXISTS company_id bigint REFERENCES public.companies(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.school_portal_invitations (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  company_id bigint NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  email text NOT NULL,
  role text NOT NULL CHECK (role IN ('owner','member')),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','failed','accepted')),
  error text,
  sent_at timestamptz,
  attempted_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id,email)
);
CREATE TABLE IF NOT EXISTS public.school_portal_audit (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_id uuid NOT NULL REFERENCES auth.users(id),
  company_id bigint NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  action text NOT NULL,
  resource text,
  created_at timestamptz NOT NULL DEFAULT now()
);
DO $$
DECLARE tab text;
BEGIN
  FOREACH tab IN ARRAY ARRAY['school_catalog_links','school_sharing_consents','school_sharing_blocks',
    'school_portal_events','school_portal_invitations','school_portal_audit'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',tab);
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated',tab);
    EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON public.%I TO service_role',tab);
  END LOOP;
END $$;
REVOKE UPDATE,DELETE ON public.school_portal_audit FROM service_role;
GRANT USAGE,SELECT ON SEQUENCE public.school_portal_invitations_id_seq,public.school_portal_audit_id_seq TO service_role;
REVOKE ALL ON SEQUENCE public.school_portal_invitations_id_seq,public.school_portal_audit_id_seq FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.school_selection_array(p_text text)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path = '' AS $$
DECLARE value jsonb;
BEGIN
  BEGIN value := p_text::jsonb;
  EXCEPTION WHEN invalid_text_representation THEN RETURN '[]'::jsonb; END;
  IF jsonb_typeof(value) = 'object' THEN value := value->'candidates'; END IF;
  RETURN CASE WHEN jsonb_typeof(value) = 'array' THEN value ELSE '[]'::jsonb END;
END $$;

CREATE OR REPLACE FUNCTION public.school_capture_selection(p_user uuid,p_text text,p_date timestamptz)
RETURNS void LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  DELETE FROM public.school_portal_events e WHERE user_id=p_user AND channel='questionnaire' AND NOT EXISTS(
    SELECT 1 FROM jsonb_array_elements(public.school_selection_array(p_text)) candidate
    WHERE candidate->>'type'='formation' AND candidate->'requestMoreInformation'='true'::jsonb
      AND candidate->>'sourceTable'=e.source
      AND coalesce(nullif(candidate->>'rawId',''),split_part(candidate->>'id',':',2))=e.formation_ref);
  INSERT INTO public.school_portal_events(event_key,user_id,source,formation_ref,channel,sharing_version,sharing_granted_at,recipient_company_id,occurred_at)
  SELECT DISTINCT ON (source,ref) 'selection:'||p_user::text||':'||source||':'||ref,p_user,source,ref,'questionnaire',
    CASE WHEN item->>'sharingVersion'='orientation-dossier-v1' THEN 'orientation-dossier-v1' END,
    CASE WHEN item->>'sharingVersion'='orientation-dossier-v1' THEN p_date END,
    (SELECT company_id FROM public.school_catalog_links l WHERE l.source=candidates.source AND l.formation_ref=candidates.ref),p_date
  FROM (
    SELECT item,item->>'sourceTable' source,
      coalesce(nullif(item->>'rawId',''),split_part(item->>'id',':',2)) ref
    FROM jsonb_array_elements(public.school_selection_array(p_text)) item
    WHERE item->>'type'='formation' AND item->'requestMoreInformation'='true'::jsonb
  ) candidates
  WHERE (source='formation_france' AND EXISTS(SELECT 1 FROM public.formation_france f WHERE f.id::text=ref))
    OR (source='ecoles_partenaires' AND EXISTS(SELECT 1 FROM public.ecoles_partenaires f WHERE f.id::text=ref))
  ORDER BY source,ref
  ON CONFLICT (event_key) DO UPDATE SET sharing_version=excluded.sharing_version,
    sharing_granted_at=CASE WHEN school_portal_events.sharing_version=excluded.sharing_version THEN school_portal_events.sharing_granted_at ELSE excluded.sharing_granted_at END;
END $$;

CREATE OR REPLACE FUNCTION public.school_capture_event()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF TG_TABLE_NAME='informations_complementaires' THEN
    IF NEW.question_id='orientation_final_selection' THEN
      PERFORM public.school_capture_selection(NEW.user_id,NEW.answer_text,NEW.created_at);
    END IF;
  ELSIF TG_TABLE_NAME='formation_info_requests' THEN
    INSERT INTO public.school_portal_events(event_key,user_id,request_id,source,formation_ref,channel,sharing_version,sharing_granted_at,recipient_company_id,occurred_at)
    SELECT 'request:'||NEW.id::text,NEW.user_id,NEW.id,NEW.formation_source,NEW.formation_ref,'direct_request',
      CASE WHEN NEW.sharing_version='orientation-dossier-v1' THEN NEW.sharing_version END,
      CASE WHEN NEW.sharing_version='orientation-dossier-v1' THEN NEW.created_at END,
      (SELECT company_id FROM public.school_catalog_links l WHERE l.source=NEW.formation_source AND l.formation_ref=NEW.formation_ref),NEW.created_at
    WHERE NEW.formation_source='formation_france' AND EXISTS(SELECT 1 FROM public.formation_france f WHERE f.id::text=NEW.formation_ref)
    ON CONFLICT(event_key) DO NOTHING;
  ELSE
    INSERT INTO public.school_portal_events(event_key,user_id,source,formation_ref,channel,sharing_version,sharing_granted_at,recipient_company_id,occurred_at)
    VALUES ('submission:'||NEW.id::text,NEW.user_id,'ecoles_partenaires',NEW.formation_id::text,'partner_submission',
      CASE WHEN NEW.sharing_version='orientation-dossier-v1' THEN NEW.sharing_version END,
      CASE WHEN NEW.sharing_version='orientation-dossier-v1' THEN NEW.submitted_at END,
      (SELECT company_id FROM public.school_catalog_links l WHERE l.source='ecoles_partenaires' AND l.formation_ref=NEW.formation_id::text),NEW.submitted_at)
    ON CONFLICT(event_key) DO NOTHING;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS school_capture_selection ON public.informations_complementaires;
CREATE TRIGGER school_capture_selection AFTER INSERT ON public.informations_complementaires
  FOR EACH ROW EXECUTE FUNCTION public.school_capture_event();
DROP TRIGGER IF EXISTS school_capture_request ON public.formation_info_requests;
CREATE TRIGGER school_capture_request AFTER INSERT ON public.formation_info_requests
  FOR EACH ROW EXECUTE FUNCTION public.school_capture_event();
DROP TRIGGER IF EXISTS school_capture_submission ON public.contact_submitted;
CREATE TRIGGER school_capture_submission AFTER INSERT ON public.contact_submitted
  FOR EACH ROW EXECUTE FUNCTION public.school_capture_event();

-- Historical records do not gain a detailed-sharing agreement.
DO $$
DECLARE row record;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.school_portal_migration_state WHERE name='initial-events-backfill') THEN
  FOR row IN SELECT DISTINCT ON (user_id) user_id,answer_text,created_at
    FROM public.informations_complementaires WHERE question_id='orientation_final_selection'
    ORDER BY user_id,created_at DESC,id DESC LOOP
    PERFORM public.school_capture_selection(row.user_id,row.answer_text,row.created_at);
  END LOOP;
INSERT INTO public.school_portal_events(event_key,user_id,request_id,source,formation_ref,channel,occurred_at)
SELECT 'request:'||r.id::text,r.user_id,r.id,r.formation_source,r.formation_ref,'direct_request',r.created_at
FROM public.formation_info_requests r WHERE r.formation_source='formation_france'
  AND EXISTS(SELECT 1 FROM public.formation_france f WHERE f.id::text=r.formation_ref)
ON CONFLICT DO NOTHING;
INSERT INTO public.school_portal_events(event_key,user_id,source,formation_ref,channel,occurred_at)
SELECT 'submission:'||s.id::text,s.user_id,'ecoles_partenaires',s.formation_id::text,'partner_submission',s.submitted_at
FROM public.contact_submitted s ON CONFLICT DO NOTHING;
  INSERT INTO public.school_portal_migration_state VALUES('initial-events-backfill');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.school_portal_migration_state WHERE name='legacy-revealed-contacts') THEN
    INSERT INTO public.school_portal_events(event_key,user_id,source,formation_ref,channel,recipient_company_id,occurred_at)
    SELECT DISTINCT ON (rv.company_id,info.user_id,candidate->>'sourceTable',ref)
      'legacy:'||rv.company_id::text||':'||info.user_id::text||':'||(candidate->>'sourceTable')||':'||ref,
      info.user_id,candidate->>'sourceTable',ref,'legacy_contact',rv.company_id,rv.revealed_at
    FROM public.school_lead_reveals rv JOIN (
      SELECT DISTINCT ON (user_id) user_id,answer_text FROM public.informations_complementaires
      WHERE question_id='orientation_final_selection' ORDER BY user_id,created_at DESC,id DESC
    ) info ON rv.lead_key='user:'||info.user_id::text
    CROSS JOIN LATERAL jsonb_array_elements(public.school_selection_array(info.answer_text)) candidate
    CROSS JOIN LATERAL (SELECT coalesce(nullif(candidate->>'rawId',''),split_part(candidate->>'id',':',2)) ref) identity
    WHERE candidate->>'type'='formation' AND (
      (candidate->>'sourceTable'='formation_france' AND EXISTS(SELECT 1 FROM public.formation_france WHERE id::text=ref))
      OR (candidate->>'sourceTable'='ecoles_partenaires' AND EXISTS(SELECT 1 FROM public.ecoles_partenaires WHERE id::text=ref)))
    ON CONFLICT DO NOTHING;
    INSERT INTO public.school_portal_migration_state VALUES('legacy-revealed-contacts');
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.school_bind_recipient()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  UPDATE public.school_portal_events SET recipient_company_id=NEW.company_id
  WHERE source=NEW.source AND formation_ref=NEW.formation_ref AND recipient_company_id IS NULL;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS school_bind_recipient ON public.school_catalog_links;
CREATE TRIGGER school_bind_recipient AFTER INSERT ON public.school_catalog_links
  FOR EACH ROW EXECUTE FUNCTION public.school_bind_recipient();

CREATE OR REPLACE FUNCTION public.school_dashboard_rows(p_company bigint)
RETURNS SETOF jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  WITH grouped AS (
    SELECT CASE WHEN e.user_id IS NOT NULL THEN 'user:'||e.user_id::text ELSE 'request:'||e.request_id::text END lead_key,
      e.user_id, min(e.occurred_at) created_at,
      bool_or(e.channel IN ('questionnaire','legacy_contact')) questionnaire,
      coalesce(bool_or(e.sharing_version='orientation-dossier-v1'),false) detailed_request,
      bool_or(e.source='formation_france') natural, bool_or(e.source='ecoles_partenaires') sponsored,
      array_agg(DISTINCT e.channel) channels,
      jsonb_agg(jsonb_build_object('source',e.source,'reference',e.formation_ref,'channel',e.channel,'campus',l.campus,
        'date',e.occurred_at,'title',coalesce(f.nmc,p.formation_name,'Formation indisponible'),
        'link',coalesce(f.etab_url,f.fiche,p.link))) actions,
      max(r.email) guest_email,max(r.first_name) guest_first,max(r.last_name) guest_last
    FROM public.school_portal_events e
    JOIN public.school_catalog_links l ON l.source=e.source AND l.formation_ref=e.formation_ref AND l.company_id=p_company
      AND (e.recipient_company_id IS NULL OR e.recipient_company_id=p_company)
    LEFT JOIN public.formation_france f ON e.source='formation_france' AND f.id::text=e.formation_ref
    LEFT JOIN public.ecoles_partenaires p ON e.source='ecoles_partenaires' AND p.id::text=e.formation_ref
    LEFT JOIN public.formation_info_requests r ON r.id=e.request_id
    WHERE NOT EXISTS(SELECT 1 FROM public.school_sharing_blocks b WHERE b.user_id=e.user_id AND b.company_id=p_company)
      AND (e.channel<>'legacy_contact' OR EXISTS(SELECT 1 FROM public.profiles profile WHERE profile.id=e.user_id AND profile.contact_preference IS TRUE))
    GROUP BY 1,e.user_id
  ), info AS (
    SELECT g.*,
      coalesce((SELECT jsonb_object_agg(i.question_id,i.answer_text) FROM (
        SELECT DISTINCT ON (question_id) question_id,answer_text FROM public.informations_complementaires
        WHERE user_id=g.user_id AND question_id LIKE 'orientation_%'
          AND question_id NOT IN ('orientation_final_selection','orientation_recommendations')
        ORDER BY question_id,created_at DESC,id DESC
      ) i),'{}'::jsonb) extra
    FROM grouped g
  )
  SELECT jsonb_build_object(
    'leadKey',g.lead_key,'user_id',g.user_id,'prenom',coalesce(nullif(p.first_name,''),u.raw_user_meta_data->>'first_name',g.guest_first,''),
    'nom',coalesce(nullif(p.last_name,''),u.raw_user_meta_data->>'last_name',g.guest_last,''),'email',coalesce(u.email,g.guest_email,''),
    'source',CASE WHEN cardinality(g.channels)=1 THEN g.channels[1] ELSE 'multiple' END,
    'channels',to_jsonb(g.channels),'origin',CASE WHEN g.natural AND g.sponsored THEN 'mixed' WHEN g.natural THEN 'natural' ELSE 'sponsored' END,
    'actions',g.actions,'inscrit_le',g.created_at,'status',coalesce(s.status,'nouveau'),'note',coalesce(s.note,''),
    'revealed',EXISTS(SELECT 1 FROM public.school_lead_reveals rv WHERE rv.company_id=p_company AND rv.lead_key=g.lead_key),
    'detailedAllowed',g.user_id IS NOT NULL AND (g.detailed_request OR EXISTS(
      SELECT 1 FROM public.school_sharing_consents c WHERE c.user_id=g.user_id AND c.revoked_at IS NULL)),
    'genre',CASE WHEN g.questionnaire THEN p.gender ELSE '' END,'age',CASE WHEN g.questionnaire THEN p.age END,
    'departement',CASE WHEN g.questionnaire THEN coalesce(g.extra->>'orientation_department_name',p.department) ELSE '' END,
    'classe_actuelle',CASE WHEN g.questionnaire THEN g.extra->>'orientation_school_level' ELSE '' END,
    'niveau_vise',CASE WHEN g.questionnaire THEN g.extra->>'orientation_target_level' ELSE '' END,
    'budget',CASE WHEN g.questionnaire THEN g.extra->>'orientation_budget' ELSE '' END,
    'moyenne',CASE WHEN g.questionnaire THEN g.extra->>'orientation_grade_confidence' ELSE '' END,
    'preference_geo',CASE WHEN g.questionnaire THEN g.extra->>'orientation_study_location' ELSE '' END,
    'matieres_fortes',CASE WHEN g.questionnaire THEN g.extra->>'orientation_strong_subjects' ELSE '' END,
    'formations_choisies_ecole',(SELECT string_agg(a->>'title',' / ') FROM jsonb_array_elements(g.actions) a),
    'nb_demandes_infos_ecole',jsonb_array_length(g.actions))
  FROM info g LEFT JOIN public.profiles p ON p.id=g.user_id LEFT JOIN auth.users u ON u.id=g.user_id
  LEFT JOIN public.school_lead_status s ON s.company_id=p_company AND s.lead_key=g.lead_key;
$$;

CREATE OR REPLACE FUNCTION public.school_dashboard(p_company bigint,p_filters jsonb DEFAULT '{}',p_limit int DEFAULT 50,p_offset int DEFAULT 0)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  WITH all_rows AS MATERIALIZED (SELECT value row FROM public.school_dashboard_rows(p_company) value),
  filtered AS MATERIALIZED (
    SELECT row FROM all_rows WHERE
      (coalesce(p_filters->>'leadKey','')='' OR row->>'leadKey'=p_filters->>'leadKey')
      AND (coalesce(p_filters->>'status','')='' OR row->>'status'=p_filters->>'status')
      AND (coalesce(p_filters->>'source','')='' OR row->'channels' ? (p_filters->>'source'))
      AND (coalesce(p_filters->>'origin','')='' OR row->>'origin'=p_filters->>'origin'
        OR (row->>'origin'='mixed' AND p_filters->>'origin' IN ('natural','sponsored')))
      AND (coalesce(p_filters->>'campus','')='' OR EXISTS(SELECT 1 FROM jsonb_array_elements(row->'actions') a WHERE a->>'campus'=p_filters->>'campus'))
      AND (coalesce(p_filters->>'from','')='' OR (row->>'inscrit_le')::timestamptz >= (p_filters->>'from')::date)
      AND (coalesce(p_filters->>'to','')='' OR (row->>'inscrit_le')::timestamptz < (p_filters->>'to')::date+interval '1 day')
      AND (coalesce(p_filters->>'search','')='' OR concat_ws(' ',row->>'prenom',
        CASE WHEN (row->>'revealed')::boolean OR p_filters->'unmasked'='true'::jsonb THEN row->>'nom' END,
        CASE WHEN (row->>'revealed')::boolean OR p_filters->'unmasked'='true'::jsonb THEN row->>'email' END) ILIKE '%'||(p_filters->>'search')||'%')
      AND (coalesce(p_filters->>'niveauVise','')='' OR row->>'niveau_vise'=p_filters->>'niveauVise')
      AND (coalesce(p_filters->>'budget','')='' OR row->>'budget'=p_filters->>'budget')
      AND (coalesce(p_filters->>'departement','')='' OR row->>'departement'=p_filters->>'departement')
      AND (coalesce(p_filters->>'classeActuelle','')='' OR row->>'classe_actuelle'=p_filters->>'classeActuelle')
  ), page AS (SELECT row FROM filtered ORDER BY row->>'inscrit_le' DESC,row->>'leadKey'
    LIMIT CASE WHEN p_limit=-1 THEN NULL ELSE least(greatest(p_limit,1),1000) END OFFSET greatest(p_offset,0)),
  weeks AS (SELECT date_trunc('week',(row->>'inscrit_le')::timestamptz AT TIME ZONE 'UTC') week,count(*) count FROM filtered GROUP BY 1 ORDER BY 1 DESC LIMIT 12),
  formations AS (SELECT a->>'title' name,count(DISTINCT row->>'leadKey') count FROM filtered
    CROSS JOIN LATERAL jsonb_array_elements(row->'actions') a GROUP BY 1 ORDER BY 2 DESC,1 LIMIT 10)
  SELECT jsonb_build_object('leads',coalesce((SELECT jsonb_agg(row) FROM page),'[]'::jsonb),
    'total',(SELECT count(*) FROM filtered),
    'campuses',coalesce((SELECT jsonb_agg(campus ORDER BY campus) FROM (SELECT DISTINCT l.campus FROM public.school_catalog_links l WHERE l.company_id=p_company) c),'[]'::jsonb),
    'byOrigin',jsonb_build_object('natural',(SELECT count(*) FROM filtered WHERE row->>'origin'='natural'),
      'sponsored',(SELECT count(*) FROM filtered WHERE row->>'origin'='sponsored'),
      'mixed',(SELECT count(*) FROM filtered WHERE row->>'origin'='mixed'),'unknown',0),
    'bySource',coalesce((SELECT jsonb_object_agg(channel,n) FROM (SELECT channel,count(*) n FROM filtered
      CROSS JOIN LATERAL jsonb_array_elements_text(row->'channels') channel GROUP BY channel) counts),'{}'::jsonb),
    'byStatus',coalesce((SELECT jsonb_object_agg(status,n) FROM (SELECT row->>'status' status,count(*) n FROM filtered GROUP BY 1) counts),'{}'::jsonb),
    'leadsPerWeek',coalesce((SELECT jsonb_agg(jsonb_build_object('week',week,'count',count) ORDER BY week) FROM weeks),'[]'::jsonb),
    'topFormations',coalesce((SELECT jsonb_agg(jsonb_build_object('name',name,'count',count)) FROM formations),'[]'::jsonb));
$$;

CREATE OR REPLACE FUNCTION public.school_catalog_candidates(p_company bigint,p_query text DEFAULT '',p_source text DEFAULT '',p_limit int DEFAULT 50,p_offset int DEFAULT 0)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public,extensions AS $$
  WITH catalog AS (
    SELECT 'formation_france' source,f.id::text reference,f.etab_nom school,f.nmc title,f.commune campus,true active,true recommended,coalesce(nullif(f.etab_url,''),f.fiche) url
    FROM public.formation_france f
    UNION ALL
    SELECT 'ecoles_partenaires',p.id::text,p.school_name,p.formation_name,p.city,p.is_active,p.show_in_results,p.link
    FROM public.ecoles_partenaires p
  ), matches AS MATERIALIZED (
    SELECT c.*,l.company_id AS "linkedCompanyId",l.company_id=p_company AS linked
    FROM catalog c LEFT JOIN public.school_catalog_links l ON l.source=c.source AND l.formation_ref=c.reference
    WHERE (p_source='' OR c.source=p_source) AND (
      l.company_id=p_company OR lower(unaccent(c.school)) LIKE '%'||lower(unaccent(coalesce(nullif(trim(p_query),''),(SELECT name FROM public.companies WHERE id=p_company))))||'%')
  ), page AS (SELECT * FROM matches ORDER BY school,campus,title,source,reference LIMIT least(greatest(p_limit,1),1000) OFFSET greatest(p_offset,0))
  SELECT jsonb_build_object('items',coalesce((SELECT jsonb_agg(to_jsonb(page)) FROM page),'[]'::jsonb),
    'total',(SELECT count(*) FROM matches),
    'natural',(SELECT count(*) FROM matches WHERE source='formation_france'),
    'sponsored',(SELECT count(*) FROM matches WHERE source='ecoles_partenaires'));
$$;

CREATE OR REPLACE FUNCTION public.school_save_selection(p_user uuid,p_text text,p_question text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(p_user::text));
  DELETE FROM public.informations_complementaires WHERE user_id=p_user AND question_id='orientation_final_selection';
  INSERT INTO public.informations_complementaires(user_id,question_id,question_text,answer_text)
  VALUES(p_user,'orientation_final_selection',p_question,p_text);
END $$;

CREATE OR REPLACE FUNCTION public.school_attach_account(p_company bigint,p_user uuid,p_role text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(p_user::text));
  PERFORM 1 FROM public.companies WHERE id=p_company FOR UPDATE;
  IF EXISTS(SELECT 1 FROM public.companies WHERE owner_id=p_user AND id<>p_company)
    OR EXISTS(SELECT 1 FROM public.school_portal_members WHERE user_id=p_user AND company_id<>p_company)
    THEN RAISE EXCEPTION 'SCHOOL_ACCOUNT_ALREADY_ATTACHED' USING ERRCODE='23505'; END IF;
  IF p_role='owner' THEN
    IF EXISTS(SELECT 1 FROM public.companies WHERE id=p_company AND owner_id IS NOT NULL AND owner_id<>p_user)
      THEN RAISE EXCEPTION 'SCHOOL_OWNER_EXISTS' USING ERRCODE='23505'; END IF;
    UPDATE public.companies SET owner_id=p_user WHERE id=p_company;
  ELSIF p_role='member' THEN
    INSERT INTO public.school_portal_members(company_id,user_id,role) VALUES(p_company,p_user,'member') ON CONFLICT DO NOTHING;
  ELSE RAISE EXCEPTION 'INVALID_ROLE' USING ERRCODE='22023'; END IF;
END $$;

CREATE OR REPLACE FUNCTION public.school_submit_partner(p_user uuid,p_formation uuid,p_version text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM 1 FROM public.ecoles_partenaires WHERE id=p_formation AND is_active FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'FORMATION_UNAVAILABLE' USING ERRCODE='P0002'; END IF;
  INSERT INTO public.contact_submitted(user_id,formation_id,sharing_version)
  VALUES(p_user,p_formation,CASE WHEN p_version='orientation-dossier-v1' THEN p_version END);
END $$;

CREATE OR REPLACE FUNCTION public.school_create_portal(p_name text,p_email text,p_first text,p_last text,p_request bigint DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE created public.companies; request public.school_registration_requests;
BEGIN
  IF p_request IS NOT NULL THEN
    SELECT * INTO request FROM public.school_registration_requests WHERE id=p_request FOR UPDATE;
    IF NOT FOUND OR lower(request.email)<>lower(p_email) THEN RAISE EXCEPTION 'INVALID_REGISTRATION' USING ERRCODE='22023'; END IF;
    IF request.company_id IS NOT NULL THEN RAISE EXCEPTION 'REGISTRATION_ALREADY_LINKED' USING ERRCODE='23505'; END IF;
  END IF;
  INSERT INTO public.companies(name,email,contact_first_name,contact_last_name)
  VALUES(p_name,p_email,p_first,p_last) RETURNING * INTO created;
  IF p_request IS NOT NULL THEN UPDATE public.school_registration_requests SET company_id=created.id WHERE id=p_request; END IF;
  RETURN jsonb_build_object('id',created.id::text);
END $$;

CREATE OR REPLACE FUNCTION public.school_set_sharing(p_user uuid,p_granted boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  INSERT INTO public.school_sharing_consents(user_id,version,granted_at,revoked_at)
  VALUES(p_user,'orientation-dossier-v1',CASE WHEN p_granted THEN now() END,CASE WHEN NOT p_granted THEN now() END)
  ON CONFLICT(user_id) DO UPDATE SET granted_at=CASE WHEN p_granted THEN excluded.granted_at ELSE school_sharing_consents.granted_at END,revoked_at=excluded.revoked_at;
  UPDATE public.profiles SET contact_preference=p_granted WHERE id=p_user;
END $$;

CREATE OR REPLACE FUNCTION public.school_claim_notification(p_company bigint,p_key text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE claimed boolean;
BEGIN
  INSERT INTO public.school_lead_status(company_id,lead_key,notification_locked_at)
  VALUES(p_company,p_key,now())
  ON CONFLICT(company_id,lead_key) DO UPDATE SET notification_locked_at=now()
  WHERE school_lead_status.notified_at IS NULL AND
    (school_lead_status.notification_locked_at IS NULL OR school_lead_status.notification_locked_at<now()-interval '5 minutes')
  RETURNING true INTO claimed;
  RETURN coalesce(claimed,false);
END $$;

CREATE OR REPLACE FUNCTION public.school_claim_invitation(p_company bigint,p_email text,p_role text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE claimed boolean;
BEGIN
  INSERT INTO public.school_portal_invitations(company_id,email,role) VALUES(p_company,p_email,p_role)
  ON CONFLICT(company_id,email) DO UPDATE SET status='pending',error=NULL,attempted_at=now()
  WHERE school_portal_invitations.role=excluded.role
    AND (school_portal_invitations.sent_at IS NULL OR school_portal_invitations.sent_at<now()-interval '1 minute')
    AND (school_portal_invitations.status<>'pending' OR school_portal_invitations.attempted_at<now()-interval '5 minutes')
  RETURNING true INTO claimed;
  RETURN coalesce(claimed,false);
END $$;

CREATE OR REPLACE FUNCTION public.school_find_auth_user(p_email text)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT id FROM auth.users WHERE lower(email)=lower(p_email) LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.school_manage_catalog(p_company bigint,p_source text,p_ref text,p_actor uuid,p_remove boolean DEFAULT false)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE campus text;
BEGIN
  IF p_source NOT IN ('formation_france','ecoles_partenaires') THEN RAISE EXCEPTION 'INVALID_SOURCE' USING ERRCODE='22023'; END IF;
  IF p_remove THEN
    DELETE FROM public.school_catalog_links WHERE company_id=p_company AND source=p_source AND formation_ref=p_ref;
    IF NOT FOUND THEN RAISE EXCEPTION 'LINK_NOT_FOUND' USING ERRCODE='P0002'; END IF;
  ELSE
    IF p_source='formation_france' THEN SELECT commune INTO campus FROM public.formation_france WHERE id::text=p_ref;
    ELSE SELECT city INTO campus FROM public.ecoles_partenaires WHERE id::text=p_ref; END IF;
    IF NOT FOUND THEN RAISE EXCEPTION 'FORMATION_NOT_FOUND' USING ERRCODE='P0002'; END IF;
    INSERT INTO public.school_catalog_links(company_id,source,formation_ref,campus,validated_by)
    VALUES(p_company,p_source,p_ref,coalesce(campus,''),p_actor);
  END IF;
  INSERT INTO public.school_portal_audit(actor_id,company_id,action,resource)
  VALUES(p_actor,p_company,CASE WHEN p_remove THEN 'unlink_catalog' ELSE 'link_catalog' END,p_source||':'||p_ref);
END $$;

CREATE OR REPLACE FUNCTION public.school_remove_member(p_company bigint,p_member bigint,p_actor uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  DELETE FROM public.school_portal_members WHERE company_id=p_company AND id=p_member;
  IF NOT FOUND THEN RAISE EXCEPTION 'MEMBER_NOT_FOUND' USING ERRCODE='P0002'; END IF;
  INSERT INTO public.school_portal_audit(actor_id,company_id,action,resource)
  VALUES(p_actor,p_company,'remove_member',p_member::text);
END $$;

CREATE OR REPLACE FUNCTION public.school_patch_lead(p_company bigint,p_key text,p_status text DEFAULT NULL,p_note text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE result public.school_lead_status;
BEGIN
  INSERT INTO public.school_lead_status(company_id,lead_key,status,note)
  VALUES(p_company,p_key,coalesce(p_status,'nouveau'),coalesce(p_note,''))
  ON CONFLICT(company_id,lead_key) DO UPDATE SET status=coalesce(p_status,school_lead_status.status),
    note=coalesce(p_note,school_lead_status.note),updated_at=now() RETURNING * INTO result;
  RETURN jsonb_build_object('status',result.status,'note',result.note);
END $$;

REVOKE ALL ON FUNCTION public.school_selection_array(text),public.school_capture_selection(uuid,text,timestamptz),
  public.school_capture_event(),public.school_bind_recipient(),public.school_dashboard_rows(bigint),public.school_dashboard(bigint,jsonb,int,int),
  public.school_catalog_candidates(bigint,text,text,int,int),
  public.school_save_selection(uuid,text,text),public.school_attach_account(bigint,uuid,text),public.school_submit_partner(uuid,uuid,text),
  public.school_create_portal(text,text,text,text,bigint),public.school_set_sharing(uuid,boolean),public.school_claim_notification(bigint,text),
  public.school_claim_invitation(bigint,text,text),public.school_find_auth_user(text),
  public.school_manage_catalog(bigint,text,text,uuid,boolean),public.school_remove_member(bigint,bigint,uuid),
  public.school_patch_lead(bigint,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.school_dashboard(bigint,jsonb,int,int),public.school_save_selection(uuid,text,text),
  public.school_catalog_candidates(bigint,text,text,int,int),public.school_attach_account(bigint,uuid,text),public.school_submit_partner(uuid,uuid,text),
  public.school_create_portal(text,text,text,text,bigint),public.school_set_sharing(uuid,boolean),public.school_claim_notification(bigint,text),
  public.school_claim_invitation(bigint,text,text),public.school_find_auth_user(text),
  public.school_manage_catalog(bigint,text,text,uuid,boolean),public.school_remove_member(bigint,bigint,uuid),
  public.school_patch_lead(bigint,text,text,text) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
