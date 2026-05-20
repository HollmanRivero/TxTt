# TxTt

> Talk. Share. Call. Offline first.

A free, open-source Progressive Web App for instant messaging, media sharing, audio/video calls, and voice messages — installable on Android and iOS with no dependency on paid cloud services.

---

## Features

- 💬 Instant messaging with offline support
- 🖼️ Share links, images, and audio
- 📞 Audio and video calls via WebRTC
- 🎙️ Voice message recording
- 📵 Works offline (PWA with service worker)
- 📱 Installable on Android (TWA) and iOS (Capacitor)
- 🔐 Auth via phone (SMS/Twilio), email OTP, Google, or Apple

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React + Vite (PWA) |
| Backend / Auth | Self-hosted Supabase |
| Real-time | Supabase Realtime |
| Storage | Supabase Storage |
| Calls | WebRTC + Coturn (TURN server) |
| Proxy / HTTPS | Caddy |
| SMS | Twilio Verify |
| Android | TWA (Trusted Web Activity) |
| iOS | Capacitor |

---

## Requirements

- A Linux server (Oracle Cloud Free VM works perfectly)
- A domain name with DNS pointing to your server
- Docker + Docker Compose
- Node.js 20+
- A Twilio account (for SMS OTP)
- A Google Cloud project (for Google OAuth)
- An Apple Developer account (for Apple Sign-In)

---

## Installation

### 1. Clone the repo

```bash
git clone https://github.com/HollmanRivero/TxTt.git
cd TxTt
```

---

### 2. Configure Supabase

```bash
cd supabase
cp .env.example .env
nano .env
```

Fill in every value. Key ones:

```env
API_EXTERNAL_URL=https://api.yourdomain.com
SITE_URL=https://yourdomain.com
POSTGRES_PASSWORD=your_strong_password
JWT_SECRET=        # generate: openssl rand -base64 64
ANON_KEY=          # see docs below
SERVICE_ROLE_KEY=  # see docs below
```

Generate `ANON_KEY` and `SERVICE_ROLE_KEY`:
👉 https://supabase.com/docs/guides/self-hosting#api-keys

---

### 3. Start Supabase

```bash
docker compose up -d

# Watch logs until GoTrue and PostgREST say they're ready
docker compose logs -f
```

---

### 4. Configure the frontend

```bash
cd ../frontend
cp .env.example .env.local
nano .env.local
```

```env
VITE_SUPABASE_URL=https://api.yourdomain.com
VITE_SUPABASE_ANON_KEY=your_anon_key
```

---

### 5. Build the frontend

```bash
npm install
npm run build
# Output goes to frontend/dist/
```

---

### 6. Configure Caddy

Edit `/etc/caddy/Caddyfile`:

```
yourdomain.com {
    root * /home/ubuntu/TxTt/frontend/dist
    file_server
    try_files {path} /index.html
}

api.yourdomain.com {
    reverse_proxy localhost:8000
}

studio.yourdomain.com {
    reverse_proxy localhost:3001
}
```

```bash
sudo systemctl reload caddy
```

Caddy automatically issues and renews your HTTPS certificate.

---

### 7. Open firewall ports (Oracle Cloud)

In the Oracle Cloud dashboard, add ingress rules for TCP ports **80** and **443**.

Then on the server:

```bash
sudo iptables -I INPUT -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT -p tcp --dport 443 -j ACCEPT
sudo netfilter-persistent save
```

---

### 8. Visit your app

- `https://yourdomain.com` — TxTt app
- `https://studio.yourdomain.com` — Supabase dashboard

---

## Deploying updates

```bash
# On your computer
git add .
git commit -m "your change"
git push

# On the server
cd ~/TxTt
git pull
cd frontend && npm run build
```

---

## OAuth Setup

### Google
1. [console.cloud.google.com](https://console.cloud.google.com) → APIs & Services → Credentials
2. Create OAuth 2.0 Client ID (Web application)
3. Add redirect URI: `https://api.yourdomain.com/auth/v1/callback`
4. Copy Client ID and Secret into `supabase/.env`

### Apple
1. [developer.apple.com](https://developer.apple.com) → Certificates → Identifiers → Services IDs
2. Return URL: `https://api.yourdomain.com/auth/v1/callback`
3. Generate client secret JWT: https://supabase.com/docs/guides/auth/social-login/auth-apple
4. Copy values into `supabase/.env`

---

## License

MIT — see [LICENSE](./LICENSE)

---

## Contact

**HollmanRivero** — test@Txtt.io
