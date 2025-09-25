import express from 'express'
import dotenv from 'dotenv'
import { supabase, supabaseAdmin } from '../config/supabase.js'
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
        onConflict: 'user_id',
        ignoreDuplicates: false
      })

    if (resultError) {
      console.error('Error storing results:', resultError)
      return res.status(500).json({ error: 'Error storing analysis results' })
    }

  res.json({
      message: 'Analysis generated successfully',
      analysis: {
        personalityType: sections.personalityType,
        personalityAnalysis: sections.personalityAnalysis,
        skillsAssessment: sections.skillsAssessment,
        jobRecommendations: sections.jobRecommendations,
    studyRecommendations: sections.studyRecommendations,
    avatarUrlBase: profile?.avatar_json?.url || profile?.avatar || null,
    avatarConfig: profile?.avatar_json || null
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

    // Upsert into user_results (note: user_id unique; will overwrite previous analysis)
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
      }, { onConflict: 'user_id', ignoreDuplicates: false })

    if (resultError) {
      console.error('Error storing results:', resultError)
      return res.status(500).json({ error: 'Error storing analysis results' })
    }

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
        avatarConfig: profile?.avatar_json || null
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
  const { data: results, error } = await db
      .from('user_results')
      .select('*')
      .eq('user_id', userId)
      .single()

    if (error && error.code !== 'PGRST116') { // PGRST116 = no rows found
      console.error('Error fetching results:', error)
      return res.status(500).json({ error: 'Error fetching results' })
    }

    if (!results) {
      return res.status(404).json({ error: 'No analysis results found' })
    }

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

export default router

// New endpoint: get current user's analysis results (authenticated)
// Mirrors GET /results/:userId but derives the ID from the auth token
router.get('/my-results', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id
    const db = supabaseAdmin || supabase

    const { data: results, error } = await db
      .from('user_results')
      .select('*')
      .eq('user_id', userId)
      .single()

    if (error && error.code !== 'PGRST116') {
      console.error('Error fetching results:', error)
      return res.status(500).json({ error: 'Error fetching results' })
    }

    if (!results) {
      return res.status(404).json({ error: 'No analysis results found' })
    }

  // Prepare fields with graceful fallback from simple skills_data
    let personalityType = null
    let personalityAnalysis = results.personality_analysis || null
    let skillsAssessment = results.skills_assessment || null
    let jobRecommendations = results.job_recommendations || null
    let studyRecommendations = results.study_recommendations || null
  let inscriptionResults = null

    // If detailed fields are missing but we have simple skills_data, map it
    // If detailed fields are missing, we use skills_data as the primary results
    if (!personalityAnalysis && !skillsAssessment && !jobRecommendations && !studyRecommendations && results.skills_data) {
      const sd = results.skills_data
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

    // Additionally, if skills_data exists, expose it as separate inscriptionResults
    if (results.skills_data) {
      const sd = results.skills_data
      const strengthsText = Array.isArray(sd.strengths) && sd.strengths.length > 0
        ? `Forces clés: ${sd.strengths.join(', ')}`
        : null
      const recsText = Array.isArray(sd.recommendations) && sd.recommendations.length > 0
        ? `Recommandations:\n- ${sd.recommendations.join('\n- ')}`
        : null
      inscriptionResults = {
        personalityType: sd.personality_type || null,
        personalityAnalysis: [strengthsText, recsText].filter(Boolean).join('\n\n') || null,
        skillsAssessment: Array.isArray(sd.strengths) && sd.strengths.length > 0
          ? `Compétences mises en avant: ${sd.strengths.join(', ')}`
          : null,
        jobRecommendations: Array.isArray(sd.career_matches)
          ? sd.career_matches.map(m => ({ title: m.title, skills: [] }))
          : [],
        studyRecommendations: []
      }
    }

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
        personalityType,
        personalityAnalysis,
        skillsAssessment,
        jobRecommendations,
        studyRecommendations,
        inscriptionResults,
        avatarUrlBase: profile?.avatar_json?.url || profile?.avatar || null,
        avatarConfig: profile?.avatar_json || null,
        createdAt: results.created_at,
        updatedAt: results.updated_at
      }
    })
  } catch (error) {
    console.error('Get my results error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})
