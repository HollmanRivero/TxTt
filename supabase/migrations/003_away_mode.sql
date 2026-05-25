-- ── Away mode toggle on profiles ──────────────────────────────
-- Adds a boolean flag the user (or the bot) can set to mark themselves
-- as "away" — used by the UI to render an away badge on the user's
-- avatar, suppress push notifications, or show "Away" beside their
-- name in conversation lists.

alter table public.profiles
  add column if not exists away_mode boolean not null default false;

comment on column public.profiles.away_mode is
  'When true, the user is in away mode (do-not-disturb-ish). Set via Settings or by the in-app bot.';
