import React from 'react'
import BlogArticleLayout from './BlogArticleLayout'
import { findBlogPost } from './posts'

export default function BlogParents() {
  const post = findBlogPost('accompagner-parents')

  if (!post) return null

  const aside = (
    <div className="blog-article__card">
      <h4>
        <i className="ph ph-heartbeat" aria-hidden="true"></i>
        <span>Points d&apos;attention</span>
      </h4>
      <ul>
        <li>Souligner le rôle des parents comme partenaires d&apos;exploration.</li>
        <li>Inclure des recommandations de posture (écoute active, curiosité).</li>
        <li>Proposer un encadré pour lister les ressources Zélia à partager en famille.</li>
      </ul>
    </div>
  )

  return (
    <BlogArticleLayout post={post} aside={aside}>
      <section>
        <h2>Enjeu de la page</h2>
        <p>
          Cette page fournit une base pour un futur article destiné aux lycéens et étudiants qui co-construisent
          leur orientation avec leurs parents. Le contenu définitif pourra détailler des pistes pour instaurer un
          dialogue serein et équilibré.
        </p>
      </section>

      <section>
        <h2>Plan suggéré</h2>
        <ul>
          <li>Clarifier les attentes et les inquiétudes de chacun grâce à un petit guide de discussion.</li>
          <li>Mettre en avant des outils Zélia à utiliser en famille (questionnaire, fiches métiers partagées, etc.).</li>
          <li>Proposer des exercices rapides pour passer de la discussion aux actions concrètes.</li>
        </ul>
      </section>

      <section>
        <h2>À prévoir</h2>
        <p>
          Intégrez ultérieurement des exemples de réussites, un encart « pour aller plus loin » et un CTA vers le
          support ou les ateliers collectifs. N&apos;oubliez pas d&apos;insérer des visuels ou citations pour dynamiser la mise
          en page.
        </p>
      </section>
    </BlogArticleLayout>
  )
}
