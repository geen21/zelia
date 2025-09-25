import express from 'express'
import dotenv from 'dotenv'
import { supabase, supabaseAdmin } from '../config/supabase.js'
import { authenticateToken, optionalAuth } from '../middleware/auth.js'

dotenv.config()

const router = express.Router()

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
      }, { onConflict: 'user_id' })
    } catch (e) {
      // ignore storage errors
    }

    res.json({ letter })
  } catch (e) {
    console.error('letter generate error', e)
    res.status(500).json({ error: 'Internal server error' })
  }
})

export default router
