-- Extend existing service categories and add controlled, authenticated SAO documents.
alter table public.service_categories
  add column if not exists requirements text not null default '',
  add column if not exists processing_instructions text not null default '',
  add column if not exists contact_information text not null default '',
  add column if not exists availability_status text not null default 'available'
    check (availability_status in ('available', 'temporarily_unavailable', 'archived'));

create table if not exists public.service_documents (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.service_categories(id) on delete cascade,
  title text not null check (length(title) between 1 and 180),
  description text not null default '',
  storage_path text not null unique,
  mime_type text not null,
  is_public boolean not null default true,
  is_active boolean not null default true,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists service_documents_category_idx on public.service_documents(category_id, is_active);
alter table public.service_documents enable row level security;
create policy "active service documents visible by access level" on public.service_documents
  for select to authenticated using (
    (is_active and is_public) or (select private.has_role('admin')) or (select private.has_role('super_admin'))
  );
create policy "administrators manage service documents" on public.service_documents
  for all to authenticated
  using ((select private.has_role('admin')) or (select private.has_role('super_admin')))
  with check ((select private.has_role('admin')) or (select private.has_role('super_admin')));
grant select, insert, update, delete on public.service_documents to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('sao-documents', 'sao-documents', false, 20971520,
  array['application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document','image/png','image/jpeg'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy "administrators upload SAO documents" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'sao-documents' and ((select private.has_role('admin')) or (select private.has_role('super_admin')))
  );
create policy "users download authorized SAO documents" on storage.objects
  for select to authenticated using (
    bucket_id = 'sao-documents' and exists (
      select 1 from public.service_documents d
      where d.storage_path = name and ((d.is_active and d.is_public)
        or (select private.has_role('admin')) or (select private.has_role('super_admin')))
    )
  );
create policy "administrators update SAO documents" on storage.objects
  for update to authenticated using (
    bucket_id = 'sao-documents' and ((select private.has_role('admin')) or (select private.has_role('super_admin')))
  ) with check (
    bucket_id = 'sao-documents' and ((select private.has_role('admin')) or (select private.has_role('super_admin')))
  );
create policy "administrators delete SAO documents" on storage.objects
  for delete to authenticated using (
    bucket_id = 'sao-documents' and ((select private.has_role('admin')) or (select private.has_role('super_admin')))
  );

-- Earlier policies allowed any staff member to manage their own schedule. Policies are
-- permissive and combine with OR, so remove that path and leave only administrator control.
drop policy if exists "staff manage own availability" on public.staff_availability;
drop policy if exists "admins manage staff availability" on public.staff_availability;
create policy "administrators manage staff availability" on public.staff_availability
  for all to authenticated
  using ((select private.has_role('admin')) or (select private.has_role('super_admin')))
  with check (
    ((select private.has_role('admin')) or (select private.has_role('super_admin')))
    and exists (
      select 1 from public.user_roles r
      where r.user_id = staff_availability.staff_id and r.role = 'staff'
    )
  );

-- Staff need the student's display identity to triage an incoming unassigned case.
-- This grants access only while that student's request is unassigned.
create policy "staff read profiles for incoming requests" on public.profiles
  for select to authenticated using (
    exists (
      select 1 from public.service_requests q
      where q.student_id = profiles.id and q.assigned_staff_id is null
        and (select private.has_role('staff'))
    )
  );

alter table public.staff_availability
  add constraint staff_availability_no_overlap
  exclude using gist (
    staff_id with =,
    tsrange(available_date + start_time, available_date + end_time, '[)') with &&
  );

create trigger service_documents_set_updated_at
  before update on public.service_documents
  for each row execute function public.set_updated_at();
