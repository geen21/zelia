import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import apiClient, { analysisAPI, usersAPI } from '../../lib/api'
import { buildAvatarFromProfile } from '../../lib/avatar'
import { XP_PER_LEVEL, levelUp } from '../../lib/progression'
import { supabase } from '../../lib/supabase'
import { generateMbtiShareImage } from '../../lib/shareImage'

let jsPdfFactoryPromise = null
async function loadJsPdf() {
  if (!jsPdfFactoryPromise) {
    jsPdfFactoryPromise = import('jspdf').then((module) => module.jsPDF)
  }
  return jsPdfFactoryPromise
}

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
  const [shareUploading, setShareUploading] = useState(false)
  const [generatingPdf, setGeneratingPdf] = useState(false)
  const [previewing, setPreviewing] = useState(false)
  const [generatingReport, setGeneratingReport] = useState(false)
  // Results gating: first show actions, then confirmation step
  const [resultsStep, setResultsStep] = useState('actions') // 'actions' | 'confirm'

  const ZELIA_IG_HANDLE = '@zelia' // change to the official handle when known

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

  const firstName = useMemo(() => {
    const raw = (profile?.first_name || profile?.prenom || '').trim()
    if (!raw) return ''
    const [first] = raw.split(/\s+/)
    return first
  }, [profile])

  const messages = useMemo(() => {
    const greeting = firstName
      ? `Rebonjour ${firstName}, j'espère que ça va toujours`
      : "Rebonjour, j'espère que ça va toujours"
    return ([
      { text: greeting, durationMs: 2000 },
      { text: "Je vais te poser quelques questions sur toi et je vais te donner des résultats concrets sur qui tu es vraiment, je vais essayer d'analyser en profondeur ta personne", durationMs: 4000 },
      { text: "Je me base sur les travaux de Mayer Briggs, un psychanaliste reconnu pour ses travaux sur l'analyse de personnalité, c'est le test MBTI", durationMs: 3000 },
      { text: "Cela va t'aider à comprendre comment tu fonctionnes et quels métiers te collent à la peau", durationMs: 2000 },
      { text: "Prêt(e) ? On démarre tranquille.", durationMs: 2500 },
    ])
  }, [firstName])
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
      if (data) {
        setAnalysis(data)
        if (data.shareImageUrl) {
          setShareImgUrl(data.shareImageUrl)
        }
      }
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
    ;(async () => {
      try {
  await levelUp({ minLevel: 4, xpReward: XP_PER_LEVEL })
      } catch (e) { console.warn('Progression update failed (non-blocking):', e) }
    })()
  }

  // Utilities for share image

  // Generate a portrait PDF (A4) with the generated image filling the page
  async function generatePdfFromImage(dataUrl) {
    try {
      setGeneratingPdf(true)
      // Create jsPDF in portrait, mm, A4
      const JsPDF = await loadJsPdf()
      const pdf = new JsPDF({ orientation: 'p', unit: 'mm', format: 'a4' })
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
      const url = await ensureShareImage()
      if (url) {
        setShareImgUrl(url)
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
      const url = await ensureShareImage()
      if (!url) throw new Error('no image')

      const response = await fetch(url)
      const blob = await response.blob()
      const file = new File([blob], 'zelia-mbti-story.png', { type: 'image/png' })
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          title: analysis?.personalityType || 'Profil MBTI',
          text: `Mon profil MBTI sur Zélia — ${analysis?.personalityType || ''}`.trim(),
          files: [file]
        })
        return
      }

      setShareImgUrl(url)
      setShareOpen(true)
    } catch (error) {
      console.warn('Native share failed, falling back to modal', error)
      const fallbackUrl = await ensureShareImage()
      if (fallbackUrl) {
        setShareImgUrl(fallbackUrl)
      }
      setShareOpen(true)
    } finally {
      setSharing(false)
    }
  }

  async function generatePdfReport() {
    if (!analysis) return
    try {
      setGeneratingReport(true)
      const JsPDF = await loadJsPdf()
      const doc = new JsPDF({ orientation: 'p', unit: 'mm', format: 'a4' })
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

  const refreshAnalysisSnapshot = useCallback(async () => {
    if (!analysis) return null
    try {
      const resp = await analysisAPI.getMyResults()
      const results = resp?.data?.results || null
      if (!results) return analysis

      const merged = {
        ...analysis,
        personalityType: analysis?.personalityType || results.personalityType || null,
        personalityAnalysis: analysis?.personalityAnalysis || results.personalityAnalysis || null,
        skillsAssessment: analysis?.skillsAssessment || results.skillsAssessment || null,
        jobRecommendations: (Array.isArray(analysis?.jobRecommendations) && analysis.jobRecommendations.length
          ? analysis.jobRecommendations
          : results.jobRecommendations || []),
        shareImageUrl: results.shareImageUrl || analysis?.shareImageUrl || null
      }

      setAnalysis(prev => {
        if (!prev) return merged
        return { ...prev, ...merged }
      })
      return merged
    } catch (error) {
      console.warn('Failed to refresh analysis snapshot', error)
      return analysis
    }
  }, [analysis])

  const ensureShareImage = useCallback(async () => {
    if (!analysis) return ''

    if (analysis.shareImageUrl) {
      setShareImgUrl(analysis.shareImageUrl)
      return analysis.shareImageUrl
    }

    if (shareUploading) {
      return shareImgUrl || ''
    }

    const snapshot = await refreshAnalysisSnapshot() || analysis
    if (!snapshot) return ''

    setShareUploading(true)
    try {
      const dataUrl = await generateMbtiShareImage({ analysis: snapshot, avatarUrl })
      if (!dataUrl) return ''
      setShareImgUrl(dataUrl)

      let remoteUrl = ''
      try {
        const response = await analysisAPI.saveShareImage({
          dataUrl,
          questionnaireType: 'mbti',
          metadata: { source: 'niveau4', userId }
        })
        remoteUrl = response?.data?.url || ''
      } catch (uploadError) {
        console.warn('Failed to upload share image to Cloudinary, using local copy instead', uploadError)
      }

      if (remoteUrl) {
        setAnalysis(prev => (prev ? { ...prev, shareImageUrl: remoteUrl } : prev))
        setShareImgUrl(remoteUrl)
        return remoteUrl
      }

      return dataUrl
    } catch (generationError) {
      console.error('Share image generation failed', generationError)
      return ''
    } finally {
      setShareUploading(false)
    }
  }, [analysis, avatarUrl, refreshAnalysisSnapshot, shareImgUrl, shareUploading, userId])

  useEffect(() => {
    if (phase !== 'results' || !analysis) return
    if (analysis.shareImageUrl) {
      setShareImgUrl(analysis.shareImageUrl)
      return
    }
    ensureShareImage()
  }, [analysis, ensureShareImage, phase])

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
            <img src={avatarUrl} alt="Avatar" className="w-28 h-28 sm:w-36 sm:h-36 md:w-44 md:h-44 lg:w-52 lg:h-52 xl:w-60 xl:h-60 2xl:w-64 2xl:h-64 rounded-2xl border border-gray-100 shadow-sm object-contain bg-white mx-auto md:mx-0" />
            <div className="flex-1 w-full">
              <div className="relative bg-black text-white rounded-2xl p-4 md:p-5 w-full">
                <div className="text-base md:text-lg leading-relaxed whitespace-pre-wrap min-h-[3.5rem]">
                  {phase === 'intro' ? (
                    <>{typed}</>
                  ) : phase === 'quiz' ? (
                    <>Réponds aux questions MBTI, puis termine pour lancer l'analyse.</>
                  ) : phase === 'generating' ? (
                    <>J'analyse vos réponses, cela peut prendre jusqu'à 1 minute, ne rechargez pas la page…</>
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
                  const startNum = 1
                  const qLen = questions.length || 0
                  // Aim total to 40 when plausible, else fall back to shifted length
                  const total = (qLen >= 38 && qLen <= 40) ? 40 : Math.max(startNum - 1 + qLen, startNum)
                  const current = Math.min(total, startNum + qIdx)
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
