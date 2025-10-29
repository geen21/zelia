import React from 'react'
import BlogArticleLayout from './BlogArticleLayout'
import { findBlogPost } from './posts'

export default function BlogExploreMetiers() {
  const post = findBlogPost('explorer-metiers-demain')

  if (!post) return null

  const aside = (
    <div className="blog-article__card">
      <h4>
        <i className="ph ph-lightbulb-filament" aria-hidden="true"></i>
        <span>Idées à intégrer</span>
      </h4>
      <ul>
        <li>Portrait d&apos;un métier émergent avec témoignage.</li>
        <li>Boîte à outils pour suivre les tendances (podcasts, newsletters, veille).</li>
        <li>Recommandation des niveaux Zélia à explorer en lien avec le futur du travail.</li>
      </ul>
    </div>
  )

  return (
    <BlogArticleLayout post={post} aside={aside}>
      <section>
        <h2>Pourquoi anticiper les métiers émergents ?</h2>
        <p>
          Cet article reste à compléter par l&apos;équipe éditoriale. Il servira de guide
          pour aider les jeunes à identifier les nouveaux métiers, comprendre les compétences
          qui montent en puissance et se préparer à des parcours hybrides.
        </p>
        <p>
          Pour préparer la rédaction finale, pensez à intégrer quelques chiffres clés, des exemples
          de métiers émergents et des pistes d&apos;exploration concrètes (événements, ressources, interviews).
        </p>
      </section>

      <section>
        <h2>Pistes de contenu à ajouter</h2>
        <ul>
          <li>Une courte interview d&apos;un professionnel sur un métier en croissance.</li>
          <li>Un encadré « compétences à surveiller » avec 3 à 5 bullet points.</li>
          <li>Des liens vers les niveaux Zélia qui abordent ces thématiques.</li>
        </ul>
      </section>

      <section>
        <h2>Appel à l&apos;action</h2>
        <p>
          Terminez l&apos;article par un CTA invitant le lecteur à démarrer le questionnaire ou à contacter
          l&apos;équipe Zélia pour un atelier de découverte des métiers du futur.
        </p>
      </section>
    </BlogArticleLayout>
  )
}
