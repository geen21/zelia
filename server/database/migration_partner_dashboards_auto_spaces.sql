BEGIN;

ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS partner_school_key text;
CREATE UNIQUE INDEX IF NOT EXISTS companies_partner_school_key_idx
  ON public.companies(partner_school_key) WHERE partner_school_key IS NOT NULL;
ALTER TABLE public.companies ALTER COLUMN email DROP NOT NULL;
ALTER TABLE public.ecoles_partenaires
  ADD COLUMN IF NOT EXISTS portal_company_id bigint REFERENCES public.companies(id) ON DELETE RESTRICT;
CREATE INDEX IF NOT EXISTS partner_portal_company_idx ON public.ecoles_partenaires(portal_company_id);

ALTER TABLE public.school_catalog_links ADD COLUMN IF NOT EXISTS link_origin text NOT NULL DEFAULT 'admin';
ALTER TABLE public.school_catalog_links ALTER COLUMN validated_by DROP NOT NULL;
DO $$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.school_catalog_links'::regclass AND conname='school_catalog_link_origin_check') THEN
    ALTER TABLE public.school_catalog_links ADD CONSTRAINT school_catalog_link_origin_check
      CHECK (link_origin IN ('admin','partner') AND
        (validated_by IS NOT NULL OR (link_origin='partner' AND source='ecoles_partenaires')));
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.partner_portal_key(p_name text)
RETURNS text LANGUAGE sql STABLE SET search_path = public,extensions AS $$
  SELECT nullif(lower(unaccent(regexp_replace(trim(coalesce(p_name,'')),'\s+',' ','g'))),'');
$$;

CREATE OR REPLACE FUNCTION public.ensure_partner_portal(p_name text)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE school_key text := public.partner_portal_key(p_name); company bigint; candidates bigint[];
BEGIN
  IF school_key IS NULL THEN RAISE EXCEPTION 'INVALID_PARTNER_SCHOOL_NAME' USING ERRCODE='22023'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('partner-portal:'||school_key));
  SELECT id INTO company FROM public.companies WHERE partner_school_key=school_key;
  IF FOUND THEN RETURN company; END IF;

  SELECT array_agg(DISTINCT link.company_id) INTO candidates
  FROM public.ecoles_partenaires partner
  JOIN public.school_catalog_links link ON link.source='ecoles_partenaires' AND link.formation_ref=partner.id::text
  WHERE public.partner_portal_key(partner.school_name)=school_key;
  IF coalesce(cardinality(candidates),0)>1 THEN RAISE EXCEPTION 'PARTNER_PORTAL_CONFLICT' USING ERRCODE='23505', DETAIL=p_name; END IF;
  IF coalesce(cardinality(candidates),0)=1 THEN company:=candidates[1];
  ELSE
    SELECT array_agg(id) INTO candidates FROM public.companies
    WHERE public.partner_portal_key(name)=school_key;
    IF coalesce(cardinality(candidates),0)>1 THEN RAISE EXCEPTION 'PARTNER_PORTAL_CONFLICT' USING ERRCODE='23505', DETAIL=p_name; END IF;
    company:=candidates[1];
  END IF;
  IF company IS NULL THEN
    -- A dashboard does not create an Auth account or invent a contact email.
    INSERT INTO public.companies(name,email,partner_school_key)
    VALUES(regexp_replace(trim(p_name),'\s+',' ','g'),NULL,school_key) RETURNING id INTO company;
  ELSE
    UPDATE public.companies SET partner_school_key=coalesce(partner_school_key,school_key) WHERE id=company;
  END IF;
  RETURN company;
END $$;

CREATE OR REPLACE FUNCTION public.partner_portal_assign()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE company bigint;
BEGIN
  IF TG_OP='UPDATE' AND OLD.portal_company_id IS NOT NULL
    AND public.partner_portal_key(OLD.school_name) IS DISTINCT FROM public.partner_portal_key(NEW.school_name) THEN
    RAISE EXCEPTION 'PARTNER_SCHOOL_CHANGE_REQUIRES_REVIEW' USING ERRCODE='22023';
  END IF;
  company:=public.ensure_partner_portal(NEW.school_name);
  IF NEW.portal_company_id IS NOT NULL AND NEW.portal_company_id<>company THEN
    RAISE EXCEPTION 'PARTNER_PORTAL_CONFLICT' USING ERRCODE='23505', DETAIL=NEW.school_name;
  END IF;
  NEW.portal_company_id:=company;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.partner_portal_sync_link()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF EXISTS(SELECT 1 FROM public.school_catalog_links WHERE source='ecoles_partenaires'
    AND formation_ref=NEW.id::text AND company_id<>NEW.portal_company_id) THEN
    RAISE EXCEPTION 'PARTNER_PORTAL_CONFLICT' USING ERRCODE='23505', DETAIL=NEW.school_name;
  END IF;
  INSERT INTO public.school_catalog_links(company_id,source,formation_ref,campus,validated_by,link_origin)
  VALUES(NEW.portal_company_id,'ecoles_partenaires',NEW.id::text,coalesce(NEW.city,''),NULL,'partner')
  ON CONFLICT(source,formation_ref) DO UPDATE SET campus=excluded.campus,link_origin='partner';
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS partner_portal_assign ON public.ecoles_partenaires;
CREATE TRIGGER partner_portal_assign BEFORE INSERT OR UPDATE ON public.ecoles_partenaires
  FOR EACH ROW EXECUTE FUNCTION public.partner_portal_assign();
DROP TRIGGER IF EXISTS partner_portal_sync_link ON public.ecoles_partenaires;
CREATE TRIGGER partner_portal_sync_link AFTER INSERT OR UPDATE ON public.ecoles_partenaires
  FOR EACH ROW EXECUTE FUNCTION public.partner_portal_sync_link();

