// ── push.js ───────────────────────────────────────────────────────
// Registrerer enheten for FCM-push slik at innkommende anrop varsler
// selv naar appen er lukket. Paa web (PWA) er dette en trygg no-op —
// der haandteres varsling av ringetonen i CallProvider (Web Audio API).
//
// Kjeden: dette registrerer FCM-token i device_tokens-tabellen ->
// inviteToCall (webrtc.js) kaller notify-call Edge Function -> FCM
// sender varsel til kanalen "incoming_calls" (maa matche channel_id i
// notify-call/index.ts) -> trykk paa varselet aapner CallRoom via
// onCallTapped.
//
// Krever google-services.json i android/app/ — uten den bygges APK-en
// helt uten push (se logger.info-meldingen i android/app/build.gradle).

import { Capacitor } from "@capacitor/core";
import { supabase } from "./supabase";

/**
 * @param {string} userId
 * @param {{ onCallTapped?: (info: { conversationId: string, callerName?: string, isVideo?: boolean }) => void }} [handlers]
 * @returns {() => void} cleanup
 */
export function registerPushForUser(userId, handlers = {}) {
  if (!Capacitor.isNativePlatform()) {
    // Ingen native push paa web - bevisst tomt.
    return () => {};
  }

  const listeners = [];
  let cancelled = false;

  (async () => {
    try {
      const { PushNotifications } = await import("@capacitor/push-notifications");

      // Kanalen FCM-payloaden i notify-call peker paa. Importance 5 =
      // heads-up med lyd, ogsaa naar appen er i bakgrunnen/lukket.
      await PushNotifications.createChannel({
        id: "incoming_calls",
        name: "Innkommende anrop",
        description: "Varsler om innkommende tale- og videoanrop",
        importance: 5,
        visibility: 1,
        sound: "default",
        vibration: true,
      });

      const perm = await PushNotifications.requestPermissions();
      if (perm.receive !== "granted") {
        console.warn("[push] varslingstillatelse ikke gitt:", perm.receive);
        return;
      }

      listeners.push(
        await PushNotifications.addListener("registration", async ({ value: token }) => {
          if (cancelled || !token) return;
          const { error } = await supabase
            .from("device_tokens")
            .upsert(
              { user_id: userId, token, platform: "android" },
              { onConflict: "user_id,token" },
            );
          if (error) console.error("[push] klarte ikke lagre token:", error.message);
          else console.log("[push] FCM-token registrert for", userId);
        }),
      );

      listeners.push(
        await PushNotifications.addListener("registrationError", (err) => {
          console.error("[push] FCM-registrering feilet:", JSON.stringify(err));
        }),
      );

      // Bruker trykket paa anrops-varselet -> hopp rett til CallRoom.
      listeners.push(
        await PushNotifications.addListener("pushNotificationActionPerformed", (action) => {
          const data = action?.notification?.data ?? {};
          if (data.type !== "incoming_call" || !data.conversationId) return;
          handlers.onCallTapped?.({
            conversationId: data.conversationId,
            callerName: data.callerName || undefined,
            isVideo: data.isVideo === "true",
          });
        }),
      );

      await PushNotifications.register();
    } catch (err) {
      console.error("[push] oppsett feilet:", err?.message ?? err);
    }
  })();

  return () => {
    cancelled = true;
    for (const h of listeners) h.remove();
  };
}
