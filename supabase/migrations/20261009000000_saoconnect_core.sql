-- SAOConnect core schema. Apply with Supabase CLI or SQL editor.
create extension if not exists pgcrypto;
create extension if not exists btree_gist;
create schema if not exists private;

create type public.app_role as enum ('student', 'staff', 'admin', 'super_admin');
create type public.request_status as enum ('submitted', 'under_review', 'in_progress', 'awaiting_student', 'approved', 'rejected', 'completed', 'cancelled');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  student_number text unique,
  email text not null default '',
  department text,
  program text,
  avatar_path text,
  account_status text not null default 'active' check (account_status in ('active','suspended','pending')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.user_roles (
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null default 'student',
  created_at timestamptz not null default now(), primary key(user_id, role)
);
create table public.service_categories (
  id uuid primary key default gen_random_uuid(), name text not null unique, description text not null default '',
  required_documents text[] not null default '{}', estimated_processing_days integer check (estimated_processing_days is null or estimated_processing_days > 0),
  is_active boolean not null default true, created_at timestamptz not null default now()
);
create table public.service_requests (
  id uuid primary key default gen_random_uuid(), reference_number text not null unique default ('SAO-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,10))),
  student_id uuid not null references public.profiles(id), category_id uuid references public.service_categories(id),
  subject text not null check (length(subject) between 3 and 180), description text not null check (length(description) between 10 and 10000),
  priority text not null default 'normal' check (priority in ('low','normal','high')), status public.request_status not null default 'submitted',
  assigned_staff_id uuid references public.profiles(id), student_visible_note text,
  submitted_at timestamptz not null default now(), updated_at timestamptz not null default now(), completed_at timestamptz
);
create index service_requests_student_idx on public.service_requests(student_id, submitted_at desc);
create index service_requests_assignee_idx on public.service_requests(assigned_staff_id, status);
create table public.request_status_history (
  id uuid primary key default gen_random_uuid(), request_id uuid not null references public.service_requests(id) on delete cascade,
  previous_status public.request_status, new_status public.request_status not null, changed_by uuid references public.profiles(id),
  student_visible_message text, internal_note text, created_at timestamptz not null default now()
);
create table public.request_attachments (
  id uuid primary key default gen_random_uuid(), request_id uuid not null references public.service_requests(id) on delete cascade,
  storage_path text not null unique, original_filename text not null, mime_type text not null, file_size bigint not null check(file_size between 1 and 10485760),
  uploaded_by uuid not null references public.profiles(id), created_at timestamptz not null default now()
);
create table public.announcements (
  id uuid primary key default gen_random_uuid(), title text not null, slug text not null unique, content text not null,
  category text not null default 'General', cover_image_path text, author_id uuid not null references public.profiles(id),
  audience text not null default 'all' check (audience in ('all','students','staff')), status text not null default 'draft' check(status in ('draft','published','archived')),
  is_pinned boolean not null default false, published_at timestamptz, expires_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.staff_availability (
  id uuid primary key default gen_random_uuid(), staff_id uuid not null references public.profiles(id), available_date date not null,
  start_time time not null, end_time time not null, is_available boolean not null default true, check(end_time > start_time), unique(staff_id,available_date,start_time,end_time)
);
create table public.appointments (
  id uuid primary key default gen_random_uuid(), student_id uuid not null references public.profiles(id), staff_id uuid references public.profiles(id),
  purpose text not null, appointment_date date not null, start_time time not null, end_time time not null, status text not null default 'pending'
   check(status in ('pending','confirmed','completed','cancelled','no_show')),
  student_notes text, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), check(end_time > start_time)
);
create or replace function public.validate_appointment_slot() returns trigger language plpgsql set search_path = '' as $$
begin
 if not exists(select 1 from public.staff_availability a where a.staff_id=new.staff_id and a.available_date=new.appointment_date
   and a.start_time=new.start_time and a.end_time=new.end_time and a.is_available) then
  raise exception 'The selected appointment time is no longer available';
 end if;
 return new;
end $$;
create trigger validate_appointment_slot_trigger before insert on public.appointments for each row execute function public.validate_appointment_slot();
create index appointments_day_idx on public.appointments(appointment_date, start_time) where status in ('pending','confirmed');
alter table public.appointments add constraint appointments_staff_no_overlap
 exclude using gist (staff_id with =, tsrange(appointment_date + start_time, appointment_date + end_time, '[)') with &&)
 where (staff_id is not null and status in ('pending','confirmed'));
create table public.events (
  id uuid primary key default gen_random_uuid(), title text not null, description text not null default '', poster_path text, location text not null default '',
  start_at timestamptz not null, end_at timestamptz not null, registration_deadline timestamptz, capacity integer check(capacity is null or capacity > 0),
  status text not null default 'draft' check(status in ('draft','published','cancelled','archived')), created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), check(end_at > start_at)
);
create table public.event_registrations (
  id uuid primary key default gen_random_uuid(), event_id uuid not null references public.events(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  registration_status text not null default 'registered' check(registration_status in ('registered','cancelled','waitlisted')),
  attendance_status text not null default 'unknown' check(attendance_status in ('unknown','present','absent')), registered_at timestamptz not null default now(), unique(event_id,student_id)
);
create or replace function private.enforce_event_capacity() returns trigger language plpgsql security definer set search_path = '' as $$
declare cap integer; event_status text; deadline timestamptz;
begin
 if (select auth.uid()) is null then raise exception 'Authentication required'; end if;
 select capacity,status,registration_deadline into cap,event_status,deadline from public.events where id=new.event_id for update;
 if event_status <> 'published' or (deadline is not null and deadline < now()) then raise exception 'Event registration is closed'; end if;
 if cap is not null and (select count(*) from public.event_registrations where event_id=new.event_id and registration_status='registered') >= cap then
  raise exception 'Event capacity has been reached';
 end if;
 return new;
end $$;
revoke all on function private.enforce_event_capacity() from public;
create trigger event_capacity_trigger before insert on public.event_registrations for each row execute function private.enforce_event_capacity();
create table public.notifications (
  id uuid primary key default gen_random_uuid(), recipient_id uuid not null references public.profiles(id) on delete cascade,
  title text not null, message text not null, notification_type text not null default 'info', related_entity_type text, related_entity_id uuid,
  is_read boolean not null default false, created_at timestamptz not null default now()
);
create index notifications_recipient_idx on public.notifications(recipient_id, created_at desc);
create table public.feedback (
  id uuid primary key default gen_random_uuid(), student_id uuid not null references public.profiles(id), request_id uuid references public.service_requests(id),
  appointment_id uuid references public.appointments(id), rating smallint not null check(rating between 1 and 5), comments text,
  created_at timestamptz not null default now(), check ((request_id is not null)::int + (appointment_id is not null)::int = 1)
);
create unique index feedback_request_unique on public.feedback(request_id) where request_id is not null;
create unique index feedback_appointment_unique on public.feedback(appointment_id) where appointment_id is not null;
create table public.audit_logs (
  id bigint generated always as identity primary key, actor_id uuid references public.profiles(id), action text not null,
  entity_type text not null, entity_id uuid, metadata jsonb not null default '{}', created_at timestamptz not null default now()
);

-- Role lookup is isolated from exposed schemas and is constrained to the caller's identity.
create or replace function private.has_role(wanted public.app_role)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.user_roles r where r.user_id = (select auth.uid()) and r.role = wanted)
$$;
revoke all on function private.has_role(public.app_role) from public;
grant execute on function private.has_role(public.app_role) to authenticated;
create or replace function private.is_staff_or_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.user_roles r where r.user_id = (select auth.uid()) and r.role in ('staff','admin','super_admin'))
$$;
revoke all on function private.is_staff_or_admin() from public;
grant execute on function private.is_staff_or_admin() to authenticated;
grant usage on schema private to authenticated;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles(id, full_name, email) values(new.id, coalesce(new.raw_user_meta_data->>'full_name',''), coalesce(new.email,''));
  insert into public.user_roles(user_id, role) values(new.id, 'student');
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- updated_at is managed by database triggers.
create or replace function public.set_updated_at() returns trigger language plpgsql set search_path = '' as $$ begin new.updated_at = now(); return new; end $$;
do $$ declare t text; begin foreach t in array array['profiles','service_requests','announcements','appointments','events'] loop
 execute format('create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at()', t);
