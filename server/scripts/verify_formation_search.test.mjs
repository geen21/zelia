import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { PGlite } from '@electric-sql/pglite'
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm'
import { unaccent } from '@electric-sql/pglite/contrib/unaccent'

const migration = await readFile(new URL('../database/rpc_search_formations.sql', import.meta.url), 'utf8')
const searchSql = migration.match(/RETURN QUERY EXECUTE \$search\$([\s\S]*?)\$search\$ USING/)?.[1]
const planNodes = (node) => [node, ...(node.Plans || []).flatMap(planNodes)]

test('formation search SQL: scoring, filters, pagination and indexed execution', async (t) => {
  const db = new PGlite({ extensions: { pg_trgm, unaccent } })
  t.after(() => db.close())
  await db.exec(`
    CREATE TABLE formation_france (
      id bigint PRIMARY KEY, nmc text, nm text[], etab_nom text, etab_uai text,
      region text, departement text, commune text, tc text, tf text[],
      fiche text, etab_url text, annee text, image text, email text, code_formation text
    );
  `)
  await db.exec(migration)
  await db.exec(migration)
  const search = async (keywords = null, query = null, department = null, region = null, limit = 20, offset = 0) =>
    (await db.query('SELECT * FROM search_formations($1,$2,$3,$4,$5,$6)',
      [keywords, department, region, limit, offset, query])).rows

  const fixtures = [
    { nm: ['Astronomie'], nmc: 'Master astronomie', tc: 'Master', code_formation: 'ASTRONOMIE' },
    { nm: ['Sciences'], nmc: 'Astronomie' },
    { code_formation: 'ASTRONOMIE' },
    { tc: 'Astronomie' },
    { etab_nom: 'Campus Astronomie' },
    { commune: 'Astronomie' },
    { departement: 'Astronomie' },
    { region: 'Astronomie' },
    { nm: ['Orbite'], nmc: 'spatiale' },
    { nmc: 'astronomie', nm: null, etab_nom: '', commune: null, departement: null, region: null },
    { nm: ['Astronomie'], etab_nom: '\u00c9cole primaire exemple' },
    { nm: ['Astronomie'], etab_nom: 'College exemple' },
    { nm: ['Astronomie'], etab_nom: 'Coll\u00e8ge exemple' },
    { nm: ['Astronomie'], etab_nom: 'Ecole primaire exemple' },
    { nm: ['Astronomie'], etab_nom: null },
    { nm: ['M\u00e9decine'], nmc: 'Sant\u00e9', commune: 'Lyon', departement: '69', region: 'Rhone' }
  ]
  for (const [index, overrides] of fixtures.entries()) {
    const row = {
      nm: [], nmc: '', tc: '', code_formation: '', etab_nom: 'Universite',
      commune: 'Paris', departement: '75', region: 'IDF', annee: '2024', ...overrides
    }
    await db.query(`INSERT INTO formation_france
      (id,nm,nmc,tc,code_formation,etab_nom,commune,departement,region,annee)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [index + 1, row.nm, row.nmc, row.tc, row.code_formation, row.etab_nom, row.commune, row.departement, row.region, row.annee])
  }

  // Independent reference retains the previous UNION-based score calculation.
  const reference = async (keywords, query, department, region) => (await db.query(`
    WITH eligible AS MATERIALIZED (
      SELECT * FROM formation_france f
      WHERE ($3::text IS NULL OR f.departement ILIKE '%' || $3 || '%' OR f.commune ILIKE '%' || $3 || '%')
        AND ($4::text IS NULL OR f.region ILIKE '%' || $4 || '%')
        AND LOWER(f.etab_nom) NOT LIKE ALL(ARRAY['%ecole primaire%', '%école primaire%', '%college %', '%collège %'])
    ), terms AS (SELECT unnest($1::text[]) term), matches AS (
      SELECT f.id, 120 weight FROM eligible f WHERE $2 <> ''
        AND formation_search_text(nm,nmc,tc,etab_nom,code_formation,commune,departement,region) LIKE '%' || $2 || '%'
      UNION ALL SELECT f.id, 90 FROM eligible f JOIN terms kt ON formation_nm_text(f.nm) ILIKE '%' || kt.term || '%'
      UNION ALL SELECT f.id, 65 FROM eligible f JOIN terms kt ON f.code_formation ILIKE '%' || kt.term || '%'
      UNION ALL SELECT f.id, 55 FROM eligible f JOIN terms kt ON f.tc ILIKE '%' || kt.term || '%'
      UNION ALL SELECT f.id, 45 FROM eligible f JOIN terms kt ON f.nmc ILIKE '%' || kt.term || '%'
      UNION ALL SELECT f.id, 35 FROM eligible f JOIN terms kt ON f.etab_nom ILIKE '%' || kt.term || '%'
      UNION ALL SELECT f.id, 20 FROM eligible f JOIN terms kt ON f.commune ILIKE '%' || kt.term || '%'
        OR f.departement ILIKE '%' || kt.term || '%' OR f.region ILIKE '%' || kt.term || '%'
      UNION ALL SELECT f.id, 18 FROM eligible f WHERE LENGTH($2) >= 4
        AND formation_search_text(nm,nmc,tc,etab_nom,code_formation,commune,departement,region) % $2
    )
    SELECT f.id, SUM(m.weight)::int score FROM matches m JOIN eligible f ON f.id=m.id
    GROUP BY f.id,f.annee ORDER BY SUM(m.weight) DESC,f.annee DESC NULLS LAST,f.id ASC
  `, [keywords, query, department, region])).rows

  await t.test('preserves all score weights, phrase matching, fuzzy matching and geography', async () => {
    for (const [keywords, query, department, region] of [
      [['astronomie'], 'astronomie', null, null],
      [['astronomie', 'master'], 'astronomie master', null, null],
      [[], 'astronomle', null, null],
      [[], 'orbite spatiale', null, null],
      [['astronomie'], 'astronomie', 'Paris', 'IDF'],
      [['astronomie'], 'astronomie', '75', null],
      [['m\u00e9decine'], 'm\u00e9decine', '69', 'Rhone'],
      [['75'], '75', null, null]
    ]) {
      const rows = await search(keywords, query, department, region)
      assert.deepEqual(rows.map(({ id, score }) => ({ id, score })), await reference(keywords, query, department, region))
      assert.ok(rows.every((row) => row.id < 11 || row.id > 15), 'Excluded schools must not return')
    }
    assert.ok((await search([], 'astronomle')).some((row) => row.id === 10 && row.score === 18), 'Fuzzy-only result')
    assert.ok((await search([], 'orbite spatiale')).some((row) => row.id === 9 && row.score >= 120), 'Phrase across fields')
    assert.deepEqual(Object.keys((await search(['astronomie']))[0]).sort(),
      ['id', 'nmc', 'nm', 'etab_nom', 'etab_uai', 'region', 'departement', 'commune', 'tc', 'tf',
        'fiche', 'etab_url', 'annee', 'image', 'email', 'code_formation', 'score'].sort())
  })

  await t.test('cleans inputs, clamps limits and supports browse and legacy calls', async () => {
    assert.deepEqual(await search([' ASTRONOMIE ', '', null, 'astronomie', 'a']), await search(['astronomie']))
    assert.deepEqual(await search(null, null, '', ''), await search())
    assert.deepEqual(await search(['astronomie'], null, null, null, 1, -1),
      (await search(['astronomie'])).slice(0, 1))
    assert.deepEqual(await search(['astronomie'], null, null, null, 0), (await search(['astronomie'])).slice(0, 1))
    assert.equal((await search([], null, null, null, null)).length, 11)
    assert.deepEqual(await search(null, "'; SELECT pg_sleep(10); --"), [])
    assert.deepEqual(await search(null, 'no_match_%'), [])
    const legacy = (await db.query("SELECT * FROM search_formations(ARRAY['astronomie'],NULL,NULL,20)")).rows
    assert.deepEqual(legacy, await search(['astronomie']))
    const simple = (await db.query("SELECT * FROM search_formations_simple('astronomie','75',10)")).rows
    assert.ok(simple.length > 0)
    assert.ok(simple.every((row) => row.departement === '75'))
    assert.ok((await search([], 'astronomie', 'not-a-place')).length === 0)
    const capped = await search(Array(11).fill('astronomie'))
    assert.deepEqual(capped, await search(['astronomie']))
  })

  await t.test('orders ties by year before pagination and does not truncate at 1000', async () => {
    await db.exec(`
      INSERT INTO formation_france(id,nm,nmc,etab_nom,annee)
      SELECT 10000+n,ARRAY['Catalogue'],'','Campus',CASE WHEN n>1150 THEN '2026' ELSE '2020' END
      FROM generate_series(1,1200) n;
    `)
    const first = await search(['catalogue'], null, null, null, 20)
    assert.deepEqual(first.map((row) => row.id), Array.from({ length: 20 }, (_, i) => 11151 + i))
    assert.equal((await search(['catalogue'], null, null, null, 120, 1000)).length, 120)
    assert.equal((await search(['catalogue'], null, null, null, 120, 1200)).length, 0)
    assert.equal((await search(['catalogue'], null, null, null, 999)).length, 120)
    const all = await search(['catalogue'], null, null, null, 120)
    assert.deepEqual(await search(['catalogue'], null, null, null, 20, 20), all.slice(20, 40))
  })

  await t.test('uses the combined GIN index and meets a five-second budget on selective and broad searches', async () => {
    await db.exec(`
      INSERT INTO formation_france(id,nm,nmc,tc,etab_nom,commune,departement,region,annee)
      SELECT 100000+n,ARRAY['Histoire'],'Formation '||md5(n::text),'Licence','Universite classique','Bordeaux','33','Aquitaine','2024'
      FROM generate_series(1,20000) n;
      ANALYZE formation_france;
    `)
    assert.ok(searchSql, 'The production query must be explainable')
    await db.exec(`PREPARE formation_search_plan(text[],text,text[],text,text,int,int) AS ${searchSql}`)
    const result = await db.query(`EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON)
      EXECUTE formation_search_plan(ARRAY['%astronomie%'],'astronomie',ARRAY['astronomie'],NULL,NULL,20,0)`)
    const plan = result.rows[0]['QUERY PLAN'][0]
    const nodes = planNodes(plan.Plan)
    assert.ok(nodes.some((node) => node['Index Name'] === 'idx_formation_france_search_text_trgm'))
    assert.ok(!nodes.some((node) => node['Node Type'] === 'Seq Scan' && node['Relation Name'] === 'formation_france'),
      'Selective candidate selection must not scan the whole catalogue')
    const times = []
    for (let i = 0; i < 8; i++) {
      const start = performance.now()
      const rows = await search(['astronomie'], 'astronomie', i % 2 ? 'Paris' : null)
      times.push(performance.now() - start)
      assert.ok(rows.length > 0)
    }
    t.diagnostic(`Selective RPC on ${21216} rows: max ${Math.max(...times).toFixed(1)}ms; EXPLAIN ${plan['Execution Time']}ms`)
    assert.ok(Math.max(...times) < 5000, 'Selective RPC must finish within the local five-second test budget')
    for (const keywords of [
      ['licence'],
      ['licence', 'histoire', 'formation', 'universite', 'bordeaux', 'aquitaine', 'sciences', 'lettres'],
      ['33']
    ]) {
      const start = performance.now()
      const rows = await search(keywords)
      const elapsed = performance.now() - start
      assert.equal(rows.length, 20)
      assert.ok(rows.every((row) => row.score > 0))
      assert.ok(elapsed < 5000, 'Broad RPC must finish within the local five-second test budget')
      t.diagnostic(`${keywords.length}-keyword broad RPC: ${elapsed.toFixed(1)}ms`)
    }
  })
})