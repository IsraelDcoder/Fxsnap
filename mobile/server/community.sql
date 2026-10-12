-- FXSnap Community data model.
-- Apply with the Supabase service role migrations before enabling the feature.

create table if not exists public.fxsnap_community_profiles (
  account_id text primary key,
  supabase_user_id uuid not null unique,
  username text not null,
  picture_url text,
  accepted_rules_version text not null,
  status text not null default 'active' check (status in ('active', 'muted', 'suspended', 'banned')),
  muted_until timestamptz,
  joined_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint fxsnap_community_username_format check (username ~ '^[a-z0-9_]{3,24}$')
);
alter table public.fxsnap_community_profiles
  add column if not exists picture_url text;
create unique index if not exists fxsnap_community_username_lower_unique
  on public.fxsnap_community_profiles (lower(username));

create table if not exists public.fxsnap_community_messages (
  id uuid primary key default gen_random_uuid(),
  account_id text not null,
  author_username text not null,
  is_official boolean not null default false,
  kind text not null check (kind in ('text', 'signal', 'analysis', 'announcement')),
  category text check (category in ('market_discussion', 'learning', 'chart_analysis', 'questions', 'events')),
  body text not null default '',
  payload jsonb not null default '{}'::jsonb,
  reply_to_id uuid references public.fxsnap_community_messages(id) on delete set null,
  client_message_id uuid not null,
  pinned_at timestamptz,
  pinned_by text,
  removed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint fxsnap_community_message_client_id_unique unique (account_id, client_message_id),
  constraint fxsnap_community_message_content check (
    length(body) <= 2000 and octet_length(body) <= 8000
  )
);
create index if not exists fxsnap_community_messages_created_idx
  on public.fxsnap_community_messages (created_at desc, id desc);
create index if not exists fxsnap_community_messages_author_idx
  on public.fxsnap_community_messages (account_id, created_at desc);

create or replace function public.fxsnap_community_comment_counts(p_message_ids uuid[])
returns table(message_id uuid, comment_count bigint)
language sql
security definer
set search_path = public
as $$
  select requested.id, count(distinct comment.id) + count(distinct reply.id)
  from unnest(p_message_ids) as requested(id)
  left join public.fxsnap_community_messages comment
    on comment.reply_to_id = requested.id and comment.removed_at is null
  left join public.fxsnap_community_messages reply
    on reply.reply_to_id = comment.id and reply.removed_at is null
  group by requested.id;
$$;
revoke all on function public.fxsnap_community_comment_counts(uuid[]) from public, anon, authenticated;
grant execute on function public.fxsnap_community_comment_counts(uuid[]) to service_role;

create table if not exists public.fxsnap_community_reactions (
  message_id uuid not null references public.fxsnap_community_messages(id) on delete cascade,
  account_id text not null,
  reaction text not null check (reaction in ('like', 'helpful', 'insightful', 'interesting')),
  created_at timestamptz not null default now(),
  primary key (message_id, account_id, reaction)
);

create table if not exists public.fxsnap_community_follows (
  follower_account_id text not null,
  followed_account_id text not null,
  created_at timestamptz not null default now(),
  primary key (follower_account_id, followed_account_id),
  constraint fxsnap_community_follow_not_self check (follower_account_id <> followed_account_id)
);
create index if not exists fxsnap_community_follows_followed_idx
  on public.fxsnap_community_follows (followed_account_id, follower_account_id);

create table if not exists public.fxsnap_community_blocks (
  blocker_account_id text not null,
  blocked_account_id text not null,
  created_at timestamptz not null default now(),
  primary key (blocker_account_id, blocked_account_id),
  constraint fxsnap_community_block_not_self check (blocker_account_id <> blocked_account_id)
);

