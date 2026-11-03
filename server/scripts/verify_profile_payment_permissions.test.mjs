import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { PGlite } from '@electric-sql/pglite'

const user = '11111111-1111-4111-8111-111111111111'
const other = '22222222-2222-4222-8222-222222222222'
const protectedValues = {
  has_paid: 'true',
  stripe_customer_id: "'cus_fake'",
  stripe_last_checkout_id: "'cs_fake'",
  stripe_last_payment_at: "'2026-01-01'::timestamptz"
}

for (const freshSetup of [false, true]) {
  test(`profile billing columns: ${freshSetup ? 'fresh setup' : 'replayable migration'}, RLS and service-role writes`, async () => {
    const db = new PGlite()
    try {
      const setup = await readFile(new URL('../database/setup.sql', import.meta.url), 'utf8')
      const migration = await readFile(new URL('../database/security_payment_profile_columns.sql', import.meta.url), 'utf8')
      await db.exec(`
        CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
        CREATE SCHEMA auth;
        GRANT USAGE ON SCHEMA public, auth TO anon, authenticated, service_role;
        CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
          AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
        CREATE TABLE auth.users(id uuid PRIMARY KEY);
        CREATE TABLE public.companies(id bigint PRIMARY KEY);
        INSERT INTO auth.users VALUES('${user}'),('${other}');
      `)
      await db.exec(setup.slice(setup.indexOf('CREATE TABLE IF NOT EXISTS public.profiles'), setup.indexOf('CREATE TABLE IF NOT EXISTS public.class_groups')))
      await db.exec(`
        ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
        ${setup.match(/CREATE POLICY "Users can (?:view|insert|update) their own profile"[^;]+;/g).join('\n')}
        GRANT SELECT, INSERT, UPDATE ON public.profiles TO PUBLIC, anon, authenticated;
        GRANT INSERT (has_paid), UPDATE (has_paid) ON public.profiles TO PUBLIC, anon, authenticated;
        INSERT INTO public.profiles(id,first_name) VALUES('${user}','Initial');
      `)
      const freshPermissions = setup.slice(setup.indexOf('-- Keep in sync with security_payment_profile_columns.sql'), setup.indexOf('CREATE POLICY "Company members can view company data"'))
      await db.exec(freshSetup ? freshPermissions : migration)
      await db.exec(freshSetup ? freshPermissions : migration)
      await db.exec('ALTER TABLE public.profiles ADD COLUMN future_sensitive text')
      await db.query("SELECT set_config('request.jwt.claim.sub', $1, false)", [user])
      await db.exec('SET ROLE authenticated')
      await db.exec(`UPDATE public.profiles SET first_name='Updated' WHERE id='${user}'`)
      assert.equal((await db.query('SELECT first_name FROM public.profiles')).rows[0].first_name, 'Updated')
      await db.exec(`INSERT INTO public.profiles(id,first_name) VALUES('${user}','Upsert')
        ON CONFLICT(id) DO UPDATE SET id=excluded.id, first_name=excluded.first_name`)
      for (const [column, value] of Object.entries(protectedValues)) {
        await assert.rejects(db.exec(`UPDATE public.profiles SET ${column}=${value} WHERE id='${user}'`), /permission denied/)
        await assert.rejects(db.exec(`INSERT INTO public.profiles(id,${column}) VALUES('${other}',${value})`), /permission denied/)
      }
      await assert.rejects(db.exec(`UPDATE public.profiles SET future_sensitive='untrusted'`), /permission denied/)
      await assert.rejects(db.exec(`INSERT INTO public.profiles(id,first_name) VALUES('${other}','Not mine')`), /row-level security/)
      await db.query("SELECT set_config('request.jwt.claim.sub', $1, false)", [other])
      assert.equal((await db.query('SELECT * FROM public.profiles')).rows.length, 0)
      await db.exec(`INSERT INTO public.profiles(id,first_name) VALUES('${other}','Own profile')`)
      assert.equal((await db.query('SELECT has_paid FROM public.profiles')).rows[0].has_paid, false)
      await db.exec('RESET ROLE; SET ROLE anon')
      await assert.rejects(db.exec(`UPDATE public.profiles SET first_name='Anonymous'`), /permission denied/)
      await assert.rejects(db.exec(`INSERT INTO public.profiles(id,has_paid) VALUES('${other}',true)`), /permission denied/)
      await db.exec('RESET ROLE; SET ROLE service_role')
      await db.exec(`UPDATE public.profiles SET has_paid=true,stripe_customer_id='cus_server',
        stripe_last_checkout_id='cs_server',stripe_last_payment_at=now() WHERE id='${user}'`)
      const result = await db.query(`SELECT has_paid,stripe_customer_id FROM public.profiles WHERE id='${user}'`)
      assert.deepEqual(result.rows[0], { has_paid: true, stripe_customer_id: 'cus_server' })
    } finally {
      await db.close()
    }
  })
}
