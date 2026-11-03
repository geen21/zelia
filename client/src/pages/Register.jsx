import React, { useMemo, useState } from 'react'
import axios from 'axios'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { PiArrowLeft } from 'react-icons/pi'
import { supabase } from '../lib/supabase'
import {
  buildProfileFromSupabaseUser,
  getOnboardingCache,
  persistAuthSessionAndOnboarding,
  rememberRegistrationConsent
} from '../lib/authFlow'
import './OrientationFlow.css'
import { SCHOOL_SHARING_VERSION } from '../lib/schoolSharing'
import { DEPARTMENTS } from '../lib/departments.js'

const GENDER_OPTIONS = ['Femme', 'Homme', 'Non-binaire', 'Autre', 'Préfère ne pas répondre']
const ORIENTATION_PROFILE_IDENTITY_KEY = 'orientation_profile_identity'
const ORIENTATION_PROFILE_IDENTITY_COMPLETE_KEY = 'orientation_profile_identity_complete'

function getStoredOrientationIdentity() {
  try {
    const stored = JSON.parse(localStorage.getItem(ORIENTATION_PROFILE_IDENTITY_KEY) || '{}')
    return {
      firstName: String(stored.firstName || stored.first_name || '').trim(),
      lastName: String(stored.lastName || stored.last_name || '').trim(),
      gender: String(stored.gender || '').trim()
    }
  } catch {
    return { firstName: '', lastName: '', gender: '' }
  }
}