create table if not exists public.fxsnap_community_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_account_id text not null,
  target_account_id text not null,
  message_id uuid not null references public.fxsnap_community_messages(id) on delete restrict,
  reason text not null check (reason in ('spam', 'scam', 'harassment', 'impersonation', 'suspicious_signal', 'other')),
  explanation text not null default '',
  status text not null default 'open' check (status in ('open', 'reviewing', 'resolved', 'dismissed')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  constraint fxsnap_community_report_once unique (reporter_account_id, message_id),
  constraint fxsnap_community_report_explanation_length check (length(explanation) <= 1000)
);
create index if not exists fxsnap_community_reports_open_idx
  on public.fxsnap_community_reports (created_at) where status in ('open', 'reviewing');

create table if not exists public.fxsnap_community_events (
  id bigint generated always as identity primary key,
  event_type text not null check (event_type in ('message', 'reaction', 'message_removed', 'message_pinned', 'announcement', 'notification')),
  object_id uuid not null,
  recipient_supabase_user_id uuid,
  created_at timestamptz not null default now()
);
alter table public.fxsnap_community_events
  add column if not exists recipient_supabase_user_id uuid;
alter table public.fxsnap_community_events
  drop constraint if exists fxsnap_community_events_event_type_check;
alter table public.fxsnap_community_events
  add constraint fxsnap_community_events_event_type_check
    check (event_type in ('message', 'reaction', 'message_removed', 'message_pinned', 'announcement', 'notification'));
create index if not exists fxsnap_community_events_created_idx
  on public.fxsnap_community_events (created_at desc, id desc);

create table if not exists public.fxsnap_community_notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_account_id text not null,
  kind text not null check (kind in ('reply', 'reaction', 'support_reply', 'moderation')),
  message text not null,
  object_id uuid,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists fxsnap_community_notifications_recipient_idx
  on public.fxsnap_community_notifications (recipient_account_id, created_at desc);

