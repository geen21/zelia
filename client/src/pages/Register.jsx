import React, { useMemo, useState } from 'react'
import axios from 'axios'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import {
  buildAuthCallbackUrl,
  buildProfileFromSupabaseUser,
  getOnboardingCache,
  persistAuthSessionAndOnboarding,
  rememberRegistrationConsent,
  rememberAuthAfter
} from '../lib/authFlow'

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

  async function continueWithGoogle() {
    if (!validateRegistrationBasics() || loading) return
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
    <main className="min-h-screen bg-[#fffbf7] text-black flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-md">
        <Link to="/" className="inline-flex mb-8" aria-label="Accueil Zelia">
          <img src="/static/images/logo-dark.png" alt="Zelia" className="h-8 w-auto" />
        </Link>

        <div className="bg-white border border-line rounded-lg shadow-card p-6 sm:p-7">
          <div className="mb-6">
            <p className="text-xs uppercase font-medium text-text-secondary tracking-normal mb-2">Compte Supabase</p>
            <h1 className="text-2xl font-semibold leading-tight mb-2">Créer ton espace</h1>
            <p className="text-sm text-text-secondary">
              Google est le plus rapide. Aucune validation email ne bloque l'accès.
            </p>
          </div>

          {hasOrientationCache && (
            <div className="mb-4 rounded-lg border border-[#c1ff72] bg-[#f8fff0] px-4 py-3 text-sm font-medium">
              Ton parcours est prêt, il sera rattaché à ton compte après connexion.
            </div>
          )}

          <div className="mb-5 space-y-3">
            <label className="block">
              <span className="block text-xs font-medium text-text-secondary mb-1">Département</span>
              <select
                value={departmentCode}
                onChange={(event) => setDepartmentCode(event.target.value)}
                className="w-full h-11 rounded-lg border border-line px-3 outline-none bg-white focus:border-black"
                required
              >
                <option value="">Choisir mon département</option>
                {DEPARTMENTS.map(([code, name]) => (
                  <option key={code} value={code}>{code} - {name}</option>
                ))}
              </select>
            </label>

            <div className="space-y-2 rounded-lg bg-[#fffbf7] border border-line p-3 text-xs text-text-secondary">
              <button
                type="button"
                onClick={acceptAll}
                className="h-8 px-3 rounded-lg border border-gray-200 bg-white text-black text-xs font-semibold hover:border-black"
              >
                Tout valider
              </button>
              <label className="flex items-start gap-2 cursor-pointer leading-snug">
                <input type="checkbox" checked={acceptTerms} onChange={(event) => setAcceptTerms(event.target.checked)} className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-[#c1ff72]" />
                <span>J'accepte les <Link to="/legal/conditions" className="text-black underline">CGU</Link> et la politique de confidentialité.</span>
              </label>
              <label className="flex items-start gap-2 cursor-pointer leading-snug">
                <input type="checkbox" checked={newsletterOptIn} onChange={(event) => setNewsletterOptIn(event.target.checked)} className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-[#c1ff72]" />
                <span>Recevoir les nouveautés Zélia.</span>
              </label>
              <label className="flex items-start gap-2 cursor-pointer leading-snug">
                <input type="checkbox" checked={acceptDataTransfer} onChange={(event) => setAcceptDataTransfer(event.target.checked)} className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-[#c1ff72]" />
                <span>Autoriser le contact par des écoles partenaires.</span>
              </label>
            </div>
          </div>

          {error && <div className="mb-4 rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

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

          <form onSubmit={handleEmailRegister} className="space-y-3">
            <label className="block">
              <span className="block text-xs font-medium text-text-secondary mb-1">Email</span>
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="toi@email.com"
                className="w-full h-11 rounded-lg border border-line px-3 outline-none focus:border-black"
                autoComplete="email"
              />
            </label>
            <label className="block">
              <span className="block text-xs font-medium text-text-secondary mb-1">Mot de passe</span>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="6 caractères minimum"
                className="w-full h-11 rounded-lg border border-line px-3 outline-none focus:border-black"
                autoComplete="new-password"
              />
            </label>

            <button
              type="submit"
              disabled={Boolean(loading)}
              className="w-full h-12 rounded-lg bg-black text-white font-semibold disabled:opacity-60"
            >
              {loading === 'email' ? 'Création...' : 'Créer avec email'}
            </button>
          </form>
        </div>

        <p className="mt-4 text-center text-sm text-text-secondary">
          Déjà un compte ? <Link to={`/login${after ? `?after=${after}` : ''}`} className="text-black font-medium underline">Se connecter</Link>
        </p>
      </div>
    </main>
  )
}
