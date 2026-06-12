-- ─────────────────────────────────────────────────────────────
--  009_start_conversation.sql
--  start_conversation(other_user_id) -> uuid
--
--  ORIGINALEN, hentet ordrett ut av produksjonsdatabasen 12. juni
--  2026 med pg_get_functiondef (etter at kildekoden gikk tapt i
--  dataangrepet og fila aldri hadde vaert lagret).
--
--  Brukes av startConversation i frontend/src/lib/messages.js.
--  Security definer slik at insert-ene gaar klar av RLS paa
--  kontrollert vis. Gjenbruker eksisterende samtale der begge er
--  medlemmer; ellers opprettes samtale + begge medlemmer atomisk.
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.start_conversation(other_user_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  me uuid := auth.uid();
  existing_id uuid;
  new_id uuid;
begin
  if me is null then
    raise exception 'Not authenticated';
  end if;
  if other_user_id is null or other_user_id = me then
    raise exception 'Invalid other_user_id';
  end if;

  -- Finn en eksisterende samtale der begge er medlemmer
  select cm1.conversation_id into existing_id
  from conversation_members cm1
  join conversation_members cm2
    on cm1.conversation_id = cm2.conversation_id
  where cm1.user_id = me
    and cm2.user_id = other_user_id
  limit 1;

  if existing_id is not null then
    return existing_id;
  end if;

  -- Opprett ny samtale + legg til begge medlemmer
  insert into conversations default values returning id into new_id;
  insert into conversation_members (conversation_id, user_id)
  values (new_id, me), (new_id, other_user_id);

  return new_id;
end;
$function$;

-- Tilgangsstyring (pg_get_functiondef tar ikke med grants; funksjonen
-- avviser uansett uinnloggede selv via auth.uid()-sjekken over).
revoke all on function public.start_conversation(uuid) from public;
grant execute on function public.start_conversation(uuid) to authenticated;
