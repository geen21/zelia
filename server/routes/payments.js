import express from 'express'
import stripe, { STRIPE_CONFIG, stripeParentTraining, PARENT_TRAINING_CONFIG } from '../config/stripe.js'
import { authenticateToken } from '../middleware/auth.js'
import { supabaseAdmin } from '../config/supabase.js'

const router = express.Router()
const db = supabaseAdmin

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PARENT_TRAINING_ORDERS_TABLE = 'parent_training_orders'

async function checkoutPrice(client, config) {
  if (config.priceId) {
    const price = await client.prices.retrieve(config.priceId)
    if (price.type !== 'one_time' || !Number.isSafeInteger(price.unit_amount) || price.unit_amount <= 0) {
      throw new Error('Configured Stripe price must be a fixed, one-time price')
    }
    return { amount: price.unit_amount, currency: price.currency, priceId: price.id }
  }
  const amount = Math.round(config.priceAmount)
  if (!Number.isSafeInteger(amount) || amount <= 0 || !/^[a-z]{3}$/.test(config.priceCurrency)) {
    throw new Error('Stripe price configuration is invalid')
  }
  return { amount, currency: config.priceCurrency }
}

async function matchesCheckoutProduct(client, config, session) {
  const expected = await checkoutPrice(client, config)
  if (session.mode !== 'payment' || session.amount_total !== expected.amount || session.currency !== expected.currency) {
    return false
  }
  const items = await client.checkout.sessions.listLineItems(session.id, {
    limit: 2,
    expand: ['data.price.product']
  })
  if (items.has_more || items.data.length !== 1) return false
  const item = items.data[0]
  if (item.quantity !== 1 || item.price?.unit_amount !== expected.amount || item.price?.currency !== expected.currency) {
    return false
  }
  return expected.priceId
    ? item.price.id === expected.priceId
    : item.price.product?.name === config.productName
}

async function persistPaidSession(session, parentTraining) {
  const updatePayload = parentTraining
    ? { payment_status: 'paid', amount_total: session.amount_total, currency: session.currency }
    : {
        has_paid: true,
        stripe_last_checkout_id: session.id,
        stripe_last_payment_at: new Date().toISOString()
      }
  updatePayload.updated_at = new Date().toISOString()
  if (session.customer && typeof session.customer === 'string') {
    updatePayload.stripe_customer_id = session.customer
  }
  const query = parentTraining
    ? db.from(PARENT_TRAINING_ORDERS_TABLE).update(updatePayload)
        .eq('stripe_checkout_session_id', session.id).neq('payment_status', 'paid')
    : db.from('profiles').update(updatePayload)
        .eq('id', session.metadata.userId).or('has_paid.is.null,has_paid.eq.false')
  const { error } = await query
  if (error) throw error
}

router.get('/config', (req, res) => {
  res.json({
    publishableKey: STRIPE_CONFIG.publishableKey,
    priceId: STRIPE_CONFIG.priceId,
    priceAmount: STRIPE_CONFIG.priceAmount,
    priceCurrency: STRIPE_CONFIG.priceCurrency,
    productName: STRIPE_CONFIG.productName,
    successUrl: STRIPE_CONFIG.successUrl,
    cancelUrl: STRIPE_CONFIG.cancelUrl,
    enabled: Boolean(stripe && db)
  })
})

router.post('/checkout', authenticateToken, async (req, res) => {
  if (!stripe || !db) {
    return res.status(503).json({ error: 'Stripe and the service-role database client must be configured' })
  }
  try {
    const { priceId: requestedPriceId } = req.body || {}
    const priceId = STRIPE_CONFIG.priceId
    if (requestedPriceId != null && requestedPriceId !== priceId) {
      return res.status(400).json({ error: 'priceId must match the server-configured price' })
    }
    const expected = await checkoutPrice(stripe, STRIPE_CONFIG)

    const successUrl = STRIPE_CONFIG.successUrl.includes('{CHECKOUT_SESSION_ID}')
      ? STRIPE_CONFIG.successUrl
      : `${STRIPE_CONFIG.successUrl}&session_id={CHECKOUT_SESSION_ID}`

    const lineItems = priceId
      ? [{ price: priceId, quantity: 1 }]
      : [{
          price_data: {
            currency: expected.currency,
            unit_amount: expected.amount,
            product_data: {
              name: STRIPE_CONFIG.productName || 'Zélia+ — Accès complet'
            }
          },
          quantity: 1
        }]

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: lineItems,
      success_url: successUrl,
      cancel_url: STRIPE_CONFIG.cancelUrl,
      customer_email: req.user.email || undefined,
      metadata: {
        product: 'zelia_access',
        userId: req.user.id
      }
    })

    // Persist latest checkout session for reference
    if (db) {
      const updatePayload = {
        stripe_last_checkout_id: session.id,
        updated_at: new Date().toISOString()
      }

      if (session.customer && typeof session.customer === 'string') {
        updatePayload.stripe_customer_id = session.customer
      }

      const { error } = await db
        .from('profiles')
        .update(updatePayload)
        .eq('id', req.user.id)
      if (error) throw error
    }

    res.json({
      sessionId: session.id,
      url: session.url
    })
  } catch (error) {
    console.error('Stripe checkout error:', error)
    res.status(500).json({ error: 'Unable to create checkout session' })
  }
})

