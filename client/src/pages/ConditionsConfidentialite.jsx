import React from 'react'
import { Link } from 'react-router-dom'

export default function ConditionsConfidentialite() {
  return (
    <div className="min-h-screen bg-white text-gray-900">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-12">
        <header className="mb-12">
          <p className="uppercase tracking-wide text-sm text-gray-500">Documents contractuels</p>
          <h1 className="text-3xl sm:text-4xl font-semibold mt-2">CGU, CGV &amp; Politique de confidentialité</h1>
          <p className="mt-3 text-sm text-gray-500">Dernière mise à jour : 13 octobre 2025</p>
          <p className="mt-6 text-base text-gray-700 leading-relaxed">
            Nous avons regroupé l'ensemble des informations légales et contractuelles relatives à l'utilisation de la plateforme Zélia. Vous trouverez ci-dessous les conditions générales d'utilisation (CGU), les conditions générales de vente (CGV) applicables aux offres payantes, ainsi que notre politique de confidentialité conforme au RGPD.
          </p>
        </header>

        <article className="space-y-16">
          <DocumentSection title="Conditions Générales d'Utilisation (CGU)">
            <SectionBlock title="1. Objet" content={[
              "Les présentes CGU définissent les modalités d'accès et d'utilisation de la plateforme Zélia, accessible à l'adresse zelia.io.",
              "En accédant au site ou en créant un compte, l'utilisateur reconnaît avoir pris connaissance des CGU et les accepter sans réserve." ]} />
            <SectionBlock title="2. Description du service" content={[
              "Zélia est une plateforme web dédiée à l'orientation et au développement personnel des jeunes de 15 à 20 ans.",
              "Le parcours propose des activités gamifiées, des quiz, des missions, des échanges avec une IA conversationnelle et des contenus éducatifs." ]} />
            <SectionBlock title="3. Accès et inscription" content={[
              "L'accès à la version actuelle de la plateforme est gratuit.",
              "Lors de l'inscription, l'utilisateur fournit des informations exactes (nom, prénom, email, âge, etc.).",
              "Les utilisateurs de moins de 15 ans peuvent explorer la version gratuite ; l'accès aux offres payantes nécessite l'accord parental qui sera recueilli par email." ]} />
            <SectionBlock title="4. Responsabilités" content={[
              "Zélia met tout en œuvre pour proposer un service fiable et sécurisé sans garantir une disponibilité ininterrompue ni l'absence totale d'erreurs.",
              "L'utilisateur reste responsable des informations qu'il communique et des décisions prises à partir des contenus proposés.",
              "Zélia ne saurait être tenue responsable des choix d'orientation ou de formation réalisés à partir des résultats affichés." ]} />
            <SectionBlock title="5. Contenu utilisateur" content={[
              "L'utilisateur peut renseigner des réponses, commentaires ou productions dans le cadre du parcours.",
              "Tout contenu contraire à la loi ou aux valeurs de respect, d'inclusion et de bienveillance pourra être supprimé sans préavis.",
              "Aucun contenu vidéo ou média externe n'est hébergé directement par les utilisateurs." ]} />
            <SectionBlock title="6. Données personnelles" content={[
              "Les données sont collectées et traitées conformément à la Politique de confidentialité décrite ci-après.",
              "Les utilisateurs disposent d'un droit d'accès, de rectification, d'opposition et de suppression de leurs données." ]} />
            <SectionBlock title="7. Sécurité et modération" content={[
              "L'équipe Zélia met en place des mesures pour garantir un environnement respectueux.",
              "Les comportements contraires aux règles internes peuvent entraîner une suspension ou une suppression du compte.",
              "Les contenus non conformes sont susceptibles d'être modérés ou supprimés." ]} />
            <SectionBlock title="8. Propriété intellectuelle" content={[
              "Tous les éléments de la plateforme (textes, logos, illustrations, code) sont protégés par les droits de propriété intellectuelle.",
              "L'utilisateur s'engage à ne pas reproduire, modifier ou redistribuer le contenu sans accord écrit." ]} />
            <SectionBlock title="9. Modification du service" content={[
              "Zélia se réserve le droit de faire évoluer à tout moment le contenu, les fonctionnalités et les modalités d'accès à ses services.",
              "Les évolutions peuvent inclure le lancement d'offres payantes ou de nouvelles fonctionnalités." ]} />
            <SectionBlock title="10. Loi applicable et juridiction" content={[
              "Les présentes CGU sont soumises au droit français.",
              "En cas de litige, compétence exclusive est attribuée aux tribunaux de Strasbourg." ]} />
          </DocumentSection>

          <DocumentSection title="Conditions Générales de Vente (CGV)">
            <SectionBlock title="1. Objet" content={[
              "Les CGV encadrent les relations commerciales dès l'ouverture des offres payantes de Zélia : Parcours Premium (paiement unique 30€) et Abonnement mensuel (5€/mois)." ]} />
            <SectionBlock title="2. Processus d'achat" content={[
              "Les paiements sont réalisés par carte bancaire via une solution sécurisée.",
              "L'utilisateur reçoit un email de confirmation précisant le contenu et les modalités d'accès à l'offre souscrite." ]} />
            <SectionBlock title="3. Droit de rétractation" content={[
              "Conformément à l'article L221-28 du Code de la Consommation, le droit de rétractation ne s'applique pas dès lors que l'utilisateur accède immédiatement au contenu numérique." ]} />
            <SectionBlock title="4. Résiliation" content={[
              "Les abonnements peuvent être résiliés à tout moment depuis l'espace utilisateur avec effet à la fin du mois en cours.",
              "Aucun remboursement n'est accordé pour les périodes déjà facturées." ]} />
            <SectionBlock title="5. Responsabilités" content={[
              "Zélia n'est pas responsable d'un mauvais usage du service, d'une interruption temporaire ou d'une perte de données liée à un incident technique." ]} />
            <SectionBlock title="6. Médiation" content={[
              "En cas de litige, l'utilisateur peut contacter un médiateur de la consommation agréé (référence à préciser lors du lancement commercial).",
              "Avant toute saisine, une réclamation doit être adressée par email à nicolas.wiegele@zelia.io." ]} />
          </DocumentSection>

          <DocumentSection title="Politique de Confidentialité (RGPD)">
            <SectionBlock title="1. Responsable du traitement" content={[
              "Responsable : Nicolas WIEGELE, micro-entrepreneur, France.",
              "Email de contact : nicolas.wiegele@zelia.io." ]} />
            <SectionBlock title="2. Données collectées" content={[
              "Données d'identification : nom, prénom, email, âge, téléphone.",
              "Données d'usage : réponses aux quiz, interactions avec l'IA, contenus des missions.",
              "Données techniques : adresse IP, logs de connexion, navigateur.",
              "Données audio : uniquement lorsque l'utilisateur enregistre volontairement des réponses vocales." ]} />
            <SectionBlock title="3. Finalités" content={[
              "Personnaliser le parcours d'orientation et de développement personnel.",
              "Assurer le bon fonctionnement technique du service.",
              "Communiquer avec l'utilisateur concernant son compte ou de nouvelles offres.",
              "Réaliser des analyses statistiques anonymisées pour améliorer le service." ]} />
            <SectionBlock title="4. Base légale" content={[
              "Le traitement repose sur le consentement explicite de l'utilisateur et, le cas échéant, de ses représentants légaux pour les mineurs de moins de 15 ans." ]} />
            <SectionBlock title="5. Durée de conservation" content={[
              "Les données sont conservées 3 ans après la dernière activité du compte puis supprimées ou anonymisées." ]} />
            <SectionBlock title="6. Hébergement" content={[
              "Les données sont stockées dans l'Union européenne via Supabase, fournisseur conforme au RGPD." ]} />
            <SectionBlock title="7. Partage des données" content={[
              "Aucune donnée personnelle n'est vendue ni transmise à des tiers sans consentement explicite.",
              "Zélia n'effectue pas de prospection commerciale externe." ]} />
            <SectionBlock title="8. Droits des utilisateurs" content={[
              "Droit d'accès, de rectification, de suppression.",
              "Droit à la limitation ou à l'opposition au traitement.",
              "Droit à la portabilité des données.",
              "Les demandes sont à adresser à nicolas.wiegele@zelia.io ; une réponse est apportée sous 30 jours." ]} />
            <SectionBlock title="9. Sécurité" content={[
              "Les données sont protégées par des mesures techniques (chiffrement, contrôle d'accès) et organisationnelles adaptées.",
              "En cas de violation de données, la CNIL et les utilisateurs concernés sont informés conformément à la loi." ]} />
          </DocumentSection>
        </article>

        <footer className="mt-16 flex flex-wrap items-center gap-4 text-sm text-indigo-600">
          <Link to="/" className="hover:underline">Retour à l'accueil</Link>
          <span className="text-gray-300">•</span>
          <Link to="/legal/mentions-legales" className="hover:underline">Mentions légales</Link>
        </footer>
      </div>
    </div>
  )
}

function DocumentSection({ title, children }) {
  return (
    <section>
      <h2 className="text-2xl sm:text-3xl font-semibold text-gray-900">{title}</h2>
      <div className="mt-6 space-y-10">{children}</div>
    </section>
  )
}

function SectionBlock({ title, content }) {
  return (
    <div>
      <h3 className="text-lg sm:text-xl font-semibold text-gray-800">{title}</h3>
      <ul className="mt-3 space-y-2 text-base leading-relaxed text-gray-700 list-disc list-inside">
        {content.map((item, index) => (
          <li key={index}>{item}</li>
        ))}
      </ul>
    </div>
  )
}
