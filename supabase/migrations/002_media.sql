-- ─────────────────────────────────────────────────────────────
--  TxTt — Phase 3 media messages
--  Run this in Supabase Studio → SQL Editor after 001_messaging.sql
-- ─────────────────────────────────────────────────────────────

-- Add media columns to messages
alter table public.messages
  add column if not exists message_type text not null default 'text'
    check (message_type in ('text', 'image', 'audio')),
  add column if not exists file_url text,
  alter column content drop not null;

-- Make content optional (media messages may have no text)
alter table public.messages
  add constraint content_or_file
    check (content is not null or file_url is not null);

-- ── Storage buckets ───────────────────────────────────────────
-- Run these in Supabase Studio → Storage → New bucket
-- OR uncomment and run here if your Supabase version supports it:

-- insert into storage.buckets (id, name, public)
-- values ('media', 'media', false)
-- on conflict do nothing;

-- ── Storage RLS policies ──────────────────────────────────────
-- Allow authenticated users to upload their own media
create policy "media_upload"
  on storage.objects for insert
  with check (
    bucket_id = 'media' and
    auth.role() = 'authenticated'
  );

-- Allow authenticated users to read media
create policy "media_read"
  on storage.objects for select
  using (
    bucket_id = 'media' and
    auth.role() = 'authenticated'
  );

-- Allow users to delete their own media
create policy "media_delete"
  on storage.objects for delete
  using (
    bucket_id = 'media' and
    auth.uid()::text = (storage.foldername(name))[1]
  );
