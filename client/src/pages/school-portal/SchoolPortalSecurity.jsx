import React, { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { schoolPortalSupabase } from '../../lib/schoolPortalSupabase'
import schoolPortalApiClient from '../../lib/schoolPortalApi'
import './SchoolPortal.css'

const auth = schoolPortalSupabase.auth
const check = (result) => { if (result.error) throw result.error; return result.data }

export default function SchoolPortalSecurity({ mode = 'settings' }) {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [ready, setReady] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [factors, setFactors] = useState([])
  const [challenge, setChallenge] = useState(null)
  const [enrollment, setEnrollment] = useState(null)
  const [code, setCode] = useState('')

  async function refreshSecurity() {
    const assurance = check(await auth.mfa.getAuthenticatorAssuranceLevel())
    const result = check(await auth.mfa.listFactors())
    const verified = (result.totp || []).filter((factor) => factor.status === 'verified')
    setFactors(verified)
    if (assurance.nextLevel === 'aal2' && assurance.currentLevel !== 'aal2') setChallenge(verified[0]?.id || null)
    else setChallenge(null)
  }

  useEffect(() => {
    let active = true
    ;(async () => {
      try {
        if (mode === 'forgot') { if (active) setReady(true); return }
        if (mode === 'activation') {
          const url = new URL(window.location.href)
          const fragment = new URLSearchParams(url.hash.slice(1))
          if (url.searchParams.get('error_description') || fragment.get('error_description')) throw new Error(url.searchParams.get('error_description') || fragment.get('error_description'))
          const token = fragment.get('access_token')
          const refreshToken = fragment.get('refresh_token')
          if (token && refreshToken && ['invite', 'recovery'].includes(fragment.get('type'))) check(await auth.setSession({ access_token: token, refresh_token: refreshToken }))
          else if (url.searchParams.get('token_hash') && ['invite', 'recovery'].includes(url.searchParams.get('type'))) {
            check(await auth.verifyOtp({ token_hash: url.searchParams.get('token_hash'), type: url.searchParams.get('type') }))
          } else throw new Error('Lien absent, expiré ou déjà utilisé. Demandez un nouvel email.')
          window.history.replaceState({}, '', url.pathname)
        }
        const session = check(await auth.getSession())
        if (!session.session) { navigate('/espace-ecoles/connexion', { replace: true }); return }
        check(await auth.getUser())
        await refreshSecurity()
        if (active) setReady(true)
      } catch (failure) { if (active) setError(failure.message || 'Impossible de préparer la sécurité du compte.') }
    })()
    return () => { active = false }
  }, [mode, navigate])

  async function perform(action) {
    setBusy(true); setError(''); setMessage('')
    try { await action() } catch (failure) { setError(failure.response?.data?.message || failure.message || 'Opération impossible.') }
    finally { setBusy(false) }
  }
  async function savePassword(event) {
    event.preventDefault()
    if (password.length < 12 || password !== confirmation) { setError('Utilisez au moins 12 caractères et deux mots de passe identiques.'); return }
    await perform(async () => {
      check(await auth.updateUser({ password }))
      check(await auth.signOut({ scope: 'others' }))
      if (mode === 'activation') await schoolPortalApiClient.post('/school-portal/activation-complete')
      setPassword(''); setConfirmation('')
      setMessage('Mot de passe enregistré. Les autres sessions ne pourront plus être renouvelées.')
      if (mode === 'activation') navigate('/espace-ecoles/leads', { replace: true })
    })
  }
  async function verify(event) {
    event.preventDefault()
    if (!/^\d{6}$/.test(code)) { setError('Saisissez le code à six chiffres.'); return }
    await perform(async () => {
      check(await auth.mfa.challengeAndVerify({ factorId: challenge || enrollment.id, code }))
      setEnrollment(null); setCode(''); await refreshSecurity()
      if (params.get('challenge') && mode !== 'activation') navigate('/espace-ecoles/leads', { replace: true })
      else setMessage('Double authentification vérifiée.')
    })
  }
  return <main className="sp-shell"><div className="sp-main"><div className="sp-card" style={{ maxWidth: 640, margin: '0 auto' }}>
    <h1 className="sp-title">{mode === 'forgot' ? 'Mot de passe oublié' : mode === 'activation' ? 'Activer mon accès école' : 'Sécurité de mon compte'}</h1>
    {error && <p role="alert">{error}</p>}{message && <p role="status">{message}</p>}
    {!ready && !error && <p>Vérification de votre session…</p>}
    {ready && mode === 'forgot' && <form onSubmit={(event) => { event.preventDefault(); perform(async () => {
      check(await auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/espace-ecoles/activation` }))
      setMessage('Si un compte correspond à cette adresse, vous recevrez un lien de récupération.')
    }) }}><label className="sp-field">Email professionnel<input type="email" required autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} /></label><button className="sp-btn" disabled={busy}>Envoyer le lien</button></form>}
    {ready && mode !== 'forgot' && <>
      {challenge || enrollment ? <form onSubmit={verify}>
        <h2>Double authentification</h2>
        {enrollment && <><img width={220} height={220} alt="QR code pour votre application d’authentification" src={enrollment.totp.qr_code} /><p>Clé manuelle : <code>{enrollment.totp.secret}</code></p></>}
        <label className="sp-field">Code de l’application<input inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required value={code} onChange={(event) => setCode(event.target.value)} /></label>
        <button className="sp-btn" disabled={busy}>Vérifier le code</button>
        {enrollment && <button type="button" className="sp-btn" disabled={busy} onClick={() => perform(async () => { check(await auth.mfa.unenroll({ factorId: enrollment.id })); setEnrollment(null) })}>Annuler l’activation MFA</button>}
        <p>Facteur perdu ? Contactez l’équipe Zélia pour une vérification d’identité. Un email de récupération ne désactive pas la double authentification.</p>
      </form> : <>
        <form onSubmit={savePassword}><label className="sp-field">Nouveau mot de passe<input type="password" autoComplete="new-password" minLength={12} required value={password} onChange={(event) => setPassword(event.target.value)} /></label>
          <label className="sp-field">Confirmer le mot de passe<input type="password" autoComplete="new-password" minLength={12} required value={confirmation} onChange={(event) => setConfirmation(event.target.value)} /></label>
          <button className="sp-btn" disabled={busy}>Enregistrer mon mot de passe</button>
        </form>
        {mode === 'settings' && <section><h2>Double authentification facultative</h2>
          {factors.map((factor) => <p key={factor.id}>Application activée <button className="sp-btn sp-btn-sm" disabled={busy} onClick={() => perform(async () => { check(await auth.mfa.unenroll({ factorId: factor.id })); await refreshSecurity(); setMessage('Facteur retiré.') })}>Désactiver ce facteur</button></p>)}
          {!factors.length && <button className="sp-btn" disabled={busy} onClick={() => perform(async () => setEnrollment(check(await auth.mfa.enroll({ factorType: 'totp', friendlyName: 'Espace écoles Zélia' }))))}>Activer une application d’authentification</button>}
        </section>}
      </>}
    </>}
    <p><Link to="/espace-ecoles/connexion">Connexion école</Link> · <Link to="/espace-ecoles/mot-de-passe-oublie">Recevoir un nouveau lien</Link> · <Link to="/espace-ecoles/leads">Retour au dashboard</Link></p>
  </div></div></main>
}
