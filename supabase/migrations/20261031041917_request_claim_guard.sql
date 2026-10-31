-- A staff claim is only an assignment operation. Without this guard, the
-- staff UPDATE policy and column grants also allow a staff member to set a
-- status, student-visible note, or completion timestamp while claiming.
create or replace function private.prevent_staff_claim_state_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.assigned_staff_id is null
     and new.assigned_staff_id = (select auth.uid())
     and (select private.has_role('staff'))
     and not (
       (select private.has_role('admin'))
       or (select private.has_role('super_admin'))
     )
     and (
       new.status is distinct from old.status
       or new.student_visible_note is distinct from old.student_visible_note
       or new.completed_at is distinct from old.completed_at
     ) then
    raise exception using
      errcode = '42501',
      message = 'Claiming a request cannot change its status or student update.';
  end if;

  return new;
end;
$$;

revoke all on function private.prevent_staff_claim_state_change() from public;

create trigger prevent_staff_claim_state_change
before update of assigned_staff_id, status, student_visible_note, completed_at
on public.service_requests
for each row
execute function private.prevent_staff_claim_state_change();