create table if not exists public.fxsnap_support_conversations (
  id uuid primary key default gen_random_uuid(),
  account_id text not null unique,
  status text not null default 'open' check (status in ('open', 'in_progress', 'resolved')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.fxsnap_support_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.fxsnap_support_conversations(id) on delete cascade,
  sender_account_id text not null,
  sender_kind text not null check (sender_kind in ('member', 'admin')),
  body text not null check (length(body) between 1 and 2000),
  client_message_id uuid not null,
  created_at timestamptz not null default now(),
  constraint fxsnap_support_message_client_id_unique unique (sender_account_id, client_message_id)
);
create index if not exists fxsnap_support_messages_conversation_idx
  on public.fxsnap_support_messages (conversation_id, created_at);

create table if not exists public.fxsnap_community_moderation_actions (
  id uuid primary key default gen_random_uuid(),
  actor_account_id text not null,
  target_account_id text,
  target_message_id uuid,
  action text not null check (action in ('warn', 'mute', 'suspend', 'ban', 'unmute', 'unsuspend', 'unban', 'remove_message', 'pin', 'unpin', 'announcement', 'report_review')),
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists fxsnap_community_moderation_created_idx
  on public.fxsnap_community_moderation_actions (created_at desc);

create or replace function public.fxsnap_community_publish_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  event_kind text;
  parent_account_id text;
  recipient_user_id uuid;
begin
  if tg_table_name = 'fxsnap_community_messages' then
    if tg_op = 'INSERT' then
      event_kind := case when new.kind = 'announcement' then 'announcement' else 'message' end;
      insert into public.fxsnap_community_events (event_type, object_id)
        values (event_kind, new.id);
      if new.reply_to_id is not null then
        select account_id into parent_account_id
          from public.fxsnap_community_messages where id = new.reply_to_id;
        if parent_account_id is not null and parent_account_id <> new.account_id then
          insert into public.fxsnap_community_notifications (recipient_account_id, kind, message, object_id)
            values (parent_account_id, 'reply', 'Someone replied to your community message.', new.id);
        end if;
      end if;
    elsif new.removed_at is distinct from old.removed_at and new.removed_at is not null then
      insert into public.fxsnap_community_events (event_type, object_id)
        values ('message_removed', new.id);
    elsif new.pinned_at is distinct from old.pinned_at then
      insert into public.fxsnap_community_events (event_type, object_id)
        values ('message_pinned', new.id);
    elsif new.body is distinct from old.body
      or new.payload is distinct from old.payload
      or new.category is distinct from old.category then
      insert into public.fxsnap_community_events (event_type, object_id)
        values ('message', new.id);
    end if;
  elsif tg_table_name = 'fxsnap_community_reactions' and tg_op = 'INSERT' then
    insert into public.fxsnap_community_events (event_type, object_id)
      values ('reaction', new.message_id);
    select account_id into parent_account_id
      from public.fxsnap_community_messages where id = new.message_id;
    if parent_account_id is not null and parent_account_id <> new.account_id then
      insert into public.fxsnap_community_notifications (recipient_account_id, kind, message, object_id)
        values (parent_account_id, 'reaction', 'Someone reacted to your community post.', new.message_id);
    end if;
  elsif tg_table_name = 'fxsnap_community_reactions' and tg_op = 'DELETE' then
    insert into public.fxsnap_community_events (event_type, object_id)
      values ('reaction', old.message_id);
  elsif tg_table_name = 'fxsnap_support_messages' and tg_op = 'INSERT' and new.sender_kind = 'admin' then
    select account_id into parent_account_id
      from public.fxsnap_support_conversations where id = new.conversation_id;
    if parent_account_id is not null then
      insert into public.fxsnap_community_notifications (recipient_account_id, kind, message, object_id)
        values (parent_account_id, 'support_reply', 'FXSnap Support replied to your private conversation.', new.id);
    end if;
  elsif tg_table_name = 'fxsnap_community_notifications' and tg_op = 'INSERT' then
    select supabase_user_id into recipient_user_id
      from public.fxsnap_community_profiles where account_id = new.recipient_account_id;
    if recipient_user_id is not null then
      insert into public.fxsnap_community_events (event_type, object_id, recipient_supabase_user_id)
        values ('notification', new.id, recipient_user_id);
    end if;
  end if;
  return null;
end;
$$;
revoke all on function public.fxsnap_community_publish_event() from public, anon, authenticated;

drop trigger if exists fxsnap_community_message_event on public.fxsnap_community_messages;
create trigger fxsnap_community_message_event
  after insert or update of body, payload, category, removed_at, pinned_at on public.fxsnap_community_messages
  for each row execute function public.fxsnap_community_publish_event();
drop trigger if exists fxsnap_community_reaction_event on public.fxsnap_community_reactions;
create trigger fxsnap_community_reaction_event
  after insert or delete on public.fxsnap_community_reactions
  for each row execute function public.fxsnap_community_publish_event();
drop trigger if exists fxsnap_community_support_reply_notification on public.fxsnap_support_messages;
create trigger fxsnap_community_support_reply_notification
  after insert on public.fxsnap_support_messages
  for each row execute function public.fxsnap_community_publish_event();
drop trigger if exists fxsnap_community_notification_event on public.fxsnap_community_notifications;
create trigger fxsnap_community_notification_event
  after insert on public.fxsnap_community_notifications
  for each row execute function public.fxsnap_community_publish_event();

alter table public.fxsnap_community_profiles enable row level security;
alter table public.fxsnap_community_messages enable row level security;
alter table public.fxsnap_community_reactions enable row level security;
alter table public.fxsnap_community_follows enable row level security;
alter table public.fxsnap_community_blocks enable row level security;
alter table public.fxsnap_community_reports enable row level security;
alter table public.fxsnap_community_events enable row level security;
alter table public.fxsnap_community_notifications enable row level security;
alter table public.fxsnap_support_conversations enable row level security;
alter table public.fxsnap_support_messages enable row level security;
alter table public.fxsnap_community_moderation_actions enable row level security;

revoke all on public.fxsnap_community_profiles,
  public.fxsnap_community_messages,
  public.fxsnap_community_reactions,
  public.fxsnap_community_follows,
  public.fxsnap_community_blocks,
  public.fxsnap_community_reports,
  public.fxsnap_community_events,
  public.fxsnap_community_notifications,
  public.fxsnap_support_conversations,
  public.fxsnap_support_messages,
  public.fxsnap_community_moderation_actions from anon, authenticated;
grant all on public.fxsnap_community_profiles,
  public.fxsnap_community_messages,
  public.fxsnap_community_reactions,
  public.fxsnap_community_follows,
  public.fxsnap_community_blocks,
  public.fxsnap_community_reports,
  public.fxsnap_community_events,
  public.fxsnap_community_notifications,
  public.fxsnap_support_conversations,
  public.fxsnap_support_messages,
  public.fxsnap_community_moderation_actions to service_role;
grant usage, select on sequence public.fxsnap_community_events_id_seq to service_role;

drop policy if exists fxsnap_community_events_member_read on public.fxsnap_community_events;
create policy fxsnap_community_events_member_read on public.fxsnap_community_events
  for select to authenticated
  using (
    exists (
      select 1 from public.fxsnap_community_profiles p
      where p.supabase_user_id = (select auth.uid()) and p.status in ('active', 'muted')
    )
    and (
      recipient_supabase_user_id is null
      or recipient_supabase_user_id = (select auth.uid())
    )
  );
grant select on public.fxsnap_community_events to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'fxsnap_community_events'
  ) then
    alter publication supabase_realtime add table public.fxsnap_community_events;
  end if;
end
$$;

create or replace function public.fxsnap_community_delete_member(p_account_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  anonymized_id text := 'deleted_' || replace(gen_random_uuid()::text, '-', '');
begin
  update public.fxsnap_community_messages
    set account_id = anonymized_id, author_username = 'Deleted member', pinned_by = null
    where account_id = p_account_id;
  update public.fxsnap_community_reports
    set reporter_account_id = anonymized_id
    where reporter_account_id = p_account_id;
  update public.fxsnap_community_reports
    set target_account_id = anonymized_id
    where target_account_id = p_account_id;
  update public.fxsnap_community_moderation_actions
    set target_account_id = anonymized_id
    where target_account_id = p_account_id;
  update public.fxsnap_community_moderation_actions
    set actor_account_id = anonymized_id
    where actor_account_id = p_account_id;
  delete from public.fxsnap_community_reactions where account_id = p_account_id;
  delete from public.fxsnap_community_follows
    where follower_account_id = p_account_id or followed_account_id = p_account_id;
  delete from public.fxsnap_community_blocks
    where blocker_account_id = p_account_id or blocked_account_id = p_account_id;
  delete from public.fxsnap_community_notifications where recipient_account_id = p_account_id;
  delete from public.fxsnap_support_conversations where account_id = p_account_id;
  delete from public.fxsnap_community_profiles where account_id = p_account_id;
end;
$$;
revoke all on function public.fxsnap_community_delete_member(text) from public, anon, authenticated;
grant execute on function public.fxsnap_community_delete_member(text) to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('fxsnap-community-media', 'fxsnap-community-media', true, 3145728, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

update public.fxsnap_community_messages
  set removed_at = coalesce(removed_at, now())
  where account_id = 'fxsnap_official_system'
    and (
      (id = '00000000-0000-4000-8000-000000000011' and client_message_id = '00000000-0000-4000-8000-000000000021')
      or (id = '00000000-0000-4000-8000-000000000012' and client_message_id = '00000000-0000-4000-8000-000000000022')
      or (id = '00000000-0000-4000-8000-000000000013' and client_message_id = '00000000-0000-4000-8000-000000000023')
    );
