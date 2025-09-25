import React, { useEffect, useState } from 'react'
import axios from 'axios'

export default function Profile() {
	const [resultsContent, setResultsContent] = useState('')
	const [loading, setLoading] = useState(true)
	const [error, setError] = useState('')
	const [userInfo, setUserInfo] = useState(null)
	const token = localStorage.getItem('token')

	useEffect(() => {
		(async () => {
			try {
				// Fetch results content
				const { data: resultsData } = await axios.get('/api/results/latest', { headers: { Authorization: `Bearer ${token}` } })
				setResultsContent(resultsData.content)

				// Fetch user profile information
				const { data: profileData } = await axios.get('/api/auth/profile', { headers: { Authorization: `Bearer ${token}` } })
				setUserInfo(profileData)
			} catch (e) {
				setError("Impossible de charger les informations du profil.")
			} finally {
				setLoading(false)
			}
		})()
	}, [])

	if (loading) return (
		<div className="space-y-6">
			<div>
				<h1 className="text-2xl font-bold">Mon Profil</h1>
				<p className="text-text-secondary">Informations personnelles et résultats d'analyse</p>
			</div>
			<div className="bg-surface border border-line rounded-xl shadow-card p-8 text-center">
				<div className="inline-block w-6 h-6 border-2 border-black border-t-transparent rounded-full animate-spin"></div>
				<p className="mt-2 text-text-secondary">Chargement...</p>
			</div>
		</div>
	)

	if (error) return (
		<div className="space-y-6">
			<div>
				<h1 className="text-2xl font-bold">Mon Profil</h1>
				<p className="text-text-secondary">Informations personnelles et résultats d'analyse</p>
			</div>
			<div className="bg-surface border border-line rounded-xl shadow-card p-8 text-center">
				<div className="text-red-600 text-4xl">!</div>
				<p className="mt-2 text-text-secondary">{error}</p>
			</div>
		</div>
	)

	// Split results sections by ### headings
	const blocks = resultsContent ? resultsContent.split(/\n?###/).filter(Boolean).map(b => '###'+b) : []

	return (
		<div className="space-y-6">
			<div>
				<h1 className="text-2xl font-bold">Mon Profil</h1>
				<p className="text-text-secondary">Informations personnelles et résultats d'analyse</p>
			</div>

			{/* Profile Information Section */}
			<div className="bg-surface border border-line rounded-xl shadow-card p-6">
				<div className="flex items-start gap-6">
					<div className="flex-shrink-0">
						<img
							src={localStorage.getItem('avatar_url') || "/static/images/logo-dark.png"}
							alt="Avatar"
							className="w-20 h-20 rounded-full border-2 border-line bg-white p-2"
						/>
					</div>
					<div className="flex-grow">
						<h2 className="text-xl font-semibold mb-4">Informations personnelles</h2>
						<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
							<div>
								<label className="block text-sm text-text-secondary mb-1">Prénom</label>
								<p className="text-text-primary font-medium">{userInfo?.prenom || 'Non spécifié'}</p>
							</div>
							<div>
								<label className="block text-sm text-text-secondary mb-1">Nom</label>
								<p className="text-text-primary font-medium">{userInfo?.nom || 'Non spécifié'}</p>
							</div>
							<div>
								<label className="block text-sm text-text-secondary mb-1">Email</label>
								<p className="text-text-primary font-medium">{userInfo?.email || 'Non spécifié'}</p>
							</div>
							<div>
								<label className="block text-sm text-text-secondary mb-1">Type de profil</label>
								<p className="text-text-primary font-medium">{userInfo?.profile_type === 'student' ? 'Étudiant' : 'Entreprise'}</p>
							</div>
							{userInfo?.profile_type === 'student' && (
								<>
									<div>
										<label className="block text-sm text-text-secondary mb-1">Âge</label>
										<p className="text-text-primary font-medium">{userInfo?.age || 'Non spécifié'}</p>
									</div>
									<div>
										<label className="block text-sm text-text-secondary mb-1">Département</label>
										<p className="text-text-primary font-medium">{userInfo?.departement || 'Non spécifié'}</p>
									</div>
									<div>
										<label className="block text-sm text-text-secondary mb-1">École/Formation</label>
										<p className="text-text-primary font-medium">{userInfo?.ecole || 'Non spécifié'}</p>
									</div>
									<div>
										<label className="block text-sm text-text-secondary mb-1">Genre</label>
										<p className="text-text-primary font-medium">{userInfo?.genre || 'Non spécifié'}</p>
									</div>
								</>
							)}
							{userInfo?.profile_type === 'company' && (
								<div>
									<label className="block text-sm text-text-secondary mb-1">Nom de l'entreprise</label>
									<p className="text-text-primary font-medium">{userInfo?.nom_company || 'Non spécifié'}</p>
								</div>
							)}
						</div>
					</div>
				</div>
			</div>

			{/* Results Section */}
			{blocks.length > 0 && (
				<div className="space-y-4">
					<h2 className="text-xl font-semibold">Mes Résultats d'Analyse</h2>
					<p className="text-text-secondary">Analyse générée par IA selon vos réponses au questionnaire</p>

					<div className="grid grid-cols-1 gap-4">
						{blocks.map((block, i) => (
							<div key={i} className="bg-surface border border-line rounded-xl shadow-card p-4">
								<ResultsSection block={block} />
							</div>
						))}
					</div>
				</div>
			)}

			{blocks.length === 0 && (
				<div className="bg-surface border border-line rounded-xl shadow-card p-8 text-center">
					<div className="text-text-secondary text-4xl mb-2">📊</div>
					<h3 className="text-lg font-semibold mb-2">Aucun résultat disponible</h3>
					<p className="text-text-secondary">Complétez le questionnaire pour obtenir votre analyse personnalisée.</p>
				</div>
			)}
		</div>
	)
}

function ResultsSection({ block }) {
	const [title, ...rest] = block.split('\n')
	const body = rest.join('\n').trim()
	return (
		<div>
			<h3 className="text-lg font-semibold mb-2">{title.replace(/^###/, '')}</h3>
			{title.includes("Recommandations d'emploi") || title.includes("Recommandations de formation") || title.includes("Recommandations d'études")
				? <div className="bg-gray-50 border border-line p-3 rounded-lg whitespace-pre-wrap">{body}</div>
				: <p className="mb-0 whitespace-pre-wrap">{body}</p>}
		</div>
	)
}
