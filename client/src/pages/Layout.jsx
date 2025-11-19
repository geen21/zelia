import React, { useMemo, useState, useEffect, useRef } from 'react'
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { fetchProgression } from '../lib/progression'
import { supportAPI } from '../lib/api'

export default function Layout() {
	const nav = useNavigate()
	const loc = useLocation()
	const [sidebarOpen, setSidebarOpen] = useState(false)
	const [dropdownOpen, setDropdownOpen] = useState(false)
	const dropdownRef = useRef(null)
  const [level, setLevel] = useState(1)
	const [bugOpen, setBugOpen] = useState(false)
	const [bugTitle, setBugTitle] = useState('')
	const [bugDesc, setBugDesc] = useState('')
	const [bugSending, setBugSending] = useState(false)
	const [bugSent, setBugSent] = useState(false)

	useEffect(() => {
		function handleClickOutside(event) {
			if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
				setDropdownOpen(false)
			}
		}
		document.addEventListener('mousedown', handleClickOutside)
		return () => document.removeEventListener('mousedown', handleClickOutside)
	}, [])

	// Load user's progression level ("niveau")
	useEffect(() => {
		let mounted = true
		;(async () => {
			try {
				const prog = await fetchProgression()
				if (mounted && prog && Number.isFinite(Number(prog.level))) {
					setLevel(Number(prog.level) || 1)
				}
			} catch {
				// Default level stays at 1
			}
		})()
		return () => { mounted = false }
	}, [])

	const active = (path) => {
		if (path === '/app') {
			// For dashboard, check if we're exactly at /app or /app/
			return loc.pathname === '/app' || loc.pathname === '/app/'
		}
		return loc.pathname.startsWith(path)
	}
	const crumbs = useMemo(() => {
	const map = [
			{ match: '/app/profile', label: 'Profil' },
			{ match: '/app/formations', label: 'Formations' },
			{ match: '/app/emplois', label: 'Emplois' },
			{ match: '/app/activites', label: 'Activités' },
			{ match: '/app/lettre', label: 'Lettre' },
			{ match: '/app/chat', label: 'Chat' },
			{ match: '/app/results', label: 'Résultats' },
		]
		const found = map.find(m => loc.pathname.startsWith(m.match))
	return ['\u200B', found?.label || 'Activités']
	}, [loc.pathname])

	function logout() {
		localStorage.removeItem('token')
		localStorage.removeItem('supabase_auth_token')
		nav('/')
	}

	// Unlock thresholds by section
	const thresholds = {
		activites: 1,
		formations: 6,
		emplois: 9,
		lettre: 12,
		chat: 15,
	}

	const isUnlocked = (required) => Number(level) >= Number(required)

	return (
		<div className="min-h-screen bg-white text-text-primary">
				<BugModal
					open={bugOpen}
					onClose={() => { if (!bugSending) setBugOpen(false) }}
							onSubmit={async ()=>{
						try {
							setBugSending(true)
							const payload = {
								title: bugTitle,
								description: bugDesc,
								location: window.location?.href,
								userAgent: navigator.userAgent
							}
									await supportAPI.reportBug(payload)
							setBugSent(true)
							setBugTitle('')
							setBugDesc('')
							setTimeout(()=>{ setBugOpen(false); setBugSent(false); }, 1200)
						} catch (e) {
									// fallback to mailto if backend not reachable (e.g., 404 on prod host)
									const subject = encodeURIComponent(bugTitle || 'Bug report (Version Alpha)')
									const body = encodeURIComponent(`${bugDesc}\n\nURL: ${window.location?.href}\nUA: ${navigator.userAgent}`)
									window.location.href = `mailto:nicolas.wiegele@zelia.io?subject=${subject}&body=${body}`
						} finally {
							setBugSending(false)
						}
					}}
					title={bugTitle}
					setTitle={setBugTitle}
					desc={bugDesc}
					setDesc={setBugDesc}
					sending={bugSending}
					sent={bugSent}
				/>
			{/* Sidebar */}
			<aside className={`fixed top-0 left-0 h-full w-64 bg-white border-r border-line z-40 transition-transform ${sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}>
				<div className="h-full flex flex-col">
					<div className="h-16 flex items-center justify-between px-6 border-b border-line">
						<Link to="/app" className="flex items-center justify-center">
							<img src="/static/images/logo-dark.png" alt="Logo" className="h-8" />
						</Link>
						<button className="md:hidden p-2 rounded-lg hover:bg-gray-50" onClick={() => setSidebarOpen(false)} aria-label="Fermer la sidebar">
							<i className="ph ph-x text-xl"></i>
						</button>
					</div>
					<nav className="py-4 flex-1 overflow-y-auto flex flex-col">
					{/* Activités is always accessible */}
					<SidebarLink
						to="/app"
						icon="ph-activity"
						active={active('/app')}
						onClick={() => setSidebarOpen(false)}
						locked={false}
					>
						Activités
					</SidebarLink>
					{/* Formations - unlock at level 6 */}
								<SidebarLink
						to="/app/formations"
						icon="ph-graduation-cap"
						active={active('/app/formations')}
						onClick={() => setSidebarOpen(false)}
						locked={!isUnlocked(thresholds.formations)}
									lockTitle={`Niveau ${thresholds.formations}`}
					>
						Formations
					</SidebarLink>
					{/* Emplois - unlock at level 9 */}
								<SidebarLink
						to="/app/emplois"
						icon="ph-briefcase"
						active={active('/app/emplois')}
						onClick={() => setSidebarOpen(false)}
						locked={!isUnlocked(thresholds.emplois)}
									lockTitle={`Niveau ${thresholds.emplois}`}
					>
						Emplois
					</SidebarLink>
					{/* Lettre de motivation - unlock at level 12 */}
								<SidebarLink
						to="/app/lettre"
						icon="ph-file-text"
						active={active('/app/lettre')}
						onClick={() => setSidebarOpen(false)}
						locked={!isUnlocked(thresholds.lettre)}
									lockTitle={`Niveau ${thresholds.lettre}`}
					>
						Lettre de motivation
					</SidebarLink>
					{/* Chat - unlock at level 15 */}
								<SidebarLink
									to="/app/chat"
									icon="ph-chats"
									active={active('/app/chat')}
									onClick={() => setSidebarOpen(false)}
									locked={!isUnlocked(thresholds.chat)}
									lockTitle={`Niveau ${thresholds.chat}`}
								>
									Chat
								</SidebarLink>
								<div className="mt-auto">
									<SidebarLink
										to="/app/results"
										icon="ph-chart-line-up"
										active={active('/app/results')}
										onClick={() => setSidebarOpen(false)}
									>
										Mes resultats
									</SidebarLink>
								</div>
					</nav>
					<div className="px-6 pb-3 pt-2 border-t border-line flex flex-col items-center gap-2 text-text-secondary">
						{/* Alpha badge + Report bug */}
						<div className="flex items-center gap-2 text-[11px] uppercase tracking-wide">
							<span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-[#f68fff] text-[#f68fff]">
								<span className="inline-block w-1.5 h-1.5 rounded-full bg-[#f68fff]"></span>
								Version Alpha
							</span>
							<button onClick={() => setBugOpen(true)} className="text-[#f68fff] hover:underline">Signaler un bug</button>
						</div>

						<div className="flex items-center justify-center gap-3">
						<Link to="/legal/mentions-legales" className="group inline-flex h-7 w-7 items-center justify-center rounded-full border border-line transition-colors hover:border-black hover:text-black" title="Mentions légales" aria-label="Mentions légales">
							<i className="ph ph-identification-card text-sm"></i>
						</Link>
						<Link to="/legal/conditions" className="group inline-flex h-7 w-7 items-center justify-center rounded-full border border-line transition-colors hover:border-black hover:text-black" title="CGU &amp; politique de confidentialité" aria-label="CGU et politique de confidentialité">
							<i className="ph ph-shield-check text-sm"></i>
						</Link>
						</div>
					</div>
				</div>
			</aside>

			{/* Header */}
			<header className="sticky top-0 z-30 bg-white/80 backdrop-blur border-b border-line md:pl-64">
				<div className="h-16 flex items-center justify-between px-4 sm:px-6">
					<div className="flex items-center gap-3">
						<button className="md:hidden p-2 rounded-lg border border-line" onClick={() => setSidebarOpen(!sidebarOpen)} aria-label="Toggle sidebar">
							<i className="ph ph-list text-xl"></i>
						</button>
						<nav className="text-sm text-text-secondary">
							<span className="text-text-primary font-medium">{crumbs[1]}</span>
						</nav>
					</div>
					<div className="flex items-center gap-3">
						<div className="hidden md:flex items-center gap-2 px-3 py-2 border border-line rounded-lg w-72">
							<i className="ph ph-magnifying-glass text-text-secondary"></i>
							<input className="w-full outline-none text-sm bg-transparent" placeholder="Search shop" />
							<span className="text-xs text-text-secondary">⌘ K</span>
						</div>
						<button className="p-2 rounded-lg hover:bg-gray-50" aria-label="Notifications">
							<i className="ph ph-bell text-xl"></i>
						</button>
						<div className="relative" ref={dropdownRef}>
							<button className="flex items-center gap-2 p-1 rounded-lg hover:bg-gray-50" onClick={() => setDropdownOpen(!dropdownOpen)}>
								<img src="/static/images/logo-dark.png" className="w-8 h-8 rounded-full bg-white p-1" alt="Avatar" />
								<span className="hidden sm:block text-sm">Utilisateur</span>
								<i className="ph ph-caret-down"></i>
							</button>
							{dropdownOpen && (
								<div className="absolute right-0 top-full mt-2 w-48 bg-white border border-line rounded-lg shadow-lg z-50">
									<div className="py-1">
										<Link to="/app/profile" onClick={() => setDropdownOpen(false)} className="w-full text-left px-4 py-2 text-sm hover:bg-gray-50 flex items-center gap-2">
											<i className="ph ph-user"></i>
											Profil
										</Link>
										<button onClick={logout} className="w-full text-left px-4 py-2 text-sm hover:bg-gray-50 flex items-center gap-2">
											<i className="ph ph-sign-out"></i>
											Déconnexion
										</button>
									</div>
								</div>
							)}
						</div>
					</div>
				</div>
			</header>

			{/* Main content */}
			<main className="md:pl-64">
				<div className="px-4 sm:px-6 py-6">
					<Outlet />
				</div>
			</main>
		</div>
	)
}

function SidebarLink({ to, icon, active, children, onClick, locked = false, lockTitle = '' }){
	const handleClick = (e) => {
		if (locked) {
			e.preventDefault()
			e.stopPropagation()
		}
		if (onClick) onClick(e)
	}

	return (
		<Link
			to={to}
			onClick={handleClick}
			aria-disabled={locked}
			title={locked ? lockTitle : undefined}
			className={`group flex items-center gap-3 px-4 py-2.5 text-sm text-text-primary relative ${active ? 'bg-gray-50' : 'hover:bg-gray-50'} ${locked ? 'pointer-events-auto select-none' : ''}`}
		>
			<span className={`absolute left-0 top-0 h-full w-1 ${active ? 'bg-black' : 'bg-transparent'} rounded-r`}></span>
			<div className={`flex items-center gap-3 ${locked ? 'blur-[1px] opacity-60' : ''}`}>
				<i className={`ph ${icon} text-lg ${active ? 'text-black' : 'text-text-secondary'} group-hover:text-black`}></i>
				<span className={`${active ? 'font-medium' : ''}`}>{children}</span>
			</div>
					{locked && (
						<div className="absolute inset-0 flex items-center justify-end pr-3">
							<span className="inline-flex items-center gap-1 text-xs text-text-secondary bg-gray-100 border border-line rounded-full px-2 py-0.5">
								<span className="inline-block h-2 w-2 rounded-full bg-[#f68fff]"></span>
								{lockTitle}
							</span>
						</div>
					)}
		</Link>
	)
}

function BugModal({ open, onClose, onSubmit, title, setTitle, desc, setDesc, sending, sent }){
	if (!open) return null
	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
			<div className="bg-white w-full max-w-lg rounded-xl border border-line shadow-lg p-5">
				<div className="flex items-center justify-between mb-3">
					<h3 className="text-lg font-semibold">Signaler un bug</h3>
					<button className="p-1 hover:bg-gray-100 rounded" onClick={onClose} aria-label="Fermer">
						<i className="ph ph-x"></i>
					</button>
				</div>
				<div className="space-y-3">
					<div>
						<label className="block text-sm text-text-secondary mb-1">Titre (optionnel)</label>
						<input className="w-full border border-line rounded-lg px-3 py-2" value={title} onChange={(e)=>setTitle(e.target.value)} placeholder="Ex: Erreur lors de l'enregistrement" />
					</div>
					<div>
						<label className="block text-sm text-text-secondary mb-1">Description</label>
						<textarea className="w-full border border-line rounded-lg px-3 py-2 min-h-[120px]" value={desc} onChange={(e)=>setDesc(e.target.value)} placeholder="Décrivez brièvement le problème rencontré"></textarea>
					</div>
				</div>
				<div className="flex items-center justify-end gap-2 mt-4">
					<button className="h-10 px-4 rounded-lg border border-line" onClick={onClose} disabled={sending}>Annuler</button>
					<button className="h-10 px-4 rounded-lg bg-[#f68fff] text-white disabled:opacity-60" onClick={onSubmit} disabled={sending || !desc.trim()}>
						{sending ? 'Envoi…' : (sent ? 'Envoyé' : 'Envoyer')}
					</button>
				</div>
			</div>
		</div>
	)
}
