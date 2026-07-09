import React, { useMemo, useState } from 'react'
import axios from 'axios'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import {
  buildProfileFromSupabaseUser,
  getOnboardingCache,
  persistAuthSessionAndOnboarding,
  rememberRegistrationConsent
} from '../lib/authFlow'
import './OrientationFlow.css'

const DEPARTMENTS = [
  ['01', 'Ain'], ['02', 'Aisne'], ['03', 'Allier'], ['04', 'Alpes-de-Haute-Provence'], ['05', 'Hautes-Alpes'], ['06', 'Alpes-Maritimes'],
  ['07', 'Ardèche'], ['08', 'Ardennes'], ['09', 'Ariège'], ['10', 'Aube'], ['11', 'Aude'], ['12', 'Aveyron'], ['13', 'Bouches-du-Rhône'],
  ['14', 'Calvados'], ['15', 'Cantal'], ['16', 'Charente'], ['17', 'Charente-Maritime'], ['18', 'Cher'], ['19', 'Corrèze'], ['2A', 'Corse-du-Sud'],
  ['2B', 'Haute-Corse'], ['21', 'Côte-d’Or'], ['22', 'Côtes-d’Armor'], ['23', 'Creuse'], ['24', 'Dordogne'], ['25', 'Doubs'], ['26', 'Drôme'],
  ['27', 'Eure'], ['28', 'Eure-et-Loir'], ['29', 'Finistère'], ['30', 'Gard'], ['31', 'Haute-Garonne'], ['32', 'Gers'], ['33', 'Gironde'],
  ['34', 'Hérault'], ['35', 'Ille-et-Vilaine'], ['36', 'Indre'], ['37', 'Indre-et-Loire'], ['38', 'Isère'], ['39', 'Jura'], ['40', 'Landes'],
  ['41', 'Loir-et-Cher'], ['42', 'Loire'], ['43', 'Haute-Loire'], ['44', 'Loire-Atlantique'], ['45', 'Loiret'], ['46', 'Lot'], ['47', 'Lot-et-Garonne'],
  ['48', 'Lozère'], ['49', 'Maine-et-Loire'], ['50', 'Manche'], ['51', 'Marne'], ['52', 'Haute-Marne'], ['53', 'Mayenne'], ['54', 'Meurthe-et-Moselle'],
  ['55', 'Meuse'], ['56', 'Morbihan'], ['57', 'Moselle'], ['58', 'Nièvre'], ['59', 'Nord'], ['60', 'Oise'], ['61', 'Orne'],
  ['62', 'Pas-de-Calais'], ['63', 'Puy-de-Dôme'], ['64', 'Pyrénées-Atlantiques'], ['65', 'Hautes-Pyrénées'], ['66', 'Pyrénées-Orientales'],
  ['67', 'Bas-Rhin'], ['68', 'Haut-Rhin'], ['69', 'Rhône'], ['70', 'Haute-Saône'], ['71', 'Saône-et-Loire'], ['72', 'Sarthe'], ['73', 'Savoie'],
  ['74', 'Haute-Savoie'], ['75', 'Paris'], ['76', 'Seine-Maritime'], ['77', 'Seine-et-Marne'], ['78', 'Yvelines'], ['79', 'Deux-Sèvres'], ['80', 'Somme'],
  ['81', 'Tarn'], ['82', 'Tarn-et-Garonne'], ['83', 'Var'], ['84', 'Vaucluse'], ['85', 'Vendée'], ['86', 'Vienne'], ['87', 'Haute-Vienne'],
  ['88', 'Vosges'], ['89', 'Yonne'], ['90', 'Territoire de Belfort'], ['91', 'Essonne'], ['92', 'Hauts-de-Seine'], ['93', 'Seine-Saint-Denis'],
  ['94', 'Val-de-Marne'], ['95', 'Val-d’Oise'], ['971', 'Guadeloupe'], ['972', 'Martinique'], ['973', 'Guyane'], ['974', 'La Réunion'], ['976', 'Mayotte']
]

