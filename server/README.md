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

### Partage des résultats (`/api/share`)
- `POST /results` - Envoie le PDF des résultats d’un élève aux adresses e-mail fournies (authentifié)

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

L'ecran d'orientation utilise une grille commune : une insertion partenaire apres trois formations nationales, avec au plus trois partenaires. La priorite departage les partenaires uniquement, sans modifier les scores ni l'ordre du catalogue national. Les selections nationales et les demandes directes aux partenaires gardent leurs actions distinctes.

### Formations selectionnees

Appliquer [migration_backoffice_selections.sql](database/migration_backoffice_selections.sql) apres la migration principale. La vue d'ensemble montre les dernieres selections, et `/admin/resultats` ouvre la liste des formations retenues ; les analyses restent dans un onglet distinct. Le script de configuration verifie la nouvelle RPC avant deploiement.

`GET /api/admin/selections` accepte `q`, `source` (`all`, `orientation`, `partner`), `user_id`, `limit` (1 a 100) et `offset`. La RPC service-only `backoffice_selections` renvoie `items`, `total` et `totalUsers`, avec pagination et recherche cote SQL. Chaque ligne contient formation, etablissement, ville, utilisateur, origine et date d'enregistrement.

L'orientation utilise uniquement le dernier `orientation_final_selection` de chaque utilisateur : `type="formation"` et `requestMoreInformation=true` (booleen JSON). Les metiers, propositions non cochees et anciens formats sans indicateur ne sont pas assimiles a des choix. Les doublons sont elimines ; un JSON invalide est ignore. Les demandes `contact_submitted` sont listees separement, y compris pour les partenaires archives. Ces donnees existent independamment d'une analyse enregistree.

La date d'orientation est celle du dernier recapitulatif sauvegarde, pas celle d'un clic individuel. Les cases sont initialement preselectionnees dans le parcours ; la vue restitue le choix conserve lors de sa sauvegarde. Aucun historique de deselections ni des anciens recapitulatifs remplaces n'est reconstitue. La consultation reste en lecture seule et reservee aux deux administrateurs.

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
- `SUPABASE_SERVICE_ROLE_KEY` - Supabase service role key (optional)
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
