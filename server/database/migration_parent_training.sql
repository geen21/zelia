-- Migration: Formation Zélia pour les parents (landing /parents + paiement Stripe)
-- Run this MANUALLY in the Supabase SQL editor — never executed automatically
-- by the app.

-- ---------------------------------------------------------------------------
-- parent_training_orders: one row per checkout attempt for the paid parent
-- training offered on the public /parents landing page. Created as `pending`
-- when a Stripe Checkout Session is opened, then flipped to `paid` either by
-- the client-side /verify call on return from Stripe, or by the
-- checkout.session.completed webhook (whichever happens first) — see
-- server/routes/payments.js. This is a separate Stripe account/product from
-- the existing Zélia+ app upsell, so it gets its own table rather than
-- reusing `profiles.has_paid`.
-- RLS enabled with NO policies: only the service role (server) can read/write it.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.parent_training_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  first_name TEXT,
  last_name TEXT,
  stripe_checkout_session_id TEXT UNIQUE,
  stripe_customer_id TEXT,
  payment_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (payment_status IN ('pending', 'paid', 'cancelled', 'failed')),
  amount_total INTEGER,
  currency TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.parent_training_orders ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_parent_training_orders_email
  ON public.parent_training_orders (email);
