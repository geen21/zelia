import React from 'react'
import { Link } from 'react-router-dom'
import BlogArticleLayout from './BlogArticleLayout'
import { findBlogPost } from './posts'

export default function BlogMetierFaitPourSoi() {
  const post = findBlogPost('metier-bien-fait-pour-soi-mode-emploi')

  if (!post) return null

  const aside = (
    <div className="blog-article__card">
      <h4>
        <i className="ph ph-compass" aria-hidden="true"></i>
        <span>À retenir</span>
      </h4>
      <ul>
        <li>Regarde le quotidien réel, pas la version TikTok.</li>
        <li>Aligne métier, valeurs, personnalité et débouchés.</li>
        <li>Teste vite (projets, stages, alternance) et ajuste.</li>
      </ul>
      <div className="mt-4 text-center">
        <Link to="/avatar" className="btn btn-primary btn-sm w-100">
          Faire le test Zelia
        </Link>
      </div>
    </div>
  )

  return (
    <BlogArticleLayout post={post} aside={aside}>
      <section>
        <p className="lead">
          Tu te demandes si le métier que tu as en tête est vraiment fait pour toi ? Ou tu en as marre qu’on te dise de
          « choisir une voie » sans t’expliquer comment la trouver ? C’est normal. Tout le monde est passé par là (moi
          aussi, Nicolas). Alors autant commencer par comprendre comment t’y retrouver, concrètement.
        </p>
        <img
          src="https://images.unsplash.com/photo-1521737604893-d14cc237f11d?w=800&h=400&fit=crop"
          alt="Groupe en discussion sur un projet professionnel"
          className="img-fluid rounded my-4 w-100"
        />
      </section>

      <section>
        <h2>Avant de commencer : tu as le droit de chercher</h2>
        <p>
          Pour te donner un peu de contexte : il m’a fallu faire 4 cursus d’études différents avant de trouver ce qui me
          plaisait vraiment. Je voulais être architecte au départ, mais je n’ai pas eu les notes pour ça (et aussi parce
          que mon père l’était). Bref, je suis passé par un IUT Informatique, une fac de maths, un BTS économie de la
          construction et une école de commerce. Rien à voir avec ce qui était prévu.
        </p>
        <p>
          Ce n’est pas un long fleuve tranquille. Mais si tu t’intéresses aux gens et à ce qui t’entoure, tu as toutes
          les chances de réussir à être heureux ou heureuse au travail.
        </p>
        <p>Maintenant, comment on s’y prend (ou comment on essaye, en tout cas) ?</p>
      </section>

      <section>
        <h2>1) Ce métier, il ressemble à quoi en vrai ?</h2>
        <p>
          Avant de foncer tête baissée dans une formation « parce que ça a l’air sympa », ou parce que tes potes vont le
          faire, pose-toi une question simple : à quoi ressemble une journée dans ce métier ?
        </p>
        <p>
          Les réseaux sociaux, les séries ou TikTok te montrent une version très (voire trop) cool de certains métiers.
          Mais la vraie vie, c’est souvent différent.
        </p>
        <ul>
          <li>Regarde des vidéos de pros (vraies journées, coulisses).</li>
          <li>Lis des articles et des fiches métiers.</li>
          <li>Parle avec des pros si tu peux (même 10 minutes, ça change tout).</li>
        </ul>
        <p>
          Sur Zelia, tu peux même savoir via un matching si un métier est fait pour toi, en fonction de deux tests de 50
          questions.
        </p>
        <p>
          Et garde un truc en tête : ton futur métier doit aussi coller à la réalité. Est-ce qu’il y a des débouchés ?
          Est-ce que ça matche avec ton mode de vie, tes envies, ta personnalité ?
        </p>
      </section>

      <section>
        <h2>2) Est-ce qu’il est aligné avec tes valeurs ?</h2>
        <p>
          Tu veux un travail qui a du sens ? Tu n’es pas le seul. C’est même devenu un critère plus important que le
          salaire pour beaucoup de jeunes.
        </p>
        <p>
          Demande-toi : qu’est-ce qui compte vraiment pour moi ? Qu’est-ce que j’aime ? Quel « combat » j’ai envie de
          mener ? Ça peut sembler extrême, mais en réalité il y a plus de 700 métiers, et beaucoup peuvent t’apporter du
          sens.
        </p>
        <ul>
          <li>Si tu es porté sur l’entraide : métiers sociaux, santé.</li>
          <li>Si tu veux agir pour la planète : métiers de l’écologie.</li>
          <li>Si tu veux créer / t’exprimer : numérique, communication, design.</li>
        </ul>
        <p>Le plus important : informe-toi et fais tes propres recherches.</p>
      </section>

      <section>
        <h2>3) Est-ce que tu t’y vois vraiment ?</h2>
        <p>
          Pas dans 10 ans. Pas juste sur le CV. Dans ta vraie vie.
        </p>
        <p>
          Un bon métier pour toi, c’est un métier qui te stimule. Tu n’as pas besoin d’être excellent dès le départ,
          mais il faut que tu aies envie d’apprendre : être attiré, motivé, intrigué. C’est aussi ça, la passion.
        </p>
        <p>
          Et pense à un point clé : tu pourras (et tu vas probablement) changer de métier au cours de ta carrière.
          Aujourd’hui, les carrières sont dites « horizontales » : tu bouges plus facilement d’un métier à l’autre
          qu’avant. Et c’est tant mieux.
        </p>
      </section>

      <section>
        <h2>4) Est-ce que ton parcours t’y amène ?</h2>
        <p>
          Pas de panique : il y a plein de chemins possibles. Tu peux passer par le général, le technologique, le pro,
          l’alternance, ou même changer plus tard.
        </p>
        <p>
          Que tu sois en 3ème, en 1re générale, en reconversion… tu peux toujours bifurquer. Des jeunes sans diplôme
          font aujourd’hui des carrières dans le numérique grâce à des bootcamps ou des formations courtes.
        </p>
        <p>
          Et si tu es un peu perdu, un coach en orientation ou une plateforme comme Zelia peuvent t’aider à te poser les
          bonnes questions.
        </p>
      </section>

      <section>
        <h2>5) Et si tu changes d’avis ?</h2>
        <p>
          Tu as le droit. Tu vas même probablement changer plusieurs fois de métier dans ta vie. Et c’est OK.
        </p>
        <p>
          L’important, c’est de commencer par un choix aligné avec qui tu es aujourd’hui. Pas avec ce que les autres
          veulent pour toi. L’orientation, ce n’est pas figé : c’est un chemin.
        </p>
      </section>

      <section className="bg-light p-4 rounded-3 mb-5">
        <h3>En bref : la méthode Zelia</h3>
        <ul className="mb-0">
          <li>Informe-toi sur les métiers (vrai quotidien + débouchés).</li>
          <li>Connecte tes choix avec tes valeurs et ta personnalité.</li>
          <li>Choisis une formation qui te correspond (pro, bac, reconversion…).</li>
          <li>Rassure-toi : même les adultes font des erreurs, toi tu explores.</li>
        </ul>
      </section>

      <section>
        <h2>Tu veux aller plus loin ?</h2>
        <p>Sur Zelia, on a réuni :</p>
        <ul>
          <li>Des quiz d’orientation fun</li>
          <li>Des petits tests personnalisés</li>
          <li>Des parcours uniques, que tu sois ado ou en reconversion jeune</li>
          <li>Des dossiers et articles sur l’avenir pro, l’IA, les métiers sans diplôme, etc.</li>
        </ul>
        <p>
          Pose-toi cette question simple :
          <br />
          <strong>« Et si j’arrêtais de me demander ce que je dois faire… et que je me demandais qui j’ai envie de devenir ? »</strong>
        </p>
        <div className="mt-4 text-center">
          <Link to="/avatar" className="btn btn-primary btn-lg">
            Démarrer sur zelia.io
          </Link>
        </div>
      </section>

      <section className="bg-light p-4 rounded-3 mb-5">
        <h3>Foire aux questions (FAQ)</h3>
        <div className="mb-3">
          <strong>Q : Comment savoir si un métier est fait pour moi ?</strong>
          <p>
            R : Pose-toi les bonnes questions : est-ce que ce métier correspond à mes valeurs ? Est-ce que j’ai envie de
            m’investir ? Est-ce que je me projette dans ce quotidien ?
          </p>
        </div>
        <div className="mb-3">
          <strong>Q : Peut-on changer de voie si on se rend compte qu’on s’est trompé ?</strong>
          <p>R : Bien sûr. Beaucoup de jeunes (et d’adultes) changent de cap. L’orientation, ce n’est pas une prison, c’est un parcours.</p>
        </div>
        <div className="mb-3">
          <strong>Q : Est-ce que les tests d’orientation gratuits sont utiles ?</strong>
          <p>R : Ils peuvent être un bon point de départ, mais ils ne remplacent pas la réflexion personnelle. Avec Zelia, tu fais un test, mais aussi un parcours qui t’amène à mieux te connaître.</p>
        </div>
        <div className="mb-3">
          <strong>Q : Est-ce qu’un coach orientation peut m’aider même si je suis jeune ?</strong>
          <p>R : Oui. Un bon accompagnement peut faire toute la différence dès le collège ou le lycée.</p>
        </div>
        <div className="mb-3">
          <strong>Q : Et si je n’ai pas de passion ?</strong>
          <p>R : C’est normal. La passion, ça se découvre souvent en testant. Ne te mets pas la pression, explore.</p>
        </div>
        <div className="mb-3">
          <strong>Q : Est-ce que je peux trouver un métier qui a du sens et qui recrute ?</strong>
          <p>R : Absolument. Il existe des métiers qui ont du sens ET des débouchés réels : métiers du social, du numérique, de l’éducation, de l’écologie…</p>
        </div>
        <div>
          <strong>Q : Est-ce que je peux changer de voie sans diplôme ?</strong>
          <p>R : Oui. Il existe plein de formations, d’alternances et de parcours adaptés pour les jeunes sans diplôme.</p>
        </div>
      </section>
    </BlogArticleLayout>
  )
}
