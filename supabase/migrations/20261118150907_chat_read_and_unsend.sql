alter table public.private_messages
  add column unsent_at timestamptz;

alter table public.system_chat_messages
  add column unsent_at timestamptz;

create policy "senders unsend own private messages"
on public.private_messages for update to authenticated
using (sender_id = (select auth.uid()) and unsent_at is null)
with check (sender_id = (select auth.uid()) and unsent_at is not null);

grant update (body, unsent_at) on public.private_messages to authenticated;

create or replace function private.validate_private_message_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.sender_id = (select auth.uid()) then
    if old.unsent_at is not null
       or new.unsent_at is null
       or new.body is distinct from 'This message was unsent.'
       or new.read_at is distinct from old.read_at
       or new.id is distinct from old.id
       or new.conversation_id is distinct from old.conversation_id
       or new.sender_id is distinct from old.sender_id
       or new.created_at is distinct from old.created_at then
      raise exception using errcode = '42501', message = 'Senders may only unsend their own messages.';
    end if;
  else
    if old.unsent_at is not null
       or new.unsent_at is distinct from old.unsent_at
       or new.body is distinct from old.body
       or old.read_at is not null
       or new.read_at is null
       or new.id is distinct from old.id
       or new.conversation_id is distinct from old.conversation_id
       or new.sender_id is distinct from old.sender_id
       or new.created_at is distinct from old.created_at then
      raise exception using errcode = '42501', message = 'Recipients may only mark unread messages as read.';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function private.validate_private_message_update() from public;
create trigger validate_private_message_update
before update on public.private_messages
for each row execute function private.validate_private_message_update();

create policy "senders unsend own campus messages"
on public.system_chat_messages for update to authenticated
using (sender_id = (select auth.uid()) and unsent_at is null)
with check (sender_id = (select auth.uid()) and unsent_at is not null);

grant update (body, unsent_at) on public.system_chat_messages to authenticated;

create or replace function private.validate_campus_message_unsend()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.sender_id is distinct from (select auth.uid())
     or old.unsent_at is not null
     or new.unsent_at is null
     or new.body is distinct from 'This message was unsent.'
     or new.id is distinct from old.id
     or new.sender_id is distinct from old.sender_id
     or new.created_at is distinct from old.created_at then
    raise exception using errcode = '42501', message = 'Senders may only unsend their own campus messages.';
  end if;

  return new;
end;
$$;

revoke all on function private.validate_campus_message_unsend() from public;
create trigger validate_campus_message_unsend
before update on public.system_chat_messages
for each row execute function private.validate_campus_message_unsend();

create or replace view public.system_chat_feed with (security_invoker = false) as
  select m.id, m.sender_id, coalesce(p.full_name, 'SAO user') as sender_name,
    coalesce((select r.role::text from public.user_roles r where r.user_id = m.sender_id order by case r.role when 'admin' then 1 when 'super_admin' then 2 when 'staff' then 3 else 4 end limit 1),'student') as sender_role,
    m.body, m.created_at, m.unsent_at
  from public.system_chat_messages m join public.profiles p on p.id = m.sender_id
  where (select auth.uid()) is not null;
