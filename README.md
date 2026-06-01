# TxTt

**Talk. Share. Call. Offline first.**

TxTt is a free, offline-first messaging app built as a Progressive Web App (PWA). It runs in any modern browser and installs on phones straight from the web — no App Store, no Google Play, no fees. Send messages, share links, images and audio, make voice and video calls, and chat with a built-in AI assistant that can operate the app for you.

> ⚠️ **Proprietary software.** This repository is public for transparency and portfolio purposes only. The code is **not open source** and may **not** be used, copied, modified, or self-hosted without prior written permission from the Owner. See [LICENSE](LICENSE).

---

## Features

### Messaging & sharing
- Real-time one-to-one messaging
- Image sharing
- Audio messages (record and send voice clips)
- Link sharing
- Conversation history with live updates

### Calls
- Voice calls (WebRTC, peer-to-peer)
- Video calls
- Incoming-call handling

### Accounts & security
- Sign up with email + password, phone + password, or Google
- Phone numbers are verified once with an SMS code at registration — after that you log in with just your password (no repeated codes)
- "Forgot password" recovery by email link or phone code
- Editable profile: display name, username, email, phone, and password
- Add both an email and a phone to one account and log in with either

### AI assistant (in-app bot)
- A Claude-powered assistant lives inside the app as a two-way chat
- It can list contacts, search your messages, read conversation history, send messages, start calls, and change settings — all by understanding plain-language requests
- Sending a message or starting a call always shows a confirmation card first, so nothing happens without your approval
- All actions run with your own login, so your data stays protected by row-level security

### Installable PWA
- Works offline (service worker + caching)
- Installable to the home screen on Android and iOS
- Standalone, full-screen app experience

---

## Tech stack

| Layer | Technology |
|-------|------------|
| Frontend | React 19 + Vite 8, PWA (`vite-plugin-pwa`) |
| Routing | React Router 7 |
| Backend | Supabase (Postgres, Auth, Realtime, Storage) |
| Calls | WebRTC (peer-to-peer), Supabase Realtime for signaling |
| AI assistant | Supabase Edge Function (Deno) proxying the Anthropic API |
| Hosting | Vercel (frontend), Supabase (backend) |

---

## Architecture

- **Frontend** — a React PWA. Talks to Supabase for auth, data, realtime updates, and file storage.
- **Supabase** — handles users, conversations, messages, profiles, and media. Row-level security keeps each user's data private.
- **AI assistant** — the browser never holds the Anthropic API key. The bot UI sends the conversation to a Supabase Edge Function, which calls the Anthropic API server-side and returns the reply. Any tools the assistant proposes are executed in the frontend (under the user's session), with a confirmation step before sending messages or starting calls.

---

## Project structure

```
TxTt/
├── frontend/                 # React + Vite PWA (the actual app)
│   ├── src/
│   │   ├── pages/            # Auth, Conversations, ChatRoom, CallRoom, Settings, Bot, ResetPassword
│   │   ├── components/       # CallProvider, AudioRecorder, IncomingCall, ...
│   │   ├── hooks/            # useAuth
│   │   └── lib/              # supabase, messages, webrtc
│   ├── public/
│   ├── package.json
│   └── vite.config.js
├── supabase/
│   ├── functions/
│   │   └── bot/              # Edge Function: Anthropic proxy + tool definitions
│   └── migrations/           # Database schema (run with `supabase db push`)
├── docker-compose.yml        # Optional: self-hosted Supabase stack
├── LICENSE                   # Proprietary
└── README.md
```

---

## Getting started

> ℹ️ All commands below assume you start from the repository root after `git clone`.

### Prerequisites
- **Node.js 20 LTS** (Node 18+ works, but 20 is recommended)
- **npm** (ships with Node)
- A **Supabase project** — sign up at [supabase.com](https://supabase.com), free tier is fine
- A **Supabase CLI** install — `npm i -g supabase`
- An **Anthropic API key** — only if you want the AI assistant — from [console.anthropic.com](https://console.anthropic.com)

### 1. Install dependencies

```bash
cd frontend
npm install
```

### 2. Configure environment variables

The repo ships a `frontend/.env` with placeholder values. **Do not edit it** — instead create `frontend/.env.local` (which is gitignored and overrides `.env`):

```ini
VITE_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=your-publishable-anon-key
```

Find these values in **Supabase Dashboard → Project Settings → API**.

### 3. Apply database schema

From the repo root:

```bash
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
```

This runs every SQL file in `supabase/migrations/` against your project — creating the `profiles`, `conversations`, `messages`, and related tables, plus the row-level security policies.

### 4. Run locally

```bash
cd frontend
npm run dev
```

Open `http://localhost:5173` in your browser.

To test on your phone over the same Wi-Fi:

```bash
npm run dev -- --host
```

…then open the `Network` address shown in the terminal on your phone.

### 5. Deploy the AI assistant (optional)

The Anthropic API key is stored server-side as a Supabase secret — never in the frontend.

```bash
supabase secrets set ANTHROPIC_API_KEY=your-anthropic-key
supabase functions deploy bot
```

Without this step the rest of the app works fine, but the in-app bot will return an error.

### 6. Deploy the frontend to Vercel

1. Push to your own GitHub fork
2. Import the repo into Vercel
3. **Important:** set **Root Directory** to `frontend` and framework to **Vite**
4. Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` under **Environment Variables**
5. In Supabase: **Authentication → URL Configuration**, add your Vercel production URL so OAuth and password-reset redirects work

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `npm error Missing script: "start"` | You ran `npm start` instead of `npm run dev` | Vite uses `npm run dev` — there is no `start` script |
| `EPERM: operation not permitted` on `package-lock.json` | Files have the read-only attribute (often after copy from another disk/zip) | Windows: `attrib -R /S /D *` in the repo root |
| `Cannot find package 'react'` | You ran npm from the repo root instead of `frontend/` | `cd frontend` first |
| Blank page / 401 from Supabase | `.env.local` is missing or has placeholder URL | Re-do step 2; restart `npm run dev` after changes |
| Login works but profile/messages empty | Database migrations not applied | Run `supabase db push` (step 3) |
| Supabase project shows "Paused" | Free-tier 7-day inactivity pause | Open Supabase dashboard → click **Restore project** |
| AI bot returns 500 | Edge Function not deployed, or Anthropic secret missing | Run step 5 |

---

## License

**Proprietary** — Lifetime Owner: **Hollman Rivero** (Salazar Rivero Smart Things). All rights reserved.

See the [LICENSE](LICENSE) file for the full terms. **No use, copying, modification, or distribution is permitted without prior written permission from the Owner.** Cloning this repository is permitted for code review only; running, deploying, or redistributing it requires explicit written permission.

For licensing inquiries, contact the email below.

## Contact

Salazar Rivero Smart Things
hollman.rivero@bygg-salazar.no
