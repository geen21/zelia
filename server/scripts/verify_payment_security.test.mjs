import assert from 'node:assert/strict'
import { once } from 'node:events'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import express from 'express'
import Stripe from 'stripe'

let fixtureNumber = 0

async function fixture(t, { inline = false, database = true, signingSecret = true } = {}) {
  const config = {
    priceId: inline ? null : 'price_access',
    priceAmount: 5000,
    priceCurrency: 'eur',
    productName: 'Access',
    successUrl: 'https://app.example/results?checkout=success',
    cancelUrl: 'https://app.example/results?checkout=cancelled',
    webhookSecret: signingSecret ? 'fixture-main-secret' : null
  }
  const parentConfig = { ...config, priceId: null, priceAmount: 2500, productName: 'Parents', webhookSecret: signingSecret ? 'fixture-parent-secret' : null }
  const tables = {
    profiles: [{ id: 'student', has_paid: false }],
    parent_training_orders: [{ stripe_checkout_session_id: 'cs_parent', payment_status: 'pending' }]
  }
  const state = { creates: [], writes: [], databaseError: false, lineItemError: false, sessions: {}, items: {} }
  function payment(id, parent = false) {
    const current = parent ? parentConfig : config
    const session = {
      id, mode: 'payment', status: 'complete', payment_status: 'paid',
      amount_total: current.priceAmount, currency: current.priceCurrency, customer: 'cus_fixture',
      metadata: parent ? { product: 'parent_training' } : { userId: 'student', product: 'zelia_access' }
    }
    state.sessions[id] = session
    state.items[id] = { has_more: false, data: [{
      quantity: 1,
      price: { id: current.priceId || 'price_inline', unit_amount: current.priceAmount, currency: current.priceCurrency,
        product: { id: 'prod_fixture', name: current.productName } }
    }] }
    return session
  }
  payment('cs_access')
  payment('cs_parent', true)
  const client = {
    prices: { async retrieve(id) { return { id, active: true, type: 'one_time', unit_amount: 5000, currency: 'eur' } } },
    checkout: { sessions: {
      async create(input) { state.creates.push(input); return { id: 'cs_created', url: 'https://checkout.example/session' } },
      async retrieve(id) { return state.sessions[id] || null },
      async listLineItems(id) {
        if (state.lineItemError) throw new Error('Stripe unavailable')
        return state.items[id]
      }
    } },
    webhooks: new Stripe('sk_test_fixture').webhooks
  }
  const db = {
    from(table) {
      let payload, insert = false
      const filters = []
      return {
        update(value) { payload = value; return this },
        insert(value) { payload = value; insert = true; return this },
        eq(key, value) { filters.push(row => row[key] === value); return this },
        neq(key, value) { filters.push(row => row[key] !== value); return this },
        or(value) {
          assert.equal(value, 'has_paid.is.null,has_paid.eq.false')
          filters.push(row => row.has_paid == null || row.has_paid === false)
          return this
        },
        then(resolve, reject) {
          return Promise.resolve().then(() => {
            if (state.databaseError) return { error: new Error('Database unavailable') }
            if (insert) {
              tables[table].push({ ...payload })
              state.writes.push({ table, payload })
            } else {
              for (const row of tables[table].filter(row => filters.every(filter => filter(row)))) {
                Object.assign(row, payload)
                state.writes.push({ table, payload })
              }
            }
            return { error: null }
          }).then(resolve, reject)
        }
      }
    }
  }
  // Replace only module adapters so this HTTP suite never loads secrets or external clients.
  const source = await readFile(new URL('../routes/payments.js', import.meta.url), 'utf8')
  const offset = source.indexOf('const router =')
  const imports = source.slice(0, offset).trim().split(/\r?\n/).filter(Boolean)
  assert.equal(imports.length, 4)
  assert.ok(imports.every(line => line.startsWith('import ')))
  const key = `paymentSecurityFixture${fixtureNumber++}`
  globalThis[key] = {
    express, stripe: client, stripeParentTraining: client,
    STRIPE_CONFIG: config, PARENT_TRAINING_CONFIG: parentConfig, supabaseAdmin: database ? db : null,
    authenticateToken(req, res, next) {
      if (!req.headers.authorization) return res.sendStatus(401)
      req.user = { id: 'student', email: 'student@example.com' }
      next()
    }
  }
  let routes
  try {
    routes = await import(`data:text/javascript;base64,${Buffer.from(
      `const { express, stripe, stripeParentTraining, STRIPE_CONFIG, PARENT_TRAINING_CONFIG, supabaseAdmin, authenticateToken } = globalThis.${key};\n${source.slice(offset)}\n//# sourceURL=payment-security-fixture.js`
    ).toString('base64')}`)
  } finally {
    delete globalThis[key]
  }
  const app = express()
  app.post('/webhook', express.raw({ type: 'application/json' }), routes.paymentsWebhookHandler)
  app.post('/parent-webhook', express.raw({ type: 'application/json' }), routes.parentTrainingWebhookHandler)
  app.use('/payments', express.json(), routes.default)
  const server = app.listen(0, '127.0.0.1')
  await once(server, 'listening')
  t.after(() => new Promise((resolve, reject) => {
    server.close(error => error ? reject(error) : resolve())
    server.closeAllConnections()
  }))
  const base = `http://127.0.0.1:${server.address().port}`
  const post = (path, body, signature) => fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer fixture', ...(signature ? { 'stripe-signature': signature } : {}) },
    body: JSON.stringify(body)
  })
  const webhook = (type, session, parent = false, signature) => {
    const body = { type, data: { object: session } }
    const secret = (parent ? parentConfig : config).webhookSecret
    const header = signature || (secret
      ? client.webhooks.generateTestHeaderString({ payload: JSON.stringify(body), secret })
      : 'missing-secret')
    return post(parent ? '/parent-webhook' : '/webhook', body, header)
  }
  return { state, tables, post, webhook, config, parentConfig, payment }
}

