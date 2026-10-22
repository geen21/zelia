import React, { useEffect, useId, useState } from 'react'
import { Link } from 'react-router-dom'
import { PiCheckCircle, PiArrowRight } from 'react-icons/pi'
import { schoolPortalAPI } from '../../lib/schoolPortalApi'
import { SchoolPortalAuthFrame } from './SchoolPortalFrame'

export default function SchoolPortalRegister() {
  const [email, setEmail] = useState('')
  const [contactFirstName, setContactFirstName] = useState('')
  const [contactLastName, setContactLastName] = useState('')
  const [schoolName, setSchoolName] = useState('')
  const [selectedSchool, setSelectedSchool] = useState(null)
  const [suggestions, setSuggestions] = useState([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const [error, setError] = useState('')
  const [searchError, setSearchError] = useState('')
  const [loading, setLoading] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const listId = useId()
  const isSchoolConfirmed = Boolean(selectedSchool) && selectedSchool.school_name === schoolName
  const listOpen = showSuggestions && suggestions.length > 0

  useEffect(() => {
    let active = true
    setSearchError(''); setSuggestions([]); setActiveIndex(-1)
    if (!schoolName.trim()) return
    const timeout = setTimeout(async () => {
      try {
        const { data } = await schoolPortalAPI.searchSchools(schoolName.trim())
        if (active) setSuggestions(data.schools)
      } catch (failure) {
        if (active) setSearchError(failure.response?.data?.error || 'Impossible de rechercher les établissements. Merci de réessayer.')
      }
    }, 300)
    return () => { active = false; clearTimeout(timeout) }
  }, [schoolName])

  function selectSchool(suggestion) {
    setSchoolName(suggestion.school_name)
    setSelectedSchool(suggestion)
    setShowSuggestions(false)
    setActiveIndex(-1)
  }

  async function handleSubmit(event) {
    event.preventDefault()
    if (loading) return
    setError('')
    if (!email.trim() || !contactFirstName.trim() || !contactLastName.trim() || !schoolName.trim()) { setError('Tous les champs sont requis.'); return }
    if (!isSchoolConfirmed) { setError('Merci de sélectionner l’établissement dans la liste proposée.'); return }
    setLoading(true)
    try {
      await schoolPortalAPI.register({ email: email.trim(), schoolName: schoolName.trim(), contactFirstName: contactFirstName.trim(), contactLastName: contactLastName.trim() })
      setSubmitted(true)
    } catch (failure) { setError(failure.response?.data?.error || failure.message || 'Échec de l’inscription.') }
    finally { setLoading(false) }
  }

  return <SchoolPortalAuthFrame footer={<>Déjà un compte ? <Link className="sp-link" to="/espace-ecoles/connexion">Se connecter</Link></>}>
    {submitted ? <section className="sp-card sp-empty" role="status" aria-live="polite">
      <PiCheckCircle aria-hidden="true" /><h1 className="sp-title">Votre demande a bien été reçue</h1><p>Merci pour votre intérêt ! Nous vous recontacterons dans les 2 jours ouvrés pour échanger sur votre inscription.</p><Link className="sp-btn sp-btn-primary" to="/espace-ecoles">Retour à l'espace écoles</Link>
    </section> : <>
      <div className="sp-page-head"><div><p className="sp-kicker">Rejoindre Zelia</p><h1 className="sp-title">Inscription partenaire / école</h1><p className="sp-subtitle">Nous vous recontacterons dans les 2 jours ouvrés pour échanger sur votre inscription.</p></div></div>
      <div className="sp-card">
        {error && <p className="sp-alert" role="alert">{error}</p>}
        <form className="sp-stack" onSubmit={handleSubmit} aria-busy={loading}>
          <div className="sp-school-search" onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setShowSuggestions(false) }}>
            <label className="sp-field" htmlFor="reg-school">Établissement représenté
              <input id="reg-school" type="text" value={schoolName} placeholder="Rechercher votre établissement" autoComplete="off" role="combobox" aria-expanded={listOpen} aria-controls={listId} aria-describedby={`${listId}-help`} aria-autocomplete="list" aria-activedescendant={listOpen && activeIndex >= 0 ? `${listId}-${activeIndex}` : undefined} required maxLength={500}
                onChange={(event) => { setSchoolName(event.target.value); setSelectedSchool(null); setShowSuggestions(true); setActiveIndex(-1) }}
                onFocus={() => setShowSuggestions(true)}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') { setShowSuggestions(false); return }
                  if (suggestions.length && ['ArrowDown', 'ArrowUp'].includes(event.key)) {
                    event.preventDefault(); setShowSuggestions(true)
                    const direction = event.key === 'ArrowDown' ? 1 : -1
                    setActiveIndex((index) => index < 0 ? direction === 1 ? 0 : suggestions.length - 1 : (index + direction + suggestions.length) % suggestions.length)
                  } else if (event.key === 'Enter' && listOpen && activeIndex >= 0) { event.preventDefault(); selectSchool(suggestions[activeIndex]) }
                }} />
            </label>
            <p id={`${listId}-help`} className="sp-muted sp-small" style={{ marginTop: 8 }}>{isSchoolConfirmed ? 'Établissement sélectionné dans la base.' : 'Sélectionnez un établissement dans la liste proposée.'}</p>
            {listOpen && <ul className="sp-suggestions" id={listId} role="listbox" aria-label="Établissements proposés">
              {suggestions.map((suggestion, index) => <li key={`${suggestion.source}-${suggestion.school_name}`} role="presentation">
                <button type="button" role="option" id={`${listId}-${index}`} aria-selected={index === activeIndex} tabIndex={-1} onMouseDown={(event) => event.preventDefault()} onClick={() => selectSchool(suggestion)}>{suggestion.school_name}</button>
              </li>)}
            </ul>}
            {searchError && <p className="sp-alert" role="alert">{searchError}</p>}
          </div>
          <div className="sp-form-grid">
            <label className="sp-field" htmlFor="reg-first-name">Prénom<input id="reg-first-name" value={contactFirstName} onChange={(event) => setContactFirstName(event.target.value)} autoComplete="given-name" required maxLength={500} /></label>
            <label className="sp-field" htmlFor="reg-last-name">Nom<input id="reg-last-name" value={contactLastName} onChange={(event) => setContactLastName(event.target.value)} autoComplete="family-name" required maxLength={500} /></label>
          </div>
          <label className="sp-field" htmlFor="reg-email">Email professionnel<input id="reg-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="contact@ecole.fr" autoComplete="email" required maxLength={500} /></label>
          <p className="sp-notice">L'envoi de ce formulaire ne crée pas de compte et ne donne pas encore accès à l'espace écoles.</p>
          <button type="submit" disabled={loading || !isSchoolConfirmed} className="sp-btn sp-btn-primary">{loading ? 'Envoi…' : "Envoyer ma demande d'inscription"}<PiArrowRight aria-hidden="true" /></button>
        </form>
      </div>
    </>}
  </SchoolPortalAuthFrame>
}
