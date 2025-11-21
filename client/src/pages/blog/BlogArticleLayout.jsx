import React, { useMemo } from 'react'
import { Link } from 'react-router-dom'
import BlogHeaderNav from './BlogHeaderNav'
import SEO from '../../components/SEO'

export default function BlogArticleLayout({ post, children, aside }) {
  if (!post) return null

  const categoryIcon = useMemo(() => {
    const icons = {
      'Futur du travail': 'ph-planet',
      'Méthodologie': 'ph-compass',
      'Vie familiale': 'ph-users-three'
    }
    return icons[post.category] || 'ph-sparkle'
  }, [post.category])

  return (
    <article className="blog-article" style={{ '--accent': post.accent, '--accent-soft': post.accentSoft }}>
      <SEO 
        title={`${post.title} - Blog Zelia`}
        description={post.description}
        url={`https://zelia.io/blog/${post.slug}`}
        type="article"
      />
      <BlogHeaderNav />
      <header className="blog-article__hero">
        <div className="container">
          <nav className="blog-article__breadcrumb" aria-label="Fil d'Ariane">
            <Link to="/blog" className="blog-article__breadcrumb-link">
              <i className="ph ph-book-open" aria-hidden="true"></i>
              <span>Blog Zélia</span>
            </Link>
            <span className="blog-article__breadcrumb-separator" aria-hidden="true">/</span>
            <span className="blog-article__breadcrumb-current">
              <i className={`ph ${categoryIcon}`} aria-hidden="true"></i>
              <span>{post.category}</span>
            </span>
          </nav>
          <div className="blog-article__chips">
            <span className="blog-article__chip">
              <i className={`ph ${categoryIcon}`} aria-hidden="true"></i>
              <span>{post.category}</span>
            </span>
            <span className="blog-article__chip">
              <i className="ph ph-timer" aria-hidden="true"></i>
              <span>{post.readingTime}</span>
            </span>
          </div>
          <h1 className="blog-article__title">{post.title}</h1>
          <p className="blog-article__excerpt">{post.description}</p>
          <div className="blog-article__meta">
            <span className="blog-article__date">
              <i className="ph ph-calendar" aria-hidden="true"></i>
              <span>Publié — {post.publishedAt}</span>
            </span>
            <span className="blog-article__status">
              <i className="ph ph-pencil-circle" aria-hidden="true"></i>
              <span>Brouillon à enrichir</span>
            </span>
          </div>
          <div className="blog-article__hero-divider" aria-hidden="true"></div>
        </div>
      </header>

      <div className="blog-article__body">
        <div className="container">
          <div className="blog-article__grid">
            <main className="blog-article__main" id="contenu-article">
              {children}
            </main>
            <aside className="blog-article__aside" aria-label="Récapitulatif de l'article">
              <div className="blog-article__card">
                <h3>
                  <i className="ph ph-sparkle" aria-hidden="true"></i>
                  <span>En deux mots</span>
                </h3>
                <p>{post.description}</p>
              </div>
              {aside}
              <div className="blog-article__card blog-article__card--cta">
                <h4>
                  <i className="ph ph-rocket-launch" aria-hidden="true"></i>
                  <span>À faire ensuite</span>
                </h4>
                <ul>
                  <li>Compléter la rédaction définitive.</li>
                  <li>Ajouter les visuels et témoignages prévus.</li>
                  <li>Relier l'article aux niveaux pertinents dans l'app.</li>
                </ul>
                <Link to="/avatar" className="blog-article__cta">Lancer le questionnaire</Link>
              </div>
            </aside>
          </div>
          <footer className="blog-article__footer">
            <Link to="/blog" className="blog-article__back">Retour au blog</Link>
          </footer>
        </div>
      </div>
    </article>
  )
}
