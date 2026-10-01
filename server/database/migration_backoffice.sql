BEGIN;

CREATE TABLE IF NOT EXISTS public.backoffice_account_suspensions (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  is_suspended boolean NOT NULL DEFAULT true,
  desired_suspended boolean NOT NULL DEFAULT true,
  sync_pending boolean NOT NULL DEFAULT true,
  revision uuid NOT NULL DEFAULT gen_random_uuid(),
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reason text NOT NULL CHECK (length(reason) BETWEEN 1 AND 1000),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.backoffice_audit (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action text NOT NULL,
  resource_type text NOT NULL,
  resource_id text NOT NULL,
  reason text,
  changed_fields text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS backoffice_audit_created_idx ON public.backoffice_audit(created_at DESC, id DESC);
ALTER TABLE public.backoffice_account_suspensions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.backoffice_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.backoffice_account_suspensions, public.backoffice_audit FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.backoffice_account_suspensions TO service_role;
GRANT SELECT, INSERT ON public.backoffice_audit TO service_role;
REVOKE UPDATE, DELETE, TRUNCATE ON public.backoffice_audit FROM service_role;
GRANT USAGE, SELECT ON SEQUENCE public.backoffice_audit_id_seq TO service_role;

ALTER TABLE public.ecoles_partenaires ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;
CREATE INDEX IF NOT EXISTS backoffice_partners_active_idx ON public.ecoles_partenaires(is_active, school_name, city);

CREATE OR REPLACE FUNCTION public.backoffice_account_active()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT auth.uid() IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.backoffice_account_suspensions
    WHERE user_id = auth.uid() AND is_suspended
  );
$$;
REVOKE ALL ON FUNCTION public.backoffice_account_active() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.backoffice_account_active() TO authenticated, service_role;

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'profiles', 'user_responses', 'user_results', 'user_progression',
    'user_favorite_formations', 'informations_complementaires', 'user_letter',
    'user_notes', 'user_fields', 'user_schools', 'messages', 'global_chat',
    'contact_submitted', 'companies', 'class_groups', 'license_links',
    'invoices', 'custom_formations'
  ] LOOP
    IF to_regclass('public.' || table_name) IS NOT NULL THEN
      EXECUTE format('DROP POLICY IF EXISTS backoffice_active_account ON public.%I', table_name);
      EXECUTE format(
        'CREATE POLICY backoffice_active_account ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING (public.backoffice_account_active()) WITH CHECK (public.backoffice_account_active())',
        table_name
      );
    END IF;
  END LOOP;
END;
$$;

REVOKE INSERT, UPDATE ON public.companies FROM PUBLIC, anon, authenticated;
DO $$
DECLARE column_name text;
BEGIN
  FOR column_name IN SELECT attname FROM pg_attribute
    WHERE attrelid = 'public.companies'::regclass AND attnum > 0 AND NOT attisdropped
  LOOP
    EXECUTE format('REVOKE INSERT (%I), UPDATE (%I) ON public.companies FROM PUBLIC, anon, authenticated', column_name, column_name);
  END LOOP;
END;
$$;
GRANT UPDATE (contact_first_name, contact_last_name, updated_at) ON public.companies TO authenticated;

DROP POLICY IF EXISTS backoffice_active_partner_submission ON public.contact_submitted;
CREATE POLICY backoffice_active_partner_submission ON public.contact_submitted
  AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.ecoles_partenaires WHERE id = formation_id AND is_active));

CREATE OR REPLACE FUNCTION public.search_partner_schools(p_query text, p_limit int DEFAULT 20)
RETURNS TABLE (school_name text, source text) LANGUAGE sql STABLE SET search_path = public, extensions AS $$
  WITH needle AS (SELECT lower(unaccent(trim(coalesce(p_query, '')))) AS value),
  candidates AS (
    SELECT DISTINCT ff.etab_nom AS school_name, 'formation_france' AS source
    FROM public.formation_france ff WHERE ff.etab_nom IS NOT NULL AND ff.etab_nom <> ''
    UNION
    SELECT DISTINCT ep.school_name, 'ecoles_partenaires' AS source
    FROM public.ecoles_partenaires ep WHERE ep.is_active AND ep.school_name <> ''
  )
  SELECT c.school_name, c.source FROM candidates c, needle n
  WHERE n.value = '' OR lower(unaccent(c.school_name)) LIKE '%' || n.value || '%'
  ORDER BY c.school_name LIMIT least(greatest(coalesce(p_limit, 20), 1), 100);
