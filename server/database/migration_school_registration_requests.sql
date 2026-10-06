BEGIN;

CREATE TABLE IF NOT EXISTS public.school_registration_requests (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  school_name text NOT NULL CHECK (length(trim(school_name)) BETWEEN 1 AND 500),
  email text NOT NULL CHECK (length(email) BETWEEN 1 AND 500 AND email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
  contact_first_name text NOT NULL CHECK (length(trim(contact_first_name)) BETWEEN 1 AND 500),
  contact_last_name text NOT NULL CHECK (length(trim(contact_last_name)) BETWEEN 1 AND 500),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS school_registration_requests_created_idx
  ON public.school_registration_requests (created_at DESC, id);

ALTER TABLE public.school_registration_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.school_registration_requests FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON public.school_registration_requests TO service_role;
REVOKE ALL ON SEQUENCE public.school_registration_requests_id_seq FROM PUBLIC, anon, authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.school_registration_requests_id_seq TO service_role;

COMMIT;
