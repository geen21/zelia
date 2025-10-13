import React from 'react'
import { Link } from 'react-router-dom'

export default function MentionsLegales() {
  return (
    <div className="min-h-screen bg-white text-gray-900">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-12">
        <div className="mb-10">
          <p className="uppercase tracking-wide text-sm text-gray-500">Mentions légales</p>
          <h1 className="text-3xl sm:text-4xl font-semibold mt-2">Zélia</h1>
          <p className="mt-3 text-sm text-gray-500">Dernière mise à jour : 13 octobre 2025</p>
        </div>

        <Section
          title="Éditeur du site"
          items={[
            "Le site Zélia est édité par Nicolas WIEGELE, micro-entrepreneur immatriculé au RCS de Strasbourg sous le numéro 848 996 344.",
            "Adresse : Strasbourg, France",
            "Email : nicolas.wiegele@zelia.io",
            "Directeur de la publication : Nicolas Wiegele",
            "Informations légales disponibles sur Pappers."
          ]}
        />

        <Section
          title="Hébergeur"
          items={[
            "Le site est hébergé par NameCheap Inc., société de droit américain.",
            "Les données sont stockées sur des serveurs situés dans l'Union européenne via la plateforme Supabase, conforme au RGPD.",
            "Pour toute demande relative à l'hébergement : legal@namecheap.com"
          ]}
        />

        <Section
          title="Contact"
          items={[
            "Support et questions générales : nicolas.wiegele@zelia.io",
            "Assistance pédagogique et signalements : via le chat intégré à la plateforme",
            "Réclamations officielles : merci de préciser l'objet de la demande et les éléments probants."
          ]}
        />

        <Section
          title="Propriété intellectuelle"
          items={[
            "L'ensemble du contenu du site Zélia (textes, images, vidéos, logos, marques, charte graphique, code source) est protégé par le droit d'auteur et les droits de propriété intellectuelle.",
            "Toute reproduction, représentation, diffusion ou exploitation, totale ou partielle, est interdite sans autorisation écrite préalable de Zélia.",
            "Les marques citées restent la propriété de leurs détenteurs respectifs."
          ]}
        />

        <Section
          title="Responsabilité"
          items={[
            "Zélia met en œuvre tous les moyens nécessaires pour assurer une information fiable et une disponibilité optimale de la plateforme.",
            "Les interruptions programmées pour maintenance ou les incidents techniques non imputables à Zélia peuvent entraîner une indisponibilité temporaire du service.",
            "Zélia ne saurait être tenue responsable des dommages directs ou indirects résultant de l'utilisation de la plateforme, y compris les pertes de données ou de profits."
          ]}
        />

        <Section
          title="Signalement de contenu"
          items={[
            "Toute personne peut signaler un contenu illicite ou contraire aux conditions d'utilisation en écrivant à legal@zelia.io ou via le chat.",
            "Les signalements font l'objet d'une analyse rapide ; des mesures conservatoires peuvent être prises sans préavis lorsque la situation l'exige."
          ]}
        />

        <nav className="mt-12 flex flex-wrap items-center gap-4 text-sm text-indigo-600">
          <Link to="/" className="hover:underline">Retour à l'accueil</Link>
          <span className="text-gray-300">•</span>
          <Link to="/legal/conditions" className="hover:underline">CGU, CGV &amp; Politique de confidentialité</Link>
        </nav>
      </div>
    </div>
  )
}

function Section({ title, items }) {
  return (
    <section className="mt-10">
      <h2 className="text-xl sm:text-2xl font-semibold text-gray-900">{title}</h2>
      <ul className="mt-4 space-y-2 text-base leading-relaxed text-gray-700 list-disc list-inside">
        {items.map((item, index) => (
          <li key={index}>{item}</li>
        ))}
      </ul>
    </section>
  )
}
