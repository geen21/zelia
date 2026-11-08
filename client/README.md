ZeliaV2 Client (Vite + React)

- Uses existing Aximo assets via /static served by backend.
- Pages: /login, /register, /questionnaire

Choix de formations dans l'orientation
- La question 4/6 propose BTS, BUT, Licence, Bachelor, Master, Ecole specialisee, Alternance et Prepa.
- Ces huit categories ont chacune une precision visible : variantes de BTS, BUT en IUT, licences generales/professionnelles, bachelors bac+3, masters/grade master, domaines des ecoles specialisees et familles de CPGE. L'alternance reste presentee comme une modalite, pas comme un diplome.
- Doctorat et CAP ou bac pro sont masques dans ce selecteur, faute de correspondances dans le catalogue national actuel. Les libelles et traitements historiques restent disponibles pour relire les anciens profils ; aucune donnee existante n'est supprimee.
- Lorsqu'un eleve repasse par cette question, les choix masques d'un ancien brouillon ne comptent plus dans la limite de trois et sont retires du brouillon a la validation de cette etape.

Departements des partenaires
- Dans le back-office, la creation et l'edition d'un partenaire demandent un departement. En multi-campus, chaque ville possede son propre selecteur de departement.
- Pour « Pres de chez moi », les recommandations partenaires utilisent le code du departement du campus, pas la ville de reference du profil. Muret et Toulouse sont donc eligibles pour le 31. Le catalogue general conserve toutes les formations partenaires actives.
- Appliquer `server/database/migration_partner_departments.sql` avant de deployer cette interface ; les etapes et verifications sont detaillees dans [DEPLOYMENT.md](../DEPLOYMENT.md).

