import React, { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { schoolPortalSupabase } from '../../lib/schoolPortalSupabase'
import { schoolPortalAPI } from '../../lib/schoolPortalApi'

export default function SchoolPortalRegister() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [contactFirstName, setContactFirstName] = useState('')
  const [contactLastName, setContactLastName] = useState('')
  const [schoolName, setSchoolName] = useState('')
  const [selectedSchool, setSelectedSchool] = useState(null)
  const [suggestions, setSuggestions] = useState([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()
  const debounceRef = useRef(null)

  const isSchoolConfirmed = Boolean(selectedSchool) && selectedSchool.school_name === schoolName

  useEffect(() => {
    if (!schoolName.trim()) {
      setSuggestions([])
      return
    }
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      try {
        const { data } = await schoolPortalAPI.searchSchools(schoolName.trim())
        setSuggestions(Array.isArray(data?.schools) ? data.schools : [])
      } catch {
        setSuggestions([])
      }
    }, 300)
    return () => clearTimeout(debounceRef.current)
  }, [schoolName])

  function handleSchoolNameChange(value) {
    setSchoolName(value)
    setShowSuggestions(true)
    // Any manual edit invalidates a previous selection: the school must be
    // re-picked from the list to avoid free-text matching errors.
    setSelectedSchool((previous) => (previous && previous.school_name === value ? previous : null))
  }

  function handleSelectSchool(suggestion) {
    setSchoolName(suggestion.school_name)
    setSelectedSchool(suggestion)
    setShowSuggestions(false)
  }

  async function handleSubmit(event) {
    event.preventDefault()
    if (loading) return
    setError('')

    if (!email || !password || !contactFirstName || !contactLastName || !schoolName.trim()) {
      setError('Tous les champs sont requis.')
      return
    }
    if (!isSchoolConfirmed) {
      setError("Merci de sélectionner l'établissement dans la liste proposée (la saisie libre n'est pas acceptée).")
      return
    }
    if (password.length < 6) {
      setError('Le mot de passe doit contenir au moins 6 caractères.')
      return
    }

    setLoading(true)
    try {
      await schoolPortalAPI.register({
        email,
        password,
        schoolName: schoolName.trim(),
        contactFirstName,
        contactLastName
      })

      const { error: signInError } = await schoolPortalSupabase.auth.signInWithPassword({ email, password })
      if (signInError) throw signInError

      navigate('/espace-ecoles/leads', { replace: true })
    } catch (registerError) {
      const message = registerError?.response?.data?.error || registerError?.message || "Échec de l'inscription"
      setError(message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="min-h-screen bg-[#fffbf7] text-black flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-md">
        <Link to="/espace-ecoles" className="inline-flex mb-8" aria-label="Espace écoles Zelia">
          <img src="/static/images/logo-dark.png" alt="Zelia" className="h-8 w-auto" />
        </Link>

        <div className="bg-white border border-line rounded-lg shadow-card p-6 sm:p-7">
          <div className="mb-6">
            <p className="text-xs uppercase font-medium text-text-secondary tracking-normal mb-2">Espace écoles</p>
            <h1 className="text-2xl font-semibold leading-tight mb-2">Créer votre compte école</h1>
            <p className="text-sm text-text-secondary">Renseignez l'établissement que vous représentez pour accéder à ses leads.</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-3">
            <label className="block relative">
              <span className="block text-xs font-medium text-text-secondary mb-1">Établissement représenté</span>
              <input
                type="text"
                value={schoolName}
                onChange={(event) => handleSchoolNameChange(event.target.value)}
                onFocus={() => setShowSuggestions(true)}
                onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
                placeholder="Rechercher l'établissement dans la base"
                className={`w-full h-11 rounded-lg border px-3 outline-none focus:border-black text-sm sm:text-base ${isSchoolConfirmed ? 'border-[#c1ff72]' : 'border-line'}`}
                autoComplete="off"
                role="combobox"
                aria-expanded={showSuggestions}
                aria-autocomplete="list"
              />
              {showSuggestions && suggestions.length > 0 && (
                <ul className="absolute z-10 mt-1 w-full max-h-56 overflow-auto bg-white border border-line rounded-lg shadow-card">
                  {suggestions.map((suggestion) => (
                    <li key={`${suggestion.source}-${suggestion.school_name}`}>
                      <button
                        type="button"
                        className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50"
                        onMouseDown={() => handleSelectSchool(suggestion)}
                      >
                        {suggestion.school_name}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <span className={`block text-xs mt-1 ${isSchoolConfirmed ? 'text-green-700' : 'text-text-secondary'}`}>
                {isSchoolConfirmed
                  ? 'Établissement sélectionné dans la base.'
                  : 'Sélectionnez un établissement dans la liste proposée (la saisie libre n\'est pas acceptée).'}
              </span>
            </label>

            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="block text-xs font-medium text-text-secondary mb-1">Prénom</span>
                <input
                  type="text"
                  value={contactFirstName}
                  onChange={(event) => setContactFirstName(event.target.value)}
                  className="w-full h-11 rounded-lg border border-line px-3 outline-none focus:border-black text-sm sm:text-base"
                  autoComplete="given-name"
                />
              </label>
              <label className="block">
                <span className="block text-xs font-medium text-text-secondary mb-1">Nom</span>
                <input
                  type="text"
                  value={contactLastName}
                  onChange={(event) => setContactLastName(event.target.value)}
                  className="w-full h-11 rounded-lg border border-line px-3 outline-none focus:border-black text-sm sm:text-base"
                  autoComplete="family-name"
                />
              </label>
            </div>

            <label className="block">
              <span className="block text-xs font-medium text-text-secondary mb-1">Email professionnel</span>
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="contact@ecole.fr"
                className="w-full h-11 rounded-lg border border-line px-3 outline-none focus:border-black text-sm sm:text-base"
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
                className="w-full h-11 rounded-lg border border-line px-3 outline-none focus:border-black text-sm sm:text-base"
                autoComplete="new-password"
              />
            </label>

            {error && <div className="rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

            <p className="text-xs text-text-secondary">
              Après création, votre compte est soumis à validation par notre équipe avant l'accès aux leads.
            </p>

            <button
              type="submit"
              disabled={loading || !isSchoolConfirmed}
              className="w-full h-12 rounded-lg bg-black text-white font-semibold disabled:opacity-60"
            >
              {loading ? 'Création...' : 'Créer mon compte'}
            </button>
          </form>
        </div>

        <p className="mt-4 text-center text-sm text-text-secondary">
          Déjà un compte ? <Link to="/espace-ecoles/connexion" className="text-black font-medium underline">Se connecter</Link>
        </p>
      </div>
    </main>
  )
}
