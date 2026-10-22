import React, { useDeferredValue, useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { PiArrowClockwise, PiArrowSquareOut, PiMagnifyingGlass, PiCaretLeft, PiCaretRight, PiEye, PiPlus } from 'react-icons/pi'
import { adminApi, adminError } from '../../lib/adminApi'
import { RecordPanel, EditForm, ConfirmAction } from './AdminControls'
import { formationHref, isPartnerFormation, recommendedFormations, selectedFormations } from '../../lib/adminSelections'
import Chart from 'react-apexcharts'
import chartLocale from 'apexcharts/dist/locales/fr.json'
import AdminSchoolAccess, { PartnerDashboardLink, SchoolDashboardActions } from './AdminSchoolAccess'

export const dateLabel = (value) => value ? new Date(value).toLocaleDateString('fr-FR') : '—'
export const nameLabel = (row) => [row.first_name,row.last_name].filter(Boolean).join(' ') || row.email || 'Sans nom'

export function useAdminList(resource, params = {}) {
  const [state, setState] = useState({ items: [], total: 0, loading: true })
  const [revision, setRevision] = useState(0)
  const paramsKey = JSON.stringify(params)
  useEffect(() => {
    const controller = new AbortController()
    setState((previous) => ({ ...previous, loading: true, error: '' }))
    adminApi.get(resource, { params: JSON.parse(paramsKey), signal: controller.signal }).then(({ data }) => {
      setState({ ...data, loading: false })
    }).catch((error) => { if (!controller.signal.aborted) setState({ items: [], total: 0, loading: false, error: adminError(error) }) })
    return () => controller.abort()
  }, [resource, paramsKey, revision])
  return { ...state, reload: () => setRevision((previous) => previous + 1) }
}

export function Badge({ active, children }) {
  return <span className={`bo-badge${active ? ' bo-badge-active' : ''}`}>{children || (active ? 'Actif' : 'Non autorisé')}</span>
}

export function PageTitle({ title, children }) {
  return <div className="bo-page-heading"><h1>{title}</h1><div className="bo-actions">{children}</div></div>
}

export function DataTable({ title, resource, columns, params = {}, filters, actions, onView, tableClassName = '', initialSearch = '' }) {
  const [search, setSearch] = useState(initialSearch)
  const [offset, setOffset] = useState(0)
  const deferredSearch = useDeferredValue(search)
  const data = useAdminList(resource, { ...params, q: deferredSearch, limit: 50, offset })
  const paramsKey = JSON.stringify(params)
  useEffect(() => { setOffset(0) }, [deferredSearch, paramsKey])
  return <>
    <PageTitle title={title}>{actions}</PageTitle>
    <div className="bo-toolbar"><label className="bo-search"><PiMagnifyingGlass aria-hidden="true" /><input aria-label={`Rechercher dans ${title.toLowerCase()}`} type="search" placeholder="Rechercher…" value={search} onChange={(event) => { setSearch(event.target.value); setOffset(0) }} /></label>{filters}<button className="bo-icon" title="Actualiser" aria-label="Actualiser" disabled={data.loading} onClick={data.reload}><PiArrowClockwise /></button></div>
    {data.error && <p className="bo-error" role="alert">{data.error}</p>}
    <div className="bo-table-wrap" aria-busy={data.loading}><table className={`bo-table ${tableClassName}`}><thead><tr>{columns.map((column) => <th key={column.key} scope="col">{column.label}</th>)}{onView && <th scope="col"><span className="bo-sr-only">Fiche</span></th>}</tr></thead><tbody>
      {data.items.map((row) => <tr key={row.id}>{columns.map((column) => <td key={column.key}>{column.render ? column.render(row) : row[column.key] ?? '—'}</td>)}{onView && <td><button className="bo-icon" title="Ouvrir la fiche" aria-label={`Ouvrir la fiche ${row.email || row.name || row.title || row.formation_name || row.id}`} onClick={() => onView(row, data.reload)}><PiEye /></button></td>}</tr>)}
      {!data.items.length && <tr><td className="bo-empty" colSpan={columns.length + Number(Boolean(onView))}>{data.loading ? 'Chargement…' : data.error ? 'Données indisponibles' : 'Aucun résultat'}</td></tr>}
    </tbody></table></div>
    <footer className="bo-pagination"><span>{data.total.toLocaleString('fr-FR')} résultat{data.total !== 1 ? 's' : ''}{data.total > 0 && ` · ${offset + 1}–${Math.min(offset + 50,data.total)}`}</span><div className="bo-actions"><button className="bo-icon" title="Page précédente" aria-label="Page précédente" disabled={!offset || data.loading} onClick={() => setOffset(Math.max(0,offset-50))}><PiCaretLeft /></button><button className="bo-icon" title="Page suivante" aria-label="Page suivante" disabled={offset + 50 >= data.total || data.loading} onClick={() => setOffset(offset+50)}><PiCaretRight /></button></div></footer>
  </>
}

export function AdminDashboard() {
  const [state,setState] = useState({ loading: true })
  useEffect(() => {
    const controller = new AbortController()
    adminApi.get('/overview',{ signal: controller.signal }).then(({ data }) => setState({ data })).catch((error) => { if (!controller.signal.aborted) setState({ error: adminError(error) }) })
    return () => controller.abort()
  }, [])
  const metrics = [['users','Utilisateurs','utilisateurs'],['suspendedUsers','Comptes suspendus','utilisateurs'],['schools','Écoles','ecoles'],['approvedSchools','Écoles autorisées','ecoles'],['nationalFormations','Catalogue national','formations'],['customFormations','Formations privées','formations'],['partnerFormations','Formations partenaires actives','partenaires'],['results','Analyses enregistrées','resultats']]
  return <><PageTitle title="Vue d’ensemble" />{state.error && <p className="bo-error" role="alert">{state.error}</p>}<PartnerRecommendationsOverview /><SelectionsOverview /><div className="bo-metrics">{metrics.map(([key,label,path]) => <Link className="bo-metric" key={key} to={`/admin/${path}`}><span>{label}</span><strong>{state.loading ? '…' : (state.data?.[key] ?? 0).toLocaleString('fr-FR')}</strong></Link>)}</div><StudentGrowthChart /><h2>Activité récente</h2><div className="bo-table-wrap"><table className="bo-table"><thead><tr><th>Date</th><th>Action</th><th>Objet</th></tr></thead><tbody>{(state.data?.recentActions || []).map((row) => <tr key={row.id}><td>{dateLabel(row.created_at)}</td><td>{row.action}</td><td>{row.resource_type} · {row.resource_id}</td></tr>)}{!state.data?.recentActions?.length && <tr><td colSpan="3" className="bo-empty">{state.loading ? 'Chargement…' : 'Aucune action enregistrée'}</td></tr>}</tbody></table></div></>
}

function PartnerRecommendationsOverview() {
  const data = useAdminList('/recommendations',{ source:'partner',limit:5 })
  return <section className="bo-recommendations" aria-labelledby="bo-recommendations-heading">
    <div className="bo-page-heading"><div><h2 id="bo-recommendations-heading">Partenaires recommandés</h2><p className="bo-muted">Établissements présentés aux élèves, indépendamment de leurs choix.</p></div><Link className="bo-button" to="/admin/resultats?view=recommendations&source=partner">Toutes les recommandations<PiCaretRight aria-hidden="true" /></Link></div>
    {data.error && <p className="bo-error" role="alert">{data.error}</p>}
    <div className="bo-table-wrap" aria-busy={data.loading}><table className="bo-table"><thead><tr><th>Formation</th><th>Établissement</th><th>Ville</th><th>Élève</th><th>Date</th></tr></thead><tbody>
      {data.items.map((row) => <tr key={row.id}><td><FormationLink formation={row}>{row.formation_name}</FormationLink><small className="bo-cell-detail">Recommandée · Partenaire</small></td><td>{row.school_name || '—'}</td><td>{row.city || '—'}</td><td><Link to={`/admin/resultats?view=recommendations&source=partner&user_id=${row.user_id}`}>{nameLabel(row)}</Link></td><td>{dateLabel(row.created_at)}</td></tr>)}
      {!data.items.length && <tr><td colSpan="5" className="bo-empty">{data.loading ? 'Chargement…' : data.error ? 'Données indisponibles' : 'Aucune recommandation partenaire enregistrée'}</td></tr>}
    </tbody></table></div>
  </section>
}

function SelectionsOverview() {
  const data = useAdminList('/selections',{ limit:5 })
  return <section className="bo-selections" aria-labelledby="bo-selections-heading"><div className="bo-page-heading"><div><h2 id="bo-selections-heading">Formations sélectionnées</h2>{!data.loading && !data.error && <p className="bo-muted">{data.total.toLocaleString('fr-FR')} sélections · {(data.totalUsers ?? 0).toLocaleString('fr-FR')} utilisateurs</p>}</div><Link className="bo-button" to="/admin/resultats">Toutes les sélections<PiCaretRight aria-hidden="true" /></Link></div>
    {data.error && <p className="bo-error" role="alert">{data.error}</p>}<div className="bo-table-wrap" aria-busy={data.loading}><table className="bo-table"><thead><tr><th>Formation</th><th>Établissement</th><th>Utilisateur</th><th>Date</th></tr></thead><tbody>{data.items.map((row) => <tr key={row.id}><td><FormationLink formation={row}>{row.formation_name}</FormationLink><small className="bo-cell-detail">{row.source === 'partner' ? 'Demande partenaire envoyée' : 'Retenue pour informations'}</small></td><td>{row.school_name || '—'}</td><td><Link to={`/admin/resultats?user_id=${row.user_id}`}>{nameLabel(row)}</Link></td><td>{dateLabel(row.created_at)}</td></tr>)}{!data.items.length && <tr><td colSpan="4" className="bo-empty">{data.loading ? 'Chargement…' : data.error ? 'Données indisponibles' : 'Aucune sélection enregistrée'}</td></tr>}</tbody></table></div>
  </section>
}

function StudentGrowthChart() {
  const [days,setDays] = useState(30)
  const data = useAdminList('/student-growth',{ days })
  const points = data.points || []
  const options = {
    chart: { toolbar:{ show:false }, zoom:{ enabled:false }, animations:{ enabled:false }, fontFamily:'Bricolage Grotesque, sans-serif',locales:[chartLocale],defaultLocale:'fr' },
    colors:['#3f7256'],stroke:{ curve:'stepline',width:3 },grid:{ borderColor:'#e5e7eb' },
    dataLabels:{ enabled:false },markers:{ size:0 },
    xaxis:{ type:'datetime',labels:{ datetimeUTC:true,format:days === 365 ? 'MMM yy' : 'dd MMM',style:{ fontSize:'11px' } } },
    yaxis:{ min:0,forceNiceScale:true,labels:{ formatter:(value) => Math.round(value).toLocaleString('fr-FR') } },
    tooltip:{ x:{ format:'dd MMM yyyy' },y:{ formatter:(value) => `${value.toLocaleString('fr-FR')} élèves` } }
  }
  return <section className="bo-growth" aria-labelledby="bo-growth-heading"><div className="bo-growth-heading"><h2 id="bo-growth-heading">Évolution des élèves</h2><div className="bo-actions"><select aria-label="Période du graphique" value={days} onChange={(event) => setDays(Number(event.target.value))}><option value="30">30 jours</option><option value="90">90 jours</option><option value="365">1 an</option></select><button className="bo-icon" title="Actualiser le graphique" aria-label="Actualiser le graphique" disabled={data.loading} onClick={data.reload}><PiArrowClockwise /></button></div></div>
    <div className="bo-growth-summary"><span><strong>{data.loading ? '…' : data.error ? '—' : (data.totalStudents ?? 0).toLocaleString('fr-FR')}</strong> élèves inscrits</span><span>{data.loading ? '…' : data.error ? '—' : `+${(data.newStudents ?? 0).toLocaleString('fr-FR')}`} sur la période</span></div>
    <div className="bo-growth-plot" aria-busy={data.loading}>{data.error ? <p role="alert" className="bo-error">{data.error}</p> : data.loading ? <p role="status" className="bo-muted">Chargement du graphique…</p> : data.totalStudents === 0 ? <p className="bo-muted">Aucun élève inscrit.</p> : <Chart type="line" height={280} width="100%" options={options} series={[{ name:'Élèves inscrits',data:points.map((point) => [Date.parse(`${point.date}T00:00:00Z`),point.total]) }]} />}</div>
    {!data.loading && !data.error && points.length > 0 && <details className="bo-growth-data"><summary>Données quotidiennes</summary><div className="bo-table-wrap"><table className="bo-table"><thead><tr><th>Date</th><th>Inscriptions</th><th>Cumul</th></tr></thead><tbody>{points.map((point) => <tr key={point.date}><td>{new Date(`${point.date}T00:00:00Z`).toLocaleDateString('fr-FR',{ timeZone:'UTC' })}</td><td>{point.registrations.toLocaleString('fr-FR')}</td><td>{point.total.toLocaleString('fr-FR')}</td></tr>)}</tbody></table></div></details>}
  </section>
}

export function AdminUsers() {
  const [status,setStatus] = useState('all')
  const [type,setType] = useState('all')
  const [selected,setSelected] = useState(null)
  const fields = [['first_name','Prénom'],['last_name','Nom'],['age','Âge','number'],['gender','Genre'],['department','Département'],['school','Établissement'],['phone_number','Téléphone','tel']]
  return <><DataTable title="Utilisateurs" resource="/users" params={{ status,type }} filters={<><StatusFilter value={status} onChange={setStatus} options={[['active','Actifs'],['suspended','Suspendus']]} /><select aria-label="Type de compte" value={type} onChange={(event) => setType(event.target.value)}><option value="all">Tous les comptes</option><option value="student">Élèves</option><option value="school">Écoles</option></select></>} onView={(row,reload) => setSelected({ row,reload })} columns={[{ key:'name',label:'Nom',render:nameLabel },{ key:'email',label:'Email' },{ key:'account_type',label:'Compte',render:(row) => row.account_type === 'school' ? 'École' : 'Élève' },{ key:'status',label:'Accès',render:(row) => <Badge active={!row.is_suspended}>{row.is_suspended ? 'Suspendu' : 'Actif'}</Badge> },{ key:'created_at',label:'Création',render:(row) => dateLabel(row.created_at) }]} />
    {selected && <RecordPanel key={selected.row.id} title={nameLabel(selected.row)} path={`/users/${selected.row.id}`} onClose={() => setSelected(null)}>{(data,refresh) => <>
      <dl className="bo-facts"><dt>Email de connexion</dt><dd>{data.user.email}</dd><dt>Dernière connexion</dt><dd>{dateLabel(data.user.last_sign_in_at)}</dd><dt>Consentement de recontact</dt><dd>{data.profile?.contact_preference ? 'Oui' : 'Non'}</dd></dl>
      <div className="bo-actions"><Link className="bo-button" to={`/admin/resultats?user_id=${data.user.id}`}>Formations sélectionnées</Link><ConfirmAction label={data.user.is_suspended ? 'Réactiver le compte' : 'Suspendre le compte'} danger={!data.user.is_suspended} disabled={data.protectedAdmin} description={data.protectedAdmin ? 'Compte administrateur protégé.' : data.user.email} action={(reason) => adminApi.post(`/users/${data.user.id}/${data.user.is_suspended ? 'reactivate' : 'suspend'}`,{ reason })} onDone={() => { selected.reload(); refresh() }} /></div>
      {data.user.sync_pending && <p className="bo-error">Synchronisation Auth en attente. Le compte reste bloqué.</p>}
      <OrientationReview responses={data.orientationResponses} analysis={data.orientationAnalysis} />
      <RecommendedPartners items={(data.extraInfo.find((entry) => entry.question_id === 'orientation_recommendations') || data.extraInfo.find((entry) => entry.question_id === 'orientation_final_selection'))?.answer_text} />
      <SelectedFormations items={data.extraInfo.find((entry) => entry.question_id === 'orientation_final_selection')?.answer_text} recorded={data.extraInfo.some((entry) => entry.question_id === 'orientation_final_selection')} />
      <h2>Profil</h2><EditForm key={`profile-${data.profile?.id}`} fields={fields} values={data.profile || {}} submit={(payload) => adminApi.patch(`/users/${data.user.id}`,payload)} onSaved={selected.reload} />
      {data.schools.length > 0 && <><h2>Établissements associés</h2><ul className="bo-record-list">{data.schools.map((school) => <li key={school.id}>{school.name} <Badge active={Boolean(school.approved_at)} /></li>)}</ul></>}
      <h2>Informations d’orientation</h2>{data.extraInfo.filter((entry) => !['orientation_final_selection','orientation_recommendations'].includes(entry.question_id)).length ? <dl className="bo-facts">{data.extraInfo.filter((entry) => !['orientation_final_selection','orientation_recommendations'].includes(entry.question_id)).map((entry,index) => <React.Fragment key={`${entry.question_id}-${index}`}><dt>{orientationLabel(entry.question_id)}</dt><dd>{readable(entry.answer_text)}</dd></React.Fragment>)}</dl> : <p className="bo-muted">Non enregistré</p>}
    </>}</RecordPanel>}
  </>
}
export function AdminSchoolRegistrations() {
  return <><p className="bo-muted">Demandes d’inscription partenaires / écoles à recontacter dans les 2 jours ouvrés. Aucun accès de connexion n’est créé automatiquement.</p>
    <DataTable title="Inscriptions écoles" resource="/school-registrations" columns={[
      { key:'school_name',label:'Établissement' },
      { key:'contact',label:'Contact',render:(row) => `${row.contact_first_name} ${row.contact_last_name}` },
      { key:'email',label:'Email professionnel',render:(row) => <a href={`mailto:${row.email}`}>{row.email}</a> },
      { key:'created_at',label:'Demande reçue le',render:(row) => dateLabel(row.created_at) }
      ,{ key:'access',label:'Compte',render:(row) => row.company_id ? <Link to={`/admin/ecoles?company_id=${row.company_id}&invite_email=${encodeURIComponent(row.email)}`}>Gérer l’accès</Link> : <Link to={`/admin/ecoles?school_name=${encodeURIComponent(row.school_name)}&email=${encodeURIComponent(row.email)}&first_name=${encodeURIComponent(row.contact_first_name)}&last_name=${encodeURIComponent(row.contact_last_name)}&request_id=${row.id}`}>Préparer l’accès</Link> }
    ]} />
  </>
}
export function AdminSchools() {
  const [query,setQuery] = useSearchParams()
  const companyId = query.get('company_id')
  const [creating,setCreating] = useState(Boolean(query.get('request_id')))
  const [revision,setRevision] = useState(0)
  const [status,setStatus] = useState('all')
  const [selected,setSelected] = useState(null)
  useEffect(() => {
    if (companyId) setSelected((previous) => String(previous?.row.id) === companyId ? previous
      : { row:{ id:companyId,name:'École' },reload:() => setRevision((value) => value+1) })
    else setSelected(null)
  }, [companyId])
  function closeSchool() {
    setSelected(null)
    const next = new URLSearchParams(query)
    next.delete('company_id')
    next.delete('invite_email')
    setQuery(next,{ replace:true })
  }
  return <><p className="bo-muted">Tous les partenaires disposent automatiquement d’un dashboard, tous campus regroupés. Invitez ensuite leur contact pour lui donner accès. La création manuelle reste disponible pour les autres écoles.</p>
    <DataTable initialSearch={query.get('school_name') || ''} key={revision} title="Écoles" resource="/schools" params={{ status }} filters={<StatusFilter value={status} onChange={setStatus} options={[['active','Autorisées'],['inactive','Non autorisées']]} />} actions={<button className="bo-button bo-primary" onClick={() => setCreating(true)}>Créer un espace école</button>} onView={(row,reload) => setSelected({ row,reload })} columns={[{ key:'name',label:'Établissement' },{ key:'email',label:'Contact',render:(row) => row.email || 'Contact à inviter' },{ key:'approved_at',label:'Accès du partenaire',render:(row) => <Badge active={Boolean(row.approved_at)} /> },{ key:'created_at',label:'Création',render:(row) => dateLabel(row.created_at) },{ key:'dashboard',label:'Dashboard',render:(row) => <SchoolDashboardActions companyId={row.id} schoolName={row.name} /> }]} />
    {creating && <RecordPanel title="Préparer un accès école" onClose={() => setCreating(false)}>{() => <EditForm fields={[['schoolName','Établissement','school-name',true],['email','Email professionnel','email',true],['firstName','Prénom'],['lastName','Nom']]} values={{ schoolName:query.get('school_name') || '',email:query.get('email') || '',firstName:query.get('first_name') || '',lastName:query.get('last_name') || '' }} submit={(payload) => adminApi.post('/portal/schools',{ ...payload,requestId:query.get('request_id') || null })} onSaved={() => { setCreating(false); setRevision((value) => value+1) }} />}</RecordPanel>}
    {selected && <RecordPanel title={selected.row.name} path={`/schools/${selected.row.id}`} onClose={closeSchool}>{(data,refresh) => <>
      <div className="bo-actions"><Badge active={Boolean(data.item.approved_at)} /><ConfirmAction label={data.item.approved_at ? 'Retirer l’accès' : 'Valider l’accès'} danger={Boolean(data.item.approved_at)} description={data.item.name} action={(reason) => adminApi.post(`/schools/${data.item.id}/${data.item.approved_at ? 'revoke' : 'approve'}`,{ reason })} onDone={() => { selected.reload(); refresh() }} /></div>
      <h2>Contacts et rattachement</h2><EditForm fields={[['name','Établissement', 'school-name',true],['email','Email de contact','email',true],['contact_first_name','Prénom du contact'],['contact_last_name','Nom du contact']]} values={data.item} submit={(payload) => adminApi.patch(`/schools/${data.item.id}`,payload)} onSaved={selected.reload} />
      <h2>Propriétaire et équipe</h2><ul className="bo-record-list">{data.accounts.map((account) => <li key={account.id}><span>{nameLabel(account)}<small>{account.email}</small></span><Badge active={!account.is_suspended}>{account.id === data.item.owner_id ? 'Propriétaire' : 'Membre'}</Badge></li>)}</ul>
      <Link className="bo-button" to={`/admin/formations?company_id=${data.item.id}`}>Formations privées</Link>
      <AdminSchoolAccess company={data.item} members={data.members} accounts={data.accounts} onChanged={() => { selected.reload(); refresh() }} />
    </>}</RecordPanel>}
  </>
}
export function AdminFormations() {
  const [query] = useSearchParams()
  const companyId = query.get('company_id')
  const [source,setSource] = useState(companyId ? 'custom' : 'national')
  const [selected,setSelected] = useState(null)
  const [creating,setCreating] = useState(false)
  const [revision,setRevision] = useState(0)
  const fields = [['title','Intitulé','text',true],['diploma_level','Niveau de diplôme'],['city','Ville'],['domain','Domaine'],['description','Description','textarea'],['link','Lien','url'],['contact_email','Email de contact','email'],['image_url','Image','url'],['is_published','Visible dans le portail privé','checkbox']]
  const formationColumn = { key:'title',label:'Formation',render:(row) => <FormationLink formation={row}>{row.title}</FormationLink> }
  const columns = source === 'national' ? [formationColumn,{ key:'etab_nom',label:'Établissement' },{ key:'commune',label:'Ville' },{ key:'region',label:'Région' }] : [formationColumn,{ key:'company_id',label:'École' },{ key:'city',label:'Ville' },{ key:'diploma_level',label:'Niveau' },{ key:'is_published',label:'Statut',render:(row) => <Badge active={row.is_published}>{row.is_published ? 'Visible' : 'Retirée'}</Badge> }]
  return <><div className="bo-tabs" role="tablist" aria-label="Sources de formations"><button role="tab" aria-selected={source === 'national'} onClick={() => { setSource('national'); setSelected(null) }}>Catalogue national</button><button role="tab" aria-selected={source === 'custom'} onClick={() => { setSource('custom'); setSelected(null) }}>Formations privées</button><Link to="/admin/partenaires">Partenaires</Link></div>
    <DataTable key={`${source}-${revision}`} title={source === 'national' ? 'Catalogue national' : 'Formations privées'} resource="/formations" params={{ source,...(source === 'custom' && companyId ? { company_id: companyId } : {}) }} columns={columns} actions={source === 'custom' ? <button className="bo-button bo-primary" onClick={() => setCreating(true)}><PiPlus aria-hidden="true" />Ajouter</button> : <Badge>Lecture seule</Badge>} onView={(row,reload) => setSelected({ row,reload })} />
    {selected && <RecordPanel title={selected.row.title} initial={{ item: selected.row }} onClose={() => setSelected(null)}>{(data) => source === 'national' ? <><dl className="bo-facts">{[['Établissement','etab_nom'],['Ville','commune'],['Département','departement'],['Région','region']].map(([label,key]) => <React.Fragment key={key}><dt>{label}</dt><dd>{data.item[key] || '—'}</dd></React.Fragment>)}</dl><ExternalLink href={formationHref(data.item)}>Fiche officielle</ExternalLink></> : <EditForm fields={fields} values={data.item} submit={(payload) => adminApi.patch(`/formations/custom/${data.item.id}`,payload)} onSaved={selected.reload} />}</RecordPanel>}
    {creating && <RecordPanel title="Ajouter une formation privée" onClose={() => setCreating(false)}>{() => <EditForm fields={[['company_id','École','school'],...fields]} values={{ company_id: companyId || '' }} submit={(payload) => adminApi.post('/formations/custom',payload)} onSaved={() => { setCreating(false); setRevision((previous) => previous+1) }} />}</RecordPanel>}
  </>
}
export function AdminPartners() {
  const [status,setStatus] = useState('all')
  const [selected,setSelected] = useState(null)
  const [creating,setCreating] = useState(null)
  const [revision,setRevision] = useState(0)
  const fields = [['formation_name','Intitulé','text',true],['city','Ville','text',true],['domain','Domaine'],['diploma_level','Niveau de diplôme'],['description','Description','textarea'],['link','Lien','url'],['contact_email','Email de contact','email'],['show_in_results','Afficher dans les recommandations','checkbox'],['highlight_in_results','Accentuer la carte partenaire','checkbox'],['results_priority','Priorité d’affichage','number',true]]
  const createFields = [['school_name','École','text',true],...fields.map((field) => field[0] === 'city' ? ['cities','Villes des campus (une ville par ligne)','textarea',true] : field)]
  return <><p className="bo-muted">Chaque partenaire possède son dashboard automatiquement, sans recréer son école. Les formations et campus d’une même école partagent le même espace. Utilisez directement « Voir le dashboard » ou « Gérer les accès ».</p>
    <DataTable key={revision} title="Partenaires" resource="/partners" params={{ status }} filters={<StatusFilter value={status} onChange={setStatus} options={[['active','Actifs'],['inactive','Archivés']]} />} actions={<button className="bo-button bo-primary" onClick={() => setCreating({})}><PiPlus aria-hidden="true" />Ajouter</button>} onView={(row,reload) => setSelected({ row,reload })} columns={[{ key:'school_name',label:'École' },{ key:'formation_name',label:'Formation',render:(row) => <FormationLink formation={row}>{row.formation_name}</FormationLink> },{ key:'city',label:'Ville' },{ key:'diploma_level',label:'Niveau' },{ key:'is_active',label:'Statut',render:(row) => <Badge active={row.is_active}>{row.is_active ? 'Actif' : 'Archivé'}</Badge> },{ key:'dashboard',label:'Espace partenaire',render:(row) => <SchoolDashboardActions companyId={row.portal_company_id} schoolName={row.school_name} /> }]} />
    {selected && <RecordPanel title={selected.row.school_name} path={`/partners/${selected.row.id}`} onClose={() => setSelected(null)}>{(data,refresh) => <>
      <div className="bo-actions"><Badge active={data.item.is_active}>{data.item.is_active ? 'Actif' : 'Archivé'}</Badge><ConfirmAction label={data.item.is_active ? 'Désactiver la formation' : 'Réactiver la formation'} danger={data.item.is_active} description={data.item.formation_name} action={(reason) => adminApi.patch(`/partners/${data.item.id}`,{ is_active: !data.item.is_active,reason })} onDone={() => { selected.reload(); refresh() }} /></div>
      <h2>{data.item.formation_name}</h2><EditForm fields={fields} values={data.item} submit={(payload) => adminApi.patch(`/partners/${data.item.id}`,payload)} onSaved={() => { selected.reload(); refresh() }} />
      <PartnerCampusActions row={data.item} onDone={() => { selected.reload(); refresh() }} />
      <PartnerDashboardLink formation={data.item} />
      <button className="bo-button" onClick={() => { setCreating(data.item); setSelected(null) }}><PiPlus aria-hidden="true" />Ajouter des campus à cette formation</button>
    </>}</RecordPanel>}
    {creating && <RecordPanel title="Ajouter une formation partenaire" onClose={() => setCreating(null)}>{() => <>
      <p className="bo-muted">Renseigne l’école et la formation une seule fois, puis une ville par ligne (20 maximum). Ajoute uniquement les campus qui proposent cette formation. Une fiche sera créée pour chaque campus, avec les mêmes informations, puis pourra être adaptée séparément.</p>
      {creating.city && <p className="bo-muted">Campus existant : {creating.city}. Saisis uniquement les nouvelles villes.</p>}
      <EditForm fields={createFields} values={creating} submit={({ cities,...payload }) => adminApi.post('/partners/campuses',{ ...payload,cities:cities.split(/\r?\n/).map((city) => city.trim()).filter(Boolean) })} onSaved={() => { setCreating(null); setRevision((previous) => previous+1) }} />
    </>}</RecordPanel>}
  </>
}
export function AdminResults() {
  const [query,setQuery] = useSearchParams()
  const [selected,setSelected] = useState(null)
  const [type,setType] = useState('')
  const [source,setSource] = useState(query.get('source') || 'all')
  const userId = query.get('user_id')
  const analyses = query.get('view') === 'analyses'
  const recommendations = query.get('view') === 'recommendations'
  const userParams = userId ? { user_id:userId } : {}
  const changeView = (view) => { setSelected(null); setSource('all'); setQuery({ ...userParams,view }) }
  const clearUser = userId && <button className="bo-button" onClick={() => { setSelected(null); setQuery({ view:analyses ? 'analyses' : recommendations ? 'recommendations' : 'selections' }) }}>Tous les utilisateurs</button>
  const tabs = <div className="bo-tabs" role="tablist" aria-label="Résultats des utilisateurs"><button role="tab" aria-selected={!analyses && !recommendations} onClick={() => changeView('selections')}>Formations sélectionnées</button><button role="tab" aria-selected={recommendations} onClick={() => changeView('recommendations')}>Recommandations</button><button role="tab" aria-selected={analyses} onClick={() => changeView('analyses')}>Analyses</button></div>
  if (recommendations) return <>{tabs}
    <DataTable key={`recommendations-${userId || 'all'}`} title="Formations recommandées" resource="/recommendations" params={{ source,...userParams }}
      filters={<><select aria-label="Origine des recommandations" value={source} onChange={(event) => setSource(event.target.value)}><option value="all">Toutes les recommandations</option><option value="partner">Partenaires</option><option value="national">Catalogue national</option></select>{clearUser}</>}
      onView={(row,reload) => setSelected({ row,reload })}
      columns={[{ key:'formation_name',label:'Formation',render:(row) => <FormationLink formation={row}>{row.formation_name}</FormationLink> },{ key:'school_name',label:'Établissement' },{ key:'city',label:'Ville' },{ key:'name',label:'Élève',render:(row) => <span>{nameLabel(row)}<small className="bo-cell-detail">{row.email}</small></span> },{ key:'source',label:'Origine',render:(row) => <Badge active={row.source === 'partner'}>{row.source === 'partner' ? 'Partenaire' : 'Catalogue national'}</Badge> },{ key:'created_at',label:'Affichée le',render:(row) => dateLabel(row.created_at) }]} />
    {selected && <RecordPanel title={selected.row.formation_name} initial={{ item:selected.row }} onClose={() => setSelected(null)}>{({ item }) => <>
      <Badge>Recommandation · Lecture seule</Badge>
      <dl className="bo-facts"><dt>Élève</dt><dd>{nameLabel(item)}<small className="bo-cell-detail">{item.email}</small></dd><dt>Établissement</dt><dd>{item.school_name || '—'}</dd><dt>Ville</dt><dd>{item.city || '—'}</dd><dt>Statut</dt><dd>Présentée à l’élève, sans présumer d’une demande d’informations.</dd><dt>Affichée le</dt><dd>{dateLabel(item.created_at)}</dd></dl>
      <div className="bo-actions"><ExternalLink href={formationHref(item)}>Fiche de la formation</ExternalLink><Link className="bo-button" to={`/admin/resultats?view=selections&user_id=${item.user_id}`} onClick={() => { setSelected(null); setSource('all') }}>Choix de cet élève</Link></div>
    </>}</RecordPanel>}
  </>
  return <>{tabs}
    {analyses ? <DataTable key={`analyses-${userId || 'all'}`} title="Analyses" resource="/results" params={{ type,...userParams }} filters={<><select aria-label="Type de questionnaire" value={type} onChange={(event) => setType(event.target.value)}><option value="">Tous les questionnaires</option><option value="inscription">Orientation</option><option value="mbti">Personnalité</option></select>{clearUser}</>} onView={(row,reload) => setSelected({ row,reload })} columns={[{ key:'name',label:'Utilisateur',render:nameLabel },{ key:'email',label:'Email' },{ key:'questionnaire_type',label:'Questionnaire' },{ key:'updated_at',label:'Mise à jour',render:(row) => dateLabel(row.updated_at) }]} /> : <DataTable key={`selections-${userId || 'all'}`} title="Formations sélectionnées" resource="/selections" tableClassName="bo-selection-table" params={{ source,...userParams }} filters={<><select aria-label="Origine des sélections" value={source} onChange={(event) => setSource(event.target.value)}><option value="all">Toutes les sélections</option><option value="orientation">Orientation</option><option value="partner">Partenaires</option></select>{clearUser}</>} onView={(row,reload) => setSelected({ row,reload })} columns={[{ key:'formation_name',label:'Formation',render:(row) => <FormationLink formation={row}>{row.formation_name}</FormationLink> },{ key:'school_name',label:'Établissement' },{ key:'city',label:'Ville' },{ key:'name',label:'Utilisateur',render:(row) => <span>{nameLabel(row)}<small className="bo-cell-detail">{row.email}</small></span> },{ key:'source',label:'Choix',render:(row) => <Badge active>{row.source === 'partner' ? 'Demande envoyée' : 'Retenue'}</Badge> },{ key:'created_at',label:'Enregistrée le',render:(row) => dateLabel(row.created_at) }]} />}
    {selected && (analyses ? <RecordPanel title={nameLabel(selected.row)} path={`/results/${selected.row.id}`} onClose={() => setSelected(null)}>{(data) => <><Badge>Lecture seule</Badge><dl className="bo-facts"><dt>Utilisateur</dt><dd>{data.user?.email}</dd><dt>Questionnaire</dt><dd>{data.item.questionnaire_type}</dd><dt>Mise à jour</dt><dd>{dateLabel(data.item.updated_at)}</dd></dl><RecommendedPartners items={data.recommendations || data.selections} /><SelectedFormations items={data.selections} recorded={data.selectionRecorded} /><details className="bo-result-analysis"><summary>Analyse et recommandations proposées</summary><h2>Analyse de personnalité</h2><p className="bo-analysis">{data.item.personality_analysis || 'Non enregistré'}</p><h2>Compétences</h2><p className="bo-analysis">{data.item.skills_assessment || 'Non enregistré'}</p><Recommendations title="Métiers proposés" items={data.item.job_recommendations} /><Recommendations title="Études proposées" items={data.item.study_recommendations} /><Recommendations title="Formations proposées" items={data.item.formation_recommendations} /></details></>}</RecordPanel> : <RecordPanel title={selected.row.formation_name} initial={{ item:selected.row }} onClose={() => setSelected(null)}>{({ item }) => <><Badge>Lecture seule</Badge><dl className="bo-facts"><dt>Utilisateur</dt><dd>{nameLabel(item)}<small className="bo-cell-detail">{item.email}</small></dd><dt>Établissement</dt><dd>{item.school_name || '—'}</dd><dt>Ville</dt><dd>{item.city || '—'}</dd><dt>Choix</dt><dd>{item.source === 'partner' ? 'Demande partenaire envoyée' : 'Retenue pour informations'}</dd><dt>Enregistrée le</dt><dd>{dateLabel(item.created_at)}</dd></dl>{item.detail?.description && <p className="bo-analysis">{item.detail.description}</p>}<div className="bo-actions"><ExternalLink href={formationHref(item)}>Fiche de la formation</ExternalLink><Link className="bo-button" to={`/admin/resultats?view=analyses&user_id=${item.user_id}`} onClick={() => setSelected(null)}>Analyses de cet utilisateur</Link></div></>}</RecordPanel>)}
  </>
}
function SelectedFormations({ items,recorded }) {
  const formations = selectedFormations(items)
  return <section aria-label="Formations sélectionnées"><h2>Formations sélectionnées</h2>{formations.length ? <ul className="bo-record-list">{formations.map((item,index) => <li key={`${item.id || 'formation'}-${index}`}><span><FormationLink formation={item}>{recommendationTitle(item)}</FormationLink><small>{item.raw?.etab_nom || item.raw?.school_name || item.subtitle || item.detail?.subtitle}</small></span><Badge active>Demande d’informations</Badge></li>)}</ul> : <p className="bo-muted">{recorded ? 'Aucune formation retenue enregistrée.' : 'Choix non enregistrés.'}</p>}</section>
}
function RecommendedPartners({ items }) {
  const partners = recommendedFormations(items).filter(isPartnerFormation)
  return <section aria-label="Partenaires recommandés"><h2>Partenaires recommandés</h2><p className="bo-muted">Recommandations affichées, distinctes des demandes d’informations.</p>
    {partners.length ? <ul className="bo-record-list">{partners.map((item,index) => <li key={`${item.id || 'partner'}-${index}`}><span><FormationLink formation={item}>{recommendationTitle(item)}</FormationLink><small>{item.schoolName || item.raw?.school_name || item.subtitle || item.detail?.subtitle}</small>{item.city && <small>{item.city}</small>}</span><Badge>Recommandée · Partenaire</Badge></li>)}</ul> : <p className="bo-muted">Aucune recommandation partenaire enregistrée.</p>}
  </section>
}
export function AdminAudit() {
  const [from,setFrom] = useState('')
  const [to,setTo] = useState('')
  return <DataTable title="Journal" resource="/audit" params={{ ...(from ? { from } : {}),...(to ? { to } : {}) }} filters={<><label>Depuis<input type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></label><label>Jusqu’au<input type="date" value={to} onChange={(event) => setTo(event.target.value)} /></label></>} columns={[{ key:'created_at',label:'Date',render:(row) => new Date(row.created_at).toLocaleString('fr-FR') },{ key:'actor_id',label:'Administrateur' },{ key:'action',label:'Action' },{ key:'resource_type',label:'Objet' },{ key:'resource_id',label:'Identifiant' },{ key:'reason',label:'Motif' }]} />
}

function StatusFilter({ value,onChange,options }) {
  return <select aria-label="Filtrer par statut" value={value} onChange={(event) => onChange(event.target.value)}><option value="all">Tous les statuts</option>{options.map(([key,label]) => <option key={key} value={key}>{label}</option>)}</select>
}
function readable(value) {
  if (value == null || value === '') return 'Non enregistré'
  if (typeof value === 'object') return Array.isArray(value) ? value.map(readable).join(', ') : JSON.stringify(value)
  try { const parsed = JSON.parse(value); return typeof parsed === 'object' ? readable(parsed) : String(value) } catch { return String(value) }
}
function orientationLabel(key) {
  const labels = { orientation_school_level:'Classe actuelle',orientation_target_level:'Niveau visé',orientation_budget:'Budget',orientation_department:'Département',orientation_department_name:'Département',orientation_study_location:'Localisation des études',orientation_strong_subjects:'Matières fortes',orientation_career_aspiration:'Projet métier' }
  return labels[key] || key.replace(/^orientation_/,'').replace(/_/g,' ')
}
function recommendationTitle(item) {
  if (typeof item === 'string') return item
  return item?.detail?.title || (Array.isArray(item?.raw?.nm) ? item.raw.nm.find(Boolean) : item?.raw?.nm) || item?.title || item?.degree || item?.formation_name || item?.name || item?.raw?.nmc || 'Sans intitulé'
}
function OrientationReview({ responses = [],analysis }) {
  return <section aria-label="Réponses et métiers">
    <Recommendations title="Métiers recommandés" items={analysis?.job_recommendations} />
    {analysis && <p className="bo-muted">Dernière analyse d’orientation : {dateLabel(analysis.updated_at)}. Lecture seule, pour vérification manuelle.</p>}
    <h2>Réponses au questionnaire d’orientation</h2>
    {responses.length ? <ol className="bo-record-list">{responses.map((entry,index) => <li key={entry.id}><span><strong>{index + 1}. {entry.questions?.content || `Question ${entry.question_id} (intitulé indisponible)`}</strong><small>Réponse : {entry.response || 'Non enregistrée'}</small></span></li>)}</ol> : <p className="bo-muted">Aucune réponse d’orientation enregistrée.</p>}
  </section>
}
function Recommendations({ title,items }) {
  let parsed = items
  if (typeof parsed === 'string' && parsed.trim()) {
    try { parsed = JSON.parse(parsed) } catch { return <><h2>{title}</h2><p className="bo-error" role="alert">Recommandations enregistrées dans un format illisible.</p></> }
  }
  if (parsed != null && parsed !== '' && !Array.isArray(parsed)) return <><h2>{title}</h2><p className="bo-error" role="alert">Recommandations enregistrées dans un format illisible.</p></>
  const entries = Array.isArray(parsed) ? parsed.filter(Boolean) : []
  return <><h2>{title}</h2>{entries.length ? <ul className="bo-record-list">{entries.map((item,index) => <li key={index}><span>{recommendationTitle(item)}<small>{item.description || item.detail?.description || ''}</small></span></li>)}</ul> : <p className="bo-muted">Non enregistré</p>}</>
}
function ExternalLink({ href,children }) {
  return /^https?:\/\//i.test(href || '') ? <a className="bo-button" href={href} target="_blank" rel="noopener noreferrer">{children}</a> : null
}
function FormationLink({ formation,children }) {
  const href = formationHref(formation)
  return href ? <a className="bo-formation-link" href={href} target="_blank" rel="noopener noreferrer" title="Ouvrir la formation dans un nouvel onglet">{children}<PiArrowSquareOut aria-hidden="true" /></a> : <span>{children}<small className="bo-cell-detail">Lien indisponible</small></span>
}
function PartnerCampusActions({ row,onDone }) {
  const [total,setTotal] = useState(null)
  const [error,setError] = useState('')
  useEffect(() => {
    const controller = new AbortController()
    adminApi.get('/partners/group-count',{ params: { school_name: row.school_name,city: row.city },signal: controller.signal }).then(({ data }) => setTotal(data.total)).catch((failure) => { if (!controller.signal.aborted) setError(adminError(failure)) })
    return () => controller.abort()
  }, [row.school_name,row.city])
  return <><h2>Campus · {row.city}</h2>{error && <p role="alert" className="bo-error">{error}</p>}{total !== null && <p>{total} formation{total !== 1 ? 's' : ''}</p>}<div className="bo-actions">{[true,false].map((active) => <ConfirmAction key={String(active)} label={active ? 'Activer le campus' : 'Désactiver le campus'} danger={!active} disabled={!total} description={`${row.school_name} · ${row.city} : ${total} formations concernées.`} action={(reason) => adminApi.post('/partners/group-status',{ school_name: row.school_name,city: row.city,is_active: active,reason })} onDone={onDone} />)}</div></>
}