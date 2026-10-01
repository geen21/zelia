import { readFile, writeFile, mkdir, rename, chmod, rm } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import { ADMIN_EMAILS, getAdminIdentities } from '../config/backoffice.js'

const variables = ['BACKOFFICE_JORIS_USER_ID', 'BACKOFFICE_NICOLAS_USER_ID']

export async function resolveBackofficeIdentities(client) {
  const identities = []
  for (const email of ADMIN_EMAILS) {
    const matches = []
    let offset = 0
    let total = 0
    do {
      const { data, error } = await client.rpc('backoffice_users', { p_query: email, p_limit: 100, p_offset: offset })
      if (error) throw new Error(`Migration back-office absente ou inaccessible (${error.code || 'RPC'}). Aucun deploiement autorise.`)
      if (!Array.isArray(data?.items) || !Number.isSafeInteger(data.total) || data.total < 0) throw new Error('Reponse de verification des comptes invalide.')
      matches.push(...data.items.filter((user) => String(user.email || '').trim().toLowerCase() === email))
      total = data.total
      offset += 100
      if (offset < total && data.items.length !== 100) throw new Error('Pagination des comptes incomplete.')
    } while (offset < total)
    if (matches.length !== 1) throw new Error(`Un unique compte existant est requis pour ${email}. Aucun compte cree.`)
    const account = matches[0]
    if (account.is_suspended || account.sync_pending) throw new Error(`Compte bloque pour ${email}. Verification manuelle requise.`)
    const { data, error } = await client.auth.admin.getUserById(account.id)
    if (error || !data?.user || data.user.id !== account.id || String(data.user.email || '').trim().toLowerCase() !== email) {
      throw new Error(`Correspondance Auth non verifiee pour ${email}.`)
    }
    if (Date.parse(data.user.banned_until) > Date.now()) throw new Error(`Compte Auth bloque pour ${email}.`)
    identities.push({ id: account.id, email })
  }
  getAdminIdentities(Object.fromEntries(variables.map((name, index) => [name, identities[index].id])))
  return identities
}

export function configureBackofficeEnvironment(source, identities) {
  const environment = dotenv.parse(source)
  const values = Object.fromEntries(variables.map((name, index) => [name, identities[index]?.id]))
  const verified = getAdminIdentities(values)
  if (identities.some((identity, index) => identity.email !== ADMIN_EMAILS[index])) throw new Error('Identites admin inattendues.')
  const additions = []
  for (const [index, name] of variables.entries()) {
    const existing = String(environment[name] || '').trim().toLowerCase()
    if (existing && existing !== verified[index].id) throw new Error(`${name} est deja configure avec un autre UUID. Verification manuelle requise.`)
    if (!existing) additions.push(`${name}=${verified[index].id}`)
  }
  if (!additions.length) return source
  const newline = source.includes('\r\n') ? '\r\n' : '\n'
  return source + (source.endsWith('\n') ? '' : newline) + additions.join(newline) + newline
}

async function main() {
  const envPath = fileURLToPath(new URL('../.env', import.meta.url))
  const source = await readFile(envPath, 'utf8')
  const environment = dotenv.parse(source)
  if (!environment.SUPABASE_URL || !environment.SUPABASE_SERVICE_ROLE_KEY) throw new Error('SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont requis dans server/.env.')
  const client = createClient(environment.SUPABASE_URL, environment.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false }
  })
  const identities = await resolveBackofficeIdentities(client)
  const partnerCheck = await client.from('ecoles_partenaires').select('id,is_active,show_in_results,highlight_in_results,results_priority').limit(1)
  const resultCheck = await client.rpc('backoffice_results', { p_user_id: identities[0].id, p_limit: 1 })
  const growthCheck = await client.rpc('backoffice_student_growth', { p_days: 30 })
  const selectionsCheck = await client.rpc('backoffice_selections', { p_limit: 1 })
  if (partnerCheck.error || resultCheck.error || growthCheck.error || selectionsCheck.error) throw new Error('Migration back-office incomplete. Aucun deploiement autorise.')
  const updated = configureBackofficeEnvironment(source, identities)
  if (process.argv.includes('--check')) {
    console.log('Migration et identites Auth verifiees ; environnement non modifie.')
    return
  }
  if (updated !== source) {
    const backupDirectory = join(homedir(), '.zelia-backoffice-backups')
    await mkdir(backupDirectory, { recursive: true, mode: 0o700 })
    await chmod(backupDirectory, 0o700)
    await writeFile(join(backupDirectory, `server-env-${Date.now()}.backup`), source, { flag: 'wx', mode: 0o600 })
    const temporaryPath = `${envPath}.backoffice-${process.pid}.tmp`
    try {
      await writeFile(temporaryPath, updated, { flag: 'wx', mode: 0o600 })
      await rename(temporaryPath, envPath)
    } finally { await rm(temporaryPath, { force: true }) }
  }
  await chmod(envPath, 0o600)
  console.log('Deux administrateurs configures par UUID/email. Aucun compte ni mot de passe modifie.')
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1 })
}