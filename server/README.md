# Zelia Server

Backend API server for the Zelia application, built with Express.js and Supabase.

## Formation URL stability and Search Console

Historical formation URLs can be restored and frozen in `canonical_slug`
without reverting enriched titles. Follow the [deployment sequence](../DEPLOYMENT.md#stabilisation-des-url-canoniques-des-formations-apres-enrichissement):
SQL migration, guarded historical manifest backfill, then enable
`FORMATION_CANONICAL_URLS_ENABLED=true` and deploy client/API. The flag defaults
to false so an undeployed migration does not break existing catalogue reads.
Do not activate it until every historical row has its pinned URL.
`npm run verify:sitemap` covers the migration, immutable URLs and sitemap
agreement. The client live checker must pass in production before any Search
Console sitemap resubmission or correction validation. An inaccessible Search
Console account or deployment host is not a successful correction.

## Formation catalogue audit notebook

Open [formation_catalog_quality.ipynb](notebooks/formation_catalog_quality.ipynb).
It replaces the historical ten-chunk import with a source-backed audit and repair
preview followed by an explicitly enabled, guarded publication. The original notebook is not modified. Python 3.10+ and the existing
Node server dependencies are used; no additional Python packages are needed.

The notebook reuses the server's Supabase configuration through
[export_formation_catalog.mjs](scripts/export_formation_catalog.mjs). No database
credentials belong in notebook cells or outputs. All network/export flags are
off by default. Start with 200 rows, inspect the exact source matches, then
explicitly request a full audit. A paginated read is not an atomic database
snapshot; future publication must check the original values again.

[formation_catalog.py](scripts/formation_catalog.py) matches existing rows to
Parcoursup by session, `gta` and UAI. Only missing `nm`, `tf`, `fl`, `amg`, `app`,
`int` and `aut` are proposed for enrichment; array/text types, ids and location
remain unchanged. Existing conflicting values and ambiguous matches are
reported instead of silently overwritten. No missing title is invented from
a short code. Reports include source identity, retrieval time and content hash.

Diploma family, qualification level, academic grade and study year are separate
audit fields. A DU is not a PhD, a DN MADE is not a master, CPGE is not a degree,
and RNCP level 7 or a marketing label does not automatically confer master grade.
Uncertain cases remain `needs_review`. Classification metadata stays in the
preview until a compatible publication schema has been validated.

Mon Master previews keep their own source identifiers and unresolved campus
information. Doctoral-school directory entries are not converted into courses
or thesis vacancies. Annual datasets/accreditation dates do not prove current
availability. All complementary rows remain ineligible for automatic publication.

From the repository root:

```powershell
python -m unittest discover -s server\scripts -p test_formation_catalog.py -v
```

For a reproducible offline comparison, first export from `server`:

```powershell
node scripts\export_formation_catalog.mjs --limit 200 --output .generated\formation-snapshot.json
python scripts\formation_catalog.py --snapshot .generated\formation-snapshot.json --source <official-export.json> --output .generated\formation-preview.json
```

The export directory must already exist for the Node command. Both commands
refuse to overwrite an existing output file. Omit `--source` to fetch exact
matching public source records. `--all` on the Node exporter explicitly reads
the whole catalogue. Reports are published atomically so an incomplete JSON file
cannot be mistaken for a validated plan.

After reviewing the **full** plan and backing up every row, the notebook's last
cell may be enabled explicitly, or run the same publisher from `server`:

```powershell
node --max-old-space-size=3072 scripts\publish_formation_repairs.mjs --plan .generated\formation-preview.json --backup .generated\formation-snapshot.json
node --max-old-space-size=3072 scripts\publish_formation_repairs.mjs --plan .generated\formation-preview.json --backup .generated\formation-snapshot.json --journal .generated\formation-publication.jsonl --apply
```

The first command validates only. Publication requires a service-role client,
preserves every id and source key, checks expected original values in each atomic
PATCH, and verifies persisted values. Four workers process small batches and stop
on the first detected error. The whole catalogue is **not** a single transaction:
the journal records partial progress, and rerunning with a new journal checks
already-applied rows before continuing. Keep the complete backup, exact plan
and journals. `--rollback --apply` restores only repaired fields whose published
values and source identities have not changed since; concurrent edits stop it.
No insert, delete, truncate or table recreation is used. A full post-publication
export must verify unchanged ids/other columns and every expected repaired value.

The classification sidecar is an audit, not a new database schema. Conflicting
families, absent sources and unsupported names remain quarantined, rather than
being assigned a guessed level. Existing duplicated ids for the same source
record remain intact so application references do not break. The national
display deduplicates exact session/`gta`/UAI matches across pages without
deleting those historical rows.

## Profile-based national formation search

The orientation reveal and `/app/formations` share national matching rules.
`GET /api/catalog/formations/search?matching=profile` accepts `study_levels`
(comma-separated 1, 2, 3, 5, 8), `formation_formats`, `departement`, `q`, and
pagination. Department codes are resolved to exact names: `06` covers the
Alpes-Maritimes, not only its reference city. A local search never silently
becomes nationwide, and multiple selected diploma levels are retained.
Selected diploma families are also respected: a BUT is not silently substituted
for a licence. The Master choice includes national masters and other diplomas
with an explicit academic master grade in `nm`/`fl`; `Bac+5` or RNCP 7 alone
does not establish that grade. Original diploma names are retained.
A level-only goal (for example `Bac+5`) still accepts equivalent diploma families.
CMI records are returned separately as `pathways` and displayed under
“Parcours vers un master”, not mixed with direct master recommendations.
Both SQL candidate filters and client validation use these distinctions.

The constrained table query applies location and diploma-code filters before
pagination; the existing `search_formations_simple` RPC complements it with
descriptive `nm` matches. Hydration includes `fl`, `tf`, `app`, `int` and `aut`.
National inference recognizes sparse `nmc` values such as `L1-Chimie`,
`FI-BAC5` and `DNM-Numérique` (DN MADE, not a master). Older annual copies of a
programme cannot displace its newest returned version. Partner matching is
unchanged.

There are at most three national API searches per visit/click, each bounded
to a page plus a continuation sentinel and at most 50 descriptive candidates.
For Master profiles one additional, bounded title lookup finds grade-master
and CMI labels whose short codes do not contain “master”.
Database requests share a 2.5-second deadline per search; the client batch
has a 6-second deadline. Identical concurrent API requests are coalesced and
successful results cached for five minutes. Errors remain visible and are
never cached as successful empty results. No LLM call is used during search.

`analysis.js` recovers the latest persisted orientation preferences when the
request omits them, includes the reference department and human-readable mobility
in the prompt, and persists the resolved preferences with its result. A failure
to read them is explicit instead of producing an unrelated result. Study
prioritisation matches diploma titles, not future qualifications mentioned only
in a description. DU/DIU, PhD, mastère, RNCP, PASS and DN MADE are not silently
interchanged. Model study suggestions remain separate from real catalogue offers;
no extra model calls are added to the national search.
The three model attempts share a 45-second deadline, with a bounded thinking
and output budget; timeouts are retryable errors rather than partial results.

The table currently contains predominantly multi-year post-bac catalogue
entries; its row count is not a count of distinct diplomas or evidence of
doctorate coverage. When no doctorate matches, the UI says so and distinguishes
the licence/master pathway from actual doctorate proposals. It never substitutes
unknown levels or lower diplomas for a doctorate-only request.

Focused checks: `node --test scripts/verify_national_formation_matching.test.mjs scripts/verify_catalog_search.test.mjs`.

## Editorial metier pages (isolated `seo` schema)

The editorial catalogue is not part of the application API. Apply
[migration_metier_pages.sql](database/migration_metier_pages.sql), then
[migration_metier_catalog_rome.sql](database/migration_metier_catalog_rome.sql), and add `seo`
to Supabase Data API **Exposed schemas** for the server scripts. Schema usage,
tables and functions are denied to `anon`/`authenticated`; only `service_role`
can access them. All new objects live in `seo`; `public.metiers_france` is read
only. No old advertisement, employer, contact or application link is published.

Run from `server`:

```powershell
npm run metiers -- sync-rome
npm run metiers -- status
npm run metiers -- budget
```

The approved publication unit is **one official ROME fiche per code represented
in the historical database**, regrouping its appellations. In November 2026 this
means 1,440 pages, not 92,396 advertisement-title variants. `sync-rome` inventories
the whole history, never the recent-ad search window. Raw candidates and old
results are retained privately but excluded from the canonical export.

Download France Travail's complete JSON ZIP into
`server/.generated/rome-open-data.zip` using a GET request:
https://api.francetravail.fr/api-nomenclatureemploi/v1/open-data/json.
The source dataset and Licence Ouverte are documented at
https://www.data.gouv.fr/datasets/repertoire-operationnel-des-metiers-et-des-emplois-rome.
The importer reads the archive's version/date, explicitly detects its
ISO-8859-15 (Latin-9) encoding, rejects missing/duplicate codes, and imports descriptions,
access requirements, skills, working contexts and official appellations.
It does not publish recruitment counts, employers or application links.
If an older import decoded ligatures as fractions (`Œ` as `¼`, `œ` as `½`),
`sync-rome --repair-encoding` checks the legacy checksum against the same archive
and reuses only validated articles whose title and documentary facts are
unchanged after transcoding. It never rewrites generated text or its date;
changed titles and malformed words require generation again.

All represented codes must match the reference before synchronization is
declared complete. `metier_catalog_state` fences interrupted imports. Source
versions are recorded on both rows and generated contents; stale or incomplete
contents cannot be exported as a complete catalogue. Pilot URLs are preserved
where applicable. The comptable pilot is mapped to official M1203 rather than
the misleading M1211 expert-comptable code found in an old advertisement.

The detailed pilot covers infographiste, collaborateur comptable junior and
infirmier en soins generaux. Each page contains 600–900 useful words, five
developed sections, three or four FAQ answers, and official sources. The
OUI/NON explanation remains one or two sentences. Use `regenerate --id <id>`
to replace an existing short pilot page; old contents survive a failed attempt.

Verified pilot notes are in [metierEditorialSources.js](utils/metierEditorialSources.js);
generalized ROME facts are imported by [romeCatalog.js](utils/romeCatalog.js).
The provider receives only official job labels and documentary facts.
Source URLs are attached from server metadata, never invented by the model.
Missing job-specific documentation blocks detailed generation. The nursing
qualification source is RNCP42589, which replaces RNCP39923; future changes
described there must not be presented as already applicable to every cohort.

The pilot uses `gemini-3.1-flash-lite` standard generation, with a durable limit
of ten distinct standard-sample occupation IDs including older attempts.
The complete catalogue uses the actual Gemini Batch API, not
parallel standard requests. No alternate model is selected automatically.
Standard input/output rates are USD 0.25/1.50 per million tokens; Batch rates
are 0.125/0.75. Detailed JSON output is capped at 4096 tokens and thinking is set to MINIMAL;
thinking tokens are included in cost accounting.
Prices: https://aistudio.google.com/docs/pricing#gemini-3.1-flash-lite.
The older 2.5 Flash-Lite is not available for this project's generation requests.

After **human validation** of at least three detailed, sourced pages:

```powershell
npm run metiers -- approve-sample
npm run metiers -- quote
npm run metiers -- run-all
npm run metiers -- status
npm run metiers -- budget
npm run metiers -- export
```

The **approved USD 3 total budget includes all earlier calls and retries**,
persists across runs and is reserved atomically before paid requests. The second
migration raises the previous USD 2 cap without resetting accounting.
A quote counts actual input tokens (cached by exact request hash), estimates
output using 1,800 tokens per article and includes a 10% retry margin. This is
not a guaranteed bill: each batch separately reserves its maximum output cost
and stops before exceeding the stored cap. No Search grounding or provider
cache is enabled. Estimates exclude tax, conversion and provider price changes.

`collect` is safe to repeat and reconciles results by occupation ID. An uncertain
submission keeps its reservation and is never resubmitted automatically.
Inspect Google jobs by display name `zelia-metiers-<reservation UUID>`; recover
with `attach --id <reservation UUID> --job batches/<job-id>`, then `collect`.
A failed request without usable token accounting keeps its conservative maximum
cost. Do not clear an uncertain reservation without checking the provider.
`run-all` starts at most three jobs concurrently, with at most 100 pages per
batch and an adaptive smaller batch when less budget is available. It allows
at most three attempts per page/reference/prompt version. Result application is
durable and idempotent; old responses cannot overwrite newer content or errors.
It writes `server/.generated/metier-batch-progress.json`, and exits nonzero if
the catalogue is incomplete after the budget or attempt limit is reached.
To revise one of the existing sample pages explicitly, use
`regenerate --id <occupation-id>`. Its previous content is retained until a
valid replacement is stored, and the extra attempt counts toward USD 3.

Export refuses an incomplete production catalogue and any remaining short-only
content. `export --preview --detailed-only` explicitly allows the non-indexable
detailed sample; neither mode exposes the private inventory,
generation ledger or service key. Test with `npm run verify:metiers` (mocked
provider and local PostgreSQL; no paid calls), plus `npm run verify:rome`
for reference imports, canonical mapping, durable token counting and budgeted batches.

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

Appliquer [migrate_questions_v5.sql](database/migrate_questions_v5.sql) avant de deployer le nouveau client. Elle ajoute 20 phrases comparatives courtes (ids 600-619, `questionnaire_type = 'inscription_v5'`), de 85 caracteres maximum : chaque question part d'une situation unique (« Dans un hôtel, », « Sur un chantier, »...) et oppose deux roles ou deux façons d'agir dans cette meme situation, jamais deux activites sans rapport. Les situations ne se repetent pas. Exemple : « Pour comprendre une panne, je préfère démonter l'objet plutôt qu'étudier son schéma. » Les reponses sont toujours « Carrément / Plutôt oui / Plutôt pas / Pas du tout », avec le degrade vert/rose existant. Aucun A/B ni seconde selection.

Chaque option porte `label` (aussi utilise comme reponse enregistree), `value` (pole ou famille de la premiere activite), `alternative` (pole ou famille de l'autre activite) et `level` (0-3). L'accord favorise la premiere activite, le desaccord l'alternative ; le desaccord ne signifie pas un rejet des deux. Les 10 comparaisons d'axes couvrent chaque axe deux fois, en inversant les poles. Les 10 comparaisons d'interets couvrent les six familles RIASEC chacune 3 ou 4 fois. Les scores premiere activite/alternative sont 1/0 (Carrement), 0,75/0,25 (Plutot oui), 0,25/0,75 (Plutot pas), 0/1 (Pas du tout). La moyenne par famille normalise l'exposition. Un score de 0,5 n'est pas dominant ; plusieurs comparaisons moins favorables depriorisent une famille, sans exclusion definitive.

Le parcours demande `GET /api/questionnaire/questions?type=inscription_v5&limit=20`. Les questions v1/v2/v3/v4 et leurs interpretations restent intactes pour l'historique et les anciens clients. Les reponses et resultats conservent le type `inscription`, avec les nouveaux identifiants. Le cache passe a `orientation-flow-v5-20` ; une progression anterieure est invalidee et ne declenche pas d'analyse automatique. La migration v5 peut etre appliquee directement sur une base existante avec la table `questions`, meme sans v4.

Le persona depend des cinq axes uniquement. Le backend recalcule les interets depuis les reponses enregistrees et transmet au LLM les activites choisies et les alternatives moins choisies, avec leur nuance. Les familles RIASEC et les personas ne sont pas associes automatiquement a un secteur ou a un metier. Ce questionnaire n'est pas un test psychometrique valide. Les anciens formats restent lisibles. Verification migration/scoring/historique/contexte LLM : `node scripts/verify_orientation_questionnaire.mjs`.

#### Recommandations de metiers

Le LLM choisit les metiers a partir de l'ensemble des reponses et des preferences exprimees, sans quota terrain/bureau, exclusion sectorielle ni liste de domaines imposee par le persona. Les prompts du bilan et des swipes suivent cette regle. Le serveur conserve l'ordre des metiers generes ; il normalise les donnees, retire les doublons et limite la liste a six, sans ajouter ni remplacer de metier ou de formation predefini. Une aspiration explicite reste transmise au LLM comme priorite, et les formats de formation demandes par l'utilisateur restent prioritaires parmi les formations generees.

Les resultats deja enregistres ne sont pas modifies retroactivement : il faut regenerer le bilan pour appliquer ces regles. Regression locale sans appel au LLM : `node scripts/verify_orientation_recommendation_guard.mjs`. Verification complete de l'orientation : `npm run verify:orientation`.

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

Pour le choix "pres de chez moi", l'inscription, le client et l'API partagent les 101 departements de [departments.js](../client/src/lib/departments.js), Corse et outre-mer compris. Le code ou le nom du departement (accents et casse normalises) determine une ville d'etudes de reference, notamment 13 -> Marseille et 67 -> Strasbourg ; une ville explicitement enregistree reste prioritaire. Les choix historiques de villes partenaires et de Paris pour les departements 91 a 95 sont conserves. Ce filtre reste un rapprochement par ville de reference, pas un calcul de distance ni une recherche dans toutes les communes du departement. Sans partenaire local pertinent, la liste reste vide ; sans ville ni departement reconnu, l'API renvoie une erreur 400 plutot qu'un classement national. Les choix de mobilite nationale ne sont pas restreints.

Verification geographique sans ecriture en base : depuis `server`, `node --test scripts/verify_partner_matching.test.mjs scripts/verify_partner_results.mjs`. Elle couvre les 101 departements par code et nom, les cas Cadenelle/Marseille et EM Strasbourg, le departement du profil en repli et l'absence de bascule nationale silencieuse.

Dans l'espace eleve, `/app/formations` affiche au contraire un catalogue commun sans plafond de trois partenaires ni deduplication des campus. `GET /api/ecoles/partenaires` lit tous les partenaires actifs par pages de 1000, dans l'ordre stable ecole/ville/id ; une erreur sur une page interrompt explicitement la reponse, sans renvoyer un catalogue partiel comme une reussite. Les formations masquees des recommandations restent consultables si elles sont actives.

La page recalcule les correspondances a chaque visite avec le bilan et le profil courants. Les partenaires sont enrichis par `/api/ecoles/matched` ; les autres restent "A explorer" sans pourcentage. Les formations nationales utilisent les memes fonctions de pertinence et de niveau que le test. La priorite ne change jamais le pourcentage ; dans cette grille elle departage seulement des partenaires de meme score. Les cartes ouvrent les fiches existantes, sans creer de demande de contact. La preference de mobilite n'impose pas de filtre au catalogue partenaire complet. Un timeout persistant de la recherche nationale renvoie `503`, et non une liste vide de succes, pour permettre une reprise explicite.

La grille attend les deux sources pour son premier affichage. La decouverte nationale effectue au plus trois appels successifs par visite ou clic, puis conserve les pages et sujets restants pour une demande explicite. Chaque appel garde sa pagination et le cache serveur de cinq minutes. En repli PostgREST, les valeurs des filtres OR sont entre guillemets et echappees, y compris les parentheses, virgules, guillemets et caracteres de motif presents dans les intitules.

Verification ciblee : depuis `server`, `node --test scripts/verify_partner_matching.test.mjs scripts/verify_catalog_search.test.mjs` couvre aussi la pagination de 2005 partenaires, les titres complexes, le cache et les pannes de recherche. Depuis `client`, `npm run verify:formations-ui` couvre la grille commune avec API simulees.

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