export default function Register() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [departmentCode, setDepartmentCode] = useState(() => {
    try { return JSON.parse(localStorage.getItem('registration_department') || '{}')?.code || '' } catch { return '' }
  })
  const [acceptTerms, setAcceptTerms] = useState(false)
  const [newsletterOptIn, setNewsletterOptIn] = useState(false)
  const [acceptDataTransfer, setAcceptDataTransfer] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState('')
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const after = useMemo(() => params.get('after') || '', [params])
  const cache = useMemo(() => getOnboardingCache(), [])
  const selectedDepartment = useMemo(() => {
    const match = DEPARTMENTS.find(([code]) => code === departmentCode)
    return match ? { code: match[0], name: match[1] } : { code: '', name: '' }
  }, [departmentCode])
  const hasOrientationCache = cache.answers.length > 0 || Boolean(cache.avatarData)

  function persistDepartment() {
    if (selectedDepartment.code) {
      localStorage.setItem('registration_department', JSON.stringify(selectedDepartment))
    }
  }

  function persistRegistrationBasics() {
    persistDepartment()
    rememberRegistrationConsent({
      accept_terms: acceptTerms,
      newsletter_opt_in: newsletterOptIn,
      accept_data_transfer: acceptDataTransfer,
      terms_accepted_at: new Date().toISOString()
    })
  }

  function validateRegistrationBasics() {
    if (!selectedDepartment.code) {
      setError('Sélectionne ton département pour continuer.')
      return false
    }
    if (!acceptTerms) {
      setError('Tu dois accepter les CGU pour continuer.')
      return false
    }
    persistRegistrationBasics()
    return true
  }

  function acceptAll() {
    setAcceptTerms(true)
    setNewsletterOptIn(true)
    setAcceptDataTransfer(true)
    setError('')
  }

  async function handleEmailRegister(event) {
    event.preventDefault()
    if (!validateRegistrationBasics() || loading) return
    if (!email || !password) {
      setError('Email et mot de passe sont requis.')
      return
    }
    if (password.length < 6) {
      setError('Le mot de passe doit contenir au moins 6 caractères.')
      return
    }

    setError('')
    setLoading('email')

    try {
      const onboardingCache = getOnboardingCache()
      const userData = {
        profile_type: 'student',
        department: selectedDepartment.code,
        department_name: selectedDepartment.name,
        newsletter_opt_in: newsletterOptIn,
        accept_data_transfer: acceptDataTransfer,
        accept_terms: acceptTerms,
        termsAcceptedAt: new Date().toISOString()
      }

      await axios.post('/api/auth/register', {
        email,
        password,
        userData,
        avatarData: onboardingCache.avatarData,
        questionnaireResponses: onboardingCache.answers,
        acceptTerms,
        newsletterOptIn,
        acceptDataTransfer
      })

      const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({ email, password })
      if (signInError) throw signInError

      const target = await persistAuthSessionAndOnboarding({
        after,
        profileData: buildProfileFromSupabaseUser(signInData.user, {
          contact_preference: acceptDataTransfer,
          department: selectedDepartment.code,
          institution_data: {
            profile_type: 'student',
            department_name: selectedDepartment.name,
            newsletter_opt_in: newsletterOptIn,
            accept_terms: acceptTerms,
            accept_data_transfer: acceptDataTransfer,
            terms_accepted_at: userData.termsAcceptedAt
          }
        }),
        submitAnswers: false
      })
      navigate(target, { replace: true })
    } catch (registerError) {
      const message = registerError?.response?.data?.error || registerError?.message || "Échec de l'inscription"
      setError(message)
    } finally {
      setLoading('')
    }
  }

  return (
    <main className="orientation-flow">
      <header className="orientation-topbar">
        <div className="topbar-row">
          <div className="topbar-lead">
            <Link to="/" className="back-button" aria-label="Accueil Zelia" title="Accueil Zelia">
              <i className="ph ph-arrow-left" aria-hidden="true" />
            </Link>
            <img src="/static/images/logo-dark.png" alt="Zélia" />
          </div>
          <span className="flow-step-label">Inscription</span>
        </div>
      </header>

      <div className="orientation-stage compact identity-stage">
        <form className="orientation-card identity-card" onSubmit={handleEmailRegister}>
          <span className="orientation-pill">Inscription</span>
          <h1>Créer ton espace</h1>
          <p>Ton parcours sera rattaché à ce compte.</p>

          {hasOrientationCache && (
            <p className="identity-banner">Ton parcours est prêt, il sera rattaché à ton compte après connexion.</p>
          )}

          <div className="identity-form-grid">
            <label>
              <span>Département</span>
              <select
                value={departmentCode}
                onChange={(event) => setDepartmentCode(event.target.value)}
                required
              >
                <option value="">Choisir mon département</option>
                {DEPARTMENTS.map(([code, name]) => (
                  <option key={code} value={code}>{code} - {name}</option>
                ))}
              </select>
            </label>
            <label>
              <span>Email</span>
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="toi@email.com"
                autoComplete="email"
              />
            </label>
            <label>
              <span>Mot de passe</span>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="6 caractères minimum"
                autoComplete="new-password"
              />
            </label>
          </div>

          <div className="identity-consent">
            <button type="button" onClick={acceptAll} className="identity-consent-all">
              Tout valider
            </button>
            <label className="identity-consent-row">
              <input type="checkbox" checked={acceptTerms} onChange={(event) => setAcceptTerms(event.target.checked)} />
              <span>J'accepte les <Link to="/legal/conditions">CGU</Link> et la politique de confidentialité.</span>
            </label>
            <label className="identity-consent-row">
              <input type="checkbox" checked={newsletterOptIn} onChange={(event) => setNewsletterOptIn(event.target.checked)} />
              <span>Recevoir les nouveautés Zélia.</span>
            </label>
            <label className="identity-consent-row">
              <input type="checkbox" checked={acceptDataTransfer} onChange={(event) => setAcceptDataTransfer(event.target.checked)} />
              <span>Autoriser le contact par des écoles partenaires.</span>
            </label>
          </div>

          {error && <p className="identity-error" role="alert">{error}</p>}

          <button className="primary-action identity-submit" type="submit" disabled={Boolean(loading)}>
            {loading === 'email' ? 'Création...' : 'Créer avec email'}
          </button>
        </form>

        <p className="identity-switch">
          Déjà un compte ? <Link to={`/login${after ? `?after=${after}` : ''}`}>Se connecter</Link>
        </p>
      </div>
    </main>
  )
}
