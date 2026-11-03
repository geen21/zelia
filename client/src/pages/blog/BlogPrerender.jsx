import React, { Suspense } from 'react'
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
        <Suspense fallback={<div className="p-6 text-center" role="status">Chargement…</div>}>
          {slug ? <BlogEditorialArticle slug={slug} /> : <BlogIndex />}
        </Suspense>
      </StaticRouter>
    </HelmetProvider>
  )
}
