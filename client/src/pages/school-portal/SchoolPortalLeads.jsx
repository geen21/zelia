import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { schoolPortalSupabase } from '../../lib/schoolPortalSupabase'
import { schoolPortalAPI } from '../../lib/schoolPortalApi'

const PAGE_SIZE = 50

const COLUMNS = [
  { key: 'prenom', label: 'Prénom' },
  { key: 'nom', label: 'Nom' },
  { key: 'email', label: 'Email' },
  { key: 'age', label: 'Âge' },
  { key: 'departement', label: 'Département' },
  { key: 'classe_actuelle', label: 'Classe actuelle' },
  { key: 'niveau_vise', label: 'Niveau visé' },
  { key: 'budget', label: 'Budget' },
  { key: 'moyenne', label: 'Moyenne' },
  { key: 'preference_geo', label: 'Préférence géo' },
  { key: 'matieres_fortes', label: 'Matières fortes' },
  { key: 'formations_choisies_ecole', label: 'Formations choisies chez vous' },
  { key: 'nb_demandes_infos_ecole', label: 'Demandes d\'infos' },
  { key: 'inscrit_le', label: 'Inscrit le' }
]

function formatDate(value) {
  if (!value) return ''
  try {
    return new Date(value).toLocaleDateString('fr-FR')
  } catch {
    return value
  }
}

function topCounts(values, max = 4) {
  const counts = new Map()
  values.filter(Boolean).forEach((value) => counts.set(value, (counts.get(value) || 0) + 1))
  return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).slice(0, max)
}

