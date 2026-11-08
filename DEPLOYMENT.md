# Zelia Deployment Guide

## Stabilisation des URL canoniques des formations apres enrichissement

L'enrichissement des titres ne doit pas migrer les URL deja publiees. La colonne
`formation_france.canonical_slug` fige l'ancienne URL, independamment de `nm`,
`fl`, du nom de l'etablissement et de la ville. Les fiches restent enrichies ;
les anciennes et nouvelles variantes avec le meme id restent accessibles,
mais partagent une seule canonical historique. Aucune suppression d'URL
Search Console, aucun `noindex` et aucun blocage robots ne sont requis.

### Ordre obligatoire : preparation, base, puis activation

1. Sauvegarder la base et conserver le snapshot **avant enrichissement**.
   Le manifeste prepare le 4 novembre contient 127498 anciennes URL et provient
   de la sauvegarde SHA-256
   `6e8790dd053dc54aa8b2e74279fd355bf51915933e0000b1036d7e4987bcb677`.
   Copier uniquement le manifeste dans `server/.generated` sur l'environnement
   qui dispose de la cle de service ; ne pas exposer cette cle au navigateur.
2. Executer [migration_formation_canonical_urls.sql](server/database/migration_formation_canonical_urls.sql)
   dans Supabase, d'abord en staging. Elle ajoute la colonne et une RPC reservee
   au role de service. Les anciennes lignes restent nulles jusqu'au backfill :
   ne pas les figer avec les nouveaux titres. Les nouvelles insertions obtiennent
   ensuite une URL persistante, protegee contre les changements ulterieurs.
3. Depuis `server`, verifier puis appliquer le manifeste historique :

   ```powershell
   node scripts\pin_formation_urls.mjs --input .generated\formation-historical-canonicals-20261104.json
   node scripts\pin_formation_urls.mjs --input .generated\formation-historical-canonicals-20261104.json --expected-sha256 905181e0fad7e35df9432ac5043f331a4b816d50c48e0e23f87a4d8f892eebc7 --journal .generated\formation-canonical-publication.jsonl --apply
   ```

   Le manifeste a le SHA-256 ci-dessus. Il est refuse s'il a change. Chaque lot
   atomique verifie les identifiants source et les URL relues dans la base.
   Une reprise avec un nouveau journal accepte les URL deja correctement figees,
   mais refuse toute autre valeur existante. Ne pas supprimer la protection
   d'immutabilite pour forcer un conflit : examiner sa provenance.
4. Verifier que toutes les lignes historiques ont une canonical. Deployer le
   backend et le client avec `FORMATION_CANONICAL_URLS_ENABLED=true` **uniquement
   apres le backfill complet** ; reconstruire avec `npm run build`.
   Le flag est desactive par defaut pour ne pas casser les serveurs qui n'ont
   pas encore la migration. Actif, une canonical manquante produit une erreur
   explicite plutot qu'un retour silencieux aux nouvelles URL.
5. Redemarrer l'API pour vider son cache de sitemaps et de recherches. Verifier
   les caches proxy/CDN : les sitemaps sont caches pendant une heure.
   Tester une ancienne URL et son alias enrichi : meme contenu enrichi,
   `rel=canonical`, `og:url` et JSON-LD vers l'ancienne URL. Les liens internes
   et `/sitemap-formations-1.xml` doivent utiliser cette meme URL.

### Search Console : seulement apres verification en production

1. Ouvrir la propriete `sc-domain:zelia.io` dans un compte autorise.
2. Inspecter une ancienne URL representative, puis **Tester l'URL en direct** :
   acces Google autorise, reponse exploitable et canonical declaree historique.
3. Verifier les sitemaps existants `https://zelia.io/sitemap.xml` et
   `https://zelia.io/sitemap-index.xml`. Soumettre de nouveau l'index des
   formations apres avoir confirme que ses sous-sitemaps listent les canonicales.
   Ne pas supprimer les sitemaps de metiers ou de blog.
4. Demander l'indexation de quelques URL representatives, pas de 127498 pages
   individuellement. Suivre la canonical choisie par Google dans les inspections
   ulterieures ; sa prise en compte depend d'une nouvelle exploration et n'est
   ni immediate ni garantie par une soumission de sitemap.
5. **Valider la correction** uniquement dans le groupe d'erreurs correspondant
   si Search Console en signale un. Le rapport Core Web Vitals traite d'autres
   problemes : ne pas confondre sa validation avec celle des canonicales.

