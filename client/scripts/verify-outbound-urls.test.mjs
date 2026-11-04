import assert from 'node:assert/strict'
import { mock, test } from 'node:test'
import { withZeliaUtm } from '../src/lib/outboundUrl.js'

test('external HTTP(S) links carry the Zelia referral attribution', () => {
  for (const href of [
    'https://example.com/formation',
    'http://example.com/emploi',
    '//example.com/catalogue',
    'www.example.com/formation',
    ' HTTPS://EXAMPLE.COM/formation '
  ]) {
    const url = new URL(withZeliaUtm(href))
    assert.equal(url.searchParams.get('utm_source'), 'zelia')
    assert.equal(url.searchParams.get('utm_medium'), 'referral')
  }
  assert.equal(withZeliaUtm('https://example.com/formation'),
    'https://example.com/formation?utm_source=zelia&utm_medium=referral')
})

test('existing parameters, encoded values and fragments survive attribution', () => {
  const url = new URL(withZeliaUtm('https://example.com/formation?q=%C3%A9cole%20%26%20sant%C3%A9&token=a%2Bb%3D&utm_campaign=rentree#inscription'))
  assert.equal(url.searchParams.get('q'), '\u00e9cole & sant\u00e9')
  assert.equal(url.searchParams.get('token'), 'a+b=')
  assert.equal(url.searchParams.get('utm_campaign'), 'rentree')
  assert.equal(url.hash, '#inscription')
  assert.equal(url.searchParams.get('utm_source'), 'zelia')
})

test('Zelia replaces competing sources without losing campaign attribution', () => {
  const url = new URL(withZeliaUtm('https://example.com/?utm_source=old&utm_source=duplicate&utm_medium=partner&utm_campaign=bac&utm_content=cta&utm_term=bts&utm_id=42'))
  assert.deepEqual(url.searchParams.getAll('utm_source'), ['zelia'])
  assert.equal(url.searchParams.get('utm_medium'), 'partner')
  assert.equal(url.searchParams.get('utm_campaign'), 'bac')
  assert.equal(url.searchParams.get('utm_content'), 'cta')
  assert.equal(url.searchParams.get('utm_term'), 'bts')
  assert.equal(url.searchParams.get('utm_id'), '42')
  assert.equal(withZeliaUtm(url.href), url.href)
})

test('an empty medium receives the referral default', () => {
  assert.equal(new URL(withZeliaUtm('https://example.com/?utm_medium=')).searchParams.get('utm_medium'), 'referral')
})

test('internal links and existing Zelia share campaigns stay unchanged', () => {
  for (const href of [
    '/formations/123?tab=details#contact',
    'formations/123',
    '?page=2',
    '#sources',
    'https://zelia.io/',
    'https://www.zelia.io/formations',
    '//zelia.io/orientation',
    'https://ecoles.zelia.io/catalogue',
    'https://zelia.io?utm_source=share_zelia&utm_medium=dashboard&utm_campaign=copy_link'
  ]) assert.equal(withZeliaUtm(href), href)
})

test('lookalike domains are external', () => {
  for (const href of ['https://notzelia.io/', 'https://zelia.io.example.com/', 'https://zelia.io@example.com/']) {
    assert.equal(new URL(withZeliaUtm(href)).searchParams.get('utm_source'), 'zelia')
  }
})

test('same-origin browser URLs remain internal on development and custom hosts', () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'window')
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { location: { origin: 'http://127.0.0.1:5187' } } })
  try {
    const href = 'http://127.0.0.1:5187/__parent-checkout-test'
    assert.equal(withZeliaUtm(href), href)
    assert.equal(new URL(withZeliaUtm('https://example.com/')).searchParams.get('utm_source'), 'zelia')
  } finally {
    if (previous) Object.defineProperty(globalThis, 'window', previous)
    else delete globalThis.window
  }
})

test('contact links, local downloads and non-navigation protocols stay unchanged', () => {
  for (const href of [
    'mailto:contact@example.com?subject=Bonjour',
    'tel:+33123456789',
    'blob:https://zelia.io/123',
    'data:image/png;base64,abc',
    '/documents/cv.pdf',
    '',
    null,
    undefined
  ]) assert.equal(withZeliaUtm(href), href)
})

test('maps, hosted documents and checkout links retain their navigation data', () => {
  for (const href of [
    'https://www.openstreetmap.org/?mlat=48.85&mlon=2.35#map=12/48.85/2.35',
    'https://www.google.com/maps/search/?api=1&query=Paris',
    'https://res.cloudinary.com/demo/raw/upload/cv.pdf',
    'https://checkout.stripe.com/c/pay/cs_test#fidkdWxOYHwn'
  ]) {
    const original = new URL(href)
    const tracked = new URL(withZeliaUtm(href))
    assert.equal(tracked.origin, original.origin)
    assert.equal(tracked.pathname, original.pathname)
    assert.equal(tracked.hash, original.hash)
    for (const [key, value] of original.searchParams) assert.equal(tracked.searchParams.get(key), value)
    assert.equal(tracked.searchParams.get('utm_source'), 'zelia')
  }
})

test('malformed absolute URLs are reported without changing the existing destination', () => {
  const warning = mock.method(console, 'warn', () => {})
  try {
    assert.equal(withZeliaUtm('https://[invalid'), 'https://[invalid')
    assert.equal(warning.mock.callCount(), 1)
  } finally { warning.mock.restore() }
})
