import React, { useDeferredValue, useEffect, useId, useRef, useState } from 'react'
import { PiX, PiCheck } from 'react-icons/pi'
import { adminApi, adminError } from '../../lib/adminApi'

export function RecordPanel({ title, path, initial = {}, onClose, children }) {
  const dialog = useRef(null)
  const [state,setState] = useState({ data: initial, loading: Boolean(path) })
  const [revision,setRevision] = useState(0)
  useEffect(() => { dialog.current.showModal() }, [])
  useEffect(() => {
    if (!path) return
    const controller = new AbortController()
    setState((previous) => ({ ...previous, loading: true, error: '' }))
    adminApi.get(path,{ signal: controller.signal }).then(({ data }) => setState({ data })).catch((error) => {
      if (!controller.signal.aborted) setState({ error: adminError(error) })
    })
    return () => controller.abort()
  }, [path,revision])
  return <dialog ref={dialog} className="bo-drawer" aria-label={title} onCancel={(event) => { event.preventDefault(); onClose() }}>
    <header className="bo-drawer-heading"><h2>{title}</h2><button className="bo-icon" title="Fermer la fiche" aria-label="Fermer la fiche" onClick={onClose}><PiX /></button></header>
    <div className="bo-drawer-body">{state.loading ? <p role="status">Chargement…</p> : state.error ? <p role="alert" className="bo-error">{state.error}</p> : children(state.data, () => setRevision((previous) => previous+1))}</div>
  </dialog>
}

function SchoolPicker({ value, onChange }) {
  const [search,setSearch] = useState('')
  const [options,setOptions] = useState([])
  const [error,setError] = useState('')
  useEffect(() => {
    const controller = new AbortController()
    adminApi.get('/schools',{ params: { q: search, limit: 50 }, signal: controller.signal }).then(({ data }) => { setOptions(data.items); setError('') }).catch((failure) => { if (!controller.signal.aborted) setError(adminError(failure)) })
    return () => controller.abort()
  }, [search])
  return <div className="bo-school-picker"><input type="search" aria-label="Rechercher une école pour la formation" placeholder="Établissement…" value={search} onChange={(event) => setSearch(event.target.value)} /><select aria-label="École de la formation" required value={value || ''} onChange={(event) => onChange(event.target.value)}><option value="">Sélectionner une école</option>{options.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select>{error && <span role="alert" className="bo-error">{error}</span>}</div>
}

function SchoolNameInput({ value,onChange }) {
  const id = useId()
  const query = useDeferredValue(value)
  const [options,setOptions] = useState([])
  const [error,setError] = useState('')
  useEffect(() => {
    const controller = new AbortController()
    adminApi.get('/school-options',{ params: { q: query },signal: controller.signal }).then(({ data }) => { setOptions(data.items); setError('') }).catch((failure) => { if (!controller.signal.aborted) setError(adminError(failure)) })
    return () => controller.abort()
  }, [query])
  return <><input list={id} required value={value} onChange={(event) => onChange(event.target.value)} /><datalist id={id}>{options.map((row,index) => <option key={`${row.school_name}-${index}`} value={row.school_name} />)}</datalist>{error && <span role="alert" className="bo-error">{error}</span>}</>
}

export function EditForm({ fields, values = {}, submit, onSaved }) {
  const [form,setForm] = useState(() => Object.fromEntries(fields.map(([key,,type]) => [key, values[key] ?? (type === 'checkbox' ? true : '')])))
  const [busy,setBusy] = useState(false)
  const [error,setError] = useState('')
  const [success,setSuccess] = useState('')
  const save = async (event) => {
    event.preventDefault(); setBusy(true); setError(''); setSuccess('')
    const payload = Object.fromEntries(fields.map(([key,,type]) => [key,type === 'number' ? form[key] === '' ? null : Number(form[key]) : form[key]]))
    try { await submit(payload); setSuccess('Modifications enregistrées.'); onSaved?.() } catch (failure) { setError(adminError(failure)) } finally { setBusy(false) }
  }
  return <form className="bo-edit-form" onSubmit={save}><div className="bo-form-grid">{fields.map(([key,label,type = 'text',required = false]) => {
    const update = (value) => { setForm((previous) => ({ ...previous,[key]: value })); setSuccess('') }
    return <label key={key} className={type === 'textarea' || type === 'school' ? 'bo-form-wide' : type === 'checkbox' ? 'bo-checkbox' : ''}>{type === 'checkbox' ? <><input type="checkbox" checked={form[key]} onChange={(event) => update(event.target.checked)} />{label}</> : <>{label}{type === 'textarea' ? <textarea rows="4" maxLength="10000" value={form[key]} onChange={(event) => update(event.target.value)} /> : type === 'school' ? <SchoolPicker value={form[key]} onChange={update} /> : type === 'school-name' ? <SchoolNameInput value={form[key]} onChange={update} /> : <input type={type} required={required} maxLength="500" min={key === 'age' ? 3 : undefined} max={key === 'age' ? 120 : undefined} value={form[key]} onChange={(event) => update(event.target.value)} />}</>}</label>
  })}</div>{error && <p role="alert" className="bo-error">{error}</p>}{success && <p role="status" className="bo-success">{success}</p>}<button className="bo-button bo-primary" type="submit" disabled={busy}>{busy ? 'Enregistrement…' : 'Enregistrer'}<PiCheck aria-hidden="true" /></button></form>
}

export function ConfirmAction({ label, description, action, onDone, disabled, danger = false }) {
  const [open,setOpen] = useState(false)
  return <><button className={`bo-button${danger ? ' bo-danger' : ''}`} disabled={disabled} onClick={() => setOpen(true)}>{label}</button>{open && <ActionDialog label={label} description={description} action={action} onDone={onDone} onClose={() => setOpen(false)} />}</>
}

function ActionDialog({ label, description, action, onDone, onClose }) {
  const dialog = useRef(null)
  const [reason,setReason] = useState('')
  const [busy,setBusy] = useState(false)
  const [error,setError] = useState('')
  useEffect(() => { dialog.current.showModal() }, [])
  const confirm = async (event) => {
    event.preventDefault(); setBusy(true); setError('')
    try { await action(reason.trim()); onDone?.(); onClose() } catch (failure) { setError(adminError(failure)); setBusy(false) }
  }
  return <dialog ref={dialog} className="bo-modal" aria-label={label} onCancel={(event) => { event.preventDefault(); if (!busy) onClose() }}><h2>{label}</h2>{description && <p>{description}</p>}<form onSubmit={confirm}><label>Motif<textarea rows="3" value={reason} maxLength="1000" required onChange={(event) => setReason(event.target.value)} /></label>{error && <p role="alert" className="bo-error">{error}</p>}<div className="bo-actions"><button type="button" className="bo-button" disabled={busy} onClick={onClose}>Annuler</button><button className="bo-button bo-primary" type="submit" disabled={busy || !reason.trim()}>{busy ? 'Traitement…' : 'Confirmer'}</button></div></form></dialog>
}