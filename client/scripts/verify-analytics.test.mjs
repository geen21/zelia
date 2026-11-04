import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { runInNewContext } from 'node:vm'
import {
  getAnalyticsPageType, hasAuthParameters, initializeAnalytics, isPrivatePortalPath,
  queueAuthAnalyticsEvent, trackNavigationClick, trackOrientationEvent, trackPageView, trackSiteEvent
} from '../src/lib/analytics.js'

function browser(t, path = '/orientation') {
  const saved = ['window', 'document'].map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)])
  const scripts = []
  const window = { location: new URL(path, 'https://zelia.io'), dataLayer: [] }
  const document = {
    createElement: () => ({}),
    head: { appendChild: (script) => scripts.push(script) },
    getElementsByTagName: () => [{ parentNode: { insertBefore: (script) => scripts.push(script) } }]
  }
  Object.defineProperty(globalThis, 'window', { configurable: true, value: window })
  Object.defineProperty(globalThis, 'document', { configurable: true, value: document })
  t.after(() => {
    for (const [key, descriptor] of saved) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor)
      else delete globalThis[key]
    }
  })
  return { window, document, scripts }
}

test('orientation v2 identifies questionnaire v5 and only accepts scalar allowlisted parameters', (t) => {
  const { window } = browser(t)
  trackOrientationEvent('orientation_question_answered', {
    orientation_question_number: 1, orientation_answer_position: 4, orientation_answer_count: 4,
    orientation_question_format: 'agreement', orientation_question_category: 'hands_mind',
    email: 'private@example.test', answer: 'private answer', orientation_action: { private: true },
    orientation_item_count: Infinity
  })
  const event = window.dataLayer[0]
  assert.equal(event.event, 'orientation_question_answered')
  assert.equal(event.analytics_version, 'site_v2')
  assert.equal(event.orientation_flow, 'orientation_v2')
  assert.equal(event.orientation_questionnaire, 'inscription_v5')
  assert.equal(event.orientation_answer_position, 4)
  assert.equal(event.orientation_question_format, 'agreement')
  assert.equal(event.email, undefined)
  assert.equal(event.answer, undefined)
  assert.equal(event.orientation_action, null)
  assert.equal(event.orientation_item_count, null)
})

test('optional GTM values do not leak from one event into the next', (t) => {
  const { window } = browser(t)
  trackOrientationEvent('orientation_step_viewed', { orientation_micro_step: 'school_level', orientation_question_number: 20 })
  trackOrientationEvent('orientation_analysis_started', { orientation_step: 'analysis' })
  trackSiteEvent('formation_results_viewed', { result_count: 0, has_query: false })
  trackSiteEvent('generate_lead', { formation_source: 'partner', email: 'private@example.test' })
  const model = Object.assign({}, ...window.dataLayer)
  assert.equal(model.orientation_micro_step, null)
  assert.equal(model.orientation_question_number, null)
  assert.equal(model.orientation_flow, null)
  assert.equal(model.result_count, null)
  assert.equal(model.has_query, null)
  assert.equal(window.dataLayer[2].result_count, 0)
  assert.equal(window.dataLayer[2].has_query, false)
  assert.equal(model.email, undefined)
})

test('pageviews keep the existing GTM contract without query strings or fragments', (t) => {
  const { window } = browser(t, '/parents?session_id=private&email=private@example.test#private')
  trackPageView(window.location, 'Formation parents')
  assert.equal(window.dataLayer[0].event, 'Pageview')
  assert.equal(window.dataLayer[0].pageUrl, 'https://zelia.io/parents')
  assert.equal(window.dataLayer[0].pagePath, '/parents')
  assert.equal(window.dataLayer[0].pageTitle, 'Formation parents')
  assert.equal(window.dataLayer[0].page_type, 'parents')
  assert.doesNotMatch(JSON.stringify(window.dataLayer), /session_id|private/)
})

test('private portals and authentication callbacks never emit events', (t) => {
  const { window } = browser(t)
  for (const path of ['/admin', '/admin/ecoles', '/auth/callback', '/espace-ecoles/activation', '/espace-ecoles/leads', '/espace-ecoles/securite']) {
    assert.equal(isPrivatePortalPath(path), true)
    window.location = new URL(path, 'https://zelia.io')
    trackPageView(window.location, 'Private')
    trackSiteEvent('generate_lead')
    trackOrientationEvent('orientation_flow_started')
  }
  assert.deepEqual(window.dataLayer, [])
  assert.equal(isPrivatePortalPath('/espace-ecoles'), false)
})

