-- Apply after setup.sql. RLS protects rows, not their billing columns.
BEGIN;

REVOKE INSERT, UPDATE ON public.profiles FROM PUBLIC, anon, authenticated;
REVOKE INSERT (has_paid, stripe_customer_id, stripe_last_checkout_id, stripe_last_payment_at),
       UPDATE (has_paid, stripe_customer_id, stripe_last_checkout_id, stripe_last_payment_at)
    ON public.profiles FROM PUBLIC, anon, authenticated;

GRANT SELECT ON public.profiles TO authenticated;
GRANT INSERT (id, first_name, last_name, age, gender, department, school,
              phone_number, avatar, accent_color, home_preference,
              contact_preference, institution_data, avatar_json),
      UPDATE (id, first_name, last_name, age, gender, department, school,
              phone_number, avatar, accent_color, home_preference,
              contact_preference, institution_data, avatar_json)
    ON public.profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.profiles TO service_role;

COMMIT;
