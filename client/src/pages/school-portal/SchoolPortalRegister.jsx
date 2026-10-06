import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { schoolPortalAPI } from '../../lib/schoolPortalApi'
import './SchoolPortal.css'

export default function SchoolPortalRegister() {
  const [email, setEmail] = useState('')
  const [contactFirstName, setContactFirstName] = useState('')
  const [contactLastName, setContactLastName] = useState('')
  const [schoolName, setSchoolName] = useState('')
  const [selectedSchool, setSelectedSchool] = useState(null)
  const [suggestions, setSuggestions] = useState([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [error, setError] = useState('')
  const [searchError, setSearchError] = useState('')
  const [loading, setLoading] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  const isSchoolConfirmed = Boolean(selectedSchool) && selectedSchool.school_name === schoolName

  useEffect(() => {
    let active = true
    setSearchError('')
    if (!schoolName.trim()) {
      setSuggestions([])
      return
    }
    setSuggestions([])
    const timeout = setTimeout(async () => {
      try {
        const { data } = await schoolPortalAPI.searchSchools(schoolName.trim())
        if (active) setSuggestions(Array.isArray(data?.schools) ? data.schools : [])
      } catch (searchFailure) {
        if (active) setSearchError(searchFailure?.response?.data?.error || 'Impossible de rechercher les établissements. Merci de réessayer.')
      }
    }, 300)
    return () => { active = false; clearTimeout(timeout) }
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

    if (!email.trim() || !contactFirstName.trim() || !contactLastName.trim() || !schoolName.trim()) {
      setError('Tous les champs sont requis.')
      return
    }
    if (!isSchoolConfirmed) {
      setError("Merci de sélectionner l'établissement dans la liste proposée (la saisie libre n'est pas acceptée).")
      return
    }

    setLoading(true)
    try {
      await schoolPortalAPI.register({
        email: email.trim(),
        schoolName: schoolName.trim(),
        contactFirstName: contactFirstName.trim(),
        contactLastName: contactLastName.trim()
      })
      setSubmitted(true)
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
          <p className="sp-kicker">Partenaire / école</p>
          {submitted ? (
            <div role="status" aria-live="polite">
              <h1 className="sp-title" style={{ fontSize: 24, marginBottom: 12 }}>Votre demande a bien été reçue</h1>
              <p className="sp-subtitle">Merci pour votre intérêt ! Nous vous recontacterons dans les 2 jours ouvrés pour échanger sur votre inscription.</p>
              <Link to="/espace-ecoles" className="sp-btn sp-btn-primary" style={{ marginTop: 18 }}>Retour à l'espace écoles</Link>
            </div>
          ) : <>
          <h1 className="sp-title" style={{ fontSize: 24, marginBottom: 6 }}>Inscription partenaire / école</h1>
          <p className="sp-subtitle" style={{ marginBottom: 18 }}>Renseignez vos coordonnées. Nous vous recontacterons dans les 2 jours ouvrés pour échanger sur votre inscription.</p>

          <form onSubmit={handleSubmit} aria-busy={loading}>
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
                required
                maxLength={500}
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
              {searchError && <p role="alert" style={{ color: '#b91c1c', fontSize: 12 }}>{searchError}</p>}
            </div>

            <div className="sp-form-grid" style={{ marginBottom: 12 }}>
              <div className="sp-field">
                <label htmlFor="reg-first-name">Prénom</label>
                <input id="reg-first-name" type="text" value={contactFirstName} onChange={(event) => setContactFirstName(event.target.value)} autoComplete="given-name" required maxLength={500} />
              </div>
              <div className="sp-field">
                <label htmlFor="reg-last-name">Nom</label>
                <input id="reg-last-name" type="text" value={contactLastName} onChange={(event) => setContactLastName(event.target.value)} autoComplete="family-name" required maxLength={500} />
              </div>
            </div>

            <div className="sp-field" style={{ marginBottom: 12 }}>
              <label htmlFor="reg-email">Email professionnel</label>
              <input id="reg-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="contact@ecole.fr" autoComplete="email" required maxLength={500} />
            </div>

            {error && (
              <div role="alert" className="sp-card" style={{ borderColor: '#fecaca', background: '#fef2f2', color: '#b91c1c', padding: '10px 14px', marginBottom: 14 }}>
                {error}
              </div>
            )}

            <p className="sp-subtitle" style={{ marginBottom: 14 }}>
              L'envoi de ce formulaire ne crée pas de compte et ne donne pas encore accès à l'espace écoles.
            </p>

            <button type="submit" disabled={loading || !isSchoolConfirmed} className="sp-btn sp-btn-primary" style={{ width: '100%', height: 48 }}>
              {loading ? 'Envoi...' : 'Envoyer ma demande d\'inscription'}
            </button>
          </form>
          </>}
        </div>

        <p className="sp-subtitle" style={{ textAlign: 'center', marginTop: 16 }}>
          Déjà un compte ? <Link to="/espace-ecoles/connexion" style={{ color: '#000', fontWeight: 700 }}>Se connecter</Link>
        </p>
      </div>
    </main>
  )
}
