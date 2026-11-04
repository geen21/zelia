import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { zipSync, strToU8 } from 'fflate'
import { PGlite } from '@electric-sql/pglite'
import { readRomeArchive, buildRomeCatalog, romeEditorialContext } from '../utils/romeCatalog.js'
import { metierEditorialContext } from '../utils/metierEditorialSources.js'
import { canonicalMetier } from '../utils/metierPages.js'
import { budgetUsage, selectBudgetedBatch, openGenerationCounter } from '../utils/metierBatchWorkflow.js'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { detailedMetierFixture } from '../../client/scripts/fixtures/metiers.mjs'
import { hasMalformedMetierWord } from '../../client/src/lib/metierContent.js'

function fiche(code, title) {
  return {
    rome: { code_rome: code, intitule: title },
    definition: 'Travaille avec une équipe et prépare les opérations propres à son activité.',
    acces_metier: 'Vérifier le parcours adapté auprès des établissements compétents.',
    appellations: [{ libelle: title }],
    competences: { savoir_faire: { enjeux: [{ libelle: 'Production', items: [{ libelle: 'Contrôler la qualité', coeur_metier: 'Principale' }] }] } },
    contextes_travail: [{ libelle: 'Horaires', items: [{ libelle: 'Travail en journée' }] }]
  }
}

function archive(fiches) {
  const json = JSON.stringify(fiches)
  return zipSync({
    'unix_fiche_emploi_metier_v462.json': Uint8Array.from([...json].map((char) =>
      ({ 'Œ': 0xbc, 'œ': 0xbd, '€': 0xa4 })[char] ?? char.charCodeAt(0))),
    'unix_referentiel_code_rome_v462.json': strToU8(JSON.stringify(fiches.map((page) => page.rome))),
    'version.txt': strToU8('Numero de version : 62\nDate de publication : 19/10/2026\n')
  })
}

test('ROME import decodes official legacy encoding and requires unique complete fiche codes', () => {
  const reference = readRomeArchive(archive([fiche('A1201', 'Bûcheron')]))
  assert.equal(reference.byCode.get('A1201').rome.intitule, 'Bûcheron')
  assert.equal(reference.encodings.fiches, 'iso-8859-15')
  assert.equal(reference.publishedAt, '2026-10-19')
  assert.throws(() => readRomeArchive(archive([fiche('A1201', 'A'), fiche('A1201', 'B')])), /dupliqué/)
  assert.throws(() => readRomeArchive(zipSync({ 'wrong.json': strToU8('{}') })), /Version/)
  const context = romeEditorialContext(reference, reference.byCode.get('A1201'), '2026-11-04')
  assert.ok(context.sources[0].facts.some((fact) => fact.includes('Contrôler la qualité')))
  assert.ok(context.sources[0].facts.some((fact) => fact.includes('Travail en journée')))
  assert.equal(metierEditorialContext({ editorial_context: context }).publicSources.length, 2)
})

test('one page per represented ROME preserves pilot URLs without trusting misclassified ad titles', () => {
  const reference = readRomeArchive(archive([
    fiche('M1203', 'Comptable'), fiche('M1211', 'Expert-comptable'), fiche('E1205', 'Designer graphique')
  ]))
  const pilot = { ...canonicalMetier('Collaborateur comptable junior'), content: { version: 2 }, rome_codes: ['M1211'] }
  const inventory = [
    { rome_code: 'M1203', source_count: 7, aliases: ['Comptable H/F'] },
    { rome_code: 'M1211', source_count: 3, aliases: ['Collaborateur comptable junior'] }
  ]
  const pages = buildRomeCatalog(reference, inventory, [pilot], '2026-11-04')
  assert.equal(pages.length, 2)
  assert.equal(pages[0].id, pilot.id)
  assert.equal(pages[0].slug, pilot.slug)
  assert.equal(pages[0].rome_code, 'M1203')
  assert.equal(pages[1].title, 'Expert-comptable')
  assert.notEqual(pages[1].id, pilot.id)
  assert.ok(!JSON.stringify(pages[1].editorial_context).includes('Collaborateur comptable junior'))
  assert.throws(() => buildRomeCatalog(reference, [{ ...inventory[0], rome_code: 'Z9999' }], [], '2026-11-04'), /absents/)
  assert.throws(() => buildRomeCatalog(reference, [inventory[0], inventory[0]], [], '2026-11-04'), /dupliqué/)
  const longReference = readRomeArchive(archive([fiche('A1201', `${'A'.repeat(81)} travaux`)]))
  const [longPage] = buildRomeCatalog(longReference, [{ rome_code: 'A1201', source_count: 1, aliases: ['Titre'] }], [], '2026-11-04')
  assert.match(longPage.slug, /^[a-z0-9]+(?:-[a-z0-9]+)*$/)
})

