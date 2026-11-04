import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { PGlite } from '@electric-sql/pglite'
import { buildFormationSlug } from '../utils/slug.js'
import { getFormationSlug, getFormationTitle, parseFormationIdFromParam } from '../../client/src/lib/formationDisplay.js'
import { createCanonicalManifest, publishCanonicalManifest, validateCanonicalManifest } from './pin_formation_urls.mjs'
import { attachFormationCanonicals, canonicalFormationColumns } from '../utils/formationCanonical.js'

const original = { id: 1, annee: '2025', gta: '20742', etab_uai: 'TEST', nmc: 'L1-Chimie', nm: null, fl: null, etab_nom: 'Université de Limoges', commune: 'Limoges' }
const enriched = { ...original, nm: ['Licence Chimie - Parcours Sciences Exactes et Appliquées'] }
const snapshot = { table: 'formation_france', complete: true, total_rows: 1, rows: [original] }
const manifest = createCanonicalManifest(snapshot, 'a'.repeat(64))

test('historical URL stays fixed while enriched content and new aliases remain usable', () => {
  const pinned = { ...enriched, canonical_slug: manifest.rows[0].slug }
  assert.equal(getFormationSlug(pinned), getFormationSlug(original))
  assert.equal(buildFormationSlug(pinned), getFormationSlug(original))
  assert.equal(getFormationTitle(pinned), enriched.nm[0])
  assert.equal(parseFormationIdFromParam(getFormationSlug(enriched)), '1')
  assert.throws(() => getFormationSlug({ ...pinned, canonical_slug: 'https://other.invalid/1' }), /Invalid persisted/)
  assert.throws(() => validateCanonicalManifest({ ...manifest, rows: [...manifest.rows, manifest.rows[0]] }), /Duplicate/)
})

test('migration and service-only backfill preserve metadata and never rotate an established URL', async () => {
  const db = new PGlite()
  try {
    await db.exec(`
      CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
      CREATE TABLE public.formation_france (
        id bigint PRIMARY KEY, annee text, gta text, etab_uai text,
        nmc text, nm text[], fl text[], etab_nom text, commune text
      );
      INSERT INTO public.formation_france VALUES
        (1,'2025','20742','TEST','L1-Chimie',ARRAY['Licence Chimie'],NULL,'Université de Limoges','Limoges');
    `)
    const migration = await readFile(new URL('../database/migration_formation_canonical_urls.sql', import.meta.url), 'utf8')
    await db.exec(migration)
    await db.exec(migration)
    assert.equal((await db.query('SELECT canonical_slug FROM formation_france')).rows[0].canonical_slug, null, 'Never auto-pin existing enriched titles')
    const run = (rows = manifest.rows) => db.query('SELECT public.pin_formation_canonical_urls($1::jsonb) AS result', [JSON.stringify(rows)])
    for (const invalid of [null, [], {}]) {
      await assert.rejects(run(invalid), /INVALID_CANONICAL_BATCH/)
    }
    assert.deepEqual((await run()).rows[0].result, { updated: 1, already: 0 })
    assert.deepEqual((await run()).rows[0].result, { updated: 0, already: 1 })
    const adapter = {
      from() {
        let ids = null
        let limit = null
        return {
          select() { return this },
          limit(value) { limit = value; return this },
          in(field, values) { assert.equal(field, 'id'); ids = values; return this },
          abortSignal() { return this },
          async then(resolve, reject) {
            try {
              const rows = ids
                ? (await db.query('SELECT id,canonical_slug FROM formation_france WHERE id = ANY($1::bigint[])', [ids])).rows
                : (await db.query('SELECT id,canonical_slug FROM formation_france LIMIT $1', [limit])).rows
              resolve({ data: rows, error: null })
            } catch (error) { reject(error) }
          }
        }
      },
      rpc(name, args) {
        assert.equal(name, 'pin_formation_canonical_urls')
        return { async abortSignal() {
          const result = await run(args.p_rows)
          return { data: result.rows[0].result, error: null }
        } }
      }
    }
    const progress = []
    assert.deepEqual(await publishCanonicalManifest(adapter, manifest, (row) => progress.push(row)),
      { updated: 0, already: 1, verified: 1 })
    assert.equal(progress.length, 1)
    await db.exec("UPDATE public.formation_france SET nm=ARRAY['Encore un titre enrichi'] WHERE id=1")
    const row = (await db.query('SELECT * FROM formation_france')).rows[0]
    assert.deepEqual(row.nm, ['Encore un titre enrichi'])
    assert.equal(row.canonical_slug, getFormationSlug(original))
    await assert.rejects(run([{ ...manifest.rows[0], slug: 'nouvelle-url-1' }]), /ALREADY_PINNED/)
    await assert.rejects(db.exec("UPDATE formation_france SET canonical_slug='autre-url-1' WHERE id=1"), /IMMUTABLE/)
    await assert.rejects(run([{ ...manifest.rows[0], gta: 'changed' }]), /IDENTITY_CHANGED/)
    await assert.rejects(run([{ ...manifest.rows[0], id: '2', slug: 'absente-2' }]), /IDENTITY_CHANGED/)
    await db.exec('SET ROLE anon')
    await assert.rejects(run(), /permission denied/)
    await db.exec('RESET ROLE; SET ROLE service_role')
    assert.deepEqual((await run()).rows[0].result, { updated: 0, already: 1 })
    await db.exec('RESET ROLE')
    await db.exec("INSERT INTO formation_france(id,nmc,etab_nom,commune) VALUES (2,'BTS-SIO','École Exemple','Lyon')")
    const added = (await db.query('SELECT * FROM formation_france WHERE id=2')).rows[0]
    assert.equal(added.canonical_slug, 'bts-sio-ecole-exemple-lyon-2')
    await db.exec("UPDATE formation_france SET nm=ARRAY['BTS Informatique enrichi'] WHERE id=2")
    assert.equal((await db.query('SELECT canonical_slug FROM formation_france WHERE id=2')).rows[0].canonical_slug, added.canonical_slug)
  } finally { await db.close() }
})