router.post('/verify', authenticateToken, async (req, res) => {
  if (!stripe || !db) {
    return res.status(503).json({ error: 'Stripe and the service-role database client must be configured' })
  }
  try {
    const { sessionId } = req.body || {}

    if (!sessionId || typeof sessionId !== 'string') {
      return res.status(400).json({ error: 'sessionId is required' })
    }

    const session = await stripe.checkout.sessions.retrieve(sessionId)

    if (!session || session.metadata?.userId !== req.user.id
      || (session.metadata.product && session.metadata.product !== 'zelia_access')) {
      return res.status(404).json({ error: 'Session not found' })
    }

    const paid = session.payment_status === 'paid'

    if (paid) {
      if (!await matchesCheckoutProduct(stripe, STRIPE_CONFIG, session)) {
        return res.status(400).json({ error: 'Checkout does not match the configured product and price' })
      }
      await persistPaidSession(session, false)
    }

    res.json({
      paid,
      session: session
        ? {
            id: session.id,
            status: session.status,
            payment_status: session.payment_status,
            amount_total: session.amount_total,
            currency: session.currency
          }
        : null
    })
  } catch (error) {
    console.error('Stripe verify error:', error)
    res.status(500).json({ error: 'Unable to verify payment status' })
  }
})

// ---------------------------------------------------------------------------
// Parent training (landing page /parents): public checkout, no Zélia account
// required. Uses a separate Stripe account/product (see config/stripe.js)
// and its own `parent_training_orders` table.
// ---------------------------------------------------------------------------

router.get('/parent-training/config', (req, res) => {
  res.json({
    publishableKey: PARENT_TRAINING_CONFIG.publishableKey,
    priceAmount: PARENT_TRAINING_CONFIG.priceAmount,
    priceCurrency: PARENT_TRAINING_CONFIG.priceCurrency,
    productName: PARENT_TRAINING_CONFIG.productName,
    enabled: Boolean(stripeParentTraining && db)
  })
})

router.post('/parent-training/checkout', async (req, res) => {
  if (!stripeParentTraining || !db) {
    return res.status(503).json({ error: 'Stripe and the service-role database client must be configured' })
  }

  try {
    const { email, firstName, lastName } = req.body || {}
    const cleanEmail = typeof email === 'string' ? email.trim().toLowerCase() : ''
    const cleanFirstName = typeof firstName === 'string' ? firstName.trim().slice(0, 120) : ''
    const cleanLastName = typeof lastName === 'string' ? lastName.trim().slice(0, 120) : ''

    if (!cleanEmail || !EMAIL_RE.test(cleanEmail)) {
      return res.status(400).json({ error: 'Adresse email invalide' })
    }

    const expected = await checkoutPrice(stripeParentTraining, PARENT_TRAINING_CONFIG)

    const successUrl = PARENT_TRAINING_CONFIG.successUrl.includes('{CHECKOUT_SESSION_ID}')
      ? PARENT_TRAINING_CONFIG.successUrl
      : `${PARENT_TRAINING_CONFIG.successUrl}&session_id={CHECKOUT_SESSION_ID}`

    const session = await stripeParentTraining.checkout.sessions.create({
      mode: 'payment',
      line_items: [{
        price_data: {
          currency: expected.currency,
          unit_amount: expected.amount,
          product_data: {
            name: PARENT_TRAINING_CONFIG.productName
          }
        },
        quantity: 1
      }],
      success_url: successUrl,
      cancel_url: PARENT_TRAINING_CONFIG.cancelUrl,
      customer_email: cleanEmail,
      metadata: {
        product: 'parent_training',
        firstName: cleanFirstName,
        lastName: cleanLastName
      }
    })

    if (db) {
      const { error } = await db
        .from(PARENT_TRAINING_ORDERS_TABLE)
        .insert({
          email: cleanEmail,
          first_name: cleanFirstName || null,
          last_name: cleanLastName || null,
          stripe_checkout_session_id: session.id,
          payment_status: 'pending',
          currency: PARENT_TRAINING_CONFIG.priceCurrency
        })

      if (error) {
        throw error
      }
    }

    res.json({
      sessionId: session.id,
      url: session.url
    })
  } catch (error) {
    console.error('Stripe parent-training checkout error:', error)
    res.status(500).json({ error: 'Unable to create checkout session' })
  }
})

