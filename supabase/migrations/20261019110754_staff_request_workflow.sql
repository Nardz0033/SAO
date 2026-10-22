-- Let staff see incoming unassigned requests so they can claim cases.
create policy "staff read unassigned requests"
on public.service_requests for select to authenticated
using (assigned_staff_id is null and (select private.has_role('staff')));

-- Staff may claim only unassigned requests, and the resulting assignee must be
-- the authenticated staff member. Admin assignment remains governed by the
-- existing administrator update policy.
create policy "staff claim unassigned requests"
on public.service_requests for update to authenticated
using (assigned_staff_id is null and (select private.has_role('staff')))
with check (assigned_staff_id = (select auth.uid()) and (select private.has_role('staff')));
