import React from 'react'

export default function BlogCover({ post, featured = false }) {
  const hasPhoto = typeof post.image === 'string' && post.image.startsWith('http')
  return (
    <div className={`blog-cover${featured ? ' blog-cover--featured' : ''}${post.cover ? ' blog-cover--editorial' : ''}`} aria-hidden="true">
      {post.cover ? (
        <div className="blog-cover__insight">
          <div className="blog-cover__insight-top">
            <span>Zelia décrypte</span>
            <i className={`ph ${post.cover.icon}`} />
          </div>
          <strong className="blog-cover__value">{post.cover.value}</strong>
          <span className="blog-cover__insight-label">{post.cover.label}</span>
          <span className="blog-cover__mini-bars">
            <span /><span /><span /><span /><span />
          </span>
          <span className="blog-cover__detail">{post.cover.detail}</span>
        </div>
      ) : hasPhoto ? (
        <img src={post.image} alt="" loading={featured ? 'eager' : 'lazy'} />
      ) : (
        <div className="blog-cover__art">
          <span className="blog-cover__blob" />
          <span className="blog-cover__star" />
          <span className="blog-cover__ring" />
        </div>
      )}
      {!post.cover && <span className="blog-cover__tag">{post.category}</span>}
    </div>
  )
}
