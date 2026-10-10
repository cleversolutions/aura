-- Communication: club-wide channels reach everyone, club staff take part in team channels,
-- announcement channels, club settings, and editing or deleting messages.
--
-- Mirrors libs/shared/util/src/lib/permissions.ts (effectiveMembers, canReadThread,
-- canPostInThread, canModerateThread); keep them in step.

-- ---------------------------------------------------------------------------------------------
-- Club settings. A club without a row uses the defaults.
-- ---------------------------------------------------------------------------------------------

create table public.club_settings (
  club_id uuid primary key references public.clubs on delete cascade,
  -- Who posts in announcement channels: 'staff' (club staff, and a team's staff in its
  -- #announcements) or 'everyone' in the channel.
  announcements text not null default 'staff' check (announcements in ('staff', 'everyone'))
);

create function public.club_announcements(p_club uuid) returns text
language sql stable security definer set search_path = '' as $$
  select coalesce((select s.announcements from public.club_settings s where s.club_id = p_club), 'staff')
$$;

alter table public.club_settings enable row level security;
revoke all on public.club_settings from anon;
create policy club_settings_select on public.club_settings for select to authenticated
  using (club_id = (select public.auth_club_id()));
create policy club_settings_insert on public.club_settings for insert to authenticated
  with check (club_id = (select public.auth_club_id()) and (select public.is_club_staff()));
create policy club_settings_update on public.club_settings for update to authenticated
  using (club_id = (select public.auth_club_id()) and (select public.is_club_staff()))
  with check (club_id = (select public.auth_club_id()));

-- ---------------------------------------------------------------------------------------------
-- Threads: announcement channels, and the club-wide default channel
-- ---------------------------------------------------------------------------------------------

-- Only staff post (unless the club setting says everyone). Set on #announcements and
-- #club-announcements; not editable by members (no column grant).
alter table public.threads add column announce_only boolean not null default false;

update public.threads set announce_only = true where is_default and name = '#announcements';

-- create-club made #club-announcements an ordinary thread with no teams, which reached only its
-- creator. It becomes the club's default channel: everyone in the club is in it.
update public.threads set is_default = true, announce_only = true, teams = '{}'
where scope = 'club' and name = '#club-announcements' and not is_default;

create or replace function public.teams_default_threads() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.threads (club_id, name, scope, teams, is_default, announce_only, created_at)
  values
    (new.club_id, '#announcements', new.id, array[new.id], true, true, now()),
    (new.club_id, '#general', new.id, array[new.id], true, false, now() - interval '1 millisecond');
  return new;
end;
$$;

-- effectiveMembers(): a club default channel (scope 'club') has everyone in the club. Otherwise
-- the creator, people added individually, and members of the linked teams whose group is included.
create or replace function public.thread_member_ids(p_thread uuid) returns setof uuid
language sql stable security definer set search_path = '' as $$
  with t as (
    select * from public.threads
    where id = p_thread
      and (club_id = public.auth_club_id() or auth.role() = 'service_role')
  )
  select m.id from t join public.members m on m.club_id = t.club_id
  where t.is_default and t.scope = 'club'
  union
  select t.creator_member_id from t where t.creator_member_id is not null
  union
  select tm.member_id from public.thread_members tm join t on tm.thread_id = t.id
  union
  select m.id
  from t
  join public.members m on m.club_id = t.club_id
  where public.kind_included(m.kind, t.include_staff, t.include_parents, t.include_players)
    and exists (
      select 1 from public.team_members x where x.member_id = m.id and x.team_id = any (t.teams)
    )
$$;

create or replace function public.is_thread_member(p_thread uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.threads t
    join public.members me on me.id = public.auth_member_id() and me.club_id = t.club_id
    where t.id = p_thread
      and (
        (t.is_default and t.scope = 'club')
        or t.creator_member_id = me.id
        or exists (select 1 from public.thread_members tm where tm.thread_id = t.id and tm.member_id = me.id)
        or (
          public.kind_included(me.kind, t.include_staff, t.include_parents, t.include_players)
          and exists (
            select 1 from public.team_members x where x.member_id = me.id and x.team_id = any (t.teams)
          )
        )
      )
  )
$$;

-- canReadThread(): members, plus club staff in every default channel (without being members).
create function public.can_read_thread(p_thread uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_thread_member(p_thread)
    or exists (
      select 1 from public.threads t
      join public.members me on me.id = public.auth_member_id() and me.club_id = t.club_id
      where t.id = p_thread and t.is_default and me.kind = 'club'
    )
$$;

-- canModerateThread(): club staff anywhere; team staff in their own teams' threads.
create function public.can_moderate_thread(p_thread uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.threads t
    join public.members me on me.id = public.auth_member_id() and me.club_id = t.club_id
    where t.id = p_thread
      and (
        me.kind = 'club'
        or (
          me.kind = 'staff' and t.scope <> 'club'
          and exists (select 1 from public.team_members x where x.member_id = me.id and x.team_id = t.scope)
        )
      )
  )
$$;

-- canPostInThread(): whoever reads it, except that announcement channels take staff only unless
-- the club lets everyone post.
create function public.can_post_in_thread(p_thread uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.threads t
    where t.id = p_thread
      and t.club_id = public.auth_club_id()
      and public.can_read_thread(t.id)
      and (
        not t.announce_only
        or public.club_announcements(t.club_id) = 'everyone'
        or public.can_moderate_thread(t.id)
      )
  )
$$;

drop policy threads_select on public.threads;
create policy threads_select on public.threads for select to authenticated
  using (
    club_id = (select public.auth_club_id())
    and (
      creator_member_id = (select public.auth_member_id())
      or public.can_read_thread(id)
      or public.can_manage_thread(id)
    )
  );

-- ---------------------------------------------------------------------------------------------
-- Messages: edited and deleted. A deleted message keeps its place, sender and time, not its text.
-- ---------------------------------------------------------------------------------------------

alter table public.messages
  add column edited_at timestamptz,
  add column deleted_at timestamptz;
alter table public.messages drop constraint messages_text_check;
alter table public.messages add constraint messages_text_check
  check (case when deleted_at is null then length(trim(text)) > 0 else text = '' end);

drop policy messages_select on public.messages;
create policy messages_select on public.messages for select to authenticated
  using (club_id = (select public.auth_club_id()) and public.can_read_thread(thread_id));
drop policy messages_insert on public.messages;
create policy messages_insert on public.messages for insert to authenticated
  with check (
    club_id = (select public.auth_club_id())
    and from_member_id = (select public.auth_member_id())
    and public.can_post_in_thread(thread_id)
    and edited_at is null
    and deleted_at is null
  );

-- Authors edit their own messages.
create function public.edit_message(p_message uuid, p_text text) returns public.messages
language plpgsql volatile security definer set search_path = '' as $$
declare
  v public.messages;
begin
  if length(trim(coalesce(p_text, ''))) = 0 then
    raise exception 'Write a message.' using errcode = '22023';
  end if;
  update public.messages m set text = trim(p_text), edited_at = now()
  where m.id = p_message
    and m.club_id = public.auth_club_id()
    and m.from_member_id = public.auth_member_id()
    and m.deleted_at is null
  returning m.* into v;
  if v.id is null then
    raise exception 'You can only edit your own messages.' using errcode = '42501';
  end if;
  return v;
end;
$$;

-- Authors delete their own messages; moderators delete any message they can read.
create function public.delete_message(p_message uuid) returns public.messages
language plpgsql volatile security definer set search_path = '' as $$
declare
  v public.messages;
begin
  update public.messages m set text = '', deleted_at = now()
  where m.id = p_message
    and m.club_id = public.auth_club_id()
    and m.deleted_at is null
    and (
      m.from_member_id = public.auth_member_id()
      or (public.can_read_thread(m.thread_id) and public.can_moderate_thread(m.thread_id))
    )
  returning m.* into v;
  if v.id is null then
    raise exception 'Only the sender or staff can delete this message.' using errcode = '42501';
  end if;
  return v;
end;
$$;

-- Same as before, plus announce_only, and deleted messages are not unread.
drop function public.list_my_threads();
create function public.list_my_threads()
returns table (
  id uuid,
  name text,
  scope text,
  teams text[],
  include_staff boolean,
  include_parents boolean,
  include_players boolean,
  creator_member_id uuid,
  is_default boolean,
  announce_only boolean,
  created_at timestamptz,
  members uuid[],
  unread integer
)
language sql stable security invoker set search_path = '' as $$
  select
    t.id, t.name, t.scope, t.teams, t.include_staff, t.include_parents, t.include_players,
    t.creator_member_id, t.is_default, t.announce_only, t.created_at,
    coalesce((select array_agg(tm.member_id) from public.thread_members tm where tm.thread_id = t.id), '{}'),
    (
      select count(*)::integer from public.messages m
      where m.thread_id = t.id
        and m.deleted_at is null
        and m.from_member_id <> public.auth_member_id()
        and m.sent_at > coalesce(
          (select r.last_read_at from public.thread_reads r
           where r.thread_id = t.id and r.member_id = public.auth_member_id()),
          '-infinity'
        )
    )
  from public.threads t
  where t.club_id = public.auth_club_id()
  order by t.is_default, t.created_at desc
$$;

-- ---------------------------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------------------------

revoke execute on function
  public.club_announcements(uuid), public.can_read_thread(uuid), public.can_moderate_thread(uuid),
  public.can_post_in_thread(uuid), public.edit_message(uuid, text), public.delete_message(uuid),
  public.list_my_threads()
  from anon, public;
grant execute on function
  public.club_announcements(uuid), public.can_read_thread(uuid), public.can_moderate_thread(uuid),
  public.can_post_in_thread(uuid), public.edit_message(uuid, text), public.delete_message(uuid),
  public.list_my_threads()
  to authenticated, service_role;
