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
  preferences jsonb not null default '{"dailyBrief": true, "inactivity": true, "weekly": true, "community": true}'::jsonb,
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
  alter column preferences set default '{"dailyBrief": true, "inactivity": true, "weekly": true, "community": true}'::jsonb;

alter table public.fxsnap_kv enable row level security;
alter table public.fxsnap_push_devices enable row level security;
revoke all on table public.fxsnap_kv from anon, authenticated;
revoke all on table public.fxsnap_push_devices from anon, authenticated;
grant all on table public.fxsnap_kv to service_role;
grant all on table public.fxsnap_push_devices to service_role;

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

drop function if exists public.fxsnap_kv_set_if_absent(text, jsonb, integer);
drop function if exists public.fxsnap_kv_delete_if_value(text, jsonb);