Run
1. Install: npm install
2. Dev server: npm run dev (proxy /api to http://localhost:8000)

Analytics
- Le suivi conserve le conteneur GTM existant et couvre les pages vues, l'orientation v5, l'authentification, les formations, l'espace eleve et l'offre parents.
- Le contrat des evenements et le parametrage GTM/GA4 a publier sont decrits dans [ANALYTICS_ORIENTATION.md](./ANALYTICS_ORIENTATION.md). Les changements de code ne publient pas le conteneur distant.
- `npm run verify:analytics` teste les charges utiles et les parcours avec son propre serveur Vite et des services simules, sans envoyer d'evenements a Google.

Liens sortants
- Toutes les navigations HTTP(S) externes utilisent `src/lib/outboundUrl.js` : `withZeliaUtm(href)` ajoute `utm_source=zelia` et, en l'absence de medium, `utm_medium=referral`. Une source existante est remplacee ; les autres parametres de campagne, la requete et le fragment sont conserves.
- Appliquer ce helper au rendu des `href`, aux `window.open` et aux redirections externes, pas aux donnees stockees ni aux appels API, images, scripts ou lecteurs integres. Il est partage par le rendu React et les prerendus blog/metiers.
- Les routes relatives, l'origine courante, `zelia.io` et ses sous-domaines, `mailto:`, `tel:`, `blob:` et `data:` restent inchanges, notamment les liens de partage Zelia.
- `npm run verify:outbound-urls` verifie l'attribution et la conservation des destinations ; les controles formations, backoffice et SEO couvrent aussi les liens rendus.

Performance des pages publiques
- Tailwind est compile par PostCSS, sans script CDN ni compilation dans le navigateur. La version 3 conserve les regles du Play CDN historique ; le theme est dans `tailwind.config.js`. Les classes doivent etre ecrites en entier dans les sources pour etre detectees au build.
- Les routes autres que la landing sont chargees a la demande : les graphiques, outils et ecrans connectes ne font plus partie du JavaScript initial des pages publiques. La verification de session de la landing charge aussi Supabase a la demande.
- La verification de session conserve le resultat de l'import dynamique separement du resultat de `getSession` : cela evite que Vite reduise le module importe a un export `data` inexistant au build. Apres `npm run build`, `node --test scripts/verify-landing-session.test.mjs` controle la preview de production sans services externes.
- Les erreurs de generation d'analyse fournies par le serveur sont affichees dans le questionnaire ; un refus d'acces Gemini ne doit pas etre presente comme une panne resolue en quelques secondes.
- Les pages de blog prerendees sont hydratees sans remplacer leur contenu initial. GTM reste charge une seule fois par le HTML, avec les exclusions existantes pour les portails prives et jetons d'authentification.
- Apres `npm run build`, lancer `npm run verify:web-vitals`. Le controle demarre et ferme sa propre preview ; aucun serveur externe n'est requis. Il teste la landing, une fiche formation et le blog en 390/1440 px, cache froid, reseau a 1,6 Mbit/s et latence 40 ms, CPU ralenti x4 sur mobile.
- Budgets : LCP median de trois visites <= 2,5 s, CLS <= 0,1, JavaScript charge < 180 Kio gzip. Le controle verifie aussi l'hydratation, l'absence de CDN Tailwind et de double GTM. Les API et services externes sont simules/bloques : ce test de regression ne remplace ni PageSpeed en production ni les donnees terrain CrUX.

Socle UX commun
- `src/components/ZeliaTheme.jsx` active `src/zelia-ui.css` sur les pages publiques, l'acces/orientation et l'espace eleve. `/espace-ecoles/*` (page Ambassadeur comprise) et `/admin/*` ne recoivent ni racine `.zelia-ui` ni footer public. Ne pas deplacer ces regles vers `body`, `:root` ou les controles globaux.
- La reference est l'accueil : Bricolage Grotesque, creme, citron/rose, contours sombres, cartes arrondies et ombres decalees. Les tokens `--ui-*` centralisent couleurs, largeurs, gouttieres et echelles de titres ; les variables historiques des familles s'y rattachent.
- A partir de 1024 px, les conteneurs publics et l'espace eleve occupent 90 % de la largeur, centres avec 5 % de marge de chaque cote (`--ui-gutter: 5%`). Les textes longs, formulaires, questionnaires et documents gardent leurs largeurs de lecture ; les marges mobiles restent inchangees. Les regles communes de conteneur ne doivent pas annuler le padding propre des blocs, notamment le hero de l'accueil (48/32/20 px selon la largeur). Son illustration reste limitee a 520 px pour ne pas devenir disproportionnee sur grand ecran.
- Pour une nouvelle surface, reutiliser `zelia-page-intro`, `zelia-card` (ou `zelia-card--flush`), `zelia-button` et les variantes `zelia-button--lime` / `zelia-button--secondary`. Les classes existantes de cartes et d'actions sont raccordees aux memes primitives. Conserver les couleurs semantiques et les etats selectionnes, soumis, desactives ou en erreur.
- Les champs textuels ont une taille de texte de 16 px et une hauteur minimale de 52 px ; les actions communes ont une hauteur minimale de 48 px. Les corrections `!important` des champs restent limitees au socle pour neutraliser le theme historique, sans redimensionner les toggles personnalises.
- Les pages de contenu partagent `PublicFooter`. Le quiz et les pages d'acces restent epures ; `Layout` conserve la navigation eleve et le chat sa zone de defilement et son compositeur. Les prerendus blog/metiers utilisent le meme cadre que le rendu React.
- Le cadre public reserve au moins une hauteur d'ecran avant le footer, y compris pendant le chargement differe ou les appels API. Conserver cette reservation pour eviter un saut de mise en page au premier affichage.
- `scripts/fixtures/assert-shared-ux.mjs` controle les styles calcules (pas uniquement les classes), les dimensions tactiles, les cartes, la typographie, le contexte du footer et les debordements. Il est utilise par les verifications publiques, Parents, connexion, profil, formations et outils.
- `npm run verify:tools-ui` couvre aussi les gabarits tableau de bord, resultats, discussion, emplois et fiche partenaire, avec API simulees. `npm run verify:school-portal`, `npm run verify:school-registration` et `npm run verify:admin-ui` controlent les espaces exclus.
- `npm run verify:dashboard-ui` controle l'accueil connecte apres le test a 320/360/390/439/640/641/768/1023/1024/1440/1920/2560 px : largeur desktop de 90 % centree, raccourcis lisibles, absence de debordement dans les cartes et bouton de discussion masque jusqu'a 640 px. `DASHBOARD_TEST_URL` permet de viser Vite ou la preview de production. Les regles communes ne doivent pas ecraser les dimensions propres aux raccourcis ni le masquage responsive du CTA decoratif.
- Les 11 activites de l'accueil apres le test se terminent par un retour vers `/app`, jamais vers les resultats ou la boite a outils. Les scores et documents restent consultables avant l'action finale ; le guide Parcoursup propose aussi un retour en bas de page. Avec Vite sur le port 5187, `node scripts/verify-tools-ui.mjs --dashboard-games` verifie ces parcours depuis l'accueil sur desktop et mobile, avec sauvegardes simulees.

Navigation publique partagee
- `src/components/PublicHeader.jsx` et son CSS definissent le meme menu sur la landing, la page parents, le blog et ses articles, les formations publiques, les metiers et les pages legales. `BlogHeaderNav` reexporte ce composant pour les pages existantes.
- Les liens, le logo, le CTA et le menu mobile sont communs ; le lien Metiers reste conditionne par `VITE_METIER_PAGES_ENABLED`. Les portails connectes conservent leur navigation dediee.
- Le bouton parents "Je m'inscris" reste disponible dans le hero, en dehors du menu commun.
- Avec Vite sur le port 5187 : `npm run verify:public-nav`. `PUBLIC_NAV_TEST_URL` permet de choisir un autre serveur. Le controle compare le menu et le footer sur dix pages et sept largeurs (2560/1920/1440/1024/768/390/320 px), teste le clavier, la navigation sans rechargement et la sortie du theme vers Ambassadeur. Les API et services externes sont simules.

Landing publique (/)
- Contenus historiques et avatar Zelia d'origine (DiceBear Lorelei, seed `zelia`), dans une palette citron/rose vive inspiree du blog, avec aplats colores et ombres decalees. `src/pages/Home.css` conserve les compositions propres a l'accueil ; les primitives communes sont dans `src/zelia-ui.css`.
- Le menu, l'apercu editorial et le pied de page donnent acces au blog. Les trois derniers articles proviennent de `src/pages/blog/posts.js`, tries par date decroissante comme la liste du blog, sans modifier le catalogue. Leurs couvertures reutilisent `BlogCover`.
- Les parcours orientation, parents, ecoles et connexion, le partage et les redirections des utilisateurs connectes sont conserves. Le lien Metiers reste conditionne par `VITE_METIER_PAGES_ENABLED`.

Verification de la landing (depuis client, avec Vite sur le port 5187)
1. `npm run dev -- --host 127.0.0.1 --port 5187 --strictPort`
2. `npm run verify:landing-ui`

`LANDING_TEST_URL` permet de choisir un autre serveur Vite. Le controle couvre les largeurs 2560/1920/1440/1000/768/390/320 px, la largeur desktop, le padding du hero, les articles et leur ordre, les liens, le menu mobile, le clavier, la FAQ, le partage et les redirections de connexion. Les destinations hors blog et les services externes sont simules : aucun partage, paiement ou contact reel n'est effectue. Les captures sont enregistrees dans un dossier temporaire indique en sortie.

Pages metiers (/metiers/)
- Catalogue editorial independant, conserve dans le schema Supabase `seo`, pas dans `public`.
- Une page par fiche metier officielle ROME representee dans les donnees historiques ; ses appellations sont regroupees sur la meme page, sans publier les variantes d'annonces comme des metiers differents.
- Fiches detaillees : 600–900 mots utiles, cinq sections developpees, FAQ et sources officielles ; verdict OUI/NON explique en 1–2 phrases, sommaire et CTA vers /orientation.
- Aucun lien de candidature issu des anciennes annonces et aucun appel Gemini a la visite.
- Depuis client, apres l'export serveur : `npm run build` conserve automatiquement le catalogue. `npm run build:metiers` permet aussi d'exiger explicitement sa presence. Le snapshot par defaut est `server/.generated/metiers.json` ; `METIER_SNAPSHOT_PATH` ou `-- --snapshot <chemin>` permettent d'en choisir un autre.
- Le build inclut le HTML complet, les JSON par page, les liens d'annuaire, le SEO et les sitemaps. La navigation publique "Metiers" est activee lorsque le catalogue est present.
- Un export `--preview --detailed-only` produit les fiches detaillees pilotes en `noindex`, sans sitemap metier. Un catalogue de production incomplet ou contenant encore des fiches courtes fait echouer l'export.
- Sans snapshot ni catalogue deja construit, `npm run build` conserve le fonctionnement historique. Si des pages metiers existent mais que leur snapshot a disparu ou est invalide, le build echoue avant d'effacer la version precedente, au lieu de supprimer silencieusement les fiches.
- En developpement, Vite sert les JSON depuis le meme snapshot valide, sans API distante ni generation IA ; les changements du fichier sont pris en compte au prochain chargement. En preview, seuls les fichiers du build sont servis : une donnee absente renvoie une vraie 404 JSON, jamais la page d'accueil HTML.
- `npm run verify:metier-serving` teste ces garanties sur de vrais serveurs Vite et verifie la conservation du catalogue lors d'un build classique.
- `npm run verify:metiers` construit uniquement des donnees synthetiques locales via le build classique, puis teste les vrais serveurs Vite preview/dev, HTML sans JS, SEO, navigation React, reponses HTML erronees, erreurs/reessai et largeurs 1440/768/390/320 px. Ne jamais deployer ce build de test ; reconstruire ensuite depuis l'export reel.
- Pour verifier le vrai echantillon et conserver son build : `npm run verify:metiers -- --snapshot ..\server\.generated\metiers.json`. La previsualisation doit rester non indexable et sans sitemap metier.
- Ajouter `--skip-build` pour verifier les fichiers deja construits contre ce meme snapshot. Les serveurs de test utilisent des ports attribues par Node, sans occuper le port 5173 d'un serveur de developpement existant.

Orientation (/orientation)
- "Decouvre tes formations" et "Decouvre tes metiers" partagent le meme bouton citron et la meme barre fixe en bas, avec un espace reserve pour ne pas masquer le contenu. Les actions de partage du profil restent dans la carte ; `verify:orientation-ui` compare les styles et dimensions des deux CTA sur desktop et mobile.
- La v5 place chaque dilemme dans une phrase comparative courte, plutot que dans de longs boutons.
- Quatre boutons colores : Carrement / Plutot oui / Plutot pas / Pas du tout. Un clic repond et avance, sans A/B ni second choix ; les touches 1-4 permettent de nuancer et les fleches/swipes choisissent les extremes.
- Les six etapes de preferences apres le test gardent le meme alignement en haut et le meme espacement sous l'en-tete que les questions, sans centrage vertical variable. L'en-tete conserve sa hauteur quand le bouton retour apparait ; `verify:orientation-ui` controle ces dimensions sur desktop et mobile.
- L'accord favorise la premiere activite ; le desaccord favorise l'alternative, pas un rejet des deux activites.
- Les pistes moins choisies sont depriorisees progressivement, sans elimination d'un secteur sur une seule reponse. Les preferences ne mesurent pas les aptitudes.
- Appliquer `server/database/migrate_questions_v5.sql` avant de deployer ; les questions et reponses v1/v2/v3/v4 sont preservees. Une progression ancienne est invalidee.
- Avec Vite sur le port 5187 : `npm run verify:personas` puis `npm run verify:orientation-ui`. Les API sont simulees : aucune generation IA reelle.

Page parents (/parents)
- Presentation de la formation d'une heure, situations du quotidien, programme et groupe WhatsApp.
- Mise en page editoriale inspiree du blog et de l'accueil : introduction et video cote a cote sur desktop, navigation par ancres, programme en trois etapes et inscription avec recapitulatif du parcours. Les blocs s'empilent sur mobile.
- Les styles de la page sont limites a `ParentsFormation.css`, sans dependance au gabarit du questionnaire. Les cartes, boutons et champs reutilisent le socle UX commun.
- Video YouTube responsive : https://www.youtube.com/watch?v=__cJzw_RYnM.
- Trois appels a l'inscription affichent le tarif fourni par l'API de paiement, comme le formulaire Stripe.
- Garantie affichee : 100% satisfait ou rembourse sous 14 jours. Le choix du creneau Calendly reste accessible uniquement apres confirmation du paiement.
- Au retour du paiement, l'inscription est affichee directement sous le menu, apres chargement des polices et mise a jour du tarif. Les CTA conservent leur defilement doux, sauf si l'utilisateur prefere les mouvements reduits.

Verification locale (depuis le dossier client, dans deux terminaux)
Prerequis : dependances installees et Chromium disponible via `node node_modules\@playwright\test\cli.js install chromium`.

1. npm run dev -- --host 127.0.0.1 --port 5191 --strictPort
2. npm run verify:parents-ui

Le controle Playwright simule les API, Stripe, YouTube et Calendly : aucun paiement ni rendez-vous reel n'est cree.
Il couvre les textes, les trois CTA, les ancres, les colonnes desktop et l'empilement mobile aux largeurs 1920/1440/1024/1000/768/390/320 px, le formulaire et les retours de paiement.
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
- La decouverte nationale utilise les intitules du bilan et leurs mots thematiques (acronymes developpes, termes de diplome retires). Chaque visite ou clic lance au plus trois requetes successives de 24 formations, avec arret anticipe des que 24 correspondances sont reunies. Les sujets et pages restants attendent le bouton "Chercher d'autres formations nationales", sans chargement automatique de tout le catalogue ni elargissement de la localisation.
- La premiere grille attend la fin du premier lot national et le chargement des partenaires et de leurs scores : les partenaires ne s'affichent pas seuls pendant la recherche nationale. Les cartes deja chargees restent visibles lors de la pagination. Une recherche remplacee est annulee et ne lance plus de pages.
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
