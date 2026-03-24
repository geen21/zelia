-- Security hardening migration for sensitive read policies.
-- Apply this in Supabase SQL editor or via your migration workflow.

DROP POLICY IF EXISTS "Authenticated users can view company data" ON public.companies;
CREATE POLICY "Company members can view company data" ON public.companies
  FOR SELECT USING (
    auth.uid() = owner_id
    OR EXISTS (
      SELECT 1
      FROM public.profiles AS profile
      WHERE profile.id = auth.uid()
        AND profile.company_id = companies.id
    )
  );

DROP POLICY IF EXISTS "Authenticated users can view class groups" ON public.class_groups;
CREATE POLICY "Company members can view class groups" ON public.class_groups
  FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM public.profiles AS profile
      WHERE profile.id = auth.uid()
        AND profile.company_id = class_groups.company_id
    )
    OR EXISTS (
      SELECT 1
      FROM public.companies AS company
      WHERE company.id = class_groups.company_id
        AND company.owner_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Authenticated users can view license links" ON public.license_links;
CREATE POLICY "Company members can view license links" ON public.license_links
  FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM public.profiles AS profile
      WHERE profile.id = auth.uid()
        AND profile.company_id = license_links.company_id
    )
    OR EXISTS (
      SELECT 1
      FROM public.companies AS company
      WHERE company.id = license_links.company_id
        AND company.owner_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Anyone can read global chat" ON public.global_chat;
CREATE POLICY "Authenticated users can read global chat" ON public.global_chat
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- Ensure authenticated users can still insert their own messages
DROP POLICY IF EXISTS "Authenticated users can insert their messages" ON public.global_chat;
CREATE POLICY "Authenticated users can insert their messages" ON public.global_chat
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Authenticated users can view custom formations" ON public.custom_formations;
CREATE POLICY "Company members can view custom formations" ON public.custom_formations
  FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM public.profiles AS profile
      WHERE profile.id = auth.uid()
        AND profile.company_id = custom_formations.company_id
    )
    OR EXISTS (
      SELECT 1
      FROM public.companies AS company
      WHERE company.id = custom_formations.company_id
        AND company.owner_id = auth.uid()
    )
  );