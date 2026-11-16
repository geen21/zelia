const BROKEN_HTTP_SCHEME_RE = /^(https?)(?::+[/\\]*|[/\\]+(?=[a-z0-9-]+(?:\.[a-z0-9-]+)+))/i
const BARE_DOMAIN_RE = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}(?:[/:?#]|$)/i

function repairHttpSchemeTypos(value) {
  return value
    .replace(BROKEN_HTTP_SCHEME_RE, (_, scheme) => `${scheme.toLowerCase()}://`)
    .replace(/^www\./i, 'https://www.')
}

export function normalizeExternalHttpUrl(href) {
  if (typeof href !== 'string') return ''
  const trimmed = href.trim()
  if (!trimmed) return ''

  let candidate = repairHttpSchemeTypos(trimmed)
  if (candidate.startsWith('//')) {
    candidate = `https:${candidate}`
  } else if (!/^[a-z][a-z0-9+.-]*:/i.test(candidate) && BARE_DOMAIN_RE.test(candidate)) {
    candidate = `https://${candidate}`
  }

  if (!/^https?:\/\//i.test(candidate)) return ''

  try {
    const url = new URL(candidate)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return ''
    if (!url.hostname || !url.hostname.includes('.')) return ''
    return url.href
  } catch {
    return ''
  }
}

export function withZeliaUtm(href) {
  if (typeof href !== 'string') return href
  const value = repairHttpSchemeTypos(href.trim())
  if (!/^(?:https?:)?\/\//i.test(value)) return href

  let url
  try {
    url = new URL(value, 'https://zelia.io')
  } catch (error) {
    console.warn('[outboundUrl] Invalid outbound URL', error)
    return href
  }

  const hostname = url.hostname.toLowerCase()
  if (hostname === 'zelia.io' || hostname.endsWith('.zelia.io') ||
    (typeof window !== 'undefined' && url.origin === window.location.origin)) return href

  url.searchParams.set('utm_source', 'zelia')
  if (!url.searchParams.get('utm_medium')) url.searchParams.set('utm_medium', 'referral')
  return url.href
}
