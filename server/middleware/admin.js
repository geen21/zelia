import { getAdminIdentities } from '../config/backoffice.js'

export function createPlatformAdminGuard(resolveIdentities = getAdminIdentities) {
  return (req, res, next) => {
    res.set('Cache-Control', 'no-store')
    let identities
    try {
      identities = resolveIdentities()
    } catch {
      return res.status(503).json({ error: 'ADMIN_NOT_CONFIGURED', message: 'Le back-office n\'est pas encore configure.' })
    }
    if (!req.user) return res.status(401).json({ error: 'AUTH_REQUIRED' })
    const userId = String(req.user.id || '').toLowerCase()
    const email = String(req.user.email || '').trim().toLowerCase()
    if (!identities.some((identity) => identity.id === userId && identity.email === email)) {
      return res.status(403).json({ error: 'ADMIN_ACCESS_DENIED', message: 'Acces reserve aux administrateurs Zelia.' })
    }
    next()
  }
}

export const requirePlatformAdmin = createPlatformAdminGuard()