test('Latin-9 ligatures are correct and encoding repairs reuse only validated unchanged articles', () => {
  const record = fiche('A1101', 'Conducteur')
  record.definition = 'Met en œuvre les opérations et contrôle leur qualité.'
  const bytes = archive([record])
  const legacy = readRomeArchive(bytes, { legacyWindows1252: true })
  const reference = readRomeArchive(bytes)
  const inventory = [{ rome_code: 'A1101', source_count: 1, aliases: ['Conducteur H/F'] }]
  const [previous] = buildRomeCatalog(legacy, inventory, [], '2026-11-04')
  const page = { ...previous, content: detailedMetierFixture().content,
    content_reference_version: legacy.version, content_updated_at: '2026-11-04T10:00:00Z' }
  const [repaired] = buildRomeCatalog(reference, inventory, [page], '2026-11-04', { repairFromVersion: legacy.version })
  assert.equal(repaired.content_reference_version, reference.version)
  assert.ok(!('content' in repaired) && !('content_updated_at' in repaired), 'Keep original text and generation date')
  const [invalid] = buildRomeCatalog(reference, inventory, [{
    ...page, content: { ...page.content, summary: 'Met en ½uvre des opérations.' }
  }], '2026-11-04', { repairFromVersion: legacy.version })
  assert.equal(invalid.content_reference_version, legacy.version)
  const oenologue = readRomeArchive(archive([fiche('A1101', 'Œnologue')]))
  assert.equal(oenologue.byCode.get('A1101').rome.intitule, 'Œnologue')
  assert.ok(hasMalformedMetierWord('¼nologue') && hasMalformedMetierWord('main-d’½uvre'))
  assert.ok(!hasMalformedMetierWord('une ½ journée') && !hasMalformedMetierWord('Œnologue'))
})

test('additive ROME migration raises only the approved cap and preserves accounting and private access', async () => {
  const db = new PGlite()
  try {
    await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
      CREATE TABLE public.metiers_france(id text, intitule text, romecode text);
      GRANT SELECT ON public.metiers_france TO service_role;
      INSERT INTO public.metiers_france VALUES ('1','Comptable H/F','M1203'),('2','Comptable H/F','M1203'),('3','Expert comptable','M1211');`)
    await db.exec(readFileSync(new URL('../database/migration_metier_pages.sql', import.meta.url), 'utf8'))
    await db.exec(`INSERT INTO seo.metier_generation_requests(id,mode,state,reserved_usd,actual_usd,items)
      VALUES ('11111111-1111-4111-8111-111111111111','standard','settled',0.02,0.01,'[{"id":"pilot"}]');`)
    const migration = readFileSync(new URL('../database/migration_metier_catalog_rome.sql', import.meta.url), 'utf8')
    await db.exec(migration)
    await db.exec(migration)
    await db.exec('SET ROLE service_role')
    assert.equal(Number((await db.query('SELECT limit_usd FROM seo.metier_generation_budget')).rows[0].limit_usd), 3)
    assert.equal(Number((await db.query('SELECT actual_usd FROM seo.metier_generation_requests')).rows[0].actual_usd), 0.01)
    await db.query('SELECT seo.refresh_metier_inventory()')
    const inventory = (await db.query('SELECT * FROM seo.metier_rome_inventory()')).rows
    assert.equal(inventory.length, 2)
    assert.equal(Number(inventory[0].source_count), 2)
    assert.deepEqual(inventory[0].aliases, ['Comptable H/F'])
    await db.exec('RESET ROLE; SET ROLE anon')
    await assert.rejects(db.query('SELECT * FROM seo.metier_catalog_state'), /permission denied/)
    await assert.rejects(db.query('SELECT * FROM seo.metier_rome_inventory()'), /permission denied/)
    await db.exec('RESET ROLE')
    assert.equal((await db.query('SELECT count(*)::int count FROM public.metiers_france')).rows[0].count, 3)
  } finally { await db.close() }
})

test('budgeted batches include active reservations and handle exact decimal limits', () => {
  const usage = budgetUsage([{ actual_usd: 0.1, reserved_usd: 0.2 }, { actual_usd: null, reserved_usd: 0.3 }])
  assert.deepEqual(usage, { spent: 0.1, reserved: 0.3, committed: 0.4 })
  const prepared = [{ id: 'a', maxCost: 0.1 }, { id: 'b', maxCost: 0.2 }, { id: 'c', maxCost: 0.1 }]
  assert.deepEqual(selectBudgetedBatch(prepared, 0.3).map((item) => item.id), ['a', 'b'])
  assert.equal(selectBudgetedBatch(prepared, 0.05).length, 0)
  assert.equal(selectBudgetedBatch(prepared, 3, 1).length, 1)
})

test('token counts survive restart but are invalidated when the request changes', async () => {
  const temp = await mkdtemp(resolve(tmpdir(), 'zelia-rome-counts-'))
  const file = resolve(temp, 'counts.json')
  let calls = 0
  const provider = { async count() { calls += 1; return 123 } }
  const page = { id: 'a'.repeat(64) }
  const request = { contents: [{ parts: [{ text: 'Public career facts' }] }] }
  try {
    let counter = await openGenerationCounter(file, provider)
    assert.equal(await counter.countTokens(request, page), 123)
    assert.equal(await counter.countTokens(request, page), 123)
    assert.equal(calls, 1)
    await counter.save()
    counter = await openGenerationCounter(file, provider)
    await counter.countTokens(request, page)
    assert.equal(calls, 1)
    await counter.countTokens({ ...request, changed: true }, page)
    assert.equal(calls, 2)
    await counter.save()
    await writeFile(file, '{"schemaVersion":1,"entries":[{"id":"invalid","hash":"bad","inputTokens":-1}]}')
    await assert.rejects(openGenerationCounter(file, provider), /invalide/)
  } finally { await rm(temp, { recursive: true }) }
})
