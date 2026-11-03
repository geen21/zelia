import React, { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import SEO from '../../components/SEO'
import BlogHeaderNav from '../blog/BlogHeaderNav'
import { directoryPath, metierPath, validateMetierContent, metierWordCount } from '../../lib/metierContent.js'
import { metierDataPath, metierDocumentSeo } from './metierSeo.js'
import './metiers.css'

const initialData = typeof document === 'undefined' ? null :
  JSON.parse(document.getElementById('zelia-metier-data')?.textContent || 'null')

function Card({ entry }) {
  return <Link className="metier-card" to={metierPath(entry)}>
    <span className="metier-card__icon" aria-hidden="true">↗</span>
    <h2>{entry.title}</h2><p>Un métier d’avenir à l’heure de l’IA ?</p>
    <span className="metier-card__link">Découvrir le métier <span aria-hidden="true">→</span></span>
  </Link>
}

function Citations({ ids, sources }) {
  return <p className="metier-citations">Repères documentaires : {ids.map((id) => {
    const index = sources.findIndex((source) => source.id === id)
    return <a key={id} href={`#source-${id}`} aria-label={`Source : ${sources[index].name}`}>[{index + 1}]</a>
  })}</p>
}

export default function MetierPage({ initialDocument }) {
  const location = useLocation()
  const path = location.pathname.endsWith('/') ? location.pathname : `${location.pathname}/`
  const bootstrap = initialDocument || initialData
  const [state, setState] = useState({ path, data: bootstrap?.path === path ? bootstrap : null })
  const [attempt, setAttempt] = useState(0)
  const data = state.path === path ? state.data : bootstrap?.path === path ? bootstrap : null
  useEffect(() => {
    if (bootstrap?.path === path && attempt === 0) {
      setState({ path, data: bootstrap })
      return
    }
    const controller = new AbortController()
    setState({ path, data: null })
    ;(async () => {
      let url
      try { url = metierDataPath(path) } catch {
        setState({ path, missing: true })
        return
      }
      try {
        const response = await fetch(url, { signal: controller.signal, cache: 'no-cache' })
        if (response.status === 404) { setState({ path, missing: true }); return }
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        const result = await response.json()
        if (result.path !== path || !['directory', 'detail'].includes(result.kind)) throw new Error('Données métier invalides')
        if (result.kind === 'detail') validateMetierContent(result.page.content)
        setState({ path, data: result })
      } catch (error) {
        if (error.name !== 'AbortError') {
          console.error('Chargement métier :', error)
          setState({ path, error: 'Cette fiche ne peut pas être chargée pour le moment.' })
        }
      }
    })()
    return () => controller.abort()
  }, [path, attempt, bootstrap])

  const seo = data ? metierDocumentSeo(data) : { title: 'Métiers | Zélia', noindex: true, url: `https://zelia.io${path}` }
  const jobName = data?.kind === 'detail' ? data.page.title.charAt(0).toLowerCase() + data.page.title.slice(1) : ''
  const jobPreposition = /^[aeiouyhàâäéèêëîïôöùûüœ]/i.test(jobName) ? 'd’' : 'de '
  return <div className="metiers-page">
    <SEO {...seo} noindex={!data || data.preview || Boolean(location.search)} />
    <a className="metier-skip" href="#metier-content">Aller au contenu</a>
    <BlogHeaderNav />
    <main id="metier-content" className="metier-container">
      {!data ? <section className="metier-empty">
        {state.path === path && state.missing ? <>
          <p className="metier-eyebrow">On explore une autre piste ?</p>
          <h1>Ce métier n’est pas disponible</h1>
          <p>Cette adresse ne correspond pas à une fiche publiée.</p>
          <Link className="metier-button" to="/metiers/">Explorer les métiers</Link>
        </> : state.path === path && state.error ? <>
          <h1>Un petit contretemps</h1><p role="alert">{state.error}</p>
          <button className="metier-button" onClick={() => setAttempt((value) => value + 1)}>Réessayer</button>
        </> : <p role="status">Les métiers arrivent…</p>}
      </section> : <>
        <nav className="metier-breadcrumb" aria-label="Fil d’Ariane">
          <Link to="/">Accueil</Link><span aria-hidden="true">/</span>
          {data.kind === 'detail' ? <><Link to="/metiers/">Métiers</Link><span aria-hidden="true">/</span><span>{data.page.title}</span></> : <span>Métiers{data.number > 1 ? ` · Page ${data.number}` : ''}</span>}
        </nav>
        {data.preview && <p className="metier-preview" role="note">Prévisualisation · échantillon à valider · pages non indexables</p>}
        {data.kind === 'directory' ? <>
          <header className="metier-hero">
            <p className="metier-eyebrow">Ton futur, pas une case</p>
            <h1>Un métier d’avenir.<br /><span>Et pourquoi pas le tien ?</span></h1>
            <p>Découvre les métiers et comment l’intelligence artificielle les transforme. Ensuite, on regarde ensemble ce qui te ressemble.</p>
            <Link to="/orientation" className="metier-button">Trouver ma voie <span aria-hidden="true">↗</span></Link>
          </header>
          <p className="metier-count">{data.total.toLocaleString('fr-FR')} métiers à explorer · page {data.number} sur {data.totalPages}</p>
          <div className="metier-grid">{data.entries.map((entry) => <Card key={entry.slug} entry={entry} />)}</div>
          <nav className="metier-pagination" aria-label="Pages des métiers">
            {data.number > 1 && <Link rel="prev" to={directoryPath(data.number - 1)}>← Page précédente</Link>}
            <span aria-current="page">Page {data.number}</span>
            {data.number < data.totalPages && <Link rel="next" to={directoryPath(data.number + 1)}>Page suivante →</Link>}
          </nav>
        </> : <>
          <header className="metier-hero metier-hero--detail">
            <p className="metier-eyebrow">Les métiers, version demain{data.page.content.version === 2 ? ` · ${Math.ceil(metierWordCount(data.page.content) / 200)} min de lecture` : ''}</p>
            <h1>Est-ce que le métier {jobPreposition}<span>{jobName}</span> est un métier d’avenir ?</h1>
            <p>{data.page.content.summary}</p>
          </header>
          <div className="metier-detail-grid">
            <article className={`metier-verdict${data.page.content.verdict === 'NON' ? ' metier-verdict--non' : ''}`} aria-labelledby="metier-verdict-title">
              <p className="metier-eyebrow">L’éclairage Zélia · à l’heure de l’IA</p>
              <h2 id="metier-verdict-title">{data.page.content.verdict === 'OUI' ? 'Oui' : 'Non'}<span aria-hidden="true">.</span></h2>
              <p className="metier-explanation">{data.page.content.explanation}</p>
              <p className="metier-disclaimer">Appréciation générée par IA le <time dateTime={data.page.updatedAt}>{new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris' }).format(new Date(data.page.updatedAt))}</time>. Perspectives générales en France, pas une garantie d’emploi ni une mesure des recrutements actuels.</p>
            </article>
            <aside className="metier-orientation">
              <span className="metier-sticker" aria-hidden="true">C’est toi qui choisis ✳</span>
              <h2>Un métier d’avenir,<br />c’est aussi un métier pour toi.</h2>
              <p>Tes envies, tes forces, ta façon d’avancer : découvre les pistes qui te ressemblent, sans pression.</p>
              <Link to="/orientation" className="metier-button">Découvrir si ce métier me correspond <span aria-hidden="true">↗</span></Link>
              <small>Gratuit · à ton rythme</small>
            </aside>
          </div>
          {data.page.content.version === 2 && <nav className="metier-toc" aria-label="Sommaire de la fiche">
            <h2>Pour aller plus loin</h2>
            <ol>
              {data.page.content.sections.map((section) => <li key={section.id}><a href={`#${section.id}`}>{section.heading}</a></li>)}
              <li><a href="#questions-frequentes">Tes questions, nos réponses</a></li>
              <li><a href="#sources-metier">Les sources</a></li>
            </ol>
          </nav>}
          <div className="metier-facts">
            {[['missions', 'Au quotidien'], ['skills', 'Les compétences utiles'], ['access', 'Pour y accéder']].map(([key, title]) =>
              <section key={key}><h2>{title}</h2><ul>{data.page.content[key].map((item) => <li key={item}>{item}</li>)}</ul></section>)}
          </div>
          <p className="metier-method">Ces repères décrivent le métier, pas une offre d’emploi. Les anciennes annonces ne permettent pas de connaître les postes disponibles aujourd’hui.</p>
          {data.page.content.version === 2 && <article className="metier-editorial" aria-label={`Comprendre le métier : ${data.page.title}`}>
            {data.page.content.sections.map((section) => <section id={section.id} key={section.id}>
              {section.id === 'intelligence-artificielle' && <p className="metier-eyebrow">Analyse prospective · pas une prévision de recrutement</p>}
              <h2>{section.heading}</h2>
              {section.paragraphs.map((text, index) => <p key={index}>{text}</p>)}
              <Citations ids={section.sourceIds} sources={data.page.content.sources} />
            </section>)}
            <section id="questions-frequentes" className="metier-faq">
              <h2>Tes questions sur le métier {jobPreposition}{jobName}</h2>
              {data.page.content.faq.map((item) => <details key={item.question}>
                <summary>{item.question}</summary><p>{item.answer}</p>
                <Citations ids={item.sourceIds} sources={data.page.content.sources} />
              </details>)}
            </section>
            <section id="sources-metier" className="metier-sources">
              <h2>Sur quoi s’appuie cette fiche ?</h2>
              <p>Les repères factuels s’appuient sur les documents ci-dessous. Le verdict et les perspectives restent une analyse générée par IA, pas une conclusion officielle de ces organismes. L’étude de l’OIT porte sur l’exposition des tâches à l’échelle internationale : elle ne mesure pas les recrutements français actuels.</p>
              <ol>{data.page.content.sources.map((source) => <li key={source.id} id={`source-${source.id}`}>
                <a href={source.url} target="_blank" rel="noopener noreferrer">{source.name}<span className="sr-only"> (nouvel onglet)</span></a>
                <span>Consultée le <time dateTime={source.checkedAt}>{new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris' }).format(new Date(source.checkedAt))}</time></span>
              </li>)}</ol>
            </section>
          </article>}
          {data.related.length > 0 && <section className="metier-related"><h2>D’autres pistes à découvrir</h2>
            <div className="metier-grid">{data.related.map((entry) => <Card key={entry.slug} entry={entry} />)}</div>
          </section>}
        </>}
        <footer className="metier-footer"><Link to="/metiers/">Tous les métiers</Link><Link to="/orientation">Explorer mon orientation</Link><Link to="/blog">Les conseils Zélia</Link></footer>
      </>}
    </main>
  </div>
}
