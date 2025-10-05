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

const defaultClientUrl = process.env.CLIENT_URL || 'http://localhost:5173'

const STRIPE_PRICE_AMOUNT = Number(process.env.STRIPE_PRICE_AMOUNT || 0)
const STRIPE_PRICE_CURRENCY = (process.env.STRIPE_PRICE_CURRENCY || 'eur').toLowerCase()
const STRIPE_PRODUCT_NAME = process.env.STRIPE_PRODUCT_NAME || 'Zélia+ — Accès complet'

export const STRIPE_CONFIG = {
  publishableKey: process.env.STRIPE_PUBLISHABLE_KEY || null,
  priceId: process.env.STRIPE_PRICE_ID || null,
  priceAmount: Number.isFinite(STRIPE_PRICE_AMOUNT) ? STRIPE_PRICE_AMOUNT : 0,
  priceCurrency: STRIPE_PRICE_CURRENCY,
  productName: STRIPE_PRODUCT_NAME,
  successUrl: process.env.STRIPE_SUCCESS_URL || `${defaultClientUrl}/app/niveau/10?checkout=success`,
  cancelUrl: process.env.STRIPE_CANCEL_URL || `${defaultClientUrl}/app/niveau/10?checkout=cancelled`,
  webhookSecret: process.env.STRIPE_WEBHOOK_SECRET || null
}

export default stripe
