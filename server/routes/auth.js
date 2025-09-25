import express from 'express'
import { supabase } from '../config/supabase.js'

const router = express.Router()

// Register user
router.post('/register', async (req, res) => {
  try {
    const { email, password, userData, avatarData, questionnaireResponses } = req.body

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' })
    }

    // Prepare user metadata including avatar and questionnaire data
    const userMetadata = {
      email,
      profile_type: userData?.profile_type || 'student',
      // Map French field names to English
      first_name: userData?.prenom || userData?.first_name || '',
      last_name: userData?.nom || userData?.last_name || '',
      age: userData?.age || 18,
      gender: userData?.genre || userData?.gender || '',
      department: userData?.departement || userData?.department || '',
      school: userData?.ecole || userData?.school || '',
      phone_number: userData?.numeroTelephone || userData?.numero_telephone || userData?.phone_number || '',
      // Include avatar and questionnaire data in metadata for trigger function
      avatarData: avatarData || null,
      questionnaireResponses: questionnaireResponses || null
    }

    console.log('Creating user with metadata:', {
      ...userMetadata,
      avatarData: avatarData ? 'present' : 'null',
      questionnaireResponses: questionnaireResponses ? `${questionnaireResponses.length} responses` : 'null'
    })

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: userMetadata,
        emailRedirectTo: 'http://localhost:5173/' // This will redirect to the home page with hash parameters
      }
    })

    if (error) {
      console.error('Supabase signup error:', error)
      return res.status(400).json({ error: error.message })
    }

    // If user was created successfully but data wasn't processed by trigger, store it manually as fallback
    if (data.user) {
      try {
        const userId = data.user.id

        // Check if avatar data was stored by trigger
        const { data: profileCheck } = await supabase
          .from('profiles')
          .select('avatar_json')
          .eq('id', userId)
          .single()

        // Store avatar data if not already stored by trigger
        if (avatarData && (!profileCheck || !profileCheck.avatar_json)) {
          const { error: avatarError } = await supabase
            .from('profiles')
            .update({
              avatar_json: avatarData,
              avatar: avatarData.url || avatarData.provider || 'dicebear',
              updated_at: new Date().toISOString()
            })
            .eq('id', userId)
          
          if (avatarError) {
            console.error('Avatar storage error during registration:', avatarError)
          } else {
            console.log('Avatar data stored successfully as fallback')
          }
        }

        // Check if questionnaire responses were stored by trigger
        const { data: responsesCheck } = await supabase
          .from('user_responses')
          .select('id')
          .eq('user_id', userId)
          .limit(1)

        // Store questionnaire responses if not already stored by trigger
        if (questionnaireResponses && Array.isArray(questionnaireResponses) && questionnaireResponses.length > 0 && (!responsesCheck || responsesCheck.length === 0)) {
          const rows = questionnaireResponses
            .filter(r => r.question_id && r.answer)
            .map((r) => ({
              user_id: userId,
              question_id: Number(r.question_id),
              response: String(r.answer),
              questionnaire_type: 'inscription'
            }))

          if (rows.length > 0) {
            const { error: responseError } = await supabase
              .from('user_responses')
              .insert(rows)

            if (responseError) {
              console.error('Questionnaire storage error during registration:', responseError)
            } else {
              console.log(`Stored ${rows.length} questionnaire responses as fallback`)
            }
          }
        }
      } catch (storageError) {
        console.error('Additional data storage error:', storageError)
        // Don't fail registration if additional data storage fails
      }
    }

    res.status(201).json({
      message: 'User registered successfully',
      user: data.user,
      session: data.session
    })
  } catch (error) {
    console.error('Registration error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

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

    res.json({
      message: 'Login successful',
      user: data.user,
      session: data.session
    })
  } catch (error) {
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

    res.json({
      message: 'Token refreshed successfully',
      session: data.session
    })
  } catch (error) {
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

export default router
