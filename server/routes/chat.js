import express from 'express'
import dotenv from 'dotenv'
import { authenticateToken } from '../middleware/auth.js'

dotenv.config()

const router = express.Router()

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
