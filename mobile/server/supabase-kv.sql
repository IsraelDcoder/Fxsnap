-- FXSnap durable server store for Supabase.
-- Run this once in the Supabase SQL editor.

create table if not exists public.fxsnap_kv (
  key text primary key,
  value jsonb not null,
  expires_at timestamptz
);

create table if not exists public.fxsnap_push_devices (
  device_id text primary key,
  account_id text,
  supabase_user_id uuid,
  expo_token text not null unique,
  platform text not null check (platform in ('ios', 'android')),
  preferences jsonb not null default '{"dailyBrief": true, "inactivity": true, "weekly": true, "community": true, "systemAnnouncements": true}'::jsonb,
  registered_at timestamptz not null default now(),
  last_notification_at timestamptz
);
alter table public.fxsnap_push_devices
  add column if not exists account_id text,
  add column if not exists supabase_user_id uuid;
create index if not exists fxsnap_push_devices_user_idx
  on public.fxsnap_push_devices (supabase_user_id, device_id)
  where supabase_user_id is not null;
alter table public.fxsnap_push_devices
  alter column preferences set default '{"dailyBrief": true, "inactivity": true, "weekly": true, "community": true, "systemAnnouncements": true}'::jsonb;

alter table public.fxsnap_kv enable row level security;
alter table public.fxsnap_push_devices enable row level security;
revoke all on table public.fxsnap_kv from anon, authenticated;
revoke all on table public.fxsnap_push_devices from anon, authenticated;
grant all on table public.fxsnap_kv to service_role;
grant all on table public.fxsnap_push_devices to service_role;

