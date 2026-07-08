import React, { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { schoolPortalAPI } from '../../lib/api'

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

export default function SchoolPortalLeads() {
  const [company, setCompany] = useState(null)
  const [leads, setLeads] = useState([])
  const [total, setTotal] = useState(0)
  const [offset, setOffset] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [exporting, setExporting] = useState(false)
  const navigate = useNavigate()

  const loadLeads = useCallback(async (nextOffset = 0) => {
    setLoading(true)
    setError('')
    try {
      const { data: meData } = await schoolPortalAPI.getMe()
      setCompany(meData?.company || null)

      const { data } = await schoolPortalAPI.getLeads({ limit: PAGE_SIZE, offset: nextOffset })
      setLeads(Array.isArray(data?.leads) ? data.leads : [])
      setTotal(Number(data?.total) || 0)
      setOffset(nextOffset)
    } catch (loadError) {
      const status = loadError?.response?.status
      if (status === 401 || status === 403 || status === 404) {
        navigate('/espace-ecoles/connexion', { replace: true })
        return
      }
      setError(loadError?.response?.data?.error || 'Impossible de charger les leads')
    } finally {
      setLoading(false)
    }
  }, [navigate])

  useEffect(() => {
    const token = localStorage.getItem('token') || localStorage.getItem('supabase_auth_token')
    if (!token) {
      navigate('/espace-ecoles/connexion', { replace: true })
      return
    }
    loadLeads(0)
  }, [loadLeads, navigate])

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
    await supabase.auth.signOut().catch(() => {})
    localStorage.removeItem('token')
    localStorage.removeItem('supabase_auth_token')
    navigate('/espace-ecoles/connexion', { replace: true })
  }

  const hasPrevious = offset > 0
  const hasNext = offset + PAGE_SIZE < total

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

        <div className="flex items-center justify-between mb-3">
          <p className="text-sm text-text-secondary">{total} lead{total > 1 ? 's' : ''} au total</p>
          <button
            type="button"
            onClick={handleExport}
            disabled={exporting || total === 0}
            className="h-10 px-4 rounded-lg border border-line font-semibold text-sm hover:border-black disabled:opacity-60"
          >
            {exporting ? 'Export...' : 'Exporter en CSV'}
          </button>
        </div>

        {error && <div className="mb-4 rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

        <div className="bg-white border border-line rounded-lg shadow-card overflow-x-auto">
          {loading ? (
            <p className="p-6 text-center text-text-secondary">Chargement...</p>
          ) : leads.length === 0 ? (
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
              onClick={() => loadLeads(Math.max(offset - PAGE_SIZE, 0))}
              disabled={!hasPrevious || loading}
              className="h-9 px-4 rounded-lg border border-line text-sm font-medium disabled:opacity-40"
            >
              Précédent
            </button>
            <button
              type="button"
              onClick={() => loadLeads(offset + PAGE_SIZE)}
              disabled={!hasNext || loading}
              className="h-9 px-4 rounded-lg border border-line text-sm font-medium disabled:opacity-40"
            >
              Suivant
            </button>
          </div>
        )}
      </section>
    </main>
  )
}
