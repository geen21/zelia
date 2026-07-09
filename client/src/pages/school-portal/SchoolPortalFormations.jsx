import React, { useEffect, useState } from 'react'
import { Link, useOutletContext } from 'react-router-dom'
import { schoolPortalAPI } from '../../lib/schoolPortalApi'

const EMPTY_FORM = { title: '', description: '', diplomaLevel: '', city: '', domain: '', link: '', contactEmail: '' }

export default function SchoolPortalFormations() {
  const { company } = useOutletContext()
  const [catalogFormations, setCatalogFormations] = useState([])
  const [customFormations, setCustomFormations] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [form, setForm] = useState(EMPTY_FORM)
  const [editingId, setEditingId] = useState(null)
  const [saving, setSaving] = useState(false)

  async function load() {
    setLoading(true)
    setError('')
    try {
      const [catalogResult, customResult] = await Promise.all([
        schoolPortalAPI.getFormations(),
        schoolPortalAPI.getSchoolFormations()
      ])
      setCatalogFormations(Array.isArray(catalogResult?.data?.formations) ? catalogResult.data.formations : [])
      setCustomFormations(Array.isArray(customResult?.data?.formations) ? customResult.data.formations : [])
    } catch (loadError) {
      setError(loadError?.response?.data?.error || 'Impossible de charger les formations')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  function updateField(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  function startEdit(formation) {
    setEditingId(formation.id)
    setForm({
      title: formation.title || '',
      description: formation.description || '',
      diplomaLevel: formation.diploma_level || '',
      city: formation.city || '',
      domain: formation.domain || '',
      link: formation.link || '',
      contactEmail: formation.contact_email || ''
    })
  }

  function cancelEdit() {
    setEditingId(null)
    setForm(EMPTY_FORM)
  }

  async function handleSubmit(event) {
    event.preventDefault()
    if (!form.title.trim() || saving) return
    setSaving(true)
    setError('')
    try {
      if (editingId) {
        await schoolPortalAPI.updateSchoolFormation(editingId, form)
      } else {
        await schoolPortalAPI.createSchoolFormation(form)
      }
      cancelEdit()
      await load()
    } catch (saveError) {
      setError(saveError?.response?.data?.error || "Échec de l'enregistrement")
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id) {
    try {
      await schoolPortalAPI.deleteSchoolFormation(id)
      await load()
    } catch {
      setError('Échec de la suppression')
    }
  }

  return (
    <>
      <div className="sp-page-head">
        <p className="sp-kicker">Espace écoles</p>
        <h1 className="sp-title">Mes formations{company?.name ? ` — ${company.name}` : ''}</h1>
        <p className="sp-subtitle">Formations référencées automatiquement sur Zélia, et formations que vous ajoutez vous-même.</p>
      </div>

      {error && (
        <div className="sp-card" style={{ borderColor: '#fecaca', background: '#fef2f2', color: '#b91c1c', marginBottom: 16 }}>
          {error}
        </div>
      )}

      <div className="sp-section">
        <div className="sp-section-head"><p className="sp-section-title">Référencées sur Zélia</p></div>
        <div className="sp-card no-accent" style={{ padding: 0 }}>
          {loading ? (
            <p className="sp-empty">Chargement...</p>
          ) : catalogFormations.length === 0 ? (
            <p className="sp-empty">Aucune formation référencée pour votre établissement pour le moment.</p>
          ) : (
            <div className="sp-row-list" style={{ padding: '4px 20px' }}>
              {catalogFormations.map((formation) => {
                const isInternal = String(formation.link || '').startsWith('/')
                return (
                  <div key={formation.id} className="sp-row-item">
                    <div>
                      <p className="sp-row-title">{formation.title}</p>
                      <p className="sp-row-meta">{[formation.city, formation.diplomaLevel].filter(Boolean).join(' • ')}</p>
                    </div>
                    {formation.link && (
                      isInternal ? (
                        <Link to={formation.link} target="_blank" className="sp-btn sp-btn-sm">Voir la fiche</Link>
                      ) : (
                        <a href={formation.link} target="_blank" rel="noopener noreferrer" className="sp-btn sp-btn-sm">Voir le lien</a>
                      )
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      <div className="sp-section">
        <div className="sp-section-head"><p className="sp-section-title">Mes formations personnalisées</p></div>
        <div className="sp-card no-accent" style={{ padding: 0, marginBottom: 16 }}>
          {loading ? null : customFormations.length === 0 ? (
            <p className="sp-empty">Vous n'avez pas encore ajouté de formation personnalisée.</p>
          ) : (
            <div className="sp-row-list" style={{ padding: '4px 20px' }}>
              {customFormations.map((formation) => (
                <div key={formation.id} className="sp-row-item">
                  <div>
                    <p className="sp-row-title">{formation.title}</p>
                    <p className="sp-row-meta">{[formation.city, formation.diploma_level].filter(Boolean).join(' • ')}</p>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button type="button" className="sp-btn sp-btn-sm" onClick={() => startEdit(formation)}>Modifier</button>
                    <button type="button" className="sp-btn sp-btn-sm sp-btn-danger" onClick={() => handleDelete(formation.id)}>Supprimer</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="sp-card accent-pink">
          <p className="sp-section-title" style={{ marginBottom: 14 }}>{editingId ? 'Modifier la formation' : 'Ajouter une formation'}</p>
          <form onSubmit={handleSubmit}>
            <div className="sp-form-grid">
              <div className="sp-field">
                <label htmlFor="sf-title">Titre *</label>
                <input id="sf-title" value={form.title} onChange={(event) => updateField('title', event.target.value)} required />
              </div>
              <div className="sp-field">
                <label htmlFor="sf-diploma">Niveau de diplôme</label>
                <input id="sf-diploma" value={form.diplomaLevel} onChange={(event) => updateField('diplomaLevel', event.target.value)} />
              </div>
              <div className="sp-field">
                <label htmlFor="sf-city">Ville</label>
                <input id="sf-city" value={form.city} onChange={(event) => updateField('city', event.target.value)} />
              </div>
              <div className="sp-field">
                <label htmlFor="sf-domain">Domaine</label>
                <input id="sf-domain" value={form.domain} onChange={(event) => updateField('domain', event.target.value)} />
              </div>
              <div className="sp-field">
                <label htmlFor="sf-link">Lien (site, brochure...)</label>
                <input id="sf-link" value={form.link} onChange={(event) => updateField('link', event.target.value)} />
              </div>
              <div className="sp-field">
                <label htmlFor="sf-email">Email de contact</label>
                <input id="sf-email" type="email" value={form.contactEmail} onChange={(event) => updateField('contactEmail', event.target.value)} />
              </div>
            </div>
            <div className="sp-field" style={{ marginTop: 12 }}>
              <label htmlFor="sf-description">Description</label>
              <textarea id="sf-description" value={form.description} onChange={(event) => updateField('description', event.target.value)} />
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
              <button type="submit" className="sp-btn sp-btn-primary" disabled={saving}>
                {saving ? 'Enregistrement...' : editingId ? 'Enregistrer les modifications' : 'Ajouter la formation'}
              </button>
              {editingId && <button type="button" className="sp-btn" onClick={cancelEdit}>Annuler</button>}
            </div>
          </form>
        </div>
      </div>
    </>
  )
}
