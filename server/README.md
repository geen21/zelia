# Zelia Server

Backend API server for the Zelia application, built with Express.js and Supabase.

## Features

- **Authentication**: User registration, login, logout, password reset
- **User Management**: Profile management and user data
- **Activities**: CRUD operations for activities
- **Jobs**: Job listings management
- **Formations**: Training/course management
- **Questionnaires**: Questionnaire responses and management
- **Security**: Rate limiting, CORS, helmet security headers
- **Database**: Supabase integration for PostgreSQL

## Setup

1. Install dependencies:
```bash
npm install
```

2. Configure environment variables:
Copy `.env.example` to `.env` and update the values:
```bash
cp .env.example .env
```

3. Update `.env` with your Supabase credentials:
```
SUPABASE_URL=your_supabase_url
SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

4. Start the development server:
```bash
npm run dev
```

## API Endpoints

### Authentication (`/api/auth`)
- `POST /register` - Register a new user
- `POST /login` - Login user
- `POST /logout` - Logout user
- `POST /refresh` - Refresh authentication token
- `POST /reset-password` - Reset password

### Users (`/api/users`)
- `GET /profile` - Get user profile (authenticated)
- `PUT /profile` - Update user profile (authenticated)
- `GET /me` - Get current user info (authenticated)

#### Quotas API et chargement du profil

Les appels `/api` disposent de deux quotas independants par IP et par periode de 15 minutes : 1 000 lectures (`GET`/`HEAD`) et 100 ecritures/autres methodes. La navigation et le chargement du profil ne consomment donc plus le quota d'ecriture. Les lectures publiques des formations et sitemaps restent exemptees ; les preflights `OPTIONS`, les fichiers statiques et `/health` ne consomment aucun quota. Les limiteurs plus specifiques, notamment les invitations ecoles, restent actifs.

Un depassement renvoie HTTP 429 avec `{ error, code: 'RATE_LIMIT_EXCEEDED' }`, les en-tetes `RateLimit-*` et `Retry-After` (secondes). Le profil affiche alors un message d'attente explicite, sans presenter ce blocage temporaire comme une perte de donnees. Les requetes refusees apparaissent aussi dans les logs HTTP du backend.

Regression sans base de donnees : `node --test scripts/verify_profile_rate_limit.test.mjs`.

### Activities (`/api/activities`)
- `GET /` - Get all activities (with filtering)
- `GET /:id` - Get activity by ID
- `POST /` - Create activity (authenticated)
- `PUT /:id` - Update activity (authenticated)
- `DELETE /:id` - Delete activity (authenticated)

### Jobs (`/api/jobs`)
- `GET /` - Get all job listings (with filtering)
- `GET /:id` - Get job by ID
- `POST /` - Create job listing (authenticated)
- `PUT /:id` - Update job listing (authenticated)
- `DELETE /:id` - Delete job listing (authenticated)

### Formations (`/api/formations`)
- `GET /` - Get all formations (with filtering)
- `GET /:id` - Get formation by ID
- `POST /` - Create formation (authenticated)
- `PUT /:id` - Update formation (authenticated)
- `DELETE /:id` - Delete formation (authenticated)

### Questionnaires (`/api/questionnaires`)
- `GET /:id` - Get questionnaire by ID (authenticated)
- `POST /:id/responses` - Submit questionnaire response (authenticated)
- `GET /:id/responses` - Get user responses for questionnaire (authenticated)
- `GET /user/responses` - Get all user questionnaire responses (authenticated)

#### Questionnaire d'orientation v5

Appliquer [migrate_questions_v5.sql](database/migrate_questions_v5.sql) avant de deployer le nouveau client. Elle ajoute 20 phrases comparatives courtes (ids 600-619, `questionnaire_type = 'inscription_v5'`), de 105 caracteres maximum : le dilemme est dans la phrase, pas dans les boutons. Exemple : « Je préfère animer un groupe, même agité, plutôt que chercher une erreur dans un programme. » Les reponses sont toujours « Carrément / Plutôt oui / Plutôt pas / Pas du tout », avec le degrade vert/rose existant. Aucun A/B ni seconde selection.

Chaque option porte `label` (aussi utilise comme reponse enregistree), `value` (pole ou famille de la premiere activite), `alternative` (pole ou famille de l'autre activite) et `level` (0-3). L'accord favorise la premiere activite, le desaccord l'alternative ; le desaccord ne signifie pas un rejet des deux. Les 10 comparaisons d'axes couvrent chaque axe deux fois, en inversant les poles. Les 10 comparaisons d'interets couvrent les six familles RIASEC chacune 3 ou 4 fois. Les scores premiere activite/alternative sont 1/0 (Carrement), 0,75/0,25 (Plutot oui), 0,25/0,75 (Plutot pas), 0/1 (Pas du tout). La moyenne par famille normalise l'exposition. Un score de 0,5 n'est pas dominant ; plusieurs comparaisons moins favorables depriorisent une famille, sans exclusion definitive.

Le parcours demande `GET /api/questionnaire/questions?type=inscription_v5&limit=20`. Les questions v1/v2/v3/v4 et leurs interpretations restent intactes pour l'historique et les anciens clients. Les reponses et resultats conservent le type `inscription`, avec les nouveaux identifiants. Le cache passe a `orientation-flow-v5-20` ; une progression anterieure est invalidee et ne declenche pas d'analyse automatique. La migration v5 peut etre appliquee directement sur une base existante avec la table `questions`, meme sans v4.

Le persona depend des cinq axes uniquement. Le backend recalcule les interets depuis les reponses enregistrees et transmet au LLM les activites choisies et les alternatives moins choisies, avec leur nuance. La transmission, l'animation et l'accompagnement ne prouvent pas un interet pour le soin ; les soins exigent un signal explicite. Ce questionnaire n'est pas un test psychometrique valide. Les anciens formats restent lisibles. Verification migration/scoring/historique/contexte LLM : `node scripts/verify_orientation_questionnaire.mjs`.

### Partage des résultats (`/api/share`)
- `POST /results` - Envoie le PDF des résultats d’un élève aux adresses e-mail fournies (authentifié)

## Paiements Stripe (`/api/payments`)

Le backend choisit seul le tarif : `STRIPE_PRICE_ID` doit designer un prix ponctuel fixe. Sans identifiant, `STRIPE_PRICE_AMOUNT` (centimes), `STRIPE_PRICE_CURRENCY` et `STRIPE_PRODUCT_NAME` definissent le tarif inline. Un `priceId` client different est refuse. La verification et les webhooks comparent le total, la devise et l'unique ligne de commande au produit configure avant toute activation. Les anciennes sessions sans metadata `product` restent compatibles avec ces controles ; conserver le tarif configure jusqu'au reglement des sessions en attente.

Les deux parcours, Zelia+ et formation parents, exigent le client Supabase **service-role** pour les ecritures de paiement. Les webhooks exigent leur secret de signature, sans repli non signe : `STRIPE_WEBHOOK_SECRET` et, pour le compte parents, `STRIPE_PARENT_WEBHOOK_SECRET`.

Configurer les deux endpoints Stripe pour recevoir `checkout.session.completed`, `checkout.session.async_payment_succeeded` et `checkout.session.async_payment_failed`. Une session terminee mais non reglee reste en attente. Seul `payment_status = 'paid'` active les droits ; un echec differe marque la commande parents `failed` sans retrograder une commande deja payee. Les notifications repetees ne reappliquent pas l'activation. Une erreur de persistance renvoie HTTP 500 pour permettre la relivraison Stripe.

Avant de deployer sur une base existante, appliquer manuellement [security_payment_profile_columns.sql](database/security_payment_profile_columns.sql), apres [setup.sql](database/setup.sql). Cette migration rejouable retire aux roles publics/utilisateurs les droits d'insertion et de modification des colonnes de paiement, y compris les anciens grants par colonne. Les champs de profil explicitement editables et la RLS de propriete restent disponibles ; les nouvelles colonnes ne deviennent pas automatiquement editables. Les nouvelles bases beneficient des memes permissions dans `setup.sql`.

Regression locale, avec Stripe/Supabase simules et PostgreSQL embarque, sans secrets ni appels distants : `npm run verify:payments`.

## Back-office (`/api/admin`)

L'interface `/admin` conserve Supabase comme stockage/Auth. Elle permet la consultation des utilisateurs, ecoles, formations, partenaires, resultats et du journal, ainsi que des modifications bornees et reversibles. Les resultats et le catalogue national sont en lecture seule. Aucun compte utilisateur/ecole n'est cree ou supprime depuis cette interface.

Seuls les comptes existants et controles de `joris.geerdes@21datas.ch` et `nicolas.wiegele@zelia.io` sont autorises. Configurer **cote serveur uniquement** :

```env
BACKOFFICE_JORIS_USER_ID=<uuid-du-compte-joris-controle>
BACKOFFICE_NICOLAS_USER_ID=<uuid-du-compte-nicolas-controle>
```

Chaque requete verifie le JWT, le statut du compte, puis le couple UUID/email. Une adresse seule, `user_metadata` et l'ancienne cle partagee ne donnent aucun droit. Configuration incomplete ou controle indisponible = refus ferme. Ne jamais mettre une cle `service_role` dans une variable `VITE_*`.

**Prerequis avant demarrage de ce backend** : appliquer manuellement [migration_backoffice.sql](database/migration_backoffice.sql) sur un schema contenant deja les migrations partenaires et portail ecoles v1/v2. La migration ajoute suspension privee, audit atomique, RPC serveur et permissions RLS. Sans sa table de suspension, les routes authentifiees existantes refusent aussi les requetes avec `503`. Voir [la procedure de deploiement](../DEPLOYMENT.md#back-office-mise-en-service).

- Suspension : blocage applicatif/RLS immediat, puis ban Auth. En cas d'echec Auth, l'interface indique une synchronisation en attente ; reprendre la meme action apres correction. Une reactivation ne leve pas le blocage avant la reussite Auth.
- Ecole : validation/retrait via `approved_at`, independamment de l'activation editoriale des formations partenaires.
- Partenaire : archivage reversible d'une formation ou d'un campus ; anciennes candidatures conservees. Formations privees : `is_published`, sans nouvelle publication publique.
- Journal append-only : acteur issu du JWT, motif et champs modifies, sans copie integrale des resultats ni de secrets.
- Anciennes routes `/api/school-portal/admin/*` retirees. `/espace-ecoles/admin` redirige vers `/admin/ecoles`. Supprimer `SCHOOL_PORTAL_ADMIN_KEY` de la configuration.

Verification locale sans donnees de production : `npm run verify:admin` (identite, HTTP, SQL/RLS, pagination au-dela de 1000 lignes, audit et synchronisation Auth simulee). Ces tests ne remplacent pas la recette sur le schema reel de staging.

Apres migration et verification de la maitrise des deux comptes, `node scripts/configure_backoffice.mjs` configure automatiquement leurs UUID depuis Supabase Auth en conservant le reste du fichier d'environnement. Le script refuse une migration manquante ou une configuration contradictoire, sauvegarde l'environnement original avec permissions privees et n'affiche pas les secrets. Utiliser `--check` pour verifier sans ecriture. Voir [la commande VPS](../DEPLOYMENT.md#configuration-automatique-des-uuid).

### Resultats formations et partenaires

Appliquer [migration_backoffice_partner_results.sql](database/migration_backoffice_partner_results.sql) apres la migration principale, avant de deployer cette version. Elle ajoute trois champs a `ecoles_partenaires` et conserve les permissions de la fonction d'edition : `show_in_results`, `highlight_in_results` et `results_priority` (entier de 0 a 100). Le script de configuration verifie aussi la presence de ces colonnes.

Dans `/admin/partenaires`, chaque fiche permet de masquer une formation des recommandations, desactiver son accent visuel ou choisir sa priorite parmi les partenaires pertinents. Les mutations restent reservees aux administrateurs et auditees. Une formation masquee reste dans le catalogue partenaire si elle est active ; ses anciennes candidatures ne sont pas supprimees. L'accent desactive conserve la mention Partenaire.

Si la sauvegarde de ces reglages est refusee, verifier que la migration partenaires ci-dessus a bien ete appliquee, et pas uniquement celle du graphique eleves. Elle peut etre rejouee dans le SQL Editor Supabase, apres toute reexecution de la migration principale : celle-ci remet l'ancienne definition de `backoffice_change`, meme si les colonnes partenaires existent encore. Une fonction SQL ancienne qui refuse les nouveaux champs renvoie maintenant un diagnostic de migration explicite ; aucune validation ni ecriture d'audit n'est contournee.

L'ecran d'orientation utilise une grille commune : une insertion partenaire apres trois formations nationales, avec au plus trois partenaires, affiches seulement apres le chargement des resultats nationaux. `GET /api/ecoles/matched` classe les partenaires avec le meme algorithme de pertinence que le catalogue national (`client/src/lib/partnerRelevance.js`, importe par `server/utils/partnerMatching.js` : le serveur doit donc etre deploye depuis le depot complet). La priorite ajoute au plus 5 points au classement des partenaires pertinents, sans rendre visible un partenaire hors sujet ni modifier les scores affiches ou l'ordre du catalogue national. Les selections nationales et les demandes directes aux partenaires gardent leurs actions distinctes.

Dans l'espace eleve, `/app/formations` affiche au contraire un catalogue commun sans plafond de trois partenaires ni deduplication des campus. `GET /api/ecoles/partenaires` lit tous les partenaires actifs par pages de 1000, dans l'ordre stable ecole/ville/id ; une erreur sur une page interrompt explicitement la reponse, sans renvoyer un catalogue partiel comme une reussite. Les formations masquees des recommandations restent consultables si elles sont actives.

La page recalcule les correspondances a chaque visite avec le bilan et le profil courants. Les partenaires sont enrichis par `/api/ecoles/matched` ; les autres restent "A explorer" sans pourcentage. Les formations nationales utilisent les memes fonctions de pertinence et de niveau que le test. La priorite ne change jamais le pourcentage ; dans cette grille elle departage seulement des partenaires de meme score. Les cartes ouvrent les fiches existantes, sans creer de demande de contact. La preference de mobilite n'impose pas de filtre au catalogue partenaire complet. Un timeout persistant de la recherche nationale renvoie `503`, et non une liste vide de succes, pour permettre une reprise explicite.

Verification ciblee : depuis `server`, `node --test scripts/verify_partner_matching.test.mjs` couvre aussi la pagination de 2005 partenaires et une panne de page intermediaire. Depuis `client`, `npm run verify:formations-ui` couvre la grille commune avec API simulees.

### Ajouter une formation sur plusieurs campus

Appliquer [migration_backoffice_partner_campuses.sql](database/migration_backoffice_partner_campuses.sql) apres les migrations back-office principale et reglages partenaires. La nouvelle RPC `backoffice_create_partner_campuses` est reservee au serveur. Le script de configuration verifie sa presence par une requete volontairement invalide, sans aucune ecriture.

Dans `/admin/partenaires` > **Ajouter**, saisir l'ecole et les informations communes d'une formation une seule fois, puis les villes dans **Villes des campus (une ville par ligne)**, de 1 a 20 villes. Une fiche distincte par formation et par ville est creee, avec son propre identifiant, ce qui conserve le fonctionnement des recommandations et du suivi. Chaque fiche reste editable individuellement : lien, contact, visibilite, etc. Pour ajouter des villes a une formation existante, ouvrir sa fiche et utiliser **Ajouter des campus a cette formation** : les informations communes sont pre-remplies, et seules les nouvelles villes doivent etre saisies.

Exemple illustratif ECV : pour une formation effectivement proposee a Paris, Bordeaux et Nantes, saisir `ECV` une seule fois et ces trois villes sur trois lignes. Le formulaire cree trois fiches du meme programme. Ne pas supposer que chaque programme existe sur tous les campus ; saisir separement les formations dont les campus ou contenus different. Aucune ecole ECV n'est ajoutee automatiquement aux donnees de production.

`POST /api/admin/partners/campuses` accepte les champs communs de creation d'un partenaire (sans `city`) et `cities`, un tableau de villes. Les doublons de villes et les fiches deja existantes pour une meme ecole/formation/ville sont refuses. Le lot et ses entrees d'audit sont atomiques : si un campus echoue, aucun n'est cree. Une formation deja archivee n'est pas dupliquee : la reactiver ou modifier sa fiche. Cette evolution ne change pas les regles geographiques ni ne deduit un departement a partir d'une ville.

### Recommandations affichees et suivi des partenaires

Appliquer [migration_backoffice_recommendations.sql](database/migration_backoffice_recommendations.sql) apres les migrations back-office. L'ecran d'orientation enregistre automatiquement les formations effectivement affichees dans `informations_complementaires`, sous `orientation_recommendations`, sans attendre le clic de continuation. Les partenaires deja visibles sont enregistres meme pendant le chargement du catalogue national. Un echec de sauvegarde affiche une erreur et un bouton de nouvelle tentative. Cet enregistrement ne cree aucune candidature, demande d'informations ou notification ecole.

Le dashboard `/admin` presente une rubrique **Partenaires recommandes** distincte des formations selectionnees : formation, etablissement, campus/ville, eleve, lien et date. L'onglet **Recommandations** de `/admin/resultats` permet de consulter toutes les formations affichees, filtrer partenaires/catalogue national et rechercher un eleve, une ecole ou une ville. Les partenaires recommandes sont aussi rappeles dans les fiches utilisateurs et analyses, y compris lorsqu'ils ne sont pas retenus. Les demandes et choix conserves restent dans la vue des selections, sans assimilation automatique d'une recommandation a un consentement.

`GET /api/admin/recommendations` accepte `q`, `source` (`all`, `national`, `partner`), `user_id`, `limit` et `offset`. La RPC service-only `backoffice_recommendations` lit le dernier recapitulatif disponible (`orientation_recommendations` ou ancien `orientation_final_selection`) pour chaque utilisateur, sans filtrer les cases cochees. Les metiers sont exclus ; les campus restent distincts ; les doublons sont elimines. Le nom et le lien de l'etablissement sont lus depuis les donnees compactes enregistrees. Une liste vide plus recente remplace l'ancienne liste.

Pour les anciens parcours, seules les formations deja sauvegardees sont recuperables. Les partenaires absents des anciens enregistrements ne sont pas reconstitues a partir du catalogue actuel. Le script de configuration verifie la nouvelle RPC avant deploiement.

### Formations selectionnees

Appliquer [migration_backoffice_selections.sql](database/migration_backoffice_selections.sql) apres la migration principale. La vue d'ensemble montre les dernieres selections, et `/admin/resultats` ouvre la liste des formations retenues ; les analyses restent dans un onglet distinct. Le script de configuration verifie la nouvelle RPC avant deploiement.

`GET /api/admin/selections` accepte `q`, `source` (`all`, `orientation`, `partner`), `user_id`, `limit` (1 a 100) et `offset`. La RPC service-only `backoffice_selections` renvoie `items`, `total` et `totalUsers`, avec pagination et recherche cote SQL. Chaque ligne contient formation, etablissement, ville, utilisateur, origine et date d'enregistrement.

L'orientation utilise uniquement le dernier `orientation_final_selection` de chaque utilisateur : `type="formation"` et `requestMoreInformation=true` (booleen JSON). Les metiers, propositions non cochees et anciens formats sans indicateur ne sont pas assimiles a des choix. Les doublons sont elimines ; un JSON invalide est ignore. Les demandes `contact_submitted` sont listees separement, y compris pour les partenaires archives. Ces donnees existent independamment d'une analyse enregistree.

La date d'orientation est celle du dernier recapitulatif sauvegarde, pas celle d'un clic individuel. Toutes les formations affichees, nationales et partenaires, sont initialement preselectionnees et peuvent etre decochees. Le choix est conserve lors d'un retour en arriere. La suite du parcours attend la fin des chargements pour enregistrer un recapitulatif complet.

Le dernier `orientation_final_selection` enregistre aussi les partenaires decoches avec `requestMoreInformation=false`, comme les formations nationales. Seules les cases restees cochees remontent dans les listes de selections ; la rubrique des recommandations reste independante de ces choix. Enregistrer un partenaire recommande ne cree pas de `contact_submitted`. Les notifications aux etablissements concernent uniquement les formations conservees. Les anciennes recommandations partenaires non enregistrees ne peuvent pas etre reconstituees retroactivement. Aucun historique des anciens recapitulatifs remplaces n'est reconstitue. La consultation reste en lecture seule et reservee aux deux administrateurs.

### Evolution des eleves

Appliquer [migration_backoffice_student_growth.sql](database/migration_backoffice_student_growth.sql) avant le deploiement. `GET /api/admin/student-growth?days=30` accepte uniquement 30, 90 ou 365 jours (30 par defaut) et utilise la RPC service-only `backoffice_student_growth`. Le script de configuration verifie sa presence.

La reponse contient `periodDays`, `totalStudents`, `newStudents` et `points` (`date`, `registrations`, `total`). Chaque jour UTC est present, avec un cumul initial pour les comptes plus anciens. Les proprietaires et membres d'ecoles ainsi que les deux administrateurs sont exclus. Les comptes suspendus sont inclus ; les comptes supprimes et les anciens changements de role ne peuvent pas etre reconstitues. Aucune donnee individuelle ni modification de compte n'est exposee par cette route.

## Database Schema

The server expects the following Supabase tables:

### profiles
```sql
CREATE TABLE profiles (
  id UUID REFERENCES auth.users(id) PRIMARY KEY,
  email TEXT,
  full_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### activities
```sql
CREATE TABLE activities (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id),
  title TEXT NOT NULL,
  description TEXT,
  category TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### jobs
```sql
CREATE TABLE jobs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id),
  title TEXT NOT NULL,
  description TEXT,
  company TEXT,
  location TEXT,
  category TEXT,
  salary_range TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### formations
```sql
CREATE TABLE formations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id),
  title TEXT NOT NULL,
  description TEXT,
  provider TEXT,
  category TEXT,
  level TEXT,
  duration TEXT,
  price DECIMAL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### questionnaires
```sql
CREATE TABLE questionnaires (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  questions JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### questionnaire_responses
```sql
CREATE TABLE questionnaire_responses (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  questionnaire_id UUID REFERENCES questionnaires(id),
  user_id UUID REFERENCES auth.users(id),
  responses JSONB,
  submitted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

## Development

- `npm run dev` - Start development server with nodemon
- `npm start` - Start production server

## Environment Variables

- `PORT` - Server port (default: 3001)
- `NODE_ENV` - Environment (development/production)
- `SUPABASE_URL` - Supabase project URL
- `SUPABASE_ANON_KEY` - Supabase anonymous key
- `SUPABASE_SERVICE_ROLE_KEY` - Supabase service role key (required for payments and back-office)
- `JWT_SECRET` - JWT secret for token verification
- `CLIENT_URL` - Frontend client URL for CORS
- `SMTP_HOST` - SMTP server hostname for outgoing e-mails
- `SMTP_PORT` - SMTP server port (465 recommandé pour Resend)
- `SMTP_USER` - SMTP username
- `SMTP_PASSWORD` - SMTP password
- `EMAIL_FROM` - Adresse e-mail d’expédition utilisée pour les partages (ex: `Zélia <orientation@zelia.io>`)

## Security Features

- Rate limiting (100 requests per 15 minutes per IP)
- CORS protection
- Helmet security headers
- Request size limits
- Input validation
- Authentication middleware
