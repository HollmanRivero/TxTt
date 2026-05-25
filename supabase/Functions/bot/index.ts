// supabase/functions/bot/index.ts
// TxTt bot — Edge Function proxy to the Anthropic API.
// Keeps the API key server-side. Stateless: receives the conversation,
// returns Claude's next turn (text and/or tool_use blocks). The frontend
// executes any tools and calls back with the results.

import Anthropic from "npm:@anthropic-ai/sdk@0.32.1";

const anthropic = new Anthropic({
  apiKey: Deno.env.get("ANTHROPIC_API_KEY")!,
});

// ── CORS ────────────────────────────────────────────────────────────────────
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// ── Tools the bot can use ─────────────────────────────────────────────────────
// The bot only PROPOSES these. The frontend executes them against Supabase,
// and asks the user to confirm before send_message / start_call.
const tools = [
  {
    name: "list_contacts",
    description:
      "List the user's contacts. Use to resolve a name to a contact before sending or calling.",
    input_schema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Optional name/username filter. Omit to list all.",
        },
      },
    },
  },
  {
    name: "search_messages",
    description: "Search the user's message history by keyword.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Keywords to search for." },
      },
      required: ["query"],
    },
  },
  {
    name: "get_history",
    description: "Get recent messages in a conversation with a specific contact.",
    input_schema: {
      type: "object",
      properties: {
        contact: { type: "string", description: "Name or username of the contact." },
        limit: { type: "number", description: "How many recent messages (default 20)." },
      },
      required: ["contact"],
    },
  },
  {
    name: "send_message",
    description:
      "Send a message to a contact. The app will ask the user to confirm before it actually sends.",
    input_schema: {
      type: "object",
      properties: {
        contact: { type: "string", description: "Name or username of the recipient." },
        text: { type: "string", description: "The message body to send." },
      },
      required: ["contact", "text"],
    },
  },
  {
    name: "start_call",
    description:
      "Start a voice or video call with a contact. The app will ask the user to confirm first.",
    input_schema: {
      type: "object",
      properties: {
        contact: { type: "string", description: "Name or username to call." },
        kind: { type: "string", enum: ["audio", "video"], description: "Call type." },
      },
      required: ["contact", "kind"],
    },
  },
  {
    name: "update_setting",
    description:
      "Change a profile setting like display name, username, or WhatsApp shortcut. For away mode use the dedicated set_away_mode tool instead.",
    input_schema: {
      type: "object",
      properties: {
        setting: {
          type: "string",
          enum: ["full_name", "username", "whatsapp_url"],
          description:
            "Which setting to change. whatsapp_url stores a WhatsApp link or shortcut (e.g. 'wa/4793672121' or 'https://wa.me/4793672121') so the user can share how to reach them on WhatsApp.",
        },
        value: { type: "string", description: "The new value." },
      },
      required: ["setting", "value"],
    },
  },
  {
    name: "get_my_profile",
    description:
      "Look up the current user's own profile data — display name, username, away mode status, WhatsApp shortcut, etc. Use this whenever the user asks something like 'what's my username', 'what's my WhatsApp', 'am I in away mode', or when you need to remind them of contact info they've saved.",
    input_schema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "set_away_mode",
    description:
      "Turn the user's away mode ON or OFF. Away mode is a do-not-disturb flag that marks the user as unavailable in the app — others see an 'Away' badge on their avatar and notifications are muted. Use this whenever the user says things like 'set me to away', 'turn on away mode', 'I'm back', 'turn away off', 'mark me available', etc.",
    input_schema: {
      type: "object",
      properties: {
        on: {
          type: "boolean",
          description: "true = turn away mode ON, false = turn it OFF.",
        },
      },
      required: ["on"],
    },
  },
];

const SYSTEM_PROMPT = `You are the TxTt assistant — a helpful bot that lives inside the TxTt messaging app and helps the user operate it through conversation.

You can read contacts and message history, search, send messages, start calls, and change settings, all by calling the provided tools.

Important behaviour:
- When the user asks you to send a message or start a call, call the matching tool. The app will show the user a confirmation card before anything actually happens — so you don't need to ask "are you sure?" yourself. Just propose the action clearly.
- Before sending or calling, if the contact is ambiguous, use list_contacts to resolve who they mean.
- For away mode, ALWAYS use the set_away_mode tool. Map natural language to the boolean:
    "turn away on", "set me to away", "I'm away", "do not disturb"        → set_away_mode(on=true)
    "turn away off", "I'm back", "mark me available", "turn off away"     → set_away_mode(on=false)
  After it succeeds, give a short confirmation like "You're set to away." or "Welcome back — away mode is off."
- The user can save a WhatsApp shortcut on their profile (whatsapp_url). When they say something like "my WhatsApp is X", "save my WhatsApp as X", or "set my WhatsApp shortcut to X" — call update_setting(setting="whatsapp_url", value=X). Accept any format the user gives ("wa/4793672121", "wa.me/4793672121", a plain phone number, etc.) — don't reformat it.
- When the user asks "what's my WhatsApp", "do you remember my WhatsApp", "what's my username", or anything about THEIR OWN profile info — call get_my_profile first, then answer from the result. Never make up profile data.
- Keep replies short and natural, like a chat. The user is on a phone.
- If you're unsure what the user wants, ask one brief clarifying question instead of guessing.
- Never invent contacts, messages, or data. If a tool returns nothing, say so plainly.`;

// ── Handler ───────────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { messages } = await req.json();

    if (!Array.isArray(messages)) {
      return new Response(
        JSON.stringify({ error: "Body must include a `messages` array." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      tools,
      messages,
    });

    // Return the raw content blocks (text + tool_use) plus stop_reason.
    // The frontend inspects these to run tools or show the reply.
    return new Response(
      JSON.stringify({
        content: response.content,
        stop_reason: response.stop_reason,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("Bot function error:", err);
    return new Response(
      JSON.stringify({ error: err?.message ?? "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
