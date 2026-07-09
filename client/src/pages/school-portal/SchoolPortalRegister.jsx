import React, { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { schoolPortalSupabase } from '../../lib/schoolPortalSupabase'
import { schoolPortalAPI } from '../../lib/schoolPortalApi'
import './SchoolPortal.css'

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
    <main className="sp-shell" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '32px 16px' }}>
      <div style={{ width: '100%', maxWidth: 460 }}>
        <Link to="/espace-ecoles" className="sp-logo" style={{ marginBottom: 28 }} aria-label="Espace écoles Zelia">
          <img src="/static/images/logo-dark.png" alt="Zelia" />
        </Link>

        <div className="sp-card accent-pink">
          <p className="sp-kicker">Espace écoles</p>
          <h1 className="sp-title" style={{ fontSize: 24, marginBottom: 6 }}>Créer votre compte école</h1>
          <p className="sp-subtitle" style={{ marginBottom: 18 }}>Renseignez l'établissement que vous représentez pour accéder à ses leads.</p>

          <form onSubmit={handleSubmit}>
            <div className="sp-field" style={{ marginBottom: 12, position: 'relative' }}>
              <label htmlFor="reg-school">Établissement représenté</label>
              <input
                id="reg-school"
                type="text"
                value={schoolName}
                onChange={(event) => handleSchoolNameChange(event.target.value)}
                onFocus={() => setShowSuggestions(true)}
                onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
                placeholder="Rechercher l'établissement dans la base"
                style={{ borderColor: isSchoolConfirmed ? 'var(--sp-lime)' : undefined }}
                autoComplete="off"
                role="combobox"
                aria-expanded={showSuggestions}
                aria-autocomplete="list"
              />
              {showSuggestions && suggestions.length > 0 && (
                <ul style={{
                  position: 'absolute', zIndex: 10, marginTop: 4, width: '100%', maxHeight: 224, overflow: 'auto',
                  background: '#fff', border: '1px solid var(--sp-line)', borderRadius: 14, boxShadow: '0 10px 24px rgba(15,23,42,.08)', listStyle: 'none', padding: 4
                }}>
                  {suggestions.map((suggestion) => (
                    <li key={`${suggestion.source}-${suggestion.school_name}`}>
                      <button
                        type="button"
                        style={{ width: '100%', textAlign: 'left', padding: '8px 10px', fontSize: 13, borderRadius: 10, border: 'none', background: 'transparent', cursor: 'pointer' }}
                        onMouseDown={() => handleSelectSchool(suggestion)}
                      >
                        {suggestion.school_name}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <span style={{ fontSize: 12, marginTop: 4, color: isSchoolConfirmed ? '#15803d' : '#6b7280' }}>
                {isSchoolConfirmed
                  ? 'Établissement sélectionné dans la base.'
                  : 'Sélectionnez un établissement dans la liste proposée (la saisie libre n\'est pas acceptée).'}
              </span>
            </div>

            <div className="sp-form-grid" style={{ marginBottom: 12 }}>
              <div className="sp-field">
                <label htmlFor="reg-first-name">Prénom</label>
                <input id="reg-first-name" type="text" value={contactFirstName} onChange={(event) => setContactFirstName(event.target.value)} autoComplete="given-name" />
              </div>
              <div className="sp-field">
                <label htmlFor="reg-last-name">Nom</label>
                <input id="reg-last-name" type="text" value={contactLastName} onChange={(event) => setContactLastName(event.target.value)} autoComplete="family-name" />
              </div>
            </div>

            <div className="sp-field" style={{ marginBottom: 12 }}>
              <label htmlFor="reg-email">Email professionnel</label>
              <input id="reg-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="contact@ecole.fr" autoComplete="email" />
            </div>
            <div className="sp-field" style={{ marginBottom: 14 }}>
              <label htmlFor="reg-password">Mot de passe</label>
              <input id="reg-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="6 caractères minimum" autoComplete="new-password" />
            </div>

            {error && (
              <div className="sp-card" style={{ borderColor: '#fecaca', background: '#fef2f2', color: '#b91c1c', padding: '10px 14px', marginBottom: 14 }}>
                {error}
              </div>
            )}

            <p className="sp-subtitle" style={{ marginBottom: 14 }}>
              Après création, votre compte est soumis à validation par notre équipe avant l'accès aux leads.
            </p>

            <button type="submit" disabled={loading || !isSchoolConfirmed} className="sp-btn sp-btn-primary" style={{ width: '100%', height: 48 }}>
              {loading ? 'Création...' : 'Créer mon compte'}
            </button>
          </form>
        </div>

        <p className="sp-subtitle" style={{ textAlign: 'center', marginTop: 16 }}>
          Déjà un compte ? <Link to="/espace-ecoles/connexion" style={{ color: '#000', fontWeight: 700 }}>Se connecter</Link>
        </p>
      </div>
    </main>
  )
}
