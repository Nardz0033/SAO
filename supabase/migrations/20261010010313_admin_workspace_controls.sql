-- Permit trusted administrators to manage user role assignments through the app.
-- Regular admins may grant/revoke staff only; super admins manage elevated roles.
create or replace function private.has_other_super_admin(excluded_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.user_roles current_user_role
    where current_user_role.user_id = (select auth.uid())
      and current_user_role.role = 'super_admin'
  ) and exists (
    select 1 from public.user_roles
    where role = 'super_admin' and user_id <> excluded_user_id
  )
$$;
revoke all on function private.has_other_super_admin(uuid) from public;
grant execute on function private.has_other_super_admin(uuid) to authenticated;

create or replace function private.has_other_role(target_user_id uuid, excluded_role public.app_role)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.user_roles current_user_role
    where current_user_role.user_id = (select auth.uid())
      and current_user_role.role in ('admin', 'super_admin')
  ) and exists (
    select 1 from public.user_roles
    where user_id = target_user_id and role <> excluded_role
  )
$$;
revoke all on function private.has_other_role(uuid, public.app_role) from public;
grant execute on function private.has_other_role(uuid, public.app_role) to authenticated;

create policy "admins assign staff roles"
on public.user_roles for insert to authenticated
with check (
  user_id <> (select auth.uid())
  and (
    (role = 'staff' and (select private.has_role('admin')))
    or (select private.has_role('super_admin'))
  )
);

create policy "admins remove staff roles"
on public.user_roles for delete to authenticated
using (
  user_id <> (select auth.uid())
  and (select private.has_other_role(user_roles.user_id, user_roles.role))
  and (
    (role = 'staff' and (select private.has_role('admin')))
    or (
      (select private.has_role('super_admin'))
      and (role <> 'super_admin' or (select private.has_other_super_admin(user_roles.user_id)))
    )
  )
);

grant insert, delete on public.user_roles to authenticated;

-- Administrators can maintain staff availability; staff retain their existing
-- self-management policies.
create policy "admins manage staff availability"
on public.staff_availability for all to authenticated
using ((select private.has_role('admin')) or (select private.has_role('super_admin')))
with check (
  ((select private.has_role('admin')) or (select private.has_role('super_admin')))
  and exists (
    select 1 from public.user_roles staff_role
    where staff_role.user_id = staff_availability.staff_id
      and staff_role.role = 'staff'
  )
);

grant delete on public.staff_availability to authenticated;

-- Capture the key actions exposed by the administration screens.
create or replace function private.audit_admin_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_id uuid;
  row_data jsonb;
begin
  row_data := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  target_id := (row_data ->> tg_argv[0])::uuid;
  insert into public.audit_logs(actor_id, action, entity_type, entity_id, metadata)
  values (
    (select auth.uid()),
    lower(tg_op),
    tg_table_name,
    target_id,
    case
      when tg_table_name = 'user_roles' then jsonb_build_object('user_id', row_data ->> 'user_id', 'role', row_data ->> 'role')
      when tg_table_name = 'service_categories' then jsonb_build_object('name', row_data ->> 'name', 'is_active', row_data ->> 'is_active')
      else jsonb_build_object('staff_id', row_data ->> 'staff_id', 'available_date', row_data ->> 'available_date')
    end
  );
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;
revoke all on function private.audit_admin_change() from public;

create trigger audit_user_role_changes
after insert or delete on public.user_roles
for each row execute function private.audit_admin_change('user_id');
create trigger audit_service_category_changes
after insert or update or delete on public.service_categories
for each row execute function private.audit_admin_change('id');
create trigger audit_staff_availability_changes
after insert or update or delete on public.staff_availability
for each row execute function private.audit_admin_change('id');
