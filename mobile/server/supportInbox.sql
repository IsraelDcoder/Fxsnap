-- Apply after community.sql. Writes and admin reads use the authenticated
-- FXSnap API; member reads for Realtime are protected by owner-scoped RLS.

alter table public.fxsnap_support_conversations
  drop constraint if exists fxsnap_support_conversations_status_check;

update public.fxsnap_support_conversations
set status = 'pending'
where status = 'in_progress';

alter table public.fxsnap_support_conversations
  add constraint fxsnap_support_conversations_status_check
  check (status in ('open', 'pending', 'resolved'));

alter table public.fxsnap_support_conversations
  add column if not exists display_name text,
  add column if not exists supabase_user_id uuid,
  add column if not exists subscription_status text not null default 'unavailable'
    check (subscription_status in ('active', 'free', 'unavailable')),
  add column if not exists app_version text,
  add column if not exists platform text
    check (platform is null or platform in ('ios', 'android', 'web', 'unknown')),
  add column if not exists topic text
    check (topic is null or topic in ('account', 'billing', 'analysis', 'navigation', 'other')),
  add column if not exists member_last_read_at timestamptz,
  add column if not exists admin_last_read_at timestamptz;

create index if not exists fxsnap_support_conversations_status_updated_idx
  on public.fxsnap_support_conversations (status, updated_at desc);

create index if not exists fxsnap_support_messages_unread_idx
  on public.fxsnap_support_messages (conversation_id, sender_kind, created_at desc);

create index if not exists fxsnap_support_conversations_supabase_user_idx
  on public.fxsnap_support_conversations (supabase_user_id);

-- Supabase Realtime only broadcasts message rows readable by the signed-in
-- owner. All inserts and updates still go through the authenticated FXSnap API.
drop policy if exists fxsnap_support_conversations_owner_read on public.fxsnap_support_conversations;
create policy fxsnap_support_conversations_owner_read
  on public.fxsnap_support_conversations
  for select to authenticated
  using (supabase_user_id = (select auth.uid()));

drop policy if exists fxsnap_support_messages_owner_read on public.fxsnap_support_messages;
create policy fxsnap_support_messages_owner_read
  on public.fxsnap_support_messages
  for select to authenticated
  using (
    exists (
      select 1
      from public.fxsnap_support_conversations conversation
      where conversation.id = conversation_id
        and conversation.supabase_user_id = (select auth.uid())
    )
  );

grant select on public.fxsnap_support_conversations, public.fxsnap_support_messages to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'fxsnap_support_messages'
  ) then
    alter publication supabase_realtime add table public.fxsnap_support_messages;
  end if;
end
$$;
