import { PERSONAS, matchPersonaFromAnalysis } from './personas.js'

const ZELIA_COLORS = {
  bg: '#f7f9fc',
  accent1: '#c1ff72',
  accent2: '#f68fff',
  text: '#000000'
}

const DEFAULT_LOGO_PATH = '/assets/images/logo-dark.png'

// Signature skills shown on the (legacy) share card per persona (10 Zélia personas).
// Built from personas.js data (domaines) so both stay in sync — see personas.js for
// the canonical persona list.
const ZELIA_SIGNATURE_SKILLS = Object.fromEntries(
  PERSONAS.map((persona) => [
    persona.id,
    [persona.title, ...persona.domaines.slice(0, 4)]
  ])
)

const DEFAULT_ZELIA_SKILLS = [
  'Curiosité',
  "Sens de l'initiative",
  'Collaboration',
  'Résolution de problèmes',
  'Communication',
  'Apprentissage continu'
]

// Used by the legacy generateZeliaShareImage() (Profile.jsx / Niveau4.jsx, old MBTI
// flow) to pick signature skills from a freeform "personalityType" string.
function extractZeliaSignature(personalityType) {
  if (!personalityType || typeof personalityType !== 'string') return null
  const { persona, matched } = matchPersonaFromAnalysis({ personalityType }, [], personalityType)
  return matched ? persona.id : null
}

function truncate(text, max = 34) {
  if (!text || typeof text !== 'string') return ''
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}

function toTitleCase(text) {
  if (!text || typeof text !== 'string') return ''
  const trimmed = text.trim()
  if (!trimmed) return ''
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1)
}

function wrapText(ctx, text, maxWidth) {
  if (!text) return []
  const words = text.split(/\s+/)
  const lines = []
  let currentLine = ''

  words.forEach((word) => {
    const testLine = currentLine ? `${currentLine} ${word}` : word
    const metrics = ctx.measureText(testLine)
    if (metrics.width > maxWidth && currentLine) {
      lines.push(currentLine)
      currentLine = word
    } else {
      currentLine = testLine
    }
  })

  if (currentLine) {
    lines.push(currentLine)
  }

  return lines
}

function deriveTopCompetences(analysis, max = 3) {
  const candidates = []
  const seen = new Set()
  const addValue = (value) => {
    const cleaned = toTitleCase(value)
    if (!cleaned) return
    const key = cleaned.toLowerCase()
    if (seen.has(key)) return
    seen.add(key)
    candidates.push(cleaned)
  }

  const jobs = Array.isArray(analysis?.jobRecommendations) ? analysis.jobRecommendations : []
  for (const job of jobs) {
    if (!Array.isArray(job?.skills)) continue
    for (const skill of job.skills) {
      const normalized = typeof skill === 'string' ? skill.replace(/^[-•–]\s*/, '').trim() : ''
      if (normalized) addValue(normalized)
    }
  }

  if (typeof analysis?.personalityAnalysis === 'string') {
    // Try to extract short phrases or keywords if possible, otherwise skip long sentences
    const sentences = analysis.personalityAnalysis
      .split(/[\.?!]/)
      .map((sentence) => sentence.trim())
      .filter(Boolean)
    for (const sentence of sentences) {
      if (sentence.split(/\s+/).length <= 3) { // Allow slightly longer for fallback
        addValue(sentence)
      }
    }
  }

  // Prioritize short skills (1-2 words)
  const short = candidates.filter(c => c.split(/\s+/).length <= 2)
  if (short.length >= max) return short.slice(0, max)

  return [...short, ...candidates.filter(c => !short.includes(c))].slice(0, max)
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}

