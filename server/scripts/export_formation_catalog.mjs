import { writeFile } from 'node:fs/promises'
import { parseArgs } from 'node:util'
import { supabase, supabaseAdmin } from '../config/supabase.js'

const { values } = parseArgs({
  options: { limit: { type: 'string', default: '200' }, all: { type: 'boolean' }, output: { type: 'string' } }
})
const limit = Number(values.limit)
if (!Number.isSafeInteger(limit) || limit < 1 || limit > 10000) {
  throw new Error('--limit must be an integer between 1 and 10000; use --all for a full read-only snapshot.')
}

const db = supabaseAdmin || supabase
const rows = []
let total = null
try {
  while (values.all || rows.length < limit) {
    const size = values.all ? 1000 : Math.min(1000, limit - rows.length)
    const { data, error, count } = await db.from('formation_france')
      .select('*', rows.length ? {} : { count: 'exact' })
      .order('id', { ascending: true })
      .range(rows.length, rows.length + size - 1)
      .abortSignal(AbortSignal.timeout(30000))
    if (error) throw new Error(error.message)
    if (!Array.isArray(data)) throw new Error('Invalid catalogue snapshot response')
    if (total === null) total = count
    rows.push(...data)
    if (data.length < size || (total !== null && rows.length >= total)) break
  }
  const snapshot = {
    table: 'formation_france',
    extracted_at: new Date().toISOString(),
    consistency: 'Paginated read, not an atomic PostgreSQL transaction snapshot; validate original values before any future repair.',
    total_rows: total,
    complete: total !== null && rows.length === total,
    rows
  }
  if (new Set(rows.map((row) => String(row.id))).size !== rows.length) {
    throw new Error('Duplicate ids in snapshot; concurrent catalogue changes require a new snapshot.')
  }
  const json = JSON.stringify(snapshot, null, 2)
  if (values.output) await writeFile(values.output, json, { flag: 'wx' })
  else process.stdout.write(json)
} catch (error) {
  console.error('Read-only formation catalogue export failed:', error.message)
  process.exitCode = 1
}
