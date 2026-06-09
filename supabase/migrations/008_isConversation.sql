-- 1. Hjelpefunksjon: sjekker medlemskap UTEN aa trigge RLS (unngaar recursion)
create or replace function public.is_conversation_member(conv_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from conversation_members
    where conversation_id = conv_id
      and user_id = auth.uid()
  );
$$;

grant execute on function public.is_conversation_member(uuid) to authenticated;

-- 2. Erstatt lese-policyen: se ALLE medlemmer i samtaler du selv er med i
drop policy if exists members_read on public.conversation_members;

create policy members_read on public.conversation_members
for select
using ( public.is_conversation_member(conversation_id) );