UPDATE public.ecoles_partenaires SET portal_company_id=public.ensure_partner_portal(school_name);
ALTER TABLE public.ecoles_partenaires ALTER COLUMN portal_company_id SET NOT NULL;
UPDATE public.school_registration_requests request SET company_id=partner.portal_company_id
FROM public.ecoles_partenaires partner
WHERE request.company_id IS NULL AND public.partner_portal_key(request.school_name)=public.partner_portal_key(partner.school_name);

CREATE OR REPLACE FUNCTION public.partner_portal_registration()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.company_id IS NULL AND EXISTS(SELECT 1 FROM public.ecoles_partenaires
    WHERE public.partner_portal_key(school_name)=public.partner_portal_key(NEW.school_name)) THEN
    NEW.company_id:=public.ensure_partner_portal(NEW.school_name);
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS partner_portal_registration ON public.school_registration_requests;
CREATE TRIGGER partner_portal_registration BEFORE INSERT ON public.school_registration_requests
  FOR EACH ROW EXECUTE FUNCTION public.partner_portal_registration();

DO $$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.companies'::regclass AND conname='company_contact_or_partner_portal_check') THEN
    ALTER TABLE public.companies ADD CONSTRAINT company_contact_or_partner_portal_check
      CHECK (email IS NOT NULL OR partner_school_key IS NOT NULL);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.partner_portal_guard_link()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE company bigint;
BEGIN
  IF TG_OP IN ('DELETE','UPDATE') AND OLD.source='ecoles_partenaires' THEN
    SELECT portal_company_id INTO company FROM public.ecoles_partenaires WHERE id::text=OLD.formation_ref;
    IF company IS NOT NULL AND (TG_OP='DELETE' OR NEW.company_id<>company OR NEW.source<>OLD.source OR NEW.formation_ref<>OLD.formation_ref) THEN
      RAISE EXCEPTION 'PARTNER_PORTAL_LINK_REQUIRED' USING ERRCODE='22023';
    END IF;
  END IF;
  IF TG_OP IN ('INSERT','UPDATE') AND NEW.source='ecoles_partenaires' THEN
    SELECT portal_company_id INTO company FROM public.ecoles_partenaires WHERE id::text=NEW.formation_ref;
    IF company IS NOT NULL AND NEW.company_id<>company THEN
      RAISE EXCEPTION 'PARTNER_PORTAL_LINK_REQUIRED' USING ERRCODE='22023';
    END IF;
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS partner_portal_guard_link ON public.school_catalog_links;
CREATE TRIGGER partner_portal_guard_link BEFORE INSERT OR UPDATE OR DELETE ON public.school_catalog_links
  FOR EACH ROW EXECUTE FUNCTION public.partner_portal_guard_link();

CREATE OR REPLACE FUNCTION public.school_attach_account(p_company bigint,p_user uuid,p_role text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(p_user::text));
  PERFORM 1 FROM public.companies WHERE id=p_company FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'SCHOOL_NOT_FOUND' USING ERRCODE='P0002'; END IF;
  IF EXISTS(SELECT 1 FROM public.companies WHERE owner_id=p_user AND id<>p_company)
    OR EXISTS(SELECT 1 FROM public.school_portal_members WHERE user_id=p_user AND company_id<>p_company)
    THEN RAISE EXCEPTION 'SCHOOL_ACCOUNT_ALREADY_ATTACHED' USING ERRCODE='23505'; END IF;
  IF p_role='owner' THEN
    IF EXISTS(SELECT 1 FROM public.companies WHERE id=p_company AND owner_id IS NOT NULL AND owner_id<>p_user)
      THEN RAISE EXCEPTION 'SCHOOL_OWNER_EXISTS' USING ERRCODE='23505'; END IF;
    UPDATE public.companies SET owner_id=p_user,email=coalesce(email,(SELECT email FROM auth.users WHERE id=p_user)) WHERE id=p_company;
  ELSIF p_role='member' THEN
    INSERT INTO public.school_portal_members(company_id,user_id,role) VALUES(p_company,p_user,'member') ON CONFLICT DO NOTHING;
  ELSE RAISE EXCEPTION 'INVALID_ROLE' USING ERRCODE='22023'; END IF;
END $$;

DO $$
BEGIN
  IF to_regprocedure('public.school_create_portal_manual(text,text,text,text,bigint)') IS NULL THEN
    ALTER FUNCTION public.school_create_portal(text,text,text,text,bigint) RENAME TO school_create_portal_manual;
  END IF;
END $$;
CREATE OR REPLACE FUNCTION public.school_create_portal(p_name text,p_email text,p_first text,p_last text,p_request bigint DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF EXISTS(SELECT 1 FROM public.ecoles_partenaires WHERE public.partner_portal_key(school_name)=public.partner_portal_key(p_name)) THEN
    RAISE EXCEPTION 'PARTNER_PORTAL_ALREADY_EXISTS' USING ERRCODE='23505';
  END IF;
  RETURN public.school_create_portal_manual(p_name,p_email,p_first,p_last,p_request);
END $$;

REVOKE ALL ON FUNCTION public.partner_portal_key(text),public.ensure_partner_portal(text),
  public.partner_portal_assign(),public.partner_portal_sync_link(),public.partner_portal_guard_link(),
  public.partner_portal_registration(),
  public.school_create_portal(text,text,text,text,bigint) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.school_create_portal(text,text,text,text,bigint) TO service_role;
REVOKE INSERT(partner_school_key),UPDATE(partner_school_key) ON public.companies FROM PUBLIC,anon,authenticated;
REVOKE INSERT(portal_company_id),UPDATE(portal_company_id) ON public.ecoles_partenaires FROM PUBLIC,anon,authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
