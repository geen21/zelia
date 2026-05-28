import express from 'express'
import dotenv from 'dotenv'
import { authenticateToken } from '../middleware/auth.js'
import { supabaseAdmin, supabase as supabaseClient } from '../config/supabase.js'

dotenv.config()

const router = express.Router()

const GEMINI_STRUCTURED_RETRY_ATTEMPTS = 3
const ORIENTATION_FLOW_STRUCTURED_RETRY_ATTEMPTS = 1
const ORIENTATION_FLOW_GEMINI_TIMEOUT_MS = 8000
const GEMINI_RETRY_DELAY_MS = 350
const PERSONA_CHAT_LIMIT = 5
const PERSONA_QUOTA_WINDOW_MS = 24 * 60 * 60 * 1000
const personaQuotaCounters = new Map()

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function buildGeminiAttemptConfig(generationConfig, attempt, shouldExpandOutput) {
  if (!shouldExpandOutput || attempt <= 1) {
    return generationConfig
  }

  const baseMaxOutputTokens = Number(generationConfig.maxOutputTokens) || 1024
  const multiplier = attempt === 2 ? 1.5 : 2
  return {
    ...generationConfig,
    maxOutputTokens: Math.min(8192, Math.ceil(baseMaxOutputTokens * multiplier))
  }
}

function logGeminiChatFailure(message, details, body = '') {
  const bodyPreview = typeof body === 'string' && body
    ? ` ${body.slice(0, 700)}`
    : ''
  console.error(message, JSON.stringify(details), bodyPreview)
}