create table if not exists public.fxsnap_paywall_reminder_sequences (
  id bigint generated always as identity primary key,
  device_id text not null references public.fxsnap_push_devices(device_id) on delete cascade,
  started_at timestamptz not null,
  next_step smallint not null default 0 check (next_step between 0 and 9),
  next_send_at timestamptz not null,
  status text not null default 'active' check (status in ('active', 'completed', 'cancelled')),
  locked_until timestamptz,
  attempts integer not null default 0 check (attempts >= 0),
  completed_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index if not exists fxsnap_paywall_reminders_device_sequence_idx
  on public.fxsnap_paywall_reminder_sequences (device_id)
  where status in ('active', 'completed');
create index if not exists fxsnap_paywall_reminders_due_idx
  on public.fxsnap_paywall_reminder_sequences (next_send_at)
  where status = 'active';
alter table public.fxsnap_paywall_reminder_sequences enable row level security;
revoke all on table public.fxsnap_paywall_reminder_sequences from public, anon, authenticated;
grant all on table public.fxsnap_paywall_reminder_sequences to service_role;

create or replace function public.fxsnap_start_paywall_reminder_sequence(
  p_device_id text,
  p_started_at timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted_count integer;
begin
  insert into public.fxsnap_paywall_reminder_sequences (
    device_id,
    started_at,
    next_send_at
  )
  values (
    p_device_id,
    p_started_at,
    p_started_at + interval '10 minutes'
  )
  on conflict (device_id) where status in ('active', 'completed') do nothing;
  get diagnostics inserted_count = row_count;
  if inserted_count = 1 then return true; end if;
  return exists (
    select 1
    from public.fxsnap_paywall_reminder_sequences
    where device_id = p_device_id and status = 'active'
  );
end;
$$;
revoke all on function public.fxsnap_start_paywall_reminder_sequence(text, timestamptz) from public, anon, authenticated;
grant execute on function public.fxsnap_start_paywall_reminder_sequence(text, timestamptz) to service_role;

create or replace function public.fxsnap_claim_due_paywall_reminders(
  p_now timestamptz,
  p_limit integer default 100
)
returns table(sequence_id bigint, device_id text, next_step smallint)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with due as (
    select seq.id
    from public.fxsnap_paywall_reminder_sequences as seq
    where seq.status = 'active'
      and seq.next_send_at <= p_now
      and (seq.locked_until is null or seq.locked_until <= p_now)
    order by seq.next_send_at
    limit greatest(1, least(coalesce(p_limit, 100), 500))
    for update skip locked
  )
  update public.fxsnap_paywall_reminder_sequences as seq
  set locked_until = p_now + interval '10 minutes',
      attempts = seq.attempts + 1
  from due
  where seq.id = due.id
  returning seq.id, seq.device_id, seq.next_step;
end;
$$;
revoke all on function public.fxsnap_claim_due_paywall_reminders(timestamptz, integer) from public, anon, authenticated;
grant execute on function public.fxsnap_claim_due_paywall_reminders(timestamptz, integer) to service_role;

create or replace function public.fxsnap_finish_paywall_reminder(
  p_id bigint,
  p_outcome text,
  p_now timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sequence public.fxsnap_paywall_reminder_sequences%rowtype;
  next_step_index smallint;
  offsets interval[] := array[
    interval '10 minutes',
    interval '25 minutes',
    interval '1 hour',
    interval '3 hours',
    interval '16 hours',
    interval '24 hours',
    interval '2 days',
    interval '3 days',
    interval '7 days'
  ];
begin
  select * into v_sequence
  from public.fxsnap_paywall_reminder_sequences
  where id = p_id and status = 'active'
  for update;
  if not found then return false; end if;

  if p_outcome = 'cancelled' then
    update public.fxsnap_paywall_reminder_sequences
    set status = 'cancelled', completed_at = p_now, locked_until = null
    where id = p_id;
  elsif p_outcome = 'completed' then
    update public.fxsnap_paywall_reminder_sequences
    set status = 'completed', completed_at = p_now, locked_until = null
    where id = p_id;
  elsif p_outcome = 'retry' then
    update public.fxsnap_paywall_reminder_sequences
    set next_send_at = p_now + make_interval(mins => least(60, 5 * greatest(v_sequence.attempts, 1))),
        locked_until = null
    where id = p_id;
  elsif p_outcome = 'sent' then
    next_step_index := v_sequence.next_step + 1;
    if next_step_index >= cardinality(offsets) then
      update public.fxsnap_paywall_reminder_sequences
      set next_step = next_step_index, status = 'completed', completed_at = p_now,
          locked_until = null, attempts = 0
      where id = p_id;
    else
      update public.fxsnap_paywall_reminder_sequences
      set next_step = next_step_index,
          next_send_at = v_sequence.started_at + offsets[next_step_index + 1],
          locked_until = null,
          attempts = 0
      where id = p_id;
    end if;
  else
    raise exception 'Unsupported paywall reminder outcome.';
  end if;
  return true;
end;
$$;
revoke all on function public.fxsnap_finish_paywall_reminder(bigint, text, timestamptz) from public, anon, authenticated;
grant execute on function public.fxsnap_finish_paywall_reminder(bigint, text, timestamptz) to service_role;

create table if not exists public.fxsnap_push_receipts (
  receipt_id text primary key,
  device_id text not null,
  event_id bigint not null,
  created_at timestamptz not null default now()
);
create index if not exists fxsnap_push_receipts_created_idx
  on public.fxsnap_push_receipts (created_at, receipt_id);
alter table public.fxsnap_push_receipts enable row level security;
revoke all on table public.fxsnap_push_receipts from public, anon, authenticated;
grant all on table public.fxsnap_push_receipts to service_role;

create or replace function public.fxsnap_kv_increment(p_key text, p_ttl_seconds integer)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  next_value integer;
begin
  insert into public.fxsnap_kv (key, value, expires_at)
  values (p_key, '1'::jsonb, now() + make_interval(secs => p_ttl_seconds))
  on conflict (key) do update
    set value = to_jsonb(case
      when public.fxsnap_kv.expires_at is not null and public.fxsnap_kv.expires_at <= now() then 1
      else coalesce((public.fxsnap_kv.value #>> '{}')::integer, 0) + 1
    end),
        expires_at = now() + make_interval(secs => p_ttl_seconds)
  returning (value #>> '{}')::integer into next_value;
  return next_value;
end;
$$;

revoke all on function public.fxsnap_kv_increment(text, integer) from public;
grant execute on function public.fxsnap_kv_increment(text, integer) to service_role;

create or replace function public.fxsnap_kv_append_json(
  p_key text,
  p_values jsonb,
  p_max_items integer,
  p_ttl_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if jsonb_typeof(p_values) <> 'array' or p_max_items < 1 or p_ttl_seconds < 0 then
    raise exception 'Invalid atomic JSON append arguments.';
  end if;

  insert into public.fxsnap_kv (key, value, expires_at)
  values (p_key, p_values, case when p_ttl_seconds > 0 then now() + make_interval(secs => p_ttl_seconds) else null end)
  on conflict (key) do update
    set value = (
      select coalesce(jsonb_agg(item order by ordinal), '[]'::jsonb)
      from (
        select item, ordinal
        from (
          select distinct on (dedupe_key) item, ordinal
          from (
            select item, ordinal,
              case
                when jsonb_typeof(item) = 'object' and nullif(item->>'dedupeId', '') is not null then item->>'dedupeId'
                when jsonb_typeof(item) = 'object' and nullif(item->>'id', '') is not null then item->>'id'
                else 'legacy-' || ordinal::text
              end as dedupe_key
            from jsonb_array_elements(
              case
                when public.fxsnap_kv.expires_at is not null and public.fxsnap_kv.expires_at <= now() then '[]'::jsonb
                when jsonb_typeof(public.fxsnap_kv.value) = 'array' then public.fxsnap_kv.value
                else '[]'::jsonb
              end || excluded.value
            ) with ordinality as event_rows(item, ordinal)
          ) combined
          order by dedupe_key, ordinal
        ) deduplicated
        order by ordinal desc
        limit p_max_items
      ) bounded
    ),
    expires_at = case when p_ttl_seconds > 0 then now() + make_interval(secs => p_ttl_seconds) else null end;
  return true;
end;
$$;
revoke all on function public.fxsnap_kv_append_json(text, jsonb, integer, integer) from public, anon, authenticated;
grant execute on function public.fxsnap_kv_append_json(text, jsonb, integer, integer) to service_role;

drop function if exists public.fxsnap_kv_set_if_absent(text, jsonb, integer);
drop function if exists public.fxsnap_kv_delete_if_value(text, jsonb);
