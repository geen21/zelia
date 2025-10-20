const ZELIA_COLORS = {
  bg: '#f7f9fc',
  accent1: '#c1ff72',
  accent2: '#f68fff',
  text: '#000000'
}

const DEFAULT_LOGO_PATH = '/assets/images/logo-dark.png'

const MBTI_JOBS_FR = {
  ISTJ: ['Comptable', 'Contrôleur qualité', 'Analyste financier', 'Gestionnaire logistique', 'Responsable conformité'],
  ISFJ: ['Assistant social', 'Infirmier', 'Gestionnaire RH', 'Coordinateur pédagogique', 'Orthophoniste'],
  INFJ: ['Psychologue', 'Coach', 'Rédacteur', 'UX Writer', "Conseiller d’orientation"],
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
  const match = personalityType.match(/\(([IE][NS][FT][JP])\)/i)
  return match ? match[1].toUpperCase() : null
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
  const result = []
  const seen = new Set()
  const addValue = (value) => {
    const cleaned = toTitleCase(value)
    if (!cleaned) return
    const key = cleaned.toLowerCase()
    if (seen.has(key)) return
    seen.add(key)
    result.push(cleaned)
  }

  const jobs = Array.isArray(analysis?.jobRecommendations) ? analysis.jobRecommendations : []
  for (const job of jobs) {
    if (!Array.isArray(job?.skills)) continue
    for (const skill of job.skills) {
      if (result.length >= max) break
      const normalized = typeof skill === 'string' ? skill.replace(/^[-•–]\s*/, '').trim() : ''
      if (normalized) addValue(normalized)
    }
    if (result.length >= max) break
  }

  if (result.length < max && typeof analysis?.personalityAnalysis === 'string') {
    const sentences = analysis.personalityAnalysis
      .split(/[\.?!]/)
      .map((sentence) => sentence.trim())
      .filter(Boolean)
    for (const sentence of sentences) {
      if (result.length >= max) break
      if (sentence.length > 120) continue
      addValue(sentence)
    }
  }

  return result.slice(0, max)
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
    const clashFace = new FontFace('ClashGroteskMedium', 'url(/static/fonts/ClashGroteskSemibold.woff2) format("woff2")')
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
      console.warn('Bricolage Grotesque not available, using ClashGroteskMedium', bricolageError)
    }

    await document.fonts.load('800 88px "Bricolage Grotesque", "ClashGroteskMedium"')
    await document.fonts.load('800 64px "Bricolage Grotesque", "ClashGroteskMedium"')
    await document.fonts.load('800 48px "Bricolage Grotesque", "ClashGroteskMedium"')
  } catch (error) {
    console.warn('Canvas font load failed, falling back to system fonts', error)
  }
}

function pickJobsFromAnalysis(analysis) {
  if (!analysis) return []
  const jobs = Array.isArray(analysis?.jobRecommendations) ? analysis.jobRecommendations.slice(0, 3) : []
  if (jobs.length > 0) return jobs

  const fallbackCode = extractMbtiCode(analysis?.personalityType)
  if (fallbackCode && MBTI_JOBS_FR[fallbackCode]) {
    return MBTI_JOBS_FR[fallbackCode].slice(0, 3).map((title) => ({ title }))
  }

  return []
}

export async function generateMbtiShareImage({
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

    const title = analysis?.personalityType || 'Profil MBTI'
    ctx.fillStyle = colors.text
    ctx.font = '800 120px "Bricolage Grotesque", "ClashGroteskMedium", system-ui, -apple-system, sans-serif'
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

    const qualities = deriveTopCompetences(analysis, 3)
    ctx.font = '800 80px "Bricolage Grotesque", "ClashGroteskMedium", system-ui, sans-serif'
    ctx.fillStyle = colors.text
    ctx.textAlign = 'center'
    const qualitiesY = titleY + 150
    ctx.fillText('Qualités', width / 2, qualitiesY)

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

    const jobs = pickJobsFromAnalysis(analysis)
    const jobsTitleY = qualityY + 20
    ctx.fillStyle = colors.text
    ctx.font = '800 80px "Bricolage Grotesque", "ClashGroteskMedium", system-ui, sans-serif'
    ctx.fillText('Top compétences', width / 2 + 20, jobsTitleY)

    ctx.font = '600 50px system-ui, -apple-system, sans-serif'
    ctx.fillStyle = colors.text
    let jobsY = jobsTitleY + 80

    jobs.forEach((job, index) => {
      const title = typeof job === 'string' ? job : job?.title || ''
      if (!title) return

      const truncatedTitle = truncate(title, 35)

      ctx.save()
      ctx.fillStyle = index % 2 === 0 ? colors.accent1 : colors.accent2
      const circleX = width / 2 - 250
      const circleY = jobsY + 25
      ctx.beginPath()
      ctx.arc(circleX, circleY, 25, 0, Math.PI * 2)
      ctx.fill()

      ctx.fillStyle = '#000'
      ctx.font = '700 28px system-ui, sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText(String(index + 1), circleX, circleY - 2)
      ctx.restore()

      ctx.fillStyle = colors.text
      ctx.font = '600 50px system-ui, -apple-system, sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText(truncatedTitle, width / 2 + 30, jobsY + 5)

      jobsY += 70
    })

    return canvas.toDataURL('image/png')
  } catch (error) {
    console.error('Share image generation failed', error)
    return ''
  }
}

export { extractMbtiCode, deriveTopCompetences, truncate, ZELIA_COLORS, DEFAULT_LOGO_PATH, MBTI_JOBS_FR }
