import React, { useEffect, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { PiEnvelope, PiUsers } from 'react-icons/pi'
import { schoolPortalAPI } from '../../lib/schoolPortalApi'

export default function SchoolPortalTeam() {
  const { company, api = schoolPortalAPI, readOnly = false } = useOutletContext()
  const [owner, setOwner] = useState(null)
  const [members, setMembers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [email, setEmail] = useState('')
  const [inviting, setInviting] = useState(false)
  const [removingId, setRemovingId] = useState(null)

  async function load() {
    setLoading(true); setError('')
    try {
      const { data } = await api.getMembers()
      setOwner(data.owner)
      setMembers(data.members)
    } catch (failure) { setError(failure.response?.data?.message || failure.response?.data?.error || 'Impossible de charger l’équipe.') }
    finally { setLoading(false) }
  }
  useEffect(() => { load() }, [api])

  async function handleInvite(event) {
    event.preventDefault()
    if (inviting) return
    setInviting(true); setError(''); setMessage('')
    try {
      await api.inviteMember({ email: email.trim().toLowerCase() })
      setEmail('')
      await load()
      setMessage('Invitation envoyée.')
    } catch (failure) { setError(failure.response?.data?.message || failure.response?.data?.error || 'Échec de l’invitation.') }
    finally { setInviting(false) }
  }
  async function handleRemove(id) {
    setRemovingId(id); setError(''); setMessage('')
    try { await api.removeMember(id); await load(); setMessage('Accès du membre retiré.') }
    catch (failure) { setError(failure.response?.data?.message || 'Échec du retrait du membre.') }
    finally { setRemovingId(null) }
  }

  return <>
    <div className="sp-page-head"><div><p className="sp-kicker">Votre établissement</p><h1 className="sp-title">Équipe</h1><p className="sp-subtitle">Travaillez ensemble, dans un même espace.</p></div></div>
    {error && <div className="sp-alert" role="alert">{error}<div className="sp-form-footer"><button className="sp-btn" onClick={load}>Réessayer</button></div></div>}
    {message && <p className="sp-alert sp-alert-success" role="status">{message}</p>}
    <div className="sp-team-grid">
      <section className="sp-card sp-card-flush"><div className="sp-card-head sp-section-head" style={{ marginBottom: 0 }}><h2 className="sp-section-title">Membres de l’équipe</h2><span className="sp-muted sp-small">{members.length + (owner ? 1 : 0)} membre(s)</span></div>
        {loading ? <p className="sp-empty" role="status">Chargement de l’équipe…</p> : error ? null : <ul className="sp-row-list">
          {owner && <li className="sp-row-item"><div className="sp-person"><span className="sp-avatar" aria-hidden="true"><PiUsers /></span><div><p className="sp-row-title">{[owner.contactFirstName, owner.contactLastName].filter(Boolean).join(' ') || 'Compte propriétaire'}</p><p className="sp-row-meta">{owner.email}</p></div></div><span className="sp-badge sp-badge-status-converti">Propriétaire</span></li>}
          {members.map((member) => <li className="sp-row-item" key={member.id}><div><p className="sp-row-title">{member.email}</p><p className="sp-row-meta">Membre · Ajouté le {new Date(member.createdAt).toLocaleDateString('fr-FR')}</p></div>
            {!readOnly && company.isOwner && <button className="sp-btn sp-btn-sm sp-btn-danger" disabled={removingId !== null || inviting} onClick={() => handleRemove(member.id)}>Retirer</button>}
          </li>)}
          {!members.length && <li className="sp-empty"><p>Aucun membre supplémentaire pour le moment.</p></li>}
        </ul>}
      </section>
      {!readOnly && company.isOwner ? <section className="sp-card"><span className="sp-section-icon sp-section-icon-pink"><PiEnvelope aria-hidden="true" /></span><h2 className="sp-section-title">Inviter un membre</h2>
        <p className="sp-subtitle">Un lien personnel et temporaire lui permettra de choisir son mot de passe et de rejoindre votre équipe.</p>
        <form onSubmit={handleInvite} className="sp-stack" style={{ marginTop: 24 }}>
          <label className="sp-field" htmlFor="member-email">Email professionnel<input id="member-email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="collegue@ecole.fr" required /></label>
          <button className="sp-btn sp-btn-primary" disabled={inviting || removingId !== null}>{inviting ? 'Envoi…' : 'Envoyer l’invitation'}</button>
          <p className="sp-muted sp-small">L’invitation donne accès aux données partagées avec votre établissement.</p>
        </form>
      </section> : <p className="sp-notice">La gestion des accès est réservée au propriétaire de l’établissement.</p>}
    </div>
  </>
}
