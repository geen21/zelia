# Zelia V2 Development Guide

## Sitemaps formations

Les fichiers `/sitemap-formations-N.xml` conservent des blocs de 5000 formations tries par `id`, lus par pages de 1000 lignes maximum. Pour acceder directement a un bloc, seule une recherche de son curseur sur la colonne `id` utilise un offset ; les lectures des donnees completes utilisent ensuite `id > curseur`. Cela evite de parcourir les lignes completes de tous les blocs precedents a chaque page. La cle primaire sur `formation_france.id` du schema existant est requise ; aucun nouvel index ni changement de timeout n'est ajoute.

Le compteur et les XML restent en cache pendant une heure. Les requetes simultanees pour le meme compteur ou fichier partagent le travail en cours. Un timeout est retente une seule fois ; un echec persistant reste journalise et renvoie HTTP 500, sans mettre en cache un sitemap incomplet.

Verification locale sans acces a Supabase :

```powershell
npm --prefix server run verify:sitemap
```

Les tests couvrent les blocs profonds, les identifiants non consecutifs et de grande taille, la limite PostgREST de 1000 lignes, le contenu XML, le cache, les acces simultanes et les erreurs. Ils ne mesurent pas les temps d'execution de la base distante.

## Inscriptions partenaires / ecoles

Le formulaire `/espace-ecoles/inscription` enregistre une demande sans mot de passe, sans creation de compte Auth et sans connexion automatique. Il conserve la selection d'un etablissement connu et demande le prenom, le nom et l'email professionnel. La page et la confirmation annoncent un recontact dans les **2 jours ouvres**.

Appliquer [migration_school_registration_requests.sql](server/database/migration_school_registration_requests.sql) avant de deployer. Les demandes sont visibles dans `/admin/inscriptions-ecoles` (menu **Inscriptions ecoles**), avec recherche par etablissement/contact/email et pagination. Seul le backend peut lire ou inserer ces donnees ; le back-office reste reserve aux administrateurs existants. Le suivi de contact se fait manuellement, sans creation automatique d'un acces. Les comptes ecoles existants restent inchanges.

Controles locaux, avec base en memoire et API navigateur simulees (aucune donnee distante) :

```powershell
npm --prefix server run verify:school-registration
npm --prefix client run verify:school-registration
```

Le controle navigateur utilise le serveur Vite local decrit ci-dessous (`BACKOFFICE_TEST_URL` pour changer son adresse).

## Back-office local

La nouvelle interface est disponible sur `/admin/connexion`. Elle utilise une session Supabase distincte dans `sessionStorage`, sans deconnecter les sessions eleve ou ecole. Les deux administrateurs se connectent avec leurs comptes existants ; aucune inscription admin n'est proposee.

Les formations selectionnees sont prioritaires : dernieres selections sur l'accueil, liste par defaut dans `/admin/resultats` et rappel dans les fiches utilisateurs/analyses. Appliquer [migration_backoffice_selections.sql](server/database/migration_backoffice_selections.sql) pour activer cette vue. La recherche porte sur formation, etablissement, ville et utilisateur ; les demandes partenaires ont un filtre et un statut distincts. Les analyses restent disponibles dans leur onglet, en lecture seule.

Pour le pilotage de la grille commune de recommandations, appliquer aussi [migration_backoffice_partner_results.sql](server/database/migration_backoffice_partner_results.sql). Les trois reglages sont dans chaque fiche `/admin/partenaires` : affichage dans les recommandations, accent visuel et priorite (0 a 100). Le controle pur du melange peut etre execute sans navigateur : `node client/scripts/verify-backoffice.mjs --results-only`.

La vue d'ensemble affiche le cumul des inscriptions eleves sur 30 jours, 90 jours ou 365 jours, avec les nouvelles inscriptions de la periode. Appliquer [migration_backoffice_student_growth.sql](server/database/migration_backoffice_student_growth.sql) pour activer cette statistique. Les comptes proprietaires/membres d'ecoles et les deux administrateurs sont exclus ; les comptes suspendus restent des inscriptions. La serie est calculee en SQL par jour UTC, sans limite de pagination. Elle est reconstruite a partir des comptes Auth encore presents et de leurs roles actuels : les suppressions et anciens changements de role ne constituent pas un historique conserve.