$$;

CREATE OR REPLACE FUNCTION public.backoffice_users(
  p_query text DEFAULT '', p_status text DEFAULT 'all', p_type text DEFAULT 'all',
  p_limit int DEFAULT 50, p_offset int DEFAULT 0, p_user_id uuid DEFAULT NULL
)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  WITH filtered AS MATERIALIZED (
    SELECT au.id, au.email, au.created_at, au.last_sign_in_at,
      p.first_name, p.last_name, p.department, p.school,
      coalesce(bs.is_suspended, false) AS is_suspended,
      coalesce(bs.sync_pending, false) AS sync_pending,
      CASE WHEN EXISTS (SELECT 1 FROM public.companies c WHERE c.owner_id = au.id)
        OR EXISTS (SELECT 1 FROM public.school_portal_members sm WHERE sm.user_id = au.id)
        THEN 'school' ELSE 'student' END AS account_type
    FROM auth.users au LEFT JOIN public.profiles p ON p.id = au.id
    LEFT JOIN public.backoffice_account_suspensions bs ON bs.user_id = au.id
    WHERE (p_user_id IS NULL OR au.id = p_user_id)
      AND (coalesce(p_query, '') = '' OR concat_ws(' ', au.email, p.first_name, p.last_name, p.school) ILIKE '%' || p_query || '%')
      AND (p_status = 'all' OR coalesce(bs.is_suspended, false) = (p_status = 'suspended'))
  ), typed AS MATERIALIZED (
    SELECT * FROM filtered WHERE p_type = 'all' OR account_type = p_type
  ), page AS (
    SELECT * FROM typed ORDER BY created_at DESC, id
    LIMIT least(greatest(p_limit, 1), 100) OFFSET greatest(p_offset, 0)
  )
  SELECT jsonb_build_object('items', coalesce((SELECT jsonb_agg(to_jsonb(page)) FROM page), '[]'::jsonb),
    'total', (SELECT count(*) FROM typed));
$$;

CREATE OR REPLACE FUNCTION public.backoffice_results(
  p_query text DEFAULT '', p_type text DEFAULT '', p_limit int DEFAULT 50, p_offset int DEFAULT 0,
  p_user_id uuid DEFAULT NULL
)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  WITH filtered AS MATERIALIZED (
    SELECT r.id, r.user_id, r.questionnaire_type, r.created_at, r.updated_at,
      au.email, p.first_name, p.last_name
    FROM public.user_results r JOIN auth.users au ON au.id = r.user_id
    LEFT JOIN public.profiles p ON p.id = r.user_id
    WHERE (p_user_id IS NULL OR r.user_id = p_user_id)
      AND (p_type = '' OR r.questionnaire_type = p_type)
      AND (p_query = '' OR concat_ws(' ', au.email, p.first_name, p.last_name) ILIKE '%' || p_query || '%')
  ), page AS (
    SELECT * FROM filtered ORDER BY updated_at DESC, id DESC
    LIMIT least(greatest(p_limit, 1), 100) OFFSET greatest(p_offset, 0)
  )
  SELECT jsonb_build_object('items', coalesce((SELECT jsonb_agg(to_jsonb(page)) FROM page), '[]'::jsonb),
    'total', (SELECT count(*) FROM filtered));
$$;

CREATE OR REPLACE FUNCTION public.backoffice_overview()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT jsonb_build_object(
    'users', (SELECT count(*) FROM auth.users),
    'suspendedUsers', (SELECT count(*) FROM public.backoffice_account_suspensions WHERE is_suspended),
    'schools', (SELECT count(*) FROM public.companies),
    'approvedSchools', (SELECT count(*) FROM public.companies WHERE approved_at IS NOT NULL),
    'nationalFormations', (SELECT count(*) FROM public.formation_france),
    'customFormations', (SELECT count(*) FROM public.custom_school_formations),
    'partnerFormations', (SELECT count(*) FROM public.ecoles_partenaires WHERE is_active),
    'results', (SELECT count(*) FROM public.user_results),
    'usersWithResults', (SELECT count(DISTINCT user_id) FROM public.user_results),
    'recentActions', coalesce((SELECT jsonb_agg(to_jsonb(recent)) FROM (
      SELECT id, actor_id, action, resource_type, resource_id, created_at
      FROM public.backoffice_audit ORDER BY created_at DESC, id DESC LIMIT 8
    ) recent), '[]'::jsonb)
  );
$$;

