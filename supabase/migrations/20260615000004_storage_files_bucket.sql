-- Storage bucket for real file uploads.
-- Run this in the Supabase SQL Editor (or include in a later migration) after
-- creating the `files` bucket from the dashboard / CLI. The bucket can be set
-- to public or private; here we keep it private and use RLS policies so files
-- are only accessible to members of the owning workspace.

-- Enable the storage schema (already present by default).
-- create schema if not exists storage;

-- If the bucket does not exist yet, create it. In managed Supabase this usually
-- needs to be done via the dashboard or Storage API; this migration documents
-- the required RLS policies once the bucket exists.
-- insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
-- values ('files', 'files', false, 52428800, null);

-- Policy: authenticated users can upload files to their own workspace path.
-- Object path format: "{workspace_id}/{file_name}"
drop policy if exists "Workspace members can upload files" on storage.objects;
create policy "Workspace members can upload files"
on storage.objects
for insert
with check (
  bucket_id = 'files'
  and auth.role() = 'authenticated'
  and exists (
    select 1 from public.workspace_members wm
    where wm.user_id = auth.uid()
      and wm.workspace_id::text = (storage.foldername(name))[1]
      and wm.status = 'active'
  )
);

-- Policy: workspace members can read files in their workspace.
drop policy if exists "Workspace members can read files" on storage.objects;
create policy "Workspace members can read files"
on storage.objects
for select
using (
  bucket_id = 'files'
  and auth.role() = 'authenticated'
  and exists (
    select 1 from public.workspace_members wm
    where wm.user_id = auth.uid()
      and wm.workspace_id::text = (storage.foldername(name))[1]
      and wm.status = 'active'
  )
);

-- Policy: workspace members can delete files in their workspace.
drop policy if exists "Workspace members can delete files" on storage.objects;
create policy "Workspace members can delete files"
on storage.objects
for delete
using (
  bucket_id = 'files'
  and auth.role() = 'authenticated'
  and exists (
    select 1 from public.workspace_members wm
    where wm.user_id = auth.uid()
      and wm.workspace_id::text = (storage.foldername(name))[1]
      and wm.status = 'active'
  )
);
