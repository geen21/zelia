import React, { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getStoredAdminKey, schoolPortalAdminAPI, storeAdminKey } from '../../lib/schoolPortalAdminApi'

export default function SchoolPortalAdmin() {
  const [adminKey, setAdminKey] = useState(getStoredAdminKey())
  const [status, setStatus] = useState('pending')
  const [companies, setCompanies] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [actioningId, setActioningId] = useState(null)

  const load = useCallback(async (key, currentStatus) => {
    if (!key) return
    setLoading(true)
    setError('')
    try {
      const { data } = await schoolPortalAdminAPI.listCompanies(key, currentStatus)
      setCompanies(Array.isArray(data?.companies) ? data.companies : [])
    } catch (loadError) {
      const message = loadError?.response?.status === 401
        ? 'Clé admin invalide.'
        : loadError?.response?.data?.error || 'Impossible de charger les comptes'
      setError(message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (adminKey) load(adminKey, status)
  }, [adminKey, status, load])

  function handleKeySubmit(event) {
    event.preventDefault()
    storeAdminKey(adminKey)
    load(adminKey, status)
  }

  async function handleApprove(id) {
    setActioningId(id)
    try {
      await schoolPortalAdminAPI.approve(adminKey, id)
      await load(adminKey, status)
    } catch {
      setError("Échec de l'approbation")
    } finally {
      setActioningId(null)
    }
  }

  async function handleRevoke(id) {
    setActioningId(id)
    try {
      await schoolPortalAdminAPI.revoke(adminKey, id)
      await load(adminKey, status)
    } catch {
      setError('Échec de la révocation')
    } finally {
      setActioningId(null)
    }
  }

  return (
    <main className="min-h-screen bg-[#fffbf7] text-black">
      <nav className="max-w-5xl mx-auto flex items-center justify-between px-4 py-6">
        <Link to="/" className="inline-flex" aria-label="Accueil Zelia">
          <img src="/static/images/logo-dark.png" alt="Zelia" className="h-8 w-auto" />
        </Link>
      </nav>

      <section className="max-w-5xl mx-auto px-4 pb-16">
        <h1 className="text-2xl font-semibold mb-4">Validation des comptes écoles</h1>

        <form onSubmit={handleKeySubmit} className="flex items-center gap-3 mb-6">
          <input
            type="password"
            value={adminKey}
            onChange={(event) => setAdminKey(event.target.value)}
            placeholder="Clé admin"
            className="h-10 flex-1 max-w-xs rounded-lg border border-line px-3 outline-none focus:border-black text-sm"
          />
          <button type="submit" className="h-10 px-4 rounded-lg bg-black text-white text-sm font-semibold">
            Valider la clé
          </button>
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value)}
            className="h-10 rounded-lg border border-line px-3 text-sm"
          >
            <option value="pending">En attente</option>
            <option value="approved">Approuvés</option>
            <option value="all">Tous</option>
          </select>
        </form>

        {error && <div className="mb-4 rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

        <div className="bg-white border border-line rounded-lg shadow-card overflow-x-auto">
          {loading ? (
            <p className="p-6 text-center text-text-secondary">Chargement...</p>
          ) : companies.length === 0 ? (
            <p className="p-6 text-center text-text-secondary">Aucun compte à afficher.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left">
                  <th className="px-3 py-2 font-semibold">École</th>
                  <th className="px-3 py-2 font-semibold">Contact</th>
                  <th className="px-3 py-2 font-semibold">Email</th>
                  <th className="px-3 py-2 font-semibold">Statut</th>
                  <th className="px-3 py-2 font-semibold">Action</th>
                </tr>
              </thead>
              <tbody>
                {companies.map((company) => (
                  <tr key={company.id} className="border-b border-line last:border-b-0">
                    <td className="px-3 py-2">{company.name}</td>
                    <td className="px-3 py-2">{company.contactFirstName} {company.contactLastName}</td>
                    <td className="px-3 py-2">{company.email}</td>
                    <td className="px-3 py-2">{company.approved ? 'Approuvé' : 'En attente'}</td>
                    <td className="px-3 py-2">
                      {company.approved ? (
                        <button
                          type="button"
                          onClick={() => handleRevoke(company.id)}
                          disabled={actioningId === company.id}
                          className="h-8 px-3 rounded-lg border border-line text-xs font-semibold hover:border-black disabled:opacity-60"
                        >
                          Révoquer
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleApprove(company.id)}
                          disabled={actioningId === company.id}
                          className="h-8 px-3 rounded-lg bg-black text-white text-xs font-semibold disabled:opacity-60"
                        >
                          Approuver
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </main>
  )
}