end loop; end $$;

-- History rows are recorded whenever status changes. Internal notes are staff-only via RLS.
create or replace function private.record_request_status_change() returns trigger language plpgsql security definer set search_path = '' as $$
begin
 if old.status is distinct from new.status then
  insert into public.request_status_history(request_id,previous_status,new_status,changed_by,student_visible_message)
  values(new.id,old.status,new.status,(select auth.uid()),new.student_visible_note);
  insert into public.notifications(recipient_id,title,message,notification_type,related_entity_type,related_entity_id)
  values(new.student_id,'Request update',coalesce(new.student_visible_note,'Your request is now ' || replace(new.status::text,'_',' ') || '.'),'request_update','service_request',new.id);
 end if;
 return new;
end $$;
revoke all on function private.record_request_status_change() from public;
create trigger request_status_history_trigger after update on public.service_requests for each row execute function private.record_request_status_change();

alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.service_categories enable row level security;
alter table public.service_requests enable row level security;
alter table public.request_status_history enable row level security;
alter table public.request_attachments enable row level security;
alter table public.announcements enable row level security;
alter table public.staff_availability enable row level security;
alter table public.appointments enable row level security;
alter table public.events enable row level security;
alter table public.event_registrations enable row level security;
alter table public.notifications enable row level security;
alter table public.feedback enable row level security;
alter table public.audit_logs enable row level security;

