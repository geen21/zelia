import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { usersAPI } from '../lib/api'
import { TOOLBOX_ITEMS, TOOLBOX_CATEGORIES, TOOLBOX_CATEGORY_DETAILS } from '../lib/levelMapping'
import { fetchProgression } from '../lib/progression'
import {
  PiVideoCameraBold,
  PiBrainBold,
  PiTranslateBold,
  PiMagnifyingGlassBold,
  PiBriefcaseBold,
  PiFileTextBold,
  PiChatsBold,
  PiIdentificationCardBold,
  PiSortAscendingBold,
  PiTrendUpBold,
  PiChartPieBold,
  PiInfoBold,
  PiMicrophoneBold,
  PiChatsCircleBold,
  PiPathBold,
  PiStarBold,
  PiEnvelopeBold,
  PiHeartBold,
  PiSmileyBold,
  PiPuzzlePieceBold,
  PiChatDotsBold,
  PiCheckCircleBold,
  PiWrenchBold
} from 'react-icons/pi'

const ICON_MAP = {
  'ph-video': PiVideoCameraBold,
  'ph-brain': PiBrainBold,
  'ph-translate': PiTranslateBold,
  'ph-magnifying-glass': PiMagnifyingGlassBold,
  'ph-briefcase': PiBriefcaseBold,
  'ph-file-text': PiFileTextBold,
  'ph-chats': PiChatsBold,
  'ph-identification-card': PiIdentificationCardBold,
  'ph-sort-ascending': PiSortAscendingBold,
  'ph-trend-up': PiTrendUpBold,
  'ph-chart-pie': PiChartPieBold,
  'ph-info': PiInfoBold,
  'ph-microphone': PiMicrophoneBold,
  'ph-chats-circle': PiChatsCircleBold,
  'ph-path': PiPathBold,
  'ph-star': PiStarBold,
  'ph-envelope': PiEnvelopeBold,
  'ph-heart': PiHeartBold,
  'ph-smiley': PiSmileyBold,
  'ph-puzzle-piece': PiPuzzlePieceBold,
  'ph-chat-dots': PiChatDotsBold
}

function normalizeExtraInfoEntries(response) {
  if (Array.isArray(response?.data?.entries)) return response.data.entries
  if (Array.isArray(response?.data)) return response.data
  return []
}

