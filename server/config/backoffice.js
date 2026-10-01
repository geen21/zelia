export const ADMIN_EMAILS = Object.freeze([
  'joris.geerdes@21datas.ch',
  'nicolas.weigele@zelia.io'
])

export function getAdminIdentities(environment = process.env) {
  const identities = [
    { id: environment.BACKOFFICE_JORIS_USER_ID, email: ADMIN_EMAILS[0] },
    { id: environment.BACKOFFICE_NICOLAS_USER_ID, email: ADMIN_EMAILS[1] }
  ].map((identity) => ({ ...identity, id: String(identity.id || '').trim().toLowerCase() }))
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
  if (identities.some((identity) => !uuidPattern.test(identity.id)) || identities[0].id === identities[1].id) {
    throw new Error('BACKOFFICE_ADMIN_CONFIGURATION_REQUIRED')
  }
  return identities
}

export function isProtectedAdmin(userId) {
  return getAdminIdentities().some((identity) => identity.id === String(userId).toLowerCase())
}