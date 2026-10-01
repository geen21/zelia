import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Helmet } from 'react-helmet-async'
import { PiEye, PiEyeSlash, PiArrowRight } from 'react-icons/pi'
import { adminSupabase } from '../../lib/adminSupabase'
import { adminApi, adminError } from '../../lib/adminApi'
import './Admin.css'

export default function AdminLogin() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [visible, setVisible] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    if (window.__zeliaPublicTrackingLoaded) window.location.replace(window.location.href)
  }, [])
  const submit = async (event) => {
    event.preventDefault()
    setBusy(true); setError('')
    try {
      const { error: authError } = await adminSupabase.auth.signInWithPassword({ email: email.trim(), password })
      if (authError) throw authError
      await adminApi.get('/me')
      setPassword('')
      navigate('/admin', { replace: true })
    } catch (failure) {
      setError(adminError(failure))
      await adminSupabase.auth.signOut({ scope: 'local' }).catch(() => {})
    } finally { setBusy(false) }
  }
  if (window.__zeliaPublicTrackingLoaded) return <div role="status">Chargement…</div>
  return <div className="bo-app bo-login"><Helmet><title>Connexion administration | Zélia</title><meta name="robots" content="noindex, nofollow" /></Helmet>
    <section className="bo-login-panel"><img src="/assets/images/logo-dark.png" alt="Zélia" /><span className="bo-eyebrow">Administration</span><h1>Connexion</h1>
      <form onSubmit={submit}><label>Adresse email<input type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
        <label>Mot de passe<span className="bo-password"><input type={visible ? 'text' : 'password'} autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required /><button type="button" className="bo-icon" title={visible ? 'Masquer le mot de passe' : 'Afficher le mot de passe'} aria-label={visible ? 'Masquer le mot de passe' : 'Afficher le mot de passe'} onClick={() => setVisible(!visible)}>{visible ? <PiEyeSlash /> : <PiEye />}</button></span></label>
        {error && <p className="bo-error" role="alert">{error}</p>}<button className="bo-button bo-primary" disabled={busy} type="submit">{busy ? 'Connexion…' : 'Se connecter'}<PiArrowRight aria-hidden="true" /></button>
      </form>
    </section>
  </div>
}