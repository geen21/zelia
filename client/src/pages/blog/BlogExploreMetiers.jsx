import React from 'react'
import { Link } from 'react-router-dom'
import BlogArticleLayout from './BlogArticleLayout'
import { findBlogPost } from './posts'

export default function BlogExploreMetiers() {
  const post = findBlogPost('ia-remplacer-futur-metier')

  if (!post) return null

  const aside = (
    <div className="blog-article__card">
      <h4>
        <i className="ph ph-lightbulb-filament" aria-hidden="true"></i>
        <span>À retenir</span>
      </h4>
      <ul>
        <li>L’IA ne va pas voler tous les jobs, mais les transformer.</li>
        <li>65 % des élèves exerceront des métiers qui n’existent pas encore.</li>
        <li>Les compétences humaines (créativité, relationnel) seront clés.</li>
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
          Pour être très factuel dès le départ et rassurer tout le monde, chez Zélia on pense que non. A chaque fois qu’une nouvelle technologie arrive dans nos vies, tout le monde s’inquiète. D’ailleurs, certaines font aussi un peu des flops, comme la réalité virtuelle…
        </p>
        <img 
          src="https://images.unsplash.com/photo-1485827404703-89b55fcc595e?w=800&h=400&fit=crop" 
          alt="Collage montrant l'évolution technologique" 
          className="img-fluid rounded my-4 w-100"
        />
      </section>

      <section>
        <h2>Exemple avec internet, à la fin des années 1990, début des années 2000</h2>
        <p>
          Tout le monde pensait que des milliers d’emplois allaient être supprimés et que la presse écrite allait disparaître. Un petit coup de chaud au début c’est vrai, car tout le monde s’y est mis… comme l’IA de nos jours.
        </p>
        <p>
          Mais au final, il n’y a jamais eu autant de journalistes, de créateurs de contenu, de développeurs, de jobs nés d’Internet. Et la presse existe toujours, même si elle s’est transformée.
        </p>
        <p>
          Ce qu’il faut déjà bien avoir en tête, c’est que ce sont des millions de gens qui bossent aujourd’hui dans des métiers qui n’existaient pas en 2000.
        </p>
        <p>
          Et là, c’est pareil avec l’IA. Il y a une grosse panique, peut-être à juste titre, mais personne ne lit dans le futur. Les robots sont plus rapides, les logiciels avec de l’intelligence artificielle aussi.
        </p>
        <p>
          Mais la vraie question à se poser est plutôt la suivante : quels sont les métiers et filières qui vont se transformer (ou non), et comment cela va s’opérer ?
        </p>
      </section>

      <section>
        <h2>Non, l’IA ne va pas te voler ton futur, mais ne reste pas trop passif non plus</h2>
        <p>
          L’IA ne va pas voler tous les jobs. Elle va changer la forme de certains métiers, c’est vrai, comme internet il y a 25 ans.
        </p>
        <p>
          Chez Zélia, on pense plutôt qu'elle va créer des opportunités pour ceux qui savent l’utiliser, pas juste la subir.
        </p>
        <img 
          src="https://images.unsplash.com/photo-1677442136019-21780ecad995?w=800&h=400&fit=crop" 
          alt="Illustration d'une collaboration entre un humain et une IA" 
          className="img-fluid rounded my-4 w-100"
        />
        <ul>
          <li>Selon l’OCDE, <strong>65 %</strong> des élèves d’aujourd’hui exerceront des métiers qui n’existent pas encore.</li>
          <li>Selon Goldman Sachs, l’IA pourrait générer <strong>300 millions</strong> de nouveaux emplois dans le monde d’ici 2030.</li>
        </ul>
        <p>
          Donc si on est optimistes, et il faut l’être, ce sont déjà d’excellents points.
          D’ailleurs, les métiers d’avenir ne sont pas forcément ceux auxquels on pourrait penser, et nous y reviendrons.
        </p>
        <div className="my-5 text-center">
          <Link to="/avatar" className="btn btn-primary btn-lg">
            Découvre Zelia
          </Link>
        </div>
      </section>

      <section>
        <h2>Certains métiers vont évoluer</h2>
        <p>
          Mais alors, que sait réellement bien faire l’IA en 2025 : écrire des contenus (même des livres entiers…), corriger tes devoirs, faire du design, automatiser des tâches dans des usines, faire des prévisions sur le futur… Elle commence à être présente partout mais surtout, elle apprend très vite, beaucoup plus vite qu’un humain, c’est vrai.
        </p>
        <p>
          Mais tu sais ce qu’elle ne peut pas faire : comprendre un humain, avoir des émotions, faire des métiers manuels dans l’artisanat (maçon, électricien). D’ailleurs, un des plus grands acteurs de la révolution de l’IA a récemment dit dans une interview que les prochains millionnaires seraient… des plombiers ! Pourquoi ? Car il y aura de moins en moins d’artisans.
        </p>
      </section>

      <section>
        <h2>Alors quelles sont les bonnes questions à se poser ?</h2>
        <p>
          C’est là que Zélia entre en scène. On ne va pas te donner une liste de métiers “protégés”.
          On va t’aider à te poser les bonnes questions :
        </p>
        <ul>
          <li>Qu’est-ce que j’aime faire naturellement, sans forcer ?</li>
          <li>Qu’est-ce que j’apporte que personne ne peut copier ?</li>
          <li>Est-ce que j’aime les nouvelles technologies ? Est-ce que j’aime construire de nouvelles choses ?</li>
        </ul>
      </section>

      <section>
        <h2>Avec Zelia, tu entres dans une vraie aventure</h2>
        <ul>
          <li>Tu découvres ton profil perso.</li>
          <li>Tu explores les métiers qui bougent (IA, éthique, communication, relationnel, etc.).</li>
          <li>Tu gagnes en confiance, en clarté, en vision.</li>
        </ul>
        <p>
          Il y a un univers de possibilités pour ton futur métier. Le plus important, c’est d’apprendre à te connaitre et c’est ce qu’on te permet de faire.
        </p>
        <img 
          src="https://images.unsplash.com/photo-1522202176988-66273c2fd55f?w=800&h=400&fit=crop" 
          alt="Interface de découverte des métiers sur Zelia" 
          className="img-fluid rounded my-4 w-100"
        />
        <p>
          Ce qui compte c’est l’envie d’apprendre, la créativité, la vision, la capacité à s’adapter, à comprendre les autres.
        </p>
        <p>
          Commence gratuitement ta quête avec Zelia aujourd’hui.
        </p>
        <div className="my-5 text-center">
          <Link to="/avatar" className="btn btn-primary btn-lg">
            Lancer la quête
          </Link>
        </div>
      </section>

      <section className="bg-light p-4 rounded-3 mb-5">
        <h3>Mini-FAQ – IA & orientation</h3>
        <div className="mb-3">
          <strong>Q : Est-ce que l’IA va vraiment tuer des métiers ?</strong>
          <p>Oui, certains, mais elle va en créer des nouveaux. C’est un changement, pas une fin.</p>
        </div>
        <div className="mb-3">
          <strong>Q : Est-ce que je dois apprendre à coder pour survivre ?</strong>
          <p>Non. Mais tu dois comprendre les outils de ton époque, comme l’IA, pour faire la différence ou en tout cas, ne pas prendre de retard.</p>
        </div>
        <div>
          <strong>Q : Est-ce que Zelia est une IA ?</strong>
          <p>Oui, mais une IA bienveillante, paramétrée pour t’aider à mieux te connaître. Et derrière cette IA, il y a une entreprise, avec des associés humains (Nicolas et Joris), toujours présents pour t’aider si besoin.</p>
        </div>
      </section>

      <section>
        <h3>Pour aller plus loin :</h3>
        <ul>
          <li>Goldman Sachs – IA et emploi, 2023</li>
          <li>OCDE – The future of education and skills 2030</li>
          <li>World Economic Forum – 65 % des métiers du futur encore inconnus</li>
          <li>Les millionnaires de demain seront des plombiers</li>
        </ul>
      </section>

      <section className="mt-5">
        <h3>À retenir : Pourquoi l’IA est une opportunité pour toi</h3>
        <ul>
          <li>Elle automatise les tâches pénibles</li>
          <li>Elle libère ton temps pour créer, parler, comprendre, et évoluer plus rapidement vers des actions à haute valeur ajoutée</li>
          <li>Elle te pousse à te démarquer autrement et à mieux te connaître, sur les plans pro et perso.</li>
        </ul>
        <p className="mt-3 fw-bold">
          Découvre tout ton potentiel dès maintenant. Sur zelia.io.
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
