import React from 'react'
import BlogArticleLayout from './BlogArticleLayout'
import { findBlogPost } from './posts'

export default function BlogQuestionnaire() {
  const post = findBlogPost('questionnaire-orientation-premiers-pas')

  if (!post) return null

  const aside = (
    <div className="blog-article__card">
      <h4>
        <i className="ph ph-compass-tool" aria-hidden="true"></i>
        <span>Pistes pour l&apos;équipe</span>
      </h4>
      <ul>
        <li>Illustrer le déroulé des niveaux avec une frise ou une capture.</li>
        <li>Prévoir un bloc FAQ avec les questions les plus fréquentes.</li>
        <li>Mettre en avant les bénéfices concrets post-questionnaire.</li>
      </ul>
    </div>
  )

  return (
    <BlogArticleLayout post={post} aside={aside}>
      <section>
        <h2>Objectif de la page</h2>
        <p>
          Ce brouillon servira à guider les nouveaux utilisateurs avant de lancer le questionnaire Zélia.
          Prévoyez ici des conseils pratiques sur la manière d&apos;aborder les questions, le temps nécessaire et
          l&apos;état d&apos;esprit recommandé.
        </p>
      </section>

      <section>
        <h2>Éléments à détailler</h2>
        <ul>
          <li>Une courte explication du fonctionnement du questionnaire (niveaux, progression, temps moyen).</li>
          <li>Des témoignages ou citations fictives à remplacer par de vrais retours.</li>
          <li>Un rappel des ressources accessibles après le questionnaire (profils, fiches métiers, etc.).</li>
        </ul>
      </section>

      <section>
        <h2>Ressources complémentaires</h2>
        <p>
          Préparez une liste de liens internes vers les niveaux ou les sections pertinentes pour approfondir,
          ainsi qu&apos;un encart « Questions fréquentes » à rédiger ultérieurement.
        </p>
      </section>
    </BlogArticleLayout>
  )
}
