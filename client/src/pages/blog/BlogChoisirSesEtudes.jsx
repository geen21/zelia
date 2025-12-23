import React from 'react'
import { Link } from 'react-router-dom'
import BlogArticleLayout from './BlogArticleLayout'
import { findBlogPost } from './posts'

export default function BlogChoisirSesEtudes() {
  const post = findBlogPost('choisir-ses-etudes-sans-pression')

  if (!post) return null

  const aside = (
    <div className="blog-article__card">
      <h4>
        <i className="ph ph-lightbulb-filament" aria-hidden="true"></i>
        <span>À retenir</span>
      </h4>
      <ul>
        <li>Choisir ses études, c’est important — mais pas irréversible.</li>
        <li>Avance avec curiosité : intérêts, rythme, durée, débouchés.</li>
        <li>Prévois un plan B (et même C) et ose ajuster.</li>
      </ul>
      <div className="mt-4 text-center">
        <Link to="/avatar" className="btn btn-primary btn-sm w-100">
          Démarrer avec Zelia
        </Link>
      </div>
    </div>
  )

  return (
    <BlogArticleLayout post={post} aside={aside}>
      <section>
        <p className="lead">
          Choisir ses études, c’est choisir une partie de son avenir.
        </p>
        <p>
          Tu es au lycée, tu viens d’avoir ton bac, ou tu t’apprêtes à choisir une formation dans le supérieur — et tu te demandes si c’est le bon moment pour décider ?
          Je te rassure : tu es loin d’être seul. L’orientation post-bac (ou même avant : en 3e, en 1re…) fait souvent partie des premières grandes décisions d’une vie.
          Et oui, ça peut faire un peu peur.
        </p>
        <p>
          Bonne nouvelle : tu peux faire un choix important sans te mettre une pression énorme.
          D’abord parce que la pression ne t’aidera pas à avancer plus vite. Ensuite, parce que si tu te prépares bien, ça se passera bien.
        </p>
      </section>

      <section>
        <h2>Pourquoi c’est important de bien choisir ses études ?</h2>
        <p>
          Parce que tes études sont souvent le début d’un chemin professionnel. Elles peuvent t’ouvrir des portes… ou t’enfermer dans des cases si tu choisis sans réfléchir.
          Et ce qui est sûr, c’est que choisir, c’est renoncer : tu ne pourras pas tout faire.
        </p>
        <p>
          Ajoute à ça que les métiers évoluent très vite. On entend partout : "quel est ton futur métier ?", "quels sont les métiers du futur ?".
          Innovation, numérique, transformation de la société… tout bouge vite (même pour nous les adultes).
          Donc choisir sa formation, c’est aussi apprendre à se connaître et savoir, au moins un peu, où on veut aller.
        </p>
      </section>

      <section>
        <h2>Ok, mais comment faire pour choisir ?</h2>
        <p>Commence par te poser ces questions simples :</p>
        <ul>
          <li>
            Qu’est-ce qui m’intéresse et me passionne ? Est-ce que je cherche un métier passion, un travail qui a du sens… ou pas forcément ?
          </li>
          <li>
            Est-ce que le métier sera central dans ma vie, ou plutôt "périphérique" (et j’aurai d’autres priorités : loisirs, sport, amis, famille, voyages…) ?
          </li>
          <li>
            Est-ce que j’ai envie d’un parcours court ou long ? Est-ce que je me projette sur plusieurs années d’études ?
          </li>
          <li>
            Est-ce que j’ai déjà repéré des métiers qui recrutent en 2025 ?
          </li>
        </ul>
        <p>
          Pas besoin d’avoir toutes les réponses tout de suite. L’idée, c’est d’avancer avec curiosité.
        </p>
      </section>

      <section>
        <h2>Le droit à l’erreur. Le droit de se tromper.</h2>
        <p>
          Tu as le droit. Tu as même le droit de te reconvertir jeune.
          Beaucoup de jeunes adultes changent de voie après 6 mois, 1 an, 2 ans.
          Et ça ne veut pas dire que tu as échoué : ça veut dire que tu as eu le courage d’ajuster vers un chemin qui te correspond mieux.
        </p>
        <p>
          Le plus important, c’est d’avoir un plan B (ou même C), et d’oser explorer.
          Aujourd’hui, l’orientation adulte et la reconversion sont de plus en plus courantes.
        </p>
      </section>

      <section>
        <h2>Le rôle d’un coach orientation (et de Zelia)</h2>
        <p>
          Personne ne peut tout savoir tout seul. C’est là qu’un coach orientation, un conseiller, ou une plateforme comme Zelia peuvent vraiment t’aider :
          identifier tes forces, clarifier tes envies, et tester des idées.
        </p>
        <p>Zelia te propose :</p>
        <ul>
          <li>Des tests d’orientation gratuits, ludiques et simples.</li>
          <li>Des quiz, des missions avec de l’IA, et des explorations de métiers.</li>
          <li>Des parcours pour les ados (3e, 1re…) avec plein de petits ateliers pour s’orienter et se développer.</li>
        </ul>
        <div className="my-5 text-center">
          <Link to="/avatar" className="btn btn-primary btn-lg">
            Démarrer avec Zelia
          </Link>
        </div>
      </section>

      <section>
        <h2>En résumé</h2>
        <ul>
          <li>Tes études ne définissent pas toute ta vie : elles donnent un cadre pour évoluer.</li>
          <li>Choisis en pensant à ce que tu veux apprendre, pas seulement à ce que tu veux "devenir".</li>
          <li>Accepte de tester, d’ajuster, de changer d’avis : c’est courageux.</li>
          <li>Et surtout : fais-toi confiance. Tu construis ton avenir à ton rythme.</li>
        </ul>
      </section>

      <section className="bg-light p-4 rounded-3 mb-5">
        <h3>Foire aux questions (FAQ)</h3>
        <div className="mb-3">
          <strong>Q : Et si je n’ai aucune idée de ce que je veux faire ?</strong>
          <p>C’est normal. Commence par explorer : quiz, discussions, vidéos. Zelia est là pour ça.</p>
        </div>
        <div className="mb-3">
          <strong>Q : C’est grave de changer de formation en cours de route ?</strong>
          <p>Pas du tout. Beaucoup de jeunes le font. Mieux vaut bifurquer que rester bloqué.</p>
        </div>
        <div className="mb-3">
          <strong>Q : Est-ce qu’un test d’orientation professionnelle suffit ?</strong>
          <p>C’est un point de départ. Ensuite, il faut se connaître, tester, discuter.</p>
        </div>
        <div className="mb-3">
          <strong>Q : Et si je n’ai pas de bonnes notes ?</strong>
          <p>Il existe plein de formations accessibles. L’orientation sans diplôme, c’est possible aussi.</p>
        </div>
        <div>
          <strong>Q : Comment savoir si une formation me convient ?</strong>
          <p>Regarde les contenus, les débouchés, les métiers liés. Et demande-toi si ça t’intéresse vraiment.</p>
        </div>
      </section>

      <section>
        <p className="mt-3 fw-bold">
          ➡ Démarre ta réflexion et ton chemin avec Zelia sur zelia.io
        </p>
        <div className="mt-4 text-center">
          <Link to="/avatar" className="btn btn-primary btn-lg">
            Lancer la quête
          </Link>
        </div>
      </section>
    </BlogArticleLayout>
  )
}
