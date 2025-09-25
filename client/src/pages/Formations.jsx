import React, { useEffect, useState } from 'react'
import axios from 'axios'

export default function Formations(){
	const [q, setQ] = useState('')
	const [region, setRegion] = useState('')
	const [departement, setDepartement] = useState('')
	const [page, setPage] = useState(1)
	const [items, setItems] = useState([])
	const [total, setTotal] = useState(0)
	const [selected, setSelected] = useState([])
	const [openMenuId, setOpenMenuId] = useState(null)
	const [loading, setLoading] = useState(false)
	const [recommendedOnly, setRecommendedOnly] = useState(false)
	// page size derived from toggle; no separate state needed
	const [studyRecs, setStudyRecs] = useState(null) // [{type, degree}]
	const [recoLoading, setRecoLoading] = useState(false)
	const authToken = localStorage.getItem('token') || localStorage.getItem('supabase_auth_token')

	const sanitizeValue = (v) => {
		if (v === null || v === undefined) return undefined
		const s = String(v).trim()
		if (!s) return undefined
		const lower = s.toLowerCase()
		if (lower === 'nan' || lower === 'null' || lower === 'undefined') return undefined
		return s
	}

	async function load(p = page){
		setLoading(true)
		try{
			const effectivePageSize = recommendedOnly ? 50 : 20
			const { data } = await axios.get('/api/catalog/formations/search', {
				params: { q, region: region || undefined, departement: departement || undefined, page: p, page_size: effectivePageSize },
				headers: authToken ? { Authorization: `Bearer ${authToken}` } : {}
			})
			setItems(data.items)
			setTotal(data.total)
			setPage(p)
			setSelected([])
			setOpenMenuId(null)
		} finally {
			setLoading(false)
		}
	}

// Load data on toggle state; ensure recommendations available first
useEffect(() => {
		let cancelled = false
		const run = async () => {
			if (recommendedOnly) {
				await ensureStudyRecommendations()
			}
			if (!cancelled) {
				await load(1)
			}
		}
		run()
		return () => { cancelled = true }
}, [recommendedOnly])

	const allChecked = items.length>0 && selected.length === items.length
	const toggleAll = () => setSelected(allChecked ? [] : items.map(it=>it.id))
	const toggleOne = (id) => setSelected(prev => prev.includes(id) ? prev.filter(x=>x!==id) : [...prev, id])

	// Fetch current user's study recommendations
	async function ensureStudyRecommendations(){
		if (studyRecs || !authToken) return
		setRecoLoading(true)
		try{
			const { data } = await axios.get('/api/analysis/my-results', {
				headers: { Authorization: `Bearer ${authToken}` }
			})
			const recs = data?.results?.studyRecommendations
			if (Array.isArray(recs)) setStudyRecs(recs)
		} catch(err) {
			// ignore
		} finally {
			setRecoLoading(false)
		}
	}

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

	const jaccard = (aStr, bStr) => {
		const a = new Set(normalize(aStr).split(' ').filter(Boolean))
		const b = new Set(normalize(bStr).split(' ').filter(Boolean))
		if (a.size===0 || b.size===0) return 0
		let inter = 0
		a.forEach(t=>{ if (b.has(t)) inter++ })
		return inter / (a.size + b.size - inter)
	}

	const scoreFormation = (it) => {
		if (!Array.isArray(studyRecs) || studyRecs.length===0) return 0
		const nmArr = Array.isArray(it.nm) ? it.nm : []
		const nmText = nmArr.find(x=>x) || ''
		let best = 0
		for (const rec of studyRecs){
			const s1 = jaccard(nmText, rec.type)
			const s2 = jaccard(nmText, rec.degree)
			const score = Math.max(s1, s2)
			if (score>best) best = score
		}
		return best
	}

	// Client-side sort and optional recommendations filter
	const sortedItems = React.useMemo(()=>{
		let base = [...items]
		if (recommendedOnly && !recoLoading && Array.isArray(studyRecs) && studyRecs.length>0){
			base = base
				.map(it=>({it, score: scoreFormation(it)}))
				.filter(x=>x.score>=0.2)
				.sort((a,b)=>b.score-a.score)
				.map(x=>x.it)
		}
		return base.sort((a,b)=>{
			const aNm = Array.isArray(a.nm) ? a.nm.find(x=>x) : undefined
			const bNm = Array.isArray(b.nm) ? b.nm.find(x=>x) : undefined
			const aW = aNm ? 0 : 1
			const bW = bNm ? 0 : 1
			if (aW !== bW) return aW - bW
			return (b.id||0) - (a.id||0)
		})
	}, [items, recommendedOnly, studyRecs])

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
				<h1 className="text-2xl font-bold">Formations</h1>
				<p className="text-text-secondary">Explorez les formations en France</p>
			</div>

			{/* Filters */}
			<div className="bg-surface border border-line rounded-xl shadow-card p-3">
				{/* 4 equal columns on md+; consistent heights (h-11) for inputs/selects/buttons */}
				<div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
					<div>
						<label className="block text-xs text-text-secondary mb-1">Recherche</label>
						<div className="flex items-center gap-2 border border-line rounded-lg h-11 px-3 transition-none focus-within:ring-0 focus-within:outline-none focus-within:shadow-none">
							<i className="ph ph-magnifying-glass text-text-secondary"></i>
							<input className="w-full text-sm bg-transparent outline-none border-0 ring-0 focus:outline-none focus:ring-0 focus:border-transparent appearance-none transition-none shadow-none focus:shadow-none no-outline" value={q} onChange={e=>setQ(e.target.value)} placeholder="Nom, code, ville..." />
						</div>
					</div>
					<div>
						<label className="block text-xs text-text-secondary mb-1">Région</label>
						<input className="w-full border border-line rounded-lg h-11 px-3 outline-none text-sm focus:outline-none focus:ring-0 focus:shadow-none transition-none no-outline" value={region} onChange={e=>setRegion(e.target.value)} placeholder="ex: Île-de-France" />
					</div>
					<div>
						<label className="block text-xs text-text-secondary mb-1">Département</label>
						<input className="w-full border border-line rounded-lg h-11 px-3 outline-none text-sm focus:outline-none focus:ring-0 focus:shadow-none transition-none no-outline" value={departement} onChange={e=>setDepartement(e.target.value)} placeholder="ex: Paris" />
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
							{loading ? (<span className="inline-flex items-center gap-2"><i className="ph ph-circle-notch animate-spin"></i>Chargement...</span>) : 'Filtrer'}
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
								<th className="text-left font-medium px-4 py-3">Image</th>
								<th className="text-left font-medium px-4 py-3">Intitulé (nm)</th>
								<th className="text-left font-medium px-4 py-3">Établissement</th>
								<th className="text-left font-medium px-4 py-3">Département</th>
								<th className="text-left font-medium px-4 py-3">Lien</th>
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
							{sortedItems.map(it => {
								// nm is an array; pick only the first non-null entry and ignore the unwanted specific value
								const nmList = Array.isArray(it.nm) ? it.nm.filter(x => x && x !== 'BUT - Génie biologique parcours sciences de l\'aliment et biotechnologie') : []
								const nmText = nmList.length ? nmList[0] : 'Intitulé non renseigné'
								return (
								<tr key={it.id} className="border-b border-line hover:bg-gray-50">
									<td className="px-4 py-3 align-middle"><input type="checkbox" checked={selected.includes(it.id)} onChange={()=>toggleOne(it.id)} /></td>
									<td className="px-4 py-3">
										<img src={it.image || "/static/images/logo-dark.png"} alt="logo" className="w-10 h-10 object-contain rounded bg-white" onError={(e)=>{ e.currentTarget.onerror=null; e.currentTarget.src='/static/images/logo-dark.png' }} />
									</td>
									<td className="px-4 py-3 text-text-primary">{nmText}</td>
									<td className="px-4 py-3">{sanitizeValue(it.etab_nom) || 'Établissement non renseigné'}</td>
									<td className="px-4 py-3">{sanitizeValue(it.departement) || 'Département non renseigné'}</td>
									<td className="px-4 py-3">
										{it.etab_url ? (
											<a href={it.etab_url} target="_blank" className="inline-flex items-center px-3 py-1.5 border border-line rounded-lg text-sm hover:bg-gray-50">Voir</a>
										) : 'Lien non disponible'}
									</td>
									<td className="px-4 py-3 text-right relative">
										<button className="p-2 rounded hover:bg-gray-100" aria-label="Actions" onClick={()=> setOpenMenuId(openMenuId===it.id?null:it.id)}>
											<i className="ph ph-dots-three-vertical"></i>
										</button>
										{openMenuId===it.id && (
											<div className="absolute right-2 mt-2 w-56 bg-white border border-line rounded-lg shadow-lg z-10">
												<ul className="py-1 text-sm">
													{it.facebook && (
														<li>
															<a href={it.facebook} target="_blank" className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50">
																<i className="ph ph-facebook-logo"></i>
																<span>Facebook</span>
															</a>
														</li>
													)}
													{it.linkedin && (
														<li>
															<a href={it.linkedin} target="_blank" className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50">
																<i className="ph ph-linkedin-logo"></i>
																<span>LinkedIn</span>
															</a>
														</li>
													)}
													{it.youtube && (
														<li>
															<a href={it.youtube} target="_blank" className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50">
																<i className="ph ph-youtube-logo"></i>
																<span>YouTube</span>
															</a>
														</li>
													)}
													{it.email && (
														<li>
															<a href={`mailto:${it.email}`} className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50">
																<i className="ph ph-envelope"></i>
																<span>Envoyer un mail</span>
															</a>
														</li>
													)}
													{it.telephone && (
														<li>
															<a href={`tel:${it.telephone}`} className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50">
																<i className="ph ph-phone"></i>
																<span>Appeler</span>
															</a>
														</li>
													)}
												</ul>
											</div>
										)}
									</td>
								</tr>
								)
							})}
							{items.length===0 && (
								<tr>
									<td className="px-4 py-8 text-center text-text-secondary" colSpan={7}>Aucun résultat</td>
								</tr>
							)}
						</tbody>
					</table>
				</div>
			</div>

			{/* Pagination */}
			<div className="flex items-center justify-between">
				<span className="text-text-secondary text-sm">{sortedItems.length} / {total} résultats{recommendedOnly ? ' (recommandés)' : ''}</span>
				<div className="flex gap-2">
					<button className="px-3 py-2 border border-line rounded-lg disabled:opacity-50" disabled={page<=1} onClick={()=>load(page-1)}>Précédent</button>
					<button className="px-3 py-2 bg-black text-white rounded-lg disabled:opacity-50" disabled={(page*(recommendedOnly?50:20))>=total} onClick={()=>load(page+1)}>Suivant</button>
				</div>
			</div>
		</div>
	)
}
