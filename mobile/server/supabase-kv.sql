-- FXSnap durable server store for Supabase.
-- Run this once in the Supabase SQL editor.

create table if not exists public.fxsnap_kv (
  key text primary key,
  value jsonb not null,
  expires_at timestamptz
);

alter table public.fxsnap_kv enable row level security;
revoke all on table public.fxsnap_kv from anon, authenticated;
grant all on table public.fxsnap_kv to service_role;

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