async function ensureCanvasFontsLoaded() {
  if (typeof document === 'undefined' || !('fonts' in document)) return

  try {
    const clashFace = new FontFace('ShareClashGrotesk', 'url(/static/fonts/ClashGroteskSemibold.woff2) format("woff2")')
    await clashFace.load()
    document.fonts.add(clashFace)

    try {
      const bricolageFace = new FontFace(
        'Bricolage Grotesque',
        'url("https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,200..800&display=swap")'
      )
      await bricolageFace.load()
      document.fonts.add(bricolageFace)
    } catch (bricolageError) {
      console.warn('Bricolage Grotesque not available, using ShareClashGrotesk', bricolageError)
    }

    await document.fonts.load('800 88px "Bricolage Grotesque", "ShareClashGrotesk"')
    await document.fonts.load('800 64px "Bricolage Grotesque", "ShareClashGrotesk"')
    await document.fonts.load('800 48px "Bricolage Grotesque", "ShareClashGrotesk"')
  } catch (error) {
    console.warn('Canvas font load failed, falling back to system fonts', error)
  }
}

function normalizeSkillText(value) {
  if (!value || typeof value !== 'string') return ''
  return value.replace(/^[-•–]\s*/, '').trim()
}

function normalizeSkillKey(value) {
  const base = normalizeSkillText(value)
  return base ? base.toLowerCase() : ''
}

function pickSkillsFromAnalysis(analysis, max = 6, exclude = []) {
  if (!analysis) return []

  const candidates = []
  const seen = new Set(exclude.map(normalizeSkillKey).filter(Boolean))
  const addSkill = (raw) => {
    const skill = normalizeSkillText(raw)
    if (!skill) return
    const key = normalizeSkillKey(skill)
    if (seen.has(key)) return
    seen.add(key)
    candidates.push(skill)
  }

  const jobs = Array.isArray(analysis?.jobRecommendations) ? analysis.jobRecommendations : []
  for (const job of jobs) {
    if (!Array.isArray(job?.skills)) continue
    for (const skill of job.skills) {
      addSkill(skill)
    }
  }

  if (typeof analysis?.skillsAssessment === 'string') {
    analysis.skillsAssessment
      .split(/[\n,;]+/)
      .map((entry) => entry.trim())
      .filter(Boolean)
      .forEach(addSkill)
  }

  const derived = deriveTopCompetences(analysis, max * 2)
  derived.forEach(addSkill)

  const signature = extractZeliaSignature(analysis?.personalityType)
  if (signature && ZELIA_SIGNATURE_SKILLS[signature]) {
    ZELIA_SIGNATURE_SKILLS[signature].forEach(addSkill)
  }

  DEFAULT_ZELIA_SKILLS.forEach(addSkill)

  // Prioritize short skills (1-2 words)
  const short = candidates.filter(c => c.split(/\s+/).length <= 2)
  if (short.length >= max) return short.slice(0, max)

  return [...short, ...candidates.filter(c => !short.includes(c))].slice(0, max)
}