test('checkout rejects a client-selected price and uses only the configured fixed price', async t => {
  const { post, state } = await fixture(t)
  assert.equal((await post('/payments/checkout', { priceId: 'price_cheaper' })).status, 400)
  assert.equal(state.creates.length, 0)
  assert.equal((await post('/payments/checkout', { priceId: 'price_access', userId: 'other' })).status, 200)
  assert.deepEqual(state.creates[0].line_items, [{ price: 'price_access', quantity: 1 }])
  assert.deepEqual(state.creates[0].metadata, { userId: 'student', product: 'zelia_access' })
})

test('inline checkout retains the server amount, currency and product', async t => {
  const { post, state } = await fixture(t, { inline: true })
  assert.equal((await post('/payments/checkout', { priceId: 'price_cheaper' })).status, 400)
  assert.equal((await post('/payments/checkout', {})).status, 200)
  assert.deepEqual(state.creates[0].line_items[0].price_data, {
    currency: 'eur', unit_amount: 5000, product_data: { name: 'Access' }
  })
  assert.equal((await post('/payments/parent-training/checkout', { email: 'parent@example.com' })).status, 200)
  assert.equal(state.creates[1].line_items[0].price_data.unit_amount, 2500)
})

test('verification rejects wrong owners, amounts, currencies, prices and extra line items', async t => {
  const { post, state, tables, payment } = await fixture(t)
  const verify = () => post('/payments/verify', { sessionId: 'cs_access' })
  state.sessions.cs_access.metadata.userId = 'other'
  assert.equal((await verify()).status, 404)
  payment('cs_access').amount_total = 1
  assert.equal((await verify()).status, 400)
  payment('cs_access').currency = 'usd'
  assert.equal((await verify()).status, 400)
  payment('cs_access')
  state.items.cs_access.data[0].price.id = 'price_cheaper'
  assert.equal((await verify()).status, 400)
  payment('cs_access')
  state.items.cs_access.data.push(state.items.cs_access.data[0])
  assert.equal((await verify()).status, 400)
  payment('cs_access')
  state.items.cs_access.has_more = true
  assert.equal((await verify()).status, 400)
  payment('cs_access')
  state.items.cs_access.data[0].quantity = 2
  assert.equal((await verify()).status, 400)
  assert.equal(tables.profiles[0].has_paid, false)
  assert.equal(state.writes.length, 0)
  payment('cs_access')
  assert.equal((await verify()).status, 200)
  assert.equal(tables.profiles[0].has_paid, true)
})

test('legacy paid sessions still verify; configured price IDs override inline amount settings', async t => {
  const { post, config, state, tables } = await fixture(t)
  delete state.sessions.cs_access.metadata.product
  tables.profiles[0].has_paid = null
  config.priceAmount = 0
  config.priceCurrency = 'usd'
  assert.equal((await post('/payments/verify', { sessionId: 'cs_access' })).status, 200)
  assert.equal(tables.profiles[0].has_paid, true)
})

test('verification and inconsistent async-success events never activate unpaid sessions', async t => {
  const { post, webhook, state, tables } = await fixture(t)
  for (const [id, parent] of [['cs_access', false], ['cs_parent', true]]) {
    state.sessions[id].payment_status = 'unpaid'
    const response = await post(parent ? '/payments/parent-training/verify' : '/payments/verify', { sessionId: id })
    assert.equal(response.status, 200)
    assert.equal((await response.json()).paid, false)
    assert.equal((await webhook('checkout.session.async_payment_succeeded', state.sessions[id], parent)).status, 400)
  }
  assert.equal(state.writes.length, 0)
  assert.equal(tables.profiles[0].has_paid, false)
  assert.equal(tables.parent_training_orders[0].payment_status, 'pending')
})

test('inline and parent verification check the product, not just a matching amount', async t => {
  const { post, state, tables } = await fixture(t, { inline: true })
  for (const [id, path] of [['cs_access', '/payments/verify'], ['cs_parent', '/payments/parent-training/verify']]) {
    state.items[id].data[0].price.product.name = 'Other product'
    assert.equal((await post(path, { sessionId: id })).status, 400)
  }
  assert.equal(tables.profiles[0].has_paid, false)
  assert.equal(tables.parent_training_orders[0].payment_status, 'pending')
})

