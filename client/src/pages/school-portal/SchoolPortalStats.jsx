import React, { useEffect, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import Chart from 'react-apexcharts'
import { schoolPortalAPI } from '../../lib/schoolPortalApi'

const STATUS_LABELS = {
  nouveau: 'Nouveau',
  a_contacter: 'À contacter',
  contacte: 'Contacté',
  converti: 'Converti',
  archive: 'Archivé'
}

const SOURCE_LABELS = { questionnaire: 'Questionnaire', direct_request: 'Demande directe' }

export default function SchoolPortalStats() {
  const { company } = useOutletContext()
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    ;(async () => {
      setLoading(true)
      setError('')
      try {
        const { data } = await schoolPortalAPI.getStats()
        if (active) setStats(data)
      } catch (loadError) {
        if (active) setError(loadError?.response?.data?.error || 'Impossible de charger les statistiques')
      } finally {
        if (active) setLoading(false)
      }
    })()
    return () => { active = false }
  }, [])

  return (
    <>
      <div className="sp-page-head">
        <p className="sp-kicker">Espace écoles</p>
        <h1 className="sp-title">Statistiques{company?.name ? ` — ${company.name}` : ''}</h1>
        <p className="sp-subtitle">Évolution de vos leads, formations les plus demandées et suivi de votre pipeline.</p>
      </div>

      {error && (
        <div className="sp-card" style={{ borderColor: '#fecaca', background: '#fef2f2', color: '#b91c1c', marginBottom: 16 }}>
          {error}
        </div>
      )}

      {loading ? (
        <p className="sp-empty">Chargement...</p>
      ) : !stats || stats.total === 0 ? (
        <p className="sp-empty">Pas encore assez de données pour afficher des statistiques.</p>
      ) : (
        <>
          <div className="sp-kpi-grid">
            <div className="sp-card sp-kpi-card">
              <p className="sp-kpi-value">{stats.total}</p>
              <p className="sp-kpi-label">Leads au total</p>
            </div>
            {Object.entries(stats.bySource).map(([source, count]) => (
              <div key={source} className="sp-card sp-kpi-card accent-pink">
                <p className="sp-kpi-value">{count}</p>
                <p className="sp-kpi-label">{SOURCE_LABELS[source] || source}</p>
              </div>
            ))}
          </div>

          <div className="sp-section">
            <div className="sp-section-head"><p className="sp-section-title">Évolution des leads (12 dernières semaines)</p></div>
            <div className="sp-card">
              <Chart
                type="line"
                height={260}
                series={[{ name: 'Leads', data: stats.leadsPerWeek.map((point) => point.count) }]}
                options={{
                  chart: { toolbar: { show: false }, fontFamily: 'Bricolage Grotesque, sans-serif' },
                  colors: ['#111827'],
                  stroke: { curve: 'smooth', width: 3 },
                  grid: { borderColor: '#e5e7eb' },
                  xaxis: {
                    categories: stats.leadsPerWeek.map((point) => new Date(point.week).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })),
                    labels: { style: { fontSize: '11px' } }
                  },
                  dataLabels: { enabled: false }
                }}
              />
            </div>
          </div>

          <div className="sp-section" style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))' }}>
            <div>
              <div className="sp-section-head"><p className="sp-section-title">Formations les plus demandées</p></div>
              <div className="sp-card accent-ink">
                {stats.topFormations.length === 0 ? (
                  <p className="sp-empty" style={{ padding: '16px 0' }}>Aucune formation identifiée pour le moment.</p>
                ) : (
                  <Chart
                    type="bar"
                    height={Math.max(220, stats.topFormations.length * 34)}
                    series={[{ name: 'Demandes', data: stats.topFormations.map((item) => item.count) }]}
                    options={{
                      chart: { toolbar: { show: false }, fontFamily: 'Bricolage Grotesque, sans-serif' },
                      colors: ['#c1ff72'],
                      plotOptions: { bar: { horizontal: true, borderRadius: 4, barHeight: '55%' } },
                      xaxis: { categories: stats.topFormations.map((item) => item.name) },
                      dataLabels: { enabled: false },
                      grid: { borderColor: '#e5e7eb' }
                    }}
                  />
                )}
              </div>
            </div>

            <div>
              <div className="sp-section-head"><p className="sp-section-title">Répartition par statut</p></div>
              <div className="sp-card">
                <Chart
                  type="donut"
                  height={280}
                  series={Object.values(stats.byStatus)}
                  options={{
                    chart: { fontFamily: 'Bricolage Grotesque, sans-serif' },
                    labels: Object.keys(stats.byStatus).map((key) => STATUS_LABELS[key] || key),
                    colors: ['#f3f4f6', '#fde68a', '#93c5fd', '#86efac', '#d1d5db'],
                    legend: { position: 'bottom', fontSize: '12px' },
                    dataLabels: { enabled: false }
                  }}
                />
              </div>
            </div>
          </div>
        </>
      )}
    </>
  )
}