Verification locale : `cd server; npm run verify:sitemap`, puis
`cd client; npm run verify:formations-ui`.
Apres deploiement, depuis `client`, executer
`node scripts\verify-formation-seo-live.mjs` : ce controle refuse la validation
si l'API, le sitemap et les canonicales rendues ne correspondent pas aux URL
historiques du manifeste. Il ne soumet rien a Search Console.

## Core Web Vitals : verification apres deploiement

- Reconstruire et deployer le client complet (y compris les nouveaux chunks et CSS).
  `npm run build` conserve automatiquement le catalogue metiers lorsque son
  snapshot est present ; `build:metiers` exige explicitement ce catalogue.
  Le correctif ne demande pas de migration SQL ni de modification du backend.
- Avant livraison, depuis `client`, executer `npm run verify:web-vitals` sur le build.
  Les mesures locales excluent les services externes et la latence reelle des API.
- Apres livraison, tester l'accueil, une fiche formation et le blog avec PageSpeed
  Insights sur mobile et desktop, puis lancer **Valider la correction** dans le
  rapport mobile Search Console. Ne pas lancer cette validation avant deploiement.
- Le rapport consulte le 3 novembre 2026 signale 3286 URL mobiles dans un groupe
  LCP a 3,5 s. Sur desktop, les trois categories sont a zero et aucun probleme
  n'est detecte : l'absence de bonnes URL n'etablit pas une regression, elle peut
  correspondre a un volume insuffisant de mesures CrUX.
- Les donnees terrain reposent sur une fenetre glissante de 28 jours : le retour
  a un statut vert n'est ni immediat ni garanti par les seuls tests locaux.

## Pages metiers : contenu editorial isole

1. Appliquer [migration_metier_pages.sql](server/database/migration_metier_pages.sql),
   puis [migration_metier_catalog_rome.sql](server/database/migration_metier_catalog_rome.sql).
   Tous les nouveaux objets sont dans `seo`, sans ecriture sur les annonces
   de `public.metiers_france`. Ajouter `seo` aux schemas exposes de la Data API
   Supabase pour les scripts serveur ; les roles `anon` et `authenticated` restent
   interdits par les permissions de schema, tables et fonctions.
2. Telecharger le ZIP JSON officiel France Travail dans
   `server/.generated/rome-open-data.zip`, puis executer
   `npm run metiers -- sync-rome`. La cible est une page par fiche ROME presente
   dans la base historique, avec regroupement de ses appellations. La migration
   porte le budget total persistant autorise a 3 USD, appels passes et reprises
   inclus, sans remettre le compteur a zero.
3. Executer `npm run metiers -- export --preview --detailed-only`, puis depuis `client`
   `npm run build:metiers`. Examiner les trois fiches detaillees avec l'utilisateur :
   600–900 mots utiles, FAQ et sources, verdict explique en 1–2 phrases.
   Pour les anciens pilotes courts, utiliser `regenerate --id <id>`.
   Les metiers sans documentation verifiee restent bloques pour la generation longue.
   Une previsualisation est `noindex` et ne genere aucun sitemap metier.
