-- Persist a notification whenever a student submits a request.
create or replace function private.record_request_status_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status is distinct from new.status then
    insert into public.request_status_history(request_id, previous_status, new_status, changed_by, student_visible_message)
    values (new.id, old.status, new.status, (select auth.uid()), new.student_visible_note);

    insert into public.notifications(recipient_id, title, message, notification_type, related_entity_type, related_entity_id)
    values (
      new.student_id,
      'Request status: ' || initcap(replace(new.status::text, '_', ' ')),
      'Request ' || new.reference_number || ' — ' || new.subject || ' is now ' || replace(new.status::text, '_', ' ') || '.' ||
        case when nullif(new.student_visible_note, '') is not null then ' ' || new.student_visible_note else '' end,
      'request_update',
      'service_request',
      new.id
    );
  end if;
  return new;
end;
$$;
revoke all on function private.record_request_status_change() from public;

create or replace function private.notify_request_received()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.notifications(recipient_id, title, message, notification_type, related_entity_type, related_entity_id)
  values (
    new.student_id,
    'Request received',
    'We received request ' || new.reference_number || ' — ' || new.subject || '. You can follow its status in My requests.',
    'request_received',
    'service_request',
    new.id
  );
  return new;
end;
$$;
revoke all on function private.notify_request_received() from public;

create trigger service_request_notification_after_insert
after insert on public.service_requests
for each row execute function private.notify_request_received();

-- Persist appointment request and lifecycle notifications for the student.
create or replace function private.notify_appointment_lifecycle()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  notification_title text;
  notification_message text;
begin
  if tg_op = 'INSERT' then
    notification_title := 'Appointment request received';
    notification_message := 'Your appointment request for ' || to_char(new.appointment_date, 'FMMonth FMDD, YYYY') ||
      ' at ' || to_char(new.start_time, 'FMHH12:MI AM') || ' has been sent to Student Affairs.';
  elsif old.status is distinct from new.status then
    notification_title := case new.status
      when 'confirmed' then 'Appointment confirmed'
      when 'cancelled' then 'Appointment cancelled'
      else 'Appointment update'
    end;
    notification_message := 'Your appointment for ' || to_char(new.appointment_date, 'FMMonth FMDD, YYYY') ||
      ' at ' || to_char(new.start_time, 'FMHH12:MI AM') || ' is now ' || replace(new.status, '_', ' ') || '.';
  elsif old.appointment_date is distinct from new.appointment_date
     or old.start_time is distinct from new.start_time
     or old.end_time is distinct from new.end_time then
    notification_title := 'Appointment time changed';
    notification_message := 'Your appointment has been rescheduled to ' || to_char(new.appointment_date, 'FMMonth FMDD, YYYY') ||
      ' at ' || to_char(new.start_time, 'FMHH12:MI AM') || '.';
  else
    return new;
  end if;

  insert into public.notifications(recipient_id, title, message, notification_type, related_entity_type, related_entity_id)
  values (new.student_id, notification_title, notification_message, 'appointment_update', 'appointment', new.id);
  return new;
end;
$$;
revoke all on function private.notify_appointment_lifecycle() from public;

create trigger appointment_notification_after_insert
after insert on public.appointments
for each row execute function private.notify_appointment_lifecycle();

create trigger appointment_notification_after_update
after update of status, appointment_date, start_time, end_time on public.appointments
for each row execute function private.notify_appointment_lifecycle();

-- The UI subscribes to notification inserts and read-state updates.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications'
    ) then
      execute 'alter publication supabase_realtime add table public.notifications';
    end if;
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'appointments'
    ) then
      execute 'alter publication supabase_realtime add table public.appointments';
    end if;
  end if;
end;
$$;
