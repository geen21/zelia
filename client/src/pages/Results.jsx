import React, { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import apiClient, { usersAPI } from '../lib/api.js'
import PersonaRevealCard from '../components/PersonaRevealCard.jsx'
import { getPersonaBySlug } from '../lib/personas.js'

export default function Results() {
	const navigate = useNavigate()
	const [analysisData, setAnalysisData] = useState(null)
	const [orientationSelections, setOrientationSelections] = useState([])
	const [loading, setLoading] = useState(true)
	const [error, setError] = useState('')
	const [personaInfo, setPersonaInfo] = useState(null) // { persona, avatarUrl }
	const RESULT_GENERATION_ATTEMPTS = 3
	const RESULT_RETRY_DELAY_MS = 1200

	useEffect(() => {
		loadExistingResults()
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [])

	useEffect(() => {
		let cancelled = false
		;(async () => {
			try {
				const response = await usersAPI.getProfile()
				if (cancelled) return
				const profile = response?.data?.profile || {}
				const avatarJson = profile.avatar_json && typeof profile.avatar_json === 'object' ? profile.avatar_json : {}
				const persona = getPersonaBySlug(avatarJson.persona || '')
				if (persona) {
					setPersonaInfo({ persona, avatarUrl: avatarJson.url || profile.avatar || '' })
				}
			} catch {
				// No persona available; the fallback profile block renders instead.
			}
		})()
		return () => { cancelled = true }
	}, [])

	const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms))

	const hasUsableResultBlock = (data) => {
		if (!data || typeof data !== 'object') return false
		return Boolean(
			(data.personalityAnalysis && String(data.personalityAnalysis).trim()) ||
			(data.skillsAssessment && String(data.skillsAssessment).trim()) ||
			(Array.isArray(data.jobRecommendations) && data.jobRecommendations.length > 0) ||
			(Array.isArray(data.studyRecommendations) && data.studyRecommendations.length > 0)
		)
	}

	const hasUsableResults = (data) => {
		if (!data || typeof data !== 'object') return false
		return hasUsableResultBlock(data.inscriptionResults) || hasUsableResultBlock(data.mbtiResults) || hasUsableResultBlock(data)
	}

	const fetchStoredResults = async () => {
		const response = await apiClient.get('/analysis/my-results', {
			headers: { 'Cache-Control': 'no-cache' },
			params: { _: Date.now() }
		})
		const sanitized = sanitizeResultsForDisplay(response.data.results)
		return hasUsableResults(sanitized) ? sanitized : null
	}

	const cleanCandidateText = (value, maxLength = 180) => {
		if (value === undefined || value === null) return ''
		const text = String(value).replace(/\s+/g, ' ').trim()
		if (!text) return ''
		return text.length > maxLength ? `${text.slice(0, maxLength - 1).trim()}...` : text
	}

	const firstText = (...values) => {
		for (const value of values) {
			const text = cleanCandidateText(value, 240)
			if (text) return text
		}
		return ''
	}

	const parseMaybeJson = (value) => {
		if (!value || typeof value !== 'string') return null
		try {
			return JSON.parse(value)
		} catch {
			return null
		}
	}

	const normalizeExtraInfoEntries = (response) => {
		if (Array.isArray(response?.data?.entries)) return response.data.entries
		if (Array.isArray(response?.data)) return response.data
		if (Array.isArray(response)) return response
		return []
	}

	const normalizeExternalHref = (value) => {
		const href = String(value || '').trim()
		if (!href) return ''
		if (/^https?:\/\//i.test(href) || /^mailto:/i.test(href)) return href
		if (/^www\./i.test(href)) return `https://${href}`
		return ''
	}

	const normalizeOrientationSelection = (candidate, index) => {
		if (typeof candidate === 'string') {
			const title = cleanCandidateText(candidate)
			return title ? { id: `selection-${index}`, type: 'selection', typeLabel: 'Résultat', title, subtitle: '', description: '', tags: [], link: '', linkLabel: '' } : null
		}

		if (!candidate || typeof candidate !== 'object') return null

		const raw = candidate.raw && typeof candidate.raw === 'object' ? candidate.raw : {}
		const detail = candidate.detail && typeof candidate.detail === 'object' ? candidate.detail : {}
		const sourceTable = firstText(candidate.sourceTable, candidate.source_table, raw.sourceTable, raw.source_table).toLowerCase()
		const type = firstText(candidate.type, raw.type).toLowerCase()
		const isMetier = type === 'metier' || sourceTable.includes('metiers')
		const isFormation = !isMetier
		const rawNm = Array.isArray(raw.nm) ? raw.nm.find(Boolean) : raw.nm
		const compactFormationTitle = isFormation && !detail.title && !rawNm && candidate.subtitle
			? String(candidate.subtitle).split(' - ')[0]
			: ''

		const title = cleanCandidateText(firstText(
			detail.title,
			rawNm,
			candidate.formation_name,
			raw.formation_name,
			compactFormationTitle,
			candidate.title,
			candidate.name,
			raw.nmc,
			raw.intitule
		), 160)

		const subtitle = cleanCandidateText(firstText(
			detail.subtitle,
			compactFormationTitle ? candidate.title : '',
			candidate.subtitle,
			candidate.schoolName,
			candidate.school,
			raw.etab_nom,
			raw.school_name,
			candidate.city,
			raw.commune
		), 220)

		const tags = [
			...(Array.isArray(detail.tags) ? detail.tags : []),
			candidate.source,
			candidate.region,
			raw.region,
			candidate.matchScore ? `${candidate.matchScore}% match` : ''
		]
			.map((tag) => cleanCandidateText(tag, 48))
			.filter(Boolean)
			.filter((tag, tagIndex, allTags) => allTags.findIndex((item) => item.toLowerCase() === tag.toLowerCase()) === tagIndex)
			.slice(0, 4)

		return {
			id: firstText(candidate.id, candidate.rawId, raw.id) || `selection-${index}`,
			type: isMetier ? 'metier' : 'formation',
			typeLabel: cleanCandidateText(detail.typeLabel || (isMetier ? 'Métier' : candidate.partner ? 'Formation partenaire' : 'Formation'), 60),
			title,
			subtitle,
			description: cleanCandidateText(detail.description || candidate.description || raw.description, 320),
			tags,
			link: normalizeExternalHref(detail.link || candidate.link || raw.etab_url || raw.fiche || raw.contact_urlpostulation),
			linkLabel: cleanCandidateText(detail.linkLabel || candidate.linkLabel || (isMetier ? 'Voir l’offre' : 'Voir la fiche'), 40)
		}
	}

	const normalizeOrientationSelections = (value) => {
		const parsed = Array.isArray(value) ? value : parseMaybeJson(value)
		const candidates = Array.isArray(parsed)
			? parsed
			: Array.isArray(parsed?.candidates)
				? parsed.candidates
				: []

		return candidates
			.map(normalizeOrientationSelection)
			.filter((candidate) => candidate && candidate.title)
			.slice(0, 16)
	}

	const fetchOrientationSelections = async () => {
		const localSelections = typeof window !== 'undefined'
			? normalizeOrientationSelections(localStorage.getItem('orientation_final_selection'))
			: []

		const response = await usersAPI.getExtraInfo()
		const entries = normalizeExtraInfoEntries(response)
		const finalEntry = entries.find((entry) => String(entry?.question_id || '').toLowerCase() === 'orientation_final_selection')
		const remoteSelections = normalizeOrientationSelections(finalEntry?.answer_text)

		return remoteSelections.length ? remoteSelections : localSelections
	}

	const loadExistingResults = async () => {
		setLoading(true)
		setError('')
		setAnalysisData(null)
		setOrientationSelections([])

		let savedOrientationSelections = []

		try {
			try {
				savedOrientationSelections = await fetchOrientationSelections()
				setOrientationSelections(savedOrientationSelections)
			} catch (selectionErr) {
				if (selectionErr.response?.status === 401) {
					setError('Utilisateur non authentifié')
					setLoading(false)
					return
				}
				console.warn('Error loading orientation selections:', selectionErr)
			}

			for (let attempt = 1; attempt <= RESULT_GENERATION_ATTEMPTS; attempt++) {
				try {
					const existing = await fetchStoredResults()
					if (existing) {
						setAnalysisData(existing)
						setLoading(false)
						return
					}
				} catch (err) {
					if (err.response?.status === 401) {
						setError('Utilisateur non authentifié')
						setLoading(false)
						return
					}
					if (err.response?.status !== 404) {
						throw err
					}
				}

				try {
					await apiClient.post('/analysis/generate-analysis', {})
					const generated = await fetchStoredResults()
					if (generated) {
						setAnalysisData(generated)
						setLoading(false)
						return
					}
				} catch (genErr) {
					if (genErr.response?.status === 401) {
						setError('Utilisateur non authentifié')
						setLoading(false)
						return
					}
					if (genErr.response?.status === 404) {
						if (savedOrientationSelections.length) {
							setLoading(false)
							return
						}
						setError('Complète d’abord le questionnaire pour générer tes résultats.')
						setLoading(false)
						return
					}
					console.warn(`Results generation attempt ${attempt}/${RESULT_GENERATION_ATTEMPTS} failed:`, genErr)
				}

				if (attempt < RESULT_GENERATION_ATTEMPTS) {
					await wait(RESULT_RETRY_DELAY_MS)
				}
			}

			if (savedOrientationSelections.length) {
				setLoading(false)
				return
			}

			setError("L'analyse n'a pas pu être générée pour le moment. Réessaie dans quelques secondes.")
			setLoading(false)
		} catch (err) {
			if (err.response?.status === 401) {
				setError('Utilisateur non authentifié')
				setLoading(false)
			} else if (savedOrientationSelections.length) {
				setLoading(false)
			} else {
				console.error('Error loading results:', err)
				setError(err.response?.data?.error || 'Erreur lors du chargement des résultats')
				setLoading(false)
			}
		}
	}

	const looksLikeStudyTitle = (value) => {
		const text = (value || '').trim()
		if (!text) return false
		return /^(CAP|BTS|BUT|DUT|Licence|Bachelor|Master|Concours|Classe préparatoire|Prépa|École|Ecole|Baccalauréat|Bac pro|DN MADE|DEUST|DCG|DSCG)\b/i.test(text)
	}

	const inferStudyDescription = (degree) => {
		const value = (degree || '').trim().toLowerCase()
		if (!value) return "Piste d'étude cohérente avec ton profil et les métiers recommandés."
		if (value.startsWith('cap')) return 'Formation professionnalisante courte pour apprendre rapidement un métier concret.'
		if (value.startsWith('bts') || value.startsWith('but') || value.startsWith('dut')) return 'Formation supérieure professionnalisante avec une approche concrète du terrain.'
		if (value.startsWith('licence professionnelle')) return 'Parcours professionnalisant pour te spécialiser rapidement dans un domaine précis.'
		if (value.startsWith('licence') || value.startsWith('bachelor')) return 'Parcours post-bac pour approfondir un domaine et construire une spécialisation.'
		if (value.startsWith('master')) return 'Formation avancée pour viser une expertise forte ou des postes à responsabilité.'
		if (value.includes('concours') || value.startsWith('école') || value.startsWith('ecole')) return 'Voie sélective menant à une formation spécialisée et encadrée.'
		return "Piste d'étude cohérente avec ton profil et les métiers recommandés."
	}

	const normalizeStudyRecommendations = (studies) => {
		if (!Array.isArray(studies)) return []

		const normalized = []
		for (const study of studies) {
			const degree = (study?.degree || study?.diploma || study?.title || '').trim()
			const type = (study?.type || study?.study_type || study?.label || '').trim()

			if (!degree) continue

			normalized.push({
				degree,
				type: !type || looksLikeStudyTitle(type) ? inferStudyDescription(degree) : type
			})

			if (type && looksLikeStudyTitle(type)) {
				normalized.push({
					degree: type,
					type: inferStudyDescription(type)
				})
			}
		}

		return normalized
			.filter((study, index, array) => array.findIndex((candidate) => candidate.degree === study.degree && candidate.type === study.type) === index)
			.slice(0, 6)
	}

	const normalizeSkillValues = (...values) => {
		return values
			.flatMap((value) => {
				if (Array.isArray(value)) return value
				if (typeof value === 'string') return value.split(/[;,•·]/)
				return []
			})
			.map((value) => cleanCandidateText(value, 54))
			.filter(Boolean)
			.filter((value, index, array) => array.findIndex((candidate) => candidate.toLowerCase() === value.toLowerCase()) === index)
			.slice(0, 5)
	}

	const normalizeJobRecommendation = (job) => {
		if (!job) return null

		const title = typeof job === 'string'
			? cleanCandidateText(job, 120)
			: cleanCandidateText(firstText(job.title, job.name, job.label, job.metier, job.intitule), 120)

		if (!title) return null

		return {
			title,
			skills: typeof job === 'object'
				? normalizeSkillValues(job.skills, job.competences, job.tags, job.focus)
				: []
		}
	}

	const getFinalSelectionJobRecommendations = () => {
		return orientationSelections
			.filter((selection) => selection.type === 'metier')
			.map((selection) => normalizeJobRecommendation({
				title: selection.title,
				skills: selection.tags
			}))
			.filter(Boolean)
			.slice(0, 6)
	}

	const getFinalSelectionStudyRecommendations = () => {
		return orientationSelections
			.filter((selection) => selection.type === 'formation')
			.map((selection) => ({
				degree: cleanCandidateText(selection.title, 160),
				type: firstText(selection.description, selection.subtitle, inferStudyDescription(selection.title))
			}))
			.filter((study) => study.degree)
			.filter((study, index, array) => array.findIndex((candidate) => candidate.degree.toLowerCase() === study.degree.toLowerCase()) === index)
			.slice(0, 6)
	}

	const buildOrientationDisplayData = (data) => {
		if (!data) return data

		const finalJobs = getFinalSelectionJobRecommendations()
		const finalStudies = getFinalSelectionStudyRecommendations()
		const fallbackJobs = Array.isArray(data.jobRecommendations)
			? data.jobRecommendations.map(normalizeJobRecommendation).filter(Boolean).slice(0, 6)
			: []
		const fallbackStudies = normalizeStudyRecommendations(data.studyRecommendations)

		return {
			...data,
			jobRecommendations: finalJobs.length ? finalJobs : fallbackJobs,
			studyRecommendations: finalStudies.length ? finalStudies : fallbackStudies
		}
	}

	const sanitizeResultsForDisplay = (results) => {
		if (!results || typeof results !== 'object') return results
		const clone = { ...results }
		const isMbti = Boolean(clone.inscriptionResults) || (clone.personalityType && /\(([IE][NS][FT][JP])\)/i.test(clone.personalityType))
		if (Array.isArray(clone.jobRecommendations)) {
			// Filter out items that look like conversational preambles
			clone.jobRecommendations = clone.jobRecommendations.filter(job => {
				const title = (job?.title || '').trim()
				if (title.startsWith('Voici') || title.endsWith(':') || (title.length > 50 && title.toLowerCase().includes('recommandations'))) {
					return false
				}
				return true
			})
			clone.jobRecommendations = clone.jobRecommendations.slice(0, 6)
		} else {
			clone.jobRecommendations = []
		}

		if (Array.isArray(clone.studyRecommendations)) {
			clone.studyRecommendations = clone.studyRecommendations.filter(study => {
				const degree = (study?.degree || '').trim()
				if (degree.startsWith('Voici') || degree.endsWith(':') || (degree.length > 50 && degree.toLowerCase().includes('recommandations'))) {
					return false
				}
				return true
			})
			clone.studyRecommendations = normalizeStudyRecommendations(clone.studyRecommendations)
		} else {
			clone.studyRecommendations = []
		}

		if (isMbti) {
			// clone.skillsAssessment = null // Keep skillsAssessment for "Tes qualités"
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
		if (clone.mbtiResults && typeof clone.mbtiResults === 'object') {
			const mbtiJobs = Array.isArray(clone.mbtiResults.jobRecommendations)
				? clone.mbtiResults.jobRecommendations.slice(0, 6)
				: clone.mbtiResults.jobRecommendations
			clone.mbtiResults = {
				...clone.mbtiResults,
				jobRecommendations: mbtiJobs
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

	const ResultsHeader = () => (
		<section className="results-card results-header">
			<div>
				<h1>Mes résultats</h1>
				<p>Ton bilan d'orientation, en un coup d'œil.</p>
			</div>
			<nav className="results-pill-nav" aria-label="Navigation rapide">
				<Link to="/app/outils" className="results-pill">
					<i className="ph ph-wrench" aria-hidden="true" />
					<span>Outils</span>
				</Link>
				<Link to="/app/formations" className="results-pill">
					<i className="ph ph-graduation-cap" aria-hidden="true" />
					<span>Formations</span>
				</Link>
				<Link to="/app" className="results-pill">
					<i className="ph ph-compass" aria-hidden="true" />
					<span>Conseiller</span>
				</Link>
			</nav>
		</section>
	)

	if (loading) {
		return (
			<div className="results-page">
				<style>{resultsStyles}</style>
				<ResultsHeader />
				<div className="results-card results-state">
					<div className="results-spinner" />
					<p>Chargement... cela peut prendre jusqu'à 40 secondes…</p>
				</div>
			</div>
		)
	}

	if (error) {
		return (
			<div className="results-page">
				<style>{resultsStyles}</style>
				<ResultsHeader />
				<div className="results-card results-state">
					<i className="ph ph-warning-circle" aria-hidden="true" />
					<h3>Erreur</h3>
					<p>{error}</p>
				</div>
			</div>
		)
	}

	if (!analysisData && orientationSelections.length === 0) {
		return (
			<div className="results-page">
				<style>{resultsStyles}</style>
				<ResultsHeader />
				<div className="results-card results-state">
					<i className="ph ph-info" aria-hidden="true" />
					<h3>Aucun résultat disponible</h3>
					<p>Tu n'as pas encore de résultats enregistrés. Une fois le questionnaire complété, tes résultats apparaîtront ici.</p>
					<button type="button" className="results-cta" onClick={() => navigate('/orientation')}>Commencer le parcours</button>
				</div>
			</div>
		)
	}

	const data = buildOrientationDisplayData(analysisData?.inscriptionResults || analysisData)
	const persistedMetiers = orientationSelections.filter((selection) => selection.type === 'metier')
	const restoredMetiers = orientationSelections.length > 0 && persistedMetiers.length === 0
		? (Array.isArray(data?.jobRecommendations) ? data.jobRecommendations : [])
			.map(normalizeJobRecommendation)
			.filter(Boolean)
			.map((job, index) => ({
				id: `analysis-metier-${index}`,
				type: 'metier',
				typeLabel: 'Métier suggéré',
				title: job.title,
				subtitle: '',
				description: '',
				tags: job.skills,
				link: '',
				linkLabel: ''
			}))
		: []
	const displayedSelections = [...orientationSelections, ...restoredMetiers]
	const hasSelections = displayedSelections.length > 0
	const formations = displayedSelections.filter((selection) => selection.type === 'formation')
	const metiers = displayedSelections.filter((selection) => selection.type === 'metier')
	const hasAnalysisDetail = Boolean(data?.personalityAnalysis || data?.skillsAssessment)
	const showFallbackJobs = !hasSelections && Array.isArray(data?.jobRecommendations) && data.jobRecommendations.length > 0
	const showFallbackStudies = !hasSelections && Array.isArray(data?.studyRecommendations) && data.studyRecommendations.length > 0

	return (
		<div className="results-page">
			<style>{resultsStyles}</style>
			<ResultsHeader />

			{personaInfo?.persona && (
				<PersonaRevealCard persona={personaInfo.persona} avatarUrl={personaInfo.avatarUrl} />
			)}

			{hasSelections && (
				<section className="results-card">
					<div className="results-section-head">
						<div>
							<h2>Formations & métiers gardés</h2>
							<p>Ta sélection validée dans le parcours d'orientation.</p>
						</div>
						<div className="results-count-chips">
							<span className="results-chip results-chip-teal">{formations.length} formations</span>
							<span className="results-chip results-chip-orange">{metiers.length} métiers</span>
						</div>
					</div>
					<div className="results-selection-grid">
						{displayedSelections.map((selection) => (
							<div key={selection.id} className={`results-selection-card ${selection.type === 'metier' ? 'is-metier' : 'is-formation'}`}>
								<div className="results-selection-top">
									<span className="results-selection-type">{selection.typeLabel}</span>
									{selection.link && (
										<a href={selection.link} target="_blank" rel="noreferrer" className="results-selection-link">{selection.linkLabel}</a>
									)}
								</div>
								<h3>{selection.title}</h3>
								{selection.subtitle && <p className="results-selection-subtitle">{selection.subtitle}</p>}
								{selection.description && <p className="results-selection-description">{selection.description}</p>}
								{selection.tags.length > 0 && (
									<div className="results-selection-tags">
										{selection.tags.map((tag) => (
											<span key={tag} className="results-selection-tag">{tag}</span>
										))}
									</div>
								)}
							</div>
						))}
					</div>
				</section>
			)}

			{hasAnalysisDetail && (
				<details className="results-card results-details">
					<summary>Voir le détail de mon analyse</summary>
					<div className="results-details-body">
						{data.personalityAnalysis && (
							<div>
								<h3>Ce que ton profil raconte</h3>
								<div className="results-paragraphs">{renderParagraphs(data.personalityAnalysis)}</div>
							</div>
						)}
						{data.skillsAssessment && (
							<div>
								<h3>Tes forces</h3>
								<div className="results-paragraphs">{renderParagraphs(data.skillsAssessment)}</div>
							</div>
						)}
					</div>
				</details>
			)}

			{showFallbackJobs && (
				<section className="results-card">
					<h2>Idées de métiers</h2>
					<div className="results-basic-grid">
						{data.jobRecommendations.map((job, index) => (
							<div key={index} className="results-basic-card is-orange">
								<h3>{job.title}</h3>
								{(job.skills || []).length > 0 && (
									<ul>{job.skills.map((s, i) => <li key={i}>{s}</li>)}</ul>
								)}
							</div>
						))}
					</div>
				</section>
			)}

			{showFallbackStudies && (
				<section className="results-card">
					<h2>Pistes d'études</h2>
					<div className="results-basic-grid">
						{data.studyRecommendations.map((study, index) => (
							<div key={index} className="results-basic-card is-teal">
								<h3>{study.degree}</h3>
								<p>{study.type}</p>
							</div>
						))}
					</div>
				</section>
			)}
		</div>
	)
}

const resultsStyles = `
.results-page {
	--results-lime: #c1ff72;
	--results-pink: #f68fff;
	--results-ink: #111827;
	width: 100%;
	max-width: 900px;
	margin: 0 auto;
	display: flex;
	flex-direction: column;
	gap: 18px;
	padding-bottom: 24px;
	font-family: "Bricolage Grotesque", -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica Neue', Arial, sans-serif;
	color: #000;
}
.results-card {
	position: relative;
	background: #fff;
	border: 1px solid rgba(0,0,0,.06);
	border-radius: 28px;
	box-shadow: 0 26px 60px -30px rgba(0,0,0,.22), 0 2px 10px rgba(0,0,0,.04);
	padding: clamp(20px, 4vw, 32px);
}
.results-card::before {
	content: '';
	position: absolute;
	top: 0;
	left: 30px;
	right: 30px;
	height: 6px;
	border-radius: 0 0 8px 8px;
	background: var(--results-lime);
}
.results-header { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 16px; }
.results-header h1 { margin: 0; font-size: 24px; font-weight: 800; line-height: 1.1; }
.results-header p { margin: 4px 0 0; color: #6b7280; font-size: 14px; }
.results-pill-nav { display: flex; gap: 8px; }
.results-pill {
	display: inline-flex;
	align-items: center;
	gap: 7px;
	min-height: 42px;
	padding: 0 14px;
	border-radius: 999px;
	background: #000;
	color: #fff;
	font-size: 13px;
	font-weight: 700;
	text-decoration: none;
	transition: transform .15s ease;
}
.results-pill:hover { transform: translateY(-2px); }
.results-pill i { font-size: 17px; color: var(--results-lime); }

.results-state { text-align: center; display: flex; flex-direction: column; align-items: center; gap: 8px; }
.results-state i { font-size: 32px; color: #6b7280; }
.results-state h3 { margin: 4px 0 0; font-size: 18px; font-weight: 700; }
.results-state p { margin: 0; color: #6b7280; font-size: 14px; max-width: 420px; }
.results-spinner { width: 26px; height: 26px; border: 3px solid rgba(0,0,0,.12); border-top-color: #000; border-radius: 999px; animation: resultsSpin 0.8s linear infinite; }
@keyframes resultsSpin { to { transform: rotate(360deg); } }
.results-cta {
	margin-top: 6px;
	min-height: 46px;
	padding: 0 22px;
	border-radius: 999px;
	border: 0;
	background: #000;
	color: #fff;
	font-weight: 700;
	font-size: 14px;
	cursor: pointer;
}

.results-section-head { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 18px; }
.results-section-head h2 { margin: 0; font-size: 20px; font-weight: 800; }
.results-section-head p { margin: 4px 0 0; color: #6b7280; font-size: 14px; }
.results-count-chips { display: flex; gap: 8px; font-size: 12px; color: #4b5563; }
.results-chip { padding: 5px 12px; border-radius: 999px; font-weight: 700; }
.results-chip-teal { background: #ecfdf5; border: 1px solid #99f6e4; }
.results-chip-orange { background: #fff7ed; border: 1px solid #fed7aa; }

.results-selection-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 14px; }
.results-selection-card { border-radius: 20px; padding: 18px; border: 1px solid transparent; }
.results-selection-card.is-formation { background: #f0fdfa; border-color: #99f6e4; }
.results-selection-card.is-metier { background: #fff7ed; border-color: #fed7aa; }
.results-selection-top { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; margin-bottom: 8px; }
.results-selection-type { font-size: 11px; font-weight: 800; padding: 4px 10px; border-radius: 999px; background: rgba(255,255,255,.7); text-transform: uppercase; letter-spacing: .03em; }
.results-selection-link { font-size: 12px; font-weight: 700; color: #111827; text-decoration: underline; text-underline-offset: 2px; white-space: nowrap; }
.results-selection-card h3 { margin: 0 0 4px; font-size: 16px; font-weight: 750; }
.results-selection-subtitle { margin: 0; font-size: 13px; color: #4b5563; }
.results-selection-description { margin: 10px 0 0; font-size: 13px; color: #374151; line-height: 1.55; }
.results-selection-tags { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; }
.results-selection-tag { padding: 4px 10px; border-radius: 999px; background: rgba(255,255,255,.7); border: 1px solid rgba(255,255,255,.9); font-size: 11px; color: #374151; }

.results-details summary { cursor: pointer; font-size: 17px; font-weight: 800; list-style: none; }
.results-details summary::-webkit-details-marker { display: none; }
.results-details summary::before { content: '+'; display: inline-block; width: 18px; font-weight: 800; }
.results-details[open] summary::before { content: '−'; }
.results-details-body { margin-top: 16px; display: flex; flex-direction: column; gap: 20px; }
.results-details-body h3 { margin: 0 0 8px; font-size: 15px; font-weight: 750; }
.results-paragraphs { display: flex; flex-direction: column; gap: 10px; color: #374151; font-size: 14px; line-height: 1.6; }

.results-basic-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; margin-top: 14px; }
.results-basic-card { border-radius: 16px; padding: 14px 16px; }
.results-basic-card.is-orange { background: #fff7ed; border: 1px solid #fed7aa; }
.results-basic-card.is-teal { background: #f0fdfa; border: 1px solid #99f6e4; }
.results-basic-card h3 { margin: 0 0 6px; font-size: 14px; font-weight: 750; }
.results-basic-card p, .results-basic-card ul { margin: 0; font-size: 13px; color: #4b5563; }
.results-basic-card ul { padding-left: 18px; }

@media (max-width: 640px) {
	.results-page { gap: 14px; }
	.results-card { padding: 18px; border-radius: 22px; }
	.results-pill { min-height: 38px; font-size: 12px; padding: 0 11px; }
	.results-pill span { display: none; }
}
`

