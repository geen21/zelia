import React, { useMemo } from 'react'
import { Link } from 'react-router-dom'
import Chart from 'react-apexcharts'
import BlogArticleLayout from './BlogArticleLayout'
import { findBlogPost } from './posts'

export default function BlogEtudeSalaire() {
  const post = findBlogPost('etude-salaire-bon-salaire-ados')

  if (!post) return null

  const trancheLabels = useMemo(
    () => ['< 2 000 €', '2 000 – 2 999 €', '3 000 – 3 999 €', '4 000 – 5 999 €', '> 6 000 €'],
    []
  )

  const trancheCounts = useMemo(() => [2, 16, 8, 5, 2], [])

  const histogramSeries = useMemo(
    () => [
      {
        name: 'Réponses',
        data: trancheCounts
      }
    ],
    [trancheCounts]
  )

  const histogramOptions = useMemo(
    () => ({
      chart: {
        type: 'bar',
        toolbar: { show: false }
      },
      plotOptions: {
        bar: {
          horizontal: false,
          columnWidth: '55%'
        }
      },
      dataLabels: {
        enabled: true
      },
      grid: {
        strokeDashArray: 4
      },
      colors: ['var(--accent)'],
      xaxis: {
        categories: trancheLabels,
        labels: {
          rotate: -35
        }
      },
      yaxis: {
        title: { text: 'Nombre de réponses' }
      },
      tooltip: {
        y: {
          formatter: (val) => `${val} réponse${val > 1 ? 's' : ''}`
        }
      }
    }),
    [trancheLabels]
  )

  const pieOptions = useMemo(
    () => ({
      chart: {
        type: 'donut',
        toolbar: { show: false }
      },
      labels: trancheLabels,
      legend: {
        position: 'bottom'
      },
      dataLabels: {
        formatter: (val) => `${val.toFixed(1)}%`
      },
      tooltip: {
        y: {
          formatter: (val) => `${val} réponse${val > 1 ? 's' : ''}`
        }
      }
    }),
    [trancheLabels]
  )

  const aside = (
    <div className="blog-article__card">
      <h4>
        <i className="ph ph-lightbulb-filament" aria-hidden="true"></i>
        <span>À retenir</span>
      </h4>
      <ul>
        <li>Médiane : 2 500 € / mois (la moitié des jeunes vise ≤ 2 500 €).</li>
        <li>La tranche dominante : 2 000 – 2 999 €.</li>
        <li>Quelques réponses très hautes tirent la moyenne vers le haut.</li>
      </ul>
      <div className="mt-4 text-center">
        <Link to="/avatar" className="btn btn-primary btn-sm w-100">
          Lancer le parcours Zelia
        </Link>
      </div>
    </div>
  )

  return (
    <BlogArticleLayout post={post} aside={aside}>
      <section>
        <p className="lead">
          Spoiler : le salaire rêvé d’un ado est plus raisonnable que tu ne le crois.
        </p>
        <p>
          Chez Zelia, dans le niveau 2 de notre plateforme d’orientation et de développement pour ados, on demande régulièrement ce qu’ils considèrent être “un bon salaire”.
          On pose aussi pas mal de questions au fil de l’eau pour les rendre acteurs de leur orientation : se questionner, s’auto-évaluer, mettre des mots sur leurs priorités.
        </p>
        <p>
          On a donc déjà pu demander à une cinquantaine de jeunes, entre 15 et 18 ans, ce qu’ils considèrent comme un "bon salaire".
          Résultat : des réponses surprenantes, parfois très hautes (10 000 €, 15 000 €…), mais dans l’ensemble assez réalistes.
          On t’explique tout ça avec des chiffres clairs, des graphes, et des mots simples.
        </p>
      </section>

      <section>
        <h2>Les chiffres clés du salaire selon les jeunes interrogés</h2>
        <ol>
          <li>
            <strong>Moyenne : 3 394 € / mois</strong>
            <br />
            La moyenne est tirée vers le haut par quelques réponses très élevées (10 000 €, 15 000 €…).
          </li>
          <li className="mt-3">
            <strong>Médiane : 2 500 € / mois</strong>
            <br />
            Autrement dit : la moitié des jeunes pense qu’un bon salaire, c’est 2 500 € ou moins.
          </li>
          <li className="mt-3">
            <strong>Mode : 2 000 € (cité 7 fois)</strong>
            <br />
            La valeur la plus souvent citée — une sorte de “norme” dans leur esprit.
          </li>
          <li className="mt-3">
            <strong>Écart-type ≈ 2 578 €</strong>
            <br />
            Très forte dispersion : certains visent des sommets, d’autres gardent les pieds sur terre.
          </li>
        </ol>
      </section>

      <section>
        <h2>Répartition des salaires par tranche</h2>
        <p>
          Voici comment se répartissent les réponses par catégories :
        </p>

        <div className="bg-light p-4 rounded-3 mb-4">
          <h3 className="h5">Histogramme (par tranches)</h3>
          <Chart options={histogramOptions} series={histogramSeries} type="bar" height={320} />
          <p className="mt-3 mb-0">
            Classe dominante : <strong>2 000 – 2 999 €</strong>.
          </p>
        </div>

        <div className="bg-light p-4 rounded-3 mb-5">
          <h3 className="h5">Répartition (donut)</h3>
          <Chart options={pieOptions} series={trancheCounts} type="donut" height={320} />
        </div>

        <p>
          <strong>Interprétation :</strong> très peu de jeunes ont une vision “fantasmée” du salaire (seulement une petite minorité au-dessus de 6 000 €).
          La vision du marché du travail est plutôt réaliste, voire déjà informée.
        </p>
        <p>
          C’est une preuve que les jeunes ne sont pas si “déconnectés” qu’on le pense.
        </p>
      </section>

      <section>
        <h2>Valeurs extrêmes : fantasme ou ambition ?</h2>
        <ul>
          <li>Salaire le plus bas : <strong>1 800 €</strong></li>
          <li>Salaire le plus haut : <strong>15 000 €</strong></li>
          <li>Deux valeurs très hautes : <strong>10 000 €</strong> et <strong>15 000 €</strong></li>
        </ul>
        <p>
          Ces chiffres montrent qu’une minorité d’adolescents pense à des métiers ou carrières très bien payées, voire hors norme
          (influenceurs ? startuppers ? CEO tech ?).
        </p>
      </section>

      <section>
        <h2>Ce que ça nous dit sur les jeunes et l’argent</h2>
        <p>
          La majorité des jeunes interrogés vise un salaire entre 2 000 € et 3 000 €.
          C’est plutôt aligné avec le salaire médian des actifs en France (autour de 2 100 € net).
        </p>
        <p>
          Mais on observe une dispersion importante, signe que :
        </p>
        <ul>
          <li>Le rapport à l’argent varie selon l’environnement familial.</li>
          <li>Les ambitions scolaires et professionnelles jouent un rôle.</li>
          <li>Les médias et modèles sociaux influencent (influenceur, entrepreneur, tech…).</li>
        </ul>
      </section>

      <section>
        <h2>Ce qu’on pense chez Zelia</h2>
        <p>
          Que tu vises un métier passion, un métier d’avenir, ou un travail qui a du sens : ce qui compte, c’est que ton orientation te corresponde vraiment.
          Ce n’est pas une question de salaire uniquement. C’est une question d’épanouissement.
        </p>
        <p>Chez Zelia, on t’aide à découvrir :</p>
        <ul>
          <li>Les métiers qui recrutent en 2025</li>
          <li>Les métiers sans diplômes, mais qui ont de l’impact</li>
          <li>Les secteurs en tension, le numérique, et les nouvelles tendances</li>
        </ul>
        <p>
          Avec Zelia, tu peux tester, explorer, et découvrir ce que tu veux vraiment faire, même si tu ne le sais pas encore.
        </p>
        <div className="my-5 text-center">
          <Link to="/avatar" className="btn btn-primary btn-lg">
            Commencer gratuitement
          </Link>
        </div>
      </section>

      <section className="bg-light p-4 rounded-3 mb-5">
        <h3>FAQ — questions qu’on entend souvent</h3>
        <div className="mb-3">
          <strong>Q : Un bon salaire, c’est combien aujourd’hui ?</strong>
          <p>
            En France, le salaire médian est autour de 2 100 € net. Beaucoup de jeunes visent entre 2 000 € et 3 000 €.
          </p>
        </div>
        <div className="mb-3">
          <strong>Q : Et si je veux gagner plus ?</strong>
          <p>
            C’est possible. Certains métiers du futur ou du numérique sont très bien payés — mais l’idéal, c’est d’aimer le secteur, pas juste l’argent.
          </p>
        </div>
        <div className="mb-3">
          <strong>Q : Est-ce qu’on peut bien gagner sa vie sans diplôme ?</strong>
          <p>
            Oui. Certains métiers sans diplômes sont en tension (BTP, logistique, tech…).
          </p>
        </div>
        <div className="mb-3">
          <strong>Q : Je suis en 3e ou en reconversion, ça change quoi ?</strong>
          <p>
            Tu n’es pas en retard. Il existe des parcours adaptés à chaque profil.
          </p>
        </div>
        <div>
          <strong>Q : Est-ce que le salaire, c’est le plus important ?</strong>
          <p>
            Non. Un métier qui a du sens peut valoir plus qu’un gros chèque si tu te lèves motivé chaque matin.
          </p>
        </div>
      </section>

      <section>
        <p className="mt-3 fw-bold">
          ➡ Lance-toi avec Zelia, ta plateforme pour trouver ton métier idéal, gratuitement.
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
