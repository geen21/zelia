# Zelia Deployment Guide

This document describes how to deploy the Zelia client and server on a Linux host. The instructions assume you have SSH access to the target machine and sudo privileges.

> **Assumptions**
> - Target host: `217.154.162.139`
> - Existing service bound to `0.0.0.0:5050` (do not reuse this address)
> - Node.js 20.x runtime, Git, and Nginx will be installed via package manager
> - The backend runs behind Nginx and listens only on the loopback interface (`127.0.0.1`)

## 1. Prepare the host

```bash
ssh <user>@217.154.162.139
sudo apt update
sudo apt install -y curl git nginx
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs build-essential
sudo npm install -g pm2
```

## 2. Clone the repository

```bash
mkdir -p ~/apps && cd ~/apps
git clone https://github.com/geen21/zelia.git
cd zelia
```

## 3. Configure environment variables

Create a `server/.env` file with the secrets required by the backend:

```bash
cat <<'EOF' > server/.env
PORT=5051
HOST=127.0.0.1
NODE_ENV=production
CLIENT_URL=https://<your-domain-or-ip>
SUPABASE_URL=<supabase-url>
SUPABASE_ANON_KEY=<supabase-anon-key>
SUPABASE_SERVICE_ROLE_KEY=<supabase-service-role-key>
BACKOFFICE_JORIS_USER_ID=<uuid-du-compte-joris-controle>
BACKOFFICE_NICOLAS_USER_ID=<uuid-du-compte-nicolas-controle>
JWT_SECRET=<jwt-secret>
STRIPE_SECRET_KEY=<stripe-secret-key>
STRIPE_PUBLISHABLE_KEY=<stripe-publishable-key>
STRIPE_WEBHOOK_SECRET=<stripe-webhook-secret>
STRIPE_PRICE_ID=<stripe-price-id>
CLOUDINARY_URL=<cloudinary-url>
# Optional: fine-grained Cloudinary config if CLOUDINARY_URL is not provided
# CLOUDINARY_CLOUD_NAME=<cloud-name>
# CLOUDINARY_API_KEY=<api-key>
# CLOUDINARY_API_SECRET=<api-secret>
# Email delivery (share route)
# SMTP_HOST=<smtp-host>
# SMTP_PORT=<smtp-port>
# SMTP_SECURE=true
# SMTP_USER=<smtp-user>
# SMTP_PASSWORD=<smtp-password>
# EMAIL_FROM=<friendly-from-address>
# EMAIL_BCC=<comma-separated-bcc>
# Generative AI chat endpoint
# GEMINI_API_KEY=<google-genai-key>
# Additional client origins separated by commas if needed
# ADDITIONAL_CLIENT_ORIGINS=https://app.example.com,https://admin.example.com
# ... any other secrets referenced in config/*.js
EOF
```

> **Tip:** Additional Stripe configuration is available via `STRIPE_API_VERSION`, `STRIPE_PRICE_AMOUNT`, `STRIPE_PRICE_CURRENCY`, `STRIPE_PRODUCT_NAME`, `STRIPE_SUCCESS_URL`, and `STRIPE_CANCEL_URL` if you need to override defaults.

For the client, create `client/.env.production` (values are embedded at build time):

```bash
cat <<'EOF' > client/.env.production
VITE_SUPABASE_URL=<supabase-url>
VITE_SUPABASE_ANON_KEY=<supabase-anon-key>
VITE_API_URL=https://<your-domain-or-ip>/api
EOF
```

## 4. Install dependencies and build

