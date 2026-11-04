const ORIENTATION_PARAMETER_KEYS = new Set([
  'orientation_step',
  'orientation_step_index',
  'orientation_total_steps',
  'orientation_question_number',
  'orientation_question_category',
  'orientation_answer_position',
  'orientation_answer_count',
  'orientation_question_format',
  'orientation_micro_step',
  'orientation_item_count',
  'orientation_selected_count',
  'orientation_source',
  'orientation_action',
  'orientation_error_stage'
])

const SITE_PARAMETER_KEYS = new Set([
  'destination_path', 'navigation_area', 'method', 'auth_context',
  'formation_source', 'result_count', 'has_query', 'has_location',
  'action', 'status', 'error_stage', 'tool_id', 'chat_mode', 'content_type'
])
const CAMPAIGN_PARAMETERS = {
  utm_source: 'campaign_source', utm_medium: 'campaign_medium',
  utm_campaign: 'campaign_name', utm_id: 'campaign_id',
  utm_content: 'campaign_content', utm_term: 'campaign_term'
}
const EVENT_PARAMETER_KEYS = [...ORIENTATION_PARAMETER_KEYS, ...SITE_PARAMETER_KEYS, ...Object.values(CAMPAIGN_PARAMETERS)]
let pendingAuthEvent = null

export function isPrivatePortalPath(pathname) {
  return /^\/(?:admin|auth\/callback)(?:\/|$)/i.test(pathname)
    || /^\/espace-ecoles\/(?:admin|activation|connexion|mot-de-passe-oublie|securite|leads|statistiques|formations|equipe)(?:\/|$)/i.test(pathname)
}

export function hasAuthParameters(location) {
  const query = new URLSearchParams(location.search || '')
  const fragment = new URLSearchParams((location.hash || '').replace(/^#/, ''))
  return ['access_token', 'refresh_token', 'token_hash', 'code'].some((key) => query.has(key) || fragment.has(key))
}

export function getAnalyticsPageType(pathname) {
  if (pathname === '/') return 'home'
  if (/^\/(?:orientation|questionnaire)(?:\/|$)/.test(pathname)) return 'orientation'
  if (/^\/(?:login|register)(?:\/|$)/.test(pathname)) return 'auth'
  if (/^\/parents(?:\/|$)/.test(pathname)) return 'parents'
  if (/^\/formations(?:\/|$)/.test(pathname)) return 'formations'
  if (/^\/app(?:\/|$)/.test(pathname)) return 'app'
  if (/^\/blog(?:\/|$)/.test(pathname)) return 'blog'
  if (/^\/metiers(?:\/|$)/.test(pathname)) return 'metiers'
  if (/^\/espace-ecoles(?:\/|$)/.test(pathname)) return 'schools'
  return 'other'
}

function canTrack(location = window.location) {
  return !isPrivatePortalPath(location.pathname) && !hasAuthParameters(location)
}

export function initializeAnalytics() {
  if (typeof window === 'undefined' || !canTrack() || window.__zeliaPublicTrackingLoaded) return
  window.__zeliaPublicTrackingLoaded = true
  window.dataLayer = window.dataLayer || []
  window.dataLayer.push({ 'gtm.start': Date.now(), event: 'gtm.js' })
  const script = document.createElement('script')
  script.async = true
  script.src = 'https://www.googletagmanager.com/gtm.js?id=GTM-TTNGZ2H8'
  document.head.appendChild(script)
}

function normalizeEventName(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
}

function normalizeParameters(parameters, allowedKeys) {
  return Object.fromEntries(
    Object.entries(parameters)
      .filter(([key]) => allowedKeys.has(key))
      .map(([key, value]) => {
        if (typeof value === 'number' && Number.isFinite(value)) return [key, value]
        if (typeof value === 'boolean') return [key, value]
        if (typeof value === 'string') return [key, value.trim().slice(0, 80)]
        return [key, '']
      })
      .filter(([, value]) => value !== '')
  )
}

export function trackAnalyticsEvent(eventName, parameters = {}) {
  if (typeof window === 'undefined') return
  if (!canTrack()) return
  const event = eventName === 'Pageview' ? 'Pageview' : normalizeEventName(eventName)
  if (!event) return

  window.dataLayer = window.dataLayer || []
  // GTM retains top-level values between events; reset optional parameters.
  window.dataLayer.push({
    ...Object.fromEntries(EVENT_PARAMETER_KEYS.map((key) => [key, null])),
    orientation_flow: null,
    orientation_questionnaire: null,
    analytics_version: 'site_v2',
    page_type: getAnalyticsPageType(window.location.pathname),
    ...parameters,
    event
  })
}

export function trackSiteEvent(eventName, parameters = {}) {
  trackAnalyticsEvent(eventName, normalizeParameters(parameters, SITE_PARAMETER_KEYS))
}

export function trackOrientationEvent(eventName, parameters = {}) {
  trackAnalyticsEvent(eventName, {
    orientation_flow: 'orientation_v2',
    orientation_questionnaire: 'inscription_v5',
    ...normalizeParameters(parameters, ORIENTATION_PARAMETER_KEYS)
  })
}

export function queueAuthAnalyticsEvent(eventName, parameters) {
  pendingAuthEvent = { eventName, parameters: normalizeParameters(parameters, SITE_PARAMETER_KEYS) }
}

export function trackPageView(location, pageTitle) {
  if (typeof window === 'undefined' || !canTrack(location)) return
  const query = new URLSearchParams(location.search || '')
  const campaign = Object.fromEntries(Object.entries(CAMPAIGN_PARAMETERS)
    .map(([key, parameter]) => [parameter, query.get(key)])
    .filter(([, value]) => value && /^[a-z0-9_.-]{1,80}$/i.test(value)))
  trackAnalyticsEvent('Pageview', {
    pageUrl: window.location.origin + location.pathname,
    pagePath: location.pathname,
    pageTitle,
    ...campaign
  })
  if (pendingAuthEvent) {
    const { eventName, parameters } = pendingAuthEvent
    pendingAuthEvent = null
    trackSiteEvent(eventName, parameters)
  }
}

export function trackNavigationClick(event) {
  if (event.defaultPrevented || event.button > 0) return
  const link = event.target.closest?.('a[href]')
  if (!link || link.hasAttribute('download')) return
  const url = new URL(link.href, window.location.origin)
  if (url.origin !== window.location.origin || !canTrack(url)) return
  if (url.pathname === window.location.pathname) return
  const navigationArea = link.closest('header, nav') ? 'header' : link.closest('footer') ? 'footer' : 'content'
  const isCta = /^\/(?:orientation|questionnaire|register|parents)\/?$/.test(url.pathname)
  if (!isCta && navigationArea === 'content' && !url.pathname.startsWith('/app')) return
  trackSiteEvent(isCta ? 'site_cta_clicked' : 'site_navigation_clicked', {
    destination_path: url.pathname,
    navigation_area: navigationArea
  })
}