-- Durable school invitation links: the email carries a Zélia token (stored hashed) that stays
-- valid until the account is activated or invite_expires_at; a fresh Supabase OTP is minted on click.
ALTER TABLE public.school_portal_invitations
  ADD COLUMN IF NOT EXISTS invite_token_hash text,
  ADD COLUMN IF NOT EXISTS invite_expires_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS school_portal_invitations_token_hash_idx
  ON public.school_portal_invitations (invite_token_hash)
  WHERE invite_token_hash IS NOT NULL;