export default function Register() {
  const [email, setEmail] = useState(() => localStorage.getItem('pending_registration_email') || '')
  const [password, setPassword] = useState('')
  const [identity, setIdentity] = useState(() => getStoredOrientationIdentity())
  const [departmentCode, setDepartmentCode] = useState(() => {
    try { return JSON.parse(localStorage.getItem('registration_department') || '{}')?.code || '' } catch { return '' }
  })
  const [acceptTerms, setAcceptTerms] = useState(false)
  const [newsletterOptIn, setNewsletterOptIn] = useState(false)
  const acceptDataTransfer = acceptTerms
  const [createdAccountEmail, setCreatedAccountEmail] = useState(() => localStorage.getItem('pending_registration_email') || '')
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
      sharing_version: SCHOOL_SHARING_VERSION,
      terms_accepted_at: new Date().toISOString()
    })
  }

  function normalizedIdentity() {
    return {
      firstName: String(identity.firstName || '').trim(),
      lastName: String(identity.lastName || '').trim(),
      gender: String(identity.gender || '').trim()
    }
  }

  function validateRegistrationBasics() {
    const completeIdentity = normalizedIdentity()
    if (!completeIdentity.firstName || !completeIdentity.lastName || !completeIdentity.gender) {
      setError('Indique ton prénom, ton nom et ton genre pour continuer.')
      return null
    }
    if (!selectedDepartment.code) {
      setError('Sélectionne ton département pour continuer.')
      return null
    }
    if (!acceptTerms) {
      setError('Accepte les conditions du service et le partage avec les écoles que tu sollicites pour continuer.')
      return null
    }
    persistRegistrationBasics()
    return completeIdentity
  }

  async function handleEmailRegister(event) {
    event.preventDefault()
    if (loading) return
    const completeIdentity = validateRegistrationBasics()
    if (!completeIdentity) return
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
        first_name: completeIdentity.firstName,
        last_name: completeIdentity.lastName,
        gender: completeIdentity.gender,
        department: selectedDepartment.code,
        department_name: selectedDepartment.name,
        newsletter_opt_in: newsletterOptIn,
        accept_data_transfer: acceptDataTransfer,
        accept_terms: acceptTerms,
        termsAcceptedAt: new Date().toISOString()
      }

      if (createdAccountEmail !== email.trim().toLowerCase()) {
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
        const registeredEmail = email.trim().toLowerCase()
        localStorage.setItem('pending_registration_email', registeredEmail)
        setCreatedAccountEmail(registeredEmail)
      }

      const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({ email, password })
      if (signInError) throw signInError

      const target = await persistAuthSessionAndOnboarding({
        after,
        profileData: buildProfileFromSupabaseUser(signInData.user, {
          first_name: completeIdentity.firstName,
          last_name: completeIdentity.lastName,
          gender: completeIdentity.gender,
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
      if (after === 'orientation-analysis' || hasOrientationCache) {
        localStorage.setItem(ORIENTATION_PROFILE_IDENTITY_KEY, JSON.stringify(completeIdentity))
        localStorage.setItem(ORIENTATION_PROFILE_IDENTITY_COMPLETE_KEY, 'true')
      }
      localStorage.removeItem('pending_registration_email')
      navigate(target, { replace: true })
    } catch (registerError) {
      const message = registerError?.response?.data?.error || registerError?.message || "Échec de l'inscription"
      const accountCreated = localStorage.getItem('pending_registration_email') === email.trim().toLowerCase()
      setError(accountCreated ? `Ton compte est créé, mais l'enregistrement n'est pas terminé : ${message} Tu peux réessayer sans recréer ton compte.` : message)
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
              <PiArrowLeft aria-hidden="true" />
            </Link>
            <img src="/static/images/logo-dark.png" alt="Zélia" />
          </div>
          <span className="flow-step-label">Inscription</span>
        </div>
      </header>

      <div className="orientation-stage compact identity-stage">
        <form className="orientation-card identity-card" onSubmit={handleEmailRegister}>
          <h1>{hasOrientationCache ? 'Découvre ton profil complet' : 'Créer ton espace'}</h1>

          <div className="identity-form-grid">
            <label>
              <span>Prénom</span>
              <input
                type="text"
                value={identity.firstName}
                onChange={(event) => setIdentity((current) => ({ ...current, firstName: event.target.value }))}
                autoComplete="given-name"
                required
              />
            </label>
            <label>
              <span>Nom</span>
              <input
                type="text"
                value={identity.lastName}
                onChange={(event) => setIdentity((current) => ({ ...current, lastName: event.target.value }))}
                autoComplete="family-name"
                required
              />
            </label>
            <label>
              <span id="registration-gender-label">Genre</span>
              <select
                aria-labelledby="registration-gender-label"
                value={identity.gender}
                onChange={(event) => setIdentity((current) => ({ ...current, gender: event.target.value }))}
                required
              >
                <option value="">Choisir</option>
                {GENDER_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
              </select>
            </label>
            <label>
              <span id="registration-department-label">Département</span>
              <select
                aria-labelledby="registration-department-label"
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
                required
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
                minLength={6}
                required
              />
            </label>
          </div>

          <div className="identity-consent">
            <label className="identity-consent-row">
              <input type="checkbox" required checked={acceptTerms} onChange={(event) => setAcceptTerms(event.target.checked)} />
              <span>
                J'accepte les <Link to="/legal/conditions">conditions du service et la politique de confidentialité</Link> (obligatoire).
                <small>J'autorise les écoles que je sollicite à recevoir mes coordonnées, mon profil scolaire, mes réponses au questionnaire et mon bilan d’orientation pour me recontacter. Je peux retirer cet accord depuis mon profil.</small>
              </span>
            </label>
            <label className="identity-consent-row">
              <input type="checkbox" checked={newsletterOptIn} onChange={(event) => setNewsletterOptIn(event.target.checked)} />
              <span>Je souhaite recevoir les nouveautés Zélia par email (facultatif).</span>
            </label>
          </div>

          {error && <p className="identity-error" role="alert">{error}</p>}

          <button className="primary-action identity-submit" type="submit" disabled={Boolean(loading)}>
            {loading === 'email' ? 'Enregistrement…' : createdAccountEmail && createdAccountEmail === email.trim().toLowerCase() ? 'Réessayer et continuer' : hasOrientationCache ? 'Voir mon profil complet' : 'Créer avec email'}
          </button>
        </form>

        <p className="identity-switch">
          Déjà un compte ? <Link to={`/login${after ? `?after=${after}` : ''}`}>Se connecter</Link>
        </p>
      </div>
    </main>
  )
}
