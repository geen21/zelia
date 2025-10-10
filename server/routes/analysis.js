import express from 'express'
import dotenv from 'dotenv'
import { supabase, supabaseAdmin } from '../config/supabase.js'
import { cloudinary, isCloudinaryConfigured } from '../config/cloudinary.js'
import { authenticateToken } from '../middleware/auth.js'

// Ensure environment variables are loaded (redundant-safe)
dotenv.config()

const router = express.Router()

// Generate analysis using Gemini API
router.post('/generate-analysis', async (req, res) => {
  try {
    const { userId } = req.body

    if (!userId) {
      return res.status(400).json({ error: 'User ID is required' })
    }

    console.log('Generating analysis for user ID:', userId)

  // Use service role if available to bypass RLS for server-side processing
  const db = supabaseAdmin || supabase

    // Get user profile information
    const { data: profile, error: profileError } = await db
      .from('profiles')
      .select('first_name, last_name, gender, avatar, avatar_json')
      .eq('id', userId)
      .single()

    if (profileError) {
      console.warn('Profile not found or not accessible, continuing with placeholders. Details:', profileError)
    }

    if (profile) {
      console.log('Found profile:', profile)
    }

    // Get user responses with questions and interpretations
  const { data: responsesData, error: responsesError } = await db
      .from('user_responses')
      .select(`
        response,
        question_id,
        questions (
          content,
          interpretations
        )
      `)
      .eq('user_id', userId)
      .order('question_id')

    if (responsesError) {
      console.error('Error fetching responses:', responsesError)
      return res.status(500).json({ error: 'Error fetching user responses' })
    }

    if (!responsesData || responsesData.length === 0) {
      return res.status(404).json({ error: 'No questionnaire responses found' })
    }

    // Format the data for Gemini API
    const safeProfile = {
      first_name: profile?.first_name || 'N/A',
      last_name: profile?.last_name || 'N/A',
      gender: profile?.gender || 'N/A',
    }

  let formattedData = `---\nUser information :\n`
    formattedData += `- ${safeProfile.first_name}\n`
    formattedData += `- ${safeProfile.last_name}\n`
  formattedData += `- ${safeProfile.gender}\n\n`

    responsesData.forEach((item, index) => {
      const questionNumber = index + 1
      const question = item.questions?.content || 'Question not found'
      const response = item.response || 'No response'
      
      // Get interpretation for the user's response
      let interpretation = 'No interpretation available'
      if (item.questions?.interpretations) {
        const interpretations = item.questions.interpretations
        // Find matching interpretation for the response
        if (interpretations[response]) {
          interpretation = interpretations[response]
        }
      }

      formattedData += `questions ${questionNumber}) : ${question}\n`
      formattedData += `response ${questionNumber}) : ${response}\n`
      formattedData += `interpretation ${questionNumber}) : ${interpretation}\n\n`
    })

  // Prepare the prompt for Gemini
    const prompt = `Vous êtes un conseiller d'orientation professionnel expert qui fournit des analyses détaillées en français, vous ne paraphrasez pas les réponses et questions de l'utilisateur, comme par exemple : (Q18 : "Pas trop"). `
      + `Votre tâche est de générer une réponse structurée qui DOIT IMPÉRATIVEMENT contenir EXACTEMENT les sections suivantes:\n\n`
      + `###Type de personalité###\n`
      + `[Nom de la personalité]\n\n`
      + `###Analyse de personnalité###\n`
      + `[Analyse approfondie de la personnalité de l'utilisateur en utilisant les travaux de Mayer Briggs pour l'analyse de résultat. Cependant tu ne dois pas citer les inititales INTP, ou ENFJ par exemple, tu t'appuies juste sur les travaux de mayer briggs pour en faire une analyse de personalité comme un psychologue. Environ 500 mots]\n\n`
      + `###Évaluation des compétences###\n`
      + `[Évaluation concise des compétences en points clés, maximum 300 mots. Présentez sous forme de liste.]\n\n`
      + `###Recommandations d'emploi###\n`
      + `Fournissez exactement 6 recommandations d'emploi. Pour chaque recommandation, suivez le format suivant :\n`
      + `1. [Titre du poste]\n`
      + `   - Compétences requises: [3-4 compétences principales sous forme liste, par mots clés]\n\n`
      + `###Recommandations d'études###\n`
      + `Fournissez exactement 6 recommandations d'études. Pour chaque recommandation, suivez le format suivant :\n`
      + `1. [Nom du diplôme]\n`
      + `2. [Nom du type d'étude]\n\n`
      + `1. Utilisez EXACTEMENT les titres de section indiqués ci-dessus avec trois dièses (###).\n`
      + `2. Chaque section est OBLIGATOIRE et doit apparaître dans l'ordre indiqué.\n`
      + `3. Si vous ne pouvez pas respecter ce format ou si l'une des sections manque.\n`
      + `Répondez uniquement en français.\n\n`
  + `Voici les données à analyser :\n\n${formattedData}---\n`

    // Call Gemini API (2.5 Flash)
    const geminiApiKey = process.env.GEMINI_API_KEY
    if (!geminiApiKey) {
      console.error('Missing GEMINI_API_KEY environment variable')
      return res.status(500).json({ error: 'Server configuration error: missing Gemini API key' })
    }
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiApiKey}`

    const geminiResponse = await fetch(geminiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: prompt
          }]
        }]
      })
    })

    if (!geminiResponse.ok) {
      const errorData = await geminiResponse.text()
      console.error('Gemini API error:', errorData)
      return res.status(500).json({ error: 'Error calling Gemini API' })
    }

    const geminiData = await geminiResponse.json()
    const generatedText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text

    if (!generatedText) {
      return res.status(500).json({ error: 'No response from Gemini API' })
    }

    // Parse the response to extract different sections
    const sections = parseGeminiResponse(generatedText)

    // Store the results in user_results table
  const { data: resultData, error: resultError } = await db
      .from('user_results')
      .upsert({
        user_id: userId,
        questionnaire_type: 'inscription',
        personality_analysis: sections.personalityAnalysis,
        skills_assessment: sections.skillsAssessment,
        job_recommendations: sections.jobRecommendations,
        study_recommendations: sections.studyRecommendations,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'user_id,questionnaire_type',
        ignoreDuplicates: false
      })

    if (resultError) {
      console.error('Error storing results:', resultError)
      return res.status(500).json({ error: 'Error storing analysis results' })
    }

    const { data: shareRow } = await db
      .from('user_results')
      .select('share_image_url')
      .eq('user_id', userId)
      .eq('questionnaire_type', 'inscription')
      .maybeSingle()

  res.json({
      message: 'Analysis generated successfully',
      analysis: {
        personalityType: sections.personalityType,
        personalityAnalysis: sections.personalityAnalysis,
        skillsAssessment: sections.skillsAssessment,
        jobRecommendations: sections.jobRecommendations,
    studyRecommendations: sections.studyRecommendations,
    avatarUrlBase: profile?.avatar_json?.url || profile?.avatar || null,
    avatarConfig: profile?.avatar_json || null,
    shareImageUrl: shareRow?.share_image_url || null
      }
    })

  } catch (error) {
    console.error('Generate analysis error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// Generate analysis for a specific questionnaire type (e.g., mbti), with extended MBTI-style analysis
router.post('/generate-analysis-by-type', async (req, res) => {
  try {
    const { userId, questionnaireType } = req.body || {}

    const qType = (questionnaireType || 'inscription').toString()
    if (!userId) {
      return res.status(400).json({ error: 'User ID is required' })
    }

    const db = supabaseAdmin || supabase

    // Fetch profile
    const { data: profile, error: profileError } = await db
      .from('profiles')
      .select('first_name, last_name, gender, avatar, avatar_json')
      .eq('id', userId)
      .single()

    if (profileError && profileError.code !== 'PGRST116') {
      console.warn('Profile not found, continuing. Details:', profileError)
    }

    // Fetch only responses for the specified questionnaire type
    const { data: responsesData, error: responsesError } = await db
      .from('user_responses')
      .select(`
        response,
        question_id,
        questions (
          content,
          interpretations,
          questionnaire_type
        )
      `)
      .eq('user_id', userId)
      .eq('questionnaire_type', qType)
      .order('question_id')

    if (responsesError) {
      console.error('Error fetching responses:', responsesError)
      return res.status(500).json({ error: 'Error fetching user responses' })
    }

    if (!responsesData || responsesData.length === 0) {
      return res.status(404).json({ error: `No ${qType} responses found` })
    }

    const safeProfile = {
      first_name: profile?.first_name || 'N/A',
      last_name: profile?.last_name || 'N/A',
      gender: profile?.gender || 'N/A',
    }

    let formattedData = `---\nUser information :\n`
    formattedData += `- ${safeProfile.first_name}\n`
    formattedData += `- ${safeProfile.last_name}\n`
    formattedData += `- ${safeProfile.gender}\n\n`

    responsesData.forEach((item, index) => {
      const questionNumber = index + 1
      const question = item.questions?.content || 'Question not found'
      const response = item.response || 'No response'

      let interpretation = 'No interpretation available'
      if (item.questions?.interpretations) {
        const interpretations = item.questions.interpretations
        if (interpretations[response]) interpretation = interpretations[response]
      }

      formattedData += `questions ${questionNumber}) : ${question}\n`
      formattedData += `response ${questionNumber}) : ${response}\n`
      formattedData += `interpretation ${questionNumber}) : ${interpretation}\n\n`
    })

    // Tailored prompt for MBTI style analysis with at least 1000 words in personality analysis
    const isMbti = qType.toLowerCase() === 'mbti'
  const analysisLengthHint = isMbti ? 'environ 1000 mots' : 'environ 500 mots'
    const opening = isMbti
      ? `Tu es un psychologue du travail expert en MBTI (Myers-Briggs Type Indicator). Réponds en français, de manière professionnelle et nuancée, comme le ferait le test officiel. Ne copie pas les questions/réponses textuellement.`
      : `Vous êtes un conseiller d'orientation professionnel expert qui fournit des analyses détaillées en français.`

    const prompt = `${opening} Ta réponse doit IMPÉRATIVEMENT suivre EXACTEMENT ces sections et titres :\n\n` +
      `###Type de personalité###\n` +
      `[Nom complet du type (ex: Architecte), avec éventuellement les 4 lettres entre parenthèses si pertinent]` + `\n\n` +
      `###Analyse de personnalité###\n` +
  `[Analyse approfondie ${analysisLengthHint} basée sur les axes MBTI (énergie, perception, décision, style de vie). Pas de liste brute : un texte riche, structuré en 3-5 paragraphes, sans paraphraser les questions ou les réponses.]\n\n` +
      `###Évaluation des compétences###\n` +
      `[Liste à puces de compétences clés observables (6 à 10 points).]\n\n` +
  `###Recommandations d'emploi###\n` +
  `Fournissez exactement 6 recommandations d'emploi clairement LIÉS au profil décrit (forces, préférences, style cognitif). Choisissez UNIQUEMENT des métiers adaptés aux traits identifiés. Pour chaque recommandation, suivez le format suivant :\n` +
      `1. [Titre du poste]\n` +
      `   - Compétences requises: [3-4 compétences principales sous forme liste, par mots clés]\n\n` +
      `1. Utilisez EXACTEMENT les titres de section indiqués ci-dessus avec trois dièses (###).\n` +
      `2. Chaque section est OBLIGATOIRE et doit apparaître dans l'ordre indiqué.\n` +
      `3. Ne fournissez AUCUNE recommandation d'études, de diplômes ou de formations.\n` +
      `4. Répondez uniquement en français.\n\n` +
      `Voici les données à analyser :\n\n${formattedData}---\n`

    const geminiApiKey = process.env.GEMINI_API_KEY
    if (!geminiApiKey) {
      console.error('Missing GEMINI_API_KEY environment variable')
      return res.status(500).json({ error: 'Server configuration error: missing Gemini API key' })
    }
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiApiKey}`

    const geminiResponse = await fetch(geminiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
    })

    if (!geminiResponse.ok) {
      const errorData = await geminiResponse.text()
      console.error('Gemini API error:', errorData)
      return res.status(500).json({ error: 'Error calling Gemini API' })
    }

    const geminiData = await geminiResponse.json()
    const generatedText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text
    if (!generatedText) {
      return res.status(500).json({ error: 'No response from Gemini API' })
    }

    const sections = parseGeminiResponse(generatedText)

    // Upsert into user_results per questionnaire_type (composite unique)
    const { error: resultError } = await db
      .from('user_results')
      .upsert({
        user_id: userId,
        questionnaire_type: qType,
        personality_analysis: sections.personalityAnalysis,
        skills_assessment: sections.skillsAssessment,
        job_recommendations: sections.jobRecommendations,
        // Per requirement, do not store study recommendations for MBTI
        study_recommendations: null,
        updated_at: new Date().toISOString()
      }, { onConflict: 'user_id,questionnaire_type', ignoreDuplicates: false })

    if (resultError) {
      console.error('Error storing results:', resultError)
      return res.status(500).json({ error: 'Error storing analysis results' })
    }

    const { data: shareRow } = await db
      .from('user_results')
      .select('share_image_url')
      .eq('user_id', userId)
      .eq('questionnaire_type', qType)
      .maybeSingle()

    res.json({
      message: 'Analysis generated successfully',
      analysis: {
        personalityType: sections.personalityType,
        personalityAnalysis: sections.personalityAnalysis,
        skillsAssessment: sections.skillsAssessment,
        jobRecommendations: sections.jobRecommendations,
        // No study recommendations for MBTI output
        studyRecommendations: [],
        avatarUrlBase: profile?.avatar_json?.url || profile?.avatar || null,
        avatarConfig: profile?.avatar_json || null,
        shareImageUrl: shareRow?.share_image_url || null
      }
    })
  } catch (error) {
    console.error('Generate analysis by type error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// Get user analysis results
router.get('/results/:userId', async (req, res) => {
  try {
    const { userId } = req.params

  const db = supabaseAdmin || supabase
  const { data: rows, error } = await db
    .from('user_results')
    .select('*')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })

    if (error && error.code !== 'PGRST116') { // PGRST116 = no rows found
      console.error('Error fetching results:', error)
      return res.status(500).json({ error: 'Error fetching results' })
    }

    if (!rows || rows.length === 0) {
      return res.status(404).json({ error: 'No analysis results found' })
    }
    const results = rows[0]

    // Fetch avatar data
    const { data: profile, error: profileErr } = await db
      .from('profiles')
      .select('avatar, avatar_json')
      .eq('id', userId)
      .single()

    if (profileErr && profileErr.code !== 'PGRST116') {
      console.warn('Could not fetch profile for avatar:', profileErr)
    }

    res.json({
      results: {
        personalityAnalysis: results.personality_analysis,
        skillsAssessment: results.skills_assessment,
        jobRecommendations: results.job_recommendations,
        studyRecommendations: results.study_recommendations,
        shareImageUrl: results.share_image_url || null,
        avatarUrlBase: profile?.avatar_json?.url || profile?.avatar || null,
        avatarConfig: profile?.avatar_json || null,
        createdAt: results.created_at,
        updatedAt: results.updated_at
      }
    })

  } catch (error) {
    console.error('Get results error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// Helper function to parse Gemini response
function parseGeminiResponse(text) {
  const sections = {
    personalityType: '',
    personalityAnalysis: '',
    skillsAssessment: '',
    jobRecommendations: [],
    studyRecommendations: []
  }

  try {
    const cleanText = (t) => (t || '').replace(/\*\*/g, '').trim()

    // Split by section headers
    const personalityTypeMatch = text.match(/###Type de personalité###\s*(.*?)\s*(?=###|$)/s)
    if (personalityTypeMatch) {
      sections.personalityType = cleanText(personalityTypeMatch[1])
    }

    const personalityAnalysisMatch = text.match(/###Analyse de personnalité###\s*(.*?)\s*(?=###)/s)
    if (personalityAnalysisMatch) {
      sections.personalityAnalysis = cleanText(personalityAnalysisMatch[1])
    }

    const skillsMatch = text.match(/###Évaluation des compétences###\s*(.*?)\s*(?=###)/s)
    if (skillsMatch) {
      sections.skillsAssessment = cleanText(skillsMatch[1])
    }

    const jobsMatch = text.match(/###Recommandations d'emploi###\s*(.*?)\s*(?=###)/s)
    if (jobsMatch) {
      const jobsText = jobsMatch[1].trim()
      sections.jobRecommendations = parseJobRecommendations(jobsText)
    }

    // Note: for MBTI we no longer expect or use study recommendations.
    // Keep parser tolerant for other types.
    const studiesMatch = text.match(/###Recommandations d'études###\s*(.*?)$/s)
    if (studiesMatch) {
      const studiesText = studiesMatch[1].trim()
      sections.studyRecommendations = parseStudyRecommendations(studiesText)
    }

  } catch (error) {
    console.error('Error parsing Gemini response:', error)
  }

  return sections
}

function parseJobRecommendations(text) {
  const cleanText = (t) => (t || '').replace(/\*\*/g, '').trim()
  const jobs = []
  if (!text) return jobs

  // Split into blocks starting at lines like `1.`, `2.`, etc.
  const blocks = text
    .trim()
    .split(/\n(?=\s*\d+\.\s)/)
    .map(b => b.trim())
    .filter(Boolean)

  for (const block of blocks) {
    const lines = block.split(/\n/).map(l => l.trim()).filter(Boolean)
    if (lines.length === 0) continue

    const titleLine = cleanText(lines[0].replace(/^\d+\.\s*/, ''))
    const skills = []

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i]
      // If the line has 'Compétences requises:' inline, collect after colon
      const reqIdx = line.search(/Compétences\s+requises\s*:/i)
      if (reqIdx >= 0) {
        const after = line.slice(reqIdx).replace(/Compétences\s+requises\s*:/i, '').trim()
        if (after) {
          // Split by commas or bullets/dashes
          after.split(/[;,•\u2022\-–]/).forEach(s => {
            const v = cleanText(s)
            if (v) skills.push(v)
          })
        }
        // Also capture subsequent bullet lines as skills
        continue
      }

      // Bullet list lines: "- skill" or "• skill"
      if (/^[-•–]\s+/.test(line)) {
        const s = cleanText(line.replace(/^[-•–]\s+/, ''))
        if (s && !/Compétences\s+requises/i.test(s)) {
          skills.push(s)
        }
      }
    }

    // Deduplicate and trim
    const uniqueSkills = Array.from(new Set(skills.filter(Boolean)))
    if (titleLine) {
      jobs.push({ title: titleLine, skills: uniqueSkills })
    }
  }

  return jobs
}

function parseStudyRecommendations(text) {
  const cleanText = (t) => (t || '').replace(/\*\*/g, '').trim()
  const studies = []
  const lines = text.split('\n').filter(line => line.trim())
  
  for (let i = 0; i < lines.length; i += 2) {
    if (lines[i] && lines[i + 1]) {
      const degree = cleanText(lines[i].replace(/^\d+\.\s*/, ''))
      const type = cleanText(lines[i + 1].replace(/^\d+\.\s*/, ''))
      
      if (degree && type) {
        studies.push({
          degree: degree,
          type: type
        })
      }
    }
  }
  
  return studies
}

// Level 7: evaluate job fit using user_results context and Gemini (legacy level9 alias)
const evaluateJobHandler = async (req, res) => {
  try {
    const userId = req.user.id
    const rawJob = req.body?.job

    if (!rawJob || typeof rawJob !== 'string' || rawJob.trim().length < 3) {
      return res.status(400).json({ error: 'Indique un métier valide (3 caractères minimum).' })
    }

    const jobTitle = rawJob.trim().slice(0, 120)
    const db = supabaseAdmin || supabase

    const { data: results, error } = await db
      .from('user_results')
      .select('*')
      .eq('user_id', userId)
      .single()

    if (error && error.code !== 'PGRST116') {
  console.error('Level7 evaluate-job fetch error:', error)
      return res.status(500).json({ error: 'Impossible de récupérer tes résultats.' })
    }

    if (!results) {
      return res.status(404).json({ error: 'Complète d’abord ton analyse de profil pour que je puisse te répondre précisément.' })
    }

    const safeString = (value, maxLength = 1200) => {
      if (!value) return ''
      if (typeof value === 'string') return value.slice(0, maxLength)
      try {
        const text = JSON.stringify(value)
        return text.slice(0, maxLength)
      } catch {
        return ''
      }
    }

    const sections = []
    const personality = safeString(results.personality_analysis, 1200)
    if (personality) sections.push(`Analyse de personnalité: ${personality}`)

    const skills = safeString(results.skills_assessment, 600)
    if (skills) sections.push(`Compétences observées: ${skills}`)

    const jobRecommendations = Array.isArray(results.job_recommendations)
      ? results.job_recommendations
      : safeString(results.job_recommendations, 600)

    if (Array.isArray(jobRecommendations)) {
      const formatted = jobRecommendations
        .slice(0, 5)
        .map((item) => {
          if (!item) return null
          if (typeof item === 'string') return item
          if (typeof item === 'object' && item.title) {
            const skillsText = Array.isArray(item.skills) && item.skills.length
              ? ` (compétences: ${item.skills.slice(0, 3).join(', ')})`
              : ''
            return `${item.title}${skillsText}`
          }
          return null
        })
        .filter(Boolean)
      if (formatted.length) {
        sections.push(`Métiers qui te correspondent déjà: ${formatted.join('; ')}`)
      }
    } else if (typeof jobRecommendations === 'string' && jobRecommendations.trim()) {
      sections.push(`Métiers qui te correspondent déjà: ${jobRecommendations}`)
    }

    if (!sections.length) {
      const fallback = safeString(results.skills_data, 600)
      if (fallback) sections.push(`Synthèse de profil: ${fallback}`)
    }

    if (!sections.length) {
      return res.status(404).json({ error: "Je n'ai pas assez d'informations sur ton profil. Relance ton analyse avant de revenir ici." })
    }

    const context = sections.join('\n')
    const prompt = `Tu es Zélia, conseillère d'orientation bienveillante mais lucide. Tu disposes du profil suivant:\n${context}\n\nAnalyse si la personne est adaptée pour le métier suivant: "${jobTitle}".\nRéponds STRICTEMENT au format: \"Oui — explication\" ou \"Non — explication\".\nL'explication doit faire au maximum 100 mots, directe et précise, sans proposer d'autres métiers.\nTu dois choisir entre Oui ou Non. Si les informations sont insuffisantes, choisis le verdict le plus probable et précise les conditions manquantes en restant sous 100 mots.`

    const geminiApiKey = process.env.GEMINI_API_KEY
    if (!geminiApiKey) {
      return res.status(500).json({ error: 'GEMINI_API_KEY manquant' })
    }

    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiApiKey}`
    const resp = await fetch(geminiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
    })

    if (!resp.ok) {
  const txt = await resp.text()
  console.error('Gemini level7 error:', txt)
      return res.status(500).json({ error: 'Erreur IA' })
    }

    const data = await resp.json()
    const reply = data?.candidates?.[0]?.content?.parts
      ?.map((part) => part?.text || '')
      .join('')
      .trim()

    if (!reply) {
      return res.status(500).json({ error: 'Réponse IA vide' })
    }

    const verdictMatch = reply.match(/^\s*(oui|non)[\s\-–:]+(.+)/i)
    const fallbackVerdict = /oui/i.test(reply) && !/non/i.test(reply) ? 'oui' : /non/i.test(reply) ? 'non' : null

    const verdictValue = verdictMatch ? verdictMatch[1].toLowerCase() : fallbackVerdict
    let explanation = verdictMatch ? verdictMatch[2].trim() : reply.replace(/^\s*(oui|non)[\s\-–:]+/i, '').trim()

    if (!verdictValue) {
  console.warn('Gemini level7 unstructured reply:', reply)
      return res.status(500).json({ error: 'Réponse IA non comprise' })
    }

    const words = explanation.split(/\s+/).filter(Boolean)
    if (words.length > 100) {
      explanation = `${words.slice(0, 100).join(' ')}…`
    }

    res.json({
      verdict: verdictValue === 'oui' ? 'Oui' : 'Non',
      explanation
    })
  } catch (error) {
    console.error('Level7 evaluate-job error:', error)
    res.status(500).json({ error: 'Erreur serveur' })
  }
}

router.post('/level7/evaluate-job', authenticateToken, evaluateJobHandler)
// Legacy path kept for backward compatibility
router.post('/level9/evaluate-job', authenticateToken, evaluateJobHandler)

router.post('/share-image', authenticateToken, async (req, res) => {
  try {
    if (!isCloudinaryConfigured()) {
      return res.status(500).json({ error: 'Cloudinary is not configured on the server.' })
    }

    const userId = req.user?.id
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' })
    }

    const { image, questionnaireType = 'mbti', metadata = {} } = req.body || {}
    if (!image || typeof image !== 'string') {
      return res.status(400).json({ error: 'Image data URL is required.' })
    }

    const trimmed = image.trim()
    const dataUrlPattern = /^data:image\/(png|jpeg|jpg|webp);base64,/i
    let uploadPayload = trimmed

    if (!dataUrlPattern.test(trimmed)) {
      const base64Only = trimmed.replace(/^data:[^;]+;base64,/, '')
      const base64Regex = /^[A-Za-z0-9+/=\r\n]+$/
      if (!base64Regex.test(base64Only)) {
        return res.status(400).json({ error: 'Invalid image payload. Expecting base64-encoded image.' })
      }
      uploadPayload = `data:image/png;base64,${base64Only}`
    }

    const qType = (questionnaireType || 'mbti').toLowerCase()
    const folder = `zelia/${qType}`
    const publicId = `${userId}-share`

    const uploadResult = await cloudinary.uploader.upload(uploadPayload, {
      folder,
      public_id: publicId,
      overwrite: true,
      invalidate: true,
      resource_type: 'image',
      format: 'png',
      context: Object.entries(metadata || {}).map(([key, value]) => `${key}=${value}`).join('|') || undefined
    })

    const imageUrl = uploadResult?.secure_url
    if (!imageUrl) {
      return res.status(500).json({ error: 'Failed to upload image to Cloudinary.' })
    }

    const db = supabaseAdmin || supabase

    const { data: existingRow, error: fetchError } = await db
      .from('user_results')
      .select('id')
      .eq('user_id', userId)
      .eq('questionnaire_type', qType)
      .maybeSingle()

    if (fetchError && fetchError.code !== 'PGRST116') {
      console.error('share-image fetch error:', fetchError)
      return res.status(500).json({ error: 'Failed to prepare database update.' })
    }

    const nowIso = new Date().toISOString()

    if (existingRow?.id) {
      const { error: updateError } = await db
        .from('user_results')
        .update({ share_image_url: imageUrl, updated_at: nowIso })
        .eq('id', existingRow.id)

      if (updateError) {
        console.error('share-image update error:', updateError)
        return res.status(500).json({ error: 'Failed to update share image URL.' })
      }
    } else {
      const { error: insertError } = await db
        .from('user_results')
        .insert({
          user_id: userId,
          questionnaire_type: qType,
          share_image_url: imageUrl,
          created_at: nowIso,
          updated_at: nowIso
        })

      if (insertError) {
        console.error('share-image insert error:', insertError)
        return res.status(500).json({ error: 'Failed to store share image URL.' })
      }
    }

    res.json({ url: imageUrl })
  } catch (error) {
    console.error('share-image upload error:', error)
    res.status(500).json({ error: 'Internal server error while uploading share image.' })
  }
})

export default router

// New endpoint: get current user's analysis results (authenticated)
// Mirrors GET /results/:userId but derives the ID from the auth token
router.get('/my-results', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id
    const db = supabaseAdmin || supabase

    const { data: rows, error } = await db
      .from('user_results')
      .select('*')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })

    if (error && error.code !== 'PGRST116') {
      console.error('Error fetching results:', error)
      return res.status(500).json({ error: 'Error fetching results' })
    }

    if (!rows || rows.length === 0) {
      return res.status(404).json({ error: 'No analysis results found' })
    }
    // Split rows by type and map to UI-friendly structures
    const findByType = (type) => rows.find(r => (r.questionnaire_type || '').toLowerCase() === type)
    const mbti = findByType('mbti') || null
    const inscription = findByType('inscription') || null

    const mapRow = (row) => {
      if (!row) return null
      let personalityType = null
      let personalityAnalysis = row.personality_analysis || null
      let skillsAssessment = row.skills_assessment || null
      let jobRecommendations = row.job_recommendations || null
      let studyRecommendations = row.study_recommendations || null

      if (!personalityAnalysis && !skillsAssessment && !jobRecommendations && !studyRecommendations && row.skills_data) {
        const sd = row.skills_data
        personalityType = sd.personality_type || null
        const strengthsText = Array.isArray(sd.strengths) && sd.strengths.length > 0
          ? `Forces clés: ${sd.strengths.join(', ')}`
          : null
        const recsText = Array.isArray(sd.recommendations) && sd.recommendations.length > 0
          ? `Recommandations:\n- ${sd.recommendations.join('\n- ')}`
          : null
        personalityAnalysis = [strengthsText, recsText].filter(Boolean).join('\n\n') || null
        skillsAssessment = Array.isArray(sd.strengths) && sd.strengths.length > 0
          ? `Compétences mises en avant: ${sd.strengths.join(', ')}`
          : null
        jobRecommendations = Array.isArray(sd.career_matches)
          ? sd.career_matches.map(m => ({ title: m.title, skills: [] }))
          : []
        studyRecommendations = []
      }

      return {
        personalityType,
        personalityAnalysis,
        skillsAssessment,
        jobRecommendations,
        studyRecommendations,
        shareImageUrl: row.share_image_url || null,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      }
    }

    const mbtiMapped = mapRow(mbti)
    const inscriptionMapped = mapRow(inscription)

    // Fetch avatar data
    const { data: profile, error: profileErr } = await db
      .from('profiles')
      .select('avatar, avatar_json')
      .eq('id', userId)
      .single()

    if (profileErr && profileErr.code !== 'PGRST116') {
      console.warn('Could not fetch profile for avatar:', profileErr)
    }

    const primary = mbtiMapped || inscriptionMapped || {}
    res.json({
      results: {
        personalityType: primary.personalityType || null,
        personalityAnalysis: primary.personalityAnalysis || null,
        skillsAssessment: primary.skillsAssessment || null,
        jobRecommendations: primary.jobRecommendations || [],
        studyRecommendations: primary.studyRecommendations || [],
        shareImageUrl: primary.shareImageUrl || null,
        inscriptionResults: inscriptionMapped || null,
        avatarUrlBase: profile?.avatar_json?.url || profile?.avatar || null,
        avatarConfig: profile?.avatar_json || null,
        createdAt: primary.createdAt,
        updatedAt: primary.updatedAt
      }
    })
  } catch (error) {
    console.error('Get my results error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})
