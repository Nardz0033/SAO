-- Permit the trusted Auth deletion endpoint to remove an account while keeping
-- useful operational history where attribution can safely become anonymous.
alter table public.service_requests drop constraint if exists service_requests_student_id_fkey;
alter table public.service_requests add constraint service_requests_student_id_fkey
  foreign key (student_id) references public.profiles(id) on delete cascade;
alter table public.service_requests drop constraint if exists service_requests_assigned_staff_id_fkey;
alter table public.service_requests add constraint service_requests_assigned_staff_id_fkey
  foreign key (assigned_staff_id) references public.profiles(id) on delete set null;

alter table public.request_status_history drop constraint if exists request_status_history_changed_by_fkey;
alter table public.request_status_history add constraint request_status_history_changed_by_fkey
  foreign key (changed_by) references public.profiles(id) on delete set null;
alter table public.request_attachments alter column uploaded_by drop not null;
alter table public.request_attachments drop constraint if exists request_attachments_uploaded_by_fkey;
alter table public.request_attachments add constraint request_attachments_uploaded_by_fkey
  foreign key (uploaded_by) references public.profiles(id) on delete set null;

alter table public.announcements alter column author_id drop not null;
alter table public.announcements drop constraint if exists announcements_author_id_fkey;
alter table public.announcements add constraint announcements_author_id_fkey
  foreign key (author_id) references public.profiles(id) on delete set null;
alter table public.staff_availability drop constraint if exists staff_availability_staff_id_fkey;
alter table public.staff_availability add constraint staff_availability_staff_id_fkey
  foreign key (staff_id) references public.profiles(id) on delete cascade;

alter table public.appointments drop constraint if exists appointments_student_id_fkey;
alter table public.appointments add constraint appointments_student_id_fkey
  foreign key (student_id) references public.profiles(id) on delete cascade;
alter table public.appointments drop constraint if exists appointments_staff_id_fkey;
alter table public.appointments add constraint appointments_staff_id_fkey
  foreign key (staff_id) references public.profiles(id) on delete set null;
alter table public.feedback drop constraint if exists feedback_student_id_fkey;
alter table public.feedback add constraint feedback_student_id_fkey
  foreign key (student_id) references public.profiles(id) on delete cascade;

alter table public.events alter column created_by drop not null;
alter table public.events drop constraint if exists events_created_by_fkey;
alter table public.events add constraint events_created_by_fkey
  foreign key (created_by) references public.profiles(id) on delete set null;
alter table public.service_documents alter column created_by drop not null;
alter table public.service_documents drop constraint if exists service_documents_created_by_fkey;
alter table public.service_documents add constraint service_documents_created_by_fkey
  foreign key (created_by) references public.profiles(id) on delete set null;

-- Delete owned conversations and retain audit entries without the deleted actor.
alter table public.audit_logs drop constraint if exists audit_logs_actor_id_fkey;
alter table public.audit_logs add constraint audit_logs_actor_id_fkey
  foreign key (actor_id) references public.profiles(id) on delete set null;
alter table public.messaging_settings drop constraint if exists messaging_settings_updated_by_fkey;
alter table public.messaging_settings add constraint messaging_settings_updated_by_fkey
  foreign key (updated_by) references public.profiles(id) on delete set null;