CREATE OR REPLACE FUNCTION public.backoffice_change(
  p_actor uuid, p_kind text, p_id text, p_patch jsonb DEFAULT '{}'::jsonb, p_reason text DEFAULT ''
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE result_row jsonb; fields text[]; target_id text; changed_count int;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = p_actor AND lower(email) IN
    ('joris.geerdes@21datas.ch', 'nicolas.weigele@zelia.io')) THEN
    RAISE EXCEPTION 'ADMIN_ACCESS_DENIED' USING ERRCODE = '42501';
  END IF;
  IF jsonb_typeof(p_patch) <> 'object' THEN RAISE EXCEPTION 'INVALID_PATCH' USING ERRCODE = '22023'; END IF;
  IF p_kind = 'profile' THEN
    IF EXISTS (SELECT 1 FROM jsonb_object_keys(p_patch) AS key WHERE key NOT IN
      ('first_name','last_name','age','gender','department','school','phone_number')) THEN
      RAISE EXCEPTION 'INVALID_FIELD' USING ERRCODE = '22023';
    END IF;
    UPDATE public.profiles SET
      first_name = CASE WHEN p_patch ? 'first_name' THEN p_patch->>'first_name' ELSE first_name END,
      last_name = CASE WHEN p_patch ? 'last_name' THEN p_patch->>'last_name' ELSE last_name END,
      age = CASE WHEN p_patch ? 'age' THEN (p_patch->>'age')::int ELSE age END,
      gender = CASE WHEN p_patch ? 'gender' THEN p_patch->>'gender' ELSE gender END,
      department = CASE WHEN p_patch ? 'department' THEN p_patch->>'department' ELSE department END,
      school = CASE WHEN p_patch ? 'school' THEN p_patch->>'school' ELSE school END,
      phone_number = CASE WHEN p_patch ? 'phone_number' THEN p_patch->>'phone_number' ELSE phone_number END,
      updated_at = now() WHERE id = p_id::uuid RETURNING to_jsonb(profiles.*) INTO result_row;
  ELSIF p_kind IN ('school', 'school_approve', 'school_revoke') THEN
    IF EXISTS (SELECT 1 FROM jsonb_object_keys(p_patch) AS key WHERE key NOT IN
      ('name','email','contact_first_name','contact_last_name')) THEN
      RAISE EXCEPTION 'INVALID_FIELD' USING ERRCODE = '22023';
    END IF;
    IF p_patch ? 'name' AND NOT EXISTS (
      SELECT 1 FROM public.search_partner_schools(p_patch->>'name', 100) s WHERE s.school_name = p_patch->>'name'
    ) THEN RAISE EXCEPTION 'UNKNOWN_SCHOOL' USING ERRCODE = '22023'; END IF;
    UPDATE public.companies SET
      name = CASE WHEN p_patch ? 'name' THEN p_patch->>'name' ELSE name END,
      email = CASE WHEN p_patch ? 'email' THEN p_patch->>'email' ELSE email END,
      contact_first_name = CASE WHEN p_patch ? 'contact_first_name' THEN p_patch->>'contact_first_name' ELSE contact_first_name END,
      contact_last_name = CASE WHEN p_patch ? 'contact_last_name' THEN p_patch->>'contact_last_name' ELSE contact_last_name END,
      approved_at = CASE WHEN p_kind = 'school_approve' THEN now() WHEN p_kind = 'school_revoke' THEN NULL ELSE approved_at END,
      updated_at = now() WHERE id = p_id::bigint RETURNING to_jsonb(companies.*) INTO result_row;
  ELSIF p_kind = 'custom' THEN
    IF EXISTS (SELECT 1 FROM jsonb_object_keys(p_patch) AS key WHERE key NOT IN
      ('company_id','title','description','diploma_level','city','domain','image_url','link','contact_email','is_published')) THEN
      RAISE EXCEPTION 'INVALID_FIELD' USING ERRCODE = '22023';
    END IF;
    IF p_id IS NULL THEN
      INSERT INTO public.custom_school_formations (company_id,title,description,diploma_level,city,domain,image_url,link,contact_email,is_published)
      VALUES ((p_patch->>'company_id')::bigint,p_patch->>'title',p_patch->>'description',p_patch->>'diploma_level',p_patch->>'city',
        p_patch->>'domain',p_patch->>'image_url',p_patch->>'link',p_patch->>'contact_email',coalesce((p_patch->>'is_published')::boolean,true))
      RETURNING to_jsonb(custom_school_formations.*) INTO result_row;
    ELSE
      UPDATE public.custom_school_formations SET
        title = CASE WHEN p_patch ? 'title' THEN p_patch->>'title' ELSE title END,
        description = CASE WHEN p_patch ? 'description' THEN p_patch->>'description' ELSE description END,
        diploma_level = CASE WHEN p_patch ? 'diploma_level' THEN p_patch->>'diploma_level' ELSE diploma_level END,
        city = CASE WHEN p_patch ? 'city' THEN p_patch->>'city' ELSE city END,
        domain = CASE WHEN p_patch ? 'domain' THEN p_patch->>'domain' ELSE domain END,
        image_url = CASE WHEN p_patch ? 'image_url' THEN p_patch->>'image_url' ELSE image_url END,
        link = CASE WHEN p_patch ? 'link' THEN p_patch->>'link' ELSE link END,
        contact_email = CASE WHEN p_patch ? 'contact_email' THEN p_patch->>'contact_email' ELSE contact_email END,
        is_published = CASE WHEN p_patch ? 'is_published' THEN (p_patch->>'is_published')::boolean ELSE is_published END,
        updated_at = now() WHERE id = p_id::bigint RETURNING to_jsonb(custom_school_formations.*) INTO result_row;
    END IF;
  ELSIF p_kind = 'partner' THEN
    IF EXISTS (SELECT 1 FROM jsonb_object_keys(p_patch) AS key WHERE key NOT IN
      ('school_name','formation_name','city','domain','diploma_level','description','link','contact_email','is_active')) THEN
      RAISE EXCEPTION 'INVALID_FIELD' USING ERRCODE = '22023';
    END IF;
    IF p_id IS NULL THEN
      INSERT INTO public.ecoles_partenaires (school_name,formation_name,city,domain,diploma_level,description,link,contact_email,is_active)
      VALUES (p_patch->>'school_name',p_patch->>'formation_name',p_patch->>'city',p_patch->>'domain',p_patch->>'diploma_level',
        p_patch->>'description',p_patch->>'link',p_patch->>'contact_email',coalesce((p_patch->>'is_active')::boolean,true))
      RETURNING to_jsonb(ecoles_partenaires.*) INTO result_row;
    ELSE
      IF p_patch ? 'school_name' AND EXISTS (SELECT 1 FROM public.ecoles_partenaires WHERE id = p_id::uuid AND school_name <> p_patch->>'school_name') THEN
        RAISE EXCEPTION 'CANONICAL_SCHOOL_NAME_READ_ONLY' USING ERRCODE = '22023';
      END IF;
      UPDATE public.ecoles_partenaires SET
        formation_name = CASE WHEN p_patch ? 'formation_name' THEN p_patch->>'formation_name' ELSE formation_name END,
        city = CASE WHEN p_patch ? 'city' THEN p_patch->>'city' ELSE city END,
        domain = CASE WHEN p_patch ? 'domain' THEN p_patch->>'domain' ELSE domain END,
        diploma_level = CASE WHEN p_patch ? 'diploma_level' THEN p_patch->>'diploma_level' ELSE diploma_level END,
        description = CASE WHEN p_patch ? 'description' THEN p_patch->>'description' ELSE description END,
        link = CASE WHEN p_patch ? 'link' THEN p_patch->>'link' ELSE link END,
        contact_email = CASE WHEN p_patch ? 'contact_email' THEN p_patch->>'contact_email' ELSE contact_email END,
        is_active = CASE WHEN p_patch ? 'is_active' THEN (p_patch->>'is_active')::boolean ELSE is_active END
      WHERE id = p_id::uuid RETURNING to_jsonb(ecoles_partenaires.*) INTO result_row;
    END IF;
  ELSIF p_kind = 'partner_group' THEN
    UPDATE public.ecoles_partenaires SET is_active = (p_patch->>'is_active')::boolean
    WHERE school_name = p_patch->>'school_name' AND city = p_patch->>'city';
    GET DIAGNOSTICS changed_count = ROW_COUNT;
    IF changed_count = 0 THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE = 'P0002'; END IF;
    result_row := jsonb_build_object('id', p_patch->>'school_name', 'affected', changed_count);
  ELSE
    RAISE EXCEPTION 'INVALID_RESOURCE' USING ERRCODE = '22023';
  END IF;
  IF result_row IS NULL THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE = 'P0002'; END IF;
  SELECT array_agg(key) INTO fields FROM jsonb_object_keys(p_patch) AS key;
  IF p_kind IN ('school_approve','school_revoke') THEN fields := ARRAY['approved_at']; END IF;
  target_id := coalesce(p_id, result_row->>'id');
  INSERT INTO public.backoffice_audit(actor_id,action,resource_type,resource_id,reason,changed_fields)
  VALUES (p_actor, CASE WHEN p_id IS NULL THEN 'create' ELSE 'update' END || ':' || p_kind,
    p_kind,target_id,nullif(p_reason,''),coalesce(fields,'{}'));
  RETURN result_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.backoffice_account_change(
  p_actor uuid, p_user_id uuid, p_suspended boolean, p_reason text,
  p_revision uuid DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE result_row jsonb;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = p_actor AND lower(email) IN
    ('joris.geerdes@21datas.ch','nicolas.weigele@zelia.io')) THEN
    RAISE EXCEPTION 'ADMIN_ACCESS_DENIED' USING ERRCODE = '42501';
  END IF;
  IF EXISTS (SELECT 1 FROM auth.users WHERE id = p_user_id AND lower(email) IN
    ('joris.geerdes@21datas.ch','nicolas.weigele@zelia.io')) THEN
    RAISE EXCEPTION 'PROTECTED_ADMIN_ACCOUNT' USING ERRCODE = '42501';
  END IF;
  IF length(trim(p_reason)) NOT BETWEEN 1 AND 1000 THEN RAISE EXCEPTION 'REASON_REQUIRED' USING ERRCODE = '22023'; END IF;
  IF p_revision IS NULL THEN
    INSERT INTO public.backoffice_account_suspensions(user_id,is_suspended,desired_suspended,sync_pending,actor_id,reason)
    VALUES (p_user_id,true,p_suspended,true,p_actor,p_reason)
    ON CONFLICT (user_id) DO UPDATE SET is_suspended = true, desired_suspended = p_suspended,
      sync_pending = true, revision = gen_random_uuid(), actor_id = p_actor, reason = p_reason, updated_at = now()
    RETURNING to_jsonb(backoffice_account_suspensions.*) INTO result_row;
  ELSE
    UPDATE public.backoffice_account_suspensions SET is_suspended = p_suspended,
      sync_pending = false, updated_at = now()
    WHERE user_id = p_user_id AND revision = p_revision AND desired_suspended = p_suspended
    RETURNING to_jsonb(backoffice_account_suspensions.*) INTO result_row;
    IF result_row IS NULL THEN RAISE EXCEPTION 'ACCOUNT_STATE_CHANGED' USING ERRCODE = '40001'; END IF;
  END IF;
  INSERT INTO public.backoffice_audit(actor_id,action,resource_type,resource_id,reason,changed_fields)
  VALUES (p_actor, CASE WHEN p_revision IS NULL THEN 'account:pending' WHEN p_suspended THEN 'account:suspend' ELSE 'account:reactivate' END,
    'user',p_user_id::text,p_reason,ARRAY['is_suspended']);
  RETURN result_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.backoffice_submit_partner(p_user_id uuid, p_formation_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM 1 FROM public.ecoles_partenaires WHERE id = p_formation_id AND is_active FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PARTNER_UNAVAILABLE' USING ERRCODE = 'P0002'; END IF;
  IF EXISTS (SELECT 1 FROM public.backoffice_account_suspensions WHERE user_id = p_user_id AND is_suspended) THEN
    RAISE EXCEPTION 'ACCOUNT_SUSPENDED' USING ERRCODE = '42501';
  END IF;
  INSERT INTO public.contact_submitted(user_id,formation_id,submitted_at) VALUES(p_user_id,p_formation_id,now());
END;
$$;
REVOKE ALL ON FUNCTION public.backoffice_submit_partner(uuid,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.backoffice_submit_partner(uuid,uuid) TO service_role;

REVOKE ALL ON FUNCTION public.backoffice_users(text,text,text,int,int,uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.backoffice_results(text,text,int,int,uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.backoffice_overview() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.backoffice_change(uuid,text,text,jsonb,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.backoffice_account_change(uuid,uuid,boolean,text,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.backoffice_users(text,text,text,int,int,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.backoffice_results(text,text,int,int,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.backoffice_overview() TO service_role;
GRANT EXECUTE ON FUNCTION public.backoffice_change(uuid,text,text,jsonb,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.backoffice_account_change(uuid,uuid,boolean,text,uuid) TO service_role;

COMMIT;