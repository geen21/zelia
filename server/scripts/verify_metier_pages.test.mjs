import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { canonicalMetier, groupMetiers, generationRequest, MAX_OUTPUT_TOKENS, tokenCost, parseGeneration, readAllPages } from '../utils/metierPages.js'
import { MetierGemini, prepareMetiers, responseCost, submitMetierBatch, collectMetierBatch } from '../utils/metierGeneration.js'
import { validateMetierContent, validateMetierSnapshot, metierWordCount } from '../../client/src/lib/metierContent.js'
import { buildMetierDocuments, metierDataPath } from '../../client/src/pages/metiers/metierSeo.js'
import { metierFixture, metierSnapshot, detailedMetierFixture } from '../../client/scripts/fixtures/metiers.mjs'
import { metierEditorialContext } from '../utils/metierEditorialSources.js'

const response = (content = metierFixture().content) => ({
  candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(content) }] } }],
  usageMetadata: { promptTokenCount: 600, candidatesTokenCount: 400 }
})

test('canonical identities remove ad noise but preserve specialities and unknown ROME', () => {
  assert.equal(canonicalMetier('  ÉLECTRICIEN (H/F) CDI ').id, canonicalMetier('électricien').id)
  assert.equal(canonicalMetier('Agent / Agente de nettoyage (H/F)').id, canonicalMetier('Agent de nettoyage').id)
  assert.equal(canonicalMetier('Conducteur(trice) de ligne').id, canonicalMetier('Conducteur de ligne').id)
  assert.equal(canonicalMetier('Comptable clients (H/F/D)').id, canonicalMetier('Comptable clients').id)
  assert.equal(canonicalMetier('Développeur web en alternance').id, canonicalMetier('Développeur web').id)
  assert.match(canonicalMetier('Manœuvre gros œuvre').slug, /^[a-z0-9-]+$/)
  assert.equal(groupMetiers([
    { intitule: 'Agent / Agente de nettoyage' }, { intitule: 'Agente de nettoyage' }
  ]).groups.length, 1)
  assert.notEqual(canonicalMetier('Développeur web').id, canonicalMetier('Développeur embarqué').id)
  assert.ok(canonicalMetier('Assistant - secteur Paris 75').review)
  assert.throws(() => canonicalMetier('H/F'))
  const { groups, rejected } = groupMetiers([
    { id: '1', intitule: 'Développeur web H/F', romecode: 'M1805', source_count: 7 },
    { id: '2', intitule: 'développeur web', romecode: 'M1805', source_count: 2 },
    { id: '3', intitule: 'Développeur embarqué', romecode: 'M1805' },
    { id: '4', intitule: 'Métier sans classification', romecode: null },
    { id: '5', intitule: null }
  ])
  assert.equal(groups.length, 3)
  assert.equal(groups.find((page) => page.normalized_title === 'developpeur web').source_count, 9)
  assert.equal(rejected.length, 1)
  assert.equal(new Set(groups.map((page) => page.slug)).size, 3)
})

test('strict short content, AI context, minimal thinking and known token prices', () => {
  assert.deepEqual(parseGeneration(response()), metierFixture().content)
  assert.throws(() => validateMetierContent({ ...metierFixture().content, verdict: 'PEUT-ÊTRE' }))
  assert.throws(() => validateMetierContent({ ...metierFixture().content, explanation: 'Un. Deux. Trois.' }))
  assert.throws(() => validateMetierContent({ ...metierFixture().content, explanation: 'Ce métier ne disparaîtra jamais.' }))
  assert.throws(() => validateMetierContent({ ...metierFixture().content, summary: '<script>danger</script>' }))
  assert.throws(() => parseGeneration({ candidates: [{ finishReason: 'MAX_TOKENS' }] }))
  const request = generationRequest({ title: 'Infirmier', rome_codes: ['J1506'], entreprise_nom: 'PRIVATE', description: 'PRIVATE' })
  assert.ok(request.contents[0].parts[0].text.includes('intelligence artificielle'))
  assert.ok(!JSON.stringify(request).includes('PRIVATE'))
  assert.equal(request.generationConfig.thinkingConfig.thinkingLevel, 'MINIMAL')
  assert.equal(request.generationConfig.maxOutputTokens, MAX_OUTPUT_TOKENS)
  assert.equal(tokenCost('standard', 1000000, 1000000), 1.75)
  assert.equal(tokenCost('batch', 1000000, 1000000), 0.875)
  assert.equal(responseCost('batch', { maxCost: 0.1 }, {}), 0.1)
  assert.throws(() => tokenCost('pro', 100, 100))
})

