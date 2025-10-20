import React, { useEffect, useState } from 'react'
import { jwtDecode } from 'jwt-decode'
import apiClient from '../lib/api.js'
import { progressionAPI } from '../lib/api.js'

export default function Results() {
	const [analysisData, setAnalysisData] = useState(null)
	const [loading, setLoading] = useState(true)
	const [error, setError] = useState('')
	const [avatarUrls, setAvatarUrls] = useState({ type: '', analysis: '', skills: '', jobs: '', studies: '' })
	const [activeTab, setActiveTab] = useState('orientation') // 'orientation' | 'personality'
	const [progressionLevel, setProgressionLevel] = useState(null)

	// Get user ID from token (used only for avatar seed)
	const getUserId = () => {
		const token = localStorage.getItem('supabase_auth_token') || localStorage.getItem('token')
		if (!token) return null
		try {
			const decoded = jwtDecode(token)
			return decoded.sub || decoded.user_id || decoded.id
		} catch (e) {
			console.error('Error decoding token:', e)
			return null
		}
	}

	useEffect(() => {
		loadExistingResults()
		loadProgression()
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [])

	const loadProgression = async () => {
		try {
			const resp = await progressionAPI.get().catch(() => null)
			const level = resp?.data?.level || resp?.data?.progression?.level || null
			if (level) setProgressionLevel(level)
		} catch (e) {
			console.warn('Progression load failed (non-blocking):', e)
		}
	}

	const buildAvatarUrl = (base, config, { seed, eyes, mouth } = {}) => {
		let urlStr = typeof base === 'string' && base.startsWith('http')
			? base
			: 'https://api.dicebear.com/7.x/adventurer/svg'

		try {
			const url = new URL(urlStr)
			if (seed && !url.searchParams.has('seed')) url.searchParams.set('seed', String(seed))
			if (eyes) url.searchParams.set('eyes', eyes)
			if (mouth) url.searchParams.set('mouth', mouth)
			return url.toString()
		} catch {
			return `https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(seed || 'user')}`
		}
	}

	useEffect(() => {
		if (!analysisData) return
		const userId = getUserId() || 'user'
		const base = analysisData.avatarUrlBase || ''
		const cfg = analysisData.avatarConfig || null
		const eyesVariants = Array.from({ length: 24 }, (_, i) => `variant${String(i + 1).padStart(2, '0')}`)
		const happyMouth = ['happy01', 'happy02', 'happy03']

		const pick = (arr) => arr[Math.floor(Math.random() * arr.length)]
		const build = (extraParams = {}) => buildAvatarUrl(base, cfg, { seed: userId, ...extraParams })

		setAvatarUrls({
			type: build({ eyes: pick(eyesVariants) }),
			analysis: build({ mouth: pick(happyMouth) }),
			skills: build({ eyes: pick(eyesVariants), mouth: pick(happyMouth) }),
			jobs: build({ eyes: pick(eyesVariants) }),
			studies: build({ mouth: pick(happyMouth) })
		})
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [analysisData])

	const loadExistingResults = async () => {
		setLoading(true)
		setError('')
		try {
			// Try to fetch stored analysis results
			const response = await apiClient.get('/analysis/my-results', {
				headers: { 'Cache-Control': 'no-cache' },
				params: { _: Date.now() }
			})
			setAnalysisData(sanitizeResultsForDisplay(response.data.results))
		} catch (err) {
			if (err.response?.status === 404) {
				// No stored analysis yet: try to generate, then refetch
				const userId = getUserId()
				if (userId) {
					try {
						await apiClient.post('/analysis/generate-analysis', { userId })
						// Refetch results after generation
						const refreshed = await apiClient.get('/analysis/my-results', {
							headers: { 'Cache-Control': 'no-cache' },
							params: { _: Date.now() }
						})
						setAnalysisData(sanitizeResultsForDisplay(refreshed.data.results))
						return
					} catch (genErr) {
						// If the AI analysis generation fails (e.g., missing API key),
						// fall back to simple results based on questionnaire responses
						try {
							await apiClient.post('/results/generate')
							// Now try to get whatever is stored (may have minimal fields)
							const refreshed = await apiClient.get('/analysis/my-results', {
								headers: { 'Cache-Control': 'no-cache' },
								params: { _: Date.now() }
							})
							if (refreshed?.data?.results && (
								refreshed.data.results.personalityAnalysis ||
								refreshed.data.results.skillsAssessment ||
								(refreshed.data.results.jobRecommendations ?? []).length > 0 ||
								(refreshed.data.results.studyRecommendations ?? []).length > 0
							)) {
								setAnalysisData(sanitizeResultsForDisplay(refreshed.data.results))
								return
							}

							// As a last resort, fetch the simple latest summary and map it to UI shape
							const latestSimple = await apiClient.get('/results/latest', {
								headers: { 'Cache-Control': 'no-cache' },
								params: { _: Date.now() }
							})
							const simple = latestSimple?.data?.results?.analysis
							if (simple) {
								const mapped = mapSimpleAnalysisToUI(simple)
								setAnalysisData(sanitizeResultsForDisplay(mapped))
								return
							}
						} catch (fallbackErr) {
							console.error('Fallback analysis failed:', fallbackErr)
						}
					}
				}

				// If we got here, we couldn't load or generate results
				setAnalysisData(null)
			} else if (err.response?.status === 401) {
				setError('Utilisateur non authentifié')
			} else {
				console.error('Error loading results:', err)
				setError(err.response?.data?.error || 'Erreur lors du chargement des résultats')
			}
		} finally {
			setLoading(false)
		}
	}

	// Map the simple results structure into the UI-friendly shape
	const mapSimpleAnalysisToUI = (simple) => {
		return {
			personalityType: simple.personality_type || 'Profil non déterminé',
			personalityAnalysis: [
				simple.strengths?.length ? `Forces clés: ${simple.strengths.join(', ')}` : null,
				simple.recommendations?.length ? `Recommandations: ${simple.recommendations.join('\n- ')}` : null
			].filter(Boolean).join('\n\n'),
			skillsAssessment: simple.strengths?.length ? `Compétences mises en avant: ${simple.strengths.join(', ')}` : '',
			jobRecommendations: (simple.career_matches || []).map((m) => ({
				title: m.title,
				skills: []
			})),
			studyRecommendations: [],
			avatarUrlBase: null,
			avatarConfig: null,
			createdAt: simple.completion_date,
			updatedAt: simple.completion_date
		}
	}

	const sanitizeResultsForDisplay = (results) => {
		if (!results || typeof results !== 'object') return results
		const clone = { ...results }
		const isMbti = Boolean(clone.inscriptionResults) || (clone.personalityType && /\(([IE][NS][FT][JP])\)/i.test(clone.personalityType))
		if (Array.isArray(clone.jobRecommendations)) {
			clone.jobRecommendations = clone.jobRecommendations.slice(0, 6)
		} else {
			clone.jobRecommendations = []
		}
		if (isMbti) {
			clone.skillsAssessment = null
			if (clone.personalityAnalysis) {
				clone.personalityAnalysis = ensureJobMentions(clone.personalityAnalysis, clone.jobRecommendations)
			}
		}
		if (clone.inscriptionResults && typeof clone.inscriptionResults === 'object') {
			const inscriptionJobs = Array.isArray(clone.inscriptionResults.jobRecommendations)
				? clone.inscriptionResults.jobRecommendations.slice(0, 6)
				: clone.inscriptionResults.jobRecommendations
			clone.inscriptionResults = {
				...clone.inscriptionResults,
				jobRecommendations: inscriptionJobs
			}
			if (Array.isArray(inscriptionJobs) && clone.inscriptionResults.personalityAnalysis) {
				clone.inscriptionResults.personalityAnalysis = ensureJobMentions(clone.inscriptionResults.personalityAnalysis, inscriptionJobs)
			}
		}
		return clone
	}

	const splitIntoParagraphs = (text) => {
		if (!text || typeof text !== 'string') return []
		const trimmed = text.trim()
		if (!trimmed) return []
		let blocks = trimmed.split(/\n{2,}/).map((part) => part.trim()).filter(Boolean)
		if (blocks.length > 1) return blocks
		const sentences = trimmed.split(/(?<=[.!?])\s+/).map((sentence) => sentence.trim()).filter(Boolean)
		if (sentences.length <= 2) return [trimmed]
		const grouped = []
		for (let i = 0; i < sentences.length; i += 2) {
			grouped.push(sentences.slice(i, i + 2).join(' '))
		}
		return grouped
	}

	const renderParagraphs = (text) => {
		const paragraphs = splitIntoParagraphs(text)
		return paragraphs.map((paragraph, index) => (
			<p key={index} className="whitespace-pre-wrap text-text-primary leading-relaxed">{paragraph}</p>
		))
	}

	function ensureJobMentions(text, jobs) {
		if (!text || typeof text !== 'string' || !Array.isArray(jobs) || !jobs.length) return text || ''
		const titles = jobs
			.map((job) => (typeof job === 'string' ? job : job?.title || ''))
			.map((title) => title.trim())
			.filter(Boolean)
		if (!titles.length) return text
		const lower = text.toLowerCase()
		const missing = titles.filter((title) => !lower.includes(title.toLowerCase()))
		if (!missing.length) return text
		const list = formatJobList(missing.slice(0, 3))
		if (!list) return text
		return `${text.trim()}\n\nCes points se retrouvent dans des métiers comme ${list}.`
	}

	function formatJobList(titles) {
		const items = (titles || []).map((title) => title.trim()).filter(Boolean)
		if (!items.length) return ''
		if (items.length === 1) return items[0]
		if (items.length === 2) return `${items[0]} et ${items[1]}`
		return `${items.slice(0, -1).join(', ')} et ${items[items.length - 1]}`
	}

	if (loading) {
		return (
			<div className="space-y-6">
				<div>
					<h1 className="text-2xl font-bold">Mes Résultats</h1>
					<p className="text-text-secondary">Analyse personnalisée de votre questionnaire</p>
				</div>
				{renderTabs()}
				<div className="bg-surface border border-line rounded-xl shadow-card p-8 text-center">
					<div className="inline-block w-6 h-6 border-2 border-black border-t-transparent rounded-full animate-spin"></div>
					<p className="mt-2 text-text-secondary">Chargement... cela peut prendre jusqu'à 40 secondes…</p>
				</div>
			</div>
		)
	}

	if (error) {
		return (
			<div className="space-y-6">
				<div>
					<h1 className="text-2xl font-bold">Mes Résultats</h1>
					<p className="text-text-secondary">Analyse personnalisée de votre questionnaire</p>
				</div>
				{renderTabs()}
				<div className="bg-surface border border-line rounded-xl shadow-card p-8 text-center">
					<div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
						<svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
						</svg>
					</div>
					<h3 className="text-lg font-semibold mb-2">Erreur</h3>
					<p className="text-text-secondary">{error}</p>
				</div>
			</div>
		)
	}

	if (!analysisData) {
		return (
			<div className="space-y-6">
				<div>
					<h1 className="text-2xl font-bold">Mes Résultats</h1>
					<p className="text-text-secondary">Analyse personnalisée de votre questionnaire</p>
				</div>
				{renderTabs()}
				<div className="bg-surface border border-line rounded-xl shadow-card p-8 text-center">
					<div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
						<svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
						</svg>
					</div>
					<h3 className="text-lg font-semibold mb-2">Aucun résultat disponible</h3>
					<p className="text-text-secondary">
						Vous n'avez pas encore de résultats enregistrés. Une fois le questionnaire complété et l'analyse effectuée, vos résultats apparaîtront ici.
					</p>
				</div>
			</div>
		)
	}

	const renderOrientationTab = () => {
		const data = analysisData.inscriptionResults || analysisData // fallback if only simple results
		if (!data) return null
		return (
			<div className="space-y-6">
				{data.personalityType && (
					<div className="relative bg-gradient-to-r from-gray-50 to-gray-100 border border-gray-200 rounded-xl shadow-card p-6">
						<div className="flex items-center gap-3 mb-3">
							<div className="w-10 h-10 bg-gray-700 rounded-full flex items-center justify-center">
								<svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
								</svg>
							</div>
							<h2 className="text-xl font-bold text-gray-900">Profil d'orientation</h2>
						</div>
						<p className="text-gray-800 font-semibold text-lg">{data.personalityType}</p>
					</div>
				)}
				{data.personalityAnalysis && (
					<div className="relative bg-surface border border-line rounded-xl shadow-card p-6">
						<div className="flex items-center gap-3 mb-4">
							<div className="w-10 h-10 bg-green-600 rounded-full flex items-center justify-center">
								<svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
							</svg>
							</div>
							<h2 className="text-xl font-bold">Analyse d'orientation</h2>
						</div>
						<div className="space-y-4">
							{renderParagraphs(data.personalityAnalysis)}
						</div>
					</div>
				)}
				{data.skillsAssessment && (
					<div className="relative bg-surface border border-line rounded-xl shadow-card p-6">
						<div className="flex items-center gap-3 mb-4">
							<div className="w-10 h-10 bg-purple-600 rounded-full flex items-center justify-center">
								<svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
								</svg>
							</div>
							<h2 className="text-xl font-bold">Compétences clés</h2>
						</div>
						<div className="space-y-3">
							{renderParagraphs(data.skillsAssessment)}
						</div>
					</div>
				)}
				{data.jobRecommendations && data.jobRecommendations.length > 0 && (
					<div className="relative bg-surface border border-line rounded-xl shadow-card p-6">
						<div className="flex items-center gap-3 mb-4">
							<div className="w-10 h-10 bg-orange-600 rounded-full flex items-center justify-center">
								<svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2-2v2m8 0V6a2 2 0 012 2v6a2 2 0 01-2 2H6a2 2 0 01-2-2V8a2 2 0 012-2V6" />
								</svg>
							</div>
							<h2 className="text-xl font-bold">Idées de métiers</h2>
						</div>
						<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
							{data.jobRecommendations.map((job, index) => (
								<div key={index} className="bg-orange-50 border border-orange-200 rounded-lg p-4">
									<h3 className="font-semibold text-orange-900 mb-2">{job.title}</h3>
									{(job.skills || []).length > 0 && (
										<ul className="text-sm text-orange-700 list-disc list-inside">
											{job.skills.map((s, i) => <li key={i}>{s}</li>)}
										</ul>
									)}
								</div>
							))}
						</div>
					</div>
				)}
				{data.studyRecommendations && data.studyRecommendations.length > 0 && (
					<div className="relative bg-surface border border-line rounded-xl shadow-card p-6">
						<div className="flex items-center gap-3 mb-4">
							<div className="w-10 h-10 bg-teal-600 rounded-full flex items-center justify-center">
								<svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.246 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
								</svg>
							</div>
							<h2 className="text-xl font-bold">Pistes d'études</h2>
						</div>
						<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
							{data.studyRecommendations.map((study, index) => (
								<div key={index} className="bg-teal-50 border border-teal-200 rounded-lg p-4">
									<h3 className="font-semibold text-teal-900 mb-1">{study.degree}</h3>
									<p className="text-sm text-teal-700">{study.type}</p>
								</div>
							))}
						</div>
					</div>
				)}
			</div>
		)
	}

	const renderPersonalityTab = () => {
		// Gate until level 4
		if ((progressionLevel || 0) < 4) {
			return (
				<div className="bg-yellow-50 border border-yellow-200 rounded-xl p-8 text-center shadow-card">
					<h2 className="text-xl font-bold text-yellow-800 mb-2">Analyse de personnalité</h2>
					<p className="text-yellow-700">Sera disponible au niveau 4.</p>
					{progressionLevel !== null && (
						<p className="mt-2 text-sm text-yellow-600">Niveau actuel : {progressionLevel}</p>
					)}
				</div>
			)
		}

		return (
			<div className="space-y-6">
				{analysisData.personalityType && (
					<div className="relative bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl shadow-card p-6">
						{avatarUrls.type && (
							<img src={avatarUrls.type} alt="Avatar" className="absolute right-4 top-4 w-14 h-14 rounded-full border border-white shadow-sm bg-white object-contain" />
						)}
						<div className="flex items-center gap-3 mb-3">
							<div className="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center">
								<svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
								</svg>
							</div>
							<h2 className="text-xl font-bold text-blue-900">Type de personnalité</h2>
						</div>
						<p className="text-blue-800 font-semibold text-lg">{analysisData.personalityType}</p>
					</div>
				)}
				{analysisData.personalityAnalysis && (
					<div className="relative bg-surface border border-line rounded-xl shadow-card p-6">
						{avatarUrls.analysis && (
							<img src={avatarUrls.analysis} alt="Avatar" className="absolute right-4 top-4 w-14 h-14 rounded-full border border-white shadow-sm bg-white object-contain" />
						)}
						<div className="flex items-center gap-3 mb-4">
							<div className="w-10 h-10 bg-green-600 rounded-full flex items-center justify-center">
								<svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
							</svg>
							</div>
							<h2 className="text-xl font-bold">Analyse de personnalité</h2>
						</div>
						<div className="space-y-4">
							{renderParagraphs(analysisData.personalityAnalysis)}
						</div>
					</div>
				)}
				{analysisData.jobRecommendations && analysisData.jobRecommendations.length > 0 && (
					<div className="relative bg-surface border border-line rounded-xl shadow-card p-6">
						{avatarUrls.jobs && (
							<img src={avatarUrls.jobs} alt="Avatar" className="absolute right-4 top-4 w-14 h-14 rounded-full border border-white shadow-sm bg-white object-contain" />
						)}
						<div className="flex items-center gap-3 mb-4">
							<div className="w-10 h-10 bg-orange-600 rounded-full flex items-center justify-center">
								<svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2-2v2m8 0V6a2 2 0 012 2v6a2 2 0 01-2 2H6a2 2 0 01-2-2V8a2 2 0 012-2V6" />
							</svg>
							</div>
							<h2 className="text-xl font-bold">Recommandations d'emploi</h2>
						</div>
						<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
							{analysisData.jobRecommendations.map((job, index) => (
								<div key={index} className="bg-orange-50 border border-orange-200 rounded-lg p-4">
									<h3 className="font-semibold text-orange-900 mb-2">{job.title}</h3>
									<div className="text-sm text-orange-700">
										<span className="font-medium">Compétences requises:</span>
										<ul className="mt-1 list-disc list-inside">
											{(job.skills || []).map((skill, skillIndex) => (
												<li key={skillIndex}>{skill}</li>
											))}
										</ul>
									</div>
								</div>
							))}
						</div>
					</div>
				)}
				{analysisData.studyRecommendations && analysisData.studyRecommendations.length > 0 && (
					<div className="relative bg-surface border border-line rounded-xl shadow-card p-6">
						{avatarUrls.studies && (
							<img src={avatarUrls.studies} alt="Avatar" className="absolute right-4 top-4 w-14 h-14 rounded-full border border-white shadow-sm bg-white object-contain" />
						)}
						<div className="flex items-center gap-3 mb-4">
							<div className="w-10 h-10 bg-teal-600 rounded-full flex items-center justify-center">
								<svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.246 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
							</svg>
						</div>
						<h2 className="text-xl font-bold">Recommandations d'études</h2>
						</div>
						<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
							{analysisData.studyRecommendations.map((study, index) => (
								<div key={index} className="bg-teal-50 border border-teal-200 rounded-lg p-4">
									<h3 className="font-semibold text-teal-900 mb-1">{study.degree}</h3>
									<p className="text-sm text-teal-700">{study.type}</p>
								</div>
							))}
						</div>
					</div>
				)}
			</div>
		)
	}

	function renderTabs() {
		return (
			<div className="flex gap-3 mt-4">
				<button
					className={`px-4 py-2 rounded-full text-sm font-medium border transition ${activeTab === 'orientation' ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-100'}`}
					onClick={() => setActiveTab('orientation')}
				>
					Résultats d'orientation
				</button>
				<button
					className={`px-4 py-2 rounded-full text-sm font-medium border transition ${activeTab === 'personality' ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-100'}`}
					onClick={() => setActiveTab('personality')}
				>
					Analyse de personnalité
				</button>
			</div>
		)
	}

	return (
		<div className="space-y-6">
			<div>
				<h1 className="text-2xl font-bold">Mes Résultats</h1>
				<p className="text-text-secondary">Analyse personnalisée basée sur vos réponses</p>
				{renderTabs()}
			</div>
			{activeTab === 'orientation' ? renderOrientationTab() : renderPersonalityTab()}
		</div>
	)
}
