-- ── WhatsApp shortcut on profiles ─────────────────────────────
-- Stores a short WhatsApp link / handle the user can share so others
-- (or the bot) can reach them on WhatsApp. Format is free-form: the
-- canonical "wa.me/<number>" link, a plain phone number, or a custom
-- shortcut like "wa/4793672121".

alter table public.profiles
  add column if not exists whatsapp_url text;

comment on column public.profiles.whatsapp_url is
  'Optional WhatsApp link or shortcut the user wants the bot/other users to be able to reach them on. Example: "wa/4793672121" or "https://wa.me/4793672121".';