test('delayed payments stay pending until signed async success; retries do not duplicate activation', async t => {
  const { webhook, state, tables } = await fixture(t)
  for (const [id, parent] of [['cs_access', false], ['cs_parent', true]]) {
    const session = state.sessions[id]
    session.payment_status = 'unpaid'
    assert.equal((await webhook('checkout.session.completed', session, parent)).status, 200)
    assert.equal(state.writes.length, parent ? 1 : 0)
    if (parent) assert.equal(tables.parent_training_orders[0].payment_status, 'pending')
    else assert.equal(tables.profiles[0].has_paid, false)
    session.payment_status = 'paid'
    assert.equal((await webhook('checkout.session.async_payment_succeeded', session, parent)).status, 200)
    const writes = state.writes.length
    assert.equal((await webhook('checkout.session.async_payment_succeeded', session, parent)).status, 200)
    assert.equal(state.writes.length, writes)
  }
  assert.equal(tables.profiles[0].has_paid, true)
  assert.equal(tables.parent_training_orders[0].payment_status, 'paid')
})

test('async failure records failure without revoking a previous successful payment', async t => {
  const { webhook, state, tables } = await fixture(t)
  assert.equal((await webhook('checkout.session.async_payment_failed', state.sessions.cs_parent, true)).status, 200)
  assert.equal(tables.parent_training_orders[0].payment_status, 'failed')
  assert.equal((await webhook('checkout.session.async_payment_succeeded', state.sessions.cs_parent, true)).status, 200)
  assert.equal(tables.parent_training_orders[0].payment_status, 'paid')
  assert.equal((await webhook('checkout.session.async_payment_failed', state.sessions.cs_parent, true)).status, 200)
  assert.equal(tables.parent_training_orders[0].payment_status, 'paid')
  state.sessions.cs_access.payment_status = 'unpaid'
  assert.equal((await webhook('checkout.session.async_payment_failed', state.sessions.cs_access)).status, 200)
  assert.equal(tables.profiles[0].has_paid, false)
})

test('webhooks reject unsigned and mismatched payments on both products', async t => {
  const { webhook, state } = await fixture(t)
  for (const [id, parent] of [['cs_access', false], ['cs_parent', true]]) {
    assert.equal((await webhook('checkout.session.completed', state.sessions[id], parent, 'invalid')).status, 400)
    state.sessions[id].amount_total = 1
    assert.equal((await webhook('checkout.session.completed', state.sessions[id], parent)).status, 400)
  }
  assert.equal(state.writes.length, 0)
})

test('missing signing secrets or a service-role client fail closed', async t => {
  const missingSecret = await fixture(t, { signingSecret: false })
  assert.equal((await missingSecret.webhook('checkout.session.completed', missingSecret.state.sessions.cs_access)).status, 503)
  assert.equal((await missingSecret.webhook('checkout.session.completed', missingSecret.state.sessions.cs_parent, true)).status, 503)
  const missingDatabase = await fixture(t, { database: false })
  assert.equal((await missingDatabase.post('/payments/checkout', {})).status, 503)
  assert.equal((await missingDatabase.post('/payments/verify', { sessionId: 'cs_access' })).status, 503)
  assert.equal((await missingDatabase.post('/payments/parent-training/checkout', { email: 'parent@example.com' })).status, 503)
  assert.equal((await missingDatabase.post('/payments/parent-training/verify', { sessionId: 'cs_parent' })).status, 503)
  assert.equal((await missingDatabase.webhook('checkout.session.completed', missingDatabase.state.sessions.cs_access)).status, 503)
})

test('Stripe and persistence errors are not acknowledged as successful activation', async t => {
  const { post, webhook, state, tables } = await fixture(t)
  state.lineItemError = true
  assert.equal((await post('/payments/verify', { sessionId: 'cs_access' })).status, 500)
  state.lineItemError = false
  state.databaseError = true
  assert.equal((await post('/payments/checkout', {})).status, 500)
  assert.equal((await post('/payments/parent-training/checkout', { email: 'parent@example.com' })).status, 500)
  assert.equal((await post('/payments/verify', { sessionId: 'cs_access' })).status, 500)
  assert.equal((await post('/payments/parent-training/verify', { sessionId: 'cs_parent' })).status, 500)
  for (const [id, parent] of [['cs_access', false], ['cs_parent', true]]) {
    assert.equal((await webhook('checkout.session.completed', state.sessions[id], parent)).status, 500)
  }
  assert.equal((await webhook('checkout.session.async_payment_failed', state.sessions.cs_parent, true)).status, 500)
  assert.equal(tables.profiles[0].has_paid, false)
  assert.equal(tables.parent_training_orders[0].payment_status, 'pending')
  state.databaseError = false
  assert.equal((await webhook('checkout.session.completed', state.sessions.cs_access)).status, 200)
  assert.equal(tables.profiles[0].has_paid, true)
})
