-- Run with `supabase test db` against a local Supabase stack after applying migrations.
begin;
create extension if not exists pgtap with schema extensions;
select extensions.plan(6);

-- Auth user creation fires the normal profile + student-role trigger.
insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values
 ('10000000-0000-4000-8000-000000000001','authenticated','authenticated','rls-a@example.test','',now(),'{}','{"full_name":"Test Student A"}',now(),now()),
 ('10000000-0000-4000-8000-000000000002','authenticated','authenticated','rls-b@example.test','',now(),'{}','{"full_name":"Test Student B"}',now(),now());

insert into public.service_requests(student_id,subject,description)
values
 ('10000000-0000-4000-8000-000000000001','Private A request','A request that belongs only to student A.'),
 ('10000000-0000-4000-8000-000000000002','Private B request','A request that belongs only to student B.');

set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
select extensions.is((select count(*)::int from public.service_requests),1,'Student A sees only their own request');
select extensions.is((select count(*)::int from public.service_requests where subject='Private B request'),0,'Student A cannot fetch student B request by identifier or filter');
select extensions.is((with changed as (update public.service_requests set status='completed' where subject='Private A request' returning 1) select count(*)::int from changed),0,'Student cannot approve or complete their request');
select extensions.throws_ok($$insert into public.user_roles(user_id,role) values ('10000000-0000-4000-8000-000000000001','admin')$$,'42501',null,'Student cannot grant an elevated role');

select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',true);
select extensions.is((select count(*)::int from public.service_requests),1,'Student B sees only their own request');
select extensions.is((select count(*)::int from public.service_requests where subject='Private A request'),0,'Student B cannot read student A request');

select * from extensions.finish();
rollback;
