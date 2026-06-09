# TxTt – feilsøking anrop (oppsummering)

_Sist oppdatert: 7. juni 2026. Plassér gjerne fila i `C:\TxTt2.05.10\`._

## ✅ Dette virker nå (løst i denne økten)

- **Innlogging + profil-lagring** – `updateProfile` byttet fra `update` til `upsert` (oppretter profil-rad for nye Google-brukere). `getProfile` bruker `maybeSingle()`.
- **Starte samtale** – `start_conversation`-RPC var borte etter Supabase-nullstilling; gjenopprettet.
- **Se motpart i samtale (406-feil)** – `members_read`-RLS-policy lot deg bare se din egen rad. Fikset med `is_conversation_member()`-funksjon + ny policy (lagret som `supabase/migrations/008_isConversation.sql`).
- **retention_hours 400** – kolonnen manglet; lagt til med `alter table ... add column if not exists`.
- **Cloudflare TURN** – Edge Function `turn-credentials` + `getIceServers()` i `webrtc.js`. Tilkobling lykkes med `relay`-kandidater på tvers av nett.
- **Bytt front/bak-kamera** – ny `switchCamera()` i `webrtc.js` + flip-knapp i `CallRoom.jsx`.
- **Android-tillatelser** – CAMERA / RECORD_AUDIO / MODIFY_AUDIO_SETTINGS lagt til i `AndroidManifest.xml`.
- **Tilkobling generelt** – anropet når `connectionState -> connected`, og video-/lyd-SPOR mottas (`audio:true, video:true` i loggen).

## 🔴 Feil å sjekke i morgen

### 1. Motpartens kamera vises ikke (video call)
- Symptom: bildet av den andre vises ikke, på begge sider – selv om video-sporet mottas (`ontrack: video`, `video:true` i logg).
- Gjort så langt: `CallRoom.jsx` endret til å feste fjern-strømmen via React-state (`remoteStream` + egen `useEffect`) i stedet for imperativt. **Må testes på ny APK / bygg.**
- Hvis fortsatt svart etter dette: ikke lenger et React-problem, men at video-rammene ikke produseres i Capacitor-WebView-en.
  - Neste steg: `MainActivity.java`-justering – `webView.getSettings().setMediaPlaybackRequiresUserGesture(false)` + riktig kamera-/mikrofon-håndtering i WebView.

### 2. Lyd på audio call virker ikke
- Symptom: lyd virket ikke da jeg ringte **fra web til Android**, og audio-only-anrop gir heller ikke lyd.
- Merk: i video-anrop ble lyd-sporet mottatt (`audio:true`) – så feilen kan være retnings-/oppsett-spesifikk. Må verifiseres.
- Neste steg:
  - Kjør diagnose-snutten i F12 under aktivt anrop for å se spor-antall:
    ```js
    document.querySelectorAll('video, audio').forEach(el => {
      const s = el.srcObject;
      if (s) console.log((el.className||el.tagName) +
        ' → audio:' + s.getAudioTracks().length +
        ' video:' + s.getVideoTracks().length);
    });
    ```
  - `local-video audio:0` → mikrofon fanges ikke (forenkle audio-constraints til `audio: true` i `webrtc.js`).
  - `remote audio:1` men ingen lyd → avspilling / det skjulte `<audio>`-elementet i `CallRoom.jsx`.

### 3. Må dobbelt-trykke for å etablere anrop (mindre)
- Symptom: første ring-forsøk kobler ikke til; andre forsøk virker.
- Årsak (fra logg): `CallRoom` avmonteres midt i oppsettet → `hangup` → tilbudet (`offer`) sendes aldri. Skjer i **dev-modus** (`npm run dev` + React StrictMode dobbelt-montering).
- Neste steg:
  - Sjekk om `src/main.jsx` har `<React.StrictMode>`.
  - Test på **produksjons-APK** – StrictMode dobbelt-montering skjer ikke der. Hvis dobbelt-trykket forsvinner på APK, kan dette ignoreres (eller fjern StrictMode for lik oppførsel i dev).

## 📁 Relevante filer

- `frontend/src/lib/webrtc.js` – getUserMedia, ICE/TURN, signalering, switchCamera
- `frontend/src/pages/CallRoom.jsx` – anrops-skjerm (lokal/fjern video, kontroller)
- `frontend/src/pages/ChatRoom.jsx` – ring-knapper (`handleStartCall`), `inviteToCall`
- `frontend/src/components/CallProvider.jsx` – innkommende anrop, ringetone, `listenForCalls`
- `supabase/functions/turn-credentials/index.ts` – Cloudflare TURN-credentials
- `supabase/migrations/008_isConversation.sql` – RLS-fiks for `conversation_members`

## 🔧 Arbeidsflyt for ny APK

```cmd
cd /d C:\TxTt2.05.10\frontend
npm run build
npx cap sync
build-android.bat
```
(Manifest-endringer alene trenger bare `build-android.bat`.)
