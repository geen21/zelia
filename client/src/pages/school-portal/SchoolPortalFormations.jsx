import React, { useEffect, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { schoolPortalAPI } from '../../lib/schoolPortalApi'
import SchoolPortalCatalog from './SchoolPortalCatalog'
import SchoolPortalDialog from './SchoolPortalDialog'
import { PiPlus, PiGraduationCap } from 'react-icons/pi'

const EMPTY_FORM = { title: '', description: '', diplomaLevel: '', city: '', domain: '', link: '', contactEmail: '' }

export default function SchoolPortalFormations() {
  const { api = schoolPortalAPI, readOnly = false } = useOutletContext()
  const [customFormations, setCustomFormations] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [form, setForm] = useState(EMPTY_FORM)
  const [editingId, setEditingId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [formOpen, setFormOpen] = useState(false)

  async function load() {
    setLoading(true)
    setError('')
    try {
      const customResult = await api.getSchoolFormations()
      setCustomFormations(Array.isArray(customResult?.data?.formations) ? customResult.data.formations : [])
    } catch (loadError) {
      setError(loadError?.response?.data?.error || 'Impossible de charger les formations')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [api])

  function updateField(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  function startEdit(formation) {
    setFormOpen(true)
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
    setFormOpen(false)
  }

  async function handleSubmit(event) {
    event.preventDefault()
    if (!form.title.trim() || saving) return
    setSaving(true)
    setError('')
    try {
      if (editingId) {
        await api.updateSchoolFormation(editingId, form)
      } else {
        await api.createSchoolFormation(form)
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
    setSaving(true)
    setError('')
    try {
      await api.deleteSchoolFormation(id)
      await load()
    } catch (failure) {
      setError(failure.response?.data?.error || 'Échec de la suppression')
    } finally { setSaving(false) }
  }

  return (
    <>
      <div className="sp-page-head">
        <div><p className="sp-kicker">Offre de formation</p>
        <h1 className="sp-title">Mes formations</h1>
        <p className="sp-subtitle">Votre présence sur Zelia et les formations de votre établissement.</p></div>
        {!readOnly && <button className="sp-btn sp-btn-primary" onClick={() => setFormOpen(true)}><PiPlus aria-hidden="true" />Ajouter une formation</button>}
      </div>

      {error && !formOpen && (
        <div className="sp-alert" role="alert">
          {error}
        </div>
      )}

      <SchoolPortalCatalog />

      <div className="sp-section">
        <div className="sp-section-head"><h2 className="sp-section-title">Formations personnalisées</h2><span className="sp-muted sp-small">{customFormations.length} formation(s)</span></div>
        <div className="sp-card sp-card-flush">
          {loading ? <p className="sp-empty" role="status">Chargement des formations…</p> : error ? null : customFormations.length === 0 ? (
            <div className="sp-empty"><PiGraduationCap aria-hidden="true" /><strong>Complétez votre offre</strong><p>Vous n'avez pas encore ajouté de formation personnalisée.</p></div>
          ) : (
            <div className="sp-row-list">
              {customFormations.map((formation) => (
                <div key={formation.id} className="sp-row-item">
                  <div>
                    <p className="sp-row-title">{formation.title}</p>
                    <p className="sp-row-meta">{[formation.city, formation.diploma_level].filter(Boolean).join(' • ')}</p>
                  </div>
                  <div className="sp-actions">
                    {!readOnly && <><button type="button" className="sp-btn sp-btn-sm" disabled={saving} onClick={() => startEdit(formation)}>Modifier</button>
                    <button type="button" className="sp-btn sp-btn-sm sp-btn-danger" disabled={saving} onClick={() => handleDelete(formation.id)}>Supprimer</button></>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {!readOnly && formOpen && <SchoolPortalDialog title={editingId ? 'Modifier la formation' : 'Ajouter une formation'} busy={saving} onClose={cancelEdit}>
          {error && <p className="sp-alert" role="alert">{error}</p>}
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
            <div className="sp-field" style={{ marginTop: 18 }}>
              <label htmlFor="sf-description">Description</label>
              <textarea id="sf-description" value={form.description} onChange={(event) => updateField('description', event.target.value)} />
            </div>
            <div className="sp-form-footer">
              <button type="submit" className="sp-btn sp-btn-primary" disabled={saving}>
                {saving ? 'Enregistrement...' : editingId ? 'Enregistrer les modifications' : 'Ajouter la formation'}
              </button>
              <button type="button" className="sp-btn" disabled={saving} onClick={cancelEdit}>Annuler</button>
            </div>
          </form>
        </SchoolPortalDialog>}
      </div>
    </>
  )
}
