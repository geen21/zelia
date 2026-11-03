import React, { useMemo } from 'react'
import { Link } from 'react-router-dom'
import BlogHeaderNav from './BlogHeaderNav'
import SEO from '../../components/SEO'
import BlogCover from './BlogCover'
import { blogImageUrl, blogPageTitle, buildBlogSchema } from './blogSeo.js'
import './blog-editorial.css'

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

  const schema = useMemo(() => buildBlogSchema(post), [post])

  return (
    <article className={`blog-article${post.sections ? ' blog-article--editorial' : ''}`} style={{ '--accent': post.accent, '--accent-soft': post.accentSoft }}>
      <SEO 
        title={blogPageTitle(post)}
        description={post.description}
        url={`https://zelia.io/blog/${post.slug}`}
        type="article"
        image={blogImageUrl(post)}
        imageAlt={post.title}
        publishedTime={post.dateIso}
        modifiedTime={post.updatedIso || post.dateIso}
        schema={schema}
      />
      <a href="#contenu-article" className="blog-skip-link">Aller au contenu de l’article</a>
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
          <div className={post.cover ? 'blog-article__intro-grid' : undefined}>
            <div>
              <h1 className="blog-article__title">{post.title}</h1>
              <p className="blog-article__excerpt">{post.description}</p>
              <div className="blog-article__meta">
                <span className="blog-article__date">
                  <i className="ph ph-calendar" aria-hidden="true"></i>
                  <span>{post.updatedIso ? 'Mis à jour' : 'Publié'} — <time dateTime={post.updatedIso || post.dateIso}>{post.publishedAt}</time></span>
                </span>
              </div>
            </div>
            {post.cover && <BlogCover post={post} featured />}
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
              {post.sections ? (
                <nav className="blog-article__card editorial-toc" aria-label="Sommaire de l’article">
                  <h2>Dans cet article</h2>
                  <ol>
                    {post.sections.map((section) => <li key={section.id}><a href={`#${section.id}`}>{section.heading}</a></li>)}
                    <li><a href="#faq">Questions fréquentes</a></li>
                    <li><a href="#sources">Sources</a></li>
                  </ol>
                </nav>
              ) : <div className="blog-article__card">
                <h3>
                  <i className="ph ph-sparkle" aria-hidden="true"></i>
                  <span>En deux mots</span>
                </h3>
                <p>{post.description}</p>
              </div>}
              {aside}
              <div className="blog-article__card blog-article__card--cta">
                <h4>
                  <i className="ph ph-rocket-launch" aria-hidden="true"></i>
                  <span>À faire ensuite</span>
                </h4>
                <p>Prends le temps de découvrir tes envies et les pistes d’études qui te ressemblent, sans pression.</p>
                <Link to="/orientation" className="blog-article__cta">Explorer mon orientation</Link>
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
