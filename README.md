# TxTt

**Talk. Share. Call. Offline first.**

TxTt is a free, offline-first messaging app built as a Progressive Web App (PWA). It runs in any modern browser and installs on phones straight from the web — no App Store, no Google Play, no fees. Send messages, share links, images and audio, make voice and video calls, and chat with a built-in AI assistant that can operate the app for you.

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
|-------|-----------|
| Frontend | React + Vite, PWA (vite-plugin-pwa) |
| Routing | React Router |
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
├── frontend/                 # React + Vite PWA
│   ├── src/
│   │   ├── pages/            # Auth, Conversations, ChatRoom, CallRoom, Settings, Bot, ResetPassword
│   │   ├── components/       # CallProvider, AudioRecorder, IncomingCall, ...
│   │   ├── hooks/            # useAuth
│   │   └── lib/              # supabase, messages, webrtc
│   ├── public/
│   └── vite.config.js
└── supabase/
    ├── functions/
    │   └── bot/              # Edge Function: Anthropic proxy + tool definitions
    └── migrations/           # Database schema
```

---

## Getting started

### Prerequisites
- Node.js (LTS)
- A Supabase project
- An Anthropic API key (for the assistant)
- Supabase CLI (for deploying the Edge Function)

### 1. Install dependencies
```bash
cd frontend
npm install
```

### 2. Environment variables
Create `frontend/.env` with your Supabase project values:
```
VITE_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

### 3. Run locally
```bash
npm run dev
```
To test on your phone over the same Wi-Fi:
```bash
npm run dev -- --host
```
Then open the `Network` address shown in the terminal on your phone.

### 4. Deploy the AI assistant (Edge Function)
The Anthropic API key is stored server-side as a Supabase secret — never in the frontend.
```bash
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase secrets set ANTHROPIC_API_KEY=your-anthropic-key
supabase functions deploy bot
```

### 5. Deploy the frontend
Push to GitHub and connect the repository to Vercel (set the project root to `frontend`, framework Vite), or deploy directly with the Vercel CLI. Remember to:
- Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in Vercel's environment variables
- Add your production URL to Supabase under Authentication → URL Configuration, so Google login and password reset work

---

## License

Proprietary — Lifetime Owner: **Hollman Rivero** (Salazar Rivero Smart Things). All rights reserved.
See the [LICENSE](LICENSE) file for the full terms. No use, copying, modification, or distribution is permitted without prior written permission from the Owner.

## Contact

Salazar Rivero Smart Things
hollman.rivero@bygg-salazar.no
