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
  category text check (category in ('trading', 'investing', 'finance', 'market_discussion', 'learning', 'chart_analysis', 'questions', 'events')),
  body text not null default '',
  payload jsonb not null default '{}'::jsonb,
  reply_to_id uuid references public.fxsnap_community_messages(id) on delete set null,
  client_message_id uuid not null,
  pinned_at timestamptz,
  pinned_by text,
  removed_at timestamptz,
  created_at timestamptz not null default now(),
  view_count bigint not null default 0 check (view_count >= 0),
  share_count bigint not null default 0 check (share_count >= 0),
  constraint fxsnap_community_message_client_id_unique unique (account_id, client_message_id),
  constraint fxsnap_community_message_content check (
    length(body) <= 2000 and octet_length(body) <= 8000
  )
);
alter table public.fxsnap_community_messages
  add column if not exists view_count bigint not null default 0 check (view_count >= 0),
  add column if not exists share_count bigint not null default 0 check (share_count >= 0);
alter table public.fxsnap_community_messages
  drop constraint if exists fxsnap_community_messages_category_check;
alter table public.fxsnap_community_messages
  add constraint fxsnap_community_messages_category_check
  check (category is null or category in (
    'trading', 'investing', 'finance', 'market_discussion', 'learning',
    'chart_analysis', 'questions', 'events'
  ));
create index if not exists fxsnap_community_messages_created_idx
  on public.fxsnap_community_messages (created_at desc, id desc);
create index if not exists fxsnap_community_messages_author_idx
  on public.fxsnap_community_messages (account_id, created_at desc);

create table if not exists public.fxsnap_community_reposts (
  message_id uuid not null references public.fxsnap_community_messages(id) on delete cascade,
  account_id text not null,
  created_at timestamptz not null default now(),
  primary key (message_id, account_id)
);
create index if not exists fxsnap_community_reposts_account_idx
  on public.fxsnap_community_reposts (account_id, created_at desc);
create table if not exists public.fxsnap_community_saved_posts (
  message_id uuid not null references public.fxsnap_community_messages(id) on delete cascade,
  account_id text not null,
  created_at timestamptz not null default now(),
  primary key (message_id, account_id)
);
create index if not exists fxsnap_community_saved_posts_account_idx
  on public.fxsnap_community_saved_posts (account_id, created_at desc);
create table if not exists public.fxsnap_community_poll_votes (
  message_id uuid not null references public.fxsnap_community_messages(id) on delete cascade,
  account_id text not null,
  option_id text not null,
  created_at timestamptz not null default now(),
  primary key (message_id, account_id)
);
create index if not exists fxsnap_community_poll_votes_message_idx
  on public.fxsnap_community_poll_votes (message_id, option_id);

drop function if exists public.fxsnap_community_comment_counts(uuid[], text);
drop function if exists public.fxsnap_community_comment_counts(uuid[]);
create function public.fxsnap_community_comment_counts(
  p_message_ids uuid[],
  p_account_id text default null
)
returns table(
  message_id uuid,
  comment_count bigint,
  repost_count bigint,
  reposted_by_me boolean,
  saved_by_me boolean
)
language sql
security definer
set search_path = public
as $$
  select requested.id,
    count(distinct comment.id) + count(distinct reply.id),
    (select count(*) from public.fxsnap_community_reposts repost where repost.message_id = requested.id),
    exists (
      select 1 from public.fxsnap_community_reposts repost
      where repost.message_id = requested.id and repost.account_id = p_account_id
    ),
    exists (
      select 1 from public.fxsnap_community_saved_posts saved
      where saved.message_id = requested.id and saved.account_id = p_account_id
    )
  from unnest(p_message_ids) as requested(id)
  left join public.fxsnap_community_messages comment
    on comment.reply_to_id = requested.id and comment.removed_at is null
  left join public.fxsnap_community_messages reply
    on reply.reply_to_id = comment.id and reply.removed_at is null
  left join public.fxsnap_community_reposts repost
    on repost.message_id = requested.id
  group by requested.id;
$$;
revoke all on function public.fxsnap_community_comment_counts(uuid[], text) from public, anon, authenticated;
grant execute on function public.fxsnap_community_comment_counts(uuid[], text) to service_role;

