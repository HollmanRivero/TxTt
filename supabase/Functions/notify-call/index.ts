// supabase/functions/notify-call/index.ts
// Sender en FCM-push til mottakerens enhet(er) naar et anrop starter, slik at
// den native appen ringer/varsler selv om den er lukket. Kaller invokerer denne
// med mottakerens user_id + anrops-info. Bruker en Firebase service-account
// (FCM HTTP v1). Mottakerens tokens leses med service-role (bypasser RLS).

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

// ── FCM v1 OAuth-token fra service-account ────────────────────
function pemToArrayBuffer(pem: string): ArrayBuffer {
  const b64 = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s+/g, "");
  const bin = atob(b64);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return buf.buffer;
}

function b64url(data: Uint8Array | string): string {
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function getAccessToken(sa: {
  client_email: string;
  private_key: string;
}): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const claim = {
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  };
  const unsigned = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(claim))}`;
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToArrayBuffer(sa.private_key),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = new Uint8Array(
    await crypto.subtle.sign(
      "RSASSA-PKCS1-v1_5",
      key,
      new TextEncoder().encode(unsigned),
    ),
  );
  const jwt = `${unsigned}.${b64url(sig)}`;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  if (!res.ok) {
    throw new Error(`token-utveksling feilet: ${res.status} ${await res.text()}`);
  }
  return (await res.json()).access_token as string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") return json({ error: "kun POST" }, 405);

  try {
    const { calleeUserId, conversationId, callerName, isVideo } = await req
      .json();
    if (!calleeUserId || !conversationId) {
      return json({ error: "calleeUserId og conversationId kreves" }, 400);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;

    // Verifiser at kaller er en autentisert bruker (hindrer push-spam).
    const userClient = createClient(
      supabaseUrl,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } },
    );
    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user) return json({ error: "ikke autentisert" }, 401);

    // Slaa opp mottakerens tokens med service-role (bypasser RLS).
    const admin = createClient(
      supabaseUrl,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data: tokens, error: tokErr } = await admin
      .from("device_tokens")
      .select("token")
      .eq("user_id", calleeUserId);
    if (tokErr) return json({ error: tokErr.message }, 500);
    if (!tokens?.length) return json({ sent: 0, note: "ingen enheter registrert" });

    const sa = JSON.parse(Deno.env.get("FCM_SERVICE_ACCOUNT")!);
    const accessToken = await getAccessToken(sa);
    const endpoint =
      `https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`;

    let sent = 0;
    const stale: string[] = [];
    for (const { token } of tokens) {
      const message = {
        message: {
          token,
          notification: {
            title: callerName || "Innkommende anrop",
            body: isVideo ? "📹 Videoanrop" : "📞 Taleanrop",
          },
          data: {
            type: "incoming_call",
            conversationId: String(conversationId),
            callerName: String(callerName ?? ""),
            isVideo: String(!!isVideo),
          },
          android: {
            priority: "high",
            notification: { channel_id: "incoming_calls_v2", sound: "default" },
          },
        },
      };
      const r = await fetch(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(message),
      });
      if (r.ok) {
        sent++;
      } else {
        const errText = await r.text();
        console.error("[notify-call] FCM-feil:", r.status, errText);
        // Ugyldig/utloept token -> marker for opprydding
        if (r.status === 404 || r.status === 400) stale.push(token);
      }
    }

    if (stale.length) {
      await admin.from("device_tokens").delete().in("token", stale);
    }

    return json({ sent, total: tokens.length });
  } catch (err) {
    console.error("[notify-call] feil:", err);
    return json({ error: (err as Error)?.message ?? "ukjent feil" }, 500);
  }
});
