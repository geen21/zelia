ZeliaV2 Client (Vite + React)

- Uses existing Aximo assets via /static served by backend.
- Pages: /login, /register, /questionnaire

Run
1. Install: npm install
2. Dev server: npm run dev (proxy /api to http://localhost:8000)

Orientation (/orientation)
- La v4 utilise 20 dilemmes entre deux activites concretes et leurs contraintes, sans echelle d'adhesion a des qualites positives.
- Deux boutons affichent directement les activites : un clic repond et avance, sans lettres A/B ni echelle supplementaire. Les couleurs ne valorisent aucun cote ; les fleches, le swipe et les touches 1-2 choisissent une activite.
- Les pistes moins choisies sont depriorisees progressivement, sans elimination d'un secteur sur une seule reponse. Les preferences ne mesurent pas les aptitudes.
- Appliquer `server/database/migrate_questions_v4.sql` avant de deployer ; les questions et reponses v1/v2/v3 sont preservees. Une progression ancienne est invalidee.
- Avec Vite sur le port 5187 : `npm run verify:personas` puis `npm run verify:orientation-ui`. Les API sont simulees : aucune generation IA reelle.

Page parents (/parents)
- Presentation de la formation d'une heure, situations du quotidien, programme et groupe WhatsApp.
- Video YouTube responsive : https://www.youtube.com/watch?v=__cJzw_RYnM.
- Trois appels a l'inscription affichent le tarif fourni par l'API de paiement, comme le formulaire Stripe.
- Garantie affichee : 100% satisfait ou rembourse sous 14 jours. Le choix du creneau Calendly reste accessible uniquement apres confirmation du paiement.

Verification locale (depuis le dossier client, dans deux terminaux)
Prerequis : dependances installees et Chromium disponible via `node node_modules\@playwright\test\cli.js install chromium`.

1. npm run dev -- --host 127.0.0.1 --port 5191 --strictPort
2. npm run verify:parents-ui

Le controle Playwright simule les API, Stripe, YouTube et Calendly : aucun paiement ni rendez-vous reel n'est cree.
Il couvre les textes, les trois CTA, les largeurs 1440/390/320 px, le formulaire et les retours de paiement.
Pour tester un autre serveur local, definir PARENTS_TEST_URL. La lecture reelle de la video et la reservation Calendly restent a verifier manuellement.

Page profil (/app/profile)
- Identite et raccourcis, informations modifiables, CV et diplome, visuel Zelia et autorisations de partage.
- Palette Zelia vert citron/rose, cartes responsives et controles accessibles au clavier.
- Le diplome utilise une carte compacte ; sa source PDF reste au format original, hors ecran.
- L'accord general et le blocage de chaque ecole restent independants.

Verification du profil (depuis le dossier client, dans deux terminaux)
1. npm run dev -- --host 127.0.0.1 --port 5187 --strictPort
2. npm run verify:profile-ui

Le controle simule les API et les documents : aucune donnee reelle n'est modifiee.
Il couvre les largeurs 1440/1000/768/390/320 px, l'edition et son annulation, les erreurs/reessais,
les autorisations, les etats du CV et les telechargements du visuel et du diplome PDF.
Pour cibler un autre serveur, definir PROFILE_TEST_URL.

Regression du blocage HTTP 429 : `node scripts/verify-profile-rate-limit.mjs` avec le meme serveur Vite. Le controle couvre le message d'attente et `Retry-After`, les erreurs du profil et du bilan, puis la recuperation apres reessai sans bilan existant.

Formations et ecoles (/app/formations)
- Une seule grille rassemble les formations nationales et toutes les formations partenaires actives, avec leurs campus. La couleur et le libelle distinguent les partenaires.
- Dans chaque groupe (correspondances puis pistes a explorer), trois formations nationales alternent avec un partenaire, tant que les deux sources sont disponibles. Les scores restent inchanges et aucun partenaire n'est retire de la liste.
- La decouverte nationale utilise les intitules du bilan et leurs mots thematiques (acronymes developpes, termes de diplome retires). Elle parcourt jusqu'a trois pages par recherche pour reunir au moins 24 formations pertinentes si le catalogue le permet, puis propose de poursuivre. Les requetes sont limitees a trois simultanees et conservent la localisation choisie.
- Les correspondances sont recalculees a chaque visite depuis le bilan enregistre et les dernieres preferences, sans regenerer le bilan IA ni reutiliser les anciennes selections comme signaux.
- Le pourcentage utilise le meme calcul thematique et les memes regles de niveau que le test. Il ne represente pas une probabilite d'admission. Sans correspondance, la carte indique "A explorer", sans score invente.
- L'en-tete reste compact, sans sous-titre ; l'explication des pourcentages se deplie a la demande. Sans bilan, le catalogue national reste consultable avec les partenaires, sans pourcentage.
- La recherche libre et le filtre de ville agissent dans la meme grille. Aucun filtre de ville n'est impose aux partenaires. Une preference "pres de chez moi" limite la recherche nationale, avec elargissement explicite possible.
- Les anciennes URL /app/ecoles-partenaires, ?tab=formations et #formation-ID restent utilisables. Explorer une fiche ne transmet aucune donnee ; les demandes d'informations conservent leur notice de partage et leurs etats d'envoi.
- Les erreurs de bilan, catalogue, partenaires et demandes sont visibles et reessayables independamment des resultats disponibles.

Verification formations (depuis client)
1. npm run dev -- --host 127.0.0.1 --port 5187 --strictPort
2. npm run verify:formations-ui

FORMATIONS_TEST_URL permet de choisir un autre serveur. Les API sont simulees et aucun contact reel n'est cree. Le controle utilise le CDN Tailwind deja requis par l'application et bloque les autres services externes. Il couvre les scores partages, les campus, le recalcul, les liens, le partage explicite, la pagination, les erreurs partielles et les largeurs 1440/390/320 px. Le scenario principal exige 18 formations nationales et 6 partenaires dans les 24 premieres cartes, y compris lorsque la recherche exacte et la premiere page SQL ne contiennent aucune formation pertinente.

Blog (/blog)
- Les cinq articles du lot du 3 novembre 2026 sont dans `src/pages/blog/editorialPosts.js` : textes, tableaux, graphiques, FAQ, sources et liens internes.
- Les routes et la liste du blog utilisent ces memes donnees via `posts.js`. Les titres restent en casse naturelle, sans transformation CSS en majuscules.
- `npm run build` genere le HTML complet du blog et de ces cinq articles, avec les metadonnees partagees, les schemas BlogPosting, BreadcrumbList et FAQPage. Les anciens articles conservent leur prerendu de metadonnees.
- Ajouter les prochaines URLs dans `public/sitemap.xml`. Le controle SEO verifie leur presence.
- Les couvertures actuelles sont des reperes chiffres mis en page, sans image distante. Les illustrations de la Bande et les URLs TikTok restent a fournir. Renseigner `image` pour le partage social, et `videoUrl` pour afficher le lien vers la video correspondant a `videoTitle`.
- Les informations et annonces reprennent le lot editorial fourni, date du 3 novembre 2026. Revalider les sources officielles avant diffusion, notamment si un calendrier ou une mesure evolue.

Verification du blog (depuis le dossier client)
1. `npm run build`
2. `node scripts/verify-blog-seo.mjs`
3. Avec le serveur Vite disponible sur le port 5187 : `node scripts/verify-blog-ui.mjs`.

Le controle UI couvre les cinq articles, les graphiques, les FAQ, les liens internes, la casse des titres et les largeurs 1440/390/320 px.
Pour tester un autre serveur, definir `BLOG_TEST_URL`.
Pour verifier le build via `npm run preview`, definir aussi `BLOG_TEST_STATIC=1` : le controle utilise les repertoires prerendus avec leur slash final (comme les index servis par Nginx) et teste la lecture sans JavaScript.

Boite a outils et jeux (/app/outils)
- Les outils partagent le cadre ToolExperience : titre, objectif, retour aux outils et styles limites a ces pages.
- Les quiz statistiques et les mises en situation utilisent les memes composants de progression, de reponse et de feedback.
- Les classements restent utilisables au glisser-deposer, au clavier et avec des boutons monter/descendre.
- Chaque outil garde son enregistrement explicite : aucun bouton du layout ne remplace ou ne court-circuite une sauvegarde.
- Les anciennes URLs /app/niveau/:id redirigent toujours vers les outils fonctionnels correspondants.

Verification locale des outils
1. npm run dev -- --host 127.0.0.1 --port 5187 --strictPort
2. npm run verify:tools-ui

Le controle simule les API, l'authentification et les images, sans generation IA ni sauvegarde reelle. Il charge une fois le runtime Tailwind du CDN utilise par l'application ; une connexion internet est donc necessaire.
Il couvre tous les outils actifs, les jeux complets, les erreurs/reessais d'enregistrement et les largeurs 1440/390/320 px.
Pour cibler un autre serveur Vite local, definir TOOLS_TEST_URL. Les autorisations micro, les exports PDF et la lecture YouTube restent a verifier manuellement.

Connexion (/login)
- Carte responsive dans la palette Zelia, connexion Google ou email, affichage/masquage du mot de passe et erreurs annoncees aux lecteurs d'ecran.
- Les redirections `after`, le callback Google et la reprise du bilan existant restent geres par `authFlow.js`.
- Les styles Login.css sont limites a cette page et ne dependent pas du CDN Tailwind.

Verification de la connexion
1. Avec le serveur Vite local sur le port 5187 : `npm run verify:login-ui`.
2. Pour un autre serveur, definir LOGIN_TEST_URL.

Les appels d'authentification et les pages de destination sont simules : aucun compte reel n'est connecte.
Le controle couvre 1440/390/320 px, le clavier, les champs obligatoires, les erreurs/reessais email et Google, la conservation des reponses et les redirections.
