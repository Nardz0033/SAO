alter table public.events
  add column semester text;

alter table public.events
  add constraint events_semester_check
  check (semester is null or semester in ('1st Semester', '2nd Semester'));

update public.events e
set semester = case lower(trim(s.name))
  when '1st semester' then '1st Semester'
  when 'first semester' then '1st Semester'
  when '2nd semester' then '2nd Semester'
  when 'second semester' then '2nd Semester'
  else null
end
from public.academic_semesters s
where e.semester_id = s.id
  and lower(trim(s.name)) in ('1st semester', 'first semester', '2nd semester', 'second semester');
