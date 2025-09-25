import { supabase, supabaseAdmin } from '../config/supabase.js'

export const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers['authorization']
  const token = authHeader && authHeader.split(' ')[1] // Bearer TOKEN

  if (!token) {
    return res.status(401).json({ error: 'Access token required' })
  }

  try {
  // Verify token with Supabase (prefer service client if available)
  const authClient = supabaseAdmin || supabase
  const { data: { user }, error } = await authClient.auth.getUser(token)
    
    if (error || !user) {
      return res.status(403).json({ error: 'Invalid or expired token' })
    }

    req.user = user
    next()
  } catch (error) {
    console.error('Token verification error:', error)
    return res.status(403).json({ error: 'Invalid token' })
  }
}

export const optionalAuth = async (req, res, next) => {
  const authHeader = req.headers['authorization']
  const token = authHeader && authHeader.split(' ')[1]

  if (token) {
    try {
  const authClient = supabaseAdmin || supabase
  const { data: { user }, error } = await authClient.auth.getUser(token)
      if (!error && user) {
        req.user = user
      }
    } catch (error) {
      // Ignore authentication errors for optional auth
    }
  }

  next()
}
