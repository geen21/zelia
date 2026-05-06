import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { FaBriefcase, FaBookOpen, FaTrophy, FaClipboardList, FaMoneyBillWave, FaGraduationCap } from 'react-icons/fa6'
import apiClient, { usersAPI, chatAPI } from '../../lib/api'
import { XP_PER_LEVEL, levelUp } from '../../lib/progression'
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

function cleanAiFiche(raw) {
	return String(raw || '').replace(/\*\*/g, '').trim()
}

function isCompleteFiche(raw) {
	const text = cleanAiFiche(raw)
	if (!text) return false
	const hasDescription = /(description|pr[ée]sentation|le m[ée]tier|en quoi consiste)/i.test(text)
	const hasSalary = /(salaire|r[ée]mun[ée]ration|d[ée]butant|m[ée]dian)/i.test(text)
	const hasStudies = /([ée]coles|[ée]tudes|formations?|dipl[ôo]mes?|parcours)/i.test(text)
	const endsMidPhrase = /\b(par|de|des|du|à|au|aux|avec|pour|sans|dans|et|ou|la|le|les|un|une|en|sur|vers|chez|qui|que|dont)$/i.test(text)
	return hasDescription && hasSalary && hasStudies && !endsMidPhrase
}

export default function Niveau1() {
	const navigate = useNavigate()
	const [profile, setProfile] = useState(null)
	const [baseAvatarUrl, setBaseAvatarUrl] = useState('')
	const [analysis, setAnalysis] = useState(null)
	const [loading, setLoading] = useState(true)
	const [error, setError] = useState('')

	// Flow states
	const [phase, setPhase] = useState('intro') // intro -> ask_fit -> choose_job -> await_input -> generating -> fiche -> post_fiche -> conversation -> success
	const [userInput, setUserInput] = useState('')
	const [ficheText, setFicheText] = useState('')
	const [selectedJob, setSelectedJob] = useState(null) // track which job title was selected
	const [usedJobs, setUsedJobs] = useState([]) // track already explored jobs
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
					apiClient.get('/analysis/my-results', { headers: { 'Cache-Control': 'no-cache' }, params: { optional: '1', _: Date.now() } }).catch((e) => e)
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
		{ text: 'Bienvenue sur Zélia', durationMs: 500},
		{ text: 'On va t\'expliquer comment on peut t\'aider à mieux te connaître et trouver ta voie professionnelle', durationMs: 2000},
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

	const allJobs = analysis?.jobRecommendations || []
	const firstJobTitle = allJobs[0]?.title || ''
	const secondJobTitle = allJobs[1]?.title || ''

	const askFit = phase === 'ask_fit'
	const choosingJob = phase === 'choose_job'
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
		{ id: 'good_salary', type: 'input', text: "C’est quoi pour toi un bon salaire, en euros par mois ?", placeholder: 'Ex: 2500€ net/mois' },
		{ id: 'motivation_salary', type: 'buttons', text: 'Est-ce que tu cherches un métier pour le salaire ?', options: ['Oui', 'Non', 'Partiellement'] },
	]

	const convSteps = useMemo(() => ([
		{ id: 'explore_another', type: 'buttons', text: 'Veux-tu explorer une autre fiche métier ?', options: ['Oui', 'Non'] },
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
1) Description du métier (100-130 mots)
2) Salaire en France (débutant et médian)
3) Écoles/études pour y arriver (3 exemples précis)

