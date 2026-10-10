-- Member lifecycle: disabling members, removing them while keeping their messages, and the
-- platform admin's view of a club's staff.
--
-- Mirrors libs/shared/util/src/lib/permissions.ts (effectiveMembers leaves disabled members
-- out); keep them in step. The manage-member edge function does the disabling and removing.

-- ---------------------------------------------------------------------------------------------
-- Disabled members: still on record and can be re-enabled, but have no access. manage-member
-- also bans their sign-in, which stops new sessions; this stops sessions already open.
-- ---------------------------------------------------------------------------------------------

alter table public.members add column disabled boolean not null default false;

-- The signed-in member's club, from app_metadata (set only by edge functions), as long as they
-- are still an enabled member of it. Every policy scopes rows by this, so a disabled or removed
-- member reads and writes nothing.
create or replace function public.auth_club_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select m.club_id from public.members m
  where m.user_id = auth.uid()
    and m.club_id = nullif(auth.jwt() -> 'app_metadata' ->> 'club_id', '')::uuid
    and not m.disabled
$$;

-- effectiveMembers(): as before, without disabled members.
create or replace function public.thread_member_ids(p_thread uuid) returns setof uuid
language sql stable security definer set search_path = '' as $$
  with t as (
    select * from public.threads
    where id = p_thread
      and (club_id = public.auth_club_id() or auth.role() = 'service_role')
  ),
  ids as (
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
  )
  select ids.id from ids join public.members m on m.id = ids.id where not m.disabled
$$;

-- ---------------------------------------------------------------------------------------------
-- Messages outlive their sender: removing a member keeps what they wrote, shown as "Former
-- member" (from_member_id is null).
-- ---------------------------------------------------------------------------------------------

alter table public.messages alter column from_member_id drop not null;
alter table public.messages drop constraint messages_club_id_from_member_id_fkey;
alter table public.messages
  add constraint messages_club_id_from_member_id_fkey foreign key (club_id, from_member_id)
  references public.members (club_id, id) on delete set null (from_member_id);

-- Same as before, except that messages from former members count as unread too.
create or replace function public.list_my_threads()
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
        and m.from_member_id is distinct from public.auth_member_id()
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
-- Platform admin: a club's staff, to choose a new club admin from. Platform admins cannot read
-- members directly.
-- ---------------------------------------------------------------------------------------------

create function public.platform_club_staff(p_club uuid)
returns table (id uuid, name text, username text, title text, invited boolean, disabled boolean, is_admin boolean)
language sql stable security definer set search_path = '' as $$
  select m.id, m.name, m.username::text, m.title, m.invited, m.disabled, m.id = c.admin_member_id
  from public.members m
  join public.clubs c on c.id = m.club_id
  where public.is_platform_admin() and m.club_id = p_club and m.kind = 'club'
  order by m.name
$$;

revoke execute on function public.platform_club_staff(uuid) from anon, public;
grant execute on function public.platform_club_staff(uuid) to authenticated, service_role;