test('provider uses exact cheap model, correct countTokens contract and never falls back', async () => {
  const paths = []
  const provider = new MetierGemini('test-only', async (url, options) => {
    paths.push(url)
    if (url.endsWith('countTokens')) {
      const body = JSON.parse(options.body)
      assert.equal(body.generateContentRequest.model, 'models/gemini-3.1-flash-lite')
      return Response.json({ totalTokens: 600 })
    }
    return Response.json({ supportedGenerationMethods: ['batchGenerateContent'] })
  })
  await provider.verify()
  const prepared = await prepareMetiers(provider, [{ id: 'x', title: 'Infirmier', rome_codes: [] }], 'batch')
  assert.equal(prepared[0].maxCost, tokenCost('batch', 600, MAX_OUTPUT_TOKENS))
  assert.ok(paths.every((path) => path.includes('gemini-3.1-flash-lite')))
  const denied = new MetierGemini('test-only', async () => new Response('', { status: 403 }))
  await assert.rejects(denied.verify(), /Aucun autre modèle/)
})

test('large catalogue has complete pagination, unique canonical routes and no full-catalogue page payload', () => {
  const snapshot = metierSnapshot(10017)
  validateMetierSnapshot(snapshot)
  const docs = [...buildMetierDocuments(snapshot)]
  const directory = docs.filter((doc) => doc.kind === 'directory')
  const detail = docs.filter((doc) => doc.kind === 'detail')
  assert.equal(detail.length, 10017)
  assert.equal(directory.flatMap((doc) => doc.entries).length, 10017)
  assert.equal(new Set(docs.map((doc) => doc.path)).size, docs.length)
  assert.ok(directory.every((doc) => doc.entries.length <= 36))
  assert.ok(detail.every((doc) => doc.related.length <= 4 && JSON.stringify(doc).length < 20000))
  assert.equal(metierDataPath('/metiers/'), '/metiers-data/index.json')
  assert.throws(() => metierDataPath('/metiers/../../secret/'))
  assert.throws(() => validateMetierSnapshot({ ...snapshot, totalCatalog: 10018 }))
})

test('keyset reads cross the Supabase row cap without using ad IDs or offset', async () => {
  const source = Array.from({ length: 2055 }, (_, i) => ({ id: String(i).padStart(6, '0') }))
  const db = { from(table) {
    assert.equal(table, 'metier_source_titles')
    let cursor = ''
    return { select() { return this }, order() { return this }, limit(limit) { assert.equal(limit, 1000); return this },
      gt(field, value) { assert.equal(field, 'id'); cursor = value; return this },
      then(resolve) { return resolve({ data: source.filter((row) => row.id > cursor).slice(0, 1000), error: null }) } }
  } }
  assert.deepEqual(await readAllPages(db, 'metier_source_titles', '*'), source)
})

