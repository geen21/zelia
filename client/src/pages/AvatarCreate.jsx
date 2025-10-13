import React, { useMemo, useState } from 'react'
import axios from 'axios'
import { useNavigate } from 'react-router-dom'

function hexNoHash(hex) { return (hex || '').replace('#','') }
function buildLoreleiUrl(cfg, size) {
	const base = 'https://api.dicebear.com/9.x/lorelei/svg'
	const q = new URLSearchParams()
	q.set('seed', cfg.seed || 'zelia')
	q.set('size', String(size))
	q.set('radius', String(cfg.radius ?? 30))
	if (cfg.bg) {
		q.set('backgroundType', 'solid')
		q.set('backgroundColor', hexNoHash(cfg.bg))
	}
	if (cfg.skin) q.set('skinColor', hexNoHash(cfg.skin))
	if (cfg.hair) q.set('hairColor', hexNoHash(cfg.hair))
	if (cfg.glasses === true) {
		q.set('glasses', 'variant01')
		q.set('glassesProbability', '100')
	} else {
		q.set('glassesProbability', '0')
	}
	return `${base}?${q.toString()}`
}

const BG_COLORS = ['#F2F4F7','#E3F2FD','#FFF7E6','#FDE7E9','#EAF7F0','#F3E8FF','#FFFFFF']
const SKIN_TONES = ['#f9d7b8','#f1c89e','#d9a275','#c68642','#8d5524','#6d3b1f']
const HAIR_COLORS = ['#2f2f2f','#3b2c2a','#6b4423','#a55728','#b58143','#e6c28b']

export default function AvatarCreate() {
	const navigate = useNavigate()
		const [cfg, setCfg] = useState({ seed: 'zelia', bg: '#F2F4F7', skin: '#f7c9a9', hair: '#3b2c2a', glasses: false, radius: 30 })
	const [saving, setSaving] = useState(false)
		const token = localStorage.getItem('supabase_auth_token') || localStorage.getItem('token')
	const url = useMemo(() => buildLoreleiUrl(cfg, 360), [cfg])

	function updateCfg(partial) { setCfg(c => ({ ...c, ...partial })) }
	function randomChoice(a){ return a[Math.floor(Math.random()*a.length)] }
	function randomize(){
		setCfg(c => ({
			...c,
			seed: Math.random().toString(36).slice(2, 10),
			bg: randomChoice(BG_COLORS),
			skin: randomChoice(SKIN_TONES),
			hair: randomChoice(HAIR_COLORS),
			glasses: Math.random() > 0.6
		}))
	}

	async function saveAvatar() {
		setSaving(true)
		const u = buildLoreleiUrl(cfg, 256)
		localStorage.setItem('avatar_cfg', JSON.stringify(cfg))
		localStorage.setItem('avatar_url', u)
		try {
			// Store avatar for pre-registration
			await axios.post('/api/results/avatar/temp', { ...cfg, url: u, provider: 'dicebear/lorelei' })
		} catch (e) {
			console.warn('Failed to store avatar temporarily:', e)
			// Continue anyway since we have localStorage backup
		} finally {
			navigate('/questionnaire')
			setSaving(false)
		}
	}

	return (
		<div className="min-h-screen bg-white text-text-primary flex items-center justify-center px-4">
			<div className="w-full max-w-5xl py-10">
				<div className="mb-6">
					<h1 className="text-2xl font-bold">Crée ton avatar</h1>
					<p className="text-text-secondary">Personnalise ton avatar, il te suivra tout au long de l'expérience.</p>
				</div>
				<div className="grid grid-cols-1 md:grid-cols-12 gap-4">
					<div className="md:col-span-5">
						<div className="bg-surface border border-line rounded-xl shadow-card p-5 sm:p-6 grid place-items-center">
							<img src={url} alt="avatar" className="w-full max-w-[200px] sm:max-w-[260px] md:max-w-[320px] lg:max-w-[360px]" />
						</div>
					</div>
					<div className="md:col-span-7">
						<div className="bg-surface border border-line rounded-xl shadow-card p-6">
							<div className="grid grid-cols-1 md:grid-cols-12 gap-4">
								<div className="md:col-span-6">
									<label className="block text-sm text-text-secondary mb-1">Nom (seed)</label>
									<input className="w-full border border-line rounded-lg px-3 py-2 outline-none" type="text" value={cfg.seed} onChange={e=>updateCfg({seed:e.target.value})} />
								</div>
								<div className="md:col-span-6">
									<label className="block text-sm text-text-secondary mb-1">Rayon</label>
									<input className="w-full" type="range" min="0" max="50" value={cfg.radius} onChange={e=>updateCfg({radius:Number(e.target.value)})} />
								</div>
								<div className="md:col-span-4">
									<label className="block text-sm text-text-secondary mb-1">Fond</label>
									<input className="w-full h-10 p-1 border border-line rounded-lg" type="color" value={cfg.bg} onChange={e=>updateCfg({bg:e.target.value})} />
								</div>
								<div className="md:col-span-4">
									<label className="block text-sm text-text-secondary mb-1">Peau</label>
									<input className="w-full h-10 p-1 border border-line rounded-lg" type="color" value={cfg.skin} onChange={e=>updateCfg({skin:e.target.value})} />
								</div>
								<div className="md:col-span-4">
									<label className="block text-sm text-text-secondary mb-1">Cheveux</label>
									<input className="w-full h-10 p-1 border border-line rounded-lg" type="color" value={cfg.hair} onChange={e=>updateCfg({hair:e.target.value})} />
								</div>
								<div className="md:col-span-6 flex items-center gap-2 mt-2">
									<input id="glasses" type="checkbox" className="h-4 w-4" checked={cfg.glasses} onChange={e=>updateCfg({glasses:e.target.checked})} />
									<label htmlFor="glasses" className="text-sm text-text-secondary">Lunettes</label>
								</div>
							</div>
						</div>
						<div className="flex gap-2 mt-3">
							<button className="h-10 px-4 rounded-lg border border-line" onClick={randomize}>Au hasard</button>
							<button className="h-10 px-4 rounded-lg bg-black text-white" onClick={saveAvatar} disabled={saving}>Enregistrer</button>
						</div>
					</div>
				</div>
			</div>
		</div>
	)
}
