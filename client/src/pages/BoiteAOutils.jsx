import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { usersAPI } from '../lib/api'
import { TOOLBOX_ITEMS, TOOLBOX_CATEGORIES, TOOLBOX_CATEGORY_DETAILS } from '../lib/levelMapping'
import { fetchProgression } from '../lib/progression'
import { PiArrowUpRight, PiCheckCircle, PiToolbox } from 'react-icons/pi'
import { ToolIcon } from '../components/ToolExperience'

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

  return (
    <div className="outils-page">
      <style>{outilsStyles}</style>
      <section className="tool-header outils-header">
        <span className="tool-header-icon"><PiToolbox size={30} aria-hidden="true" /></span>
        <div className="outils-header-copy">
          <p className="tool-eyebrow">À ton rythme</p>
          <h1>Boîte à outils</h1>
          <p className="tool-description">Un quiz, une idée à explorer ou une candidature à préparer ? Choisis ce qui te sera utile aujourd'hui.</p>
        </div>
      </section>

      <nav className="outils-categories" aria-label="Objectifs des outils">
        {groupedTools.map((group) => (
          <a
            key={group.slug}
            href={`#outils-${group.slug}`}
            className="outils-category"
          >
            {group.category}
          </a>
        ))}
      </nav>

      <div className="outils-groups">
        {groupedTools.map((group) => (
          <section key={group.slug} id={`outils-${group.slug}`} className="outils-group" aria-labelledby={`heading-${group.slug}`}>
            <div className="outils-group-head">
              <h2 id={`heading-${group.slug}`}>{group.category}</h2>
              {group.description && <p>{group.description}</p>}
            </div>
            <div className="outils-grid">
              {group.tools.map((tool) => {
                const completed = isToolCompleted(tool, completedQuestIds, completedExtraIds)
                return (
                  <Link
                    key={tool.id || tool.path}
                    to={tool.path}
                    className={`outils-tile${completed ? ' is-completed' : ''}`}
                  >
                    <div className="outils-tile-top">
                      <span className="outils-tile-icon"><ToolIcon name={tool.icon} size={26} /></span>
                      {completed && <span className="outils-completed"><PiCheckCircle aria-hidden="true" />Déjà exploré</span>}
                    </div>
                    <h3>{tool.title}</h3>
                    <p>{tool.description}</p>
                    <span className="outils-tile-action">{completed ? 'Reprendre' : 'Découvrir'}<PiArrowUpRight aria-hidden="true" /></span>
                  </Link>
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
.outils-page { padding-bottom: 28px; }
.outils-categories { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 32px; }
.outils-category { display: inline-flex; align-items: center; min-height: 44px; padding: 9px 16px; border: 1px solid #dfe4d8; border-radius: 999px; background: #fff; color: #46513e; font-size: 13px; font-weight: 700; text-decoration: none; }
.outils-category:hover { color: #111827; border-color: #111827; background: #f0f8e6; }
.outils-groups { display: grid; gap: 34px; }
.outils-group { scroll-margin-top: 20px; }
.outils-group-head { margin-bottom: 16px; }
.outils-group-head h2 { margin: 0; font-size: 22px; font-weight: 800; letter-spacing: -.02em; }
.outils-group-head p { margin: 6px 0 0; color: #566071; font-size: 14px; line-height: 1.5; }
.outils-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 260px), 1fr)); gap: 14px; }
.outils-tile { display: flex; flex-direction: column; min-width: 0; padding: 22px; border: 1px solid #e6e8e2; border-radius: 24px; background: #fff; color: #111827; text-decoration: none; transition: border-color .15s, box-shadow .15s; }
.outils-tile:hover { border-color: #92b76b; color: #111827; box-shadow: 0 12px 26px -22px rgba(0,0,0,.35); }
.outils-tile.is-completed { border-color: #c9dfaF; }
.outils-tile-top { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 18px; }
.outils-tile-icon { display: grid; place-items: center; width: 48px; height: 48px; border-radius: 16px; background: #edf7e2; color: #354d23; }
.outils-group:nth-child(2) .outils-tile-icon { background: #fbeaf8; color: #71436a; }
.outils-group:nth-child(3) .outils-tile-icon { background: #f4eedf; color: #6f5930; }
.outils-completed { display: inline-flex; align-items: center; gap: 4px; color: #4a6535; font-size: 11px; font-weight: 700; }
.outils-tile h3 { margin: 0; font-size: 17px; font-weight: 800; line-height: 1.3; overflow-wrap: anywhere; }
.outils-tile p { margin: 8px 0 20px; color: #566071; font-size: 14px; line-height: 1.5; }
.outils-tile-action { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-top: auto; padding-top: 14px; border-top: 1px solid #edf0e7; color: #334127; font-size: 13px; font-weight: 800; }
@media (max-width: 640px) {
  .outils-tile { padding: 20px; border-radius: 20px; }
  .outils-group-head h2 { font-size: 20px; }
}
`
