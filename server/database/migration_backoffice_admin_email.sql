BEGIN;

DO $$
DECLARE target regprocedure;
BEGIN
  FOREACH target IN ARRAY ARRAY[
    'public.backoffice_change(uuid,text,text,jsonb,text)'::regprocedure,
    'public.backoffice_account_change(uuid,uuid,boolean,text,uuid)'::regprocedure
  ] LOOP
    EXECUTE replace(pg_get_functiondef(target::oid), 'nicolas.weigele@zelia.io', 'nicolas.wiegele@zelia.io');
  END LOOP;
END;
$$;

NOTIFY pgrst, 'reload schema';
COMMIT;