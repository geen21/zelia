import express from 'express'
import { supabase, supabaseAdmin } from '../config/supabase.js'
import { assertAccountActive } from '../utils/accountStatus.js'
import { createRegisterHandler } from '../utils/userRegistration.js'

const router = express.Router()

// Register user
router.post('/register', createRegisterHandler({ supabase, supabaseAdmin }))

// Login user
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' })
    }

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    })

    if (error) {
      return res.status(400).json({ error: error.message })
    }

    await assertAccountActive(supabaseAdmin, data.user.id)
    res.json({
      message: 'Login successful',
      user: data.user,
      session: data.session
    })
  } catch (error) {
    if (error.status) return res.status(error.status).json({ error: error.message })
    console.error('Login error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// Logout user
router.post('/logout', async (req, res) => {
  try {
    const { error } = await supabase.auth.signOut()

    if (error) {
      return res.status(400).json({ error: error.message })
    }

    res.json({ message: 'Logged out successfully' })
  } catch (error) {
    console.error('Logout error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// Refresh token
router.post('/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.body

    if (!refreshToken) {
      return res.status(400).json({ error: 'Refresh token is required' })
    }

    const { data, error } = await supabase.auth.refreshSession({
      refresh_token: refreshToken
    })

    if (error) {
      return res.status(400).json({ error: error.message })
    }

    await assertAccountActive(supabaseAdmin, data.user.id)
    res.json({
      message: 'Token refreshed successfully',
      session: data.session
    })
  } catch (error) {
    if (error.status) return res.status(error.status).json({ error: error.message })
    console.error('Token refresh error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// Reset password
router.post('/reset-password', async (req, res) => {
  try {
    const { email } = req.body

    if (!email) {
      return res.status(400).json({ error: 'Email is required' })
    }

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${process.env.CLIENT_URL}/reset-password`
    })

    if (error) {
      return res.status(400).json({ error: error.message })
    }

    res.json({ message: 'Password reset email sent' })
  } catch (error) {
    console.error('Password reset error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// Manual email confirmation (fallback)
router.post('/confirm-email', async (req, res) => {
  try {
    const { email } = req.body

    if (!email) {
      return res.status(400).json({ error: 'Email is required' })
    }

    if (!supabaseAdmin?.auth?.admin) {
      return res.status(500).json({ error: 'Supabase admin client is not configured' })
    }

    const admin = supabaseAdmin.auth.admin
    let user = null

    if (typeof admin.getUserByEmail === 'function') {
      const { data, error } = await admin.getUserByEmail(email)
      if (error) {
        return res.status(400).json({ error: error.message })
      }
      user = data?.user || null
    } else {
      const { data, error } = await admin.listUsers({ page: 1, perPage: 1000 })
      if (error) {
        return res.status(400).json({ error: error.message })
      }
      user = (data?.users || []).find(u => (u.email || '').toLowerCase() === email.toLowerCase()) || null
    }

    if (!user?.id) {
      return res.status(404).json({ error: 'User not found' })
    }

    const { error: updateError } = await admin.updateUserById(user.id, { email_confirm: true })
    if (updateError) {
      return res.status(400).json({ error: updateError.message })
    }

    res.json({ message: 'Email confirmed successfully' })
  } catch (error) {
    console.error('Manual email confirmation error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

export default router
