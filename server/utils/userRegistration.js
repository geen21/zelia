const INVALID_PHONE_MESSAGE = 'Indique un numéro de téléphone valide ou laisse ce champ vide.'

export function normalizePhoneNumber(value) {
  return String(value ?? '')
    .replace(/[\u200E\u200F\u202A-\u202E\u2066-\u2069]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export function isValidOptionalPhoneNumber(value) {
  const normalized = normalizePhoneNumber(value)
  if (!normalized) return true
  const digits = normalized.replace(/\D/g, '')
  return /^[+\d\s().-]+$/.test(normalized) && digits.length >= 6 && digits.length <= 20
}

export function createRegisterHandler({ supabase, supabaseAdmin }) {
  return async (req, res) => {
    try {
      const { email, password, userData, avatarData, questionnaireResponses } = req.body || {}

      if (!email || !password) {
        return res.status(400).json({ error: 'Email and password are required' })
      }

      const rawPhoneNumber = userData?.numeroTelephone ?? userData?.numero_telephone ?? userData?.phone_number ?? ''
      const phoneNumber = normalizePhoneNumber(rawPhoneNumber)
      if (!isValidOptionalPhoneNumber(phoneNumber)) {
        return res.status(400).json({ error: INVALID_PHONE_MESSAGE })
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
        department_name: userData?.department_name || userData?.nom_departement || '',
        school: userData?.ecole || userData?.school || '',
        phone_number: phoneNumber,
        newsletter_opt_in: userData?.newsletter_opt_in || false,
        accept_data_transfer: userData?.accept_data_transfer || false,
        // Include avatar and questionnaire data in metadata for trigger function
        avatarData: avatarData || null,
        questionnaireResponses: questionnaireResponses || null
      }

      console.log('Creating user with metadata:', {
        ...userMetadata,
        phone_number: phoneNumber ? 'present' : '',
        avatarData: avatarData ? 'present' : 'null',
        questionnaireResponses: questionnaireResponses ? `${questionnaireResponses.length} responses` : 'null'
      })

      if (!supabaseAdmin?.auth?.admin) {
        return res.status(500).json({
          error: 'Supabase admin client is required to create accounts without email validation'
        })
      }

      const result = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: userMetadata
      })
      const data = { user: result.data?.user || null, session: null }
      const error = result.error

      if (error) {
        console.error('Supabase signup error:', error)
        return res.status(400).json({ error: error.message })
      }

      // If user was created successfully but data wasn't processed by trigger, store it manually as fallback
      if (data.user) {
        try {
          const userId = data.user.id
          const db = supabaseAdmin || supabase

          const { data: profileCheck } = await db
            .from('profiles')
            .select('id, phone_number, avatar_json')
            .eq('id', userId)
            .maybeSingle()

          const profileFallbackUpdates = {}
          if (avatarData && (!profileCheck || !profileCheck.avatar_json)) {
            profileFallbackUpdates.avatar_json = avatarData
            profileFallbackUpdates.avatar = avatarData.url || avatarData.provider || 'dicebear'
          }
          if (phoneNumber && (!profileCheck || !profileCheck.phone_number)) {
            profileFallbackUpdates.phone_number = phoneNumber
          }

          if (Object.keys(profileFallbackUpdates).length > 0) {
            const updatedAt = new Date().toISOString()
            const { error: profileFallbackError } = profileCheck
              ? await db
                .from('profiles')
                .update({
                  ...profileFallbackUpdates,
                  updated_at: updatedAt
                })
                .eq('id', userId)
              : await db
                .from('profiles')
                .upsert({
                  id: userId,
                  first_name: userMetadata.first_name,
                  last_name: userMetadata.last_name,
                  age: userMetadata.age,
                  gender: userMetadata.gender,
                  department: userMetadata.department,
                  school: userMetadata.school,
                  phone_number: userMetadata.phone_number,
                  ...profileFallbackUpdates,
                  updated_at: updatedAt
                })

            if (profileFallbackError) {
              console.error('Profile fallback storage error during registration:', profileFallbackError)
            }
          }

          // Check if questionnaire responses were stored by trigger
          const { data: responsesCheck } = await db
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
              const { error: responseError } = await db
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
        session: data.session,
        emailConfirmed: Boolean(supabaseAdmin?.auth?.admin)
      })
    } catch (error) {
      console.error('Registration error:', error)
      res.status(500).json({ error: 'Internal server error' })
    }
  }
}
