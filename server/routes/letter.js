import express from 'express'
import dotenv from 'dotenv'
import nodemailer from 'nodemailer'
import { supabase, supabaseAdmin } from '../config/supabase.js'
import { authenticateToken, optionalAuth } from '../middleware/auth.js'

dotenv.config()

const router = express.Router()

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i
const REQUIRED_SMTP_ENV = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASSWORD']
const missingSmtpEnv = REQUIRED_SMTP_ENV.filter((key) => !process.env[key])

if (missingSmtpEnv.length) {
  console.warn('Letter route SMTP configuration missing environment variables:', missingSmtpEnv.join(', '))
}

const smtpPort = Number(process.env.SMTP_PORT || 0)
const inferredSecure = smtpPort === 465
const useSecure = process.env.SMTP_SECURE
  ? process.env.SMTP_SECURE.toLowerCase() === 'true'
  : inferredSecure

let transporter = null

async function resolveTransporter() {
  if (!transporter) {
    if (missingSmtpEnv.length) {
      throw new Error('SMTP configuration is incomplete. Missing environment variables.')
    }

    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: smtpPort || 465,
      secure: useSecure,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASSWORD
      }
    })

    try {
      await transporter.verify()
    } catch (error) {
      console.warn('SMTP transporter verification failed:', error.message)
    }
  }

  return transporter
}

