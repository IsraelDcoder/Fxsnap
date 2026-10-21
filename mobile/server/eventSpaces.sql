create table if not exists public.fxsnap_event_spaces (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(title) between 3 and 100),
  description text not null default '' check (length(description) <= 1200),
  topic text not null check (length(topic) between 2 and 48),
  visibility text not null default 'public' check (visibility in ('public', 'private')),
  status text not null default 'draft' check (
    status in ('draft', 'scheduled', 'waiting_room_open', 'live', 'ended', 'cancelled', 'archived')
  ),
  host_account_id text not null,
  host_name text not null,
  host_picture_url text,
  scheduled_at timestamptz,
  timezone text not null default 'UTC',
  waiting_room_opens_at timestamptz,
  duration_minutes integer check (duration_minutes is null or duration_minutes between 5 and 480),
  allow_speaking_requests boolean not null default false,
  comments_enabled boolean not null default true,
  featured boolean not null default false,
  created_by_account_id text not null,
  cancellation_reason text,
  cancelled_at timestamptz,
  archived_at timestamptz,
  actual_started_at timestamptz,
  actual_ended_at timestamptz,
  livekit_room_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint fxsnap_event_space_schedule_check check (
    scheduled_at is null or waiting_room_opens_at is null or waiting_room_opens_at <= scheduled_at
  )
);

alter table public.fxsnap_event_spaces
  add column if not exists livekit_room_name text;
create unique index if not exists fxsnap_event_spaces_livekit_room_name_idx
  on public.fxsnap_event_spaces (livekit_room_name)
  where livekit_room_name is not null;

create index if not exists fxsnap_event_spaces_public_schedule_idx
  on public.fxsnap_event_spaces (scheduled_at asc)
  where visibility = 'public' and status in ('scheduled', 'waiting_room_open', 'live');
create index if not exists fxsnap_event_spaces_admin_status_idx
  on public.fxsnap_event_spaces (status, updated_at desc);

alter table public.fxsnap_event_spaces enable row level security;
revoke all on public.fxsnap_event_spaces from anon, authenticated;
grant select on public.fxsnap_event_spaces to authenticated;
grant all on public.fxsnap_event_spaces to service_role;

drop policy if exists fxsnap_event_spaces_public_read on public.fxsnap_event_spaces;
create policy fxsnap_event_spaces_public_read on public.fxsnap_event_spaces
  for select to authenticated
  using (visibility = 'public' and status in ('scheduled', 'waiting_room_open', 'live'));

create table if not exists public.fxsnap_event_participants (
  event_space_id uuid not null references public.fxsnap_event_spaces(id) on delete cascade,
  account_id text not null,
  display_name text not null,
  livekit_identity text not null,
  status text not null check (
    status in ('waiting', 'listener', 'speaker_requested', 'speaker', 'removed')
  ),
  joined_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (event_space_id, account_id)
);

create index if not exists fxsnap_event_participants_space_status_idx
  on public.fxsnap_event_participants (event_space_id, status, joined_at);

alter table public.fxsnap_event_participants enable row level security;
revoke all on public.fxsnap_event_participants from anon, authenticated;
grant all on public.fxsnap_event_participants to service_role;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'fxsnap_event_spaces'
  ) then
    alter publication supabase_realtime add table public.fxsnap_event_spaces;
  end if;
end
$$;
