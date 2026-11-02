import React, { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { blogPosts } from './posts'
import BlogHeaderNav from './BlogHeaderNav'
import SEO from '../../components/SEO'

const ALL_CATEGORIES = 'Tous'

function BlogCover({ post, featured = false }) {
  const hasPhoto = typeof post.image === 'string' && post.image.startsWith('http')
  return (
    <div className={`blog-cover${featured ? ' blog-cover--featured' : ''}`} aria-hidden="true">
      {hasPhoto ? (
        <img src={post.image} alt="" loading={featured ? 'eager' : 'lazy'} />
      ) : (
        <div className="blog-cover__art">
          <span className="blog-cover__blob" />
          <span className="blog-cover__star" />
          <span className="blog-cover__ring" />
        </div>
      )}
      <span className="blog-cover__tag">{post.category}</span>
    </div>
  )
}

export default function BlogIndex() {
  const [activeCategory, setActiveCategory] = useState(ALL_CATEGORIES)

  const sortedPosts = useMemo(() => {
    return [...blogPosts].sort((a, b) => new Date(b.dateIso) - new Date(a.dateIso))
  }, [])

  const categories = useMemo(() => {
    return [ALL_CATEGORIES, ...new Set(sortedPosts.map((post) => post.category))]
  }, [sortedPosts])

  const visiblePosts = activeCategory === ALL_CATEGORIES
    ? sortedPosts
    : sortedPosts.filter((post) => post.category === activeCategory)
  const [featuredPost, ...otherPosts] = visiblePosts

  return (
    <div className="blog-page">
      <SEO 
        title="Blog Zelia - Conseils et actualités sur l'orientation"
        description="Retrouvez nos analyses, astuces et retours d'expérience pour accompagner les jeunes dans leur quête d'orientation scolaire et professionnelle."
        url="https://zelia.io/blog"
      />
      <BlogHeaderNav />
      <header className="blog-page__hero">
        <div className="container blog-page__hero-inner">
          <div className="blog-page__hero-text">
            <span className="blog-page__eyebrow">Le blog Zélia</span>
            <h1 className="blog-page__title">
              Les coulisses de <span className="blog-page__title-mark">l&apos;orientation</span>
            </h1>
            <p className="blog-page__intro">
              Retrouvez ici nos analyses, astuces et retours d&apos;expérience pour accompagner les jeunes dans leur quête d&apos;orientation.
            </p>
          </div>
          <div className="blog-page__hero-art" aria-hidden="true">
            <span className="hero-art__blob" />
            <span className="hero-art__star" />
            <span className="hero-art__sticker hero-art__sticker--bottom">Zéro pression</span>
          </div>
        </div>
      </header>

      <main className="blog-page__content">
        <div className="container">
          <div className="blog-page__filters" role="group" aria-label="Filtrer par catégorie">
            {categories.map((category) => (
              <button
                key={category}
                type="button"
                className={`blog-filter${category === activeCategory ? ' is-active' : ''}`}
                aria-pressed={category === activeCategory}
                onClick={() => setActiveCategory(category)}
              >
                {category}
              </button>
            ))}
          </div>

          {featuredPost && (
            <article
              className="blog-featured"
              style={{ '--accent': featuredPost.accent, '--accent-soft': featuredPost.accentSoft }}
            >
              <BlogCover post={featuredPost} featured />
              <div className="blog-featured__body">
                <span className="blog-featured__label">À la une</span>
                <h2 className="blog-featured__title">
                  <Link to={`/blog/${featuredPost.slug}`}>{featuredPost.title}</Link>
                </h2>
                <p className="blog-featured__description">{featuredPost.description}</p>
                <div className="blog-card__footer">
                  <span className="blog-card__date">{featuredPost.publishedAt} · {featuredPost.readingTime}</span>
                  <span className="blog-card__cta">Lire l&apos;article</span>
                </div>
              </div>
            </article>
          )}

          <div className="blog-page__grid">
            {otherPosts.map((post) => (
              <article
                key={post.slug}
                className="blog-card blog-card--visual"
                style={{ '--accent': post.accent, '--accent-soft': post.accentSoft }}
              >
                <BlogCover post={post} />
                <div className="blog-card__body">
                  <h2 className="blog-card__title">
                    <Link to={`/blog/${post.slug}`}>{post.title}</Link>
                  </h2>
                  <p className="blog-card__description">{post.description}</p>
                  <div className="blog-card__footer">
                    <span className="blog-card__date">{post.publishedAt} · {post.readingTime}</span>
                    <span className="blog-card__cta">Lire l&apos;article</span>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>
      </main>
    </div>
  )
}
