import React, { useEffect, useState, useMemo } from 'react'
import axios from 'axios'
import { jwtDecode } from 'jwt-decode'

export default function Emplois(){
	const [q, setQ] = useState('')
	const [typecontrat, setTypecontrat] = useState('')
	const [alternance, setAlternance] = useState('')
	const [page, setPage] = useState(1)
	const [items, setItems] = useState([])
	const [total, setTotal] = useState(0)
	const [hasMore, setHasMore] = useState(true)
	const [selected, setSelected] = useState([]) // stores row unique keys
	const [openMenuId, setOpenMenuId] = useState(null) // stores row unique key
	const [mapPoint, setMapPoint] = useState(null) // { lat: number, lon: number, title }
	const [loading, setLoading] = useState(false)
	const [recommendedOnly, setRecommendedOnly] = useState(false)
	// page size derived from toggle; no separate state needed
	const [jobRecs, setJobRecs] = useState(null) // [{title, skills:[]}, ...]
	const [recoLoading, setRecoLoading] = useState(false)
	const authToken = localStorage.getItem('token') || localStorage.getItem('supabase_auth_token')

    // Debounce search
    useEffect(() => {
        const timer = setTimeout(() => {
            load(1)
        }, 600)
        return () => clearTimeout(timer)
    }, [q, typecontrat, alternance])

	// Align with Results.jsx: derive the user ID from the token (no auth header needed for GET /api/analysis/results/:userId)
	const getUserId = () => {
		const token = localStorage.getItem('supabase_auth_token') || localStorage.getItem('token')
		if (!token) return null
		try {
			const decoded = jwtDecode(token)
			return decoded.sub || decoded.user_id || decoded.id || null
		} catch (e) {
			return null
		}
	}

	// Helpers
	const sanitizeValue = (v) => {
		if (v === null || v === undefined) return undefined
		const s = String(v).trim()
		if (!s) return undefined
		const lower = s.toLowerCase()
		if (lower === 'nan' || lower === 'null' || lower === 'undefined') return undefined
		return s
	}

	const getRowKey = (it, idx) => {
		const urlOrigine = sanitizeValue(it.origine_offre_url_origine ?? it.origineoffre_urlorigine)
		const urlPostulation = sanitizeValue(it.contact_url_postulation ?? it.contact_urlpostulation)
		const rome = sanitizeValue(it.romecode)
		const id = sanitizeValue(it.id) ?? `row-${idx}`
		const base = [id, urlOrigine, urlPostulation, rome].filter(Boolean).join('|')
		return base || `row-${idx}`
	}

	async function load(p = page){
		const effectivePageSize = recommendedOnly ? 50 : 20
		// Avoid sending empty filters; some backends treat empty strings awkwardly
		const params = { page: p, page_size: effectivePageSize }
        if (q) params.search = q
		if (typecontrat) params.typecontrat = typecontrat
		if (alternance) params.alternance = alternance === 'true'
		setLoading(true)
		try {
			const { data } = await axios.get('/api/catalog/metiers/search', {
				params,
				headers: authToken ? { Authorization: `Bearer ${authToken}` } : {}
			})
			setItems(data.items)
			setHasMore(!!data.has_more)
			if (typeof data.total === 'number') setTotal(data.total)
			setPage(p)
			setSelected([])
			setOpenMenuId(null)
		} finally {
			setLoading(false)
		}
	}

	// Fetch current user's recommendations (jobs)
	async function ensureJobRecommendations(){
		if (jobRecs) return
		const userId = getUserId()
		if (!userId) return
		setRecoLoading(true)
		try{
			// Use the same public endpoint as Results.jsx to avoid 403 from /my-results
			const { data } = await axios.get(`/api/analysis/results/${userId}`)
			const recs = data?.results?.jobRecommendations
			if (Array.isArray(recs)) setJobRecs(recs)
		} catch(err) {
			// silently ignore if results not available yet (404)
		} finally {
			setRecoLoading(false)
		}
	}

	// Text normalization utility
	const normalize = (s) => {
		if (!s) return ''
		return String(s)
			.toLowerCase()
			.normalize('NFD')
			.replace(/\p{Diacritic}+/gu,'')
			.replace(/[^a-z0-9\s]/g,' ')
			.replace(/\s+/g,' ')
			.trim()
	}

	// Naive tokenizer with simple plural trimming (helps "techniques" ~ "technique")
	const tokens = (s) => {
		const base = normalize(s)
		if (!base) return []
		return base
			.split(' ')
			.filter(Boolean)
			.map(t => t.endsWith('s') ? t.slice(0, -1) : t)
	}

	// Token set Jaccard similarity
	const jaccard = (aStr, bStr) => {
		const a = new Set(tokens(aStr))
		const b = new Set(tokens(bStr))
		if (a.size===0 || b.size===0) return 0
		let inter = 0
		a.forEach(t=>{ if (b.has(t)) inter++ })
		return inter / (a.size + b.size - inter)
	}

	// Score a job item against recommendations
	const scoreJobItem = (it) => {
		if (!Array.isArray(jobRecs) || jobRecs.length===0) return 0
		const title = sanitizeValue(it.intitule)
		const rome = sanitizeValue(it.romecode)
		const baseText = [title, rome].filter(Boolean).join(' ')
		let best = 0
		for (const rec of jobRecs){
			const titleSim = jaccard(baseText, rec.title)
			let skillsBoost = 0
			if (Array.isArray(rec.skills)){
				for (const sk of rec.skills){
					const s = jaccard(baseText, sk)
					// weight each skill lightly
					skillsBoost = Math.max(skillsBoost, s)
				}
			}
			const score = titleSim*0.8 + skillsBoost*0.2
			if (score>best) best = score
		}
		return best
	}

    const clientSideFilteredItems = items;

// Load data based on toggle state; ensures recommendations are fetched first when needed
useEffect(() => {
		let cancelled = false
		const run = async () => {
			if (recommendedOnly) {
				await ensureJobRecommendations()
			}
			if (!cancelled) {
				await load(1)
			}
		}
		run()
		return () => { cancelled = true }
}, [recommendedOnly])

	const allChecked = items.length>0 && selected.length === items.length
	const toggleAll = () => {
		setSelected(allChecked ? [] : items.map((it, idx)=>getRowKey(it, idx)))
	}
	const toggleOne = (rowKey) => {
		setSelected(prev => prev.includes(rowKey) ? prev.filter(x=>x!==rowKey) : [...prev, rowKey])
	}

	// Compute filtered view when recommendedOnly is enabled
	const displayItems = React.useMemo(()=>{
		if (!recommendedOnly || recoLoading || !Array.isArray(jobRecs) || jobRecs.length===0) return clientSideFilteredItems
		return clientSideFilteredItems
			.map(it=>({ it, score: scoreJobItem(it) }))
			.filter(x=>x.score >= 0.1)
			.sort((a,b)=>b.score-a.score)
			.map(x=>x.it)
	}, [clientSideFilteredItems, recommendedOnly, jobRecs, recoLoading, scoreJobItem])

	const onToggleRecommended = () => {
		setRecommendedOnly(prev => !prev)
	}

	return (
		<div className="space-y-6">
			<style>{`
			@keyframes wandTwinkle { 0%, 100% { transform: rotate(0deg) scale(1); opacity: 1 } 50% { transform: rotate(-8deg) scale(1.05); opacity: .9 } }
			.wand-twinkle { animation: wandTwinkle 2.2s ease-in-out infinite; transform-origin: 50% 60%; }

			/* Remove any input focus outlines/rings/transition animations */
			.no-outline, .no-outline:focus, .no-outline:focus-visible { outline: none !important; box-shadow: none !important; transition: none !important; }
			.no-outline::-moz-focus-inner { border: 0 !important; }
			.no-outline::-webkit-search-decoration,
			.no-outline::-webkit-search-cancel-button,
			.no-outline::-webkit-search-results-button,
			.no-outline::-webkit-search-results-decoration { display: none !important; }
			`}</style>
			<div>
				<h1 className="text-2xl font-bold">Métiers</h1>
				<p className="text-text-secondary">Offres et fiches métiers</p>
			</div>

			{/* Filters */}
			<div className="bg-surface border border-line rounded-xl shadow-card p-3">
				{/* 4 equal columns on md+; consistent heights (h-11) for inputs/selects/buttons */}
				<div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
					<div>
						<label className="block text-xs text-text-secondary mb-1">Recherche</label>
						<div className="flex items-center gap-2 border border-line rounded-lg h-11 px-3 transition-none focus-within:ring-0 focus-within:outline-none focus-within:shadow-none">
							<i className="ph ph-magnifying-glass text-text-secondary"></i>
							<input className="w-full text-sm bg-transparent outline-none border-0 ring-0 focus:outline-none focus:ring-0 focus:border-transparent appearance-none transition-none shadow-none focus:shadow-none no-outline" value={q} onChange={e=>setQ(e.target.value)} placeholder="Intitulé, secteur, code ROME..." />
						</div>
					</div>
					<div>
						<label className="block text-xs text-text-secondary mb-1">Type de contrat</label>
						<input className="w-full border border-line rounded-lg h-11 px-3 outline-none text-sm focus:outline-none focus:ring-0 focus:shadow-none transition-none no-outline" value={typecontrat} onChange={e=>setTypecontrat(e.target.value)} placeholder="ex: CDI" />
					</div>
					<div>
						<label className="block text-xs text-text-secondary mb-1">Alternance</label>
						<select className="w-full border border-line rounded-lg h-11 px-3 outline-none text-sm bg-white focus:outline-none focus:ring-0 focus:shadow-none transition-none no-outline" value={alternance} onChange={e=>setAlternance(e.target.value)}>
							<option value="">Tous</option>
							<option value="true">Oui</option>
							<option value="false">Non</option>
						</select>
					</div>
					<div className="flex justify-end gap-2">
						<button
							className={`inline-flex items-center justify-center h-11 px-3 rounded-lg text-sm border ${recommendedOnly ? 'bg-orange-600 text-white border-orange-700' : 'border-line text-text-primary hover:bg-gray-50'}`}
							onClick={onToggleRecommended}
							disabled={loading || recoLoading}
							title="Filtrer par recommandations"
						>
							{recoLoading ? <i className="ph ph-circle-notch animate-spin"></i> : <i className="ph ph-magic-wand wand-twinkle"></i>}
						</button>
						<button className="inline-flex items-center justify-center h-11 px-4 bg-black text-white rounded-lg text-sm disabled:opacity-60" disabled={loading} onClick={()=>load(1)}>
							{loading ? (<span className="inline-flex items-center gap-2"><i className="ph ph-circle-notch animate-spin"></i>Chargement...</span>) : 'Rechercher'}
						</button>
					</div>
				</div>
			</div>

			{/* Table */}
			<div className="bg-surface border border-line rounded-xl shadow-card overflow-hidden">
				<div className="overflow-x-auto">
					<table className="min-w-full text-sm">
						<thead className="bg-gray-50 border-b border-line text-text-secondary">
							<tr>
								<th className="w-10 px-4 py-3"><input type="checkbox" checked={allChecked} onChange={toggleAll} /></th>
								<th className="text-left font-medium px-4 py-3">Logo</th>
								<th className="text-left font-medium px-4 py-3">Intitulé</th>
								<th className="text-left font-medium px-4 py-3">Contrat</th>
								<th className="text-left font-medium px-4 py-3">Lieu</th>
								<th className="text-left font-medium px-4 py-3">Entreprise</th>
								<th className="text-right font-medium px-4 py-3">Actions</th>
							</tr>
						</thead>
							<tbody>
								{loading && (
									<tr>
										<td colSpan={7} className="px-4 py-6 text-center text-text-secondary">
											<span className="inline-flex items-center gap-2 text-sm"><i className="ph ph-circle-notch animate-spin"></i>Chargement des résultats…</span>
										</td>
									</tr>
								)}
								{displayItems.map((it, idx) => {
									// Data mapping with sanitation and fallbacks
									const logo = sanitizeValue(it.entreprise_logo)
									const typecontratVal = it.type_contrat || it.typecontrat
									const lieu = it.lieu_travail_libelle || it.lieutravail_libelle || it.lieu
									const entreprise = it.entreprise_nom || it.entreprise
									const urlOrigine = sanitizeValue(it.origine_offre_url_origine || it.origineoffre_urlorigine)
									const urlPostulation = sanitizeValue(it.contact_url_postulation || it.contact_urlpostulation)
									const latRaw = sanitizeValue(it.lieu_travail_latitude ?? it.lieutravail_latitude)
									const lonRaw = sanitizeValue(it.lieu_travail_longitude ?? it.lieutravail_longitude)
									const latNum = latRaw !== undefined ? parseFloat(latRaw) : undefined
									const lonNum = lonRaw !== undefined ? parseFloat(lonRaw) : undefined
									const hasCoords = Number.isFinite(latNum) && Number.isFinite(lonNum)

									const rowKey = getRowKey(it, idx)
									return (
									<tr key={rowKey} className="border-b border-line hover:bg-gray-50">
										<td className="px-4 py-3 align-middle"><input type="checkbox" checked={selected.includes(rowKey)} onChange={()=>toggleOne(rowKey)} /></td>
										<td className="px-4 py-3">
											<img src={logo || "/static/images/logo-dark.png"} alt="logo" className="w-10 h-10 object-contain rounded bg-white" onError={(e)=>{ e.currentTarget.onerror=null; e.currentTarget.src='/static/images/logo-dark.png' }} />
										</td>
										<td className="px-4 py-3 text-text-primary">{sanitizeValue(it.intitule) || 'Intitulé non renseigné'}</td>
										<td className="px-4 py-3">{typecontratVal ? <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs bg-gray-100 text-gray-700"><i className="ph ph-file-text"></i>{typecontratVal}</span> : '-'}</td>
										<td className="px-4 py-3">{(sanitizeValue(lieu)) || 'Lieu non renseigné'}</td>
										<td className="px-4 py-3">
											<span className="inline-flex items-center gap-2">
												<i className="ph ph-buildings text-text-secondary"></i>
												<span>{(sanitizeValue(entreprise)) || "Pas de nom d'entreprise"}</span>
											</span>
										</td>
										<td className="px-4 py-3 text-right relative">
											<button className="p-2 rounded hover:bg-gray-100" aria-label="Actions" onClick={()=> setOpenMenuId(openMenuId===rowKey?null:rowKey)}>
												<i className="ph ph-dots-three-vertical"></i>
											</button>
											{openMenuId===rowKey && (
												<div className="absolute right-2 mt-2 w-64 bg-white border border-line rounded-lg shadow-lg z-10">
													<ul className="py-1 text-sm">
														{urlOrigine && (
															<li>
																<a href={urlOrigine} target="_blank" className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50">
																	<i className="ph ph-arrow-up-right"></i>
																	<span>Postuler (site d'origine)</span>
																</a>
															</li>
														)}
														{urlPostulation && (
															<li>
																<a href={urlPostulation} target="_blank" className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50">
																	<i className="ph ph-paper-plane-tilt"></i>
																	<span>Contacter</span>
																</a>
															</li>
														)}
														{hasCoords && (
															<li>
																<button className="w-full text-left flex items-center gap-2 px-3 py-2 hover:bg-gray-50" onClick={()=> setMapPoint({ lat: latNum, lon: lonNum, title: it.intitule || entreprise || 'Localisation' })}>
																	<i className="ph ph-map-pin"></i>
																	<span>Voir sur la carte</span>
																</button>
															</li>
														)}
													</ul>
												</div>
											)}
										</td>
									</tr>
									)
								})}
							{displayItems.length===0 && !loading && (
								<tr>
										<td className="px-4 py-8 text-center text-text-secondary" colSpan={7}>Aucun résultat</td>
								</tr>
							)}
						</tbody>
					</table>
				</div>
			</div>

		{/* Map Modal */}
		{mapPoint && (
			<div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={()=>setMapPoint(null)}>
				<div className="bg-white rounded-xl shadow-xl w-[90vw] max-w-2xl overflow-hidden" onClick={e=>e.stopPropagation()}>
					<div className="flex items-center justify-between px-4 py-3 border-b border-line">
						<h3 className="font-semibold text-text-primary">{mapPoint.title}</h3>
						<button className="p-2 hover:bg-gray-100 rounded" onClick={()=>setMapPoint(null)} aria-label="Fermer">
							<i className="ph ph-x"></i>
						</button>
					</div>
					<div className="p-0">
						<iframe
							title="map"
							className="w-full h-[60vh]"
							src={`https://www.openstreetmap.org/export/embed.html?bbox=${Number(mapPoint.lon)-0.05}%2C${Number(mapPoint.lat)-0.05}%2C${Number(mapPoint.lon)+0.05}%2C${Number(mapPoint.lat)+0.05}&layer=mapnik&marker=${mapPoint.lat}%2C${mapPoint.lon}`}
							style={{ border: 0 }}
							allowFullScreen
						></iframe>
						<div className="p-3 text-right">
							<a className="inline-flex items-center gap-2 px-3 py-2 border border-line rounded-lg text-sm hover:bg-gray-50" target="_blank" href={`https://www.openstreetmap.org/?mlat=${mapPoint.lat}&mlon=${mapPoint.lon}#map=12/${mapPoint.lat}/${mapPoint.lon}`}>
								<i className="ph ph-arrow-up-right"></i>
								<span>Ouvrir dans OpenStreetMap</span>
							</a>
						</div>
					</div>
				</div>
			</div>
		)}

			{/* Pagination */}
			<div className="flex items-center justify-between">
				<span className="text-text-secondary text-sm">{displayItems.length} résultats{recommendedOnly ? ' (recommandés)' : ''}</span>
				<div className="flex gap-2">
					<button className="px-3 py-2 border border-line rounded-lg disabled:opacity-50" disabled={page<=1} onClick={()=>load(page-1)}>Précédent</button>
					<button className="px-3 py-2 bg-black text-white rounded-lg disabled:opacity-50" disabled={!hasMore} onClick={()=>load(page+1)}>Suivant</button>
				</div>
			</div>
		</div>
	)
}