Format: titres courts en clair (pas de markdown), listes à puces simples '-' quand pertinent.`

			const requestFiche = async (extraInstruction = '') => {
				const fullMessage = extraInstruction ? `${message}\n\n${extraInstruction}` : message
				const resp = await chatAPI.aiChat({ mode: 'advisor', message: fullMessage, history: [], jobTitles: [jobTitle], advisorType: 'fiche-metier' })
				return cleanAiFiche(resp?.data?.reply)
			}

			let reply = await requestFiche()
			if (!isCompleteFiche(reply)) {
				reply = await requestFiche("IMPORTANT: ta réponse précédente était incomplète. Génère cette fois une fiche complète avec les 3 sections demandées, sans t'arrêter au milieu d'une phrase.")
			}
			if (!isCompleteFiche(reply)) {
				throw new Error('Fiche métier incomplète')
			}
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
			// Let user choose which job to explore
			setPhase('choose_job')
		} else {
			// mitigé or non => ask for dream job input
			setPhase('await_input')
		}
	}

	const onJobSelect = async (jobTitle) => {
		setSelectedJob(jobTitle)
		setUsedJobs(prev => [...prev, jobTitle])
		await generateFiche(jobTitle)
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
			const remainingJobs = allJobs.filter(j => !usedJobs.includes(j.title))
			if (remainingJobs.length > 0 && ficheCount < 2) {
				// Mark that we should skip discussing the second fiche,
				// and resume conversation just after this step.
				setSkipPostFiche(true)
				if (exploreAnotherIdx >= 0) {
					setResumeConvIdx(exploreAnotherIdx + 1)
				}
				// Let user choose again from remaining jobs
				setPhase('choose_job')
				return
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
		const baseXpReward = XP_PER_LEVEL
		;(async () => {
			try {
				await levelUp({ minLevel: 2, xpReward: baseXpReward })
			} catch (e) {
				console.warn('Progression update failed (non-blocking):', e)
			}
		})()
	}

	async function persistAnswers() {
		try {
			const normalizeAnswer = (val) => {
				if (Array.isArray(val)) return val.join(', ')
				return val ?? ''
			}
			const postEntries = postQuestions.map(q => ({
				question_id: q.id,
				question_text: q.text,
				answer_text: normalizeAnswer(postAnswers[q.id])
			}))
			const convEntries = convSteps.map(s => ({
				question_id: s.id,
				question_text: s.text,
				answer_text: normalizeAnswer(convAnswers[s.id])
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
		<div className="p-2 md:p-6">
			<div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
				{/* Left: Avatar + Dialogue */}
				<div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-card">
					<div className="flex flex-col md:flex-row items-center md:items-start gap-6">
						<img src={displayedAvatarUrl} alt="Avatar" className="w-28 h-28 sm:w-36 sm:h-36 md:w-44 md:h-44 lg:w-52 lg:h-52 xl:w-60 xl:h-60 2xl:w-64 2xl:h-64 rounded-2xl border border-gray-100 shadow-sm object-contain bg-white mx-auto md:mx-0" />
						<div className="flex-1 w-full">
							<div className="relative bg-black text-white rounded-2xl p-4 md:p-5 w-full">
								<div className="text-base md:text-lg leading-relaxed whitespace-pre-wrap min-h-[3.5rem]">
									{phase === 'intro' ? (
										<>{introTyped}</>
									) : askFit ? (
										'Est-ce que ces métiers te semblent intéressants et pertinents ?'
									) : choosingJob ? (
										'Choisis le métier pour lequel tu souhaites générer une fiche métier :'
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

							{choosingJob && (
								<div className="mt-4 flex flex-col gap-2 w-full">
									{allJobs
										.filter(j => !usedJobs.includes(j.title))
										.map((job, idx) => (
										<button
											key={idx}
											onClick={() => onJobSelect(job.title)}
											disabled={busy}
											className="px-4 py-3 rounded-lg bg-white text-gray-900 border border-gray-300 text-left hover:bg-orange-50 hover:border-orange-400 transition-colors disabled:opacity-50 w-full"
										>
											{job.title}
										</button>
									))}
								</div>
							)}

							{awaitingInput && (
								<div className="mt-4 flex flex-col sm:flex-row gap-3 w-full">
									<input type="text" value={userInput} onChange={(e) => setUserInput(e.target.value)}
											 placeholder="Ton métier de rêve"
											 className="flex-1 px-4 py-3 border border-gray-300 rounded-lg w-full text-base sm:text-lg" />
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
													if (postIdx + 1 < postQuestions.length) {
														setPostIdx(postIdx + 1)
													} else {
														persistAnswers()
														finishLevel()
													}
												}} className="px-4 py-2 rounded-lg bg-white text-gray-900 border border-gray-300 w-full sm:w-auto">{opt}</button>
											))}
										</div>
									)}
									{postQuestions[postIdx]?.type === 'input' && (
										<div className="flex flex-col gap-3 w-full">
											<input type="text" placeholder={postQuestions[postIdx].placeholder || ''} className="px-4 py-3 border border-gray-300 rounded-lg w-full text-base sm:text-lg"
													value={postAnswers[postQuestions[postIdx].id] || ''}
													onChange={(e) => setPostAnswers({ ...postAnswers, [postQuestions[postIdx].id]: e.target.value })}
											/>
											<button onClick={() => {
												if (postIdx + 1 < postQuestions.length) {
													setPostIdx(postIdx + 1)
												} else {
													persistAnswers()
													finishLevel()
												}
											}} className="px-4 py-2 rounded-lg bg-black text-white w-full sm:w-auto">Suivant</button>
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
									{convSteps[convIdx]?.type === 'multi' && (
										<div className="space-y-3">
											{(() => {
												const step = convSteps[convIdx]
												const selected = Array.isArray(convAnswers[step.id]) ? convAnswers[step.id] : []
												const toggle = (opt) => {
													let next
													if (selected.includes(opt)) next = selected.filter(o => o !== opt)
													else next = [...selected, opt]
													setConvAnswers({ ...convAnswers, [step.id]: next })
												}
												return (
													<>
														<div className="flex flex-wrap gap-3">
															{(step.options || []).map((opt, i) => {
																const active = selected.includes(opt)
																return (
																	<button
																		key={i}
																		onClick={() => toggle(opt)}
																		className={`px-4 py-2 rounded-lg border w-full sm:w-auto ${active ? 'bg-black text-white border-black' : 'bg-white text-gray-900 border-gray-300'}`}
																	>
																		{opt}
																	</button>
																)
															})}
														</div>
														<div>
															<button
																onClick={() => { handleConvNext(); if (convIdx + 1 >= convSteps.length) persistAnswers() }}
																disabled={selected.length === 0}
																className="px-4 py-2 rounded-lg bg-black text-white disabled:opacity-50 w-full sm:w-auto"
															>
																Valider
															</button>
														</div>
													</>
												)
											})()}
										</div>
									)}
									{convSteps[convIdx]?.type === 'input' && (
										<div className="flex flex-col sm:flex-row gap-3 w-full">
											<input type="text" placeholder={convSteps[convIdx].placeholder || ''} className="flex-1 px-4 py-3 border border-gray-300 rounded-lg w-full text-base sm:text-lg"
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
					{(phase === 'ask_fit' || phase === 'choose_job') && (
						<>
							<div className="flex items-center gap-3 mb-4">
								<div className="w-10 h-10 bg-orange-500 rounded-full flex items-center justify-center text-white"><FaBriefcase className="w-5 h-5" /></div>
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
								<div className="w-10 h-10 bg-black rounded-full flex items-center justify-center text-white"><FaBookOpen className="w-5 h-5" /></div>
								<h2 className="text-xl font-bold">Fiche métier</h2>
							</div>
							{busy && (
								<div className="flex items-center gap-2 text-sm text-text-secondary">
									<div className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
									Génération en cours…
								</div>
							)}
							<FicheMetierCard text={ficheText} jobTitle={selectedJob} />
						</div>
					)}
				</div>
			</div>

			{/* Success overlay for Level 1 completion */}
			{showSuccess && (
				<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
					<div className="relative bg-white border border-gray-200 rounded-2xl p-8 shadow-2xl text-center max-w-md w-11/12">
						<div className="absolute -top-5 left-1/2 -translate-x-1/2 w-10 h-10 bg-[#c1ff72] rounded-full flex items-center justify-center shadow-md animate-bounce"><FaTrophy className="w-5 h-5 text-yellow-600" /></div>
						<h3 className="text-2xl font-extrabold mb-2">Niveau 1 réussi !</h3>
						<p className="text-text-secondary mb-4">Bravo, tu as terminé l'introduction et exploré tes premières pistes.</p>
						<div className="flex flex-col sm:flex-row gap-3 justify-center">
							<button onClick={() => navigate('/app/activites')} className="px-4 py-2 rounded-lg bg-white text-gray-900 border border-gray-200">Retour aux activités</button>
							<button onClick={() => navigate('/app/niveau/2')} className="px-4 py-2 rounded-lg bg-[#c1ff72] text-black border border-gray-200">Passer au niveau suivant</button>
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

// Component to render the fiche métier with visual structure
function FicheMetierCard({ text, jobTitle }) {
	if (!text) return null

	// Parse the raw text into 3 sections
	function parseFiche(raw) {
		const lines = raw.split('\n').map(l => l.trim()).filter(Boolean)
		const sections = []
		let current = null

		function extractInlineContent(line, sectionKey) {
			const withoutNumber = line.replace(/^\d+\s*[).:-]?\s*/, '').trim()
			const inlinePatterns = {
				description: /^(description(?:\s+du\s+m[ée]tier)?|pr[ée]sentation|le\s+m[ée]tier|en\s+quoi\s+consiste)(?:\s*\([^)]*\))?\s*[:\-–.]?\s*/i,
				salary: /^(salaire(?:\s+en\s+france)?|r[ée]mun[ée]ration|revenus)(?:\s*\([^)]*\))?\s*[:\-–.]?\s*/i,
				studies: /^([ée]coles(?:\s*\/\s*[ée]tudes)?(?:\s+pour\s+y\s+arriver)?|[ée]tudes(?:\s+pour\s+y\s+arriver)?|formations?|parcours|dipl[ôo]mes?|pour\s+y\s+arriver|comment\s+y\s+acc[ée]der)(?:\s*\([^)]*\))?\s*[:\-–.]?\s*/i,
			}
			const pattern = inlinePatterns[sectionKey]
			if (!pattern) return ''
			const content = withoutNumber.replace(pattern, '').trim()
			return content !== withoutNumber ? content : ''
		}

		// Heuristics to detect section headers
		const sectionPatterns = [
			{ key: 'description', pattern: /^\d*\)?\s*(description|pr[ée]sentation|le m[ée]tier|en quoi consiste)/i, icon: 'description', label: 'Description du métier', color: 'blue' },
			{ key: 'salary', pattern: /^\d*\)?\s*(salaire|r[ée]mun[ée]ration|revenus)/i, icon: 'salary', label: 'Salaire', color: 'green' },
			{ key: 'studies', pattern: /^\d*\)?\s*([ée]coles|[ée]tudes|formations?|parcours|dipl[ôo]mes?|pour y arriver|comment y acc)/i, icon: 'studies', label: 'Études & Formations', color: 'purple' },
		]

		for (const line of lines) {
			let matched = false
			for (const sp of sectionPatterns) {
				if (sp.pattern.test(line)) {
					const inlineContent = extractInlineContent(line, sp.key)
					current = { ...sp, content: inlineContent ? [inlineContent] : [] }
					sections.push(current)
					matched = true
					break
				}
			}
			if (!matched && current) {
				current.content.push(line)
			} else if (!matched && !current) {
				// Text before first section -> treat as description
				current = { key: 'description', icon: 'description', label: 'Description du métier', color: 'blue', content: [line] }
				sections.push(current)
			}
		}

		// If no sections detected at all, return everything as description
		if (sections.length === 0) {
			return [{ key: 'description', icon: 'description', label: 'Description du métier', color: 'blue', content: lines }]
		}
		return sections
	}

	const colorMap = {
		blue: { bg: 'bg-blue-50', border: 'border-blue-200', icon: 'bg-blue-100 text-blue-700', bullet: 'text-blue-500' },
		green: { bg: 'bg-green-50', border: 'border-green-200', icon: 'bg-green-100 text-green-700', bullet: 'text-green-500' },
		purple: { bg: 'bg-purple-50', border: 'border-purple-200', icon: 'bg-purple-100 text-purple-700', bullet: 'text-purple-500' },
	}

	const sections = parseFiche(text)

	return (
		<div className="space-y-4">
			{jobTitle && (
				<div className="text-center pb-3 border-b border-gray-100">
					<h3 className="text-lg font-bold text-gray-900">{jobTitle}</h3>
				</div>
			)}
			{sections.map((sec, idx) => {
				const colors = colorMap[sec.color] || colorMap.blue
				return (
					<div key={idx} className={`${colors.bg} ${colors.border} border rounded-xl p-4 break-words`}>
						<div className="flex items-center gap-2 mb-2">
							<span className={`w-8 h-8 rounded-lg flex items-center justify-center ${colors.icon}`}>
								{sec.icon === 'description' && <FaClipboardList className="w-4 h-4" />}
								{sec.icon === 'salary' && <FaMoneyBillWave className="w-4 h-4" />}
								{sec.icon === 'studies' && <FaGraduationCap className="w-4 h-4" />}
							</span>
							<span className="font-semibold text-gray-900">{sec.label}</span>
						</div>
						<div className="text-gray-700 text-sm leading-relaxed space-y-1">
							{sec.content.map((line, li) => {
								const isBullet = /^[-•–]/.test(line)
								if (isBullet) {
									return (
										<div key={li} className="flex items-start gap-2 pl-1">
											<span className={`mt-1.5 w-1.5 h-1.5 rounded-full ${colors.bullet.replace('text-', 'bg-')} flex-shrink-0`} />
											<span>{line.replace(/^[-•–]\s*/, '')}</span>
										</div>
									)
								}
								return <p key={li}>{line}</p>
							})}
						</div>
					</div>
				)
			})}
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