test('database migration, restricted permissions, durable budget and atomic reservations', async () => {
  const db = new PGlite()
  try {
    await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
      CREATE TABLE public.metiers_france(id text, intitule text, romecode text);
      GRANT SELECT ON public.metiers_france TO service_role;
      INSERT INTO public.metiers_france VALUES (NULL, 'Electricien H/F', 'F1602'), (NULL, 'Electricien H/F', 'F1602'), ('a', 'Developpeur web', 'M1805');`)
    const migration = readFileSync(new URL('../database/migration_metier_pages.sql', import.meta.url), 'utf8')
    await db.exec(migration)
    await db.exec(migration)
    await db.exec('SET ROLE service_role')
    await db.query('SELECT seo.refresh_metier_inventory()')
    const { rows } = await db.query('SELECT * FROM seo.metier_source_titles')
    assert.equal(rows.length, 2)
    assert.equal(rows.reduce((sum, row) => sum + Number(row.source_count), 0), 3)
    const reserve = (id, cost, key = id, mode = 'standard') => db.query(
      'SELECT seo.reserve_metier_generation($1, $2, $3, $4)', [id, mode, cost, JSON.stringify([{ id: key }])])
    const a = '11111111-1111-4111-8111-111111111111'
    const b = '22222222-2222-4222-8222-222222222222'
    await reserve(a, 1.2, 'metier-a')
    await assert.rejects(reserve(b, 0.1, 'metier-a'), /already owns/)
    await assert.rejects(reserve(b, 0.9), /budget exceeded/)
    await assert.rejects(reserve(b, 0.1, 'metier-b', 'batch'), /Validate the sample/)
    await db.query("UPDATE seo.metier_generation_requests SET state='settled', actual_usd=0.8 WHERE id=$1", [a])
    await reserve(b, 1.2)
    await db.exec('RESET ROLE; SET ROLE anon')
    await assert.rejects(db.query('SELECT * FROM seo.metier_pages'), /permission denied/)
    await assert.rejects(db.query('SELECT seo.refresh_metier_inventory()'), /permission denied/)
    await db.exec('RESET ROLE')
    assert.equal((await db.query('SELECT count(*)::int AS count FROM public.metiers_france')).rows[0].count, 3)
    assert.equal((await db.query("SELECT count(*)::int AS count FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('metier_pages','metier_source_titles','metier_generation_budget','metier_generation_requests')")).rows[0].count, 0)
  } finally { await db.close() }
})

function batchDb(reservation, updates) {
  return {
    rpc: async () => ({ data: 1.9 }),
    from(table) {
      return { update(value) { updates.push({ table, value }); return this }, eq() { return this }, or() { return this },
        select() { return Promise.resolve({ data: [{ ...reservation, ...updates.at(-1).value }] }) },
        then(resolve) { resolve({ data: null, error: null }) } }
    }
  }
}

test('Batch persists ownership, submits actual Batch API and collects shuffled results by key', async () => {
  const page = { ...metierFixture(), title: 'Infirmier' }
  const item = { page, request: generationRequest({ ...page, rome_codes: page.romeCodes }), inputTokens: 600, maxCost: 0.001 }
  const updates = []
  const reservation = { id: 'reservation', items: [{ id: page.id, maxCost: 0.001 }], created_at: page.updatedAt, job_name: 'batches/test' }
  const db = batchDb(reservation, updates)
  await submitMetierBatch(db, { call: async (path, body) => {
    assert.ok(path.endsWith(':batchGenerateContent'))
    assert.equal(body.batch.inputConfig.requests.requests[0].metadata.key, page.id)
    return { name: 'batches/test' }
  } }, [item])
  assert.equal(updates[0].value.state, 'submitted')
  await collectMetierBatch(db, { getJob: async () => ({
    done: true, response: { inlinedResponses: { inlinedResponses: [{ metadata: { key: page.id }, response: response() }] } }
  }) }, reservation)
  assert.ok(updates.some((update) => update.table === 'metier_pages' && update.value.content?.verdict === 'OUI'))
  await assert.rejects(collectMetierBatch(db, { getJob: async () => ({
    done: true, response: { inlinedResponses: { inlinedResponses: [] } }
  }) }, reservation), /partiel/)
  await assert.rejects(collectMetierBatch(db, {}, { ...reservation, job_name: null }), /ne pas resoumettre/)
})

test('detailed content is 600–900 useful words with complete sections, real source keys and FAQ', () => {
  const content = detailedMetierFixture().content
  const validated = validateMetierContent(content)
  assert.ok(metierWordCount(validated) >= 600 && metierWordCount(validated) <= 900)
  assert.equal(validated.sections.length, 5)
  assert.equal(validated.faq.length, 3)
  assert.throws(() => validateMetierContent({ ...content, sections: content.sections.slice(1) }))
  assert.throws(() => validateMetierContent({ ...content, faq: [{ ...content.faq[0], sourceIds: ['invented-source'] }, ...content.faq.slice(1)] }))
  assert.throws(() => validateMetierContent({ ...content, sources: [{ ...content.sources[0], url: 'https://example.com/invented' }, content.sources[1]] }))
  assert.throws(() => validateMetierContent({ ...content, sections: content.sections.map((section) => ({ ...section, paragraphs: ['Trop court.', 'Encore trop court.'] })) }))
  const sources = metierEditorialContext({ title: 'Infirmier' }).publicSources
  const nurseContent = { ...content,
    sections: content.sections.map((section) => ({ ...section, sourceIds: ['rncp-infirmier'] })),
    sources: [{ ...content.sources[0], url: 'https://example.com/model-invented' }]
  }
  const parsed = parseGeneration(response(nurseContent), sources)
  assert.deepEqual(parsed.sources, sources, 'Source URLs must come from verified request metadata, never from model output')
  assert.throws(() => metierEditorialContext({ title: 'Métier sans documentation vérifiée' }), /Sources métier/)
  assert.throws(() => validateMetierSnapshot({ schemaVersion: 1, preview: false, totalCatalog: 1, pages: [metierFixture()] }), /fiche détaillée/)
})
