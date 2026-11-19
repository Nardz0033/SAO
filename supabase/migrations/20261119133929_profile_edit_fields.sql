alter table public.profiles
  add column if not exists first_name text,
  add column if not exists middle_name text,
  add column if not exists last_name text,
  add column if not exists contact_number text,
  add column if not exists year_level text,
  add column if not exists section text,
  add column if not exists gender text;

-- Backfill the new name fields without changing existing profile names.
update public.profiles
set first_name = coalesce(first_name, nullif(split_part(full_name, ' ', 1), '')),
    last_name = coalesce(last_name, nullif(trim(substr(full_name, length(split_part(full_name, ' ', 1)) + 1)), ''))
where first_name is null or last_name is null;

grant update (full_name, email, student_number, department, program, avatar_path, first_name, middle_name, last_name, contact_number, year_level, section, gender)
on public.profiles to authenticated;

-- Profile photos use a unique object path per upload; allow replacement within the owner's folder.
drop policy if exists "users replace their own profile photos" on storage.objects;
create policy "users replace their own profile photos"
on storage.objects for update to authenticated
using (bucket_id = 'profile-photos' and (storage.foldername(name))[1] = (select auth.uid())::text)
with check (bucket_id = 'profile-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
