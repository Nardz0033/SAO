-- Students may cancel their own active requests. The trigger constrains the
-- UPDATE to a status transition, since table-level UPDATE grants include
-- columns used by staff workflows.
create policy "students cancel own active requests"
on public.service_requests for update to authenticated
using (
  student_id = (select auth.uid())
  and status in ('submitted', 'under_review', 'in_progress', 'awaiting_student')
  and (select private.has_role('student'))
  and not (select private.is_staff_or_admin())
)
with check (
  student_id = (select auth.uid())
  and status = 'cancelled'
  and (select private.has_role('student'))
  and not (select private.is_staff_or_admin())
);

create or replace function private.prevent_student_request_edits()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.student_id = (select auth.uid())
     and (select private.has_role('student'))
     and not (select private.is_staff_or_admin())
     and (
       old.status not in ('submitted', 'under_review', 'in_progress', 'awaiting_student')
       or new.status is distinct from 'cancelled'::public.request_status
       or new.student_id is distinct from old.student_id
       or new.category_id is distinct from old.category_id
       or new.subject is distinct from old.subject
       or new.description is distinct from old.description
       or new.priority is distinct from old.priority
       or new.assigned_staff_id is distinct from old.assigned_staff_id
       or new.student_visible_note is distinct from old.student_visible_note
       or new.completed_at is distinct from old.completed_at
       or new.reference_number is distinct from old.reference_number
       or new.submitted_at is distinct from old.submitted_at
     ) then
    raise exception using
      errcode = '42501',
      message = 'Students may only cancel their own active requests.';
  end if;

  return new;
end;
$$;

revoke all on function private.prevent_student_request_edits() from public;

create trigger prevent_student_request_edits
before update on public.service_requests
for each row execute function private.prevent_student_request_edits();
