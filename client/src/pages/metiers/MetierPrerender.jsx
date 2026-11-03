import React from 'react'
import { renderToString } from 'react-dom/server'
import { StaticRouter } from 'react-router-dom/server.js'
import { HelmetProvider } from 'react-helmet-async'
import MetierPage from './MetierPage'

export function renderMetierDocument(doc) {
  return renderToString(<HelmetProvider context={{}}><StaticRouter location={doc.path}>
    <MetierPage initialDocument={doc} />
  </StaticRouter></HelmetProvider>)
}
