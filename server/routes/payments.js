import express from 'express'
import stripe, { STRIPE_CONFIG } from '../config/stripe.js'
import { authenticateToken } from '../middleware/auth.js'
import { supabase, supabaseAdmin } from '../config/supabase.js'

const router = express.Router()
const db = supabaseAdmin || supabase

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
