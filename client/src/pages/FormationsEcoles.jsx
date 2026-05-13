import React from 'react'
import { Link, useLocation } from 'react-router-dom'
import Formations from './Formations.jsx'
import EcolesPartenaires from './EcolesPartenaires.jsx'

const TABS = [
  { id: 'ecoles', label: 'Écoles partenaires', to: '/app/formations', icon: 'ph-buildings' },
  { id: 'formations', label: 'Formations', to: '/app/formations?tab=formations', icon: 'ph-graduation-cap' }
]

export default function FormationsEcoles() {
  const location = useLocation()
  const searchParams = new URLSearchParams(location.search)
  const activeTab = searchParams.get('tab') === 'formations' ? 'formations' : 'ecoles'

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-xl md:text-2xl font-semibold mb-1">Formations et écoles</h1>
          <p className="text-sm text-text-secondary">Explore les formations en France et les écoles partenaires qui matchent avec ton projet.</p>
        </div>

        <div className="inline-flex rounded-xl border border-line bg-white p-1 shadow-sm" role="tablist" aria-label="Formations et écoles">
          {TABS.map((tab) => {
            const isActive = activeTab === tab.id
            return (
              <Link
                key={tab.id}
                to={tab.to}
                role="tab"
                aria-selected={isActive}
                className={`inline-flex h-10 items-center gap-2 rounded-lg px-3 text-sm font-semibold transition-colors ${
                  isActive ? 'bg-black text-white' : 'text-gray-700 hover:bg-[#fffbf7] hover:text-black'
                }`}
              >
                <i className={`ph ${tab.icon}`} aria-hidden="true" />
                <span>{tab.label}</span>
              </Link>
            )
          })}
        </div>
      </div>

      {activeTab === 'ecoles' ? <EcolesPartenaires embedded /> : <Formations embedded />}
    </div>
  )
}