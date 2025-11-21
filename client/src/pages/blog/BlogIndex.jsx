import React, { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { blogPosts } from './posts'
import BlogHeaderNav from './BlogHeaderNav'
import SEO from '../../components/SEO'

export default function BlogIndex() {
  const sortedPosts = useMemo(() => {
    return [...blogPosts]
  }, [])

  return (
    <div className="blog-page">
      <SEO 
        title="Blog Zelia - Conseils et actualités sur l'orientation"
        description="Retrouvez nos analyses, astuces et retours d'expérience pour accompagner les jeunes dans leur quête d'orientation scolaire et professionnelle."
        url="https://zelia.io/blog"
      />
      <BlogHeaderNav />
      <header className="blog-page__hero">
        <div className="container">
          <span className="blog-page__eyebrow">Blog</span>
          <h1 className="blog-page__title">Les coulisses de l&apos;orientation</h1>
          <p className="blog-page__intro">
            Retrouvez ici nos analyses, astuces et retours d&apos;expérience pour accompagner les jeunes dans leur quête d&apos;orientation.
          </p>
        </div>
      </header>

      <main className="blog-page__content">
        <div className="container">
          <div className="blog-page__grid">
            {sortedPosts.map((post) => (
              <article
                key={post.slug}
                className="blog-card"
                style={{ '--accent': post.accent, '--accent-soft': post.accentSoft }}
              >
                <div className="blog-card__meta">
                  <span>{post.category}</span>
                  <span>{post.readingTime}</span>
                </div>
                <h2 className="blog-card__title">{post.title}</h2>
                <p className="blog-card__description">{post.description}</p>
                <div className="blog-card__footer">
                  <span className="blog-card__date">{post.publishedAt}</span>
                  <Link to={`/blog/${post.slug}`} className="blog-card__cta">
                    Lire l&apos;article
                  </Link>
                </div>
              </article>
            ))}
          </div>
        </div>
      </main>
    </div>
  )
}
