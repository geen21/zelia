import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import apiClient, { usersAPI, chatAPI, progressionAPI } from '../../lib/api'
import { supabase } from '../../lib/supabase'

// Helper: build avatar URL from profile preferences, preferring explicit avatar_url
function buildAvatarFromProfile(profile, seed = 'zelia') {
	try {
		// 1) Explicit URL chosen by the user
		if (profile?.avatar_url && typeof profile.avatar_url === 'string') {
			return profile.avatar_url
		}
		if (profile?.avatar && typeof profile.avatar === 'string') {
			return profile.avatar
		}
		if (profile?.avatar_json) {
			let conf = profile.avatar_json
			if (typeof conf === 'string') {
				try { conf = JSON.parse(conf) } catch {}
			}
			if (conf && typeof conf === 'object') {
				// If avatar_json already stores a full URL, use it directly
				if (conf.url && typeof conf.url === 'string') {
					try {
						const u = new URL(conf.url)
						if (!u.searchParams.has('seed')) u.searchParams.set('seed', String(seed))
						if (!u.searchParams.has('size')) u.searchParams.set('size', '300')
						return u.toString()
					} catch {}
				}
				// Otherwise build from parameters
				const params = new URLSearchParams()
				params.set('seed', String(seed))
				Object.entries(conf).forEach(([k, v]) => {
					if (v !== undefined && v !== null && v !== '') params.set(k, String(v))
				})
				if (!params.has('size')) params.set('size', '300')
				return `https://api.dicebear.com/9.x/lorelei/svg?${params.toString()}`
			}
		}
	} catch {}
	// Fallback dicebear
	const p = new URLSearchParams({ seed: String(seed), size: '300', radius: '15' })
	return `https://api.dicebear.com/9.x/lorelei/svg?${p.toString()}`
}

// Typewriter hook for a single message
function useTypewriter(message, durationMs) {
	const [text, setText] = useState('')
	const [done, setDone] = useState(false)
	const intervalRef = useRef(null)
	const timeoutRef = useRef(null)

	useEffect(() => {
		const full = message || ''
		setText('')
		setDone(false)
		let i = 0
		const step = Math.max(15, Math.floor((durationMs || 1500) / Math.max(1, full.length)))
		intervalRef.current = setInterval(() => {
			i++
			setText(full.slice(0, i))
			if (i >= full.length) {
				clearInterval(intervalRef.current)
			}
		}, step)
		timeoutRef.current = setTimeout(() => {
			clearInterval(intervalRef.current)
			setText(full)
			setDone(true)
		}, Math.max(durationMs || 1500, (full.length + 1) * step))
		return () => {
			if (intervalRef.current) clearInterval(intervalRef.current)
			if (timeoutRef.current) clearTimeout(timeoutRef.current)
		}
	}, [message, durationMs])

	const skip = () => {
		if (intervalRef.current) clearInterval(intervalRef.current)
		if (timeoutRef.current) clearTimeout(timeoutRef.current)
		setText(message || '')
		setDone(true)
	}

	return { text, done, skip }
}

