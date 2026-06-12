// supabase/functions/turn-credentials/index.ts
// Henter kortlevde Cloudflare Realtime TURN-credentials og returnerer dem som
// { iceServers: [...] } til webrtc.js. TURN-noekkelen (CF_TURN_KEY_ID +
// CF_TURN_API_TOKEN) ligger som Supabase-secrets og naar ALDRI frontend.
//
// VIKTIG ved deploy: plattformens "Verify JWT" maa vaere AV (deploy med
// --no-verify-jwt) - den avviser preflight/nye API-noekler og gir CORS-feil.
// Autentisering gjoeres i stedet her i koden (getUser under), saa funksjonen
// er fortsatt lukket for uinnloggede.

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Kun innloggede brukere faar TURN-credentials (hindrer at fremmede
    // bruker var Cloudflare-kvote). supabase.functions.invoke() sender
    // brukerens JWT i Authorization-headeren automatisk.
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } },
    );
    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user) return json({ error: "ikke autentisert" }, 401);

    const keyId = Deno.env.get("CF_TURN_KEY_ID");
    const apiToken = Deno.env.get("CF_TURN_API_TOKEN");
    if (!keyId || !apiToken) {
      return json({ error: "CF_TURN_KEY_ID/CF_TURN_API_TOKEN mangler som secrets" }, 500);
    }

    const res = await fetch(
      `https://rtc.live.cloudflare.com/v1/turn/keys/${keyId}/credentials/generate-ice-servers`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiToken}`,
          "Content-Type": "application/json",
        },
        // Credentials varer 24t; webrtc.js cacher dem 1t klient-side.
        body: JSON.stringify({ ttl: 86400 }),
      },
    );
    if (!res.ok) {
      const errText = await res.text();
      console.error("[turn-credentials] Cloudflare-feil:", res.status, errText);
      return json({ error: `Cloudflare svarte ${res.status}` }, 502);
    }

    const data = await res.json();
    // webrtc.js krever at iceServers er en ARRAY - normaliser i tilfelle
    // Cloudflare returnerer ett enkelt objekt (eldre generate-endepunkt).
    const iceServers = Array.isArray(data.iceServers)
      ? data.iceServers
      : [data.iceServers];

    return json({ iceServers });
  } catch (err) {
    console.error("[turn-credentials] feil:", err);
    return json({ error: (err as Error)?.message ?? "ukjent feil" }, 500);
  }
});
