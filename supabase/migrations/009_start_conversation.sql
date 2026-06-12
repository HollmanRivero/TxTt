-- ─────────────────────────────────────────────────────────────
--  009_start_conversation.sql
--  start_conversation(other_user_id) -> uuid
--
--  REKONSTRUKSJON (12. juni 2026): originalen ble aldri lagret som
--  fil og kildekoden gikk tapt i dataangrepet. Skrevet paa nytt ut
--  fra kallstedet i frontend/src/lib/messages.js (startConversation).
--
--  MERK: Den opprinnelige versjonen kjoerer fortsatt i det naavaerende
--  Supabase-prosjektet. IKKE kjoer denne fila der (den ville overskrive
--  den som virker) - den er backup for NYE prosjekter. Vil du heller
--  arkivere den ekte versjonen, kjoer i SQL Editor:
--    select pg_get_functiondef('public.start_conversation'::regproc);
--  og erstatt innholdet her med resultatet.
--
--  Oppfoersel:
--   - Krever innlogget bruker (auth.uid()).
--   - Gjenbruker eksisterende 1:1-samtale mellom de to brukerne
--     hvis den finnes (hindrer duplikater).
--   - Ellers: oppretter conversations-rad + begge medlemmene
--     atomisk, med security definer slik at insert-en gaar klar av
--     RLS paa kontrollert vis (samme grunn som naevnt i messages.js).
-- ─────────────────────────────────────────────────────────────

create or replace function public.start_conversation(other_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  me   uuid := auth.uid();
  conv uuid;
begin
  if me is null then
    raise exception 'ikke autentisert';
  end if;
  if other_user_id is null then
    raise exception 'other_user_id mangler';
  end if;
  if other_user_id = me then
    raise exception 'kan ikke starte samtale med deg selv';
  end if;
  if not exists (select 1 from public.profiles where id = other_user_id) then
    raise exception 'brukeren finnes ikke';
  end if;

  -- Finnes det allerede en 1:1-samtale med akkurat disse to? Gjenbruk den.
  select cm1.conversation_id
    into conv
  from public.conversation_members cm1
  join public.conversation_members cm2
    on  cm2.conversation_id = cm1.conversation_id
    and cm2.user_id = other_user_id
  where cm1.user_id = me
    and (
      select count(*) from public.conversation_members c
      where c.conversation_id = cm1.conversation_id
    ) = 2
  limit 1;

  if conv is not null then
    return conv;
  end if;

  insert into public.conversations default values
  returning id into conv;

  insert into public.conversation_members (conversation_id, user_id)
  values (conv, me), (conv, other_user_id);

  return conv;
end;
$$;

-- Kun innloggede brukere skal kunne kalle den
revoke all on function public.start_conversation(uuid) from public;
grant execute on function public.start_conversation(uuid) to authenticated;