Avant un usage reel, suivre [la mise en service](DEPLOYMENT.md#back-office-mise-en-service) : migrations portail/partenaires presentes, application manuelle de [migration_backoffice.sql](server/database/migration_backoffice.sql), puis configuration serveur des deux `BACKOFFICE_*_USER_ID`. Ne pas reinitialiser une base existante avec le script de setup ci-dessous. Sans migration, les routes privees repondent `503` par securite.

Depuis la racine du workspace :

```powershell
npm --prefix server run verify:admin
npm --prefix client run build
node client/node_modules/@playwright/test/cli.js install chromium
```

Demarrer les serveurs dans deux terminaux :

```powershell
npm --prefix server run dev
npm --prefix client run dev -- --host 127.0.0.1 --port 5187 --strictPort
```

Puis verifier les parcours avec les API simulees :

```powershell
npm --prefix client run verify:admin-ui
```

Ouvrir `http://127.0.0.1:5187/admin/connexion`. Le port 5187 est autorise par CORS uniquement en developpement ; `VITE_API_URL` doit cibler l'API locale. Pour un autre serveur client, definir `BACKOFFICE_TEST_URL` et configurer son origine cote backend. Les captures des tests sont dans le dossier temporaire `zelia-backoffice-tests`. Les tests navigateur/SQL n'utilisent pas les vrais comptes ni les donnees distantes.

Les controles automatises couvrent les refus d'acces, les formulaires et confirmations, les sessions isolees, la pagination, les permissions RLS, ainsi que l'absence de suivi sur une entree directe `/admin`. Le graphique est verifie en SQL (cumul initial, jours vides, exclusions, calendrier UTC) et en navigateur (trace, periodes, etats vide/erreur, desktop/mobile). Les selections sont testees en SQL (dernier recapitulatif, indicateurs booleens, dedoublonnage, JSON invalide, partenaires archives, plus de 1000 lignes) et en navigateur (recherche, origine, utilisateur, pagination, details en lecture seule, etats vide/erreur, desktop/mobile). La migration distante et les connexions des deux comptes reels restent a valider manuellement en staging.

## Backend Setup Complete ✅

Your Express.js backend server has been successfully created with the following features:

### 🚀 Backend Features
- **Express.js Server** running on port 3001
- **Supabase Integration** for database and authentication
- **RESTful API** with comprehensive endpoints
- **Security Middleware** (CORS, Helmet, Rate Limiting)
- **Authentication System** with JWT tokens
- **Error Handling** and request validation

### 📁 Backend Structure
```
server/
├── config/
│   └── supabase.js          # Supabase client configuration
├── middleware/
│   └── auth.js              # Authentication middleware
├── routes/
│   ├── auth.js              # Authentication endpoints
│   ├── users.js             # User management
│   ├── activities.js        # Activities CRUD
│   ├── jobs.js              # Job listings CRUD
│   ├── formations.js        # Formations CRUD
│   └── questionnaires.js    # Questionnaire system
├── database/
│   └── setup.sql            # Database schema setup
├── server.js                # Main server file
├── package.json             # Dependencies and scripts
└── .env                     # Environment variables
```

### 🔗 API Endpoints Available

#### Authentication (`/api/auth`)
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - User login
- `POST /api/auth/logout` - User logout
- `POST /api/auth/refresh` - Refresh tokens
- `POST /api/auth/reset-password` - Password reset

#### Users (`/api/users`)
- `GET /api/users/profile` - Get user profile
- `PUT /api/users/profile` - Update profile
- `GET /api/users/me` - Current user info

#### Activities (`/api/activities`)
- `GET /api/activities` - List all activities
- `GET /api/activities/:id` - Get specific activity
- `POST /api/activities` - Create activity (auth required)
- `PUT /api/activities/:id` - Update activity (auth required)
- `DELETE /api/activities/:id` - Delete activity (auth required)

#### Jobs (`/api/jobs`)
- `GET /api/jobs` - List job postings
- `GET /api/jobs/:id` - Get specific job
- `POST /api/jobs` - Create job (auth required)
- `PUT /api/jobs/:id` - Update job (auth required)
- `DELETE /api/jobs/:id` - Delete job (auth required)

#### Formations (`/api/formations`)
- `GET /api/formations` - List formations
- `GET /api/formations/:id` - Get specific formation
- `POST /api/formations` - Create formation (auth required)
- `PUT /api/formations/:id` - Update formation (auth required)
- `DELETE /api/formations/:id` - Delete formation (auth required)

## 🔧 Next Steps

### 1. Database Setup (Required)
**Important**: You need to run the database setup script in your Supabase dashboard:

1. Go to [Supabase Dashboard](https://app.supabase.com)
2. Open your project
3. Go to **SQL Editor**
4. Copy and paste the contents of `server/database/setup.sql`
5. Click **Run** to create all tables and policies

### 2. Frontend Integration
Your client already has the API utilities set up:
- `client/src/lib/api.js` - API client functions
- Updated `Login.jsx` to use the new backend
- Example `ActivitiesExample.jsx` component

### 3. Environment Variables
Make sure you have the correct `.env` files:

**Client** (`client/.env`):
```env
VITE_SUPABASE_URL=https://ofhklmyaioxznrqiolad.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9maGtsbXlhaW94em5ycWlvbGFkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTcwMTY4NjYsImV4cCI6MjA3MjU5Mjg2Nn0.idw8ArFNe8wgM2iELJkVLxjrW1yPDJ81tiqvXzo6JM8
VITE_API_URL=http://localhost:3001/api
```

**Server** (`server/.env`) - ✅ Already configured

### 4. Start Development
```bash
# Terminal 1 - Start backend
cd server
npm run dev

# Terminal 2 - Start frontend  
cd client
npm run dev
```

Or use VS Code tasks:
- Press `Ctrl+Shift+P`
- Type "Tasks: Run Task"
- Select "Start Both Client and Server"

## 📊 Testing the API

The server is currently running and accessible at:
- **API Base**: http://localhost:3001/api
- **Documentation**: http://localhost:3001/api
- **Health Check**: http://localhost:3001/health

### Test Authentication Flow
```javascript
// Example API usage from frontend
import { authAPI } from './lib/api'

// Register user
const userData = {
  email: 'test@example.com',
  password: 'password123',
  userData: { full_name: 'Test User' }
}
const result = await authAPI.register(userData)
```

## 🔒 Security Features
- **Rate Limiting**: 100 requests per 15 minutes per IP
- **CORS Protection**: Configured for localhost development
- **Input Validation**: Request body validation
- **Authentication**: JWT-based with Supabase
- **Row Level Security**: Database-level access control

## 🐛 Troubleshooting

### Common Issues
1. **Server won't start**: Check `.env` file exists in server folder
2. **Database errors**: Make sure you ran the SQL setup script
3. **CORS errors**: Verify `CLIENT_URL` in server `.env`
4. **Auth errors**: Check Supabase credentials

### Debug Mode
Set `NODE_ENV=development` in server `.env` for detailed error messages.

## 📝 Development Workflow

1. **Backend Changes**: Server restarts automatically with nodemon
2. **Frontend Changes**: Vite hot reload updates automatically  
3. **Database Changes**: Update `setup.sql` and re-run in Supabase
4. **API Testing**: Use the browser at http://localhost:3001/api

## 🚀 Production Deployment

When ready for production:
1. Set `NODE_ENV=production` in server environment
2. Update CORS origins for production domains
3. Use strong JWT secrets
4. Enable HTTPS
5. Set up proper hosting (Vercel, Railway, etc.)

Your backend is now fully functional and ready for development! 🎉
