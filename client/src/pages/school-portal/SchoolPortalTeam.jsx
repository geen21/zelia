import React, { useEffect, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { schoolPortalAPI } from '../../lib/schoolPortalApi'

export default function SchoolPortalTeam() {
  const { company, api = schoolPortalAPI, readOnly = false } = useOutletContext()
  const [owner, setOwner] = useState(null)
  const [members, setMembers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [email, setEmail] = useState('')
  const [inviting, setInviting] = useState(false)
  const [removingId, setRemovingId] = useState(null)

  async function load() {
    setLoading(true)
    setError('')
    try {
      const { data } = await api.getMembers()
      setOwner(data?.owner || null)
      setMembers(Array.isArray(data?.members) ? data.members : [])
    } catch (loadError) {
      setError(loadError?.response?.data?.message || loadError?.response?.data?.error || "Impossible de charger l'équipe")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [api])

  async function handleInvite(event) {
    event.preventDefault()
    if (!email.trim() || inviting) return
    setInviting(true)
    setError('')
    try {
      await api.inviteMember({ email: email.trim().toLowerCase() })
      setEmail('')
      await load()
    } catch (inviteError) {
      setError(inviteError?.response?.data?.message || inviteError?.response?.data?.error || "Échec de l'invitation")
    } finally {
      setInviting(false)
    }
  }

  async function handleRemove(id) {
    setRemovingId(id)
    try {
      await api.removeMember(id)
      await load()
    } catch {
      setError('Échec de la suppression du membre')
    } finally {
      setRemovingId(null)
    }
  }

  return (
    <>
      <div className="sp-page-head">
        <p className="sp-kicker">Espace écoles</p>
        <h1 className="sp-title">Équipe{company?.name ? ` — ${company.name}` : ''}</h1>
        <p className="sp-subtitle">Donnez accès à votre espace à d'autres membres de votre établissement.</p>
      </div>

      {error && (
        <div className="sp-card" style={{ borderColor: '#fecaca', background: '#fef2f2', color: '#b91c1c', marginBottom: 16 }}>
          {error}
        </div>
      )}

      <div className="sp-section">
        <div className="sp-section-head"><p className="sp-section-title">Membres</p></div>
        <div className="sp-card no-accent" style={{ padding: 0 }}>
          {loading ? (
            <p className="sp-empty">Chargement...</p>
          ) : (
            <div className="sp-row-list" style={{ padding: '4px 20px' }}>
              {owner && (
                <div className="sp-row-item">
                  <div>
                    <p className="sp-row-title">{owner.contactFirstName} {owner.contactLastName} <span className="sp-badge sp-badge-status-converti">Propriétaire</span></p>
                    <p className="sp-row-meta">{owner.email}</p>
                  </div>
                </div>
              )}
              {members.map((member) => (
                <div key={member.id} className="sp-row-item">
                  <div>
                    <p className="sp-row-title">{member.email} <span className="sp-badge sp-badge-status-nouveau">Membre</span></p>
                    <p className="sp-row-meta">Ajouté le {new Date(member.createdAt).toLocaleDateString('fr-FR')}</p>
                  </div>
                  {!readOnly && company?.isOwner && (
                    <button
                      type="button"
                      className="sp-btn sp-btn-sm sp-btn-danger"
                      disabled={removingId === member.id}
                      onClick={() => handleRemove(member.id)}
                    >
                      Retirer
                    </button>
                  )}
                </div>
              ))}
              {!loading && members.length === 0 && (
                <p className="sp-empty">Aucun membre supplémentaire pour le moment.</p>
              )}
            </div>
          )}
        </div>
      </div>

      {!readOnly && company?.isOwner && (
        <div className="sp-card accent-pink">
          <p className="sp-section-title" style={{ marginBottom: 14 }}>Inviter un membre</p>
          <p className="sp-subtitle" style={{ marginBottom: 14 }}>
            Invitez un collègue par email. Il choisira lui-même son mot de passe via un lien personnel et temporaire.
          </p>
          <form onSubmit={handleInvite}>
            <div className="sp-form-grid">
              <div className="sp-field">
                <label htmlFor="member-email">Email</label>
                <input id="member-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
              </div>
            </div>
            <button type="submit" className="sp-btn sp-btn-primary" disabled={inviting} style={{ marginTop: 14 }}>
              {inviting ? 'Envoi...' : 'Envoyer l’invitation'}
            </button>
          </form>
        </div>
      )}
    </>
  )
}
