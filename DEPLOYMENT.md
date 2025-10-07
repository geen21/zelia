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
