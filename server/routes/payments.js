import express from 'express'
import stripe, { STRIPE_CONFIG, stripeParentTraining, PARENT_TRAINING_CONFIG } from '../config/stripe.js'
import { authenticateToken } from '../middleware/auth.js'
import { supabase, supabaseAdmin } from '../config/supabase.js'

const router = express.Router()
const db = supabaseAdmin || supabase

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PARENT_TRAINING_ORDERS_TABLE = 'parent_training_orders'

router.get('/config', (req, res) => {
  res.json({
    publishableKey: STRIPE_CONFIG.publishableKey,
    priceId: STRIPE_CONFIG.priceId,
    priceAmount: STRIPE_CONFIG.priceAmount,
    priceCurrency: STRIPE_CONFIG.priceCurrency,
    productName: STRIPE_CONFIG.productName,
    successUrl: STRIPE_CONFIG.successUrl,
    cancelUrl: STRIPE_CONFIG.cancelUrl,
    enabled: Boolean(stripe)
  })
})

router.post('/checkout', authenticateToken, async (req, res) => {
  if (!stripe) {
    return res.status(503).json({ error: 'Stripe is not configured on the server' })
  }
  try {
    const { priceId: requestedPriceId } = req.body || {}
    const priceId = requestedPriceId || STRIPE_CONFIG.priceId

    const useInlinePrice = !priceId

    if (useInlinePrice) {
      const amount = Math.round(STRIPE_CONFIG.priceAmount)
      if (!Number.isFinite(amount) || amount <= 0) {
        return res.status(400).json({ error: 'Stripe price configuration is invalid' })
      }
    }

    const successUrl = STRIPE_CONFIG.successUrl.includes('{CHECKOUT_SESSION_ID}')
      ? STRIPE_CONFIG.successUrl
      : `${STRIPE_CONFIG.successUrl}&session_id={CHECKOUT_SESSION_ID}`

    const lineItems = priceId
      ? [{ price: priceId, quantity: 1 }]
      : [{
          price_data: {
            currency: STRIPE_CONFIG.priceCurrency || 'eur',
            unit_amount: Math.round(STRIPE_CONFIG.priceAmount),
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

      await db
        .from('profiles')
        .update(updatePayload)
        .eq('id', req.user.id)
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
  if (!stripe) {
    return res.status(503).json({ error: 'Stripe is not configured on the server' })
  }
  try {
    const { sessionId } = req.body || {}

    if (!sessionId) {
      return res.status(400).json({ error: 'sessionId is required' })
    }

    const session = await stripe.checkout.sessions.retrieve(sessionId)

    if (!session || session.metadata?.userId !== req.user.id) {
      return res.status(404).json({ error: 'Session not found' })
    }

    const paid = session.payment_status === 'paid'

    if (paid && db) {
      const updatePayload = {
        has_paid: true,
        stripe_last_checkout_id: session.id,
        stripe_last_payment_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }

      if (session.customer && typeof session.customer === 'string') {
        updatePayload.stripe_customer_id = session.customer
      }

      const { error } = await db
        .from('profiles')
        .update(updatePayload)
        .eq('id', req.user.id)

      if (error) {
        console.warn('Failed to persist payment status after verification', error)
      }
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
    enabled: Boolean(stripeParentTraining)
  })
})

router.post('/parent-training/checkout', async (req, res) => {
  if (!stripeParentTraining) {
    return res.status(503).json({ error: 'Stripe is not configured on the server' })
  }

  try {
    const { email, firstName, lastName } = req.body || {}
    const cleanEmail = typeof email === 'string' ? email.trim().toLowerCase() : ''
    const cleanFirstName = typeof firstName === 'string' ? firstName.trim().slice(0, 120) : ''
    const cleanLastName = typeof lastName === 'string' ? lastName.trim().slice(0, 120) : ''

    if (!cleanEmail || !EMAIL_RE.test(cleanEmail)) {
      return res.status(400).json({ error: 'Adresse email invalide' })
    }

    const amount = Math.round(PARENT_TRAINING_CONFIG.priceAmount)
    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ error: 'Stripe price configuration is invalid' })
    }

    const successUrl = PARENT_TRAINING_CONFIG.successUrl.includes('{CHECKOUT_SESSION_ID}')
      ? PARENT_TRAINING_CONFIG.successUrl
      : `${PARENT_TRAINING_CONFIG.successUrl}&session_id={CHECKOUT_SESSION_ID}`

    const session = await stripeParentTraining.checkout.sessions.create({
      mode: 'payment',
      line_items: [{
        price_data: {
          currency: PARENT_TRAINING_CONFIG.priceCurrency || 'eur',
          unit_amount: amount,
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
        console.error('Failed to persist parent training order', error)
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
  if (!stripeParentTraining) {
    return res.status(503).json({ error: 'Stripe is not configured on the server' })
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

    if (paid && db) {
      const updatePayload = {
        payment_status: 'paid',
        amount_total: session.amount_total || null,
        currency: session.currency || null,
        updated_at: new Date().toISOString()
      }

      if (session.customer && typeof session.customer === 'string') {
        updatePayload.stripe_customer_id = session.customer
      }

      const { error } = await db
        .from(PARENT_TRAINING_ORDERS_TABLE)
        .update(updatePayload)
        .eq('stripe_checkout_session_id', session.id)

      if (error) {
        console.warn('Failed to persist parent training payment status after verification', error)
      }
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

export const parentTrainingWebhookHandler = async (req, res) => {
  if (!stripeParentTraining) {
    return res.json({ received: true, disabled: true })
  }
  if (!PARENT_TRAINING_CONFIG.webhookSecret) {
    console.warn('Parent training Stripe webhook secret missing; skipping signature verification')
  }

  let event

  try {
    if (PARENT_TRAINING_CONFIG.webhookSecret) {
      const signature = req.headers['stripe-signature']
      event = stripeParentTraining.webhooks.constructEvent(req.body, signature, PARENT_TRAINING_CONFIG.webhookSecret)
    } else {
      event = req.body
    }
  } catch (err) {
    console.error('Parent training webhook signature verification failed', err)
    return res.status(400).send(`Webhook Error: ${err.message}`)
  }

  try {
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object

      if (session.metadata?.product === 'parent_training' && db) {
        const updatePayload = {
          payment_status: 'paid',
          amount_total: session.amount_total || null,
          currency: session.currency || null,
          updated_at: new Date().toISOString()
        }

        if (session.customer && typeof session.customer === 'string') {
          updatePayload.stripe_customer_id = session.customer
        }

        const { error } = await db
          .from(PARENT_TRAINING_ORDERS_TABLE)
          .update(updatePayload)
          .eq('stripe_checkout_session_id', session.id)

        if (error) {
          console.error('Failed to update parent training order after webhook', error)
        }
      }
    }
  } catch (error) {
    console.error('Parent training webhook processing error:', error)
    return res.status(500).send('Webhook handler failed')
  }

  res.json({ received: true })
}

export const paymentsWebhookHandler = async (req, res) => {
  if (!stripe) {
    // If Stripe isn't configured, acknowledge to avoid retries in non-Stripe envs
    return res.json({ received: true, disabled: true })
  }
  if (!STRIPE_CONFIG.webhookSecret) {
    console.warn('Stripe webhook secret missing; skipping signature verification')
  }

  let event

  try {
    if (STRIPE_CONFIG.webhookSecret) {
      const signature = req.headers['stripe-signature']
      event = stripe.webhooks.constructEvent(req.body, signature, STRIPE_CONFIG.webhookSecret)
    } else {
      event = req.body
    }
  } catch (err) {
    console.error('Webhook signature verification failed', err)
    return res.status(400).send(`Webhook Error: ${err.message}`)
  }

  try {
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object
      const userId = session.metadata?.userId

      if (userId && db) {
        const updatePayload = {
          has_paid: true,
          stripe_last_checkout_id: session.id,
          stripe_last_payment_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }

        if (session.customer && typeof session.customer === 'string') {
          updatePayload.stripe_customer_id = session.customer
        }

        const { error } = await db
          .from('profiles')
          .update(updatePayload)
          .eq('id', userId)

        if (error) {
          console.error('Failed to update profile after webhook', error)
        }
      }
    }
  } catch (error) {
    console.error('Stripe webhook processing error:', error)
    return res.status(500).send('Webhook handler failed')
  }

  res.json({ received: true })
}

export default router
