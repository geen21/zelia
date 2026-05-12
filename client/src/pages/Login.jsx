import React, { useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import {
  buildAuthCallbackUrl,
  buildProfileFromSupabaseUser,
  getOnboardingCache,
  persistAuthSessionAndOnboarding,
  rememberAuthAfter
} from '../lib/authFlow'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState('')
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const after = params.get('after') || ''
  const cache = useMemo(() => getOnboardingCache(), [])
  const hasOrientationCache = cache.answers.length > 0 || Boolean(cache.avatarData)

  async function continueWithGoogle() {
    if (loading) return
    setError('')
    setLoading('google')
    rememberAuthAfter(after)

    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: buildAuthCallbackUrl(after),
        queryParams: { prompt: 'select_account' }
      }
    })

    if (oauthError) {
      setError(oauthError.message || 'Connexion Google impossible')
      setLoading('')
    }
  }

  async function handleSubmit(event) {
    event.preventDefault()
    if (loading) return
    setError('')
    setLoading('email')

    try {
      const { data, error: authError } = await supabase.auth.signInWithPassword({ email, password })
      if (authError) throw authError

      const target = await persistAuthSessionAndOnboarding({
        after,
        profileData: buildProfileFromSupabaseUser(data.user)
      })
      navigate(target, { replace: true })
    } catch (loginError) {
      setError(loginError?.message || 'Échec de connexion')
    } finally {
      setLoading('')
    }
  }

  return (
    <main className="min-h-screen bg-[#fffbf7] text-black flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-md">
        <Link to="/" className="inline-flex mb-8" aria-label="Accueil Zelia">
          <img src="/static/images/logo-dark.png" alt="Zelia" className="h-8 w-auto" />
        </Link>

        <div className="bg-white border border-line rounded-lg shadow-card p-6 sm:p-7">
          <div className="mb-6">
            <p className="text-xs uppercase font-medium text-text-secondary tracking-normal mb-2">Connexion</p>
            <h1 className="text-2xl font-semibold leading-tight mb-2">Reprendre ton espace</h1>
            <p className="text-sm text-text-secondary">Connexion via Supabase. Google fonctionne directement si ton compte est lié.</p>
          </div>

          {hasOrientationCache && (
            <div className="mb-4 rounded-lg border border-[#c1ff72] bg-[#f8fff0] px-4 py-3 text-sm font-medium">
              Tes réponses en attente seront rattachées après connexion.
            </div>
          )}

          <button
            type="button"
            onClick={continueWithGoogle}
            disabled={Boolean(loading)}
            className="w-full h-12 rounded-lg border border-gray-200 bg-white text-black font-semibold inline-flex items-center justify-center gap-3 hover:border-black disabled:opacity-60"
          >
            <span className="inline-grid place-items-center w-6 h-6 rounded-full bg-black text-white text-xs font-semibold">G</span>
            {loading === 'google' ? 'Ouverture de Google...' : 'Continuer avec Google'}
          </button>

          <div className="my-5 flex items-center gap-3 text-xs uppercase font-medium text-text-secondary">
            <span className="h-px flex-1 bg-line" />
            <span>Email</span>
            <span className="h-px flex-1 bg-line" />
          </div>

          <form onSubmit={handleSubmit} className="space-y-3">
            <label className="block">
              <span className="block text-xs font-medium text-text-secondary mb-1">Email</span>
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="toi@email.com"
                className="w-full h-11 rounded-lg border border-line px-3 outline-none focus:border-black"
                autoComplete="email"
                required
              />
            </label>
            <label className="block">
              <span className="block text-xs font-medium text-text-secondary mb-1">Mot de passe</span>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="••••••••"
                className="w-full h-11 rounded-lg border border-line px-3 outline-none focus:border-black"
                autoComplete="current-password"
                required
              />
            </label>

            {error && <div className="rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

            <button
              type="submit"
              disabled={Boolean(loading)}
              className="w-full h-12 rounded-lg bg-black text-white font-semibold disabled:opacity-60"
            >
              {loading === 'email' ? 'Connexion...' : 'Se connecter'}
            </button>
          </form>
        </div>

        <p className="mt-4 text-center text-sm text-text-secondary">
          Pas encore de compte ? <Link to={`/register${after ? `?after=${after}` : ''}`} className="text-black font-medium underline">Créer un compte</Link>
        </p>
      </div>
    </main>
  )
}
