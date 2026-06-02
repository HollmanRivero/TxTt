-- ─────────────────────────────────────────────────────────────
--  TxTt — Message retention (auto-delete) per conversation
-- ─────────────────────────────────────────────────────────────

-- 1. Ny kolonne paa conversations
alter table public.conversations
  add column if not exists retention_hours int;

comment on column public.conversations.retention_hours is
  'Auto-delete messages older than this many hours. NULL = never delete.';

-- 2. Tillat samtale-medlemmer aa oppdatere retention
drop policy if exists "conversations_update" on public.conversations;
create policy "conversations_update" on public.conversations
  for update using (
    exists (
      select 1 from public.conversation_members
      where conversation_id = id and user_id = auth.uid()
    )
  );

-- 3. Funksjon som sletter utgaatte meldinger paa tvers av alle samtaler
create or replace function public.delete_expired_messages()
returns int
language sql
security definer
set search_path = public
as $$
  with deleted as (
    delete from public.messages m
    using public.conversations c
    where m.conversation_id = c.id
      and c.retention_hours is not null
      and m.created_at < now() - (c.retention_hours || ' hours')::interval
    returning m.id
  )
  select count(*)::int from deleted;
$$;

grant execute on function public.delete_expired_messages() to authenticated;

-- 4. (Valgfritt) Cron-jobb som kjoerer hver time
--    Krever at pg_cron-extension er aktivert i Supabase Dashboard
--    -> Database -> Extensions -> pg_cron -> Enable
--
-- create extension if not exists pg_cron with schema extensions;
--
-- select cron.schedule(
--   'delete-expired-messages',
--   '0 * * * *',                              -- hver time paa hel time
--   $$ select public.delete_expired_messages() $$
-- );