export default function Niveau1() {
	const navigate = useNavigate()
	const [profile, setProfile] = useState(null)
	const [baseAvatarUrl, setBaseAvatarUrl] = useState('')
	const [analysis, setAnalysis] = useState(null)
	const [loading, setLoading] = useState(true)
	const [error, setError] = useState('')

	// Flow states
	const [phase, setPhase] = useState('intro') // intro -> ask_fit -> await_input -> generating -> fiche -> post_fiche -> conversation -> success
	const [userInput, setUserInput] = useState('')
	const [ficheText, setFicheText] = useState('')
	const [busy, setBusy] = useState(false)
	const [postIdx, setPostIdx] = useState(0)
	const [postAnswers, setPostAnswers] = useState({})
	const [convIdx, setConvIdx] = useState(0)
	const [convAnswers, setConvAnswers] = useState({})
	const [showSuccess, setShowSuccess] = useState(false)
	const [ficheCount, setFicheCount] = useState(0)
	// Control flow for second fiche: skip post-fiche discussion and resume conversation
	const [skipPostFiche, setSkipPostFiche] = useState(false)
	const [resumeConvIdx, setResumeConvIdx] = useState(null)

	// Avatar mouth animation & helpers
	const [mouthAlt, setMouthAlt] = useState(false)
	const [typingActive, setTypingActive] = useState(false)
	function modifyDicebearUrl(urlStr, params = {}) {
		try {
			const u = new URL(urlStr)
			const isDice = /api\.dicebear\.com/.test(u.host) && /\/lorelei\/svg/.test(u.pathname)
			if (!isDice) return urlStr
			Object.entries(params).forEach(([k, v]) => {
				if (v === null || v === undefined || v === '') u.searchParams.delete(k)
				else u.searchParams.set(k, String(v))
			})
			if (!u.searchParams.has('size')) u.searchParams.set('size', '300')
			return u.toString()
		} catch { return urlStr }
	}

	// Load profile + results
	useEffect(() => {
		let mounted = true
		;(async () => {
			try {
				const { data: { user } } = await supabase.auth.getUser()
				if (!user) { navigate('/login'); return }

				const [pRes, rRes] = await Promise.all([
					usersAPI.getProfile().catch(() => null),
					apiClient.get('/analysis/my-results', { headers: { 'Cache-Control': 'no-cache' }, params: { _: Date.now() } }).catch((e) => e)
				])
				if (!mounted) return
				const prof = pRes?.data?.profile || null
				setProfile(prof)
				setBaseAvatarUrl(buildAvatarFromProfile(prof, user.id))

				if (rRes?.data?.results) {
					setAnalysis(rRes.data.results)
				} else if (rRes?.response?.status === 404) {
					setAnalysis(null)
				} else if (rRes instanceof Error) {
					setError('Erreur lors du chargement des résultats')
				}
			} catch (e) {
				console.error(e)
				if (!mounted) return
				setError('Erreur de chargement')
			} finally {
				if (mounted) setLoading(false)
			}
		})()
		return () => { mounted = false }
	}, [navigate])

	// Intro dialogue (no auto-advance; use Next button like Niveau2)
	const introMessages = useMemo(() => ([
		{ text: 'Bienvenue sur Zélia', durationMs: 1500 },
		{ text: 'Nous allons t\'expliquer comment nous allons t\'aider à trouver le métier de tes rêves', durationMs: 5000 },
		{ text: 'Nous allons faire en sorte d\'y arriver ensemble, et allons te donner des tips tout au long de ton parcours', durationMs: 6000 },
		{ text: 'Commençons', durationMs: 1000 },
	]), [])
	const [introIdx, setIntroIdx] = useState(0)
	const currentIntro = introMessages[introIdx] || { text: '', durationMs: 1500 }
	const { text: introTyped, done: introDone, skip: introSkip } = useTypewriter(currentIntro.text, currentIntro.durationMs)

	// Global mouth animation: active while intro is typing or while a conv text is typing (via custom event)
	const shouldAnimateMouth = (phase === 'intro' && !introDone) || typingActive
	useEffect(() => {
		if (!shouldAnimateMouth) return
		const id = setInterval(() => setMouthAlt((v) => !v), 200)
		return () => clearInterval(id)
	}, [shouldAnimateMouth])

	useEffect(() => {
		function onTypingEvent(e) {
			const active = !!(e && e.detail && e.detail.active)
			setTypingActive(active)
		}
		window.addEventListener('niv1-typing', onTypingEvent)
		return () => window.removeEventListener('niv1-typing', onTypingEvent)
	}, [])

	const firstJobTitle = analysis?.jobRecommendations?.[0]?.title || ''
	const secondJobTitle = analysis?.jobRecommendations?.[1]?.title || ''

	const askFit = phase === 'ask_fit'
	const awaitingInput = phase === 'await_input'

	const handleIntroNext = () => {
		if (!introDone) { introSkip(); return }
		if (introIdx + 1 < introMessages.length) setIntroIdx(introIdx + 1)
		else setPhase('ask_fit')
	}

	// Compute avatar URL with mouth animation if using DiceBear lorelei (must be before any early return to keep hooks order stable)
	const displayedAvatarUrl = useMemo(() => {
		let url = baseAvatarUrl
		if (!url) return url
		try {
			const u = new URL(url)
			const isDice = /api\.dicebear\.com/.test(u.host) && /\/lorelei\/svg/.test(u.pathname)
			if (!isDice) return url
			// toggle mouth only when animating
			url = modifyDicebearUrl(url, { mouth: shouldAnimateMouth ? (mouthAlt ? 'happy08' : null) : null })
			return url
		} catch { return url }
	}, [baseAvatarUrl, shouldAnimateMouth, mouthAlt])

	const postQuestions = [
		{ id: 'salary_expectation', type: 'buttons', text: "Est-ce que tu t'attendais à ce salaire là ?", options: ['Oui', 'Non', 'Je ne sais pas'] },
		{ id: 'good_salary', type: 'input', text: "Pour toi c'est quoi un bon salaire?", placeholder: 'Ex: 2500€ net/mois' },
		{ id: 'motivation_salary', type: 'buttons', text: 'Est-ce que tu fais ce métier pour le salaire ?', options: ['Oui', 'Non', 'Partiellement'] },
	]

	const convSteps = useMemo(() => ([
		{ id: 'learn_overview', type: 'text', text: 'Durant ton parcours, je vais t\'apprendre à te repérer parmi les métiers et à poser un cap clair.' },
		{ id: 'english_test', type: 'text', text: "On fera un test d\'anglais rapide pour évaluer ton niveau et te proposer des pistes pour progresser." },
		{ id: 'cv_build', type: 'text', text: 'On va créer ton CV étape par étape, avec des exemples et un modèle qui te ressemble.' },
		{ id: 'sell_yourself', type: 'text', text: 'Tu apprendras à te vendre: valoriser tes expériences, tes forces et tes réussites.' },
		{ id: 'pitch', type: 'text', text: 'On travaillera ton pitch 60 secondes pour faire forte impression.' },
		{ id: 'schools', type: 'text', text: 'On repèrera des écoles et formations qui collent vraiment à ton projet.' },
		{ id: 'calendar', type: 'text', text: 'On t\'aidera à organiser ton calendrier Parcoursup et tes échéances.' },
		{ id: 'tips', type: 'text', text: 'Tu auras des tips concrets à chaque étape pour gagner du temps.' },
		{ id: 'interview', type: 'text', text: 'On préparera tes entretiens: questions fréquentes, pièges et réponses efficaces.' },
		{ id: 'checklist', type: 'text', text: 'Tu auras une checklist personnalisée pour rester au top jusqu\'au bout.' },
		{ id: 'motivated', type: 'buttons', text: 'Est-ce que tu es motivé pour cela ?', options: ['Oui', 'Mitigé', 'Non'] },
		{ id: 'explore_another', type: 'buttons', text: 'Veux-tu explorer une autre fiche métier ?', options: ['Oui', 'Non'] },
		// 10 autres mini-dialogues pour converser
		{ id: 'why_attraction', type: 'buttons', text: "Qu'est-ce qui t'attire le plus dans ce métier ?", options: ['Le sens', 'Le salaire', 'Les études', 'Le quotidien'] },
		{ id: 'study_length', type: 'buttons', text: 'Tu te vois plutôt études longues ou entrer vite dans le concret ?', options: ['Études longues', 'Rapide et pro', 'Je ne sais pas'] },
		{ id: 'team_or_solo', type: 'buttons', text: 'Tu préfères travailler en équipe ou plutôt en solo ?', options: ['Équipe', 'Solo', 'Peu importe'] },
		{ id: 'five_years', type: 'input', text: 'Tu te vois où dans 5 ans ?', placeholder: 'Décris en une phrase' },
		{ id: 'favorite_subjects', type: 'buttons', text: 'Quelles matières te plaisent le plus ?', options: ['Sciences', 'Langues', 'Littérature', 'Éco/Gestion', 'Art/Design'] },
		{ id: 'learn_style', type: 'buttons', text: 'Tu apprends mieux en faisant ou en lisant ?', options: ['En faisant', 'En lisant', 'Mix des deux'] },
		{ id: 'english_level', type: 'buttons', text: 'Ton niveau d’anglais approximatif ?', options: ['Débutant', 'Intermédiaire', 'Avancé'] },
		{ id: 'proud_project', type: 'input', text: 'Tu as un projet perso dont tu es fier ?', placeholder: 'Dis-m’en un mot' },
		{ id: 'geo_constraints', type: 'buttons', text: 'Tu as des contraintes géographiques ?', options: ['Oui', 'Non'] },
		{ id: 'action_plan', type: 'buttons', text: 'Tu veux qu’on bâtisse un plan d’action ensemble ?', options: ['Oui', 'Plus tard'] },
	]), [])

	// Helper: find index of a conversation step by id (used to resume after second fiche)
	const exploreAnotherIdx = useMemo(() => convSteps.findIndex(s => s.id === 'explore_another'), [convSteps])

	async function generateFiche(jobTitle) {
		setBusy(true)
		setFicheText('')
		setPhase('generating')
		try {
			const message = `FICHE MÉTIER pour "${jobTitle}".
Contraintes de sortie OBLIGATOIRES:
- Réponds uniquement en français, en tutoyant (utilise "tu").
- AUCUNE salutation, introduction ou phrase d'ouverture (n'écris pas Bonjour, pas de phrase avant la section 1).
- AUCUN séparateur ou décoration (pas de '---', pas de tables, pas de code).
- AUCUN gras ni markdown (n'utilise jamais **, #, ##, etc.).

Structure EXACTE et dans cet ordre:
1) Description du métier (150-200 mots)
2) Salaire en France (débutant et médian)
3) Écoles/études pour y arriver (3 à 5 exemples précis)

Format: titres courts en clair (pas de markdown), listes à puces simples '-' quand pertinent.`

			const resp = await chatAPI.aiChat({ mode: 'advisor', message, history: [], jobTitles: [jobTitle], advisorType: 'fiche-metier' })
			let reply = resp?.data?.reply || ''
			// Nettoyage minimal: enlever le gras si l'IA en met quand même
			reply = reply.replace(/\*\*/g, '')
			setFicheText(reply)
			// Increase fiche count first so render can react accordingly
			setFicheCount(c => {
				const next = Math.min(2, c + 1)
				return next
			})
			setPhase('fiche')
		} catch (e) {
			console.error('AI fiche error', e)
			setFicheText('Une erreur est survenue lors de la génération de la fiche métier.')
			setPhase('fiche')
		} finally {
			setBusy(false)
		}
	}

	const onChoice = async (choice) => {
		if (choice === 'oui') {
			// "Super continuons" then generate for first job
			await new Promise(r => setTimeout(r, 250))
			await generateFiche(firstJobTitle || 'Métier')
		} else {
			// mitigé or non => ask for dream job input
			setPhase('await_input')
		}
	}

	const onSubmitDream = async () => {
		const value = (userInput || '').trim()
		if (!value) return
		setBusy(true)
		try {
			// Only send allowed profile fields
			await usersAPI.updateProfile({ home_preference: value })
			// small left-panel feedback happens through copy below
			await generateFiche(value)
		} catch (e) {
			console.error('Update profile error', e)
			setBusy(false)
		}
	}

	function handleConvNext() {
		if (convIdx + 1 < convSteps.length) setConvIdx(convIdx + 1)
		else finishLevel()
	}

	function handleConvButton(opt) {
		const step = convSteps[convIdx]
		setConvAnswers({ ...convAnswers, [step.id]: opt })
		// Special branching: propose another fiche
		if (step.id === 'explore_another' && opt === 'Oui') {
			if (secondJobTitle) {
				if (ficheCount < 2) {
					// Mark that we should skip discussing the second fiche,
					// and resume conversation just after this step.
					setSkipPostFiche(true)
					if (exploreAnotherIdx >= 0) {
						setResumeConvIdx(exploreAnotherIdx + 1)
					}
					generateFiche(secondJobTitle)
					// After second fiche is shown, user will press "Continuer" to proceed
					return
				}
			}
		}
		handleConvNext()
	}

	function finishLevel() {
		setPhase('success')
		setShowSuccess(true)
		// Auto-hide success after a short celebration, optional
		setTimeout(() => { /* keep overlay until user navigates */ }, 2000)
		// Update progression: grant XP and move to level 2 if needed
		;(async () => {
			try {
				const progRes = await progressionAPI.get().catch(() => ({ data: { level: 1, xp: 0, quests: [], perks: [] } }))
				const current = progRes?.data || { level: 1, xp: 0, quests: [], perks: [] }
				const baseXpReward = 100
				const newXp = (current.xp || 0) + baseXpReward
				const newLevel = Math.max(2, current.level || 1) // ensure reaching level 2 at least
				await progressionAPI.update({ level: newLevel, xp: newXp, quests: current.quests || [], perks: current.perks || [] })
			} catch (e) {
				console.warn('Progression update failed (non-blocking):', e)
			}
		})()
	}

	async function persistAnswers() {
		try {
			const postEntries = postQuestions.map(q => ({
				question_id: q.id,
				question_text: q.text,
				answer_text: postAnswers[q.id] ?? ''
			}))
			const convEntries = convSteps.map(s => ({
				question_id: s.id,
				question_text: s.text,
				answer_text: convAnswers[s.id] ?? ''
			}))
			const entries = [...postEntries, ...convEntries].filter(e => e.question_id && e.question_text)
			if (entries.length) await usersAPI.saveExtraInfo(entries)
		} catch (e) {
			console.error('Persist extra info failed', e)
		}
	}

	if (loading) {
		return (
			<div className="p-6 text-center">
				<div className="inline-block w-6 h-6 border-2 border-black border-t-transparent rounded-full animate-spin" />
				<p className="mt-2 text-text-secondary">Chargement…</p>
			</div>
		)
	}

	if (error) {
		return (
			<div className="p-6">
				<div className="bg-red-50 border border-red-200 text-red-800 p-4 rounded-lg">{error}</div>
			</div>
		)
	}

	return (
		<div className="p-4 md:p-6">
			<div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
				{/* Left: Avatar + Dialogue */}
				<div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-card">
					<div className="flex flex-col md:flex-row items-center md:items-start gap-6">
						<img src={displayedAvatarUrl} alt="Avatar" className="w-40 h-40 sm:w-48 sm:h-48 md:w-64 md:h-64 rounded-2xl border border-gray-100 shadow-sm object-contain bg-white mx-auto md:mx-0" />
						<div className="flex-1 w-full">
							<div className="relative bg-black text-white rounded-2xl p-4 md:p-5 w-full">
								<div className="text-base md:text-lg leading-relaxed whitespace-pre-wrap min-h-[3.5rem]">
									{phase === 'intro' ? (
										<>{introTyped}</>
									) : askFit ? (
										'Est-ce que ces métiers recommandés te conviennent ?'
									) : awaitingInput ? (
										'Peux-tu nous dire le métier de tes rêves ?'
									) : phase === 'generating' ? (
										"Je suis en train de rechercher les infomations du métier qui te concerne..."
									) : phase === 'fiche' ? (
										<>
											{!skipPostFiche ? (
												<>
													<div>Super, continuons.</div>
													{userInput ? (
														<div>Très bien je vois que tu es ambitieux ! « {userInput} » est un beau métier.</div>
													) : null}
													<div>Tu peux lire la fiche, puis on en discute 👇</div>
												</>
											) : (
												<>
													<div>Voici une seconde fiche pour t'offrir un autre angle.</div>
													<div>Lis-la si tu veux, puis on passe directement à la suite.</div>
												</>
											)}
										</>
									) : phase === 'post_fiche' ? (
										<>{postQuestions[postIdx]?.text || ''}</>
									) : phase === 'conversation' ? (
										<>
											{convSteps[convIdx]?.type === 'text' ? (
												<ConvTextWithTypewriter
													text={convSteps[convIdx].text}
													onNext={() => { handleConvNext(); if (convIdx + 1 >= convSteps.length) persistAnswers() }}
												/>
											) : (convSteps[convIdx]?.text || '')}
										</>
									) : (
										''
									)}
								</div>
								<div className="absolute -left-2 top-6 w-0 h-0 border-t-8 border-b-8 border-r-8 border-t-transparent border-b-transparent border-r-black" />
							</div>

							{/* Intro Next button (no auto-advance) */}
							{phase === 'intro' && (
								<div className="mt-3">
									<button onClick={handleIntroNext} className="inline-flex items-center px-4 py-2 rounded-md bg-[#c1ff72] text-black border border-gray-200">
										Suivant
									</button>
								</div>
							)}

							{/* Choices */}
							{askFit && (
								<div className="mt-4 flex flex-wrap gap-3">
									<button onClick={() => onChoice('oui')} disabled={!firstJobTitle}
											className="px-4 py-2 rounded-lg bg-[#c1ff72] text-black border border-gray-200 disabled:opacity-50 w-full sm:w-auto">Oui</button>
									<button onClick={() => onChoice('mitige')} className="px-4 py-2 rounded-lg bg-white text-gray-900 border border-gray-300 w-full sm:w-auto">Mitigé</button>
									<button onClick={() => onChoice('non')} className="px-4 py-2 rounded-lg bg-white text-gray-900 border border-gray-300 w-full sm:w-auto">Non</button>
								</div>
							)}

							{awaitingInput && (
								<div className="mt-4 flex flex-col sm:flex-row gap-3 w-full">
									<input type="text" value={userInput} onChange={(e) => setUserInput(e.target.value)}
											 placeholder="Ton métier de rêve"
											 className="flex-1 px-3 py-2 border border-gray-300 rounded-lg w-full" />
									<button onClick={onSubmitDream} disabled={busy || !userInput.trim()} className="px-4 py-2 rounded-lg bg-black text-white disabled:opacity-50 w-full sm:w-auto">Valider</button>
								</div>
							)}

							{/* Post-fiche Q&A */}
							{phase === 'fiche' && !skipPostFiche && (
								<div className="mt-4">
									<button onClick={() => setPhase('post_fiche')} className="px-4 py-2 rounded-lg bg-[#c1ff72] text-black border border-gray-200 w-full sm:w-auto">Discuter de la fiche</button>
								</div>
							)}

							{phase === 'fiche' && skipPostFiche && (
								<div className="mt-4">
									<button onClick={() => {
										setPhase('conversation')
										if (resumeConvIdx != null && resumeConvIdx < convSteps.length) {
											setConvIdx(resumeConvIdx)
										}
										setSkipPostFiche(false)
									}} className="px-4 py-2 rounded-lg bg-[#c1ff72] text-black border border-gray-200 w-full sm:w-auto">Continuer</button>
								</div>
							)}

							{phase === 'post_fiche' && (
								<div className="mt-4 space-y-3">
									{postQuestions[postIdx]?.type === 'buttons' && (
										<div className="flex flex-wrap gap-3">
											{postQuestions[postIdx].options.map((opt, i) => (
												<button key={i} onClick={() => {
													setPostAnswers({ ...postAnswers, [postQuestions[postIdx].id]: opt })
													if (postIdx + 1 < postQuestions.length) setPostIdx(postIdx + 1); else { setPhase('conversation'); setConvIdx(0); persistAnswers() }
												}} className="px-4 py-2 rounded-lg bg-white text-gray-900 border border-gray-300 w-full sm:w-auto">{opt}</button>
											))}
										</div>
									)}
									{postQuestions[postIdx]?.type === 'input' && (
										<div className="flex flex-col sm:flex-row gap-3 w-full">
											<input type="text" placeholder={postQuestions[postIdx].placeholder || ''} className="flex-1 px-3 py-2 border border-gray-300 rounded-lg w-full"
													value={postAnswers[postQuestions[postIdx].id] || ''}
													onChange={(e) => setPostAnswers({ ...postAnswers, [postQuestions[postIdx].id]: e.target.value })}
											/>
											<button onClick={() => { if (postIdx + 1 < postQuestions.length) setPostIdx(postIdx + 1); else { setPhase('conversation'); setConvIdx(0); persistAnswers() } }} className="px-4 py-2 rounded-lg bg-black text-white w-full sm:w-auto">Suivant</button>
										</div>
									)}
								</div>
							)}

							{phase === 'conversation' && (
								<div className="mt-4 space-y-3">
									{convSteps[convIdx]?.type === 'buttons' && (
										<div className="flex flex-wrap gap-3">
											{(convSteps[convIdx].options || []).map((opt, i) => (
												<button key={i} onClick={() => { handleConvButton(opt); if (convIdx + 1 >= convSteps.length) persistAnswers() }} className="px-4 py-2 rounded-lg bg-white text-gray-900 border border-gray-300 w-full sm:w-auto">{opt}</button>
											))}
										</div>
									)}
									{convSteps[convIdx]?.type === 'input' && (
										<div className="flex flex-col sm:flex-row gap-3 w-full">
											<input type="text" placeholder={convSteps[convIdx].placeholder || ''} className="flex-1 px-3 py-2 border border-gray-300 rounded-lg w-full"
													value={convAnswers[convSteps[convIdx].id] || ''}
													onChange={(e) => setConvAnswers({ ...convAnswers, [convSteps[convIdx].id]: e.target.value })}
											/>
											<button onClick={() => { handleConvNext(); if (convIdx + 1 >= convSteps.length) persistAnswers() }} className="px-4 py-2 rounded-lg bg-black text-white w-full sm:w-auto">Suivant</button>
										</div>
									)}
									{convSteps[convIdx]?.type === 'text' && null}
								</div>
							)}

							{/* Hidden: persistence helper */}
							{false && <pre>{JSON.stringify({ postAnswers, convAnswers }, null, 2)}</pre>}

							{false && introDone && (
								<div className="mt-4"><span /></div>
							)}
						</div>
					</div>
				</div>

				{/* Right: Recommendations or Fiche */}
				<div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-card">
					{phase === 'ask_fit' && (
						<>
							<div className="flex items-center gap-3 mb-4">
								<div className="w-10 h-10 bg-orange-500 rounded-full flex items-center justify-center text-white">💼</div>
								<h2 className="text-xl font-bold">Recommandations d'emploi</h2>
							</div>
							{analysis?.jobRecommendations?.length ? (
								<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
									{analysis.jobRecommendations.map((job, idx) => (
										<div key={idx} className="bg-orange-50 border border-orange-200 rounded-lg p-4">
											<h3 className="font-semibold text-orange-900 mb-2">{job.title}</h3>
											{(job.skills?.length ? (
												<div className="text-sm text-orange-700">
													<div className="font-medium">Compétences requises:</div>
													<ul className="mt-1 list-disc list-inside">
														{job.skills.map((s, i) => <li key={i}>{s}</li>)}
													</ul>
												</div>
											) : null)}
										</div>
									))}
								</div>
							) : (
								<div className="text-text-secondary">Aucune recommandation disponible pour le moment.</div>
							)}
						</>
					)}

					{(phase === 'fiche' || phase === 'post_fiche' || phase === 'conversation' || phase === 'generating') && (
						<div>
							<div className="flex items-center gap-3 mb-4">
								<div className="w-10 h-10 bg-black rounded-full flex items-center justify-center text-white">📘</div>
								<h2 className="text-xl font-bold">Fiche métier</h2>
							</div>
							{busy && <div className="text-sm text-text-secondary">Génération…</div>}
							<div className="prose max-w-none whitespace-pre-wrap text-gray-800">{ficheText}</div>
						</div>
					)}
				</div>
			</div>

			{/* Success overlay for Level 1 completion */}
			{showSuccess && (
				<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
					<div className="relative bg-white border border-gray-200 rounded-2xl p-8 shadow-2xl text-center max-w-md w-11/12">
						<div className="absolute -top-5 left-1/2 -translate-x-1/2 w-10 h-10 bg-[#c1ff72] rounded-full flex items-center justify-center shadow-md animate-bounce">🏆</div>
						<h3 className="text-2xl font-extrabold mb-2">Niveau 1 réussi !</h3>
						<p className="text-text-secondary mb-4">Bravo, tu as terminé l\'introduction et exploré tes premières pistes.</p>
						<div className="flex flex-col sm:flex-row gap-3 justify-center">
							<button onClick={() => navigate('/app/activites')} className="px-4 py-2 rounded-lg bg-[#c1ff72] text-black border border-gray-200">Retour aux activités</button>
						</div>
						{/* Subtle confetti dots */}
						<div className="pointer-events-none absolute inset-0 overflow-hidden">
							<div className="absolute w-2 h-2 bg-pink-400 rounded-full left-6 top-8 animate-ping" />
							<div className="absolute w-2 h-2 bg-yellow-400 rounded-full right-8 top-10 animate-ping" />
							<div className="absolute w-2 h-2 bg-blue-400 rounded-full left-10 bottom-8 animate-ping" />
							<div className="absolute w-2 h-2 bg-green-400 rounded-full right-6 bottom-10 animate-ping" />
						</div>
					</div>
				</div>
			)}
		</div>
	)
}

// Component for conversation text type with typewriter and mouth animation sync
function ConvTextWithTypewriter({ text, onNext }) {
	const duration = useMemo(() => Math.min(8000, Math.max(1500, (text || '').length * 40)), [text])
	const { text: typed, done, skip } = useTypewriter(text || '', duration)

	// Emit a custom event to tell parent that typing is active for mouth animation
	useEffect(() => {
		const ev = new CustomEvent('niv1-typing', { detail: { active: !done } })
		window.dispatchEvent(ev)
	}, [done])

	return (
		<div>
			<div className="mb-3 whitespace-pre-wrap">{typed}</div>
			<button onClick={() => { if (!done) skip(); else onNext() }} className="px-4 py-2 rounded-lg bg-[#c1ff72] text-black border border-gray-200 w-full sm:w-auto">Suivant</button>
		</div>
	)
}


