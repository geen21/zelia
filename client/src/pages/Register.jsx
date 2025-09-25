import React, { useMemo, useState } from 'react'
import axios from 'axios'
import supabase from '../lib/supabase'
import { Link, useNavigate } from 'react-router-dom'

export default function Register() {
  // Single mode: student
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  // student
  const [nom, setNom] = useState('')
  const [prenom, setPrenom] = useState('')
  const [age, setAge] = useState('18')
  const [genre, setGenre] = useState('')
  const [departement, setDepartement] = useState('')
  const [ecole, setEcole] = useState('')
  const [numeroTelephone, setNumeroTelephone] = useState('')

  const [error, setError] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
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
        department: departement, school: ecole, phone_number: numeroTelephone
      }

      // Use custom API endpoint that can handle avatar and questionnaire data properly
      const response = await axios.post('/api/auth/register', {
        email,
        password,
        userData,
        avatarData,
        questionnaireResponses
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

  return (
    <div className="min-h-screen bg-white text-text-primary flex items-center justify-center px-4">
      <div className="w-full max-w-5xl py-10">
        <style>{`
        /* Helper to remove outlines / rings / transitions */
        .no-outline, .no-outline:focus, .no-outline:focus-visible { outline: none !important; box-shadow: none !important; transition: none !important; }
        .no-outline::-moz-focus-inner { border: 0 !important; }
        `}</style>
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
            <div className="mb-6">
              <h1 className="text-2xl font-bold">Créer un compte</h1>
              <p className="text-text-secondary">Choisissez votre type de profil pour une expérience personnalisée.</p>
            </div>
            <div className="mb-4 flex gap-2">
              {/* Single label-style button for consistency; no black border, same size, no rounded */}
              <button type="button" className="h-11 px-4 rounded-none border border-line bg-white text-sm text-text-primary cursor-default" disabled>
                Étudiant
              </button>
            </div>
            <form onSubmit={handleSubmit} className="bg-surface border border-line rounded-xl shadow-card p-6">
              <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
                    {/* Student fields only */}
                    <div className="md:col-span-4">
                      <label className="block text-sm text-text-secondary mb-1">Prénom *</label>
                      <input className="w-full border border-line rounded-none h-11 px-3 outline-none text-sm focus:outline-none focus:ring-0 focus:shadow-none transition-none no-outline" type="text" placeholder="Votre prénom" value={prenom} onChange={e=>setPrenom(e.target.value)} required />
                    </div>
                    <div className="md:col-span-4">
                      <label className="block text-sm text-text-secondary mb-1">Nom *</label>
                      <input className="w-full border border-line rounded-none h-11 px-3 outline-none text-sm focus:outline-none focus:ring-0 focus:shadow-none transition-none no-outline" type="text" placeholder="Votre nom" value={nom} onChange={e=>setNom(e.target.value)} required />
                    </div>
                    <div className="md:col-span-4">
                      <label className="block text-sm text-text-secondary mb-1">Âge *</label>
                      <input className="w-full border border-line rounded-none h-11 px-3 outline-none text-sm focus:outline-none focus:ring-0 focus:shadow-none transition-none no-outline" type="number" min="10" max="100" placeholder="Votre âge" value={age} onChange={e=>setAge(e.target.value)} required />
                    </div>
                    <div className="md:col-span-6">
                      <label className="block text-sm text-text-secondary mb-1">Département *</label>
                      <select className="w-full border border-line rounded-none h-11 px-3 outline-none text-sm bg-white focus:outline-none focus:ring-0 focus:shadow-none transition-none no-outline" value={departement} onChange={e=>setDepartement(e.target.value)} required>
                        <option value="">Sélectionnez votre département</option>
                        {departements.map(d => <option key={d.code} value={`${d.code} - ${d.name}`}>{d.code} - {d.name}</option>)}
                      </select>
                    </div>
                    <div className="md:col-span-6">
                      <label className="block text-sm text-text-secondary mb-1">Genre *</label>
                      <select className="w-full border border-line rounded-none h-11 px-3 outline-none text-sm bg-white focus:outline-none focus:ring-0 focus:shadow-none transition-none no-outline" value={genre} onChange={e=>setGenre(e.target.value)} required>
                        <option value="">Sélectionnez un genre</option>
                        <option value="Homme">Homme</option>
                        <option value="Femme">Femme</option>
                        <option value="Autre">Autre</option>
                      </select>
                    </div>
                    <div className="md:col-span-6">
                      <label className="block text-sm text-text-secondary mb-1">École/Formation</label>
                      <input className="w-full border border-line rounded-none h-11 px-3 outline-none text-sm focus:outline-none focus:ring-0 focus:shadow-none transition-none no-outline" type="text" placeholder="Nom de votre école..." value={ecole} onChange={e=>setEcole(e.target.value)} />
                      <small className="text-text-secondary">Facultatif - Saisissez le nom de votre école</small>
                    </div>
                    <div className="md:col-span-6">
                      <label className="block text-sm text-text-secondary mb-1">Numéro de téléphone</label>
                      <input className="w-full border border-line rounded-none h-11 px-3 outline-none text-sm focus:outline-none focus:ring-0 focus:shadow-none transition-none no-outline" type="tel" placeholder="ex: 06 12 34 56 78" value={numeroTelephone} onChange={e=>setNumeroTelephone(e.target.value)} />
                      <small className="text-text-secondary">Facultatif</small>
                    </div>
                    <div className="md:col-span-6">
                      <label className="block text-sm text-text-secondary mb-1">Adresse Email *</label>
                      <input className="w-full border border-line rounded-none h-11 px-3 outline-none text-sm focus:outline-none focus:ring-0 focus:shadow-none transition-none no-outline" type="email" placeholder="Entrez votre adresse email" value={email} onChange={e=>setEmail(e.target.value)} required />
                    </div>
                    <div className="md:col-span-3">
                      <label className="block text-sm text-text-secondary mb-1">Mot de passe *</label>
                      <input className="w-full border border-line rounded-none h-11 px-3 outline-none text-sm focus:outline-none focus:ring-0 focus:shadow-none transition-none no-outline" type="password" placeholder="Entrez votre mot de passe" value={password} onChange={e=>setPassword(e.target.value)} required />
                    </div>
                    <div className="md:col-span-3">
                      <label className="block text-sm text-text-secondary mb-1">Confirmer le mot de passe *</label>
                      <input className="w-full border border-line rounded-none h-11 px-3 outline-none text-sm focus:outline-none focus:ring-0 focus:shadow-none transition-none no-outline" type="password" placeholder="Confirmez votre mot de passe" value={confirmPassword} onChange={e=>setConfirmPassword(e.target.value)} required />
                    </div>
                    {error && <div className="md:col-span-12 text-red-600 text-sm">{error}</div>}
                    <div className="md:col-span-12">
                      <button type="submit" className="w-full bg-black text-white rounded-none h-11">S'inscrire</button>
                    </div>
              </div>
            </form>
            <p className="mt-3 text-sm text-text-secondary">Vous avez déjà un compte ? <Link to="/login" className="underline">Se connecter</Link></p>
          </>
        )}
      </div>
    </div>
  )
}