function slugifyCategory(category) {
  return String(category || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function getToolQuestIds(tool) {
  return [
    tool.id ? `tool:${tool.id}` : '',
    Number.isFinite(tool.componentLevel) ? `level_${tool.componentLevel}` : '',
    ...(tool.legacyLevels || []).map((level) => `level_${level}`)
  ].filter(Boolean)
}

function isToolCompleted(tool, completedQuestIds, completedExtraIds) {
  if (getToolQuestIds(tool).some((questId) => completedQuestIds.has(questId))) return true

  const levelPrefixes = (tool.legacyLevels || [])
    .map((level) => `niveau${level}`.toLowerCase())

  for (const entryId of completedExtraIds) {
    if (levelPrefixes.some((prefix) => entryId.startsWith(prefix))) return true
  }

  return false
}

export default function BoiteAOutils() {
  const navigate = useNavigate()
  const [completedQuestIds, setCompletedQuestIds] = useState(() => new Set())
  const [completedExtraIds, setCompletedExtraIds] = useState(() => new Set())

  useEffect(() => {
    let active = true
    ;(async () => {
      const [progression, extraInfoResponse] = await Promise.all([
        fetchProgression(),
        usersAPI.getExtraInfo().catch(() => null)
      ])

      if (!active) return
      setCompletedQuestIds(new Set((progression?.quests || []).map((questId) => String(questId).toLowerCase())))
      setCompletedExtraIds(new Set(normalizeExtraInfoEntries(extraInfoResponse).map((entry) => String(entry?.question_id || '').toLowerCase()).filter(Boolean)))
    })()

    return () => { active = false }
  }, [])

  const groupedTools = useMemo(() => (
    TOOLBOX_CATEGORIES
      .map((category) => ({
        category,
        slug: slugifyCategory(category),
        description: TOOLBOX_CATEGORY_DETAILS[category] || '',
        tools: TOOLBOX_ITEMS.filter((tool) => tool.category === category)
      }))
      .filter((group) => group.tools.length > 0)
  ), [])

  const scrollToCategory = (slug) => {
    document.getElementById(`outils-${slug}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <div className="outils-page">
      <style>{outilsStyles}</style>
      <section className="outils-card outils-header">
        <div>
          <h1>Boîte à outils</h1>
          <p>Choisis ce que tu veux faire aujourd'hui : les outils sont regroupés par objectif.</p>
        </div>
        <nav className="outils-pill-nav" aria-label="Navigation rapide">
          <Link to="/app" className="outils-pill">
            <i className="ph ph-compass" aria-hidden="true" />
            <span>Conseiller</span>
          </Link>
          <Link to="/app/formations" className="outils-pill">
            <i className="ph ph-graduation-cap" aria-hidden="true" />
            <span>Formations</span>
          </Link>
          <Link to="/app/results" className="outils-pill">
            <i className="ph ph-chart-line-up" aria-hidden="true" />
            <span>Résultats</span>
          </Link>
        </nav>
      </section>

      <div className="flex flex-wrap gap-2 mb-8">
        {groupedTools.map((group) => (
          <button
            key={group.slug}
            onClick={() => scrollToCategory(group.slug)}
            className="px-3 py-1.5 rounded-full text-sm font-medium border border-gray-200 bg-white text-gray-700 hover:border-black hover:text-black transition-colors"
          >
            {group.category}
          </button>
        ))}
      </div>

      <div className="space-y-10">
        {groupedTools.map((group) => (
          <section key={group.slug} id={`outils-${group.slug}`} className="scroll-mt-4">
            <div className="mb-3">
              <h2 className="text-lg font-semibold text-gray-900">{group.category}</h2>
              {group.description && <p className="text-sm text-gray-500">{group.description}</p>}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {group.tools.map((tool) => {
                const Icon = ICON_MAP[tool.icon] || PiWrenchBold
                const completed = isToolCompleted(tool, completedQuestIds, completedExtraIds)
                return (
                  <button
                    key={tool.id || tool.path}
                    onClick={() => navigate(tool.path)}
                    className={`bg-white border rounded-lg p-3 text-left hover:shadow-lg transition-all group ${completed ? 'border-[#c1ff72]' : 'border-gray-200 hover:border-gray-300'}`}
                  >
                    <div className="flex items-start gap-3">
                      <div className={`w-14 h-14 shrink-0 rounded-lg flex items-center justify-center transition-colors ${completed ? 'bg-[#c1ff72]' : 'bg-gray-100 group-hover:bg-[#c1ff72]'}`}>
                        <Icon className="w-8 h-8" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2 mb-1">
                          <h3 className="font-medium text-sm truncate">{tool.title}</h3>
                          {completed && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-[#f8fff0] border border-[#c1ff72] px-2 py-0.5 text-[11px] font-semibold text-gray-800">
                              <PiCheckCircleBold className="w-3.5 h-3.5" />
                              Validé
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-gray-500 line-clamp-2">{tool.description}</p>
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}

const outilsStyles = `
.outils-page {
  width: 100%;
  max-width: 1180px;
  margin: 0 auto;
  padding: 8px 8px 24px;
  font-family: "Bricolage Grotesque", -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica Neue', Arial, sans-serif;
}
.outils-card {
  position: relative;
  background: #fff;
  border: 1px solid rgba(0,0,0,.06);
  border-radius: 28px;
  box-shadow: 0 26px 60px -30px rgba(0,0,0,.22), 0 2px 10px rgba(0,0,0,.04);
  padding: clamp(20px, 4vw, 32px);
  margin-bottom: 24px;
}
.outils-card::before {
  content: '';
  position: absolute;
  top: 0;
  left: 30px;
  right: 30px;
  height: 6px;
  border-radius: 0 0 8px 8px;
  background: #c1ff72;
}
.outils-header { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 16px; color: #000; }
.outils-header h1 { margin: 0; font-size: 24px; font-weight: 800; line-height: 1.1; }
.outils-header p { margin: 4px 0 0; color: #6b7280; font-size: 14px; }
.outils-pill-nav { display: flex; gap: 8px; }
.outils-pill {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  min-height: 42px;
  padding: 0 14px;
  border-radius: 999px;
  background: #000;
  color: #fff;
  font-size: 13px;
  font-weight: 700;
  text-decoration: none;
  transition: transform .15s ease;
}
.outils-pill:hover { transform: translateY(-2px); }
.outils-pill i { font-size: 17px; color: #c1ff72; }
@media (max-width: 640px) {
  .outils-card { padding: 18px; border-radius: 22px; }
  .outils-pill { min-height: 38px; font-size: 12px; padding: 0 11px; }
  .outils-pill span { display: none; }
}
`

