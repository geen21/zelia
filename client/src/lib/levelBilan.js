function sanitizeText(raw) {
  if (!raw) return ''
  return String(raw)
    .replace(/```(?:\w+)?\s*([\s\S]*?)```/g, '$1')
    .replace(/\*\*/g, '')
    .trim()
}

export function extractBilanJson(raw) {
  const text = sanitizeText(raw)
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start === -1 || end === -1 || end <= start) return null
  const chunk = text.slice(start, end + 1)
  try {
    return JSON.parse(chunk)
  } catch {
    return null
  }
}

export function formatBilanExtraInfos(entries) {
  return (entries || [])
    .map((row) => `- [${row.question_id}] ${row.question_text || 'Question'}: ${row.answer_text || '-'}`)
    .join('\n')
}

function formatAnswerText(raw) {
  const text = sanitizeText(raw)
  if (!text) return ''

  if (/^https?:\/\//i.test(text)) return 'Document genere.'
  if (/^\d{4}-\d{2}-\d{2}t\d{2}:\d{2}/i.test(text)) return 'Action finalisee.'

  try {
    const parsed = JSON.parse(text)
    if (Array.isArray(parsed)) {
      const values = parsed
        .map((item) => {
          if (typeof item === 'string') return item.trim()
          if (item && typeof item === 'object') {
            return Object.values(item)
              .filter((value) => ['string', 'number', 'boolean'].includes(typeof value))
              .map((value) => String(value).trim())
              .filter(Boolean)
              .join(', ')
          }
          return ''
        })
        .filter(Boolean)
      return values.join(', ')
    }

    if (parsed && typeof parsed === 'object') {
      const preferredKeys = ['title', 'selectedJob', 'targetJob', 'profileTitle', 'profile', 'score', 'favorite_level', 'rating', 'videoTitle']
      const ordered = []
      preferredKeys.forEach((key) => {
        if (parsed[key] != null) ordered.push(`${key}: ${String(parsed[key]).trim()}`)
      })

      Object.entries(parsed).forEach(([key, value]) => {
        if (preferredKeys.includes(key)) return
        if (!['string', 'number', 'boolean'].includes(typeof value)) return
        const normalized = String(value).trim()
        if (!normalized) return
        ordered.push(`${key}: ${normalized}`)
      })

      return ordered.join(', ')
    }
  } catch {
    return text
  }

  return text
}

function shorten(text, maxLength = 220) {
  const normalized = sanitizeText(text).replace(/\s+/g, ' ')
  if (normalized.length <= maxLength) return normalized
  const slice = normalized.slice(0, maxLength - 1)
  const lastSpace = slice.lastIndexOf(' ')
  return `${(lastSpace > 80 ? slice.slice(0, lastSpace) : slice).trim()}.`
}

function buildEntrySummary(row) {
  const label = sanitizeText(row?.question_text || '')
    .replace(/\s*\([^)]*\)\s*$/g, '')
    .replace(/[?.!]+$/g, '')
  const answer = formatAnswerText(row?.answer_text)

  if (!label && !answer) return ''
  if (!label) return `${answer}.`
  if (!answer) return `${label}.`
  return `${label}: ${answer}.`
}

function buildFallbackSummaryForLevel(rows, title) {
  const snippets = (rows || [])
    .map(buildEntrySummary)
    .filter(Boolean)
    .slice(0, 2)

  if (snippets.length === 0) return `${title}: niveau complete.`
  return shorten(snippets.join(' '))
}

export function buildFallbackLevelSummaries(entries, levels) {
  const grouped = new Map(levels.map((item) => [item.level, []]))

  ;(entries || []).forEach((row) => {
    const match = String(row?.question_id || '').toLowerCase().match(/niveau[_]?(\d+)/)
    if (!match) return
    const level = Number(match[1])
    if (!grouped.has(level)) return
    grouped.get(level).push(row)
  })

  return levels.map((item) => ({
    level: item.level,
    title: item.title,
    summary: buildFallbackSummaryForLevel(grouped.get(item.level), item.title)
  }))
}

export function normalizeLevelSummaries(rawSummaries, levels, fallbackEntries = []) {
  const fallbackByLevel = new Map(
    buildFallbackLevelSummaries(fallbackEntries, levels).map((item) => [item.level, item])
  )

  const parsedByLevel = new Map()
  if (Array.isArray(rawSummaries)) {
    rawSummaries.forEach((item) => {
      const level = Number(item?.level)
      if (!Number.isFinite(level)) return
      parsedByLevel.set(level, {
        level,
        title: sanitizeText(item?.title || ''),
        summary: shorten(item?.summary || '')
      })
    })
  }

  return levels.map((item) => {
    const parsed = parsedByLevel.get(item.level)
    const fallback = fallbackByLevel.get(item.level)
    return {
      level: item.level,
      title: item.title,
      summary: parsed?.summary || fallback?.summary || `${item.title}: niveau complete.`
    }
  })
}