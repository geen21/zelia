import Stripe from 'stripe'
import dotenv from 'dotenv'

dotenv.config()

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY
const STRIPE_API_VERSION = process.env.STRIPE_API_VERSION

// Build options only if API version is provided
const stripeOptions = {}
if (STRIPE_API_VERSION) {
  stripeOptions.apiVersion = STRIPE_API_VERSION
}

// Initialize Stripe client only when a secret key is set
export const stripe = STRIPE_SECRET_KEY ? new Stripe(STRIPE_SECRET_KEY, stripeOptions) : null

const defaultClientUrl = process.env.CLIENT_URL || 'https://zelia.io'

const STRIPE_PRICE_AMOUNT = Number(process.env.STRIPE_PRICE_AMOUNT || 0)
const STRIPE_PRICE_CURRENCY = (process.env.STRIPE_PRICE_CURRENCY || 'eur').toLowerCase()
const STRIPE_PRODUCT_NAME = process.env.STRIPE_PRODUCT_NAME || 'Zélia+ — Accès complet'

export const STRIPE_CONFIG = {
  publishableKey: process.env.STRIPE_PUBLISHABLE_KEY || null,
  priceId: process.env.STRIPE_PRICE_ID || null,
  priceAmount: Number.isFinite(STRIPE_PRICE_AMOUNT) ? STRIPE_PRICE_AMOUNT : 0,
  priceCurrency: STRIPE_PRICE_CURRENCY,
  productName: STRIPE_PRODUCT_NAME,
  successUrl: process.env.STRIPE_SUCCESS_URL || `${defaultClientUrl}/app/results?checkout=success`,
  cancelUrl: process.env.STRIPE_CANCEL_URL || `${defaultClientUrl}/app/results?checkout=cancelled`,
  webhookSecret: process.env.STRIPE_WEBHOOK_SECRET || null
}

// ---------------------------------------------------------------------------
// Separate Stripe account/product: the "Zélia parents" paid training
// (landing page at /parents). Uses its own secret/publishable keys because it
// is billed through a distinct Stripe account from the main app upsell above.
// ---------------------------------------------------------------------------
const STRIPE_PARENT_SECRET_KEY = process.env.STRIPE_PARENT_SECRET_KEY

const stripeParentOptions = {}
if (STRIPE_API_VERSION) {
  stripeParentOptions.apiVersion = STRIPE_API_VERSION
}

export const stripeParentTraining = STRIPE_PARENT_SECRET_KEY ? new Stripe(STRIPE_PARENT_SECRET_KEY, stripeParentOptions) : null

const STRIPE_PARENT_PRICE_AMOUNT = Number(process.env.STRIPE_PARENT_PRICE_AMOUNT || 2500)
const STRIPE_PARENT_PRICE_CURRENCY = (process.env.STRIPE_PARENT_PRICE_CURRENCY || 'eur').toLowerCase()
const STRIPE_PARENT_PRODUCT_NAME = process.env.STRIPE_PARENT_PRODUCT_NAME || 'Formation Zélia — Devenez le meilleur allié orientation de votre enfant'

export const PARENT_TRAINING_CONFIG = {
  publishableKey: process.env.STRIPE_PARENT_PUBLISHABLE_KEY || null,
  priceAmount: Number.isFinite(STRIPE_PARENT_PRICE_AMOUNT) ? STRIPE_PARENT_PRICE_AMOUNT : 2500,
  priceCurrency: STRIPE_PARENT_PRICE_CURRENCY,
  productName: STRIPE_PARENT_PRODUCT_NAME,
  successUrl: process.env.STRIPE_PARENT_SUCCESS_URL || `${defaultClientUrl}/parents?checkout=success`,
  cancelUrl: process.env.STRIPE_PARENT_CANCEL_URL || `${defaultClientUrl}/parents?checkout=cancelled`,
  webhookSecret: process.env.STRIPE_PARENT_WEBHOOK_SECRET || null
}

export default stripe