router.post('/parent-training/verify', async (req, res) => {
  if (!stripeParentTraining || !db) {
    return res.status(503).json({ error: 'Stripe and the service-role database client must be configured' })
  }

  try {
    const { sessionId } = req.body || {}

    if (!sessionId || typeof sessionId !== 'string') {
      return res.status(400).json({ error: 'sessionId is required' })
    }

    const session = await stripeParentTraining.checkout.sessions.retrieve(sessionId)

    if (!session || session.metadata?.product !== 'parent_training') {
      return res.status(404).json({ error: 'Session not found' })
    }

    const paid = session.payment_status === 'paid'

    if (paid) {
      if (!await matchesCheckoutProduct(stripeParentTraining, PARENT_TRAINING_CONFIG, session)) {
        return res.status(400).json({ error: 'Checkout does not match the configured product and price' })
      }
      await persistPaidSession(session, true)
    }

    res.json({
      paid,
      session: {
        id: session.id,
        status: session.status,
        payment_status: session.payment_status,
        amount_total: session.amount_total,
        currency: session.currency
      }
    })
  } catch (error) {
    console.error('Stripe parent-training verify error:', error)
    res.status(500).json({ error: 'Unable to verify payment status' })
  }
})

function webhookHandler(client, config, parentTraining) {
  return async (req, res) => {
    if (!client || !config.webhookSecret || !db) {
      console.error('Stripe webhook requires Stripe, a signing secret and the service-role database client')
      return res.status(503).json({ error: 'Webhook is not configured' })
    }
    let event
    try {
      event = client.webhooks.constructEvent(req.body, req.headers['stripe-signature'], config.webhookSecret)
    } catch (error) {
      console.error('Webhook signature verification failed', error)
      return res.status(400).send('Invalid webhook signature')
    }
    try {
      if (!['checkout.session.completed', 'checkout.session.async_payment_succeeded', 'checkout.session.async_payment_failed'].includes(event.type)) {
        return res.json({ received: true })
      }
      const session = event.data.object
      if (parentTraining
        ? session.metadata?.product !== 'parent_training'
        : !session.metadata?.userId || (session.metadata.product && session.metadata.product !== 'zelia_access')) {
        return res.json({ received: true, ignored: true })
      }
      if (event.type === 'checkout.session.async_payment_failed') {
        if (parentTraining) {
          const { error } = await db.from(PARENT_TRAINING_ORDERS_TABLE)
            .update({ payment_status: 'failed', updated_at: new Date().toISOString() })
            .eq('stripe_checkout_session_id', session.id).neq('payment_status', 'paid')
          if (error) throw error
        }
        return res.json({ received: true })
      }
      if (session.payment_status !== 'paid') {
        if (event.type === 'checkout.session.async_payment_succeeded') {
          console.error('Stripe async success event has no settled payment', session.id)
          return res.status(400).json({ error: 'Payment is not settled' })
        }
        return res.json({ received: true, pending: true })
      }
      if (!await matchesCheckoutProduct(client, config, session)) {
        console.error('Stripe webhook checkout does not match the configured product and price', session.id)
        return res.status(400).json({ error: 'Unexpected checkout product or price' })
      }
      await persistPaidSession(session, parentTraining)
      return res.json({ received: true })
    } catch (error) {
      console.error('Stripe webhook processing error:', error)
      return res.status(500).send('Webhook handler failed')
    }
  }
}

export const parentTrainingWebhookHandler = webhookHandler(stripeParentTraining, PARENT_TRAINING_CONFIG, true)
export const paymentsWebhookHandler = webhookHandler(stripe, STRIPE_CONFIG, false)

export default router