create policy "profiles read own or authorized case staff" on public.profiles for select to authenticated using(id=(select auth.uid()) or (select private.has_role('admin')) or (select private.has_role('super_admin')) or exists(select 1 from public.service_requests q where q.student_id=id and q.assigned_staff_id=(select auth.uid())));
create policy "profiles update own" on public.profiles for update to authenticated using(id=(select auth.uid())) with check(id=(select auth.uid()));
create policy "roles read self or admins" on public.user_roles for select to authenticated using(user_id=(select auth.uid()) or (select private.has_role('admin')) or (select private.has_role('super_admin')));
create policy "categories read active" on public.service_categories for select to authenticated using(is_active or (select private.is_staff_or_admin()));
create policy "categories admins manage" on public.service_categories for all to authenticated using((select private.has_role('admin')) or (select private.has_role('super_admin'))) with check((select private.has_role('admin')) or (select private.has_role('super_admin')));
create policy "requests read owner or assigned staff" on public.service_requests for select to authenticated using(student_id=(select auth.uid()) or assigned_staff_id=(select auth.uid()) or (select private.has_role('admin')) or (select private.has_role('super_admin')));
create policy "students create own requests" on public.service_requests for insert to authenticated with check(student_id=(select auth.uid()) and assigned_staff_id is null and status='submitted');
create policy "assigned staff update requests" on public.service_requests for update to authenticated using(assigned_staff_id=(select auth.uid()) or (select private.has_role('admin')) or (select private.has_role('super_admin'))) with check(assigned_staff_id=(select auth.uid()) or (select private.has_role('admin')) or (select private.has_role('super_admin')));
create policy "history owner or authorized staff" on public.request_status_history for select to authenticated using(exists(select 1 from public.service_requests q where q.id=request_id and (q.student_id=(select auth.uid()) or q.assigned_staff_id=(select auth.uid()) or (select private.has_role('admin')) or (select private.has_role('super_admin')))));
create policy "attachments owner or assigned" on public.request_attachments for select to authenticated using(exists(select 1 from public.service_requests q where q.id=request_id and (q.student_id=(select auth.uid()) or q.assigned_staff_id=(select auth.uid()) or (select private.has_role('admin')) or (select private.has_role('super_admin')))));
create policy "students attach own new requests" on public.request_attachments for insert to authenticated with check(uploaded_by=(select auth.uid()) and exists(select 1 from public.service_requests q where q.id=request_id and q.student_id=(select auth.uid())));
create policy "published announcements" on public.announcements for select to authenticated using(status='published' and (expires_at is null or expires_at>now()) and (audience='all' or audience='students') or (select private.is_staff_or_admin()));
create policy "staff manage announcements" on public.announcements for all to authenticated using((select private.is_staff_or_admin())) with check((select private.is_staff_or_admin()) and author_id=(select auth.uid()));
create policy "availability read" on public.staff_availability for select to authenticated using(is_available or staff_id=(select auth.uid()) or (select private.is_staff_or_admin()));
create policy "staff manage own availability" on public.staff_availability for all to authenticated using(staff_id=(select auth.uid()) and (select private.is_staff_or_admin())) with check(staff_id=(select auth.uid()) and (select private.is_staff_or_admin()));
create policy "appointments owner or staff" on public.appointments for select to authenticated using(student_id=(select auth.uid()) or staff_id=(select auth.uid()) or (select private.has_role('admin')) or (select private.has_role('super_admin')));
create policy "student create own appointment" on public.appointments for insert to authenticated with check(student_id=(select auth.uid()) and status='pending');
create policy "student cancel own appointment" on public.appointments for update to authenticated using(student_id=(select auth.uid())) with check(student_id=(select auth.uid()) and status='cancelled');
create policy "staff manage assigned appointment" on public.appointments for update to authenticated using(staff_id=(select auth.uid()) and (select private.is_staff_or_admin())) with check(staff_id=(select auth.uid()) and (select private.is_staff_or_admin()));
create policy "admins manage appointments" on public.appointments for update to authenticated using((select private.has_role('admin')) or (select private.has_role('super_admin'))) with check((select private.has_role('admin')) or (select private.has_role('super_admin')));
create policy "published events" on public.events for select to authenticated using(status='published' or (select private.is_staff_or_admin()));
create policy "staff manage events" on public.events for all to authenticated using((select private.is_staff_or_admin())) with check((select private.is_staff_or_admin()) and created_by=(select auth.uid()));
create policy "registrations owner or event staff" on public.event_registrations for select to authenticated using(student_id=(select auth.uid()) or exists(select 1 from public.events e where e.id=event_id and e.created_by=(select auth.uid())) or (select private.has_role('admin')) or (select private.has_role('super_admin')));
create policy "student register self" on public.event_registrations for insert to authenticated with check(student_id=(select auth.uid()) and registration_status='registered' and attendance_status='unknown');
create policy "student cancel own registration" on public.event_registrations for update to authenticated using(student_id=(select auth.uid())) with check(student_id=(select auth.uid()) and registration_status='cancelled' and attendance_status='unknown');
create policy "staff manage attendance" on public.event_registrations for update to authenticated using((select private.is_staff_or_admin())) with check((select private.is_staff_or_admin()));
create policy "notifications own" on public.notifications for select to authenticated using(recipient_id=(select auth.uid()));
create policy "notifications mark own read" on public.notifications for update to authenticated using(recipient_id=(select auth.uid())) with check(recipient_id=(select auth.uid()));
create policy "feedback owner or authorized staff" on public.feedback for select to authenticated using(student_id=(select auth.uid()) or (select private.has_role('admin')) or (select private.has_role('super_admin')) or exists(select 1 from public.service_requests q where q.id=request_id and q.assigned_staff_id=(select auth.uid())) or exists(select 1 from public.appointments a where a.id=appointment_id and a.staff_id=(select auth.uid())));
create policy "student submit eligible feedback" on public.feedback for insert to authenticated with check(student_id=(select auth.uid()) and ((request_id is not null and exists(select 1 from public.service_requests q where q.id=request_id and q.student_id=(select auth.uid()) and q.status='completed')) or (appointment_id is not null and exists(select 1 from public.appointments a where a.id=appointment_id and a.student_id=(select auth.uid()) and a.status='completed'))));
create policy "audit admin read" on public.audit_logs for select to authenticated using((select private.has_role('admin')) or (select private.has_role('super_admin')));

