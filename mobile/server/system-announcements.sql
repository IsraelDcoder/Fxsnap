create table if not exists public.fxsnap_system_announcements (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('product', 'maintenance', 'educational', 'urgent')),
  title text not null check (char_length(title) between 1 and 100),
  message text not null check (char_length(message) between 1 and 2000),
  destination text not null check (destination in ('home', 'community', 'analysis', 'events', 'profile', 'notification_center')),
  destination_params jsonb not null default '{}'::jsonb check (jsonb_typeof(destination_params) = 'object'),
  audience text not null check (audience in ('all', 'recently_active')),
  audience_days integer not null default 30 check (audience_days between 1 and 365),
  channels jsonb not null check (
    jsonb_typeof(channels) = 'object'
    and channels ?& array['in_app_banner', 'notification_center', 'push']
    and jsonb_typeof(channels->'in_app_banner') = 'boolean'
    and jsonb_typeof(channels->'notification_center') = 'boolean'
    and jsonb_typeof(channels->'push') = 'boolean'
    and (
      channels->'in_app_banner' = 'true'::jsonb
      or channels->'notification_center' = 'true'::jsonb
      or channels->'push' = 'true'::jsonb
    )
  ),
  status text not null default 'draft' check (status in ('draft', 'published', 'cancelled')),
  idempotency_key uuid not null,
  created_by uuid not null references auth.users(id) on delete restrict,
  recipient_count integer not null default 0 check (recipient_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz,
  expires_at timestamptz not null default (now() + interval '30 days'),
  unique (created_by, idempotency_key)
);

alter table public.fxsnap_system_announcements
  add column if not exists destination_params jsonb not null default '{}'::jsonb
  check (jsonb_typeof(destination_params) = 'object');

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.fxsnap_system_announcements'::regclass
      and conname = 'fxsnap_system_announcement_destination_params_check'
  ) then
    alter table public.fxsnap_system_announcements
      add constraint fxsnap_system_announcement_destination_params_check
      check (
        destination_params = '{}'::jsonb
        or (
          destination = 'community'
        and destination_params = jsonb_build_object('postId', destination_params->'postId')
          and jsonb_typeof(destination_params->'postId') = 'string'
          and (destination_params->>'postId') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        )
      );
  end if;
end;
$$;

create index if not exists fxsnap_system_announcements_status_idx
  on public.fxsnap_system_announcements (status, published_at desc);

create table if not exists public.fxsnap_system_announcement_recipients (
  announcement_id uuid not null references public.fxsnap_system_announcements(id) on delete cascade,
  recipient_supabase_user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  banner_dismissed_at timestamptz,
  primary key (announcement_id, recipient_supabase_user_id)
);

create index if not exists fxsnap_system_announcement_recipients_user_idx
  on public.fxsnap_system_announcement_recipients (recipient_supabase_user_id, created_at desc);

create table if not exists public.fxsnap_system_announcement_push_queue (
  id uuid primary key default gen_random_uuid(),
  announcement_id uuid not null references public.fxsnap_system_announcements(id) on delete cascade,
  device_id text not null references public.fxsnap_push_devices(device_id) on delete cascade,
  status text not null default 'queued' check (status in ('queued', 'sending', 'accepted', 'delivered', 'failed', 'cancelled')),
  attempts integer not null default 0 check (attempts >= 0),
  next_attempt_at timestamptz not null default now(),
  ticket_id text,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (announcement_id, device_id)
);

create index if not exists fxsnap_system_announcement_push_queue_ready_idx
  on public.fxsnap_system_announcement_push_queue (next_attempt_at, created_at)
  where status = 'queued';

