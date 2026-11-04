export function withZeliaUtm(href) {
  if (typeof href !== 'string') return href
  const value = href.trim().replace(/^www\./i, 'https://www.')
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