grant usage on schema public to authenticated;
grant select, insert on public.profiles to authenticated;
grant update(full_name,department,program,avatar_path) on public.profiles to authenticated;
grant select on public.user_roles to authenticated;
grant select, insert, update on public.service_categories, public.announcements, public.staff_availability, public.events to authenticated;
grant select, insert on public.request_attachments, public.feedback to authenticated;
grant select on public.notifications to authenticated;
grant update(is_read) on public.notifications to authenticated;
grant select, insert on public.service_requests to authenticated;
grant update(status,student_visible_note,assigned_staff_id,completed_at) on public.service_requests to authenticated;
grant select, insert on public.appointments to authenticated;
grant update(status,student_notes) on public.appointments to authenticated;
grant select, insert on public.event_registrations to authenticated;
grant update(registration_status,attendance_status) on public.event_registrations to authenticated;
grant select(id,request_id,previous_status,new_status,changed_by,student_visible_message,created_at) on public.request_status_history to authenticated;
grant select on public.audit_logs to authenticated;

-- Private supporting files: request-attachments bucket. Uploads are scoped to a user's uid folder.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('request-attachments','request-attachments',false,10485760,array['application/pdf','image/jpeg','image/png'])
on conflict(id) do update set public=false,file_size_limit=10485760,allowed_mime_types=array['application/pdf','image/jpeg','image/png'];
create policy "request attachment upload own folder" on storage.objects for insert to authenticated
with check(bucket_id='request-attachments' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy "request attachment read owner or staff" on storage.objects for select to authenticated using(
 bucket_id='request-attachments' and ((storage.foldername(name))[1]=(select auth.uid())::text or exists(
  select 1 from public.service_requests q where q.id=(storage.foldername(name))[2]::uuid and q.student_id=(storage.foldername(name))[1]::uuid
   and (q.assigned_staff_id=(select auth.uid()) or (select private.has_role('admin')) or (select private.has_role('super_admin'))))));

insert into public.service_categories(name,description,required_documents,estimated_processing_days) values
 ('Student Affairs inquiry','Questions and guidance from the Student Affairs Office.',array[]::text[],3),
 ('Organization registration','Register or renew a recognized student organization.',array['Organization constitution','Officer roster'],10),
 ('Activity proposal','Submit a proposal for a campus student activity.',array['Activity proposal','Budget plan'],7),
 ('General concern','Share a concern or complaint with Student Affairs.',array[]::text[],5)
on conflict(name) do nothing;

-- Secure bootstrap: create a user through Supabase Auth first, then run this manually as project owner.
-- Replace the UUID with the trusted user's auth.users.id. Never expose this operation to public registration.
-- insert into public.user_roles(user_id,role) values ('<trusted-user-uuid>','admin') on conflict do nothing;