test('legacy RPC rows receive persisted slugs in one bounded lookup', async (t) => {
  const previous = process.env.FORMATION_CANONICAL_URLS_ENABLED
  process.env.FORMATION_CANONICAL_URLS_ENABLED = 'true'
  t.after(() => {
    if (previous === undefined) delete process.env.FORMATION_CANONICAL_URLS_ENABLED
    else process.env.FORMATION_CANONICAL_URLS_ENABLED = previous
  })
  assert.equal(canonicalFormationColumns('id,nm'), 'id,canonical_slug,nm')
  let requests = 0
  const db = {
    from(table) {
      assert.equal(table, 'formation_france')
      return {
        select(columns) { assert.equal(columns, 'id,canonical_slug'); return this },
        in(field, ids) { assert.equal(field, 'id'); assert.deepEqual(ids, [1]); return this },
        abortSignal() {
          requests++
          return Promise.resolve({ data: [{ id: 1, canonical_slug: manifest.rows[0].slug }], error: null })
        }
      }
    }
  }
  const rows = await attachFormationCanonicals(db, [enriched])
  assert.equal(getFormationSlug(rows[0]), getFormationSlug(original))
  assert.equal(requests, 1)
  await attachFormationCanonicals(db, rows)
  assert.equal(requests, 1, 'Already hydrated national queries add no lookup')
  await assert.rejects(attachFormationCanonicals(db, [{ ...enriched, canonical_slug: null }]), /backfill is incomplete/)
})

test('default rollout does not query an unavailable column before migration', async (t) => {
  const previous = process.env.FORMATION_CANONICAL_URLS_ENABLED
  delete process.env.FORMATION_CANONICAL_URLS_ENABLED
  t.after(() => { if (previous !== undefined) process.env.FORMATION_CANONICAL_URLS_ENABLED = previous })
  assert.equal(canonicalFormationColumns('id,nm'), 'id,nm')
  assert.deepEqual(await attachFormationCanonicals({ from() { assert.fail('No lookup before activation') } }, [enriched]), [enriched])
})

test('publication refuses a missing migration before calling its write RPC', async () => {
  const db = {
    from() {
      return {
        select() { return this },
        limit() { return Promise.resolve({ error: { message: 'canonical_slug does not exist' } }) }
      }
    },
    rpc() { assert.fail('No write before the required migration') }
  }
  await assert.rejects(publishCanonicalManifest(db, manifest), /Apply migration/)
})