function normalizeQuotaKey(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function getPersonaQuotaSubject({ mode, persona, advisorType }) {
  if (mode !== 'persona') return ''
  return normalizeQuotaKey(persona?.title || advisorType)
}

function getPersonaQuotaEntry(userId, subject, now = Date.now()) {
  const key = `${userId}:${subject}`
  const existing = personaQuotaCounters.get(key)

  if (existing && existing.expiresAt > now) {
    return { key, entry: existing }
  }

  const entry = { count: 0, expiresAt: now + PERSONA_QUOTA_WINDOW_MS }
  personaQuotaCounters.set(key, entry)
  return { key, entry }
}

function buildPersonaQuotaPayload(subject, entry) {
  const used = Math.min(entry?.count || 0, PERSONA_CHAT_LIMIT)
  return {
    subject,
    limit: PERSONA_CHAT_LIMIT,
    used,
    remaining: Math.max(0, PERSONA_CHAT_LIMIT - used),
    resetAt: entry?.expiresAt ? new Date(entry.expiresAt).toISOString() : null
  }
}

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

router.delete('/messages/me', authenticateToken, async (req, res) => {
  try {
    const db = supabaseAdmin || supabaseClient
    const { data, error } = await db
      .from('global_chat')
      .delete()
      .eq('user_id', req.user.id)
      .select('id')

    if (error) {
      console.error('Chat delete my messages error:', error)
      return res.status(500).json({ error: 'Erreur lors de la suppression des messages' })
    }

    const deletedIds = (data || []).map((message) => message.id).filter(Boolean)
    res.json({ deletedIds, deletedCount: deletedIds.length })
  } catch (e) {
    console.error('Chat delete my messages route error:', e)
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

router.get('/ai/quota', authenticateToken, async (req, res) => {
  try {
    const subject = normalizeQuotaKey(req.query.persona || req.query.advisorType)
    if (!subject) {
      return res.status(400).json({ error: 'Persona requis' })
    }

    const { entry } = getPersonaQuotaEntry(req.user.id, subject)
    res.json({ quota: buildPersonaQuotaPayload(subject, entry) })
  } catch (e) {
    console.error('AI quota route error:', e)
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

    const quotaSubject = getPersonaQuotaSubject({ mode, persona, advisorType })
    let quotaKey = ''
    let quotaEntry = null
    if (quotaSubject) {
      const quota = getPersonaQuotaEntry(req.user.id, quotaSubject)
      quotaKey = quota.key
      quotaEntry = quota.entry
      if (quotaEntry.count >= PERSONA_CHAT_LIMIT) {
        return res.status(429).json({
          error: 'Limite atteinte pour ce métier. Choisis un autre métier ou reviens plus tard.',
          code: 'PERSONA_QUOTA_EXCEEDED',
          quota: buildPersonaQuotaPayload(quotaSubject, quotaEntry)
        })
      }
    }

    const titlesText = Array.isArray(jobTitles) && jobTitles.length ? `Titres métiers disponibles: ${jobTitles.join(', ')}.` : ''
    const isBilan = mode === 'bilan' || (typeof advisorType === 'string' && advisorType.startsWith('bilan'))
    const isPointsMetier = advisorType === 'points-metier'
    const isFicheMetier = advisorType === 'fiche-metier'
    const isStudyBudget = advisorType === 'study-budget'
    const isFilieresGenerator = advisorType === 'filieres-generator'
    const isGradesEvaluation = advisorType === 'grades-evaluation'
    const isOrientationKeywordSelection = advisorType === 'orientation-keyword-selection'
    const isOrientationCandidatePreselection = advisorType === 'orientation-candidate-preselection'
    const isOrientationFormationDeck = advisorType === 'orientation-formation-deck'
    const isOrientationFormationKeywords = advisorType === 'orientation-formation-keywords'
    const isOrientationJobDeck = advisorType === 'orientation-job-deck'
    const isOrientationJobFinal = advisorType === 'orientation-job-final'
    const isHomeAssistant = advisorType === 'home-orientation-assistant'
    const isCvBuilder = advisorType === 'cv-builder'
    const isStructuredJson = isBilan || isStudyBudget || isFilieresGenerator || isGradesEvaluation || isOrientationKeywordSelection || isOrientationCandidatePreselection || isOrientationFormationDeck || isOrientationFormationKeywords || isOrientationJobDeck || isOrientationJobFinal || isCvBuilder
    const usesDirectPrompt = isStructuredJson || isPointsMetier || isFicheMetier
    const sys = isBilan
      ? `Tu es Zélia, coach d'orientation francophone. Tu dois produire un bilan structuré pour l'utilisateur. Réponds STRICTEMENT en JSON valide, sans texte avant ni après, sans balise markdown, sans backticks. Respecte exactement le schéma demandé dans le message. Le ton doit être encourageant, concret et personnalisé à partir des données fournies.`
      : isFilieresGenerator
      ? `Tu es Zélia, conseillère d'orientation francophone. Tu proposes des filières post-bac réalistes. Réponds STRICTEMENT en JSON valide, sans texte avant ni après, sans markdown et sans backticks. Le JSON doit être uniquement un tableau de 10 objets. Chaque objet contient uniquement "type" et "degree", deux chaînes non vides.`
      : isGradesEvaluation
      ? `Tu es Zélia, conseillère d'orientation francophone. Tu évalues la faisabilité de filières à partir de notes scolaires. Réponds STRICTEMENT en JSON valide, sans texte avant ni après, sans markdown et sans backticks. Le JSON doit contenir uniquement ok et message. ok est un booléen. message est une phrase courte, bienveillante, concrète et en tutoyant l'élève.`
      : isOrientationKeywordSelection
      ? `Tu es Zélia, conseillère d'orientation francophone. Tu produis des mots-clés de recherche pour des tables métiers/formations. Réponds STRICTEMENT en JSON valide, sans texte avant ni après, sans markdown et sans backticks. Le JSON doit respecter exactement le schéma demandé dans le message.`
      : isOrientationCandidatePreselection
      ? `Tu es Zélia, conseillère d'orientation francophone. Tu préselectionnes des propositions à afficher à partir du contexte déjà répondu par l'utilisateur. Réponds STRICTEMENT en JSON valide, sans texte avant ni après, sans markdown et sans backticks. Pour chaque candidat, answer doit valoir exactement "Oui" ou "Non".`
      : isOrientationFormationDeck
      ? `Tu es Zélia, conseillère d'orientation francophone. Tu proposes directement des pistes de formations à swiper, uniquement à partir du profil utilisateur et sans interroger ni mentionner de base de données. Réponds STRICTEMENT en JSON valide, sans texte avant ni après, sans markdown et sans backticks. Le JSON doit respecter exactement le schéma demandé dans le message.`
      : isOrientationFormationKeywords
      ? `Tu es Zélia, conseillère d'orientation francophone. Tu transformes un profil et des swipes de formations en mots-clés de recherche pour formation_france.nm et formation_france.etab_nom. Réponds STRICTEMENT en JSON valide, sans texte avant ni après, sans markdown et sans backticks. Le JSON doit être uniquement la liste de requêtes demandée.`
      : isOrientationJobDeck
      ? `Tu es Zélia, conseillère d'orientation francophone. Tu proposes directement des métiers à swiper, uniquement à partir du profil utilisateur et sans utiliser ni mentionner de base de données métiers. Réponds STRICTEMENT en JSON valide, sans texte avant ni après, sans markdown et sans backticks. Le JSON doit respecter exactement le schéma demandé dans le message.`
      : isOrientationJobFinal
      ? `Tu es Zélia, conseillère d'orientation francophone. Tu affines des métiers après des swipes oui/non, façon Akinator: les refus écartent des familles, les oui renforcent des signaux. Réponds STRICTEMENT en JSON valide, sans texte avant ni après, sans markdown et sans backticks. Le JSON doit être uniquement la liste finale demandée.`
      : isCvBuilder
      ? `Tu es Zélia, experte RH francophone. Tu génères un CV structuré. Réponds STRICTEMENT en JSON valide, sans texte avant ni après, sans markdown et sans backticks. Respecte exactement le schéma demandé, avec des textes concis pour tenir sur une page A4.`
      : isPointsMetier
      ? `Tu es Zélia, conseillère d'orientation francophone. Réponds STRICTEMENT avec deux sections nommées NEGATIFS et POSITIFS. Chaque section contient exactement 3 puces courtes, concrètes et nuancées. N'ajoute aucune introduction, conclusion, markdown de titre, tableau ou bloc de code.`
      : isFicheMetier
      ? `Tu es Zélia, conseillère d'orientation francophone. Tu rédiges une fiche métier complète, concise et directement exploitable. Réponds STRICTEMENT avec les trois sections demandées, dans l'ordre, sans introduction, sans conclusion, sans markdown de titre et sans bloc de code. Termine toujours tes phrases et ne t'arrête pas avant la section Écoles/études.`
      : isStudyBudget
      ? `Tu es Zélia, conseillère d'orientation francophone. Tu estimes un budget d'études en France. Réponds STRICTEMENT en JSON valide, sans texte avant ni après, sans markdown et sans backticks. Le JSON doit contenir uniquement min, max et message. min et max sont des nombres entiers en euros. message est une phrase courte.`
      : isHomeAssistant
      ? `Tu es Zélia, conseillère d'orientation francophone. Tu connais le contexte utilisateur quand il est fourni dans le message. Réponds en français, en tutoyant l'élève, sans te présenter comme une IA et sans mentionner Gemini. Donne des réponses COURTES comme dans une discussion (2-3 phrases max), rassurantes, concrètes et personnalisées. Termine toujours par une phrase complète avec une ponctuation finale. Si l'élève dit qu'il ne sait pas quoi faire, utilise son profil pour proposer 2 pistes et pose une seule question simple.`
      : mode === 'persona' && persona?.title
      ? `Type de conseiller: ${advisorType || persona.title}. Tu es ${persona.title}. ${titlesText} Réponds en français, en incarnant ce métier (quotidien, contraintes, voies d'accès, perspectives). Donne des réponses COURTES, comme dans une discussion (2-4 phrases max), précises et utiles. Si on te demande ce que tu n'aimes pas dans ton métier, réponds par 2 ou 3 contraintes concrètes du quotidien, sans bloquer ni refuser. Si on te pose des questions personnelles, réponds du point de vue professionnel. Compétences clés: ${(persona.skills||[]).join(', ')}.`
      : `Type de conseiller: ${advisorType || 'zelia'}. Tu es Zélia, conseillère d'orientation en français. ${titlesText} Donne des réponses COURTES comme dans une discussion (2-4 phrases max), concrètes, bienveillantes et actionnables avec premières étapes.`

    // Build content for Gemini API
    const parts = []
    parts.push({ text: `[Contexte] ${sys}` })
    if (!usesDirectPrompt) {
      for (const turn of history.slice(-10)) {
        if (!turn || !turn.content) continue
        parts.push({ text: `${turn.role === 'user' ? 'Etudiant' : 'IA'}: ${turn.content}` })
      }
      parts.push({ text: `Etudiant: ${message}` })
      parts.push({ text: `IA:` })
    } else {
      parts.push({ text: message })
    }

    const generationConfig = isBilan
      ? { temperature: 0.7, maxOutputTokens: 2048, responseMimeType: 'application/json' }
      : isFilieresGenerator
      ? { temperature: 0.35, maxOutputTokens: 2048, responseMimeType: 'application/json' }
      : isGradesEvaluation
      ? { temperature: 0.25, maxOutputTokens: 512, responseMimeType: 'application/json' }
      : isOrientationKeywordSelection
      ? { temperature: 0.25, maxOutputTokens: 3072, responseMimeType: 'application/json' }
      : isOrientationCandidatePreselection
      ? { temperature: 0.15, maxOutputTokens: 4096, responseMimeType: 'application/json' }
      : isOrientationFormationDeck
      ? { temperature: 0.5, maxOutputTokens: 4096, responseMimeType: 'application/json' }
      : isOrientationFormationKeywords
      ? { temperature: 0.25, maxOutputTokens: 3072, responseMimeType: 'application/json' }
      : isOrientationJobDeck
      ? { temperature: 0.45, maxOutputTokens: 1536, responseMimeType: 'application/json' }
      : isOrientationJobFinal
      ? { temperature: 0.3, maxOutputTokens: 2048, responseMimeType: 'application/json' }
      : isCvBuilder
      ? { temperature: 0.35, maxOutputTokens: 4096, responseMimeType: 'application/json' }
      : isPointsMetier
      ? { temperature: 0.25, maxOutputTokens: 1024 }
      : isFicheMetier
      ? { temperature: 0.45, maxOutputTokens: 1536 }
      : isStudyBudget
      ? { temperature: 0.2, maxOutputTokens: 512, responseMimeType: 'application/json' }
      : isHomeAssistant
      ? { temperature: 0.65, maxOutputTokens: 1024 }
      : { temperature: 0.75, maxOutputTokens: 1024 }

    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiApiKey}`
    const isOrientationFlowStructured = isOrientationFormationDeck || isOrientationFormationKeywords || isOrientationJobDeck || isOrientationJobFinal
    const geminiAttempts = isStructuredJson
      ? (isOrientationFlowStructured ? ORIENTATION_FLOW_STRUCTURED_RETRY_ATTEMPTS : GEMINI_STRUCTURED_RETRY_ATTEMPTS)
      : 1
    let lastGeminiError = 'Erreur IA temporaire'

    for (let attempt = 1; attempt <= geminiAttempts; attempt += 1) {
      const attemptGenerationConfig = buildGeminiAttemptConfig(generationConfig, attempt, isStructuredJson)
      const logDetails = {
        advisorType,
        mode,
        attempt,
        attempts: geminiAttempts,
        maxOutputTokens: attemptGenerationConfig.maxOutputTokens
      }

      let resp
      try {
        const signal = isOrientationFlowStructured && typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
          ? AbortSignal.timeout(ORIENTATION_FLOW_GEMINI_TIMEOUT_MS)
          : undefined
        resp = await fetch(geminiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal,
          body: JSON.stringify({ contents: [{ parts }], generationConfig: attemptGenerationConfig })
        })
      } catch (fetchError) {
        lastGeminiError = 'Erreur IA temporaire'
        logGeminiChatFailure('Gemini chat fetch failed:', { ...logDetails, message: fetchError?.message || String(fetchError) })
        if (attempt < geminiAttempts) {
          await wait(GEMINI_RETRY_DELAY_MS * attempt)
          continue
        }
        return res.status(502).json({ error: lastGeminiError })
      }

      if (!resp.ok) {
        const responseBody = await resp.text()
        lastGeminiError = 'Erreur IA temporaire'
        logGeminiChatFailure('Gemini chat error:', { ...logDetails, status: resp.status }, responseBody)
        if (attempt < geminiAttempts) {
          await wait(GEMINI_RETRY_DELAY_MS * attempt)
          continue
        }
        return res.status(502).json({ error: lastGeminiError })
      }

      let geminiData
      try {
        geminiData = await resp.json()
      } catch (parseError) {
        lastGeminiError = 'Réponse IA illisible'
        logGeminiChatFailure('Gemini chat JSON parse failed:', { ...logDetails, message: parseError?.message || String(parseError) })
        if (attempt < geminiAttempts) {
          await wait(GEMINI_RETRY_DELAY_MS * attempt)
          continue
        }
        return res.status(502).json({ error: lastGeminiError })
      }

      const finishReason = geminiData?.candidates?.[0]?.finishReason
      const reply = (geminiData?.candidates?.[0]?.content?.parts || [])
        .map((part) => part?.text || '')
        .filter(Boolean)
        .join('\n')
        .trim()

      if (finishReason === 'MAX_TOKENS') {
        lastGeminiError = 'Réponse IA tronquée'
        logGeminiChatFailure('Gemini chat truncated response:', logDetails)
        if (attempt < geminiAttempts) {
          await wait(GEMINI_RETRY_DELAY_MS * attempt)
          continue
        }
        if (isCvBuilder && reply) {
          return res.json({ reply, truncated: true })
        }
        return res.status(502).json({ error: lastGeminiError })
      }

      if (!reply) {
        lastGeminiError = 'Réponse IA vide'
        logGeminiChatFailure('Gemini chat empty response:', {
          ...logDetails,
          finishReason,
          promptFeedback: geminiData?.promptFeedback || null
        })
        if (attempt < geminiAttempts) {
          await wait(GEMINI_RETRY_DELAY_MS * attempt)
          continue
        }
        return res.status(502).json({ error: lastGeminiError })
      }

      if (quotaEntry && quotaKey) {
        quotaEntry.count = Math.min(PERSONA_CHAT_LIMIT, quotaEntry.count + 1)
        personaQuotaCounters.set(quotaKey, quotaEntry)
        return res.json({ reply, quota: buildPersonaQuotaPayload(quotaSubject, quotaEntry) })
      }

      return res.json({ reply })
    }

    res.status(502).json({ error: lastGeminiError })
  } catch (e) {
    console.error('AI chat route error:', e)
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

export default router
