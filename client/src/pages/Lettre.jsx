import React, { useEffect, useRef, useState } from 'react'
import { letterAPI } from '../lib/api'

export default function Lettre(){
	const [type, setType] = useState('metier') // 'metier' | 'formation'
	const [query, setQuery] = useState('')
	const [selected, setSelected] = useState(null) // {id,label,type}
	const [suggestions, setSuggestions] = useState([])
	const [open, setOpen] = useState(false)
	const [style, setStyle] = useState('sobre')
	const [letter, setLetter] = useState('')
	const [loading, setLoading] = useState(false)
	const debounceRef = useRef(null)
	const listRef = useRef(null)

	useEffect(() => {
		if (!query || query.length < 2) {
			setSuggestions([])
			return
		}
		if (debounceRef.current) clearTimeout(debounceRef.current)
		debounceRef.current = setTimeout(async () => {
			try {
				const { data } = await letterAPI.suggest({ q: query, type })
				setSuggestions(data.items || [])
				setOpen(true)
			} catch (e) {
				setSuggestions([])
			}
		}, 250)
		return () => debounceRef.current && clearTimeout(debounceRef.current)
	}, [query, type])

	function onPick(item){
		setSelected(item)
		setQuery(item.label)
		setOpen(false)
	}

	async function generate(){
		setLoading(true)
		setLetter('')
		try {
			const payload = selected ? { selection: selected, style } : { style }
			// backward compatibility if user typed without picking
			if (!selected && query) {
				if (type === 'metier') payload.emploi_selection = query
				else payload.formation_selection = query
			}
			const { data } = await letterAPI.generate(payload)
			setLetter(data.letter)
		} catch (e) {
			setLetter('Erreur de génération. Réessayez.')
		} finally {
			setLoading(false)
		}
	}

	function copyToClipboard(){
		if (!letter) return
		navigator.clipboard?.writeText(letter)
	}

	function downloadPDF(){
		if (!letter) return
		// Simple text-to-pdf fallback using browser print
		const w = window.open('', '_blank')
		w.document.write(`<pre style="white-space: pre-wrap; font-family: serif;">${letter.replace(/</g,'&lt;')}</pre>`) // basic escape
		w.document.close()
		w.focus()
		w.print()
		w.close()
	}

	return (
		<div className="space-y-6">
			<div>
				<h1 className="text-2xl font-bold">Lettre de motivation</h1>
				<p className="text-text-secondary">Générée à partir de votre profil</p>
			</div>

			{/* Form */}
			<div className="bg-surface border border-line rounded-xl shadow-card p-4">
				<div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
					<div className="md:col-span-2 relative">
						<label className="block text-sm text-text-secondary mb-1">Cible</label>
						<div className="flex gap-2 mb-2">
							<button className={`px-3 py-1 rounded border ${type==='metier'?'bg-black text-white':'border-line'}`} onClick={() => { setType('metier'); setSelected(null); }}>Métier</button>
							<button className={`px-3 py-1 rounded border ${type==='formation'?'bg-black text-white':'border-line'}`} onClick={() => { setType('formation'); setSelected(null); }}>Formation</button>
						</div>
						<input
							className="w-full border border-line rounded-lg px-3 py-2 outline-none"
							value={query}
							onChange={e => { setQuery(e.target.value); setSelected(null); }}
							placeholder={type==='metier' ? 'ex: Développeur web' : 'ex: BUT Informatique'}
						/>
						{open && suggestions.length > 0 && (
							<div ref={listRef} className="absolute z-10 mt-1 w-full max-h-60 overflow-auto border border-line rounded-lg bg-white shadow">
								{suggestions.map(item => (
									<div key={`${item.type}-${item.id}`} className="px-3 py-2 hover:bg-gray-50 cursor-pointer" onClick={() => onPick(item)}>
										<div className="text-sm">{item.label}</div>
										<div className="text-xs text-text-secondary">{item.type==='metier'?'Métier':'Formation'}</div>
									</div>
								))}
							</div>
						)}
					</div>
					<div>
						<label className="block text-sm text-text-secondary mb-1">Style</label>
						<select className="w-full border border-line rounded-lg px-3 py-2 outline-none" value={style} onChange={e => setStyle(e.target.value)}>
							<option value="sobre">Sobre</option>
							<option value="enthousiaste">Enthousiaste</option>
							<option value="professionnel">Professionnel</option>
						</select>
					</div>
					<div>
						<button className="w-full bg-black text-white rounded-lg h-10 disabled:opacity-50" onClick={generate} disabled={loading || (!selected && !query)}>
							{loading ? 'Génération...' : 'Générer'}
						</button>
					</div>
				</div>
			</div>

			{/* Result */}
			<div className="bg-surface border border-line rounded-xl shadow-card p-4">
				{loading ? (
					<div className="text-center">
						<div className="inline-block w-6 h-6 border-2 border-black border-t-transparent rounded-full animate-spin"></div>
						<p className="mt-2 text-text-secondary">Génération en cours...</p>
					</div>
				) : letter ? (
					<div>
						<h3 className="text-lg font-semibold mb-3">Votre lettre de motivation</h3>
						<div className="bg-gray-50 border border-line p-3 rounded-lg whitespace-pre-wrap font-mono">
							{letter}
						</div>
						<div className="mt-3 flex gap-2">
							<button className="px-3 py-2 border border-line rounded-lg" onClick={copyToClipboard}>Copier</button>
							<button className="px-3 py-2 border border-line rounded-lg" onClick={downloadPDF}>Télécharger PDF</button>
						</div>
					</div>
				) : (
					<div className="text-center text-text-secondary">
						<div className="text-4xl">📝</div>
						<p className="mt-2">Recherchez un métier ou une formation, choisissez le style, puis cliquez sur Générer pour créer votre lettre de motivation personnalisée.</p>
					</div>
				)}
			</div>
		</div>
	)
}
