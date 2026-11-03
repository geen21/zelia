import React, { useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { FcGoogle } from 'react-icons/fc'
import { PiArrowLeft, PiArrowRight, PiCheckCircle, PiCompass, PiEye, PiEyeSlash, PiWarningCircle } from 'react-icons/pi'
import { supabase } from '../lib/supabase'
import {
  buildAuthCallbackUrl,
  buildProfileFromSupabaseUser,
  getOnboardingCache,
  persistAuthSessionAndOnboarding,
  rememberAuthAfter
} from '../lib/authFlow'
import './Login.css'

function getLoginErrorMessage(error) {
  if (error?.code === 'invalid_credentials' || error?.message === 'Invalid login credentials') {
    return 'Email ou mot de passe incorrect. Vérifie tes informations et réessaie.'
  }
  if (error?.code === 'email_not_confirmed' || error?.message === 'Email not confirmed') {
    return 'Confirme ton adresse email avec le lien reçu avant de te connecter.'
  }
  if (error?.status === 429 || error?.response?.status === 429) {
    return 'Trop de tentatives de connexion. Patiente un moment avant de réessayer.'
  }
  if (error?.response?.status >= 500) {
    return 'Impossible de préparer ton espace pour le moment. Tes réponses sont conservées, réessaie.'
  }
  return error?.message || 'Connexion impossible pour le moment. Réessaie dans un instant.'
}

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const after = params.get('after') || ''
  const cache = useMemo(() => getOnboardingCache(), [])
  const hasOrientationCache = cache.answers.length > 0 || Boolean(cache.avatarData)
  const registerSearch = after ? `?${new URLSearchParams({ after })}` : ''

  async function continueWithGoogle() {
    if (loading) return
    setError('')
    setLoading('google')
    rememberAuthAfter(after)

    try {
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: buildAuthCallbackUrl(after),
          queryParams: { prompt: 'select_account' }
        }
      })
      if (oauthError) throw oauthError

    } catch (oauthError) {
      setError(getLoginErrorMessage(oauthError))
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
      setError(getLoginErrorMessage(loginError))
    } finally {
      setLoading('')
    }
  }

  return (
    <main className="login-page">
      <div className="login-shell">
        <header className="login-nav">
          <Link to="/" className="login-logo" aria-label="Accueil Zélia">
            <img src="/static/images/logo-dark.png" alt="Zélia" />
          </Link>
          <Link to="/" className="login-back"><PiArrowLeft aria-hidden="true" />Accueil</Link>
        </header>

        <section className="login-card" aria-labelledby="login-title" aria-busy={Boolean(loading)}>
          <div className="login-heading">
            <span className="login-icon"><PiCompass size={28} aria-hidden="true" /></span>
            <p className="login-kicker">Connexion</p>
            <h1 id="login-title">Reprends ton parcours</h1>
            <p className="login-description">Tes idées de métiers, tes formations et tes outils t'attendent. On continue ?</p>
          </div>

          {hasOrientationCache && (
            <div className="login-resume" role="note">
              <PiCheckCircle size={22} aria-hidden="true" />
              <p>Ton parcours est en attente. Connecte-toi pour reprendre sans recommencer.</p>
            </div>
          )}

          <button
            type="button"
            onClick={continueWithGoogle}
            disabled={Boolean(loading)}
            className="login-google"
          >
            <FcGoogle size={22} aria-hidden="true" focusable="false" />
            {loading === 'google' ? 'Ouverture de Google…' : 'Continuer avec Google'}
          </button>

          <div className="login-divider"><span>ou avec ton email</span></div>

          {error && <div id="login-error" className="login-error" role="alert">
            <PiWarningCircle size={22} aria-hidden="true" />
            <p>{error}</p>
          </div>}

          <form onSubmit={handleSubmit} className="login-form" aria-label="Connexion par email">
            <label htmlFor="login-email">Email</label>
            <input
              id="login-email"
              name="email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="toi@email.com"
              className="login-input"
              autoComplete="email"
              autoCapitalize="none"
              spellCheck={false}
              readOnly={Boolean(loading)}
              required
            />
            <label htmlFor="login-password">Mot de passe</label>
            <div className="login-password">
              <input
                id="login-password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Ton mot de passe"
                className="login-input"
                autoComplete="current-password"
                readOnly={Boolean(loading)}
                required
              />
              <button
                type="button"
                className="login-password-toggle"
                onClick={() => setShowPassword((value) => !value)}
                aria-label={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
                aria-pressed={showPassword}
                aria-controls="login-password"
              >
                {showPassword ? <PiEyeSlash size={21} aria-hidden="true" /> : <PiEye size={21} aria-hidden="true" />}
              </button>
            </div>
            <button type="submit" disabled={Boolean(loading)} className="login-submit">
              {loading === 'email' ? 'Connexion en cours…' : 'Se connecter'}
              {loading === 'email'
                ? <span className="login-spinner" aria-hidden="true" />
                : <PiArrowRight size={20} aria-hidden="true" />}
            </button>
          </form>

          <div className="login-register">
            <p>Pas encore de compte ?</p>
            <Link to={`/register${registerSearch}`}>Créer un compte<PiArrowRight size={16} aria-hidden="true" /></Link>
          </div>

        </section>
      </div>
    </main>
  )
}
