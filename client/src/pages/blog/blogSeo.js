const ORIGIN = 'https://zelia.io'
const LOGO = `${ORIGIN}/assets/images/logo-dark.png`

export function blogPageTitle(post) {
  return post.metaTitle || `${post.title} - Blog Zelia`
}

export function blogImageUrl(post) {
  return post.image?.startsWith('http') ? post.image : `${ORIGIN}${post.image || '/assets/images/logo-dark.png'}`
}

export function articleText(post) {
  return [
    post.summary,
    ...(post.sections || []).flatMap((section) => [
      section.heading,
      ...(section.paragraphs || []),
      ...(section.bullets || []),
      section.conclusion,
      section.table?.caption,
      ...(section.table?.columns || []),
      ...(section.table?.rows.flat() || [])
    ]),
    post.parents,
    ...(post.faq || []).flatMap(({ question, answer }) => [question, answer])
  ].filter(Boolean).join(' ')
}

export function buildBlogSchema(post) {
  const url = `${ORIGIN}/blog/${post.slug}`
  const graph = [
    {
      '@type': 'BlogPosting',
      '@id': `${url}#article`,
      headline: post.title,
      description: post.description,
      image: blogImageUrl(post),
      datePublished: post.dateIso,
      dateModified: post.updatedIso || post.dateIso,
      inLanguage: 'fr-FR',
      articleSection: post.category,
      ...(post.sections && {
        wordCount: articleText(post).split(/\s+/u).length,
        timeRequired: 'PT3M'
      }),
      author: { '@type': 'Organization', name: 'Zelia', url: ORIGIN },
      publisher: {
        '@type': 'Organization',
        name: 'Zelia',
        logo: { '@type': 'ImageObject', url: LOGO }
      },
      mainEntityOfPage: { '@type': 'WebPage', '@id': url }
    },
    {
      '@type': 'BreadcrumbList',
      '@id': `${url}#breadcrumb`,
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Accueil', item: ORIGIN },
        { '@type': 'ListItem', position: 2, name: 'Blog Zelia', item: `${ORIGIN}/blog` },
        { '@type': 'ListItem', position: 3, name: post.title, item: url }
      ]
    }
  ]

  if (post.faq?.length) {
    graph.push({
      '@type': 'FAQPage',
      '@id': `${url}#faq`,
      inLanguage: 'fr-FR',
      mainEntity: post.faq.map(({ question, answer }) => ({
        '@type': 'Question',
        name: question,
        acceptedAnswer: { '@type': 'Answer', text: answer }
      }))
    })
  }

  return { '@context': 'https://schema.org', '@graph': graph }
}

export function buildBlogIndexSchema(posts) {
  return {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: 'Blog Zelia',
    url: `${ORIGIN}/blog`,
    inLanguage: 'fr-FR',
    mainEntity: {
      '@type': 'ItemList',
      itemListElement: [...posts]
        .sort((a, b) => new Date(b.dateIso) - new Date(a.dateIso))
        .map((post, index) => ({
          '@type': 'ListItem',
          position: index + 1,
          name: post.title,
          url: `${ORIGIN}/blog/${post.slug}`
        }))
    }
  }
}
