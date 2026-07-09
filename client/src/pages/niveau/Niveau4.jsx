import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import apiClient, { analysisAPI, usersAPI } from '../../lib/api'
import { buildAvatarFromProfile } from '../../lib/avatar'
import { XP_PER_LEVEL, levelUp } from '../../lib/progression'
import { supabase } from '../../lib/supabase'
import { generateZeliaShareImage } from '../../lib/shareImage'
import { FaXmark } from 'react-icons/fa6'

let jsPdfFactoryPromise = null
async function loadJsPdf() {
  if (!jsPdfFactoryPromise) {
    jsPdfFactoryPromise = import('jspdf').then((module) => module.jsPDF)
  }
  return jsPdfFactoryPromise
}

function limitWords(text, maxWords) {
  if (!text || typeof text !== 'string' || !maxWords) return text || ''
  const words = text.trim().split(/\s+/)
  if (words.length <= maxWords) return text.trim()
  return `${words.slice(0, maxWords).join(' ')}…`
}

function sanitizeAnalysisPayload(raw) {
  if (!raw || typeof raw !== 'object') return raw
  const sanitized = { ...raw }
  if (sanitized.personalityType && typeof sanitized.personalityType === 'string') {
    sanitized.personalityType = sanitized.personalityType
      .replace(/\(([IE][NS][FT][JP])\)/gi, '')
      .replace(/\b[IE][NS][FT][JP]\b/gi, '')
      .replace(/\s{2,}/g, ' ')
      .trim()
  }
  const jobsArray = Array.isArray(sanitized.jobRecommendations)
    ? sanitized.jobRecommendations.slice(0, 6)
    : []
  sanitized.jobRecommendations = jobsArray

  if (sanitized.personalityAnalysis) {
    sanitized.personalityAnalysis = ensureJobMentions(sanitized.personalityAnalysis, jobsArray)
    sanitized.personalityAnalysis = limitWords(sanitized.personalityAnalysis, 300)
  }
  return sanitized
}

function splitIntoParagraphs(text) {
  if (!text || typeof text !== 'string') return []
  const trimmed = text.trim()
  if (!trimmed) return []
  let blocks = trimmed.split(/\n{2,}/).map((part) => part.trim()).filter(Boolean)
  if (blocks.length > 1) return blocks
  const sentences = trimmed.split(/(?<=[.!?])\s+/).map((sentence) => sentence.trim()).filter(Boolean)
  if (sentences.length <= 2) return [trimmed]
  const grouped = []
  for (let i = 0; i < sentences.length; i += 2) {
    grouped.push(sentences.slice(i, i + 2).join(' '))
  }
  return grouped
}

function formatJobList(titles) {
  const items = (titles || []).map((title) => title.trim()).filter(Boolean)
  if (!items.length) return ''
  if (items.length === 1) return items[0]
  if (items.length === 2) return `${items[0]} et ${items[1]}`
  return `${items.slice(0, -1).join(', ')} et ${items[items.length - 1]}`
}

function ensureJobMentions(text, jobs) {
  if (!text || typeof text !== 'string' || !Array.isArray(jobs) || !jobs.length) return text || ''
  const titles = jobs
    .map((job) => (typeof job === 'string' ? job : job?.title || ''))
    .map((title) => title.trim())
    .filter(Boolean)
  if (!titles.length) return text

  const lower = text.toLowerCase()
  const missing = titles.filter((title) => !lower.includes(title.toLowerCase()))
  if (!missing.length) return text

  const additionList = formatJobList(missing.slice(0, 3))
  if (!additionList) return text

  return `${text.trim()}\n\nCes points se retrouvent dans des métiers comme ${additionList}.`
}

