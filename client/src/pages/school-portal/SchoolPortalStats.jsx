import React, { useEffect, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import Chart from 'react-apexcharts'
import { schoolPortalAPI } from '../../lib/schoolPortalApi'
import SchoolPortalFilters, { ORIGIN_LABELS, STATUS_LABELS } from './SchoolPortalFilters'

export default function SchoolPortalStats() {
  const { api = schoolPortalAPI } = useOutletContext()
  const [filters, setFilters] = useState({})
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    ;(async () => {
      setLoading(true)
      setError('')
      try {
        const { data } = await api.getStats(filters)
        if (active) setStats(data)
      } catch (loadError) {
        if (active) { setStats(null); setError(loadError?.response?.data?.message || 'Impossible de charger les statistiques') }
      } finally {
        if (active) setLoading(false)
      }
    })()
    return () => { active = false }
  }, [api, filters])

  return (
    <>
      <div className="sp-page-head">
        <div><p className="sp-kicker">Pilotage</p>
        <h1 className="sp-title">Statistiques</h1>
        <p className="sp-subtitle">Comprenez les demandes et suivez votre activité.</p></div>
      </div>

      <SchoolPortalFilters value={filters} onChange={setFilters} campuses={stats?.campuses || []} />
      {error && (
        <div className="sp-alert" role="alert">
          {error}
        </div>
      )}

      {loading ? (
        <p className="sp-empty" role="status">Chargement des statistiques…</p>
      ) : error ? null : !stats || stats.total === 0 ? (
        <p className="sp-empty">Pas encore assez de données pour afficher des statistiques.</p>
      ) : (
        <>
          <div className="sp-kpi-grid">
            <div className="sp-card sp-kpi-card">
              <p className="sp-kpi-label">Leads au total</p>
              <p className="sp-kpi-value">{stats.total}</p>
            </div>
            {Object.entries(stats.byOrigin || {}).map(([source, count]) => (
              <div key={source} className="sp-card sp-kpi-card accent-pink">
                <p className="sp-kpi-label">{ORIGIN_LABELS[source] || source}</p>
                <p className="sp-kpi-value">{count}</p>
              </div>
            ))}
          </div>

          <div className="sp-section">
            <div className="sp-card sp-chart">
              <h2 className="sp-section-title">Évolution des leads <span className="sp-muted sp-small">· 12 dernières semaines</span></h2>
              <Chart
                type="line"
                height={260}
                series={[{ name: 'Leads', data: stats.leadsPerWeek.map((point) => point.count) }]}
                options={{
                  chart: { toolbar: { show: false }, animations: { enabled: false }, fontFamily: 'Bricolage Grotesque, sans-serif' },
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

          <div className="sp-section sp-chart-grid">
            <div className="sp-card sp-chart">
              <h2 className="sp-section-title">Formations les plus demandées</h2>
                {stats.topFormations.length === 0 ? (
                  <p className="sp-empty" style={{ padding: '16px 0' }}>Aucune formation identifiée pour le moment.</p>
                ) : (
                  <Chart
                    type="bar"
                    height={Math.max(220, stats.topFormations.length * 34)}
                    series={[{ name: 'Demandes', data: stats.topFormations.map((item) => item.count) }]}
                    options={{
                      chart: { toolbar: { show: false }, animations: { enabled: false }, fontFamily: 'Bricolage Grotesque, sans-serif' },
                      colors: ['#c1ff72'],
                      plotOptions: { bar: { horizontal: true, borderRadius: 4, barHeight: '55%' } },
                      xaxis: { categories: stats.topFormations.map((item) => item.name) },
                      dataLabels: { enabled: false },
                      grid: { borderColor: '#e5e7eb' }
                    }}
                  />
                )}
            </div>

            <div className="sp-card sp-chart">
              <h2 className="sp-section-title">Répartition par statut</h2>
                <Chart
                  type="donut"
                  height={280}
                  series={Object.values(stats.byStatus)}
                  options={{
                    chart: { animations: { enabled: false }, fontFamily: 'Bricolage Grotesque, sans-serif' },
                    labels: Object.keys(stats.byStatus).map((key) => STATUS_LABELS[key] || key),
                    colors: ['#f3f4f6', '#fde68a', '#93c5fd', '#86efac', '#d1d5db'],
                    legend: { position: 'bottom', fontSize: '12px' },
                    dataLabels: { enabled: false }
                  }}
                />
            </div>
          </div>
          <p className="sp-notice">Chaque élève est compté une fois. Les origines sont exclusives et leur somme correspond au total ; un même élève peut utiliser plusieurs canaux.</p>
        </>
      )}
    </>
  )
}
