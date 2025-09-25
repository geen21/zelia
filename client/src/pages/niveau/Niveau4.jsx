import React, { useEffect, useMemo, useRef, useState } from 'react'
import { jsPDF } from 'jspdf'
import { useNavigate } from 'react-router-dom'
import apiClient, { usersAPI, progressionAPI } from '../../lib/api'
import { supabase } from '../../lib/supabase'

// Simple typewriter
function useTypewriter(message, durationMs) {
  const [text, setText] = useState('')
  const [done, setDone] = useState(false)
  const intRef = useRef(null)
  const toRef = useRef(null)
  useEffect(() => {
    const full = message || ''
    setText('')
    setDone(false)
    let i = 0
    const step = Math.max(15, Math.floor((durationMs || 1500) / Math.max(1, full.length)))
    intRef.current = setInterval(() => {
      i++
      setText(full.slice(0, i))
      if (i >= full.length) clearInterval(intRef.current)
    }, step)
    toRef.current = setTimeout(() => { clearInterval(intRef.current); setText(full); setDone(true) }, Math.max(durationMs || 1500, (full.length + 1) * step))
    return () => { if (intRef.current) clearInterval(intRef.current); if (toRef.current) clearTimeout(toRef.current) }
  }, [message, durationMs])
  const skip = () => { if (intRef.current) clearInterval(intRef.current); if (toRef.current) clearTimeout(toRef.current); setText(message || ''); setDone(true) }
  return { text, done, skip }
}

// Avatar helper (reuse minimal)
function buildAvatarFromProfile(profile, seed = 'zelia') {
  try {
    if (profile?.avatar_url && typeof profile.avatar_url === 'string') return profile.avatar_url
    if (profile?.avatar && typeof profile.avatar === 'string') return profile.avatar
    if (profile?.avatar_json) {
      let conf = profile.avatar_json
      if (typeof conf === 'string') { try { conf = JSON.parse(conf) } catch {} }
      if (conf && typeof conf === 'object') {
        if (conf.url && typeof conf.url === 'string') {
          try { const u = new URL(conf.url); if (!u.searchParams.has('seed')) u.searchParams.set('seed', String(seed)); if (!u.searchParams.has('size')) u.searchParams.set('size','300'); return u.toString() } catch {}
        }
        const params = new URLSearchParams(); params.set('seed', String(seed)); Object.entries(conf).forEach(([k,v])=>{ if (v!==undefined && v!==null && v!=='') params.set(k, String(v)) }); if (!params.has('size')) params.set('size','300'); return `https://api.dicebear.com/9.x/lorelei/svg?${params.toString()}`
      }
    }
  } catch {}
  const p = new URLSearchParams({ seed: String(seed), size: '300', radius: '15' }); return `https://api.dicebear.com/9.x/lorelei/svg?${p.toString()}`
}