create table if not exists public.fxsnap_system_announcement_push_receipts (
  receipt_id text primary key,
  push_job_id uuid not null references public.fxsnap_system_announcement_push_queue(id) on delete cascade,
  device_id text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.fxsnap_system_announcement_audit (
  id bigint generated always as identity primary key,
  announcement_id uuid not null references public.fxsnap_system_announcements(id) on delete cascade,
  actor_supabase_user_id uuid not null references auth.users(id) on delete restrict,
  action text not null check (action in ('draft_created', 'draft_updated', 'published', 'cancelled')),
  created_at timestamptz not null default now()
);

alter table public.fxsnap_system_announcements enable row level security;
alter table public.fxsnap_system_announcement_recipients enable row level security;
alter table public.fxsnap_system_announcement_push_queue enable row level security;
alter table public.fxsnap_system_announcement_push_receipts enable row level security;
alter table public.fxsnap_system_announcement_audit enable row level security;

revoke all on public.fxsnap_system_announcements from anon, authenticated;
revoke all on public.fxsnap_system_announcement_recipients from anon, authenticated;
revoke all on public.fxsnap_system_announcement_push_queue from anon, authenticated;
revoke all on public.fxsnap_system_announcement_push_receipts from anon, authenticated;
revoke all on public.fxsnap_system_announcement_audit from anon, authenticated;
grant all on public.fxsnap_system_announcements to service_role;
grant all on public.fxsnap_system_announcement_recipients to service_role;
grant all on public.fxsnap_system_announcement_push_queue to service_role;
grant all on public.fxsnap_system_announcement_push_receipts to service_role;
grant all on public.fxsnap_system_announcement_audit to service_role;

drop policy if exists "Users can receive their own system announcement events"
  on public.fxsnap_system_announcement_recipients;
create policy "Users can receive their own system announcement events"
  on public.fxsnap_system_announcement_recipients for select to authenticated
  using (recipient_supabase_user_id = (select auth.uid()));
grant select on public.fxsnap_system_announcement_recipients to authenticated;
alter table public.fxsnap_system_announcement_recipients replica identity full;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
    and not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'fxsnap_system_announcement_recipients'
    ) then
    alter publication supabase_realtime
      add table public.fxsnap_system_announcement_recipients;
  end if;
end;
$$;

create or replace function public.fxsnap_system_announcement_audience_count(
  p_audience text,
  p_audience_days integer default 30
)
returns bigint
language sql
security definer
set search_path = ''
as $$
  select count(*)
  from auth.users u
  where u.deleted_at is null
    and (u.banned_until is null or u.banned_until <= now())
    and coalesce(u.is_anonymous, false) = false
    and (
      p_audience = 'all'
      or (
        p_audience = 'recently_active'
        and p_audience_days between 1 and 365
        and u.last_sign_in_at >= now() - make_interval(days => p_audience_days)
      )
    );
$$;

