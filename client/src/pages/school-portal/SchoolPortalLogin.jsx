import React, { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { PiArrowRight } from 'react-icons/pi'
import { schoolPortalSupabase } from '../../lib/schoolPortalSupabase'
import { SchoolPortalAuthFrame } from './SchoolPortalFrame'

export default function SchoolPortalLogin() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  async function handleSubmit(event) {
    event.preventDefault()
    if (loading) return
    setError(''); setLoading(true)
    try {
      const { error: signInError } = await schoolPortalSupabase.auth.signInWithPassword({ email, password })
      if (signInError) throw signInError
      const { data: assurance, error: mfaError } = await schoolPortalSupabase.auth.mfa.getAuthenticatorAssuranceLevel()
      if (mfaError) throw mfaError
      navigate(assurance.nextLevel === 'aal2' && assurance.currentLevel !== 'aal2' ? '/espace-ecoles/securite?challenge=1' : '/espace-ecoles/leads', { replace: true })
    } catch (failure) { setError(failure.message || 'Échec de connexion.') }
    finally { setLoading(false) }
  }

  return <SchoolPortalAuthFrame footer={<>Pas encore de compte ? <Link className="sp-link" to="/espace-ecoles/inscription">Demander votre inscription</Link></>}>
    <div className="sp-page-head"><div><p className="sp-kicker">Bienvenue dans votre espace</p><h1 className="sp-title">Connexion école</h1><p className="sp-subtitle">Retrouvez vos contacts et les projets qui avancent.</p></div></div>
    <div className="sp-card">
      {error && <p className="sp-alert" role="alert">{error}</p>}
      <form className="sp-stack" onSubmit={handleSubmit} aria-busy={loading}>
        <label className="sp-field" htmlFor="login-email">Email professionnel<input id="login-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="contact@ecole.fr" autoComplete="email" required /></label>
        <label className="sp-field" htmlFor="login-password">Mot de passe<input id="login-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required /></label>
        <Link className="sp-link sp-small" to="/espace-ecoles/mot-de-passe-oublie">Mot de passe oublié ?</Link>
        <button type="submit" disabled={loading} className="sp-btn sp-btn-primary">{loading ? 'Connexion…' : 'Se connecter'}<PiArrowRight aria-hidden="true" /></button>
      </form>
    </div>
  </SchoolPortalAuthFrame>
}
