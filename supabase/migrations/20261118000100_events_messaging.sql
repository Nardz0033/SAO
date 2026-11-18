-- Configurable academic periods and richer event metadata.
create table if not exists public.academic_semesters (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(name) between 1 and 80),
  academic_year text not null check (length(academic_year) between 4 and 20),
  starts_on date not null,
  ends_on date not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_on >= starts_on),
  unique (name, academic_year)
);
alter table public.events
  add column if not exists semester_id uuid references public.academic_semesters(id) on delete set null,
  add column if not exists category text not null default 'General',
  add column if not exists organizer text not null default 'Student Affairs Office',
  add column if not exists target_participants text not null default 'All students',
  add column if not exists additional_instructions text not null default '';
alter table public.events drop constraint if exists events_status_check;
alter table public.events add constraint events_status_check
  check (status in ('draft','published','cancelled','archived','completed'));
drop policy if exists "staff manage events" on public.events;
create policy "staff manage own events" on public.events
  for all to authenticated
  using ((select private.has_role('staff')) and created_by=(select auth.uid()))
  with check ((select private.has_role('staff')) and created_by=(select auth.uid()));
create policy "administrators manage all events" on public.events
  for all to authenticated
  using ((select private.has_role('admin')) or (select private.has_role('super_admin')))
  with check ((select private.has_role('admin')) or (select private.has_role('super_admin')));
-- The baseline allowed any staff member to update attendance for every event.
-- Limit staff to registrations for events they own; administrators retain oversight.
drop policy if exists "staff manage attendance" on public.event_registrations;
create policy "staff manage attendance for own events" on public.event_registrations
  for update to authenticated
  using (
    exists (select 1 from public.events e where e.id = event_id and e.created_by = (select auth.uid()))
    or (select private.has_role('admin')) or (select private.has_role('super_admin'))
  )
  with check (
    exists (select 1 from public.events e where e.id = event_id and e.created_by = (select auth.uid()))
    or (select private.has_role('admin')) or (select private.has_role('super_admin'))
  );
drop policy if exists "staff manage announcements" on public.announcements;
create policy "staff manage own announcements" on public.announcements
  for all to authenticated using ((select private.has_role('staff')) and author_id=(select auth.uid()))
  with check ((select private.has_role('staff')) and author_id=(select auth.uid()));
create policy "administrators manage all announcements" on public.announcements
  for all to authenticated using ((select private.has_role('admin')) or (select private.has_role('super_admin')))
  with check ((select private.has_role('admin')) or (select private.has_role('super_admin')));
create or replace view public.event_registration_counts with (security_invoker = false) as
  select r.event_id,count(*)::integer as registered_count
  from public.event_registrations r join public.events e on e.id=r.event_id
  where r.registration_status='registered' and (e.status='published' or (select private.has_role('admin')) or (select private.has_role('super_admin')))
    and (select auth.uid()) is not null
  group by r.event_id;
grant select on public.event_registration_counts to authenticated;
create index if not exists events_semester_start_idx on public.events(semester_id, start_at);
create or replace function private.enforce_registration_cancellation_window() returns trigger
language plpgsql set search_path = '' as $$
declare event_start timestamptz; registration_deadline timestamptz;
begin
  if old.registration_status='registered' and new.registration_status='cancelled' then
    select e.start_at,e.registration_deadline into event_start,registration_deadline
    from public.events e where e.id=new.event_id;
    if now() >= coalesce(registration_deadline,event_start) then
      raise exception 'Event registration can no longer be cancelled';
    end if;
  end if;
  return new;
end $$;
revoke all on function private.enforce_registration_cancellation_window() from public, anon, authenticated;
create trigger enforce_registration_cancellation_window before update on public.event_registrations
  for each row execute function private.enforce_registration_cancellation_window();
insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('sao-event-posters','sao-event-posters',false,10485760,array['image/png','image/jpeg','image/webp'])
on conflict (id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
create policy "authorized event editors upload posters" on storage.objects
  for insert to authenticated with check (bucket_id='sao-event-posters' and (select private.is_staff_or_admin()));
create policy "users read published event posters" on storage.objects
  for select to authenticated using (bucket_id='sao-event-posters' and exists (
    select 1 from public.events e where e.poster_path=name and
      (e.status='published' or e.created_by=(select auth.uid()) or (select private.has_role('admin')) or (select private.has_role('super_admin')))
  ));
create policy "authorized event editors replace posters" on storage.objects
  for update to authenticated using (bucket_id='sao-event-posters' and (select private.is_staff_or_admin()))
  with check (bucket_id='sao-event-posters' and (select private.is_staff_or_admin()));
create policy "authorized event editors delete posters" on storage.objects
  for delete to authenticated using (bucket_id='sao-event-posters' and (select private.is_staff_or_admin()));
alter table public.academic_semesters enable row level security;
create policy "authenticated users read academic semesters" on public.academic_semesters
  for select to authenticated using (is_active or (select private.has_role('admin')) or (select private.has_role('super_admin')));
create policy "administrators manage academic semesters" on public.academic_semesters
  for all to authenticated
  using ((select private.has_role('admin')) or (select private.has_role('super_admin')))
  with check ((select private.has_role('admin')) or (select private.has_role('super_admin')));
create policy "authenticated users identify staff accounts" on public.user_roles
  for select to authenticated using (role = 'staff');

create or replace function private.notify_admin_new_profile() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.notifications(recipient_id,title,message,notification_type,related_entity_type,related_entity_id)
  select r.user_id,'New student account','A new student account has registered.','account_registration','profile',new.id
  from public.user_roles r where r.role in ('admin','super_admin');
  return new;
end $$;
revoke all on function private.notify_admin_new_profile() from public, anon, authenticated;
create trigger admin_new_profile_notification after insert on public.profiles
  for each row execute function private.notify_admin_new_profile();
grant select, insert, update, delete on public.academic_semesters to authenticated;
create trigger academic_semesters_set_updated_at before update on public.academic_semesters
  for each row execute function public.set_updated_at();

-- A narrowly scoped directory exposes only staff names and IDs, not private profile fields.
create or replace view public.sao_staff_directory with (security_invoker = false) as
  select distinct p.id, p.full_name
  from public.profiles p join public.user_roles r on r.user_id = p.id
  where r.role = 'staff' and p.account_status = 'active';
grant select on public.sao_staff_directory to authenticated;
create table if not exists public.messaging_settings (
  id boolean primary key default true check (id),
  private_messaging_enabled boolean not null default true,
  updated_by uuid references public.profiles(id),
  updated_at timestamptz not null default now()
);
insert into public.messaging_settings(id,private_messaging_enabled) values (true,true) on conflict (id) do nothing;
alter table public.messaging_settings enable row level security;
create policy "authenticated users read messaging setting" on public.messaging_settings
  for select to authenticated using ((select auth.uid()) is not null);
create policy "administrators manage messaging setting" on public.messaging_settings
  for update to authenticated using ((select private.has_role('admin')) or (select private.has_role('super_admin')))
  with check (((select private.has_role('admin')) or (select private.has_role('super_admin'))) and updated_by=(select auth.uid()));
revoke all on public.messaging_settings from anon, authenticated;
grant select on public.messaging_settings to authenticated;
grant update (private_messaging_enabled,updated_by) on public.messaging_settings to authenticated;
create trigger messaging_settings_set_updated_at before update on public.messaging_settings
  for each row execute function public.set_updated_at();
create table if not exists public.notification_preferences (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  sound_enabled boolean not null default false,
  updated_at timestamptz not null default now()
);
alter table public.notification_preferences enable row level security;
create policy "users manage own notification preferences" on public.notification_preferences
  for all to authenticated using (user_id=(select auth.uid()))
  with check (user_id=(select auth.uid()));
revoke all on public.notification_preferences from anon, authenticated;
grant select, insert, update on public.notification_preferences to authenticated;
create trigger notification_preferences_set_updated_at before update on public.notification_preferences
  for each row execute function public.set_updated_at();

create table if not exists public.private_conversations (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles(id) on delete cascade,
  staff_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'open' check (status in ('open','closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (student_id, staff_id),
  check (student_id <> staff_id)
);
create index if not exists private_conversations_staff_idx on public.private_conversations(staff_id, updated_at desc);
create index if not exists private_conversations_student_idx on public.private_conversations(student_id, updated_at desc);
create table if not exists public.private_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.private_conversations(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (length(body) between 1 and 5000),
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index if not exists private_messages_conversation_idx on public.private_messages(conversation_id, created_at);
alter table public.private_conversations enable row level security;
alter table public.private_messages enable row level security;
create policy "participants read private conversations" on public.private_conversations
  for select to authenticated using (student_id = (select auth.uid()) or staff_id = (select auth.uid()));
create policy "students start private conversations" on public.private_conversations
  for insert to authenticated with check (
    student_id = (select auth.uid()) and (select private.has_role('student'))
    and exists (select 1 from public.messaging_settings s where s.id and s.private_messaging_enabled)
    and exists (select 1 from public.user_roles r where r.user_id = staff_id and r.role = 'staff')
  );
create policy "participants update conversation status" on public.private_conversations
  for update to authenticated using (student_id = (select auth.uid()) or staff_id = (select auth.uid()))
  with check (student_id = (select auth.uid()) or staff_id = (select auth.uid()));
create policy "conversation participants can read each other profiles" on public.profiles
  for select to authenticated using (exists (
    select 1 from public.private_conversations c where
      (c.student_id = profiles.id and c.staff_id = (select auth.uid())) or
      (c.staff_id = profiles.id and c.student_id = (select auth.uid()))
  ));
create policy "staff read profiles for assigned appointments" on public.profiles
  for select to authenticated using (exists (
    select 1 from public.appointments a where a.student_id=profiles.id and a.staff_id=(select auth.uid())
      and (select private.has_role('staff'))
  ));
create policy "participants read private messages" on public.private_messages
  for select to authenticated using (exists (
    select 1 from public.private_conversations c where c.id = conversation_id
      and (c.student_id = (select auth.uid()) or c.staff_id = (select auth.uid()))
  ));
create policy "participants send private messages" on public.private_messages
  for insert to authenticated with check (
    sender_id = (select auth.uid()) and exists (
      select 1 from public.private_conversations c where c.id = conversation_id
        and (c.student_id = (select auth.uid()) or c.staff_id = (select auth.uid())) and c.status = 'open'
        and exists (select 1 from public.messaging_settings s where s.id and s.private_messaging_enabled)
    )
  );
create policy "recipients mark private messages read" on public.private_messages
  for update to authenticated using (
    sender_id <> (select auth.uid()) and exists (
      select 1 from public.private_conversations c where c.id = conversation_id
        and (c.student_id = (select auth.uid()) or c.staff_id = (select auth.uid()))
    )
  ) with check (sender_id <> (select auth.uid()));
revoke all on public.private_conversations from anon, authenticated;
grant select on public.private_conversations to authenticated;
grant insert (student_id,staff_id) on public.private_conversations to authenticated;
grant update (status) on public.private_conversations to authenticated;
revoke all on public.private_messages from anon, authenticated;
grant select on public.private_messages to authenticated;
grant insert (conversation_id,sender_id,body) on public.private_messages to authenticated;
grant update (read_at) on public.private_messages to authenticated;

-- General campus messages are intentionally separate from private student-to-staff content.
create table if not exists public.system_chat_messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (length(body) between 1 and 3000),
  created_at timestamptz not null default now()
);
create index if not exists system_chat_messages_created_idx on public.system_chat_messages(created_at desc);
alter table public.system_chat_messages enable row level security;
create policy "authenticated users read campus chat" on public.system_chat_messages
  for select to authenticated using ((select auth.uid()) is not null);
create policy "authenticated users send campus chat" on public.system_chat_messages
  for insert to authenticated with check (sender_id = (select auth.uid()));
revoke all on public.system_chat_messages from anon, authenticated;
grant select on public.system_chat_messages to authenticated;
grant insert (sender_id,body) on public.system_chat_messages to authenticated;
create or replace view public.system_chat_feed with (security_invoker = false) as
  select m.id, m.sender_id, coalesce(p.full_name, 'SAO user') as sender_name,
    coalesce((select r.role::text from public.user_roles r where r.user_id = m.sender_id order by case r.role when 'admin' then 1 when 'super_admin' then 2 when 'staff' then 3 else 4 end limit 1),'student') as sender_role,
    m.body, m.created_at
  from public.system_chat_messages m join public.profiles p on p.id = m.sender_id
  where (select auth.uid()) is not null;
grant select on public.system_chat_feed to authenticated;

create or replace function private.notify_private_conversation() returns trigger
language plpgsql security definer set search_path = '' as $$
declare student_name text;
begin
  if new.student_id is distinct from (select auth.uid()) then raise exception 'Conversation creator must be the authenticated student'; end if;
  if not exists (select 1 from public.messaging_settings s where s.id and s.private_messaging_enabled) then
    raise exception 'Private staff messaging is paused';
  end if;
  select p.full_name into student_name from public.profiles p where p.id = new.student_id;
  insert into public.notifications(recipient_id,title,message,notification_type,related_entity_type,related_entity_id)
  values(new.staff_id,'New student conversation',coalesce(student_name,'A student') || ' started a private conversation.','message','private_conversation',new.id);
  return new;
end $$;
revoke all on function private.notify_private_conversation() from public, anon, authenticated;
create trigger private_conversation_notification after insert on public.private_conversations
  for each row execute function private.notify_private_conversation();

create or replace function private.notify_private_message() returns trigger
language plpgsql security definer set search_path = '' as $$
declare recipient uuid; sender_name text;
begin
  if new.sender_id is distinct from (select auth.uid()) then raise exception 'Message sender must match the authenticated user'; end if;
  select case when c.student_id = new.sender_id then c.staff_id else c.student_id end into recipient
  from public.private_conversations c where c.id = new.conversation_id
    and (c.student_id = new.sender_id or c.staff_id = new.sender_id);
  if recipient is null then raise exception 'Message participant is not authorized'; end if;
  select p.full_name into sender_name from public.profiles p where p.id = new.sender_id;
  insert into public.notifications(recipient_id,title,message,notification_type,related_entity_type,related_entity_id)
  values(recipient, 'New private message', coalesce(sender_name,'SAO user') || ' sent you a message.', 'message', 'private_conversation', new.conversation_id);
  update public.private_conversations set updated_at = now() where id = new.conversation_id;
  return new;
end $$;
revoke all on function private.notify_private_message() from public, anon, authenticated;
create trigger private_message_notification after insert on public.private_messages
  for each row execute function private.notify_private_message();

create or replace function private.notify_sao_event() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null then raise exception 'Authenticated event changes are required'; end if;
  if new.status='published' and (tg_op='INSERT' or old.status is distinct from new.status) then
    insert into public.notifications(recipient_id,title,message,notification_type,related_entity_type,related_entity_id)
    select p.id,'New campus event',new.title || ' is open for registration.','event','event',new.id
    from public.profiles p where p.account_status='active'
      and exists(select 1 from public.user_roles r where r.user_id=p.id and r.role='student');
  elsif new.status='cancelled' and old.status is distinct from new.status then
    insert into public.notifications(recipient_id,title,message,notification_type,related_entity_type,related_entity_id)
    select r.student_id,'Campus event cancelled',new.title || ' has been cancelled.','event_update','event',new.id
    from public.event_registrations r where r.event_id=new.id and r.registration_status='registered';
  elsif old.start_at is distinct from new.start_at and new.status='published' then
    insert into public.notifications(recipient_id,title,message,notification_type,related_entity_type,related_entity_id)
    select r.student_id,'Campus event time changed',new.title || ' now starts ' || to_char(new.start_at,'FMMonth FMDD, YYYY at FMHH12:MI AM') || '.','event_update','event',new.id
    from public.event_registrations r where r.event_id=new.id and r.registration_status='registered';
  end if;
  return new;
end $$;
revoke all on function private.notify_sao_event() from public, anon, authenticated;
create trigger sao_event_notifications after insert or update on public.events
  for each row execute function private.notify_sao_event();

create or replace function private.notify_sao_announcement() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null then raise exception 'Authenticated announcement changes are required'; end if;
  if new.status='published' and (tg_op='INSERT' or old.status is distinct from new.status) then
    insert into public.notifications(recipient_id,title,message,notification_type,related_entity_type,related_entity_id)
    select p.id,'New campus announcement',new.title,'announcement','announcement',new.id
    from public.profiles p where p.account_status='active'
      and exists(select 1 from public.user_roles r where r.user_id=p.id and r.role='student');
  end if;
  return new;
end $$;
revoke all on function private.notify_sao_announcement() from public, anon, authenticated;
create trigger sao_announcement_notifications after insert or update of status on public.announcements
  for each row execute function private.notify_sao_announcement();

create or replace function private.notify_event_registration() returns trigger
language plpgsql security definer set search_path = '' as $$
declare organizer_id uuid; event_title text;
begin
  if (select auth.uid()) is distinct from new.student_id then raise exception 'Registration user must be the authenticated student'; end if;
  select e.created_by,e.title into organizer_id,event_title from public.events e where e.id=new.event_id;
  insert into public.notifications(recipient_id,title,message,notification_type,related_entity_type,related_entity_id)
    values(new.student_id,'Event registration confirmed','Your registration for ' || coalesce(event_title,'this event') || ' is confirmed.','event_registration','event',new.event_id);
  insert into public.notifications(recipient_id,title,message,notification_type,related_entity_type,related_entity_id)
    values(organizer_id,'New event registration','A student registered for ' || coalesce(event_title,'your event') || '.','event_registration','event',new.event_id);
  insert into public.notifications(recipient_id,title,message,notification_type,related_entity_type,related_entity_id)
    select r.user_id,'New event registration','A student registered for ' || coalesce(event_title,'a campus event') || '.','event_registration','event',new.event_id
    from public.user_roles r where r.role in ('admin','super_admin') and r.user_id<>organizer_id;
  return new;
end $$;
revoke all on function private.notify_event_registration() from public, anon, authenticated;
create trigger event_registration_notifications after insert on public.event_registrations
  for each row execute function private.notify_event_registration();

create or replace function private.notify_staff_appointment_request() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is distinct from new.student_id then raise exception 'Appointment requester must be the authenticated student'; end if;
  if new.staff_id is not null then
    insert into public.notifications(recipient_id,title,message,notification_type,related_entity_type,related_entity_id)
    values(new.staff_id,'New appointment request','A student requested an appointment for ' || to_char(new.appointment_date,'FMMonth FMDD, YYYY') || '.','appointment_request','appointment',new.id);
  end if;
  return new;
end $$;
revoke all on function private.notify_staff_appointment_request() from public, anon, authenticated;
create trigger staff_appointment_request_notification after insert on public.appointments
  for each row execute function private.notify_staff_appointment_request();

create or replace function private.notify_request_assignment() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null then raise exception 'Authenticated request changes are required'; end if;
  if new.assigned_staff_id is not null and old.assigned_staff_id is distinct from new.assigned_staff_id then
    insert into public.notifications(recipient_id,title,message,notification_type,related_entity_type,related_entity_id)
    values(new.assigned_staff_id,'Request assigned to you','Request ' || new.reference_number || ' — ' || new.subject || ' is assigned to you.','request_assignment','service_request',new.id);
  end if;
  return new;
end $$;
revoke all on function private.notify_request_assignment() from public, anon, authenticated;
create trigger request_assignment_notification after update of assigned_staff_id on public.service_requests
  for each row execute function private.notify_request_assignment();

create or replace function private.notify_admin_new_request() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is distinct from new.student_id then raise exception 'Request submitter must be the authenticated student'; end if;
  insert into public.notifications(recipient_id,title,message,notification_type,related_entity_type,related_entity_id)
  select r.user_id,'New student request','' || new.reference_number || ' — ' || new.subject || ' has been submitted.','request_received','service_request',new.id
  from public.user_roles r where r.role in ('admin','super_admin');
  return new;
end $$;
revoke all on function private.notify_admin_new_request() from public, anon, authenticated;
create trigger admin_new_request_notification after insert on public.service_requests
  for each row execute function private.notify_admin_new_request();

create or replace function private.audit_sao_change() returns trigger
language plpgsql security definer set search_path = '' as $$
declare before_row jsonb; after_row jsonb; current_row jsonb; target_id uuid; action_label text;
begin
  if (select auth.uid()) is null then raise exception 'Authenticated activity is required for audit logging'; end if;
  before_row := case when tg_op='INSERT' then null else to_jsonb(old) end;
  after_row := case when tg_op='DELETE' then null else to_jsonb(new) end;
  current_row := coalesce(after_row,before_row);
  target_id := (current_row->>'id')::uuid;
  action_label := case tg_op when 'INSERT' then 'created' when 'UPDATE' then 'updated' else 'deleted' end;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,metadata)
  values ((select auth.uid()),action_label,tg_table_name,target_id,jsonb_build_object(
    'previous',case when before_row is null then null else jsonb_strip_nulls(jsonb_build_object(
      'title',before_row->>'title','name',before_row->>'name','status',before_row->>'status',
      'start_at',before_row->>'start_at','location',before_row->>'location','academic_year',before_row->>'academic_year',
      'starts_on',before_row->>'starts_on','ends_on',before_row->>'ends_on','is_active',before_row->>'is_active',
      'category_id',before_row->>'category_id','is_public',before_row->>'is_public')) end,
    'new',case when after_row is null then null else jsonb_strip_nulls(jsonb_build_object(
      'title',after_row->>'title','name',after_row->>'name','status',after_row->>'status',
      'start_at',after_row->>'start_at','location',after_row->>'location','academic_year',after_row->>'academic_year',
      'starts_on',after_row->>'starts_on','ends_on',after_row->>'ends_on','is_active',after_row->>'is_active',
      'category_id',after_row->>'category_id','is_public',after_row->>'is_public')) end
  ));
  if tg_op='DELETE' then return old; end if;
  return new;
end $$;
revoke all on function private.audit_sao_change() from public, anon, authenticated;
create trigger audit_sao_event_changes after insert or update or delete on public.events
  for each row execute function private.audit_sao_change();
create trigger audit_academic_semester_changes after insert or update or delete on public.academic_semesters
  for each row execute function private.audit_sao_change();
create trigger audit_service_document_changes after insert or update or delete on public.service_documents
  for each row execute function private.audit_sao_change();

do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='private_messages') then
      alter publication supabase_realtime add table public.private_messages;
    end if;
    if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='private_conversations') then
      alter publication supabase_realtime add table public.private_conversations;
    end if;
    if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='system_chat_messages') then
      alter publication supabase_realtime add table public.system_chat_messages;
    end if;
    if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='notification_preferences') then
      alter publication supabase_realtime add table public.notification_preferences;
    end if;
  end if;
end $$;