test('safe UTM campaign attribution survives URL sanitization without accepting arbitrary query data', (t) => {
  const { window } = browser(t, '/orientation?utm_source=Appfinparcours&utm_medium=Appfinparcours&utm_campaign=SharedLink-Appfinparcours&utm_id=Tracker-Shared-Link&utm_term=private@example.test&q=private')
  trackPageView(window.location, 'Orientation')
  const event = window.dataLayer[0]
  assert.equal(event.pageUrl, 'https://zelia.io/orientation')
  assert.equal(event.campaign_source, 'Appfinparcours')
  assert.equal(event.campaign_medium, 'Appfinparcours')
  assert.equal(event.campaign_name, 'SharedLink-Appfinparcours')
  assert.equal(event.campaign_id, 'Tracker-Shared-Link')
  assert.equal(event.campaign_term, null)
  assert.doesNotMatch(JSON.stringify(event), /private/)
  window.location = new URL('/parents', 'https://zelia.io')
  trackPageView(window.location, 'Parents')
  assert.equal(window.dataLayer[1].campaign_source, null)
})

test('authentication secrets are excluded in both query and hash parameters', (t) => {
  const { window } = browser(t)
  for (const key of ['access_token', 'refresh_token', 'token_hash', 'code']) {
    for (const separator of ['?', '#']) {
      window.location = new URL(`/orientation${separator}${key}=private`, 'https://zelia.io')
      assert.equal(hasAuthParameters(window.location), true)
      trackPageView(window.location, 'Secret')
      trackSiteEvent('login')
    }
  }
  assert.deepEqual(window.dataLayer, [])
})

test('GTM loads once, including after a protected callback returns to a safe route', (t) => {
  const { window, scripts } = browser(t, '/auth/callback?code=private')
  initializeAnalytics()
  assert.equal(scripts.length, 0)
  window.location = new URL('/app', 'https://zelia.io')
  initializeAnalytics()
  initializeAnalytics()
  assert.equal(scripts.length, 1)
  assert.equal(scripts[0].src, 'https://www.googletagmanager.com/gtm.js?id=GTM-TTNGZ2H8')
  assert.equal(window.dataLayer.filter((event) => event.event === 'gtm.js').length, 1)
})

test('the HTML bootstrap applies the same privacy exclusions as the SPA', (t) => {
  const { window, document, scripts } = browser(t)
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8')
  const bootstrap = html.match(/<script>([\s\S]*?)<\/script>/)[1]
  for (const path of ['/auth/callback', '/?code=private', '/#access_token=private', '/admin', '/espace-ecoles/activation']) {
    window.location = new URL(path, 'https://zelia.io')
    runInNewContext(bootstrap, { window, document, URLSearchParams })
  }
  assert.equal(scripts.length, 0)
  window.location = new URL('/parents', 'https://zelia.io')
  runInNewContext(bootstrap, { window, document, URLSearchParams })
  initializeAnalytics()
  assert.equal(scripts.length, 1)
})

test('successful authentication is emitted once on the destination, never on the callback', (t) => {
  const { window } = browser(t, '/auth/callback?code=private')
  queueAuthAnalyticsEvent('login', { method: 'google', auth_context: 'orientation', email: 'private@example.test' })
  trackPageView(window.location, 'Callback')
  assert.equal(window.dataLayer.length, 0)
  window.location = new URL('/orientation', 'https://zelia.io')
  trackPageView(window.location, 'Orientation')
  trackPageView(window.location, 'Orientation')
  const events = window.dataLayer.filter((event) => event.event === 'login')
  assert.equal(events.length, 1)
  assert.equal(events[0].method, 'google')
  assert.equal(events[0].email, undefined)
})

test('navigation tracking strips parameters and ignores private, external and same-page links', (t) => {
  const { window } = browser(t, '/')
  function click(path, { area = 'content', ...event } = {}) {
    const link = {
      href: new URL(path, window.location).href,
      hasAttribute: () => false,
      closest: (selector) => area === 'header' && selector === 'header, nav'
    }
    trackNavigationClick({ button: 0, target: { closest: () => link }, ...event })
  }
  click('/orientation?email=private@example.test')
  click('/parents', { area: 'header' })
  click('/admin')
  click('/auth/callback?code=private')
  click('https://example.test')
  click('/#faq')
  click('/register', { defaultPrevented: true })
  assert.deepEqual(window.dataLayer.map((event) => event.event), ['site_cta_clicked', 'site_cta_clicked'])
  assert.equal(window.dataLayer[0].destination_path, '/orientation')
  assert.equal(window.dataLayer[1].navigation_area, 'header')
  assert.doesNotMatch(JSON.stringify(window.dataLayer), /private/)
})

test('page types match the current site areas', () => {
  for (const [path, type] of [
    ['/', 'home'], ['/orientation', 'orientation'], ['/questionnaire', 'orientation'],
    ['/login', 'auth'], ['/register', 'auth'], ['/formations/bts-1', 'formations'],
    ['/parents', 'parents'], ['/app/profile', 'app'], ['/app/outils/cv', 'app'],
    ['/blog/article', 'blog'], ['/metiers/metier', 'metiers'], ['/espace-ecoles', 'schools']
  ]) assert.equal(getAnalyticsPageType(path), type)
})
