BEGIN;

CREATE OR REPLACE FUNCTION public.backoffice_student_growth(p_days int DEFAULT 30)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE result jsonb;
BEGIN
  IF p_days IS NULL OR p_days NOT IN (30,90,365) THEN
    RAISE EXCEPTION 'INVALID_PERIOD' USING ERRCODE = '22023';
  END IF;
  WITH bounds AS (
    SELECT (timezone('UTC', now())::date - (p_days - 1)) AS start_date,
      timezone('UTC', now())::date AS end_date
  ), students AS MATERIALIZED (
    SELECT (au.created_at AT TIME ZONE 'UTC')::date AS created_date
    FROM auth.users au
    WHERE au.created_at IS NOT NULL
      AND coalesce(lower(au.email),'') NOT IN ('joris.geerdes@21datas.ch','nicolas.wiegele@zelia.io')
      AND NOT EXISTS (SELECT 1 FROM public.companies company WHERE company.owner_id = au.id)
      AND NOT EXISTS (SELECT 1 FROM public.school_portal_members member WHERE member.user_id = au.id)
  ), opening AS (
    SELECT count(*) AS total FROM students, bounds WHERE created_date < start_date
  ), daily AS (
    SELECT created_date, count(*) AS registrations FROM students, bounds
    WHERE created_date BETWEEN start_date AND end_date GROUP BY created_date
  ), days AS (
    SELECT day::date AS date FROM bounds,
      generate_series(start_date::timestamp, end_date::timestamp, interval '1 day') AS day
  ), points AS (
    SELECT days.date, coalesce(daily.registrations,0) AS registrations,
      opening.total + sum(coalesce(daily.registrations,0)) OVER (ORDER BY days.date) AS total
    FROM days CROSS JOIN opening LEFT JOIN daily ON daily.created_date = days.date
  )
  SELECT jsonb_build_object(
    'periodDays',p_days,
    'totalStudents',(SELECT total FROM points ORDER BY date DESC LIMIT 1),
    'newStudents',(SELECT coalesce(sum(registrations),0) FROM points),
    'points',(SELECT jsonb_agg(jsonb_build_object('date',to_char(date,'YYYY-MM-DD'),'registrations',registrations,'total',total) ORDER BY date) FROM points)
  ) INTO result;
  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.backoffice_student_growth(int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.backoffice_student_growth(int) TO service_role;
NOTIFY pgrst, 'reload schema';
COMMIT;