**Avant le premier deploiement de cette version**, suivre la section [Back-office : mise en service](#back-office-mise-en-service). La migration SQL doit preceder le redemarrage du backend : son absence bloque les routes authentifiees existantes.

Backend:

```bash
cd ~/apps/zelia/server
npm install
```

Frontend:

```bash
cd ~/apps/zelia/client
npm install
npm run build
```

Copy the build output to a location that Nginx can serve:

```bash
sudo mkdir -p /var/www/zelia
sudo rsync -a ./dist/ /var/www/zelia/
```

> Run these commands from inside `~/apps/zelia/client` so the relative `./dist/` path resolves correctly.

## 5. Run the backend with PM2

```bash
cd ~/apps/zelia/server
pm2 start server.js --name zelia --update-env
pm2 save
pm2 startup systemd -u $(whoami) --hp $HOME
```

## 6. Configure Nginx

Create `/etc/nginx/sites-available/zelia`:

```bash
sudo tee /etc/nginx/sites-available/zelia > /dev/null <<'EOF'
server {
    listen 80;
    listen [::]:80;
    server_name <your-domain-or-ip>;

    root /var/www/zelia;
    index index.html;

    location /api/ {
        proxy_pass http://127.0.0.1:5051/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}
EOF
```

Enable the site and restart Nginx:

```bash
sudo ln -s /etc/nginx/sites-available/zelia /etc/nginx/sites-enabled/zelia
sudo nginx -t
sudo systemctl reload nginx
```

(Optional) Secure the site with HTTPS using Certbot once DNS is configured:

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d <your-domain>
```

## 7. Post-deployment checklist

- Confirm PM2 process is online: `pm2 status`
- Visit `https://<your-domain-or-ip>/` and ensure the SPA loads
- Test the API health check: `curl -H 'Host: <your-domain-or-ip>' http://127.0.0.1:5051/health`
- Tail the logs if issues arise: `pm2 logs zelia`

## 8. Troubleshooting

- **`Error [ERR_MODULE_NOT_FOUND]: Cannot find package 'cloudinary'`** — ensure you are in `~/apps/zelia/server` and run `npm install`. If the error persists, install it explicitly with `npm install cloudinary` then restart PM2.
- **`rsync: change_dir "dist" failed`** — run the copy command from inside `~/apps/zelia/client` or use the absolute path `sudo rsync -a ~/apps/zelia/client/dist/ /var/www/zelia/`.

## 9. Updating the deployment

Pour une version comprenant des changements SQL, appliquer et valider les migrations requises avant de redemarrer le backend. Pour ce back-office, les etapes ci-dessous sont obligatoires.

```bash
cd ~/apps/zelia
git pull
cd server && npm install && pm2 restart zelia
cd ../client && npm install && npm run build
sudo rsync -a ./dist/ /var/www/zelia/
sudo systemctl reload nginx
```

> Run the copy command from inside `~/apps/zelia/client` (or replace `./dist/` with the absolute path) so Nginx serves the latest bundle.

This process keeps the existing `clean-ai` service on port 5050 untouched while running Zelia on the local loopback at port 5051.

## Back-office mise en service

Cette procedure est manuelle. Le code et les tests locaux ne modifient pas Supabase en production.

1. Sur staging, verifier que les migrations [partenaires](server/database/migration_ecoles_partenaires.sql), [portail v1](server/database/migration_school_portal.sql) et [portail v2](server/database/migration_school_portal_v2.sql) sont deja presentes. Ne pas rejouer les seeds ni recreer les comptes. Verifier les tables, grants et politiques privees effectivement deployes : la liste restrictive de la migration ne couvre que les tables connues.
2. Sauvegarder la base et appliquer [migration_backoffice.sql](server/database/migration_backoffice.sql) dans le SQL Editor Supabase. Verifier tables privees suspension/audit, fonction `backoffice_account_active`, RPC service-only et `ecoles_partenaires.is_active`. Verifier qu'un JWT `authenticated` ne peut pas appeler les RPC admin, lire les tables admin, inserer `companies` ni modifier `approved_at`/`owner_id` ; l'edition des contacts autorises doit continuer a fonctionner.
3. Dans Supabase Auth, relever les UUID des comptes **existants et controles** de `joris.geerdes@21datas.ch` et `nicolas.wiegele@zelia.io`. Verifier l'identite et la maitrise des comptes hors application : l'ancien flux d'inscription auto-confirme les emails, donc une adresse/confirmation seule n'est pas une preuve suffisante. Configurer les deux variables serveur ci-dessus ; pas de selection automatique du premier compte portant une adresse. Ne pas transmettre les mots de passe via une conversation ou les mettre dans la configuration.
4. Retirer `SCHOOL_PORTAL_ADMIN_KEY` de l'environnement. Deployer backend, puis client. Redemarrer le processus avec son environnement actualise. Toute configuration admin incomplete, erreur de controle de suspension ou migration manquante refuse l'acces ; aucune cle de secours ni allowlist email-only.
5. Recetter sur staging : `/api/admin/me` sans JWT = `401`, compte ordinaire = `403`, chacun des deux vrais comptes = acces aux sept sections. L'ancienne API admin ecoles doit etre inaccessible ; l'ancien chemin client redirige vers `/admin/ecoles`.
6. Avec un compte non-admin de test et son JWT deja emis, suspendre puis verifier API privees et acces Supabase direct/RLS ; connexion/refresh doivent aussi etre bloques. Tester reactivation et echec Auth : l'etat reste bloque tant que la synchronisation est en attente. Verifier qu'un autre compte reste fonctionnel et que les deux administrateurs ne peuvent pas etre suspendus depuis cette interface.
7. Avec une ecole de test, retirer/revalider son acces et verifier leads, export, statistiques, formations et equipe pour proprietaire **et** membre. Un changement de rattachement par le proprietaire doit retirer sa validation. Archiver une formation partenaire, verifier disparition des nouvelles listes/demandes et conservation des anciennes candidatures ; le catalogue national reste en lecture seule.
8. Verifier isolation des sessions et absence de donnees privees dans analytics, captures et logs. Les entrees `/admin` n'initialisent pas GTM et portent `noindex`; une transition depuis une page publique recharge le document. Ajouter aussi chez GTM/Hotjar et tout outil de capture une exclusion explicite des chemins `/admin` et `/espace-ecoles/admin`, y compris en navigation SPA. Ne pas activer de capture DOM/formulaire sur ces chemins. Configurer le proxy pour ne pas conserver les query strings de `/api/admin/*` dans ses logs (le backend les masque deja).
9. Apres recette validee, repeter migration/configuration/deploiement sur production, puis un smoke test en lecture seule avec chacun des deux comptes. L'interface est sur `https://<domaine>/admin/connexion`. Aucun UUID reel ni resultat de recette distante n'est fourni par les tests locaux.

### Configuration automatique des UUID

Si la migration back-office a deja ete appliquee avec l'ancienne adresse mal orthographiee, executer d'abord [migration_backoffice_admin_email.sql](server/database/migration_backoffice_admin_email.sql) dans Supabase. Ce patch corrige uniquement les deux fonctions administratives, conserve leurs privileges et peut etre rejoue. Pour une nouvelle installation, la migration principale contient deja `nicolas.wiegele@zelia.io`.

Apres avoir applique la migration et confirme la maitrise des deux comptes existants, executer depuis la racine du depot :

```bash
node server/scripts/configure_backoffice.mjs
```

Le script utilise uniquement les credentials Supabase deja presents dans le fichier d'environnement serveur. Il retrouve les deux comptes exacts, verifie leur correspondance Auth et leur statut, puis ajoute les deux UUID dans ce meme fichier. Une configuration existante contradictoire provoque un arret, sans remplacement silencieux. Aucun compte ni mot de passe n'est cree/modifie. L'environnement original est sauvegarde dans `~/.zelia-backoffice-backups/`, avec permissions privees. `--check` verifie les prerequis sans ecriture. Aucun secret n'est affiche.

Commande VPS a executer **apres reussite du SQL dans Supabase** :

```powershell
ssh root@217.154.162.139 "set -e; cd ~/apps/zelia; git stash push -m backoffice-deployment; git pull --ff-only origin main; cd server; npm ci; node scripts/configure_backoffice.mjs; cd ../client; npm ci; npm run build; rsync -a ./dist/ /var/www/zelia/; pm2 restart zelia --update-env; nginx -t; systemctl reload nginx; pm2 status"
```

`set -e` arrete la commande a la premiere erreur : une migration absente/incomplete, un compte manquant ou un conflit UUID empeche le build/deploiement et le redemarrage. Le stash conserve les modifications suivies du VPS ; il n'est pas reapplique automatiquement. Les fichiers d'environnement ignores par Git restent en place. Saisir les credentials SSH uniquement dans le terminal, jamais dans la commande ou une conversation.

Controles automatises depuis la racine : `npm --prefix server run verify:admin`, `npm --prefix client run build`, puis `npm --prefix client run verify:admin-ui` avec le serveur Vite local sur 5187. Voir [le guide de developpement](DEVELOPMENT.md#back-office-local) pour Chromium et les captures desktop/mobile. Une synchronisation Auth en attente apparait explicitement dans la fiche compte ; corriger l'indisponibilite, puis reprendre la suspension/reactivation au meme endroit.
