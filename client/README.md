ZeliaV2 Client (Vite + React)

- Uses existing Aximo assets via /static served by backend.
- Pages: /login, /register, /questionnaire

Run
1. Install: npm install
2. Dev server: npm run dev (proxy /api to http://localhost:8000)

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
