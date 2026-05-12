import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { TOOLBOX_ITEMS, TOOLBOX_CATEGORIES } from '../lib/levelMapping'
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

export default function BoiteAOutils() {
  const navigate = useNavigate()
  const [activeCategory, setActiveCategory] = useState(null)

  const filteredTools = useMemo(() => {
    if (!activeCategory) return TOOLBOX_ITEMS
    return TOOLBOX_ITEMS.filter((tool) => tool.category === activeCategory)
  }, [activeCategory])

  return (
    <div className="p-2 md:p-6">
      <div className="mb-6">
        <h1 className="text-xl md:text-2xl font-semibold mb-1">Boîte à outils</h1>
        <p className="text-gray-500">Vidéos, CV, lettre, mini-jeux et outils d'orientation regroupés par usage.</p>
      </div>

      <div className="flex flex-wrap gap-2 mb-6">
        <button
          onClick={() => setActiveCategory(null)}
          className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
            activeCategory === null
              ? 'bg-black text-white border-black'
              : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
          }`}
        >
          Tous
        </button>
        {TOOLBOX_CATEGORIES.map((cat) => (
          <button
            key={cat}
            onClick={() => setActiveCategory(activeCategory === cat ? null : cat)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
              activeCategory === cat
                ? 'bg-black text-white border-black'
                : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredTools.map((tool) => {
          const Icon = ICON_MAP[tool.icon] || PiWrenchBold
          return (
          <button
            key={tool.id || tool.path}
            onClick={() => navigate(tool.path)}
            className="bg-white border border-gray-200 rounded-lg p-3 text-left hover:shadow-lg hover:border-gray-300 transition-all group"
          >
            <div className="flex items-start gap-3">
              <div className="w-14 h-14 shrink-0 bg-gray-100 rounded-lg flex items-center justify-center group-hover:bg-[#c1ff72] transition-colors">
                <Icon className="w-8 h-8" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-medium text-sm mb-1 truncate">{tool.title}</h3>
                <p className="text-xs text-gray-500 line-clamp-2">{tool.description}</p>
                <span className="inline-block mt-2 text-xs font-medium text-gray-400 bg-gray-50 px-2 py-0.5 rounded-full">
                  {tool.category}
                </span>
              </div>
            </div>
          </button>
          )
        })}
      </div>

      {filteredTools.length === 0 && (
        <div className="text-center py-12 text-gray-400">
          Aucun outil dans cette catégorie.
        </div>
      )}
    </div>
  )
}
