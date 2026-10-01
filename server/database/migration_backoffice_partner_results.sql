BEGIN;

ALTER TABLE public.ecoles_partenaires
  ADD COLUMN IF NOT EXISTS show_in_results boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS highlight_in_results boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS results_priority integer NOT NULL DEFAULT 0 CHECK (results_priority BETWEEN 0 AND 100);

DO $$
DECLARE definition text; revised text;
BEGIN
  definition := pg_get_functiondef('public.backoffice_change(uuid,text,text,jsonb,text)'::regprocedure);
  IF strpos(definition, 'show_in_results') = 0 THEN
    revised := replace(definition, $old$'link','contact_email','is_active'$old$, $new$'link','contact_email','is_active','show_in_results','highlight_in_results','results_priority'$new$);
    revised := replace(revised, 'contact_email,is_active)', 'contact_email,is_active,show_in_results,highlight_in_results,results_priority)');
    revised := replace(revised, $old$coalesce((p_patch->>'is_active')::boolean,true))$old$, $new$coalesce((p_patch->>'is_active')::boolean,true),coalesce((p_patch->>'show_in_results')::boolean,true),coalesce((p_patch->>'highlight_in_results')::boolean,true),coalesce((p_patch->>'results_priority')::int,0))$new$);
    revised := replace(revised, $old$is_active = CASE WHEN p_patch ? 'is_active' THEN (p_patch->>'is_active')::boolean ELSE is_active END$old$, $new$is_active = CASE WHEN p_patch ? 'is_active' THEN (p_patch->>'is_active')::boolean ELSE is_active END, show_in_results = CASE WHEN p_patch ? 'show_in_results' THEN (p_patch->>'show_in_results')::boolean ELSE show_in_results END, highlight_in_results = CASE WHEN p_patch ? 'highlight_in_results' THEN (p_patch->>'highlight_in_results')::boolean ELSE highlight_in_results END, results_priority = CASE WHEN p_patch ? 'results_priority' THEN (p_patch->>'results_priority')::int ELSE results_priority END$new$);
    IF strpos(revised, 'show_in_results = CASE') = 0 OR strpos(revised, 'contact_email,is_active,show_in_results,highlight_in_results,results_priority)') = 0 THEN
      RAISE EXCEPTION 'BACKOFFICE_FUNCTION_VERSION_MISMATCH';
    END IF;
    EXECUTE revised;
  END IF;
END;
$$;

NOTIFY pgrst, 'reload schema';
COMMIT;