create or replace function public.fxsnap_community_toggle_saved_post(p_message_id uuid, p_account_id text)
returns table(saved boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_saved boolean;
begin
  perform 1 from public.fxsnap_community_messages
  where id = p_message_id and reply_to_id is null and removed_at is null
  for update;
  if not found then raise exception 'Post not found'; end if;

  select exists (
    select 1 from public.fxsnap_community_saved_posts
    where message_id = p_message_id and account_id = p_account_id
  ) into current_saved;
  if current_saved then
    delete from public.fxsnap_community_saved_posts
    where message_id = p_message_id and account_id = p_account_id;
  else
    insert into public.fxsnap_community_saved_posts (message_id, account_id)
    values (p_message_id, p_account_id);
  end if;
  return query select not current_saved;
end;
$$;
revoke all on function public.fxsnap_community_toggle_saved_post(uuid, text) from public, anon, authenticated;
grant execute on function public.fxsnap_community_toggle_saved_post(uuid, text) to service_role;

create or replace function public.fxsnap_community_vote_poll(
  p_message_id uuid,
  p_account_id text,
  p_option_id text
)
returns table(option_id text, votes bigint, total_votes bigint, selected_option_id text)
language plpgsql
security definer
set search_path = public
as $$
declare
  poll_payload jsonb;
  poll_ends_at timestamptz;
begin
  select message.payload -> 'poll' into poll_payload
  from public.fxsnap_community_messages message
  where message.id = p_message_id and message.reply_to_id is null and message.removed_at is null
  for update;
  if poll_payload is null then raise exception 'Poll not found'; end if;
  poll_ends_at := nullif(poll_payload ->> 'endsAt', '')::timestamptz;
  if poll_ends_at is not null and poll_ends_at <= now() then raise exception 'Poll has ended'; end if;
  if not exists (
    select 1 from jsonb_array_elements(poll_payload -> 'options') item
    where item ->> 'id' = p_option_id
  ) then raise exception 'Invalid poll option'; end if;
  insert into public.fxsnap_community_poll_votes (message_id, account_id, option_id)
  values (p_message_id, p_account_id, p_option_id)
  on conflict (message_id, account_id) do update
    set option_id = excluded.option_id, created_at = now();
  return query
    select options.item ->> 'id',
      count(vote.account_id),
      (select count(*) from public.fxsnap_community_poll_votes all_votes where all_votes.message_id = p_message_id),
      p_option_id
    from jsonb_array_elements(poll_payload -> 'options') options(item)
    left join public.fxsnap_community_poll_votes vote
      on vote.message_id = p_message_id and vote.option_id = options.item ->> 'id'
    group by options.item;
end;
$$;
revoke all on function public.fxsnap_community_vote_poll(uuid, text, text) from public, anon, authenticated;
grant execute on function public.fxsnap_community_vote_poll(uuid, text, text) to service_role;

create table if not exists public.fxsnap_community_reactions (
  message_id uuid not null references public.fxsnap_community_messages(id) on delete cascade,
  account_id text not null,
  reaction text not null,
  created_at timestamptz not null default now(),
  primary key (message_id, account_id, reaction)
);
alter table public.fxsnap_community_reactions
  drop constraint if exists fxsnap_community_reactions_reaction_check;
update public.fxsnap_community_reactions
  set reaction = case reaction
    when 'like' then 'love'
    when 'helpful' then 'clap'
    when 'insightful' then 'wow'
    when 'interesting' then 'funny'
    else reaction
  end;
with ranked_reactions as (
  select ctid,
    row_number() over (partition by message_id, account_id order by created_at, reaction) as position
  from public.fxsnap_community_reactions
)
delete from public.fxsnap_community_reactions reaction
using ranked_reactions ranked
where reaction.ctid = ranked.ctid and ranked.position > 1;
alter table public.fxsnap_community_reactions
  add constraint fxsnap_community_reactions_reaction_check
  check (reaction in ('love', 'fire', 'funny', 'clap', 'wow'));
alter table public.fxsnap_community_reactions
  drop constraint if exists fxsnap_community_reactions_pkey;
alter table public.fxsnap_community_reactions
  add constraint fxsnap_community_reactions_pkey primary key (message_id, account_id);
create table if not exists public.fxsnap_community_view_dedup (
  message_id uuid not null references public.fxsnap_community_messages(id) on delete cascade,
  account_id text not null,
  last_viewed_at timestamptz not null default now(),
  primary key (message_id, account_id)
);
create table if not exists public.fxsnap_community_share_dedup (
  message_id uuid not null references public.fxsnap_community_messages(id) on delete cascade,
  account_id text not null,
  last_shared_at timestamptz not null default now(),
  primary key (message_id, account_id)
);
create index if not exists fxsnap_community_view_dedup_account_idx
  on public.fxsnap_community_view_dedup (account_id);
create index if not exists fxsnap_community_view_dedup_expiry_idx
  on public.fxsnap_community_view_dedup (last_viewed_at);
create index if not exists fxsnap_community_share_dedup_account_idx
  on public.fxsnap_community_share_dedup (account_id);

create or replace function public.fxsnap_community_record_views(p_message_ids uuid[], p_account_id text)
returns table(message_id uuid, view_count bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  requested_id uuid;
  post_account_id text;
  inserted_rows integer;
begin
  if coalesce(cardinality(p_message_ids), 0) > 30 then
    raise exception 'Too many view events';
  end if;

  for requested_id in
    select distinct requested.id from unnest(coalesce(p_message_ids, array[]::uuid[])) requested(id)
  loop
    select message.account_id into post_account_id
    from public.fxsnap_community_messages message
    where message.id = requested_id
      and message.reply_to_id is null
      and message.removed_at is null
    for update;

    if found and post_account_id <> p_account_id then
      insert into public.fxsnap_community_view_dedup (message_id, account_id, last_viewed_at)
      values (requested_id, p_account_id, now())
      on conflict on constraint fxsnap_community_view_dedup_pkey do update
        set last_viewed_at = excluded.last_viewed_at
        where public.fxsnap_community_view_dedup.last_viewed_at <= now() - interval '24 hours';
      get diagnostics inserted_rows = row_count;

      if inserted_rows = 1 then
        update public.fxsnap_community_messages
          set view_count = view_count + 1
          where id = requested_id;
        insert into public.fxsnap_community_events (event_type, object_id)
          values ('view', requested_id);
      end if;
    end if;

    return query
      select message.id, message.view_count
      from public.fxsnap_community_messages message
      where message.id = requested_id
        and message.reply_to_id is null
        and message.removed_at is null;
  end loop;
end;
$$;
revoke all on function public.fxsnap_community_record_views(uuid[], text) from public, anon, authenticated;
grant execute on function public.fxsnap_community_record_views(uuid[], text) to service_role;

create or replace function public.fxsnap_community_set_reaction(
  p_message_id uuid,
  p_account_id text,
  p_reaction text
)
returns table(selected_reaction text)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_reaction text;
begin
  if p_reaction not in ('love', 'fire', 'funny', 'clap', 'wow') then
    raise exception 'Invalid reaction';
  end if;

  perform 1
  from public.fxsnap_community_messages message
  where message.id = p_message_id and message.removed_at is null
  for update;
  if not found then
    raise exception 'Message not found';
  end if;

  select reaction.reaction into current_reaction
  from public.fxsnap_community_reactions reaction
  where reaction.message_id = p_message_id and reaction.account_id = p_account_id
  for update;

  if current_reaction = p_reaction then
    delete from public.fxsnap_community_reactions
      where message_id = p_message_id and account_id = p_account_id;
    return query select null::text;
    return;
  end if;

  delete from public.fxsnap_community_reactions
    where message_id = p_message_id and account_id = p_account_id;
  insert into public.fxsnap_community_reactions (message_id, account_id, reaction)
    values (p_message_id, p_account_id, p_reaction);
  return query select p_reaction;
end;
$$;
revoke all on function public.fxsnap_community_set_reaction(uuid, text, text) from public, anon, authenticated;
grant execute on function public.fxsnap_community_set_reaction(uuid, text, text) to service_role;

create or replace function public.fxsnap_community_toggle_repost(p_message_id uuid, p_account_id text)
returns table(reposted boolean, repost_count bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_repost boolean;
  current_count bigint;
begin
  perform 1
  from public.fxsnap_community_messages message
  where message.id = p_message_id
    and message.reply_to_id is null
    and message.removed_at is null
    and message.account_id <> p_account_id
  for update;
  if not found then
    raise exception 'Post not found or cannot be reposted';
  end if;

  select exists (
    select 1 from public.fxsnap_community_reposts repost
    where repost.message_id = p_message_id and repost.account_id = p_account_id
  ) into current_repost;

  if current_repost then
    delete from public.fxsnap_community_reposts
      where message_id = p_message_id and account_id = p_account_id;
  else
    insert into public.fxsnap_community_reposts (message_id, account_id)
      values (p_message_id, p_account_id);
  end if;

  select count(*) into current_count
  from public.fxsnap_community_reposts repost
  where repost.message_id = p_message_id;
  return query select not current_repost, current_count;
end;
$$;
revoke all on function public.fxsnap_community_toggle_repost(uuid, text) from public, anon, authenticated;
grant execute on function public.fxsnap_community_toggle_repost(uuid, text) to service_role;

create or replace function public.fxsnap_community_record_share(p_message_id uuid, p_account_id text)
returns table(share_count bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted_rows integer;
  current_count bigint;
begin
  perform 1
  from public.fxsnap_community_messages message
  where message.id = p_message_id and message.reply_to_id is null and message.removed_at is null
  for update;
  if not found then
    raise exception 'Post not found';
  end if;

  insert into public.fxsnap_community_share_dedup (message_id, account_id, last_shared_at)
  values (p_message_id, p_account_id, now())
  on conflict (message_id, account_id) do update
    set last_shared_at = excluded.last_shared_at
    where public.fxsnap_community_share_dedup.last_shared_at <= now() - interval '30 seconds';
  get diagnostics inserted_rows = row_count;

  if inserted_rows = 1 then
    update public.fxsnap_community_messages
      set share_count = share_count + 1
      where id = p_message_id;
  end if;
  select message.share_count into current_count
    from public.fxsnap_community_messages message where message.id = p_message_id;
  return query select current_count;
end;
$$;
revoke all on function public.fxsnap_community_record_share(uuid, text) from public, anon, authenticated;
grant execute on function public.fxsnap_community_record_share(uuid, text) to service_role;

create table if not exists public.fxsnap_community_follows (
  follower_account_id text not null,
  followed_account_id text not null,
  created_at timestamptz not null default now(),
  primary key (follower_account_id, followed_account_id),
  constraint fxsnap_community_follow_not_self check (follower_account_id <> followed_account_id)
);
create index if not exists fxsnap_community_follows_followed_idx
  on public.fxsnap_community_follows (followed_account_id, follower_account_id);

create or replace function public.fxsnap_community_member_counts(p_account_id text)
returns table(follower_count bigint, following_count bigint)
language sql
security definer
set search_path = public
as $$
  select
    (select count(*) from public.fxsnap_community_follows where followed_account_id = p_account_id),
    (select count(*) from public.fxsnap_community_follows where follower_account_id = p_account_id);
$$;
revoke all on function public.fxsnap_community_member_counts(text) from public, anon, authenticated;
grant execute on function public.fxsnap_community_member_counts(text) to service_role;

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
    check (event_type in ('message', 'reaction', 'message_removed', 'message_pinned', 'announcement', 'notification', 'view'));
create index if not exists fxsnap_community_events_created_idx
  on public.fxsnap_community_events (created_at desc, id desc);

create table if not exists public.fxsnap_community_push_queue (
  id bigint generated always as identity primary key,
  event_type text not null check (event_type in ('post', 'reply', 'reaction')),
  object_id uuid not null,
  actor_account_id text not null,
  recipient_account_id text,
  status text not null default 'pending' check (status in ('pending', 'processing', 'sent', 'failed')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  next_attempt_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  sent_at timestamptz,
  last_error text,
  created_at timestamptz not null default now()
);
alter table public.fxsnap_community_push_queue
  add column if not exists recipient_account_id text;
update public.fxsnap_community_push_queue queue
set recipient_account_id = case
  when queue.event_type = 'reply' then (
    select parent.account_id
    from public.fxsnap_community_messages parent
    where parent.id = object_message.reply_to_id
  )
  when queue.event_type = 'reaction' then object_message.account_id
  else null
end
from public.fxsnap_community_messages object_message
where queue.object_id = object_message.id
  and queue.event_type in ('reply', 'reaction')
  and queue.recipient_account_id is null;
create index if not exists fxsnap_community_push_queue_pending_idx
  on public.fxsnap_community_push_queue (next_attempt_at, created_at)
  where status in ('pending', 'processing');
alter table public.fxsnap_community_push_queue enable row level security;
revoke all on table public.fxsnap_community_push_queue from public, anon, authenticated;
grant all on table public.fxsnap_community_push_queue to service_role;

drop function if exists public.fxsnap_community_claim_push_events(integer, uuid);
create function public.fxsnap_community_claim_push_events(p_limit integer default 100, p_object_id uuid default null)
returns table(id bigint, event_type text, object_id uuid, actor_account_id text, recipient_account_id text, attempt_count integer)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
    with available as (
      select queue.id
      from public.fxsnap_community_push_queue queue
      where (
          (queue.status = 'pending' and queue.next_attempt_at <= now())
          or (queue.status = 'processing' and queue.updated_at <= now() - interval '5 minutes')
        )
        and (p_object_id is null or queue.object_id = p_object_id)
      order by queue.created_at, queue.id
      limit least(greatest(coalesce(p_limit, 100), 1), 100)
      for update skip locked
    )
    update public.fxsnap_community_push_queue queue
    set status = 'processing',
        attempt_count = queue.attempt_count + 1,
        updated_at = now()
    from available
    where queue.id = available.id
    returning queue.id, queue.event_type, queue.object_id, queue.actor_account_id, queue.recipient_account_id, queue.attempt_count;
end;
$$;
revoke all on function public.fxsnap_community_claim_push_events(integer, uuid) from public, anon, authenticated;
grant execute on function public.fxsnap_community_claim_push_events(integer, uuid) to service_role;

create or replace function public.fxsnap_community_finish_push_event(p_id bigint, p_error text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.fxsnap_community_push_queue
  set status = case
        when p_error is null then 'sent'
        when attempt_count >= 5 then 'failed'
        else 'pending'
      end,
      sent_at = case when p_error is null then now() else null end,
      next_attempt_at = case
        when p_error is null then next_attempt_at
        else now() + make_interval(secs => least(3600, 30 * (2 ^ least(attempt_count, 7))::integer))
      end,
      updated_at = now(),
      last_error = left(p_error, 500)
  where id = p_id and status = 'processing';
end;
$$;
revoke all on function public.fxsnap_community_finish_push_event(bigint, text) from public, anon, authenticated;
grant execute on function public.fxsnap_community_finish_push_event(bigint, text) to service_role;

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
  actor_username text;
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
        insert into public.fxsnap_community_push_queue (event_type, object_id, actor_account_id, recipient_account_id)
          values ('reply', new.id, new.account_id, parent_account_id);
        if parent_account_id is not null and parent_account_id <> new.account_id then
          insert into public.fxsnap_community_notifications (recipient_account_id, kind, message, object_id)
            values (parent_account_id, 'reply', format('%s replied to your Community post or reply.', new.author_username), new.id);
        end if;
      else
        insert into public.fxsnap_community_push_queue (event_type, object_id, actor_account_id)
          values ('post', new.id, new.account_id);
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
    select username into actor_username
      from public.fxsnap_community_profiles where account_id = new.account_id;
    insert into public.fxsnap_community_push_queue (event_type, object_id, actor_account_id, recipient_account_id)
      values ('reaction', new.message_id, new.account_id, parent_account_id);
    if parent_account_id is not null and parent_account_id <> new.account_id then
      insert into public.fxsnap_community_notifications (recipient_account_id, kind, message, object_id)
        values (
          parent_account_id,
          'reaction',
          format('%s reacted to your Community post or reply.', coalesce(actor_username, 'Someone')),
          new.message_id
        );
    end if;
  elsif tg_table_name = 'fxsnap_community_reactions' and tg_op = 'DELETE' then
    insert into public.fxsnap_community_events (event_type, object_id)
      values ('reaction', old.message_id);
  elsif tg_table_name = 'fxsnap_support_messages' and tg_op = 'INSERT' then
    if new.sender_kind = 'admin' then
      select account_id into parent_account_id
        from public.fxsnap_support_conversations where id = new.conversation_id;
      if parent_account_id is not null then
        insert into public.fxsnap_community_notifications (recipient_account_id, kind, message, object_id)
          values (parent_account_id, 'support_reply', 'FXSnap Support replied to your private conversation.', new.id);
      end if;
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
alter table public.fxsnap_community_reposts enable row level security;
alter table public.fxsnap_community_saved_posts enable row level security;
alter table public.fxsnap_community_poll_votes enable row level security;
alter table public.fxsnap_community_view_dedup enable row level security;
alter table public.fxsnap_community_share_dedup enable row level security;
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
  public.fxsnap_community_reposts,
  public.fxsnap_community_saved_posts,
  public.fxsnap_community_poll_votes,
  public.fxsnap_community_view_dedup,
  public.fxsnap_community_share_dedup,
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
  public.fxsnap_community_reposts,
  public.fxsnap_community_saved_posts,
  public.fxsnap_community_poll_votes,
  public.fxsnap_community_view_dedup,
  public.fxsnap_community_share_dedup,
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
  delete from public.fxsnap_community_view_dedup where account_id = p_account_id;
  delete from public.fxsnap_community_share_dedup where account_id = p_account_id;
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
