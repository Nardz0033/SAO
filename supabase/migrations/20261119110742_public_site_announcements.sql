-- Let signed-out visitors see only public, published campus announcements.
grant select (id, title, content, category, published_at, is_pinned)
  on public.announcements to anon;

create policy "public site reads public announcements"
  on public.announcements for select to anon
  using (
    status = 'published'
    and audience = 'all'
    and (expires_at is null or expires_at > now())
  );
