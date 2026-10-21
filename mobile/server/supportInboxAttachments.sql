-- Apply after supportInbox.sql. Support media is private and can only be
-- uploaded/read through the authenticated FXSnap server API.

alter table public.fxsnap_support_messages
  add column if not exists attachment_path text,
  add column if not exists attachment_content_type text
    check (attachment_content_type is null or attachment_content_type in ('image/jpeg', 'image/png', 'image/webp'));

alter table public.fxsnap_support_messages
  drop constraint if exists fxsnap_support_messages_body_check;

alter table public.fxsnap_support_messages
  add constraint fxsnap_support_messages_body_check
  check (
    (length(body) between 1 and 2000)
    or (length(body) = 0 and attachment_path is not null)
  );

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'fxsnap-support-media',
  'fxsnap-support-media',
  false,
  3145728,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;
