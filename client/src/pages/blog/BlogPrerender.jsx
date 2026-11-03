import React from 'react'
import { renderToString } from 'react-dom/server'
import { StaticRouter } from 'react-router-dom/server.js'
import { HelmetProvider } from 'react-helmet-async'
import BlogIndex from './BlogIndex'
import BlogEditorialArticle from './BlogEditorialArticle'

export function renderBlogPage(slug) {
  const location = slug ? `/blog/${slug}` : '/blog'
  return renderToString(
    <HelmetProvider context={{}}>
      <StaticRouter location={location}>
        {slug ? <BlogEditorialArticle slug={slug} /> : <BlogIndex />}
      </StaticRouter>
    </HelmetProvider>
  )
}