export default function Niveau4() {
  const navigate = useNavigate()
  const [avatarUrl, setAvatarUrl] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [phase, setPhase] = useState('quiz') // 'quiz' -> 'generating' -> 'results'
  const [qIdx, setQIdx] = useState(0)
  const [questions, setQuestions] = useState([])
  const [answers, setAnswers] = useState({})
  const [analysis, setAnalysis] = useState(null)
  const [userId, setUserId] = useState('')
  const [busy, setBusy] = useState(false)
  const [finishing, setFinishing] = useState(false)

  const [shareOpen, setShareOpen] = useState(false)
  const [shareImgUrl, setShareImgUrl] = useState('')
  const [sharing, setSharing] = useState(false)
  const [shareUploading, setShareUploading] = useState(false)
  const [generatingPdf, setGeneratingPdf] = useState(false)
  const [previewing, setPreviewing] = useState(false)
  const [generatingReport, setGeneratingReport] = useState(false)

  const renderParagraphs = (text, emptyLabel = '—') => {
    const paragraphs = splitIntoParagraphs(text)
    if (!paragraphs.length) {
      return [<p key="empty" className="n4-paragraph">{emptyLabel}</p>]
    }
    return paragraphs.map((paragraph, index) => (
      <p key={index} className="n4-paragraph">{paragraph}</p>
    ))
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
        setAvatarUrl(buildAvatarFromProfile(prof, user.id))
        // Load Zélia personality questions (internally typed as "mbti")
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

  const total = useMemo(() => {
    const qLen = questions.length || 0
    return (qLen >= 38 && qLen <= 40) ? 40 : Math.max(qLen, 1)
  }, [questions.length])
  const progress = questions.length ? Math.round(((qIdx + 1) / questions.length) * 100) : 0
  const answered = currentQ ? answers[currentQ.id] != null : false

  function choose(ans) {
    const qid = currentQ?.id
    if (!qid) return
    const newAnswers = { ...answers, [qid]: ans }
    setAnswers(newAnswers)
    const next = qIdx + 1
    if (next < questions.length) setQIdx(next)
  }

  async function submitZeliaProfile() {
    setBusy(true)
    setPhase('generating')
    try {
      const payload = { answers: Object.entries(answers).map(([qid, ans]) => ({ question_id: Number(qid), answer: ans })), questionnaireType: 'mbti' }
      await apiClient.post('/questionnaire/submit?type=mbti', payload)
      const resp = await apiClient.post('/analysis/generate-analysis-by-type', { questionnaireType: 'mbti' })
      const data = resp?.data?.analysis
      if (!data) {
        throw new Error('Empty analysis payload from server')
      }
      const normalized = sanitizeAnalysisPayload(data)
      setAnalysis(normalized)
      setShareImgUrl(normalized.shareImageUrl || '')
      setPhase('results')
      // Persist a marker so the dashboard progress checklist can detect
      // that the personality test has been completed.
      usersAPI.saveExtraInfo([
        {
          question_id: 'niveau4_personality_completed',
          question_text: 'Test de personnalité approfondi complété',
          answer_text: normalized.personalityType || 'Oui'
        }
      ]).catch((err) => console.warn('Persist niveau4 completion failed (non-blocking):', err))
    } catch (e) {
      console.error('Zelia submit/analyze error', e)
      setError("Impossible de générer l'analyse de personnalité")
      setPhase('quiz')
    } finally {
      setBusy(false)
    }
  }

  async function finishLevel() {
    if (finishing) return
    setFinishing(true)
    try {
      await levelUp({ minLevel: 4, xpReward: XP_PER_LEVEL })
    } catch (e) {
      console.warn('Progression update failed (non-blocking):', e)
    } finally {
      navigate('/app/results')
    }
  }

  async function generatePdfFromImage(dataUrl) {
    try {
      setGeneratingPdf(true)
      const JsPDF = await loadJsPdf()
      const pdf = new JsPDF({ orientation: 'p', unit: 'mm', format: 'a4' })
      const pageWidth = pdf.internal.pageSize.getWidth()
      const pageHeight = pdf.internal.pageSize.getHeight()

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
      pdf.save('zelia-profil-zelia.pdf')
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
      const file = new File([blob], 'zelia-profil.png', { type: 'image/png' })
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          title: analysis?.personalityType || 'Profil Zélia',
          text: `Mon profil personnalité Zélia — ${analysis?.personalityType || ''}`.trim(),
          files: [file]
        })
        return
      }

      setShareImgUrl(url)
      setShareOpen(true)
    } catch (error) {
      console.warn('Native share failed, falling back to modal', error)
      const fallbackUrl = await ensureShareImage()
      if (fallbackUrl) setShareImgUrl(fallbackUrl)
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

      doc.setFont('helvetica', 'bold')
      doc.setFontSize(18)
      const title = analysis?.personalityType ? `Profil Zélia — ${analysis.personalityType}` : 'Profil Zélia'
      doc.text(title, margin, y)
      y += 8
      doc.setDrawColor(0)
      doc.setLineWidth(0.5)
      doc.line(margin, y, pageWidth - margin, y)
      y += 6

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
          const jobTitle = typeof j === 'string' ? j : (j?.title || '')
          if (!jobTitle) continue
          if (y > 275) { doc.addPage(); y = margin }
          doc.setFont('helvetica', 'bold')
          doc.text(`• ${jobTitle}`, margin, y)
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

      doc.setFont('helvetica', 'italic')
      doc.setFontSize(9)
      const footer = 'Généré par Zélia — Test de personnalité'
      const pageCount = doc.getNumberOfPages()
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i)
        const w = doc.getTextWidth(footer)
        doc.text(footer, (pageWidth - w) / 2, 295)
      }

      doc.save('zelia-resultats-personnalite.pdf')
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
        jobRecommendations: (Array.isArray(analysis?.jobRecommendations) && analysis.jobRecommendations.length
          ? analysis.jobRecommendations
          : results.jobRecommendations || []),
        shareImageUrl: results.shareImageUrl || analysis?.shareImageUrl || null
      }

      const sanitized = sanitizeAnalysisPayload(merged)
      setAnalysis(prev => (prev ? { ...prev, ...sanitized } : sanitized))
      return sanitized
    } catch (error) {
      console.warn('Failed to refresh analysis snapshot', error)
      return analysis
    }
  }, [analysis])

  const ensureShareImage = useCallback(async (force = false) => {
    if (!analysis) return ''

    if (analysis.shareImageUrl && !force) {
      setShareImgUrl(analysis.shareImageUrl)
      return analysis.shareImageUrl
    }

    if (shareUploading) return shareImgUrl || ''

    const snapshot = await refreshAnalysisSnapshot() || analysis
    if (!snapshot) return ''

    setShareUploading(true)
    try {
      const dataUrl = await generateZeliaShareImage({ analysis: snapshot, avatarUrl })
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analysis, phase])

  if (loading) {
    return (
      <div className="n4-page">
        <style>{styles}</style>
        <div className="n4-card n4-state">
          <div className="n4-spinner" />
          <p>Chargement…</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="n4-page">
        <style>{styles}</style>
        <div className="n4-card n4-state">
          <i className="ph ph-warning-circle" aria-hidden="true" />
          <p>{error}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="n4-page">
      <style>{styles}</style>

      <div className="n4-card n4-header">
        <h1>Test de personnalité</h1>
        <p>Réponds aux questions pour découvrir ton profil Zélia.</p>
      </div>

      {phase === 'quiz' && currentQ && (
        <div className="n4-card">
          <div className="n4-progress">
            <div className="n4-progress-track"><span style={{ width: `${progress}%` }} /></div>
            <span className="n4-progress-label">{Math.min(total, qIdx + 1)} / {total}</span>
          </div>
          <p className="n4-question">{displayText}</p>
          <div className="n4-choices">
            {choices.map((opt) => (
              <button
                key={opt}
                type="button"
                onClick={() => choose(opt)}
                className={`n4-choice${answers[currentQ?.id] === opt ? ' is-selected' : ''}`}
              >
                {opt}
              </button>
            ))}
          </div>
          <div className="n4-nav">
            <button
              type="button"
              className="n4-btn-outline"
              onClick={() => setQIdx((i) => Math.max(0, i - 1))}
              disabled={qIdx === 0}
            >
              Précédent
            </button>
            {qIdx === questions.length - 1 && (
              <button
                type="button"
                className="n4-btn-primary"
                onClick={submitZeliaProfile}
                disabled={!answered || busy}
              >
                {busy ? 'Analyse…' : 'Terminer'}
              </button>
            )}
          </div>
        </div>
      )}

      {phase === 'generating' && (
        <div className="n4-card n4-state">
          <div className="n4-dots" aria-hidden="true"><span /><span /><span /></div>
          <p>On analyse tes réponses, ça peut prendre jusqu'à une minute…</p>
        </div>
      )}

      {phase === 'results' && (
        <>
          <div className="n4-card">
            <h2>Analyse de personnalité</h2>
            <div className="n4-paragraphs">{renderParagraphs(analysis?.personalityAnalysis)}</div>
          </div>

          {analysis?.skillsAssessment && (
            <div className="n4-card">
              <h2>Tes qualités</h2>
              <div className="n4-paragraphs">{renderParagraphs(analysis.skillsAssessment)}</div>
            </div>
          )}

          {Array.isArray(analysis?.jobRecommendations) && analysis.jobRecommendations.length > 0 && (
            <div className="n4-card">
              <h2>Recommandations d'emploi</h2>
              <div className="n4-jobs-grid">
                {analysis.jobRecommendations.map((job, i) => (
                  <div key={i} className="n4-job-card">
                    <h3>{job.title}</h3>
                    {!!(job.skills?.length) && (
                      <ul>{job.skills.map((s, j) => <li key={j}>{s}</li>)}</ul>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="n4-card n4-actions">
            <button type="button" className="n4-btn-outline" onClick={onPreview} disabled={previewing}>
              <i className="ph ph-eye" aria-hidden="true" />
              {previewing ? 'Préparation…' : 'Aperçu'}
            </button>
            <button type="button" className="n4-btn-outline" onClick={generatePdfReport} disabled={generatingReport}>
              <i className="ph ph-file-pdf" aria-hidden="true" />
              {generatingReport ? 'Création du PDF…' : 'PDF'}
            </button>
            <button type="button" className="n4-btn-outline" onClick={onShare} disabled={sharing}>
              <i className="ph ph-share-network" aria-hidden="true" />
              {sharing ? 'Préparation…' : 'Partager'}
            </button>
            <button type="button" className="n4-btn-primary" onClick={finishLevel} disabled={finishing}>
              {finishing ? 'Validation…' : 'Terminer'}
            </button>
          </div>
        </>
      )}

      {shareOpen && (
        <div className="n4-modal-overlay" onClick={() => setShareOpen(false)}>
          <div className="n4-modal" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="n4-modal-close" onClick={() => setShareOpen(false)} aria-label="Fermer">
              <FaXmark />
            </button>
            <h3>Aperçu à partager</h3>
            {shareImgUrl ? (
              <img src={shareImgUrl} alt="Visuel à partager" className="n4-modal-image" />
            ) : (
              <div className="n4-state"><p>Génération de l'image…</p></div>
            )}
            <div className="n4-modal-actions">
              {shareImgUrl && (
                <button type="button" className="n4-btn-outline" onClick={() => generatePdfFromImage(shareImgUrl)} disabled={generatingPdf}>
                  {generatingPdf ? 'Création…' : 'Télécharger PDF'}
                </button>
              )}
              {shareImgUrl && (
                <a href={shareImgUrl} download="zelia-profil.png" className="n4-btn-outline">Enregistrer l'image</a>
              )}
              <button type="button" className="n4-btn-primary" onClick={() => setShareOpen(false)}>Fermer</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const styles = `
.n4-page {
  width: 100%;
  max-width: 760px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 18px;
  padding-bottom: 24px;
  font-family: "Bricolage Grotesque", -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica Neue', Arial, sans-serif;
  color: #000;
}
.n4-card {
  position: relative;
  background: #fff;
  border: 1px solid rgba(0,0,0,.06);
  border-radius: 28px;
  box-shadow: 0 26px 60px -30px rgba(0,0,0,.22), 0 2px 10px rgba(0,0,0,.04);
  padding: clamp(20px, 4vw, 32px);
}
.n4-card::before {
  content: '';
  position: absolute;
  top: 0;
  left: 30px;
  right: 30px;
  height: 6px;
  border-radius: 0 0 8px 8px;
  background: #c1ff72;
}
.n4-header h1 { margin: 0; font-size: 24px; font-weight: 800; line-height: 1.1; }
.n4-header p { margin: 4px 0 0; color: #6b7280; font-size: 14px; }
.n4-card h2 { margin: 0 0 12px; font-size: 18px; font-weight: 800; }
.n4-card h3 { margin: 0 0 6px; font-size: 14px; font-weight: 750; }

.n4-state { text-align: center; display: flex; flex-direction: column; align-items: center; gap: 10px; }
.n4-state i { font-size: 30px; color: #6b7280; }
.n4-state p { margin: 0; color: #6b7280; font-size: 14px; }
.n4-spinner { width: 26px; height: 26px; border: 3px solid rgba(0,0,0,.12); border-top-color: #000; border-radius: 999px; animation: n4Spin .8s linear infinite; }
@keyframes n4Spin { to { transform: rotate(360deg); } }
.n4-dots { display: flex; align-items: center; gap: 9px; }
.n4-dots span { width: 12px; height: 12px; border-radius: 999px; background: #111827; animation: n4Bounce 1s ease-in-out infinite; }
.n4-dots span:nth-child(1) { background: #c1ff72; }
.n4-dots span:nth-child(2) { background: #f68fff; animation-delay: .15s; }
.n4-dots span:nth-child(3) { background: #111827; animation-delay: .3s; }
@keyframes n4Bounce { 0%, 80%, 100% { transform: translateY(0); } 40% { transform: translateY(-10px); } }

.n4-progress { display: flex; align-items: center; gap: 12px; margin-bottom: 18px; }
.n4-progress-track { flex: 1; height: 10px; border-radius: 999px; background: rgba(0,0,0,.08); overflow: hidden; }
.n4-progress-track span { display: block; height: 100%; background: #c1ff72; border-radius: inherit; transition: width .3s ease; }
.n4-progress-label { font-size: 13px; font-weight: 700; color: #111827; white-space: nowrap; }
.n4-question { margin: 0 0 18px; font-size: 19px; font-weight: 700; line-height: 1.4; }
.n4-choices { display: flex; flex-wrap: wrap; gap: 8px; }
.n4-choice {
  min-height: 44px;
  padding: 0 18px;
  border-radius: 999px;
  border: 1.5px solid rgba(0,0,0,.14);
  background: #fff;
  color: #111827;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  transition: transform .15s ease, background .15s ease, border-color .15s ease;
}
.n4-choice:hover { transform: translateY(-1px); }
.n4-choice.is-selected { background: #111827; color: #c1ff72; border-color: #111827; }
.n4-nav { display: flex; align-items: center; justify-content: space-between; margin-top: 24px; }

.n4-btn-primary, .n4-btn-outline {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 46px;
  padding: 0 20px;
  border-radius: 999px;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  text-decoration: none;
  transition: transform .15s ease;
}
.n4-btn-primary { border: 0; background: #111827; color: #c1ff72; }
.n4-btn-primary:hover:not(:disabled) { transform: translateY(-1px); }
.n4-btn-primary:disabled { opacity: .6; cursor: default; }
.n4-btn-outline { border: 1.5px solid rgba(0,0,0,.16); background: #fff; color: #111827; }
.n4-btn-outline:hover:not(:disabled) { border-color: #000; transform: translateY(-1px); }
.n4-btn-outline:disabled { opacity: .6; cursor: default; }

.n4-paragraphs { display: flex; flex-direction: column; gap: 10px; color: #374151; font-size: 14px; line-height: 1.6; }
.n4-paragraph { margin: 0; white-space: pre-wrap; }

.n4-jobs-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; }
.n4-job-card { background: #fff7ed; border: 1px solid #fed7aa; border-radius: 16px; padding: 14px 16px; }
.n4-job-card ul { margin: 0; padding-left: 18px; font-size: 13px; color: #4b5563; }

.n4-actions { display: flex; flex-wrap: wrap; gap: 10px; }

.n4-modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 50;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0,0,0,.6);
  padding: 16px;
}
.n4-modal {
  position: relative;
  background: #fff;
  border-radius: 24px;
  padding: 20px;
  width: 100%;
  max-width: 420px;
  max-height: 88vh;
  overflow-y: auto;
}
.n4-modal h3 { margin: 0 0 12px; font-size: 17px; font-weight: 800; padding-right: 32px; }
.n4-modal-close {
  position: absolute;
  top: 14px;
  right: 14px;
  width: 32px;
  height: 32px;
  border-radius: 999px;
  border: 0;
  background: #111827;
  color: #fff;
  display: inline-grid;
  place-items: center;
  cursor: pointer;
}
.n4-modal-image { width: 100%; height: auto; border-radius: 14px; border: 1px solid rgba(0,0,0,.08); }
.n4-modal-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 14px; }

@media (max-width: 640px) {
  .n4-card { padding: 18px; border-radius: 22px; }
  .n4-nav { flex-wrap: wrap; gap: 10px; }
}
`