4. Seulement apres validation humaine, executer `approve-sample`, puis
   `quote` pour le devis complet, puis `run-all` pour soumettre et collecter les
   lots Gemini Flash-Lite Batch sous le plafond strict. `status` donne la
   progression ; `collect` permet aussi une recuperation manuelle sans
   resoumission. Ne pas augmenter automatiquement le budget en cas de blocage.
   Voir le [guide serveur](server/README.md#editorial-metier-pages-isolated-seo-schema).
5. Resoudre les titres ambigus et erreurs, puis exporter sans `--preview`.
   L'export final refuse les metiers manquants. Reconstruire avec
   `npm run build:metiers`, qui exige un snapshot valide et inclut les liens
   publics, HTML, JSON et sitemaps correspondants. Ne jamais deployer les
   donnees synthetiques de `verify:metiers`.
   Les builds classiques `npm run build` conservent aussi ce catalogue.
   Si son snapshot manque alors que des pages existent deja, le build echoue
   avant d'effacer les fichiers en place. Ne pas contourner cette protection
   en executant directement `vite build`.
6. Deployer le dossier `dist` complet depuis un repertoire de release, puis
   basculer atomiquement la version servie. Ne pas lancer Vite directement
   dans le repertoire actuellement servi. Conserver la release precedente.
   Installer la configuration Nginx fournie, verifier `nginx -t`, puis recharger.
7. Controler les pages sans JavaScript, les canonical et redirections de slash,
   les 404 de `/metiers/inconnu/` et `/metiers-data/inconnu/index.json`,
   `robots.txt`, les sitemaps metiers et le maintien des sitemaps formations.
   Les dates `lastmod` correspondent au contenu, pas au jour du build.

## Correctif des liens des formations selectionnees

Si les selections affichent **Lien indisponible** alors que leur URL est enregistree, appliquer [migration_backoffice_selection_links.sql](server/database/migration_backoffice_selection_links.sql) apres `migration_backoffice_selections.sql`, puis actualiser le back-office. Ce correctif remplace uniquement la fonction de lecture : il restitue les liens compacts et historiques sans modifier les selections, leur date, leurs filtres ou leurs permissions. Aucun nouveau build client n'est requis pour afficher ces URL deja enregistrees. Deployer aussi le backend pour conserver les liens lors de futures sauvegardes aux anciens formats (`raw.link`, `fiche`, `etab_url`). Une URL absente ou non HTTP(S) reste indiquee comme indisponible.

## Dashboards partenaires : mise en service

1. Sauvegarder la base puis appliquer [migration_partner_dashboards.sql](server/database/migration_partner_dashboards.sql), apres `migration_school_portal.sql`, `migration_school_portal_v2.sql`, les migrations back-office/reglages partenaires et `migration_school_registration_requests.sql`, puis [migration_partner_dashboards_auto_spaces.sql](server/database/migration_partner_dashboards_auto_spaces.sql). La seconde migration cree les espaces de tous les partenaires existants et automatise ceux des futurs partenaires, sans compte Auth ni email fictif. Les formations et campus d'une ecole partagent le meme espace. En cas de conflit entre espaces homonymes, verifier les rattachements existants avant de relancer. Ne pas utiliser `setup.sql` pour mettre a jour une base existante.
2. Deployer le backend et le client ensemble apres la migration. Les nouveaux endpoints signalent explicitement une migration absente. Les anciens endpoints de revelation/demandes directes sont remplaces par `/api/school-portal/lead/:key/reveal` et la liste unifiee `/leads`.
3. Dans Resend, verifier le domaine d'envoi et configurer SPF/DKIM. Renseigner cote serveur `SMTP_HOST=smtp.resend.com`, `SMTP_PORT=465`, `SMTP_SECURE=true`, `SMTP_USER=resend`, `SMTP_PASSWORD=<cle Resend>` et `EMAIL_FROM` sur ce domaine. Aucune cle Resend ou de service Supabase ne doit etre exposee au client.
4. Dans Supabase Auth, configurer egalement le SMTP personnalise Resend pour les emails natifs (notamment la recuperation). Autoriser exactement les URLs d'activation des environnements utilises, par exemple `https://zelia.io/espace-ecoles/activation`, et activer TOTP. Verifier les quotas Auth/Resend et les templates. Conserver les destinations des emails eleves existants : ne pas remplacer tous les redirects par le callback ecoles.
5. Depuis `/admin/partenaires` ou `/admin/ecoles`, utiliser directement **Voir le dashboard** ou **Gerer les acces**. Tous les partenaires ont deja leur espace apres migration. Renseigner l'email du responsable et inviter le proprietaire, puis valider son acces et inviter les membres. Les formations partenaires sont rattachees automatiquement ; verifier manuellement les correspondances du catalogue national. Le retrait d'un membre ne supprime pas son identite Auth ; une suspension globale reste une operation distincte.
6. Avec des comptes de staging uniquement, verifier : deux ecoles isolees, plusieurs campus, reception/renvoi/expiration d'invitation, activation et recuperation, facteur TOTP et refus AAL1, maintien des sessions eleve/admin, dossier historique restreint, confirmation de partage detaille, retrait d'une ecole, CSV et totaux naturel/sponsorise/mixte.
7. En cas de perte du facteur, passer par le support Zelia avec verification d'identite avant toute intervention manuelle Supabase. Un email de recuperation ne doit pas desactiver la MFA. Les fichiers deja exportes doivent faire l'objet d'une demande de retrait aupres de l'ecole si necessaire.

Les suites locales n'envoient aucun email reel et ne verifient ni DNS ni configuration distante. Ne pas annoncer la mise en service sans recette Supabase/Resend. Voir le [guide de developpement](DEVELOPMENT.md#dashboards-et-comptes-partenaires).

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

### Gemini access

Set `GEMINI_API_KEY` only in the server environment, never in a `VITE_*`
variable. Unrestricted standard keys are rejected by Google: use an AI Studio
authorization key or restrict a standard key to the Generative Language API
([official instructions](https://aistudio.google.com/docs/api-key#secure-unrestricted-keys)).
For server requests, any application restriction must permit the server's
outbound IP, not just the website's browser origin. Revoke any disclosed key,
replace the server secret, then restart the API process (with refreshed
environment variables if a process manager is used). Do not commit the key.
An analysis response with `GEMINI_CONFIGURATION_ERROR` requires checking the
server's `Gemini API error` HTTP status and access configuration; repeatedly
retrying the questionnaire cannot repair a disabled key.

### Payment security prerequisites

- On existing databases, manually apply [security_payment_profile_columns.sql](server/database/security_payment_profile_columns.sql) after the base schema. It prevents direct user writes to payment fields, independently of Express. Do not deploy only the API fix.
- Payment routes require `SUPABASE_SERVICE_ROLE_KEY`; never expose this key in client variables.
- Configure a fixed, one-time `STRIPE_PRICE_ID`, or the server-side inline amount/currency/product. Client-selected alternative prices are rejected. Keep the configured price unchanged until outstanding Checkout Sessions settle.
- Configure both Stripe webhook endpoints with their own signing secrets (`STRIPE_WEBHOOK_SECRET` and `STRIPE_PARENT_WEBHOOK_SECRET` for the separate parent account). Missing configuration returns HTTP 503; unsigned events are never accepted.
- Subscribe both endpoints to `checkout.session.completed`, `checkout.session.async_payment_succeeded`, and `checkout.session.async_payment_failed`. Delayed payments remain pending until Stripe confirms payment; persistence failures return HTTP 500 so Stripe can retry.
- Before release, run `npm run verify:payments` in the server directory, then exercise a successful and a delayed/failed payment in Stripe test mode. This local command does not query production or apply migrations.

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
5. Recetter sur staging : `/api/admin/me` sans JWT = `401`, compte ordinaire = `403`, chacun des deux vrais comptes = acces aux sections. L'ancienne API admin ecoles doit etre inaccessible ; l'ancien chemin client redirige vers `/admin/ecoles`.
6. Avec un compte non-admin de test et son JWT deja emis, suspendre puis verifier API privees et acces Supabase direct/RLS ; connexion/refresh doivent aussi etre bloques. Tester reactivation et echec Auth : l'etat reste bloque tant que la synchronisation est en attente. Verifier qu'un autre compte reste fonctionnel et que les deux administrateurs ne peuvent pas etre suspendus depuis cette interface.
7. Avec une ecole de test, retirer/revalider son acces et verifier leads, export, statistiques, formations et equipe pour proprietaire **et** membre. Un changement de rattachement par le proprietaire doit retirer sa validation. Archiver une formation partenaire, verifier disparition des nouvelles listes/demandes et conservation des anciennes candidatures ; le catalogue national reste en lecture seule.
8. Verifier isolation des sessions et absence de donnees privees dans analytics, captures et logs. Les entrees `/admin` n'initialisent pas GTM et portent `noindex`; une transition depuis une page publique recharge le document. Ajouter aussi chez GTM/Hotjar et tout outil de capture une exclusion explicite des chemins `/admin` et `/espace-ecoles/admin`, y compris en navigation SPA. Ne pas activer de capture DOM/formulaire sur ces chemins. Configurer le proxy pour ne pas conserver les query strings de `/api/admin/*` dans ses logs (le backend les masque deja).
9. Apres recette validee, repeter migration/configuration/deploiement sur production, puis un smoke test en lecture seule avec chacun des deux comptes. L'interface est sur `https://<domaine>/admin/connexion`. Aucun UUID reel ni resultat de recette distante n'est fourni par les tests locaux.

### Configuration automatique des UUID

**Avant de deployer le formulaire d'inscription partenaires / ecoles**, appliquer [migration_school_registration_requests.sql](server/database/migration_school_registration_requests.sql). Elle ajoute une table privee accessible uniquement au serveur, sans modifier les comptes existants. Le script de configuration refuse le deploiement si cette table manque. Recetter `/espace-ecoles/inscription` : aucun mot de passe, confirmation de recontact dans les 2 jours ouvres et aucune connexion/creation de compte automatique. Verifier ensuite la demande dans `/admin/inscriptions-ecoles`, ainsi que le refus de lecture pour les visiteurs et les comptes non-admin. Les recontacts et l'ouverture eventuelle d'un acces restent manuels.

**Avant de deployer la grille commune formations/partenaires**, appliquer [migration_backoffice_partner_results.sql](server/database/migration_backoffice_partner_results.sql) dans Supabase, apres la migration back-office principale. Elle ajoute les reglages d'affichage et met a jour l'edition auditee sans changer les permissions. Le script de configuration arrete le deploiement si ces colonnes manquent. Recetter ensuite `/admin/partenaires` (visibilite, accent, priorite) et l'ecran de recommandations ; les anciennes candidatures et les scores doivent rester inchanges.

**Avant de deployer la creation multi-campus**, appliquer [migration_backoffice_partner_campuses.sql](server/database/migration_backoffice_partner_campuses.sql), apres les migrations principale et reglages partenaires. Le formulaire `/admin/partenaires` cree une meme formation sur plusieurs villes en une seule operation atomique et auditee. Le script de configuration verifie la nouvelle RPC sans creer de fiche. Recetter une creation sur trois villes, l'ajout d'un campus depuis une fiche existante et le refus d'un doublon sans creation partielle. Les fiches existantes et les recommandations restent rattachees a une seule ville chacune.

**Avant de deployer la proximite partenaires par departement**, sauvegarder `ecoles_partenaires` et appliquer [migration_partner_departments.sql](server/database/migration_partner_departments.sql) apres les migrations back-office/reglages/multi-campus. Elle ajoute `department`, son index de recherche locale, les controles de codes et la RPC atomique avec un departement par campus. Elle conserve les identifiants, URLs et dashboards ; ne pas rejouer le seed. Verifier la liste des villes non resolues retournee par la migration et corriger leurs departements dans le back-office. Executer `node scripts/configure_backoffice.mjs --check` depuis `server` avant de deployer ensemble API et client. Recetter Muret et Toulouse pour un profil 31, le rejet des campus hors departement, puis la creation/edition de campus de departements differents. Aucun calcul de distance ni ville de reference ne doit remplacer ce filtre exact.

Si la migration back-office a deja ete appliquee avec l'ancienne adresse mal orthographiee, executer d'abord [migration_backoffice_admin_email.sql](server/database/migration_backoffice_admin_email.sql) dans Supabase. Ce patch corrige uniquement les deux fonctions administratives, conserve leurs privileges et peut etre rejoue. Pour une nouvelle installation, la migration principale contient deja `nicolas.wiegele@zelia.io`.

**Avant de deployer le graphique d'evolution des eleves**, appliquer [migration_backoffice_student_growth.sql](server/database/migration_backoffice_student_growth.sql), apres la migration principale. Elle ajoute une RPC de statistiques reservee au serveur ; le script de configuration refuse le deploiement si elle manque. Recetter `/admin` sur les periodes 30 jours, 90 jours et 1 an, avec les deux administrateurs. Aucun compte ni resultat n'est modifie.

**Avant de deployer la vue prioritaire des formations selectionnees**, appliquer [migration_backoffice_selections.sql](server/database/migration_backoffice_selections.sql), apres la migration principale. Elle utilise les tables existantes `informations_complementaires` et `contact_submitted`, ajoute un index de lecture et des fonctions reservees au serveur. Le script de configuration bloque le deploiement si la RPC manque. Recetter `/admin` puis `/admin/resultats` : dernieres selections, recherche utilisateur/formation/etablissement, filtre partenaires et acces aux analyses. Les recommandations non retenues ne doivent pas etre presentees comme des selections ; aucune sauvegarde utilisateur n'est modifiee par la migration.

**Avant de deployer le suivi des recommandations partenaires**, appliquer [migration_backoffice_recommendations.sql](server/database/migration_backoffice_recommendations.sql). Recetter un parcours interrompu sur l'ecran des formations, sans cliquer sur la suite : les partenaires affiches doivent etre visibles dans `/admin` > Partenaires recommandes et l'onglet Recommandations des resultats, meme s'ils sont decoches. Verifier que la vue des selections n'est pas modifiee et qu'aucune notification ecole n'est declenchee par ce suivi. La nouvelle RPC reste reservee au serveur ; le script de configuration refuse son absence.

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