// GET /api/letter/suggest?q=...&type=metier|formation
// Suggest from metiers_france (intitule) or formations_france (nm)
router.get('/suggest', optionalAuth, async (req, res) => {
  try {
    const { q = '', type } = req.query
    const db = supabaseAdmin || supabase

    if (!q || q.length < 2) {
      return res.json({ items: [] })
    }

    if (type === 'formation') {
      const { data, error } = await db
        .from('formations_france')
        .select('id, nm')
        .ilike('nm', `%${q}%`)
        .limit(10)

      if (error) return res.status(400).json({ error: error.message })

      return res.json({
        items: (data || []).map((r) => ({ id: r.id, label: r.nm, type: 'formation' }))
      })
    }

    // default: metier
    const { data, error } = await db
      .from('metiers_france')
      .select('id, intitule')
      .ilike('intitule', `%${q}%`)
      .limit(10)

    if (error) return res.status(400).json({ error: error.message })

    res.json({
      items: (data || []).map((r) => ({ id: r.id, label: r.intitule, type: 'metier' }))
    })
  } catch (e) {
    console.error('suggest error', e)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// POST /api/letter/generate
// body: { selection?: {id, label, type}, style?: 'sobre'|'enthousiaste'|'professionnel' }
router.post('/generate', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id
    const { selection, style = 'sobre' } = req.body || {}
    const db = supabaseAdmin || supabase

    const geminiApiKey = process.env.GEMINI_API_KEY
    if (!geminiApiKey) {
      return res.status(500).json({ error: 'GEMINI_API_KEY manquant' })
    }

    // Fetch profile and results context
    const [{ data: profile, error: pErr }, { data: results, error: rErr }] = await Promise.all([
      db.from('profiles').select('*').eq('id', userId).single(),
      db.from('user_results').select('*').eq('user_id', userId).order('updated_at', { ascending: false }).limit(1).maybeSingle?.() || db.from('user_results').select('*').eq('user_id', userId).limit(1) // fallback for environments without maybeSingle
    ])

    if (pErr) {
      console.warn('Profile fetch warning:', pErr.message)
    }

    let lastResult = null
    if (Array.isArray(results)) {
      lastResult = results[0] || null
    } else if (results && typeof results === 'object') {
      lastResult = results
    }

    // If selection not provided, try to deduce from request for backward compatibility
    let targetText = ''
    let targetType = selection?.type
    if (selection?.label) {
      targetText = selection.label
    } else if (req.body.emploi_selection) {
      targetText = req.body.emploi_selection
      targetType = 'metier'
    } else if (req.body.formation_selection) {
      targetText = req.body.formation_selection
      targetType = 'formation'
    }

    // Build prompt
    const styleText =
      style === 'enthousiaste' ? 'Ton ton est positif et motivant.' :
      style === 'professionnel' ? 'Ton ton est formel et concis.' :
      'Ton ton est sobre et clair.'

    const profileBrief = {
      id: profile?.id,
      full_name: profile?.full_name || profile?.username,
      email: profile?.email,
      city: profile?.city || profile?.location,
      phone: profile?.phone,
      birthdate: profile?.birthdate,
      experiences: profile?.experiences || profile?.institution_data?.experiences || [],
      skills: profile?.skills || profile?.institution_data?.skills || [],
      interests: profile?.interests || profile?.institution_data?.interests || [],
      education: profile?.education || profile?.institution_data?.education || [],
    }

    const resultsBrief = lastResult?.skills_data || lastResult?.analysis || null

    const system = `Tu es un assistant RH francophone. Tu rédiges des lettres de motivation personnalisées en une page maximum (300-400 mots), structurées (en-tête, objet, introduction, corps, conclusion, formule de politesse), sans texte placeholder. ${styleText}`

    const targetLine = targetType === 'formation'
      ? `Objectif: candidature à la formation « ${targetText} ».`
      : `Objectif: candidature pour le métier « ${targetText} ».`

    const context = {
      user_profile: profileBrief,
      user_results: resultsBrief,
      selection: { type: targetType || 'metier', label: targetText },
      preferences: { style },
    }

    const parts = [
      { text: `[Système]\n${system}` },
      { text: `[Contexte JSON]\n${JSON.stringify(context, null, 2)}` },
      { text: `[Consigne]\n${targetLine}\nRédige la lettre entière en français. Personnalise à partir du profil et des résultats, sans inventer de diplômes. Utilise des puces avec parcimonie. Retourne uniquement la lettre, pas d'explication.` },
    ]

    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiApiKey}`
    const resp = await fetch(geminiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts }] })
    })

    if (!resp.ok) {
      const t = await resp.text()
      console.error('Gemini letter error:', t)
      return res.status(500).json({ error: 'Erreur IA' })
    }

    const data = await resp.json()
    const letter = data?.candidates?.[0]?.content?.parts?.[0]?.text || ''

    // Optionally store the last letter in user_results.extra
    try {
      await db.from('user_results').upsert({
        user_id: userId,
        questionnaire_type: 'inscription',
        extra: { ...(lastResult?.extra || {}), last_letter: { target: targetText, type: targetType, style, at: new Date().toISOString() } },
        updated_at: new Date().toISOString()
      }, { onConflict: 'user_id,questionnaire_type' })
    } catch (e) {
      // ignore storage errors
    }

    res.json({ letter })
  } catch (e) {
    console.error('letter generate error', e)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// POST /api/letter/future
// body: { content: string, sendAt?: ISO string }
router.post('/future', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id
    const userEmail = req.user.email
    const { content, sendAt } = req.body || {}

    if (!content || typeof content !== 'string' || content.trim().length === 0) {
      return res.status(400).json({ error: 'content is required' })
    }

    if (!userEmail || !EMAIL_REGEX.test(userEmail)) {
      return res.status(400).json({ error: 'Invalid user email' })
    }

    let sendAtDate = sendAt ? new Date(sendAt) : new Date()
    if (Number.isNaN(sendAtDate.getTime())) {
      return res.status(400).json({ error: 'Invalid sendAt date' })
    }

    if (!sendAt) {
      sendAtDate.setFullYear(sendAtDate.getFullYear() + 5)
    }

    const db = supabaseAdmin || supabase
    const { error: insertError } = await db
      .from('user_letter')
      .insert({
        user_id: userId,
        email: userEmail,
        content: content.trim(),
        send_at: sendAtDate.toISOString(),
        status: 'scheduled'
      })

    if (insertError) {
      console.error('user_letter insert error', insertError)
      return res.status(400).json({ error: insertError.message })
    }

    // Optional confirmation email (SMTP / Resend)
    if (missingSmtpEnv.length === 0) {
      try {
        const mailTransporter = await resolveTransporter()
        const fromAddress = process.env.EMAIL_FROM || 'Zélia <no-reply@zelia.io>'
        const displayDate = sendAtDate.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })

        await mailTransporter.sendMail({
          from: fromAddress,
          to: userEmail,
          subject: 'Ta lettre pour dans 5 ans est programmée 🎉',
          text: `Ta lettre a bien été enregistrée. Tu la recevras le ${displayDate}.`,
          html: `<p>Ta lettre a bien été enregistrée.</p><p>Tu la recevras le <strong>${displayDate}</strong>.</p>`
        })
      } catch (mailError) {
        console.warn('Letter confirmation email failed:', mailError)
      }
    }

    res.json({ success: true })
  } catch (e) {
    console.error('letter future error', e)
    res.status(500).json({ error: 'Internal server error' })
  }
})

export default router
