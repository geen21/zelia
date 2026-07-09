import React, { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { schoolPortalSupabase } from '../../lib/schoolPortalSupabase'
import './SchoolPortal.css'

export default function SchoolPortalLogin() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  async function handleSubmit(event) {
    event.preventDefault()
    if (loading) return
    setError('')
    setLoading(true)

    try {
      const { error: signInError } = await schoolPortalSupabase.auth.signInWithPassword({ email, password })
      if (signInError) throw signInError
      navigate('/espace-ecoles/leads', { replace: true })
    } catch (loginError) {
      setError(loginError?.message || 'Échec de connexion')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="sp-shell" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '32px 16px' }}>
      <div style={{ width: '100%', maxWidth: 420 }}>
        <Link to="/espace-ecoles" className="sp-logo" style={{ marginBottom: 28 }} aria-label="Espace écoles Zelia">
          <img src="/static/images/logo-dark.png" alt="Zelia" />
        </Link>

        <div className="sp-card">
          <p className="sp-kicker">Espace écoles</p>
          <h1 className="sp-title" style={{ fontSize: 24, marginBottom: 6 }}>Connexion école</h1>
          <p className="sp-subtitle" style={{ marginBottom: 18 }}>Accédez aux leads de votre établissement.</p>

          <form onSubmit={handleSubmit}>
            <div className="sp-field" style={{ marginBottom: 12 }}>
              <label htmlFor="login-email">Email</label>
              <input
                id="login-email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="contact@ecole.fr"
                autoComplete="email"
              />
            </div>
            <div className="sp-field" style={{ marginBottom: 14 }}>
              <label htmlFor="login-password">Mot de passe</label>
              <input
                id="login-password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
              />
            </div>

            {error && (
              <div className="sp-card" style={{ borderColor: '#fecaca', background: '#fef2f2', color: '#b91c1c', padding: '10px 14px', marginBottom: 14 }}>
                {error}
              </div>
            )}

            <button type="submit" disabled={loading} className="sp-btn sp-btn-primary" style={{ width: '100%', height: 48 }}>
              {loading ? 'Connexion...' : 'Se connecter'}
            </button>
          </form>
        </div>

        <p className="sp-subtitle" style={{ textAlign: 'center', marginTop: 16 }}>
          Pas encore de compte ? <Link to="/espace-ecoles/inscription" style={{ color: '#000', fontWeight: 700 }}>Créer un compte école</Link>
        </p>
      </div>
    </main>
  )
}
