import React, { useMemo, useState } from 'react'
import axios from 'axios'
import { Link, useNavigate } from 'react-router-dom'

export default function Register() {
  const [step, setStep] = useState(1)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [nom, setNom] = useState('')
  const [prenom, setPrenom] = useState('')
  const [age, setAge] = useState('18')
  const [genre, setGenre] = useState('')
  const [departement, setDepartement] = useState('')
  const [ecole, setEcole] = useState('')
  const [numeroTelephone, setNumeroTelephone] = useState('')

  const [error, setError] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [acceptTerms, setAcceptTerms] = useState(false)
  const [newsletterOptIn, setNewsletterOptIn] = useState(false)
  const [emailSent, setEmailSent] = useState(false)
  const navigate = useNavigate()

  const departements = useMemo(() => [
    { code: '01', name: 'Ain' }, { code: '02', name: 'Aisne' }, { code: '03', name: 'Allier' },
    { code: '04', name: 'Alpes-de-Haute-Provence' }, { code: '05', name: 'Hautes-Alpes' }, { code: '06', name: 'Alpes-Maritimes' },
    { code: '07', name: 'Ardèche' }, { code: '08', name: 'Ardennes' }, { code: '09', name: 'Ariège' },
    { code: '10', name: 'Aube' }, { code: '11', name: 'Aude' }, { code: '12', name: 'Aveyron' },
    { code: '13', name: 'Bouches-du-Rhône' }, { code: '14', name: 'Calvados' }, { code: '15', name: 'Cantal' },
    { code: '16', name: 'Charente' }, { code: '17', name: 'Charente-Maritime' }, { code: '18', name: 'Cher' },
    { code: '19', name: 'Corrèze' }, { code: '2A', name: 'Corse-du-Sud' }, { code: '2B', name: 'Haute-Corse' },
    { code: '21', name: 'Côte-d’Or' }, { code: '22', name: 'Côtes-d’Armor' }, { code: '23', name: 'Creuse' },
    { code: '24', name: 'Dordogne' }, { code: '25', name: 'Doubs' }, { code: '26', name: 'Drôme' },
    { code: '27', name: 'Eure' }, { code: '28', name: 'Eure-et-Loir' }, { code: '29', name: 'Finistère' },
    { code: '30', name: 'Gard' }, { code: '31', name: 'Haute-Garonne' }, { code: '32', name: 'Gers' },
    { code: '33', name: 'Gironde' }, { code: '34', name: 'Hérault' }, { code: '35', name: 'Ille-et-Vilaine' },
    { code: '36', name: 'Indre' }, { code: '37', name: 'Indre-et-Loire' }, { code: '38', name: 'Isère' },
    { code: '39', name: 'Jura' }, { code: '40', name: 'Landes' }, { code: '41', name: 'Loir-et-Cher' },
    { code: '42', name: 'Loire' }, { code: '43', name: 'Haute-Loire' }, { code: '44', name: 'Loire-Atlantique' },
    { code: '45', name: 'Loiret' }, { code: '46', name: 'Lot' }, { code: '47', name: 'Lot-et-Garonne' },
    { code: '48', name: 'Lozère' }, { code: '49', name: 'Maine-et-Loire' }, { code: '50', name: 'Manche' },
    { code: '51', name: 'Marne' }, { code: '52', name: 'Haute-Marne' }, { code: '53', name: 'Mayenne' },
    { code: '54', name: 'Meurthe-et-Moselle' }, { code: '55', name: 'Meuse' }, { code: '56', name: 'Morbihan' },
    { code: '57', name: 'Moselle' }, { code: '58', name: 'Nièvre' }, { code: '59', name: 'Nord' },
    { code: '60', name: 'Oise' }, { code: '61', name: 'Orne' }, { code: '62', name: 'Pas-de-Calais' },
    { code: '63', name: 'Puy-de-Dôme' }, { code: '64', name: 'Pyrénées-Atlantiques' }, { code: '65', name: 'Hautes-Pyrénées' },
    { code: '66', name: 'Pyrénées-Orientales' }, { code: '67', name: 'Bas-Rhin' }, { code: '68', name: 'Haut-Rhin' },
    { code: '69', name: 'Rhône' }, { code: '70', name: 'Haute-Saône' }, { code: '71', name: 'Saône-et-Loire' },
    { code: '72', name: 'Sarthe' }, { code: '73', name: 'Savoie' }, { code: '74', name: 'Haute-Savoie' },
    { code: '75', name: 'Paris' }, { code: '76', name: 'Seine-Maritime' }, { code: '77', name: 'Seine-et-Marne' },
    { code: '78', name: 'Yvelines' }, { code: '79', name: 'Deux-Sèvres' }, { code: '80', name: 'Somme' },
    { code: '81', name: 'Tarn' }, { code: '82', name: 'Tarn-et-Garonne' }, { code: '83', name: 'Var' },
    { code: '84', name: 'Vaucluse' }, { code: '85', name: 'Vendée' }, { code: '86', name: 'Vienne' },
    { code: '87', name: 'Haute-Vienne' }, { code: '88', name: 'Vosges' }, { code: '89', name: 'Yonne' },
    { code: '90', name: 'Territoire de Belfort' }, { code: '91', name: 'Essonne' }, { code: '92', name: 'Hauts-de-Seine' },
    { code: '93', name: 'Seine-Saint-Denis' }, { code: '94', name: 'Val-de-Marne' }, { code: '95', name: 'Val-d’Oise' },
    { code: '971', name: 'Guadeloupe' }, { code: '972', name: 'Martinique' }, { code: '973', name: 'Guyane' },
    { code: '974', name: 'La Réunion' }, { code: '976', name: 'Mayotte' }
  ], [])

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    try {
      if (password !== confirmPassword) {
        setError('Les mots de passe ne correspondent pas')
        return
      }

      if (!acceptTerms) {
        setError('Vous devez accepter les CGV et CGU pour continuer')
        return
      }
      
      // Get cached avatar and questionnaire data
      const avatarCfg = localStorage.getItem('avatar_cfg')
      const avatarUrl = localStorage.getItem('avatar_url') 
      const questionnaireCache = localStorage.getItem('answers_cache')
      
      let avatarData = null
      let questionnaireResponses = null
      
      if (avatarCfg && avatarUrl) {
        try {
          const cfg = JSON.parse(avatarCfg)
          avatarData = { ...cfg, url: avatarUrl, provider: 'dicebear/lorelei' }
        } catch (e) {
          console.warn('Failed to parse avatar config:', e)
        }
      }
      
      if (questionnaireCache) {
        try {
          const cached = JSON.parse(questionnaireCache)
          questionnaireResponses = cached.answers || cached.responses || []
        } catch (e) {
          console.warn('Failed to parse questionnaire cache:', e)
        }
      }

      // Prepare user data (student only)
      const userData = {
        profile_type: 'student',
        nom, prenom, age: Number(age), genre, departement, ecole, numeroTelephone,
        // Also include English names for compatibility
        first_name: prenom, last_name: nom, gender: genre,
        department: departement, school: ecole, phone_number: numeroTelephone,
        newsletter_opt_in: newsletterOptIn,
        newsletterOptIn,
        accept_terms: acceptTerms,
        termsAcceptedAt: new Date().toISOString()
      }

      // Use custom API endpoint that can handle avatar and questionnaire data properly
      const response = await axios.post('/api/auth/register', {
        email,
        password,
        userData,
        avatarData,
        questionnaireResponses,
        acceptTerms,
        newsletterOptIn
      })

      // Show email confirmation message
      setEmailSent(true)

      // Clean up local storage if registration was successful
      if (avatarData) {
        localStorage.removeItem('avatar_cfg')
        localStorage.removeItem('avatar_url')
      }
      if (questionnaireResponses) {
        localStorage.removeItem('answers_cache')
        localStorage.removeItem('answers_progress')
      }

      // Note: We don't navigate automatically anymore, we wait for email confirmation

    } catch (err) {
      const msg = err?.response?.data?.error || err?.message || err?.error_description || "Échec d'inscription"
      setError(msg)
    }
  }

  function nextStep() {
    if (step === 1) {
      if (!prenom || !nom || !age || !genre) {
        setError('Veuillez remplir tous les champs obligatoires')
        return
      }
    } else if (step === 2) {
      if (!departement) {
        setError('Veuillez sélectionner votre département')
        return
      }
    } else if (step === 3) {
      if (!email || !password || !confirmPassword) {
        setError('Veuillez remplir tous les champs obligatoires')
        return
      }
      if (password !== confirmPassword) {
        setError('Les mots de passe ne correspondent pas')
        return
      }
    }
    setError('')
    setStep(s => s + 1)
  }

  function prevStep() {
    setError('')
    setStep(s => s - 1)
  }

  // Clear error when acceptTerms changes
  function handleAcceptTermsChange(checked) {
    setAcceptTerms(checked)
    if (error === 'Vous devez accepter les CGV et CGU pour continuer' && checked) {
      setError('')
    }
  }

  return (
    <div className="fixed inset-0 bg-white text-text-primary flex flex-col items-center justify-center px-4 overflow-hidden">
      <div className="w-full max-w-lg py-4 h-full flex flex-col justify-center overflow-y-auto">
        {emailSent ? (
          // Email confirmation message
          <div className="text-center">
            <div className="mb-6">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 7.89a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </div>
              <h1 className="text-2xl font-bold mb-2">Email de confirmation envoyé !</h1>
              <p className="text-text-secondary mb-4">
                Nous avons envoyé un email de confirmation à <strong>{email}</strong>
              </p>
              <p className="text-text-secondary">
                Veuillez cliquer sur le lien dans l'email pour valider votre compte et accéder à votre tableau de bord.
              </p>
            </div>
            <div className="bg-surface border border-line rounded-xl shadow-card p-6">
              <div className="flex items-center justify-center mb-4">
                <svg className="w-6 h-6 text-blue-600 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="text-sm font-medium">Vérifiez votre boîte de réception</span>
              </div>
              <p className="text-sm text-text-secondary">
                L'email peut prendre quelques minutes à arriver. Pensez à vérifier votre dossier spam si vous ne le recevez pas.
              </p>
            </div>
          </div>
        ) : (
          // Registration form
          <>
            <div className="mb-4 shrink-0">
              <h1 className="text-xl md:text-2xl font-bold">Créer un compte</h1>
              <p className="text-sm text-text-secondary">Étape {step} sur 4</p>
              <div className="w-full bg-gray-100 h-1.5 rounded-full mt-2 overflow-hidden">
                <div className="bg-black h-full transition-all duration-300" style={{width: `${step * 25}%`}}></div>
              </div>
            </div>
            
            <form onSubmit={handleSubmit} className="bg-surface border border-line rounded-xl shadow-card p-4 md:p-6 shrink-0">
              {step === 1 && (
                <div className="space-y-3">
                  <h2 className="font-semibold text-lg mb-2">Qui es-tu ?</h2>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-text-secondary mb-1">Prénom *</label>
                      <input className="w-full border border-line rounded-lg h-10 px-3 outline-none text-sm focus:border-black transition-colors" type="text" placeholder="Prénom" value={prenom} onChange={e=>setPrenom(e.target.value)} />
                    </div>
                    <div>
                      <label className="block text-xs text-text-secondary mb-1">Nom *</label>
                      <input className="w-full border border-line rounded-lg h-10 px-3 outline-none text-sm focus:border-black transition-colors" type="text" placeholder="Nom" value={nom} onChange={e=>setNom(e.target.value)} />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs text-text-secondary mb-1">Âge *</label>
                    <input className="w-full border border-line rounded-lg h-10 px-3 outline-none text-sm focus:border-black transition-colors" type="number" min="10" max="100" placeholder="18" value={age} onChange={e=>setAge(e.target.value)} />
                  </div>
                  <div>
                    <label className="block text-xs text-text-secondary mb-1">Genre *</label>
                    <select className="w-full border border-line rounded-lg h-10 px-3 outline-none text-sm bg-white focus:border-black transition-colors" value={genre} onChange={e=>setGenre(e.target.value)}>
                      <option value="">Sélectionner</option>
                      <option value="Homme">Homme</option>
                      <option value="Femme">Femme</option>
                      <option value="Autre">Autre</option>
                    </select>
                  </div>
                </div>
              )}

              {step === 2 && (
                <div className="space-y-3">
                  <h2 className="font-semibold text-lg mb-2">Ta situation</h2>
                  <div>
                    <label className="block text-xs text-text-secondary mb-1">Département *</label>
                    <select className="w-full border border-line rounded-lg h-10 px-3 outline-none text-sm bg-white focus:border-black transition-colors" value={departement} onChange={e=>setDepartement(e.target.value)}>
                      <option value="">Sélectionner</option>
                      {departements.map(d => <option key={d.code} value={`${d.code} - ${d.name}`}>{d.code} - {d.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-text-secondary mb-1">École/Formation</label>
                    <input className="w-full border border-line rounded-lg h-10 px-3 outline-none text-sm focus:border-black transition-colors" type="text" placeholder="Nom de ton école..." value={ecole} onChange={e=>setEcole(e.target.value)} />
                  </div>
                  <div>
                    <label className="block text-xs text-text-secondary mb-1">Téléphone (optionnel)</label>
                    <input className="w-full border border-line rounded-lg h-10 px-3 outline-none text-sm focus:border-black transition-colors" type="tel" placeholder="06 12 34 56 78" value={numeroTelephone} onChange={e=>setNumeroTelephone(e.target.value)} />
                  </div>
                </div>
              )}

              {step === 3 && (
                <div className="space-y-3">
                  <h2 className="font-semibold text-lg mb-2">Sécuriser ton compte</h2>
                  <div>
                    <label className="block text-xs text-text-secondary mb-1">Email *</label>
                    <input className="w-full border border-line rounded-lg h-10 px-3 outline-none text-sm focus:border-black transition-colors" type="email" placeholder="ton@email.com" value={email} onChange={e=>setEmail(e.target.value)} />
                    <p className="mt-1 text-xs text-text-secondary">Cet email devra être confirmé par la suite.</p>
                  </div>
                  <div>
                    <label className="block text-xs text-text-secondary mb-1">Mot de passe *</label>
                    <input className="w-full border border-line rounded-lg h-10 px-3 outline-none text-sm focus:border-black transition-colors" type="password" placeholder="••••••••" value={password} onChange={e=>setPassword(e.target.value)} />
                  </div>
                  <div>
                    <label className="block text-xs text-text-secondary mb-1">Confirmer *</label>
                    <input className="w-full border border-line rounded-lg h-10 px-3 outline-none text-sm focus:border-black transition-colors" type="password" placeholder="••••••••" value={confirmPassword} onChange={e=>setConfirmPassword(e.target.value)} />
                  </div>
                </div>
              )}

              {step === 4 && (
                <div className="space-y-4">
                  <h2 className="font-semibold text-lg mb-2">Dernière étape</h2>
                  <div className="bg-gray-50 p-4 rounded-lg text-sm space-y-3">
                    <label className="flex items-start gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        className="mt-1 h-4 w-4 rounded border-gray-300 text-black focus:ring-black"
                        checked={acceptTerms}
                        onChange={(e) => handleAcceptTermsChange(e.target.checked)}
                      />
                      <span className="text-text-secondary text-xs">
                        J'accepte les <Link to="/legal/conditions" className="underline text-black">CGV/CGU</Link> et la <Link to="/legal/mentions-legales" className="underline text-black">Politique de confidentialité</Link>.
                      </span>
                    </label>
                    <label className="flex items-start gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        className="mt-1 h-4 w-4 rounded border-gray-300 text-black focus:ring-black"
                        checked={newsletterOptIn}
                        onChange={(e) => setNewsletterOptIn(e.target.checked)}
                      />
                      <span className="text-text-secondary text-xs">
                        Je souhaite recevoir la newsletter Zelia (conseils orientation, nouveautés).
                      </span>
                    </label>
                  </div>
                </div>
              )}

              {error && <div className="mt-4 text-red-600 text-sm bg-red-50 p-2 rounded border border-red-100">{error}</div>}

              <div className="mt-6 flex gap-3">
                {step > 1 && (
                  <button type="button" onClick={prevStep} className="flex-1 h-10 rounded-lg border border-line text-sm font-medium hover:bg-gray-50 transition-colors">
                    Retour
                  </button>
                )}
                {step < 4 ? (
                  <button type="button" onClick={nextStep} className="flex-1 h-10 rounded-lg bg-black text-white text-sm font-medium hover:bg-gray-900 transition-colors">
                    Suivant
                  </button>
                ) : (
                  <button type="submit" className="flex-1 h-10 rounded-lg bg-black text-white text-sm font-medium hover:bg-gray-900 transition-colors">
                    S'inscrire
                  </button>
                )}
              </div>
            </form>
            
            <p className="mt-4 text-center text-sm text-text-secondary">
              Déjà un compte ? <Link to="/login" className="text-black font-medium hover:underline">Se connecter</Link>
            </p>
          </>
        )}
      </div>
    </div>
  )
}