export async function generateZeliaShareImage({
  analysis,
  avatarUrl,
  logoPath = DEFAULT_LOGO_PATH,
  colors = ZELIA_COLORS,
  width = 1080,
  height = 1920
}) {
  if (!analysis) return ''

  try {
    await ensureCanvasFontsLoaded()

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')

    const gradient = ctx.createLinearGradient(0, 0, 0, height)
    gradient.addColorStop(0, colors.bg)
    gradient.addColorStop(1, '#ffffff')
    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, width, height)

    ctx.fillStyle = colors.accent1
    ctx.fillRect(0, 0, width, 80)

    ctx.fillStyle = '#c1ff72'
    ctx.fillRect(0, height - 200, width, 200)

    try {
      const logoImg = await loadImage(logoPath)
      const logoScale = 0.6
      const logoW = 280 * logoScale
      const logoH = (logoImg.height / logoImg.width) * logoW
      const logoX = (width - logoW) / 2
      const logoY = height - 180 + (180 - logoH) / 2
      ctx.drawImage(logoImg, logoX, logoY, logoW, logoH)
    } catch (logoError) {
      console.warn('Logo not loaded for share image', logoError)
    }

    // Use shareCardData if available (from 2nd prompt), otherwise fallback
    const shareData = analysis?.shareCardData || {}
    const title = shareData.zeliaProfile || analysis?.personalityType || 'Profil Zélia'
    
    ctx.fillStyle = colors.text
    ctx.font = '800 120px "Bricolage Grotesque", "ShareClashGrotesk", system-ui, -apple-system, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'

    const words = title.split(' ')
    let line = ''
    let titleY = 630
    const maxTitleWidth = width - 80

    for (let i = 0; i < words.length; i += 1) {
      const testLine = `${line}${words[i]} `
      const testWidth = ctx.measureText(testLine).width
      if (testWidth > maxTitleWidth && i > 0) {
        ctx.fillText(line.trim(), width / 2, titleY)
        line = `${words[i]} `
        titleY += 130
      } else {
        line = testLine
      }
    }
    ctx.fillText(line.trim(), width / 2, titleY)

    if (avatarUrl) {
      try {
        const avatarImg = await loadImage(avatarUrl)
        const avatarSize = 420
        const avatarX = (width - avatarSize) / 2
        const avatarY = 180

        ctx.save()
        ctx.shadowColor = 'rgba(0,0,0,0.15)'
        ctx.shadowBlur = 20
        ctx.shadowOffsetY = 10

        ctx.beginPath()
        ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2)
        ctx.closePath()
        ctx.clip()
        ctx.drawImage(avatarImg, avatarX, avatarY, avatarSize, avatarSize)
        ctx.restore()

        ctx.beginPath()
        ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2 + 8, 0, Math.PI * 2)
        ctx.strokeStyle = colors.accent1
        ctx.lineWidth = 6
        ctx.stroke()
      } catch (avatarError) {
        console.warn('Avatar not loaded for share image', avatarError)
      }
    }

    const qualities = (Array.isArray(shareData.qualities) && shareData.qualities.length === 3)
      ? shareData.qualities
      : deriveTopCompetences(analysis, 3)

    ctx.font = '800 80px "Bricolage Grotesque", "ShareClashGrotesk", system-ui, sans-serif'
    ctx.fillStyle = colors.text
    ctx.textAlign = 'center'
    const qualitiesY = titleY + 150
    ctx.fillText('Tes qualités', width / 2, qualitiesY)

    ctx.font = '600 32px system-ui, -apple-system, sans-serif'
    let qualityY = qualitiesY + 80
    qualities.forEach((quality, index) => {
      const padX = 30
      const padY = 24
      const maxTextWidth = width - 160
      const lines = wrapText(ctx, quality, maxTextWidth - padX * 2).slice(0, 3)
      const textLines = lines.length ? lines : [quality]
      const longest = textLines.reduce((maxLen, line) => Math.max(maxLen, ctx.measureText(line).width), 0)
      const pillW = Math.min(Math.max(longest + padX * 2, 320), width - 80)
      const lineHeight = 42
      const pillH = lineHeight * textLines.length + padY * 2
      const x = (width - pillW) / 2
      const y = qualityY

      const pillGradient = ctx.createLinearGradient(x, y, x + pillW, y + pillH)
      const color1 = index % 2 === 0 ? colors.accent1 : colors.accent2
      const color2 = index % 2 === 0 ? '#a8f542' : '#e859d9'
      pillGradient.addColorStop(0, color1)
      pillGradient.addColorStop(1, color2)

      ctx.fillStyle = pillGradient
      ctx.beginPath()
      const radius = 35
      ctx.moveTo(x + radius, y)
      ctx.arcTo(x + pillW, y, x + pillW, y + pillH, radius)
      ctx.arcTo(x + pillW, y + pillH, x, y + pillH, radius)
      ctx.arcTo(x, y + pillH, x, y, radius)
      ctx.arcTo(x, y, x + pillW, y, radius)
      ctx.closePath()
      ctx.fill()

      ctx.fillStyle = '#000'
      ctx.font = '600 32px system-ui, -apple-system, sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      textLines.forEach((lineText, lineIndex) => {
        const lineY = y + padY + lineHeight * lineIndex + lineHeight / 2
        ctx.fillText(lineText, x + pillW / 2, lineY)
      })
      ctx.textBaseline = 'top'

      qualityY += pillH + 25
    })

    const skills = (Array.isArray(shareData.competences) && shareData.competences.length === 3)
      ? shareData.competences
      : pickSkillsFromAnalysis(analysis, 3, qualities)

    const skillsTitleY = qualityY + 20
    ctx.fillStyle = colors.text
    ctx.font = '800 80px "Bricolage Grotesque", "ShareClashGrotesk", system-ui, sans-serif'
    ctx.fillText('Top compétences', width / 2 + 20, skillsTitleY)

    ctx.font = '600 50px system-ui, -apple-system, sans-serif'
    ctx.fillStyle = colors.text
    let skillsY = skillsTitleY + 80

    skills.forEach((skill, index) => {
      const label = truncate(skill, 40)

      ctx.save()
      ctx.fillStyle = index % 2 === 0 ? colors.accent1 : colors.accent2
      const circleX = width / 2 - 250
      const circleY = skillsY + 25
      ctx.beginPath()
      ctx.arc(circleX, circleY, 25, 0, Math.PI * 2)
      ctx.fill()

      ctx.fillStyle = '#000'
      ctx.font = '700 28px system-ui, sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(String(index + 1), circleX, circleY - 2)
      ctx.restore()

      ctx.fillStyle = colors.text
      ctx.font = '600 50px system-ui, -apple-system, sans-serif'
      ctx.textAlign = 'left'
      ctx.textBaseline = 'top'
      ctx.fillText(label, width / 2 - 200, skillsY + 5)

      skillsY += 70
    })

    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'

    return canvas.toDataURL('image/png')
  } catch (error) {
    console.error('Share image generation failed', error)
    return ''
  }
}