export default function SchoolPortalLeads() {
  const [company, setCompany] = useState(null)
  const [pendingApproval, setPendingApproval] = useState(false)
  const [leads, setLeads] = useState([])
  const [total, setTotal] = useState(0)
  const [offset, setOffset] = useState(0)
  const [formations, setFormations] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [exporting, setExporting] = useState(false)
  const navigate = useNavigate()

  const loadLeadsPage = useCallback(async (nextOffset = 0) => {
    try {
      const { data } = await schoolPortalAPI.getLeads({ limit: PAGE_SIZE, offset: nextOffset })
      setLeads(Array.isArray(data?.leads) ? data.leads : [])
      setTotal(Number(data?.total) || 0)
      setOffset(nextOffset)
    } catch (loadError) {
      setError(loadError?.response?.data?.error || 'Impossible de charger les leads')
    }
  }, [])

  const bootstrap = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const { data: meData } = await schoolPortalAPI.getMe()
      const currentCompany = meData?.company || null
      setCompany(currentCompany)

      if (!currentCompany?.approved) {
        setPendingApproval(true)
        return
      }
      setPendingApproval(false)

      const [, formationsResult] = await Promise.all([
        loadLeadsPage(0),
        schoolPortalAPI.getFormations().catch(() => ({ data: { formations: [] } }))
      ])
      setFormations(Array.isArray(formationsResult?.data?.formations) ? formationsResult.data.formations : [])
    } catch (loadError) {
      const status = loadError?.response?.status
      if (status === 401 || status === 404) {
        navigate('/espace-ecoles/connexion', { replace: true })
        return
      }
      if (status === 403 && loadError?.response?.data?.error === 'PENDING_APPROVAL') {
        setPendingApproval(true)
        return
      }
      setError(loadError?.response?.data?.error || 'Impossible de charger votre espace')
    } finally {
      setLoading(false)
    }
  }, [loadLeadsPage, navigate])

  useEffect(() => {
    let active = true
    ;(async () => {
      const { data } = await schoolPortalSupabase.auth.getSession()
      if (!active) return
      if (!data?.session?.access_token) {
        navigate('/espace-ecoles/connexion', { replace: true })
        return
      }
      bootstrap()
    })()
    return () => { active = false }
  }, [bootstrap, navigate])

  async function handleExport() {
    if (exporting) return
    setExporting(true)
    try {
      const response = await schoolPortalAPI.exportLeadsCsv()
      const blob = new Blob([response.data], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `leads-${company?.name || 'ecole'}.csv`
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
    } catch {
      setError("Échec de l'export CSV")
    } finally {
      setExporting(false)
    }
  }

  async function handleLogout() {
    await schoolPortalSupabase.auth.signOut().catch(() => {})
    navigate('/espace-ecoles/connexion', { replace: true })
  }

  const hasPrevious = offset > 0
  const hasNext = offset + PAGE_SIZE < total

  const stats = useMemo(() => {
    const totalDemandesInfos = leads.reduce((sum, lead) => sum + (Number(lead.nb_demandes_infos_ecole) || 0), 0)
    const niveaux = topCounts(leads.map((lead) => lead.niveau_vise))
    const classes = topCounts(leads.map((lead) => lead.classe_actuelle))
    return { totalDemandesInfos, niveaux, classes }
  }, [leads])

  return (
    <main className="min-h-screen bg-[#fffbf7] text-black">
      <nav className="max-w-6xl mx-auto flex items-center justify-between px-4 py-6">
        <Link to="/" className="inline-flex" aria-label="Accueil Zelia">
          <img src="/static/images/logo-dark.png" alt="Zelia" className="h-8 w-auto" />
        </Link>
        <button type="button" onClick={handleLogout} className="text-sm font-medium text-black hover:underline">
          Se déconnecter
        </button>
      </nav>

      <section className="max-w-6xl mx-auto px-4 pb-16">
        <div className="mb-6">
          <p className="text-xs uppercase font-medium text-text-secondary tracking-normal mb-1">Espace écoles</p>
          <h1 className="text-2xl font-semibold leading-tight">
            {company?.name ? `Leads pour ${company.name}` : 'Vos leads'}
          </h1>
          {company?.contactFirstName && (
            <p className="text-sm text-text-secondary mt-1">Bonjour {company.contactFirstName} {company.contactLastName}</p>
          )}
        </div>

        {loading && !pendingApproval && <p className="text-center text-text-secondary py-10">Chargement...</p>}

        {!loading && pendingApproval && (
          <div className="bg-white border border-line rounded-lg shadow-card p-6 text-center">
            <p className="text-lg font-semibold mb-2">Compte en cours de validation</p>
            <p className="text-sm text-text-secondary">
              Votre compte pour <strong>{company?.name}</strong> est en attente de validation par notre équipe.
              Vous serez notifié(e) par email dès que l'accès aux leads sera activé.
            </p>
          </div>
        )}

        {!loading && !pendingApproval && (
          <>
            {error && <div className="mb-4 rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

            <div className="grid gap-3 sm:grid-cols-3 mb-6">
              <div className="bg-white border border-line rounded-lg shadow-card p-4">
                <p className="text-2xl font-semibold">{total}</p>
                <p className="text-xs text-text-secondary mt-1">Lead{total > 1 ? 's' : ''} au total</p>
              </div>
              <div className="bg-white border border-line rounded-lg shadow-card p-4">
                <p className="text-2xl font-semibold">{formations.length}</p>
                <p className="text-xs text-text-secondary mt-1">Formations de votre établissement sur Zélia</p>
              </div>
              <div className="bg-white border border-line rounded-lg shadow-card p-4">
                <p className="text-2xl font-semibold">{stats.totalDemandesInfos}</p>
                <p className="text-xs text-text-secondary mt-1">Demandes d'infos (page affichée)</p>
              </div>
            </div>

            {(stats.niveaux.length > 0 || stats.classes.length > 0) && (
              <div className="grid gap-3 sm:grid-cols-2 mb-6">
                {stats.niveaux.length > 0 && (
                  <div className="bg-white border border-line rounded-lg shadow-card p-4">
                    <p className="text-sm font-semibold mb-2">Niveaux visés</p>
                    <ul className="text-sm text-text-secondary space-y-1">
                      {stats.niveaux.map(([label, count]) => (
                        <li key={label} className="flex justify-between"><span>{label}</span><span>{count}</span></li>
                      ))}
                    </ul>
                  </div>
                )}
                {stats.classes.length > 0 && (
                  <div className="bg-white border border-line rounded-lg shadow-card p-4">
                    <p className="text-sm font-semibold mb-2">Classes actuelles</p>
                    <ul className="text-sm text-text-secondary space-y-1">
                      {stats.classes.map(([label, count]) => (
                        <li key={label} className="flex justify-between"><span>{label}</span><span>{count}</span></li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {formations.length > 0 && (
              <div className="mb-6">
                <p className="text-sm font-semibold mb-2">Formations de votre établissement référencées sur Zélia</p>
                <div className="bg-white border border-line rounded-lg shadow-card divide-y divide-line">
                  {formations.map((formation) => {
                    const isInternal = formation.link.startsWith('/')
                    return (
                      <div key={formation.id} className="p-3 flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-medium">{formation.title}</p>
                          <p className="text-xs text-text-secondary">
                            {[formation.city, formation.diplomaLevel].filter(Boolean).join(' • ')}
                          </p>
                        </div>
                        {formation.link && (
                          isInternal ? (
                            <Link to={formation.link} target="_blank" className="text-xs font-semibold underline whitespace-nowrap">
                              Voir la fiche
                            </Link>
                          ) : (
                            <a href={formation.link} target="_blank" rel="noopener noreferrer" className="text-xs font-semibold underline whitespace-nowrap">
                              Voir le lien
                            </a>
                          )
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-semibold">Liste des leads</p>
              <button
                type="button"
                onClick={handleExport}
                disabled={exporting || total === 0}
                className="h-10 px-4 rounded-lg border border-line font-semibold text-sm hover:border-black disabled:opacity-60"
              >
                {exporting ? 'Export...' : 'Exporter en CSV'}
              </button>
            </div>

            <div className="bg-white border border-line rounded-lg shadow-card overflow-x-auto">
              {leads.length === 0 ? (
                <p className="p-6 text-center text-text-secondary">
                  Aucun lead pour le moment. Vérifiez que le nom de votre établissement correspond exactement à celui choisi par les élèves.
                </p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-line text-left">
                      {COLUMNS.map((column) => (
                        <th key={column.key} className="px-3 py-2 font-semibold whitespace-nowrap">{column.label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {leads.map((lead, index) => (
                      <tr key={`${lead.email}-${index}`} className="border-b border-line last:border-b-0">
                        {COLUMNS.map((column) => (
                          <td key={column.key} className="px-3 py-2 align-top">
                            {column.key === 'inscrit_le' ? formatDate(lead[column.key]) : (lead[column.key] ?? '')}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {(hasPrevious || hasNext) && (
              <div className="flex items-center justify-center gap-3 mt-4">
                <button
                  type="button"
                  onClick={() => loadLeadsPage(Math.max(offset - PAGE_SIZE, 0))}
                  disabled={!hasPrevious || loading}
                  className="h-9 px-4 rounded-lg border border-line text-sm font-medium disabled:opacity-40"
                >
                  Précédent
                </button>
                <button
                  type="button"
                  onClick={() => loadLeadsPage(offset + PAGE_SIZE)}
                  disabled={!hasNext || loading}
                  className="h-9 px-4 rounded-lg border border-line text-sm font-medium disabled:opacity-40"
                >
                  Suivant
                </button>
              </div>
            )}
          </>
        )}
      </section>
    </main>
  )
}
