-- Record student self-registration in the admin activity feed.
create or replace function private.audit_student_registration()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.audit_logs(actor_id, action, entity_type, entity_id, metadata)
  values (
    new.id,
    'register',
    'student_registration',
    new.id,
    jsonb_build_object('full_name', new.full_name)
  );
  return new;
end;
$$;

revoke all on function private.audit_student_registration() from public, anon, authenticated;

create trigger audit_student_registration
  after insert on public.profiles
  for each row execute function private.audit_student_registration();
