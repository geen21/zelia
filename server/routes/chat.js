import express from 'express'
import dotenv from 'dotenv'
import { authenticateToken } from '../middleware/auth.js'
import { supabaseAdmin, supabase as supabaseClient } from '../config/supabase.js'

dotenv.config()

const router = express.Router()

function buildDisplayName(message, profile) {
  const firstName = profile?.first_name?.trim()
  return {
    ...message,
    user_first_name: firstName || null,
    user_display_name: firstName || message.user_email || 'Utilisateur'
  }
}

async function enrichMessagesWithProfiles(db, messages) {
  if (!Array.isArray(messages) || messages.length === 0) {
    return []
  }

  const userIds = [...new Set(messages.map((message) => message?.user_id).filter(Boolean))]
  let profilesById = new Map()

  if (userIds.length > 0) {
    const { data: profiles, error: profileErr } = await db
      .from('profiles')
      .select('id, first_name')
      .in('id', userIds)

    if (profileErr) {
      throw profileErr
    }

    profilesById = new Map((profiles || []).map((profile) => [profile.id, profile]))
  }

  return messages.map((message) => buildDisplayName(message, profilesById.get(message.user_id)))
}

async function getChatMessageById(db, messageId) {
  const { data, error } = await db
    .from('global_chat')
    .select('id, user_id, user_email, content, created_at')
    .eq('id', messageId)
    .single()

  if (error) {
    throw error
  }

  const [message] = await enrichMessagesWithProfiles(db, [data])
  return message
}

router.get('/messages', authenticateToken, async (req, res) => {
  try {
    const requestedLimit = Number.parseInt(req.query.limit, 10)
    const limit = Number.isFinite(requestedLimit)
      ? Math.min(Math.max(requestedLimit, 1), 200)
      : 200

    const db = supabaseAdmin || supabaseClient
    const { data, error } = await db
      .from('global_chat')
      .select('id, user_id, user_email, content, created_at')
      .order('created_at', { ascending: true })
      .limit(limit)

    if (error) {
      console.error('Chat messages fetch error:', error)
      return res.status(500).json({ error: 'Erreur lors du chargement du chat' })
    }

    const messages = await enrichMessagesWithProfiles(db, data || [])
    res.json({ messages })
  } catch (e) {
    console.error('Chat messages route error:', e)
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

router.get('/messages/:id', authenticateToken, async (req, res) => {
  try {
    const db = supabaseAdmin || supabaseClient
    const message = await getChatMessageById(db, req.params.id)
    res.json({ message })
  } catch (e) {
    if (e?.code === 'PGRST116') {
      return res.status(404).json({ error: 'Message introuvable' })
    }

    console.error('Chat message fetch route error:', e)
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

// POST /api/chat/message  — insert a global chat message (bypasses RLS)
router.post('/message', authenticateToken, async (req, res) => {
  try {
    const { content } = req.body || {}
    if (!content || typeof content !== 'string' || content.trim().length === 0) {
      return res.status(400).json({ error: 'Message requis' })
    }
    if (content.length > 2000) {
      return res.status(400).json({ error: 'Message trop long (2000 caractères max)' })
    }
    const db = supabaseAdmin || supabaseClient
    const { data, error: insErr } = await db
      .from('global_chat')
      .insert({ user_id: req.user.id, user_email: req.user.email, content: content.trim() })
      .select('id, user_id, user_email, content, created_at')
      .single()
    if (insErr) {
      console.error('Chat insert error:', insErr)
      return res.status(500).json({ error: 'Erreur lors de l\'envoi du message' })
    }

    const [message] = await enrichMessagesWithProfiles(db, [data])
    res.json({ message })
  } catch (e) {
    console.error('Chat message route error:', e)
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

// POST /api/chat/ai
// body: { mode: 'persona'|'advisor', persona?: {title, skills[]}, message: string, history?: [{role, content}] }
router.post('/ai', authenticateToken, async (req, res) => {
  try {
  const { mode = 'advisor', persona, message, history = [], jobTitles = [], advisorType } = req.body || {}
    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'Message requis' })
    }

    const geminiApiKey = process.env.GEMINI_API_KEY
    if (!geminiApiKey) {
      return res.status(500).json({ error: 'GEMINI_API_KEY manquant' })
    }

    const titlesText = Array.isArray(jobTitles) && jobTitles.length ? `Titres métiers disponibles: ${jobTitles.join(', ')}.` : ''
    const sys = mode === 'persona' && persona?.title
      ? `Type de conseiller: ${advisorType || persona.title}. Tu es ${persona.title}. ${titlesText} Réponds en français, en incarnant ce métier (quotidien, contraintes, voies d'accès, perspectives). Donne des réponses COURTES, comme dans une discussion (2-4 phrases max), précises et utiles. Si on te pose des questions personnelles, réponds du point de vue professionnel. Compétences clés: ${(persona.skills||[]).join(', ')}.`
      : `Type de conseiller: ${advisorType || 'conseiller-ia'}. Tu es un conseiller d'orientation en français. ${titlesText} Donne des réponses COURTES comme dans une discussion (2-4 phrases max), concrètes, bienveillantes et actionnables avec premières étapes.`

    // Build content for Gemini API
    const parts = []
    parts.push({ text: `[Contexte] ${sys}` })
    for (const turn of history.slice(-10)) {
      if (!turn || !turn.content) continue
      parts.push({ text: `${turn.role === 'user' ? 'Etudiant' : 'IA'}: ${turn.content}` })
    }
    parts.push({ text: `Etudiant: ${message}` })
    parts.push({ text: `IA:` })

    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiApiKey}`
    const resp = await fetch(geminiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts }] })
    })

    if (!resp.ok) {
      const t = await resp.text()
      console.error('Gemini chat error:', t)
      return res.status(500).json({ error: 'Erreur IA' })
    }
    const data = await resp.json()
    const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text || ''
    res.json({ reply })
  } catch (e) {
    console.error('AI chat route error:', e)
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

export default router