create or replace function public.fxsnap_system_announcement_enqueue(p_announcement_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  announcement public.fxsnap_system_announcements%rowtype;
  added_recipients integer;
begin
  select * into announcement
  from public.fxsnap_system_announcements
  where id = p_announcement_id
  for update;

  if not found or announcement.status <> 'published' then
    raise exception 'Announcement is not published';
  end if;

  insert into public.fxsnap_system_announcement_recipients (
    announcement_id, recipient_supabase_user_id
  )
  select announcement.id, u.id
  from auth.users u
  where u.deleted_at is null
    and (u.banned_until is null or u.banned_until <= now())
    and coalesce(u.is_anonymous, false) = false
    and (
      announcement.audience = 'all'
      or (
        announcement.audience = 'recently_active'
        and u.last_sign_in_at >= now() - make_interval(days => announcement.audience_days)
      )
    )
  on conflict (announcement_id, recipient_supabase_user_id) do nothing;

  get diagnostics added_recipients = row_count;

  if announcement.channels->'push' = 'true'::jsonb then
    insert into public.fxsnap_system_announcement_push_queue (announcement_id, device_id)
    select announcement.id, d.device_id
    from public.fxsnap_system_announcement_recipients r
    join public.fxsnap_push_devices d
      on d.supabase_user_id = r.recipient_supabase_user_id
    where r.announcement_id = announcement.id
      and coalesce(d.preferences->>'systemAnnouncements', 'true') <> 'false'
      and coalesce(d.preferences->>'enabled', 'true') <> 'false'
      and nullif(d.expo_token, '') is not null
    on conflict (announcement_id, device_id) do nothing;
  end if;

  update public.fxsnap_system_announcements
  set recipient_count = (
    select count(*)::integer
    from public.fxsnap_system_announcement_recipients
    where announcement_id = announcement.id
  ),
  updated_at = now()
  where id = announcement.id;

  return added_recipients;
end;
$$;

create or replace function public.fxsnap_system_announcement_save(
  p_actor_supabase_user_id uuid,
  p_idempotency_key uuid,
  p_input jsonb
)
returns public.fxsnap_system_announcements
language plpgsql
security definer
set search_path = ''
as $$
declare
  saved public.fxsnap_system_announcements%rowtype;
begin
  insert into public.fxsnap_system_announcements (
    type, title, message, destination, destination_params, audience, audience_days, channels,
    idempotency_key, created_by
  ) values (
    p_input->>'type',
    p_input->>'title',
    p_input->>'message',
    p_input->>'destination',
    coalesce(p_input->'destinationParams', '{}'::jsonb),
    p_input->>'audience',
    coalesce((p_input->>'audienceDays')::integer, 30),
    p_input->'channels',
    p_idempotency_key,
    p_actor_supabase_user_id
  )
  on conflict (created_by, idempotency_key) do nothing
  returning * into saved;

  if not found then
    select * into saved from public.fxsnap_system_announcements
    where created_by = p_actor_supabase_user_id
      and idempotency_key = p_idempotency_key;
    return saved;
  end if;

  insert into public.fxsnap_system_announcement_audit (
    announcement_id, actor_supabase_user_id, action
  ) values (saved.id, p_actor_supabase_user_id, 'draft_created');

  return saved;
end;
$$;

create or replace function public.fxsnap_system_announcement_transition(
  p_announcement_id uuid,
  p_actor_supabase_user_id uuid,
  p_action text,
  p_input jsonb default null
)
returns public.fxsnap_system_announcements
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_announcement public.fxsnap_system_announcements%rowtype;
  saved public.fxsnap_system_announcements%rowtype;
  audit_action text;
begin
  select * into current_announcement
  from public.fxsnap_system_announcements
  where id = p_announcement_id
  for update;

  if not found then raise exception 'Announcement not found'; end if;
  if current_announcement.status = 'cancelled' then
    return current_announcement;
  end if;

  if p_action = 'update' then
    if current_announcement.status <> 'draft' then
      raise exception 'Only drafts can be edited';
    end if;
    update public.fxsnap_system_announcements
    set type = p_input->>'type',
        title = p_input->>'title',
        message = p_input->>'message',
        destination = p_input->>'destination',
        destination_params = coalesce(p_input->'destinationParams', '{}'::jsonb),
        audience = p_input->>'audience',
        audience_days = coalesce((p_input->>'audienceDays')::integer, 30),
        channels = p_input->'channels',
        updated_at = now()
    where id = p_announcement_id
    returning * into saved;
    audit_action := 'draft_updated';
  elsif p_action = 'publish' then
    if current_announcement.status = 'draft' then
      update public.fxsnap_system_announcements
      set status = 'published', published_at = now(), expires_at = now() + interval '30 days', updated_at = now()
      where id = p_announcement_id
      returning * into saved;
      perform public.fxsnap_system_announcement_enqueue(p_announcement_id);
      select * into saved from public.fxsnap_system_announcements
      where id = p_announcement_id;
      audit_action := 'published';
    else
      return current_announcement;
    end if;
  elsif p_action = 'cancel' then
    update public.fxsnap_system_announcements
    set status = 'cancelled', updated_at = now()
    where id = p_announcement_id
    returning * into saved;
    update public.fxsnap_system_announcement_push_queue
    set status = 'cancelled', updated_at = now()
    where announcement_id = p_announcement_id and status = 'queued';
    audit_action := 'cancelled';
  else
    raise exception 'Unsupported announcement action';
  end if;

  insert into public.fxsnap_system_announcement_audit (
    announcement_id, actor_supabase_user_id, action
  ) values (p_announcement_id, p_actor_supabase_user_id, audit_action);
  return saved;
end;
$$;

create or replace function public.fxsnap_system_announcement_inbox(p_user_id uuid)
returns table (
  id uuid,
  type text,
  title text,
  message text,
  destination text,
  destination_params jsonb,
  channels jsonb,
  published_at timestamptz,
  created_at timestamptz,
  read_at timestamptz,
  banner_dismissed_at timestamptz
)
language sql
security definer
set search_path = ''
as $$
  select a.id, a.type, a.title, a.message, a.destination, a.destination_params, a.channels,
         a.published_at, r.created_at, r.read_at, r.banner_dismissed_at
  from public.fxsnap_system_announcement_recipients r
  join public.fxsnap_system_announcements a on a.id = r.announcement_id
  where r.recipient_supabase_user_id = p_user_id
    and a.status = 'published'
    and a.expires_at > now()
  order by a.published_at desc
  limit 100;
$$;

create or replace function public.fxsnap_system_announcement_admin_list()
returns table (
  id uuid,
  type text,
  title text,
  message text,
  destination text,
  destination_params jsonb,
  audience text,
  audience_days integer,
  channels jsonb,
  status text,
  recipient_count integer,
  created_at timestamptz,
  published_at timestamptz,
  push_queued bigint,
  push_accepted bigint,
  push_delivered bigint,
  push_failed bigint,
  read_count bigint
)
language sql
security definer
set search_path = ''
as $$
  select a.id, a.type, a.title, a.message, a.destination, a.destination_params, a.audience,
         a.audience_days, a.channels, a.status, a.recipient_count,
         a.created_at, a.published_at,
         coalesce(push.push_queued, 0), coalesce(push.push_accepted, 0),
         coalesce(push.push_delivered, 0), coalesce(push.push_failed, 0),
         coalesce(reads.read_count, 0)
  from public.fxsnap_system_announcements a
  left join lateral (
    select count(*) filter (where q.status = 'queued') as push_queued,
           count(*) filter (where q.status = 'accepted') as push_accepted,
           count(*) filter (where q.status = 'delivered') as push_delivered,
           count(*) filter (where q.status = 'failed') as push_failed
    from public.fxsnap_system_announcement_push_queue q
    where q.announcement_id = a.id
  ) push on true
  left join lateral (
    select count(*) filter (where r.read_at is not null) as read_count
    from public.fxsnap_system_announcement_recipients r
    where r.announcement_id = a.id
  ) reads on true
  order by a.created_at desc
  limit 100;
$$;

create or replace function public.fxsnap_system_announcement_claim_push_jobs(p_limit integer default 100)
returns table (id uuid, announcement_id uuid, device_id text, attempts integer)
language sql
security definer
set search_path = ''
as $$
  with expired as (
    update public.fxsnap_system_announcement_push_queue q
    set status = 'cancelled', last_error = 'Announcement expired before delivery.', updated_at = now()
    from public.fxsnap_system_announcements a
    where a.id = q.announcement_id
      and a.expires_at <= now()
      and q.status in ('queued', 'sending')
    returning q.id
  ), candidates as (
    select q.id
    from public.fxsnap_system_announcement_push_queue q
    join public.fxsnap_system_announcements a on a.id = q.announcement_id
    where q.status = 'sending'
      and q.updated_at < now() - interval '10 minutes'
      and q.attempts < 5
      and a.expires_at > now()
    for update of q skip locked
  ), recovered as (
    update public.fxsnap_system_announcement_push_queue q
    set status = 'queued', next_attempt_at = now(), updated_at = now()
    from candidates c
    where q.id = c.id
    returning q.id
  ), exhausted as (
    update public.fxsnap_system_announcement_push_queue q
    set status = 'failed', last_error = 'Push delivery exceeded its retry limit.', updated_at = now()
    from public.fxsnap_system_announcements a
    where q.status = 'sending'
      and a.id = q.announcement_id
      and q.updated_at < now() - interval '10 minutes'
      and q.attempts >= 5
      and a.expires_at > now()
    returning q.id
  ), ready as (
    select q.id
    from public.fxsnap_system_announcement_push_queue q
    join public.fxsnap_system_announcements a on a.id = q.announcement_id
    where q.status = 'queued'
      and q.next_attempt_at <= now()
      and a.status = 'published'
      and a.expires_at > now()
      and q.attempts < 5
    order by q.created_at
    for update of q skip locked
    limit greatest(1, least(coalesce(p_limit, 100), 100))
  )
  update public.fxsnap_system_announcement_push_queue q
  set status = 'sending', attempts = q.attempts + 1, updated_at = now()
  from ready c
  where q.id = c.id
  returning q.id, q.announcement_id, q.device_id, q.attempts;
$$;

create or replace function public.fxsnap_system_announcement_finish_push_job(
  p_id uuid,
  p_ticket_id text default null,
  p_error text default null,
  p_retryable boolean default true,
  p_cancelled boolean default false
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.fxsnap_system_announcement_push_queue
  set status = case
        when p_cancelled then 'cancelled'
        when p_ticket_id is not null then 'accepted'
        when p_retryable and attempts < 5 then 'queued'
        else 'failed'
      end,
      ticket_id = p_ticket_id,
      last_error = left(p_error, 500),
      next_attempt_at = case
        when p_ticket_id is not null then now()
        else now() + make_interval(mins => least(60, power(2, attempts)::integer * 2))
      end,
      updated_at = now()
  where id = p_id and status = 'sending';
end;
$$;

create or replace function public.fxsnap_system_announcement_accept_push_job(
  p_id uuid,
  p_ticket_id text,
  p_device_id text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform 1
  from public.fxsnap_system_announcement_push_queue
  where id = p_id and device_id = p_device_id and status = 'sending'
  for update;
  if not found then return false; end if;

  insert into public.fxsnap_system_announcement_push_receipts (
    receipt_id, push_job_id, device_id
  ) values (
    p_ticket_id, p_id, p_device_id
  )
  on conflict (receipt_id) do nothing;

  update public.fxsnap_system_announcement_push_queue
  set status = 'accepted', ticket_id = p_ticket_id, last_error = null, updated_at = now()
  where id = p_id and device_id = p_device_id and status = 'sending';

  return found;
end;
$$;

revoke all on function public.fxsnap_system_announcement_audience_count(text, integer) from public, anon, authenticated;
revoke all on function public.fxsnap_system_announcement_enqueue(uuid) from public, anon, authenticated;
revoke all on function public.fxsnap_system_announcement_save(uuid, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.fxsnap_system_announcement_transition(uuid, uuid, text, jsonb) from public, anon, authenticated;
revoke all on function public.fxsnap_system_announcement_inbox(uuid) from public, anon, authenticated;
revoke all on function public.fxsnap_system_announcement_admin_list() from public, anon, authenticated;
revoke all on function public.fxsnap_system_announcement_claim_push_jobs(integer) from public, anon, authenticated;
revoke all on function public.fxsnap_system_announcement_finish_push_job(uuid, text, text, boolean, boolean) from public, anon, authenticated;
revoke all on function public.fxsnap_system_announcement_accept_push_job(uuid, text, text) from public, anon, authenticated;
grant execute on function public.fxsnap_system_announcement_audience_count(text, integer) to service_role;
grant execute on function public.fxsnap_system_announcement_enqueue(uuid) to service_role;
grant execute on function public.fxsnap_system_announcement_save(uuid, uuid, jsonb) to service_role;
grant execute on function public.fxsnap_system_announcement_transition(uuid, uuid, text, jsonb) to service_role;
grant execute on function public.fxsnap_system_announcement_inbox(uuid) to service_role;
grant execute on function public.fxsnap_system_announcement_admin_list() to service_role;
grant execute on function public.fxsnap_system_announcement_claim_push_jobs(integer) to service_role;
grant execute on function public.fxsnap_system_announcement_finish_push_job(uuid, text, text, boolean, boolean) to service_role;
grant execute on function public.fxsnap_system_announcement_accept_push_job(uuid, text, text) to service_role;

update public.fxsnap_push_devices
set preferences = jsonb_set(coalesce(preferences, '{}'::jsonb), '{systemAnnouncements}', 'true'::jsonb, true)
where not (coalesce(preferences, '{}'::jsonb) ? 'systemAnnouncements');

alter table public.fxsnap_push_devices
  alter column preferences set default
  '{"dailyBrief": true, "inactivity": true, "weekly": true, "community": true, "systemAnnouncements": true}'::jsonb;
