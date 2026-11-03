import React from 'react'
import { Link } from 'react-router-dom'
import BlogArticleLayout from './BlogArticleLayout'
import { findBlogPost } from './posts.js'

const formatNumber = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 })

function ArticleChart({ chart, id }) {
  return (
    <figure className="editorial-chart" aria-labelledby={`${id}-chart-title`}>
      <figcaption id={`${id}-chart-title`}>{chart.title}</figcaption>
      <p className="editorial-chart__unit">
        {chart.diverging ? 'Évolution des effectifs en %' : `En ${chart.unit}, à partir de zéro`}
      </p>
      <ul className="editorial-chart__rows">
        {chart.rows.map((row) => {
          const width = Math.abs(row.value) / chart.max * (chart.diverging ? 50 : 100)
          const value = `${chart.diverging && row.value > 0 ? '+' : ''}${formatNumber.format(row.value)} ${chart.unit}`
          return (
            <li className="editorial-chart__row" key={row.label}>
              <div className="editorial-chart__label"><span>{row.label}</span><strong>{value}</strong></div>
              <div className={`editorial-chart__track${chart.diverging ? ' editorial-chart__track--diverging' : ''}`} aria-hidden="true">
                <span
                  className={`editorial-chart__bar${row.value < 0 ? ' editorial-chart__bar--negative' : ''}`}
                  style={{ width: `${width}%`, left: chart.diverging ? `${row.value < 0 ? 50 - width : 50}%` : 0 }}
                />
              </div>
            </li>
          )
        })}
      </ul>
      <p className="editorial-chart__note">{chart.note}</p>
    </figure>
  )
}

function ArticleTable({ table }) {
  return (
    <div className="editorial-table">
      <table>
        <caption>{table.caption}</caption>
        <thead><tr>{table.columns.map((column) => <th key={column} scope="col">{column}</th>)}</tr></thead>
        <tbody>
          {table.rows.map(([label, ...cells]) => (
            <tr key={label}>
              <th scope="row">{label}</th>
              {cells.map((cell, index) => <td key={index}>{cell}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function BlogEditorialArticle({ slug }) {
  const post = findBlogPost(slug)

  return (
    <BlogArticleLayout post={post}>
      <section className="editorial-summary" aria-label="En bref">
        <p className="editorial-kicker"><i className="ph ph-lightning" aria-hidden="true" /> En bref</p>
        <p>{post.summary}</p>
      </section>

      {post.sections.map((section) => (
        <section id={section.id} key={section.id} className="editorial-section">
          <h2>{section.heading}</h2>
          {section.paragraphs?.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
          {section.bullets && <ul>{section.bullets.map((bullet) => <li key={bullet}>{bullet}</li>)}</ul>}
          {section.table && <ArticleTable table={section.table} />}
          {section.chart && <ArticleChart chart={section.chart} id={section.id} />}
          {section.conclusion && <p>{section.conclusion}</p>}
          {section.links && (
            <div className="editorial-inline-links">
              {section.links.map((link) => <Link key={link.slug} to={`/blog/${link.slug}`}>{link.label} <span aria-hidden="true">→</span></Link>)}
            </div>
          )}
        </section>
      ))}

      <section id="parents" className="editorial-parents">
        <p className="editorial-kicker">Le mot pour les parents</p>
        <h2>Comment en parler en famille ?</h2>
        <p>{post.parents}</p>
      </section>

      <section id="faq" className="editorial-faq">
        <h2>Les questions que tu te poses encore ?</h2>
        {post.faq.map(({ question, answer }) => (
          <details key={question}>
            <summary>{question}</summary>
            <p>{answer}</p>
          </details>
        ))}
      </section>

      {post.videoUrl && (
        <section className="editorial-video">
          <h2>Tu préfères le format vidéo ?</h2>
          <a href={post.videoUrl} target="_blank" rel="noopener noreferrer">{post.videoTitle} <span aria-hidden="true">↗</span></a>
        </section>
      )}

      <section id="sources" className="editorial-sources">
        <h2>Quelles sont nos sources ?</h2>
        <p>Les repères de cet article sont datés du {post.publishedAt}. Les calendriers et mesures annoncées peuvent évoluer : consulte les sources officielles pour les mises à jour.</p>
        <ul>
          {post.sources.map((source) => (
            <li key={source.label}><a href={source.url} target="_blank" rel="noopener noreferrer">{source.label}<span className="sr-only"> (nouvel onglet)</span></a></li>
          ))}
        </ul>
      </section>

      <section id="a-lire-aussi" className="editorial-related">
        <h2>Que lire ensuite ?</h2>
        <div className="editorial-related__grid">
          {post.related.map((relatedSlug) => {
            const related = findBlogPost(relatedSlug)
            return (
              <Link key={related.slug} to={`/blog/${related.slug}`}>
                <span>{related.category} · {related.readingTime}</span>
                <strong>{related.title}</strong>
                <span>Lire l’article <span aria-hidden="true">→</span></span>
              </Link>
            )
          })}
        </div>
      </section>
    </BlogArticleLayout>
  )
}
