import React, { useEffect, useRef, useState } from 'react'
import { letterAPI, usersAPI } from '../lib/api'

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
			usersAPI.saveExtraInfo([
				{
					question_id: 'lettre_generated',
					question_text: 'Lettre de motivation générée',
					answer_text: JSON.stringify({ target: selected?.label || query || '', type, generatedAt: new Date().toISOString() })
				}
			]).catch(() => null)
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
			<style>{styles}</style>
			<div>
				<h1 className="text-xl md:text-2xl font-bold mb-1">Ta lettre de motivation</h1>
				<p className="text-text-secondary">Générée à partir de ton profil, en quelques secondes.</p>
			</div>

			{/* Form */}
			<div className="lettre-card">
				<div className="lettre-card-bar" />
				<div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
					<div className="md:col-span-2 relative">
						<label className="block text-sm font-semibold text-text-secondary mb-1">Ta cible</label>
						<div className="flex gap-2 mb-2">
							<button className={`lettre-toggle ${type==='metier' ? 'is-active' : ''}`} onClick={() => { setType('metier'); setSelected(null); }}>Métier</button>
							<button className={`lettre-toggle ${type==='formation' ? 'is-active' : ''}`} onClick={() => { setType('formation'); setSelected(null); }}>Formation</button>
						</div>
						<input
							className="lettre-input"
							value={query}
							onChange={e => { setQuery(e.target.value); setSelected(null); }}
							placeholder={type==='metier' ? 'ex: Développeur web' : 'ex: BUT Informatique'}
						/>
						{open && suggestions.length > 0 && (
							<div ref={listRef} className="lettre-suggestions">
								{suggestions.map(item => (
									<div key={`${item.type}-${item.id}`} className="lettre-suggestion" onClick={() => onPick(item)}>
										<div className="text-sm font-semibold">{item.label}</div>
										<div className="text-xs text-text-secondary">{item.type==='metier'?'Métier':'Formation'}</div>
									</div>
								))}
							</div>
						)}
					</div>
					<div>
						<label className="block text-sm font-semibold text-text-secondary mb-1">Ton style</label>
						<select className="lettre-input" value={style} onChange={e => setStyle(e.target.value)}>
							<option value="sobre">Sobre</option>
							<option value="enthousiaste">Enthousiaste</option>
							<option value="professionnel">Professionnel</option>
						</select>
					</div>
					<div>
						<button className="lettre-generate" onClick={generate} disabled={loading || (!selected && !query)}>
							{loading ? 'On génère...' : 'Générer'}
						</button>
					</div>
				</div>
			</div>

			{/* Result */}
			<div className="lettre-card">
				<div className="lettre-card-bar accent-ink" />
				{loading ? (
					<div className="text-center py-6">
						<div className="lettre-dots"><span /><span /><span /></div>
						<p className="mt-3 text-text-secondary">Ta lettre est en train de prendre forme...</p>
					</div>
				) : letter ? (
					<div>
						<h3 className="text-lg font-bold mb-3">Ta lettre de motivation</h3>
						<div className="lettre-result">
							{letter}
						</div>
						<div className="mt-3 flex gap-2">
							<button className="lettre-action-btn" onClick={copyToClipboard}>Copier</button>
							<button className="lettre-action-btn" onClick={downloadPDF}>Télécharger PDF</button>
						</div>
					</div>
				) : (
					<div className="text-center text-text-secondary py-6">
						<div className="text-4xl">📝</div>
						<p className="mt-2">Cherche un métier ou une formation, choisis ton style, puis clique sur Générer pour créer ta lettre de motivation personnalisée.</p>
					</div>
				)}
			</div>
		</div>
	)
}

const styles = `
.lettre-card {
	position: relative;
	background: #fff;
	border: 1px solid rgba(0,0,0,.06);
	border-radius: 24px;
	box-shadow: 0 22px 50px -28px rgba(0,0,0,.2), 0 2px 8px rgba(0,0,0,.04);
	padding: 22px;
}
.lettre-card-bar {
	position: absolute;
	top: 0;
	left: 26px;
	right: 26px;
	height: 5px;
	border-radius: 0 0 6px 6px;
	background: #c1ff72;
}
.lettre-card-bar.accent-ink { background: #111827; }
.lettre-toggle {
	min-height: 38px;
	padding: 0 16px;
	border-radius: 999px;
	border: 1px solid rgba(0,0,0,.12);
	background: #fff;
	color: #000;
	font-weight: 700;
	font-size: 14px;
}
.lettre-toggle.is-active { background: #000; color: #fff; border-color: #000; }
.lettre-input {
	width: 100%;
	min-height: 44px;
	border: 1px solid rgba(0,0,0,.12);
	border-radius: 14px;
	padding: 0 14px;
	outline: none;
	font: inherit;
	font-size: 14px;
	background: #fff;
}
.lettre-input:focus { border-color: #000; }
.lettre-suggestions {
	position: absolute;
	z-index: 10;
	margin-top: 4px;
	width: 100%;
	max-height: 240px;
	overflow: auto;
	border: 1px solid rgba(0,0,0,.1);
	border-radius: 14px;
	background: #fff;
	box-shadow: 0 20px 40px -20px rgba(0,0,0,.25);
}
.lettre-suggestion { padding: 10px 14px; cursor: pointer; }
.lettre-suggestion:hover { background: #f8fff0; }
.lettre-generate {
	width: 100%;
	min-height: 44px;
	border-radius: 999px;
	border: 0;
	background: #000;
	color: #fff;
	font-weight: 800;
	transition: transform .15s ease;
}
.lettre-generate:hover:not(:disabled) { transform: translateY(-2px); }
.lettre-generate:disabled { opacity: .5; }
.lettre-result {
	background: #fffbf7;
	border: 1px solid rgba(0,0,0,.08);
	padding: 16px;
	border-radius: 16px;
	white-space: pre-wrap;
	font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
	font-size: 14px;
	line-height: 1.6;
}
.lettre-action-btn {
	padding: 10px 18px;
	border-radius: 999px;
	border: 1px solid rgba(0,0,0,.12);
	background: #fff;
	color: #000;
	font-weight: 700;
	font-size: 14px;
}
.lettre-action-btn:hover { border-color: #000; }
.lettre-dots { display: inline-flex; gap: 8px; }
.lettre-dots span { width: 10px; height: 10px; border-radius: 999px; background: #111827; animation: lettreBounce 1s ease-in-out infinite; }
.lettre-dots span:nth-child(1) { background: #c1ff72; }
.lettre-dots span:nth-child(2) { background: #f68fff; animation-delay: .15s; }
.lettre-dots span:nth-child(3) { background: #111827; animation-delay: .3s; }
@keyframes lettreBounce {
	0%, 80%, 100% { transform: translateY(0); opacity: .55; }
	40% { transform: translateY(-8px); opacity: 1; }
}
`
