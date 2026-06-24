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

          <DocumentSection title="Conditions Générales de Vente (CGV) - Établissements Partenaires">
            <p className="text-gray-700 leading-relaxed font-semibold italic">
              IMPORTANT : Les présentes Conditions Générales de Vente (CGV) régissent exclusivement les relations d'affaires entre la société exploitant la plateforme zélia (ci-après « zélia ») et les établissements d'enseignement supérieur post-bac (ci-après « l'Établissement » ou « le Client ») ayant souscrit aux services de mise en relation et de fourniture de leads qualifiés décrits ci-dessous.
              Conformément aux modalités opérationnelles de la plateforme zélia, l'accès au service pour les utilisateurs finaux (les élèves) est entièrement gratuit, les présents services étant exclusivement facturés aux Établissements partenaires de manière directe et hors plateforme.
            </p>
            <SectionBlock title="1. Objet des prestations et description du service" content={[
              "Les présentes CGV ont pour objet de définir les conditions contractuelles, financières et juridiques dans lesquelles zélia fournit à l'Établissement son service B2B d’intermédiation et de transmission de profils de prospects (« leads »).",
              "zélia fournit une plateforme web d'orientation gamifiée pour les jeunes de 15 à 25 ans. Dans le cadre de ce parcours, et uniquement lorsque l'élève a formellement et explicitement consenti via une case à cocher (« opt-in ») à la transmission de ses données aux écoles recommandées, zélia transmet les données dudit profil à l'Établissement partenaire.",
              "Le service se limite strictement à la mise en relation technique : il appartient exclusivement à l’Établissement de prendre contact par la suite avec les élèves transmis afin de poursuivre les démarches de recrutement ou d'inscription." ]} />
            <SectionBlock title="2. Processus de commande et contractualisation" content={[
              "Les offres et modalités de tarification des prestations de zélia (volume de leads, critères de ciblage, récurrence) sont formalisées par le biais d'un bon de commande écrit, d'un devis ou d'un contrat de partenariat direct signé entre zélia et l'Établissement.",
              "Toute signature d'un bon de commande ou de conditions particulières par l'Établissement emporte acceptation pleine, entière et sans réserve des présentes CGV, qui prévalent sur tout autre document du Client, notamment ses conditions générales d'achat." ]} />
            <SectionBlock title="3. Conditions financières, facturation et modalités de paiement" content={[
              "Le modèle économique de zélia repose exclusivement sur des contrats de prestations de services conclus directement et hors plateforme avec les Établissements.",
              "Tarification : Les prix sont fixés dans le bon de commande ou le contrat de partenariat (généralement calculés au coût par lead transmis, sous forme de forfait mensuel ou d'abonnement annuel). Ils sont exprimés en Euros et Hors Taxes (HT), majorés de la TVA au taux en vigueur. La société se réserve le droit d’appliquer son prix pour la valeur unitaire de chaque prospect, avec son profil.",
              "La société zélia facture aussi la présence des Établissements, sur la plateforme, sous forme d’espaces de communication, via une redevance ou souscription annuelle.",
              "Facturation : Sauf mention contraire dans les conditions particulières, zélia émet une facture mensuelle correspondant aux prestations exécutées ou aux leads transmis au cours du mois écoulé.",
              "Délais de paiement : Les factures sont payables par virement bancaire ou prélèvement dans un délai de trente (30) jours à compter de leur date d'émission.",
              "Pénalités de retard : Tout retard de paiement automatique et de plein droit entraînera l'application de pénalités de retard égales à trois (3) fois le taux d'intérêt légal en vigueur, ainsi qu'une indemnité forfaitaire pour frais de recouvrement de quarante (40) euros, sans préjudice du droit pour zélia de suspendre immédiatement l'accès au flux de données." ]} />
            <SectionBlock title="4. Droit de rétractation et résiliation" content={[
              "S'agissant d'un contrat conclu exclusivement entre professionnels (B2B), le droit de rétractation issu du Code de la consommation ne s'applique pas. Les conditions de résiliation anticipée ou de non-renouvellement sont fixées au sein du contrat de partenariat ou du bon de commande initial.",
              "En cas d'abonnement à durée indéterminée ou renouvelable par tacite reconduction, chaque partie peut y mettre fin selon le préavis écrit notifié dans les conditions particulières (par exemple, 30 jours avant l'échéance par lettre recommandée ou email avec accusé de réception). Les sommes déjà versées ou facturées pour les leads dûment transmis restent intégralement acquises à zélia." ]} />
            <SectionBlock title="5. Responsabilité et limitation de garantie" content={[
              "zélia est soumise à une stricte obligation de moyens dans le cadre de la fourniture de ses services.",
              "zélia agit en qualité de simple intermédiaire technique de mise en relation. En conséquence, zélia ne saurait être tenue responsable et n'accorde aucune garantie quant à : La véracité absolue des informations (les données de profil sont transmises « en l'état », telles qu'elles ont été renseignées par les élèves sur la plateforme. zélia ne procède à aucune vérification d'identité ni de diplômes des utilisateurs).",
              "La transformation commerciale : zélia ne garantit en aucun cas que l'élève transmis répondra aux sollicitations de l'Établissement, se présentera aux entretiens ou finalisera son inscription. Le risque de non-conversion est intégralement supporté par l'Établissement.",
              "La continuité du service : zélia ne peut être tenue responsable des interruptions temporaires de la plateforme liées à la maintenance, à des bogues, à des défaillances de serveurs tiers, ou à l'indisponibilité des solutions d'intelligence artificielle tierces (Gemini, Claude, ChatGPT) utilisées pour optimiser les parcours.",
              "En tout état de cause, si la responsabilité de zélia devait être engagée par l'Établissement, le montant total des indemnités à la charge de zélia sera strictement limité et plafonné aux sommes effectivement payées par l'Établissement à zélia au cours des trois (3) derniers mois précédant le fait générateur du litige." ]} />
            <SectionBlock title="6. Protection des données personnelles (Conformité RGPD B2B)" content={[
              "La transmission des données des élèves de la plateforme zélia vers l'Établissement s'effectue dans le strict respect du Règlement Général sur la Protection des Données (RGPD) et de la loi Informatique et Libertés.",
              "Base légale : zélia s'engage à ne transmettre à l'Établissement que les profils des élèves ayant formellement exprimé leur consentement préalable (opt-in) via la case à cocher prévue à cet effet sur la plateforme. zélia conserve la preuve de ce consentement.",
              "Responsabilité autonome : Dès la réception et le téléchargement des données des élèves par l'Établissement, ce dernier devient Responsable Autonome du Traitement pour ses propres finalités de prospection, de sélection et d'inscription.",
              "Obligations de l'Établissement : L'Établissement s'engage formellement à : Traiter les données reçues en totale conformité avec le RGPD ; Fournir aux élèves sa propre information relative au traitement des données dès le premier contact ; Respecter scrupuleusement les demandes d'accès, de rectification ou d'opposition (retrait de consentement) formulées par les élèves ; Ne jamais revendre, louer ou transférer à un tiers les données transmises par zélia.",
              "L'Établissement garantit zélia contre toute réclamation, contrôle de la CNIL ou action judiciaire d'un élève résultant d'un mauvais usage ou d'un traitement illicite des données personnelles par l'Établissement après leur transmission." ]} />
            <SectionBlock title="7. Propriété intellectuelle" content={[
              "L'accès aux services de zélia n'emporte aucune cession de droits de propriété intellectuelle au profit de l'Établissement. Tous les éléments de la plateforme zélia (algorithmes, interfaces, contenus pédagogiques, marques, logos, concepts gamifiés) demeurent la propriété exclusive de zélia.",
              "L'Établissement s'interdit toute reproduction, extraction, rétro-ingénierie ou exploitation non autorisée des outils informatiques mis à sa disposition." ]} />
            <SectionBlock title="8. Confidentialité et références commerciales" content={[
              "Chacune des parties s'engage à conserver strictement confidentielles toutes les informations commerciales, financières, techniques ou stratégiques obtenues au cours de l'exécution du partenariat.",
              "Sauf interdiction écrite expresse, zélia est autorisée à citer le nom et à utiliser le logo de l'Établissement à titre de référence commerciale sur ses supports de communication (site internet, plaquette de présentation, réseaux professionnels)." ]} />
            <SectionBlock title="9. Règlement des litiges et réclamations" content={[
              "En cas de contestation sur l'interprétation, l'exécution ou la fin des prestations, les parties s'engagent à rechercher prioritairement une solution amiable.",
              "Toute réclamation officielle de l'Établissement doit être adressée par écrit à l'adresse électronique suivante : nicolas.wiegele@zelia.io.",
              "Le dispositif de médiation de la consommation n'étant pas applicable aux relations interprofessionnelles (B2B), les litiges qui ne pourraient être résolus à l'amiable seront portés devant la juridiction compétente." ]} />
            <SectionBlock title="10. Loi applicable et juridiction" content={[
              "Les présentes CGV et les relations contractuelles en découlant entre zélia et ses Établissements partenaires sont exclusivement soumises au droit français.",
              "EN CAS DE LITIGE ET À DÉFAUT D'ACCORD AMIABLE, COMPÉTENCE EXCLUSIVE EST ATTRIBUÉE AUX TRIBUNAUX DE STRASBOURG, NONOBSTANT PLURALITÉ DE DÉFENDEURS OU APPEL EN GARANTIE." ]} />
          </DocumentSection>

          <DocumentSection title="Politique de Confidentialité (RGPD) – Plateforme zélia">
            <SectionBlock title="1. Responsable du traitement" content={[
              "Le responsable du traitement des données est : Monsieur Nicolas WIEGELE, agissant en qualité d'éditeur de la plateforme zélia. Email de contact : nicolas.wiegele@zelia.io" ]} />
            <SectionBlock title="2. Données collectées" content={[
              "Dans le cadre de l’utilisation de la plateforme, zélia est amenée à collecter les catégories de données suivantes :",
              "Données d’identification : nom, prénom, adresse email, âge, numéro de téléphone si fournis.",
              "Données d’usage et d'orientation : réponses aux quiz, préférences d’études, compétences ciblées, contenus des missions (CV, lettres de motivation générés), historiques des parcours.",
              "Interactions avec l'IA : historiques des conversations et données textuelles échangées avec l'IA conversationnelle.",
              "Données techniques : adresse IP, logs de connexion, type de navigateur, données de consentement (horodatage de l'opt-in).",
              "Données audio : enregistrements des réponses vocales (uniquement si l’élève active et utilise cette fonctionnalité optionnelle pour la prise de parole)." ]} />
            <SectionBlock title="3. Finalités du traitement" content={[
              "Les données sont collectées et traitées pour les finalités explicites suivantes :",
              "Personnaliser le parcours d’orientation, de développement personnel et de montée en compétences de l'élève.",
              "Générer des recommandations automatisées de métiers et d'études personnalisées (via l'usage d'outils d'intelligence artificielle).",
              "Assurer la mise en relation directe avec les établissements d'enseignement supérieur (écoles post-bac) partenaires, afin de permettre à ces derniers de recontacter l'élève pour l'accompagner dans son projet d'études.",
              "Assurer le bon fonctionnement technique, la sécurité et l’amélioration de la plateforme.",
              "Communiquer with l’utilisateur concernant la gestion de son compte ou l'évolution des services.",
              "Réaliser des analyses statistiques anonymisées." ]} />
            <SectionBlock title="4. Base légale du traitement" content={[
              "Le traitement des données repose sur :",
              "Le consentement explicite de l’utilisateur : matérialisé par l'acceptation des CGU et, de manière spécifique et distincte, par le biais d'une case à cocher (« opt-in ») dédiée pour la transmission des données aux écoles partenaires.",
              "L’accord parental ou des représentants légaux : requis pour les mineurs de moins de 15 ans conformément à la législation française sur la majorité numérique." ]} />
            <SectionBlock title="5. Durée de conservation" content={[
              "Les données personnelles de l'élève sont conservées pendant une durée de trois (3) ans à compter de la dernière activité de l’utilisateur sur son compte (par exemple, sa dernière connexion). À l'issue de ce délai, les données sont soit supprimées définitivement, soit anonymisées de manière irréversible à des fins statistiques." ]} />
            <SectionBlock title="6. Hébergement et Sous-traitance" content={[
              "Les données de la plateforme sont stockées au sein de l’Union Européenne via la solution Supabase, un fournisseur d'infrastructure cloud hautement sécurisé et entièrement conforme au RGPD.",
              "Pour l’optimisation des parcours et la pertinence des résultats d'orientation, zélia utilise des API d'intelligences artificielles tierces (telles que Gemini, Claude ou ChatGPT). zélia s'assure que ces passerelles techniques sont configurées de manière sécurisée et que les données transmises aux modèles ne sont pas réutilisées par ces tiers pour l'entraînement de leurs propres algorithmes." ]} />
            <SectionBlock title="7. Partage et transfert des données (Mise en relation)" content={[
              "Aucune donnée personnelle n’est vendue ou louée à des tiers à des fins de prospection publicitaire de masse.",
              "Toutefois, les données d’identification et de profil de l’élève sont transmises aux établissements d'enseignement post-bac partenaires (les écoles recommandées), sous réserve stricte que l’élève ait coché la case de consentement lors de son inscription ou de son parcours. Dès réception de ces données, l'école partenaire devient Responsable Autonome de son propre traitement. Il lui appartient de contacter l'élève dans le respect du RGPD et de gérer les éventuelles demandes de retrait de consentement ou de suppression de données qui lui sont directement adressées." ]} />
            <SectionBlock title="8. Droits des utilisateurs" content={[
              "Conformément à la réglementation européenne (RGPD) et à la loi Informatique et Libertés, chaque utilisateur (ou son représentant légal) dispose des droits suivants sur ses données :",
              "Droit d’accès, de rectification et de mise à jour.",
              "Droit à l’effacement (droit à l’oubli) de ses données personnelles.",
              "Droit de retirer son consentement à tout moment (notamment pour stopper toute nouvelle transmission de ses données aux écoles partenaires).",
              "Droit à la limitation du traitement et droit d'opposition.",
              "Droit à la portabilité des données.",
              "Toute demande d'exercice de ces droits peut être adressée très simplement par email à : nicolas.wiegele@zelia.io. Une réponse claire et une action seront apportées dans un délai maximum de 30 jours. L'utilisateur dispose également du droit d'introduire une réclamation auprès de la CNIL (cnil.fr)." ]} />
            <SectionBlock title="9. Sécurité des données" content={[
              "L'équipe de zélia met en œuvre l'ensemble des mesures techniques (chiffrement des flux, protocoles de sécurité) et organisationnelles requises pour protéger les données contre les accès non autorisés, les pertes ou les altérations. En cas de violation avérée de données présentant un risque pour les droits et libertés, zélia s’engage à notifier l’autorité de contrôle (la CNIL) et les utilisateurs concernés dans les délais légaux." ]} />
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
