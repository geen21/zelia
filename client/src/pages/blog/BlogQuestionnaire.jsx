import React from 'react'
import { Link } from 'react-router-dom'
import BlogArticleLayout from './BlogArticleLayout'
import { findBlogPost } from './posts'

export default function BlogQuestionnaire() {
  const post = findBlogPost('pourquoi-ecole-ne-t-aide-pas')

  if (!post) return null

  const aside = (
    <div className="blog-article__card">
      <h4>
        <i className="ph ph-lightbulb-filament" aria-hidden="true"></i>
        <span>À retenir</span>
      </h4>
      <ul>
        <li>L’école classe et évalue, mais ne t’aide pas à te connaître.</li>
        <li>83 % des jeunes stressent pour leur orientation.</li>
        <li>Zelia t’aide à te découvrir en 70 jours d’aventure.</li>
      </ul>
      <div className="mt-4 text-center">
        <Link to="/avatar" className="btn btn-primary btn-sm w-100">
          Découvrir Zelia
        </Link>
      </div>
    </div>
  )

  return (
    <BlogArticleLayout post={post} aside={aside}>
      <section>
        <p className="lead">
          Je sais pas si t’as remarqué ? Mais à l’école, on t’apprend à résoudre une équation, à écrire sans faute, à connaître les dates de la Révolution française. Ce qui est déjà pas mal, c’est sûr…
        </p>
        <img 
          src="https://images.unsplash.com/photo-1503676260728-1c00da094a0b?w=800&h=400&fit=crop" 
          alt="Étudiant perplexe devant un tableau rempli d'équations" 
          className="img-fluid rounded my-4 w-100"
        />
        <p>
          Mais personne ne t’a jamais appris à répondre à une question toute simple : <strong>“Qui suis-je vraiment ?”</strong>
        </p>
        <p>
          Et pourtant, c’est la base de tout. Comment choisir un métier, une formation ou même un projet de vie si tu ne sais pas ce qui te fait vibrer ? C’est la réalité de nombreux élèves comme toi, je te rassure.
        </p>
        <p>
          Encore pire, c’est qu’on te fait croire que c’est toi le problème. Que si t’es perdu, c’est parce que t’as “pas d’idée”, ou que t’es “pas assez motivé”. Alors que la vérité, c’est que le système actuel est un peu mal foutu.
        </p>
      </section>

      <section>
        <h2>Un système pensé pour orienter, pas pour comprendre</h2>
        <p>
          L’école française a été construite pour former des élèves, pas pour révéler des personnes.
          Depuis toujours, elle trie, elle classe, elle oriente. Dès la 3e, on te demande de “choisir ta voie”. Mais tu choisis sur quoi en vrai, sur quelle base ? Sur des notes, sur des cases, sur des attentes. Pas sur toi à proprement parler.
        </p>
        <p>Je te partage quelques stats intéressantes. Selon une étude de L’Étudiant (2023) :</p>
        <ul>
          <li><strong>83 %</strong> des jeunes disent être stressés quand ils pensent à leur orientation.</li>
          <li><strong>60 %</strong> choisissent leur filière “par goût personnel”, faute de mieux.</li>
          <li>Et <strong>48 %</strong> avouent manquer complètement de visibilité sur leurs options.</li>
        </ul>
        <p>
          Autrement dit, t’as la pression d’un choix d’adulte… sans les outils pour te comprendre.
          Et tu te retrouves à cocher une case, sans savoir pourquoi. Juste parce qu’il “faut bien avancer”.
        </p>
        <div className="my-5 text-center">
          <Link to="/avatar" className="btn btn-primary btn-lg">
            Découvre Zelia
          </Link>
        </div>
      </section>

      <section>
        <h2>L’école t’évalue, mais elle ne t’écoute pas</h2>
        <p>
          Chaque trimestre, tu reçois des notes, des moyennes, des appréciations. Mais à quel moment quelqu’un te demande vraiment :
          <br />
          <em>“Qu’est-ce que t’aimes ? Qu’est-ce qui te donne de l’énergie ?”</em>
        </p>
        <p>
          Spoiler : jamais.
        </p>
        <img 
          src="https://images.unsplash.com/photo-1434030216411-0b793f4b4173?w=800&h=400&fit=crop" 
          alt="Illustration symbolisant la différence entre être noté et être écouté" 
          className="img-fluid rounded my-4 w-100"
        />
        <p>
          Les profs, les conseillers d’orientation, ils font ce qu’ils peuvent — mais ils n’ont pas le temps, c’est le grand problème. On dit qu’il y a en France 1 conseiller d’orientation pour 1500 élèves, c’est juste dingue. Et surtout, déconnecté de la réalité de l’emploi.
        </p>
        <p>
          Résultat : tu peux être nul en maths mais génial en créativité, mauvais à l’écrit mais doué pour convaincre, ou introverti mais ultra stratégique — et personne ne le verra.
        </p>
      </section>

      <section>
        <h2>Ce qu’on ne te dit jamais sur l’orientation</h2>
        <p>
          On te parle de “Parcoursup”, de “filières”, de “bac général ou techno”. Mais encore une fois, jamais de toi. Jamais de qui tu es, de ta motivation profonde, de ce qui fait que tu aimerais te lever le matin.
        </p>
        <p>
          Tant que tu ne te connais pas, toutes tes décisions seront floues. Tu peux faire un “bon choix” sur le papier, et te réveiller à 25 ans en te disant “j’aurais peut-être du faire autre chose”.
        </p>
        <p>
          C’est pas de ta faute. C’est juste qu’on t’a jamais appris à te poser les bonnes questions.
        </p>
      </section>

      <section>
        <h2>Et si on apprenait à se découvrir avant de choisir ?</h2>
        <p>
          C’est là que Zelia change la donne.
        </p>
        <p>
          Zelia, c’est pas un simple test d’orientation, un truc chiant qu’on t’oblige à faire basé sur des méthodes anciennes et dépassées. C’est une aventure. Quelque chose de ludique, une sorte de quête pour te découvrir pas à pas.
        </p>
        <p>
          On y a intégré des quiz, des missions, de la gamification, et une IA, notre chère Zélia, qui te parle comme un pote ou une pote — pas comme un prof ou un parent.
        </p>
        <img 
          src="https://images.unsplash.com/photo-1611532736597-de2d4265fba3?w=800&h=400&fit=crop" 
          alt="Aperçu de l'interface ludique de Zelia" 
          className="img-fluid rounded my-4 w-100"
        />
        <p>
          Tu réponds, tu affines, tu compares des pistes, puis tu gardes ce qui te ressemble. Et tu te rends compte que ton orientation, c’est toi qui la façonne.
        </p>
        <p>
          Pour être honnête, on ne t’aide même pas à trouver le travail parfait, le job de tes rêves. On t’aide à trouver le métier idéal, celui qui est fait pour toi, qui te correspond. Un métier ou plusieurs métiers avec le ou lesquel(s) tu pourrais matcher. Parce qu’avant de “choisir ta voie”, tu dois d’abord te rencontrer.
        </p>
        <div className="my-5 text-center">
          <Link to="/avatar" className="btn btn-primary btn-lg">
            Découvre Zelia
          </Link>
        </div>
      </section>

      <section>
        <h2>Le futur, c’est toi</h2>
        <p>
          Arrête de croire que t’es perdu. Tu ne l’es pas. Ne cherche pas d’excuse, tu n’en as plus, et c’est à cause (ou plutôt grâce) à nous !
        </p>
        <p>
          🎮 Commence ta quête avec Zelia aujourd’hui, pour te découvrir, t’écouter et construire un futur qui te ressemble.
        </p>
      </section>

      <section className="bg-light p-4 rounded-3 mb-5">
        <h3>Question / réponse - pour toi</h3>
        <div className="mb-3">
          <strong>Q : Est-ce grave de ne pas savoir ce que je veux faire à 16 ans ?</strong>
          <p>Non. C’est normal. L’important, c’est de te découvrir avant de décider.</p>
        </div>
        <div className="mb-3">
          <strong>Q : Est-ce que Zelia remplace mon conseiller d’orientation ?</strong>
          <p>Non. Zelia complète : elle t’écoute, te challenge et te fait progresser à ton rythme.</p>
        </div>
        <div>
          <strong>Q : Combien de temps pour mieux me connaître ?</strong>
          <p>70 jours d’aventure, pas plus. Et t’en ressors avec ton profil, tes forces et tes envies claires.</p>
        </div>
      </section>

      <section>
        <h3>Pour aller plus loin, voici nos sources :</h3>
        <ul>
          <li>Pourquoi 83 % des jeunes stressent à cause de l’orientation – L’Étudiant</li>
          <li>Les inégalités d’orientation selon le milieu social – INSEE, 2023</li>
          <li>Fondation de France – L’accompagnement à l’orientation en question, 2025</li>
        </ul>
      </section>

      <section className="mt-5">
        <h3>A retenir, les 4 raisons pour lesquelles l’école ne t’aide pas à te connaître</h3>
        <ul>
          <li>Elle classe au lieu d’écouter</li>
          <li>Elle mesure avant d’explorer</li>
          <li>Elle juge avant d’encourager</li>
          <li>Elle t’oriente avant de t’expliquer</li>
        </ul>
        <p className="mt-3 fw-bold">
          N’attend plus pour te lancer et saisi ta chance, sur zelia.io
        </p>
        <div className="mt-4 text-center">
          <Link to="/avatar" className="btn btn-primary btn-lg">
            Découvre Zelia
          </Link>
        </div>
      </section>
    </BlogArticleLayout>
  )
}