export default function Niveau4() {
  const navigate = useNavigate()
  const [profile, setProfile] = useState(null)
  const [avatarUrl, setAvatarUrl] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [phase, setPhase] = useState('intro') // intro -> quiz -> generating -> results -> success
  // Separate indices for intro messages and quiz questions
  const [introIdx, setIntroIdx] = useState(0)
  const [qIdx, setQIdx] = useState(0)
  const [questions, setQuestions] = useState([])
  const [answers, setAnswers] = useState({})
  const [analysis, setAnalysis] = useState(null)
  const [userId, setUserId] = useState('')
  const [busy, setBusy] = useState(false)
  const [mouthAlt, setMouthAlt] = useState(false)
  // Share state
  const [shareOpen, setShareOpen] = useState(false)
  const [shareImgUrl, setShareImgUrl] = useState('')
  const [sharing, setSharing] = useState(false)
  const [generatingPdf, setGeneratingPdf] = useState(false)
  const [previewing, setPreviewing] = useState(false)
  const [generatingReport, setGeneratingReport] = useState(false)
  // Results gating: first show actions, then confirmation step
  const [resultsStep, setResultsStep] = useState('actions') // 'actions' | 'confirm'

  const ZELIA_COLORS = {
    bg: '#f7f9fc',
    accent1: '#c1ff72',
    accent2: '#f68fff',
    text: '#000000'
  }
  const ZELIA_LOGO_PATH = '/assets/images/logo-dark.png'
  const ZELIA_IG_HANDLE = '@zelia' // change to the official handle when known

  // Fallback jobs by MBTI code (FR). Minimal curated list per type.
  const MBTI_JOBS_FR = {
    ISTJ: ['Comptable', 'Contrôleur qualité', 'Analyste financier', 'Gestionnaire logistique', 'Responsable conformité'],
    ISFJ: ['Assistant social', 'Infirmier', 'Gestionnaire RH', 'Coordinateur pédagogique', 'Orthophoniste'],
    INFJ: ['Psychologue', 'Coach', 'Rédacteur', 'UX Writer', 'Conseiller d’orientation'],
    INTJ: ['Data Scientist', 'Architecte logiciel', 'Consultant stratégie', 'Chercheur', 'Chef de produit technique'],
    ISTP: ['Technicien industriel', 'Développeur embarqué', 'Mécanicien de précision', 'Pilote de ligne', 'Secops Analyst'],
    ISFP: ['Designer graphique', 'Photographe', 'Styliste', 'Illustrateur', 'Ergonome'],
    INFP: ['Écrivain', 'Psychologue', 'UX Designer', 'Métiers de l’édition', 'Chargé de communication'],
    INTP: ['Développeur', 'Chercheur IA', 'Analyste systèmes', 'Ingénieur R&D', 'Architecte données'],
    ESTP: ['Commercial', 'Entrepreneur', 'Chef de chantier', 'Événementiel', 'Responsable opérations'],
    ESFP: ['Animateur', 'Community Manager', 'Événementiel', 'Vente retail', 'Chargé de projets culturels'],
    ENFP: ['Créatif publicitaire', 'Chef de projet innovation', 'Conseiller en insertion', 'Chargé de communication', 'Formateur'],
    ENTP: ['Growth Hacker', 'Entrepreneur', 'Consultant innovation', 'Chef de produit', 'Stratège digital'],
    ESTJ: ['Chef de projet', 'Manager logistique', 'Responsable qualité', 'Administrateur systèmes', 'Gestion de production'],
    ESFJ: ['RH', 'Conseiller clientèle', 'Enseignant', 'Coordinateur événementiel', 'Chargé de mission associative'],
    ENFJ: ['Coach', 'Formateur', 'Consultant RH', 'Responsable partenariats', 'Chef de projet communautaire'],
    ENTJ: ['Directeur produit', 'Consultant stratégie', 'Sales Manager', 'Entrepreneur', 'Project Director']
  }

  function extractMbtiCode(personalityType) {
    if (!personalityType) return null
    const m = personalityType.match(/\(([IE][NS][FT][JP])\)/i)
    return m ? m[1].toUpperCase() : null
  }

  function truncate(text, max = 34) {
    if (!text || typeof text !== 'string') return ''
    return text.length > max ? text.slice(0, max - 1) + '…' : text
  }

  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) { navigate('/login'); return }
        setUserId(user.id)
        const pRes = await usersAPI.getProfile().catch(() => null)
        if (!mounted) return
        const prof = pRes?.data?.profile || null
        setProfile(prof)
        setAvatarUrl(buildAvatarFromProfile(prof, user.id))
        // Load MBTI questions
        const qRes = await apiClient.get('/questionnaire/questions', { params: { type: 'mbti', _: Date.now() } })
        const list = Array.isArray(qRes?.data) ? qRes.data : []
        setQuestions(list)
      } catch (e) {
        console.error('Niv4 init error', e)
        if (!mounted) return
        setError('Erreur de chargement')
      } finally {
        if (mounted) setLoading(false)
      }
    })()
    return () => { mounted = false }
  }, [navigate])

  const messages = useMemo(() => ([
    { text: "Yo, niveau 4 ! On passe au MBTI pour mieux cerner ton style.", durationMs: 3500 },
    { text: "Je te pose quelques questions, tu réponds à l'instinct.", durationMs: 3500 },
    { text: "Ensuite j'analyse tes réponses et je te sors une analyse MBTI bien complète (≈ 1000 mots).", durationMs: 4500 },
    { text: "Objectif: que tu comprennes comment tu fonctionnes et quels métiers te collent à la peau.", durationMs: 4500 },
    { text: "Prêt(e) ? On démarre tranquille.", durationMs: 2500 },
  ]), [])
  const current = messages[introIdx] || { text: '', durationMs: 1500 }
  const { text: typed, done: typedDone, skip } = useTypewriter(current.text, current.durationMs)

  useEffect(() => {
    if (phase !== 'intro' || typedDone) return
    const id = setInterval(() => setMouthAlt(v => !v), 200)
    return () => clearInterval(id)
  }, [phase, typedDone])

  function nextIntro() {
    if (!typedDone) { skip(); return }
    if (introIdx + 1 < messages.length) {
      setIntroIdx(introIdx + 1)
    } else {
      setPhase('quiz')
      setQIdx(0)
    }
  }

  const choices = useMemo(() => ['Oui', 'Un peu', 'Je ne sais pas', 'Pas trop', 'Non'], [])
  const currentQ = questions[qIdx]
  const displayText = useMemo(() => {
    const raw = (currentQ && (currentQ.content ?? currentQ.contenu))
    if (typeof raw !== 'string') return raw
    if (raw.startsWith('(')) {
      const i1 = raw.indexOf('"'); const i2 = raw.indexOf('"', i1 + 1)
      if (i1 !== -1 && i2 !== -1) return raw.slice(i1 + 1, i2)
    }
    return raw
  }, [currentQ])

  const progress = questions.length ? Math.round(((qIdx + 1) / questions.length) * 100) : 0
  const answered = currentQ ? answers[currentQ.id] != null : false

  async function submitMbti() {
    setBusy(true)
    try {
      const payload = { answers: Object.entries(answers).map(([qid, ans]) => ({ question_id: Number(qid), answer: ans })), questionnaireType: 'mbti' }
      await apiClient.post('/questionnaire/submit?type=mbti', payload)
      const resp = await apiClient.post('/analysis/generate-analysis-by-type', { userId, questionnaireType: 'mbti' })
      const data = resp?.data?.analysis
      if (data) setAnalysis(data)
      setPhase('results')
    } catch (e) {
      console.error('MBTI submit/analyze error', e)
      setError("Impossible de générer l'analyse MBTI")
    } finally {
      setBusy(false)
    }
  }

  function finishLevel() {
    setPhase('success')
    // Update progression: ensure level >= 4
    ;(async () => {
      try {
        const progRes = await progressionAPI.get().catch(() => ({ data: { level: 1, xp: 0, quests: [], perks: [] } }))
        const current = progRes?.data || { level: 1, xp: 0, quests: [], perks: [] }
        const newXp = (current.xp || 0) + 180
        const newLevel = Math.max(4, current.level || 1)
        await progressionAPI.update({ level: newLevel, xp: newXp, quests: current.quests || [], perks: current.perks || [] })
      } catch (e) { console.warn('Progression update failed (non-blocking):', e) }
    })()
  }

  // Utilities for share image
  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image()
      img.crossOrigin = 'anonymous'
      img.onload = () => resolve(img)
      img.onerror = reject
      img.src = src
    })
  }

  function extractTopQualities(txt, max = 3) {
    if (!txt || typeof txt !== 'string') return []
    const lines = txt.split(/\r?\n/)
      .map(s => s.trim())
      .filter(Boolean)
    const bullets = []
    for (const line of lines) {
      let cleaned = line.replace(/^[-•–]\s+/, '').replace(/^\d+\.\s*/, '').trim()
      // If the item looks like "Label: value", keep only the label part for compact pills
      if (cleaned.includes(':')) cleaned = cleaned.split(':')[0].trim()
      if (cleaned.length > 60) cleaned = cleaned.slice(0, 57) + '…'
      if (cleaned) bullets.push(cleaned)
      if (bullets.length >= max) break
    }
    return bullets
  }

  async function ensureCanvasFontsLoaded() {
    try {
      // Load both ClashGroteskSemibold and Bricolage Grotesque
      const clashFace = new FontFace('ClashGroteskSemibold', 'url(/static/fonts/ClashGroteskSemibold.woff2) format("woff2")')
      await clashFace.load()
      document.fonts.add(clashFace)
      
      // Try to load Bricolage Grotesque if available
      try {
        const bricolageFace = new FontFace('Bricolage Grotesque', 'url("https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,200..800&display=swap")')
        await bricolageFace.load()
        document.fonts.add(bricolageFace)
      } catch (bricolageError) {
        console.warn('Bricolage Grotesque not available, using ClashGroteskSemibold')
      }
      
      // Warm up with font loads
      await document.fonts.load('800 88px "Bricolage Grotesque", "ClashGroteskSemibold"')
      await document.fonts.load('800 64px "Bricolage Grotesque", "ClashGroteskSemibold"')
      await document.fonts.load('800 48px "Bricolage Grotesque", "ClashGroteskSemibold"')
    } catch (e) {
      console.warn('Canvas font load failed, falling back to system fonts', e)
    }
  }

  async function generateShareImage(analysisSnapshot) {
    try {
      await ensureCanvasFontsLoaded()
      const width = 1080, height = 1920 // Instagram story
      const canvas = document.createElement('canvas')
      canvas.width = width; canvas.height = height
      const ctx = canvas.getContext('2d')

      // Background gradient
      const gradient = ctx.createLinearGradient(0, 0, 0, height)
      gradient.addColorStop(0, ZELIA_COLORS.bg)
      gradient.addColorStop(1, '#ffffff')
      ctx.fillStyle = gradient
      ctx.fillRect(0, 0, width, height)

      // Top accent bar - minimal
      ctx.fillStyle = ZELIA_COLORS.accent1
      ctx.fillRect(0, 0, width, 80)

      // Bottom accent bar with logo - green background
      ctx.fillStyle = '#c1ff72'
      ctx.fillRect(0, height - 200, width, 200)

      // Logo at bottom-center on green background
      let logoImg = null
      try { 
        logoImg = await loadImage(ZELIA_LOGO_PATH) 
        const logoScale = 0.6
        const logoW = 280 * logoScale
        const logoH = (logoImg.height / logoImg.width) * logoW
        const logoX = (width - logoW) / 2
        const logoY = height - 180 + (180 - logoH) / 2  // Center in bottom green bar
        ctx.drawImage(logoImg, logoX, logoY, logoW, logoH)
      } catch (logoError) {
        console.warn('Logo not loaded', logoError)
      }

      // Main title - centered in middle, larger
      const title = analysisSnapshot?.personalityType || 'Profil MBTI'
      ctx.fillStyle = ZELIA_COLORS.text
      ctx.font = '800 120px "Bricolage Grotesque", "ClashGroteskSemibold", system-ui, -apple-system, sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'top'
      ctx.letterSpacing = '-0.02em'
      
      // Word wrap for long titles
      const maxTitleWidth = width - 80
      const words = title.split(' ')
      let line = ''
      let titleY = 630  // Slightly higher
      
      for (let n = 0; n < words.length; n++) {
        const testLine = line + words[n] + ' '
        const metrics = ctx.measureText(testLine)
        const testWidth = metrics.width
        
        if (testWidth > maxTitleWidth && n > 0) {
          ctx.fillText(line.trim(), width / 2, titleY)
          line = words[n] + ' '
          titleY += 130
        } else {
          line = testLine
        }
      }
      ctx.fillText(line.trim(), width / 2, titleY)

      // Avatar - centered at top, slightly higher
      try {
        const av = await loadImage(avatarUrl)
        const avSize = 420
        const avX = (width - avSize) / 2, avY = 180
        
        // Add subtle shadow
        ctx.save()
        ctx.shadowColor = 'rgba(0,0,0,0.15)'
        ctx.shadowBlur = 20
        ctx.shadowOffsetY = 10
        
        ctx.beginPath()
        ctx.arc(avX + avSize/2, avY + avSize/2, avSize/2, 0, Math.PI * 2)
        ctx.closePath()
        ctx.clip()
        ctx.drawImage(av, avX, avY, avSize, avSize)
        ctx.restore()
        
        // Add border ring
        ctx.beginPath()
        ctx.arc(avX + avSize/2, avY + avSize/2, avSize/2 + 8, 0, Math.PI * 2)
        ctx.strokeStyle = ZELIA_COLORS.accent1
        ctx.lineWidth = 6
        ctx.stroke()
      } catch (avError) {
        console.warn('Avatar not loaded', avError)
      }

      // Qualities section - centered in middle
      const qualities = extractTopQualities(analysisSnapshot?.skillsAssessment || '', 3)
      ctx.font = '800 80px "Bricolage Grotesque", "ClashGroteskSemibold", system-ui, sans-serif'
      ctx.fillStyle = ZELIA_COLORS.text
      ctx.textAlign = 'center'
      ctx.letterSpacing = '-0.02em'
      const qualitiesY = titleY + 150
      ctx.fillText('Qualités', width / 2, qualitiesY)
      
      // Quality pills - centered
      ctx.font = '600 40px system-ui, -apple-system, sans-serif'
      let qy = qualitiesY + 80
      qualities.forEach((q, i) => {
        const padX = 30, padY = 20
        const textWidth = ctx.measureText(q).width
        const pillW = Math.min(textWidth + padX * 2, width - 80)
        const pillH = 70
        const x = (width - pillW) / 2, y = qy
        
        // Gradient pill background
        const pillGradient = ctx.createLinearGradient(x, y, x + pillW, y + pillH)
        const color1 = i % 2 === 0 ? ZELIA_COLORS.accent1 : ZELIA_COLORS.accent2
        const color2 = i % 2 === 0 ? '#a8f542' : '#e859d9'
        pillGradient.addColorStop(0, color1)
        pillGradient.addColorStop(1, color2)
        
        ctx.fillStyle = pillGradient
        ctx.beginPath()
        const r = 35
        ctx.moveTo(x + r, y)
        ctx.arcTo(x + pillW, y, x + pillW, y + pillH, r)
        ctx.arcTo(x + pillW, y + pillH, x, y + pillH, r)
        ctx.arcTo(x, y + pillH, x, y, r)
        ctx.arcTo(x, y, x + pillW, y, r)
        ctx.closePath()
        ctx.fill()
        
        // Quality text - centered within the pill, 15px higher total
        ctx.fillStyle = '#000'
        ctx.font = '600 40px system-ui, -apple-system, sans-serif'
        ctx.textAlign = 'center'
        ctx.fillText(q, x + pillW / 2, y + padY + 10)
        qy += pillH + 25
      })

      // Jobs section - centered in middle
      let jobs = Array.isArray(analysisSnapshot?.jobRecommendations) ? analysisSnapshot.jobRecommendations.slice(0, 3) : []
      const mbtiCode = extractMbtiCode(analysisSnapshot?.personalityType)
      if (!jobs.length && mbtiCode && MBTI_JOBS_FR[mbtiCode]) {
        jobs = MBTI_JOBS_FR[mbtiCode].slice(0, 3).map(t => ({ title: t }))
      }
      
      const jobsY = qy + 20
      ctx.fillStyle = ZELIA_COLORS.text
      ctx.font = '800 80px "Bricolage Grotesque", "ClashGroteskSemibold", system-ui, sans-serif'
      ctx.textAlign = 'center'
      ctx.letterSpacing = '-0.02em'
      ctx.fillText('Top métiers', width / 2 + 20, jobsY)
      
      // Job list - centered, larger typography
      ctx.font = '600 50px system-ui, -apple-system, sans-serif'
      ctx.fillStyle = ZELIA_COLORS.text
      let jy = jobsY + 80
      jobs.forEach((j, i) => {
        const title = typeof j === 'string' ? j : j?.title || ''
        if (title) {
          const truncatedTitle = truncate(title, 35)
          
          // Number circle - centered
          ctx.save()
          ctx.fillStyle = i % 2 === 0 ? ZELIA_COLORS.accent1 : ZELIA_COLORS.accent2
          const circleX = (width / 2) - 150
          const circleY = jy + 25
          ctx.beginPath()
          ctx.arc(circleX, circleY, 25, 0, Math.PI * 2)
          ctx.fill()
          
          ctx.fillStyle = '#000'
          ctx.font = '700 28px system-ui, sans-serif'
          ctx.textAlign = 'center'
          ctx.fillText((i + 1).toString(), circleX, circleY - 2)
          ctx.restore()
          
          // Job title - centered, shifted 30px right total, raised 30px
          ctx.fillStyle = ZELIA_COLORS.text
          ctx.font = '600 50px system-ui, -apple-system, sans-serif'
          ctx.textAlign = 'center'
          ctx.fillText(truncatedTitle, width / 2 + 30, jy + 5)
          jy += 70
        }
      })

      return canvas.toDataURL('image/png')
    } catch (e) {
      console.error('Share image generation failed', e)
      return ''
    }
  }

  // Generate a portrait PDF (A4) with the generated image filling the page
  async function generatePdfFromImage(dataUrl) {
    try {
      setGeneratingPdf(true)
      // Create jsPDF in portrait, mm, A4
      const pdf = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' })
      const pageWidth = pdf.internal.pageSize.getWidth()
      const pageHeight = pdf.internal.pageSize.getHeight()

      // Image is 1080x1920 (ratio 9:16). Fit to A4 (210x297) preserving aspect
      const img = new Image()
      const blob = await (await fetch(dataUrl)).blob()
      const imgUrl = URL.createObjectURL(blob)
      await new Promise((res, rej) => { img.onload = () => res(); img.onerror = rej; img.src = imgUrl })
      const imgW = img.width, imgH = img.height
      const imgRatio = imgW / imgH
      const pageRatio = pageWidth / pageHeight
      let drawW, drawH
      if (imgRatio > pageRatio) {
        drawW = pageWidth
        drawH = drawW / imgRatio
      } else {
        drawH = pageHeight
        drawW = drawH * imgRatio
      }
      const x = (pageWidth - drawW) / 2
      const y = (pageHeight - drawH) / 2
      pdf.addImage(dataUrl, 'PNG', x, y, drawW, drawH, undefined, 'FAST')
      pdf.save('zelia-mbti-resultat.pdf')
      URL.revokeObjectURL(imgUrl)
    } catch (e) {
      console.error('PDF generation failed', e)
    } finally {
      setGeneratingPdf(false)
    }
  }

  async function onPreview() {
    if (!analysis) return
    setPreviewing(true)
    try {
      let snapshot = analysis
      if (!snapshot.jobRecommendations || snapshot.jobRecommendations.length === 0) {
        try {
          const res = await apiClient.get('/analysis/my-results')
          const jr = res?.data?.results?.jobRecommendations
          if (Array.isArray(jr) && jr.length) {
            snapshot = { ...(snapshot || {}), jobRecommendations: jr }
          }
        } catch {}
      }
      const dataUrl = await generateShareImage(snapshot)
      if (dataUrl) {
        setShareImgUrl(dataUrl)
        setShareOpen(true)
      }
    } finally {
      setPreviewing(false)
    }
  }

  async function onShare() {
    if (!analysis) return
    setSharing(true)
    try {
      let snapshot = analysis
      // If jobs are missing, try to fetch from my-results as a fallback
      if (!snapshot.jobRecommendations || snapshot.jobRecommendations.length === 0) {
        try {
          const res = await apiClient.get('/analysis/my-results')
          const jr = res?.data?.results?.jobRecommendations
          if (Array.isArray(jr) && jr.length) {
            snapshot = { ...(snapshot || {}), jobRecommendations: jr }
          }
        } catch (e) {
          console.warn('Fallback fetch for job recommendations failed', e)
        }
      }
      const dataUrl = await generateShareImage(snapshot)
      if (!dataUrl) throw new Error('no image')
      // Try Web Share API with files
      const res = await fetch(dataUrl)
      const blob = await res.blob()
      const file = new File([blob], 'zelia-mbti-story.png', { type: 'image/png' })
      // Prefer navigator.canShare for files
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          title: analysis?.personalityType || 'Profil MBTI',
          text: `Mon profil MBTI sur Zélia — ${analysis?.personalityType || ''}`.trim(),
          files: [file]
        })
        setSharing(false)
        return
      }
      // Fallback: open modal with preview + download
      setShareImgUrl(dataUrl)
      setShareOpen(true)
    } catch (e) {
      console.warn('Native share failed, falling back to modal', e)
      const dataUrl = await generateShareImage(analysis)
      setShareImgUrl(dataUrl)
      setShareOpen(true)
    } finally {
      setSharing(false)
    }
  }

  async function generatePdfReport() {
    if (!analysis) return
    try {
      setGeneratingReport(true)
      const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' })
      const margin = 15
      const pageWidth = doc.internal.pageSize.getWidth()
      const usable = pageWidth - margin * 2
      let y = margin

      // Header
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(18)
      const title = analysis?.personalityType ? `Résultats MBTI — ${analysis.personalityType}` : 'Résultats MBTI'
      doc.text(title, margin, y)
      y += 8
      doc.setDrawColor(0)
      doc.setLineWidth(0.5)
      doc.line(margin, y, pageWidth - margin, y)
      y += 6

      // Section: Analyse de personnalité
      if (analysis?.personalityAnalysis) {
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(14)
        doc.text('Analyse de personnalité', margin, y)
        y += 6
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(11)
        const lines = doc.splitTextToSize(analysis.personalityAnalysis, usable)
        for (const line of lines) {
          if (y > 280) { doc.addPage(); y = margin }
          doc.text(line, margin, y)
          y += 6
        }
        y += 2
      }

      // Section: Points forts (skillsAssessment)
      if (analysis?.skillsAssessment) {
        if (y > 270) { doc.addPage(); y = margin }
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(14)
        doc.text('Points forts', margin, y)
        y += 6
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(11)
        const lines = doc.splitTextToSize(analysis.skillsAssessment, usable)
        for (const line of lines) {
          if (y > 280) { doc.addPage(); y = margin }
          doc.text(line, margin, y)
          y += 6
        }
        y += 2
      }

      // Section: Recommandations d'emploi
      if (Array.isArray(analysis?.jobRecommendations) && analysis.jobRecommendations.length) {
        if (y > 270) { doc.addPage(); y = margin }
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(14)
        doc.text("Recommandations d'emploi", margin, y)
        y += 6
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(11)
        const jobs = analysis.jobRecommendations
        for (let i = 0; i < jobs.length; i++) {
          const j = jobs[i]
          const title = typeof j === 'string' ? j : (j?.title || '')
          if (!title) continue
          if (y > 275) { doc.addPage(); y = margin }
          doc.setFont('helvetica', 'bold')
          doc.text(`• ${title}`, margin, y)
          y += 6
          doc.setFont('helvetica', 'normal')
          if (Array.isArray(j?.skills) && j.skills.length) {
            const line = `Compétences clés: ${j.skills.join(', ')}`
            const lines = doc.splitTextToSize(line, usable)
            for (const ln of lines) {
              if (y > 280) { doc.addPage(); y = margin }
              doc.text(ln, margin + 4, y)
              y += 6
            }
          }
          y += 2
        }
      }

      // Footer
      doc.setFont('helvetica', 'italic')
      doc.setFontSize(9)
      const footer = 'Généré par Zélia — Niveau 4 MBTI'
      const pageCount = doc.getNumberOfPages()
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i)
        const w = doc.getTextWidth(footer)
        doc.text(footer, (pageWidth - w) / 2, 295)
      }

      doc.save('zelia-mbti-resultats.pdf')
    } catch (e) {
      console.error('PDF report generation failed', e)
    } finally {
      setGeneratingReport(false)
    }
  }

  if (loading) {
    return (
      <div className="p-6 text-center">
        <div className="inline-block w-6 h-6 border-2 border-black border-t-transparent rounded-full animate-spin" />
        <p className="mt-2 text-text-secondary">Chargement…</p>
      </div>
    )
  }
  if (error) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 text-red-800 p-4 rounded-lg">{error}</div>
      </div>
    )
  }

  return (
    <div className="p-4 md:p-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        {/* Left: Avatar + Dialogue / Controls */}
        <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-card">
          <div className="flex flex-col md:flex-row items-center md:items-start gap-6">
            <img src={avatarUrl} alt="Avatar" className="w-40 h-40 sm:w-48 sm:h-48 md:w-64 md:h-64 rounded-2xl border border-gray-100 shadow-sm object-contain bg-white mx-auto md:mx-0" />
            <div className="flex-1 w-full">
              <div className="relative bg-black text-white rounded-2xl p-4 md:p-5 w-full">
                <div className="text-base md:text-lg leading-relaxed whitespace-pre-wrap min-h-[3.5rem]">
                  {phase === 'intro' ? (
                    <>{typed}</>
                  ) : phase === 'quiz' ? (
                    <>Réponds aux questions MBTI, puis termine pour lancer l'analyse.</>
                  ) : phase === 'generating' ? (
                    <>J'analyse tes réponses…</>
                  ) : phase === 'results' ? (
                    <>
                      {resultsStep === 'confirm'
                        ? "Hésite pas à nous taguer dans ta story pour qu'on te republie si t'as aimé les résultats"
                        : <>Voici ton analyse MBTI. Si tu veux, tu peux la partager en story et me taguer <strong>@zelia</strong> pour que je la reposte ✨</>}
                    </>
                  ) : phase === 'success' ? (
                    <>Niveau 4 réussi !</>
                  ) : null}
                </div>
                <div className="absolute -left-2 top-6 w-0 h-0 border-t-8 border-b-8 border-r-8 border-t-transparent border-b-transparent border-r-black" />
              </div>

              {phase === 'intro' && (
                <div className="mt-4">
                  <button onClick={nextIntro} className="px-4 py-2 rounded-lg bg-[#c1ff72] text-black border border-gray-200 w-full sm:w-auto">Suivant</button>
                </div>
              )}

              {phase === 'results' && (
                <div className="mt-4">
                  {resultsStep === 'actions' ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
                      <button onClick={onPreview} disabled={previewing} className="w-full h-12 px-3 rounded-lg bg-white text-gray-900 border border-gray-300">
                        <span className="w-full h-full flex items-center justify-center gap-2">
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4"><path d="M2 12s4-8 10-8 10 8 10 8-4 8-10 8S2 12 2 12Z" strokeLinecap="round" strokeLinejoin="round"/><circle cx="12" cy="12" r="3"/></svg>
                          <span className="font-medium">{previewing ? 'Préparation…' : 'Aperçu'}</span>
                        </span>
                      </button>
                      <button onClick={generatePdfReport} disabled={generatingReport} className="w-full h-12 px-3 rounded-lg bg-white text-gray-900 border border-gray-300">
                        <span className="w-full h-full flex items-center justify-center gap-2">
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/><path d="M8 14h8M8 18h5"/></svg>
                          <span className="font-medium">{generatingReport ? 'Création du PDF…' : 'PDF'}</span>
                        </span>
                      </button>
                      <button onClick={onShare} disabled={sharing} className="w-full h-12 px-3 rounded-lg bg-[#f68fff] text-black border border-gray-200">
                        <span className="w-full h-full flex items-center justify-center gap-2">
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4"><path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7"/><path d="M12 16V4"/><path d="m8 8 4-4 4 4"/></svg>
                          <span className="font-medium">{sharing ? 'Préparation…' : 'Partager'}</span>
                        </span>
                      </button>
                      <button onClick={() => setResultsStep('confirm')} className="w-full h-12 px-3 rounded-lg bg-[#c1ff72] text-black border border-gray-200">
                        <span className="w-full h-full flex items-center justify-center gap-2">
                          <span className="font-medium">Continuer</span>
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4"><path d="m9 18 6-6-6-6" strokeLinecap="round" strokeLinejoin="round"/></svg>
                        </span>
                      </button>
                    </div>
                  ) : (
                    <div className="flex justify-end">
                      <button onClick={finishLevel} className="px-4 py-2 rounded-lg bg-[#c1ff72] text-black border border-gray-200">Valider et terminer</button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right: Quiz or Results */}
        <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-card">
          {phase === 'quiz' && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-xl font-bold">Test de personnalité MBTI</h2>
                {(() => {
                  const startNum = 3
                  const qLen = questions.length || 0
                  // Aim total to 40 when plausible, else fall back to shifted length
                  const total = (qLen >= 38 && qLen <= 40) ? 40 : Math.max(startNum - 1 + qLen, startNum)
                  const current = startNum + qIdx
                  return (
                    <div className="text-sm text-text-secondary">{current} / {total} • {progress}%</div>
                  )
                })()}
              </div>
              <div className="mb-4 text-text-primary whitespace-pre-wrap">{displayText}</div>
              <div className="flex flex-wrap gap-2">
                {choices.map((opt, i) => (
                  <button key={i} type="button" onClick={() => setAnswers({ ...answers, [currentQ?.id]: opt })}
                          className={`px-3 py-2 rounded-lg border ${answers[currentQ?.id]===opt ? 'border-black bg-black text-white':'border-line'}`}>
                    {opt}
                  </button>
                ))}
              </div>

              <div className="flex items-center justify-between mt-6">
                <button type="button" className="h-10 px-4 rounded-lg border border-line disabled:opacity-50" onClick={() => setQIdx(i => Math.max(0, i-1))} disabled={qIdx===0}>Précédent</button>
                {qIdx < questions.length - 1 ? (
                  <button type="button" className="h-10 px-4 rounded-lg bg-black text-white disabled:opacity-50" onClick={() => setQIdx(i => Math.min(questions.length-1, i+1))} disabled={!answered}>Suivant</button>
                ) : (
                  <button type="button" className="h-10 px-4 rounded-lg bg-black text-white disabled:opacity-50" onClick={() => { setPhase('generating'); submitMbti() }} disabled={!answered || busy}>{busy ? 'Analyse…' : 'Terminer'}</button>
                )}
              </div>
            </div>
          )}

          {phase === 'results' && (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-bold">Mes Résultats (MBTI)</h2>
                <p className="text-text-secondary">Analyse personnalisée de ton test MBTI</p>
              </div>

              <section className="bg-surface border border-line rounded-xl shadow-card p-6">
                <h3 className="text-lg font-semibold mb-2">Analyse de personnalité</h3>
                <div className="whitespace-pre-wrap text-gray-800">{analysis?.personalityAnalysis || '—'}</div>
              </section>

              {Array.isArray(analysis?.jobRecommendations) && analysis.jobRecommendations.length > 0 && (
                <section className="bg-surface border border-line rounded-xl shadow-card p-6">
                  <h3 className="text-lg font-semibold mb-4">Recommandations d'emploi</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {analysis.jobRecommendations.map((job, i) => (
                      <div key={i} className="bg-white border border-gray-200 rounded-lg p-4">
                        <h4 className="font-semibold mb-2">{job.title}</h4>
                        {!!(job.skills?.length) && (
                          <ul className="list-disc list-inside text-sm text-gray-700">
                            {job.skills.map((s, j) => <li key={j}>{s}</li>)}
                          </ul>
                        )}
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* No study recommendations for MBTI requirements */}
            </div>
          )}
        </div>
      </div>

      {/* Success overlay */}
      {phase === 'success' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="relative bg-white border border-gray-200 rounded-2xl p-8 shadow-2xl text-center max-w-md w-11/12">
            <div className="absolute -top-5 left-1/2 -translate-x-1/2 w-10 h-10 bg-[#c1ff72] rounded-full flex items-center justify-center shadow-md animate-bounce">🏆</div>
            <h3 className="text-2xl font-extrabold mb-2">Niveau 4 réussi !</h3>
            <p className="text-text-secondary mb-4">Bravo, tu as complété le test MBTI et découvert ton profil.</p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <button onClick={() => navigate('/app/activites')} className="px-4 py-2 rounded-lg bg-[#c1ff72] text-black border border-gray-200">Retour aux activités</button>
              <button onClick={() => navigate('/app/results')} className="px-4 py-2 rounded-lg bg-white text-gray-900 border border-gray-300">Voir mes résultats</button>
            </div>
            <div className="pointer-events-none absolute inset-0 overflow-hidden">
              <div className="absolute w-2 h-2 bg-pink-400 rounded-full left-6 top-8 animate-ping" />
              <div className="absolute w-2 h-2 bg-yellow-400 rounded-full right-8 top-10 animate-ping" />
              <div className="absolute w-2 h-2 bg-blue-400 rounded-full left-10 bottom-8 animate-ping" />
              <div className="absolute w-2 h-2 bg-green-400 rounded-full right-6 bottom-10 animate-ping" />
            </div>
          </div>
        </div>
      )}

      {/* Share Preview Modal */}
      {shareOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 overscroll-contain" onClick={() => setShareOpen(false)}>
          <div
            className="relative bg-white rounded-2xl shadow-2xl w-[92%] max-w-[360px] sm:max-w-[420px] md:max-w-[560px] lg:max-w-[720px] p-4 md:p-5 border border-gray-200 max-h-[88vh] sm:max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close button */}
            <button
              onClick={() => setShareOpen(false)}
              aria-label="Fermer"
              className="absolute top-3 right-3 h-8 w-8 rounded-full bg-black text-white flex items-center justify-center shadow-sm hover:opacity-90"
            >
              ✕
            </button>

            <h3 className="text-lg font-bold pr-8">Prévisualisation à partager</h3>

            {shareImgUrl ? (
              <img src={shareImgUrl} alt="Zélia MBTI Story" className="mt-3 w-full h-auto rounded-lg border border-gray-200" />
            ) : (
              <div className="text-center py-10">Génération de l'image…</div>
            )}

            <div className="flex items-center justify-center gap-6 mt-3 opacity-80">
              <img src="/assets/images/social/instagram.svg" alt="Instagram" className="w-7 h-7" />
              <img src="/assets/images/social/twitter.svg" alt="Twitter" className="w-7 h-7" />
              <img src="/assets/images/social/snapchat.svg" alt="Snapchat" className="w-7 h-7" />
            </div>
            <p className="mt-3 text-sm text-gray-600">Astuce: Partage la story sur Instagram et tag {ZELIA_IG_HANDLE} pour qu'on puisse la republier.</p>

            {/* Sticky action bar */}
            <div className="sticky bottom-0 pt-3 mt-3 bg-white/95 supports-[backdrop-filter]:bg-white/80 backdrop-blur border-t border-gray-200">
              <div className="flex flex-col sm:flex-row gap-2 justify-end">
                <div className="flex-1 text-left">
                  {shareImgUrl && (
                    <button onClick={() => generatePdfFromImage(shareImgUrl)} disabled={generatingPdf} className="px-4 py-2 rounded-lg bg-white text-gray-900 border border-gray-300 mr-2">{generatingPdf ? 'Création du PDF…' : 'Télécharger PDF'}</button>
                  )}
                </div>
                {shareImgUrl && (
                  <a href={shareImgUrl} download="zelia-mbti-story.png" className="px-4 py-2 rounded-lg bg-black text-white border border-gray-200">Enregistrer l'image</a>
                )}
                {shareImgUrl && (
                  <button onClick={async () => { try { const res = await fetch(shareImgUrl); const blob = await res.blob(); const file = new File([blob], 'zelia-mbti-story.png', { type: 'image/png' }); if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ title: analysis?.personalityType || 'Profil MBTI', text: `Mon profil MBTI sur Zélia — ${analysis?.personalityType || ''}`.trim(), files: [file] }); setShareOpen(false) } else { alert('Le partage natif n\'est pas supporté sur cet appareil. Vous pouvez enregistrer l\'image puis la partager manuellement.') } } catch (e) { console.warn('Share from modal failed', e) } }} className="px-4 py-2 rounded-lg bg-[#f68fff] text-black border border-gray-200">Partager</button>
                )}
                <button onClick={() => setShareOpen(false)} className="px-4 py-2 rounded-lg bg-white text-gray-900 border border-gray-300">Fermer</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