// New persona reveal share card (v2 persona system, see lib/personas.js). Flat brand
// colors only (no gradients), portrait "social post" format (1080x1350).
export async function generatePersonaShareCard({
  persona,
  firstName = '',
  avatarUrl = '',
  domaines = [],
  competences = [],
  logoPath = DEFAULT_LOGO_PATH,
  width = 1080,
  height = 1350
}) {
  if (!persona) return ''

  try {
    await ensureCanvasFontsLoaded()

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')

    ctx.fillStyle = '#fffbf7'
    ctx.fillRect(0, 0, width, height)

    ctx.fillStyle = '#c1ff72'
    ctx.fillRect(0, 0, width, 64)

    try {
      const logoImg = await loadImage(logoPath)
      const logoW = 200
      const logoH = (logoImg.height / logoImg.width) * logoW
      ctx.drawImage(logoImg, (width - logoW) / 2, 96, logoW, logoH)
    } catch (logoError) {
      console.warn('Logo not loaded for persona share card', logoError)
    }

    let cursorY = 220

    if (avatarUrl) {
      try {
        const avatarImg = await loadImage(avatarUrl)
        const avatarSize = 320
        const avatarX = (width - avatarSize) / 2
        ctx.save()
        ctx.shadowColor = 'rgba(0,0,0,0.12)'
        ctx.shadowBlur = 24
        ctx.shadowOffsetY = 10
        ctx.drawImage(avatarImg, avatarX, cursorY, avatarSize, avatarSize)
        ctx.restore()
        cursorY += avatarSize + 60
      } catch (avatarError) {
        console.warn('Avatar not loaded for persona share card', avatarError)
        cursorY += 40
      }
    }

    ctx.fillStyle = '#000'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    ctx.font = '600 40px system-ui, -apple-system, sans-serif'
    const headline = firstName ? `${firstName} ressemble à ${persona.name}` : `Tu ressembles à ${persona.name}`
    ctx.fillText(headline, width / 2, cursorY)
    cursorY += 60

    ctx.font = '800 92px "Bricolage Grotesque", "ShareClashGrotesk", system-ui, sans-serif'
    ctx.fillText(persona.displayTitle.toUpperCase(), width / 2, cursorY)
    cursorY += 120

    ctx.font = '500 34px system-ui, -apple-system, sans-serif'
    ctx.fillStyle = '#374151'
    const taglineLines = wrapText(ctx, persona.tagline || '', width - 160)
    taglineLines.forEach((line) => {
      ctx.fillText(line, width / 2, cursorY)
      cursorY += 44
    })
    cursorY += 30

    const chipValues = (Array.isArray(domaines) && domaines.length ? domaines : persona.domaines || []).slice(0, 4)
    if (chipValues.length) {
      ctx.font = '700 30px system-ui, -apple-system, sans-serif'
      const padX = 26
      const chipH = 56
      const gap = 14
      const chipWidths = chipValues.map((value) => ctx.measureText(value).width + padX * 2)
      const maxRowWidth = width - 120
      let rowWidth = 0
      const rows = []
      let currentRow = []
      chipValues.forEach((value, index) => {
        const chipW = chipWidths[index]
        if (rowWidth + chipW > maxRowWidth && currentRow.length) {
          rows.push(currentRow)
          currentRow = []
          rowWidth = 0
        }
        currentRow.push({ value, chipW })
        rowWidth += chipW + gap
      })
      if (currentRow.length) rows.push(currentRow)

      rows.forEach((row) => {
        const rowTotalWidth = row.reduce((sum, item) => sum + item.chipW, 0) + gap * (row.length - 1)
        let x = (width - rowTotalWidth) / 2
        row.forEach((item, index) => {
          const color = index % 2 === 0 ? '#c1ff72' : '#f68fff'
          ctx.fillStyle = color
          ctx.beginPath()
          const radius = chipH / 2
          ctx.moveTo(x + radius, cursorY)
          ctx.arcTo(x + item.chipW, cursorY, x + item.chipW, cursorY + chipH, radius)
          ctx.arcTo(x + item.chipW, cursorY + chipH, x, cursorY + chipH, radius)
          ctx.arcTo(x, cursorY + chipH, x, cursorY, radius)
          ctx.arcTo(x, cursorY, x + item.chipW, cursorY, radius)
          ctx.closePath()
          ctx.fill()

          ctx.fillStyle = '#000'
          ctx.textBaseline = 'middle'
          ctx.fillText(item.value, x + item.chipW / 2, cursorY + chipH / 2 + 2)
          ctx.textBaseline = 'top'
          x += item.chipW + gap
        })
        cursorY += chipH + gap
      })
      cursorY += 20
    }

    const skillValues = (Array.isArray(competences) ? competences : []).slice(0, 3)
    if (skillValues.length) {
      ctx.textAlign = 'center'
      ctx.font = '800 44px "Bricolage Grotesque", "ShareClashGrotesk", system-ui, sans-serif'
      ctx.fillStyle = '#000'
      ctx.fillText('Compétences', width / 2, cursorY)
      cursorY += 60

      ctx.font = '600 32px system-ui, -apple-system, sans-serif'
      skillValues.forEach((skill) => {
        ctx.fillText(truncate(skill, 46), width / 2, cursorY)
        cursorY += 44
      })
    }

    ctx.fillStyle = '#000'
    ctx.fillRect(0, height - 70, width, 70)
    ctx.fillStyle = '#c1ff72'
    ctx.font = '700 30px system-ui, -apple-system, sans-serif'
    ctx.textBaseline = 'middle'
    ctx.fillText('zelia.io', width / 2, height - 35)

    return canvas.toDataURL('image/png')
  } catch (error) {
    console.error('Persona share card generation failed', error)
    return ''
  }
}

export {
  deriveTopCompetences,
  truncate,
  ZELIA_COLORS,
  DEFAULT_LOGO_PATH,
  ZELIA_SIGNATURE_SKILLS,
  DEFAULT_ZELIA_SKILLS,
  extractZeliaSignature
}
