-- Aura schema: clubs and everything a club owns.
--
-- Every club-owned table carries club_id, and row-level security scopes it to the signed-in
-- member's club (auth_club_id(), from app_metadata, which only edge functions can set).
-- References between club-owned rows are composite (club_id, id) foreign keys, so a row can
-- never point at another club's member, team, event or thread.
--
-- The permission helpers mirror libs/shared/util/src/lib/permissions.ts; keep them in step.

create extension if not exists citext with schema extensions;

-- ---------------------------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------------------------

create table public.clubs (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]{4,32}$'),
  name text not null check (length(trim(name)) > 0),
  logo_url text not null default '',
  ink text not null,
  paper text not null,
  logo_ink text not null,
  logo_paper text not null,
  icon_192_url text,
  icon_512_url text,
  admin_member_id uuid,
  created_at timestamptz not null default now()
);

create table public.members (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs on delete cascade,
  user_id uuid unique references auth.users on delete set null,
  -- Sign-in name, unique within the club only. The auth identity is derived from (club_id, username).
  username extensions.citext,
  name text not null,
  kind text not null check (kind in ('club', 'staff', 'parent', 'player')),
  title text,
  email text,
  invited boolean not null default false,
  unique (club_id, username),
  unique (club_id, id)
);
create index members_club_id_idx on public.members (club_id);

alter table public.clubs
  add constraint clubs_admin_member_fk foreign key (id, admin_member_id)
  references public.members (club_id, id) on delete set null (admin_member_id);

create table public.teams (
  club_id uuid not null references public.clubs on delete cascade,
  id text not null check (id <> 'ALL' and id <> 'club' and length(id) > 0),
  name text not null,
  primary key (club_id, id)
);

create table public.team_members (
  club_id uuid not null references public.clubs on delete cascade,
  member_id uuid not null,
  team_id text not null,
  primary key (member_id, team_id),
  foreign key (club_id, member_id) references public.members (club_id, id) on delete cascade,
  foreign key (club_id, team_id) references public.teams (club_id, id) on delete cascade on update cascade
);
create index team_members_club_id_idx on public.team_members (club_id);
create index team_members_team_idx on public.team_members (club_id, team_id);

create table public.player_profiles (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs on delete cascade,
  name text not null,
  jersey text not null default '–',
  team_id text not null,
  parent_member_id uuid,
  user_member_id uuid,
  login text not null default '',
  pending boolean not null default false,
  unique (club_id, id),
  foreign key (club_id, team_id) references public.teams (club_id, id) on delete cascade on update cascade,
  foreign key (club_id, parent_member_id) references public.members (club_id, id) on delete set null (parent_member_id),
  foreign key (club_id, user_member_id) references public.members (club_id, id) on delete set null (user_member_id)
);
create index player_profiles_club_id_idx on public.player_profiles (club_id);

create table public.events (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs on delete cascade,
  type text not null check (type in ('practice', 'game', 'special')),
  -- A team id, or 'ALL' for club-wide events (so no foreign key).
  team text not null,
  title text,
  opponent text,
  home boolean,
  date date,
  time time,
  tbd boolean not null default false,
  location text not null default '',
  notes text not null default '',
  score_us integer,
  score_them integer,
  check ((score_us is null) = (score_them is null)),
  unique (club_id, id)
);
create index events_club_id_idx on public.events (club_id);

create table public.rsvps (
  club_id uuid not null references public.clubs on delete cascade,
  event_id uuid not null,
  -- A player profile id (parents RSVP for their players) or a member id (everyone else).
  attendee_id uuid not null,
  status text not null check (status in ('going', 'out')),
  primary key (event_id, attendee_id),
  foreign key (club_id, event_id) references public.events (club_id, id) on delete cascade
);
create index rsvps_club_id_idx on public.rsvps (club_id);

create table public.threads (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs on delete cascade,
  name text not null,
  -- A team id, or 'club'.
  scope text not null,
  teams text[] not null default '{}',
  include_staff boolean not null default true,
  include_parents boolean not null default true,
  include_players boolean not null default true,
  creator_member_id uuid,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  unique (club_id, id),
  foreign key (club_id, creator_member_id) references public.members (club_id, id) on delete set null (creator_member_id)
);
create index threads_club_id_idx on public.threads (club_id);

create table public.thread_members (
  club_id uuid not null references public.clubs on delete cascade,
  thread_id uuid not null,
  member_id uuid not null,
  primary key (thread_id, member_id),
  foreign key (club_id, thread_id) references public.threads (club_id, id) on delete cascade,
  foreign key (club_id, member_id) references public.members (club_id, id) on delete cascade
);
create index thread_members_club_id_idx on public.thread_members (club_id);
create index thread_members_member_idx on public.thread_members (member_id);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs on delete cascade,
  thread_id uuid not null,
  from_member_id uuid not null,
  text text not null check (length(trim(text)) > 0),
  sent_at timestamptz not null default now(),
  foreign key (club_id, thread_id) references public.threads (club_id, id) on delete cascade,
  foreign key (club_id, from_member_id) references public.members (club_id, id) on delete cascade
);
create index messages_club_id_idx on public.messages (club_id);
create index messages_thread_sent_idx on public.messages (thread_id, sent_at);

create table public.thread_reads (
  club_id uuid not null references public.clubs on delete cascade,
  thread_id uuid not null,
  member_id uuid not null,
  last_read_at timestamptz not null default now(),
  primary key (thread_id, member_id),
  foreign key (club_id, thread_id) references public.threads (club_id, id) on delete cascade,
  foreign key (club_id, member_id) references public.members (club_id, id) on delete cascade
);
create index thread_reads_club_id_idx on public.thread_reads (club_id);

create table public.thread_mutes (
  club_id uuid not null references public.clubs on delete cascade,
  thread_id uuid not null,
  member_id uuid not null,
  primary key (thread_id, member_id),
  foreign key (club_id, thread_id) references public.threads (club_id, id) on delete cascade,
  foreign key (club_id, member_id) references public.members (club_id, id) on delete cascade
);
create index thread_mutes_club_id_idx on public.thread_mutes (club_id);

-- ---------------------------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------------------------

-- A club's id and slug are baked into every installed app and every member's sign-in identity.
create function public.clubs_immutable_keys() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.id <> old.id then
    raise exception 'A club''s id cannot change.';
  end if;
  if new.slug <> old.slug then
    raise exception 'A club''s link cannot change once created.';
  end if;
  return new;
end;
$$;
create trigger clubs_immutable_keys before update on public.clubs
  for each row execute function public.clubs_immutable_keys();

-- Every team gets its default #announcements and #general channels.
create function public.teams_default_threads() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.threads (club_id, name, scope, teams, is_default, created_at)
  values
    (new.club_id, '#announcements', new.id, array[new.id], true, now()),
    (new.club_id, '#general', new.id, array[new.id], true, now() - interval '1 millisecond');
  return new;
end;
$$;
create trigger teams_default_threads after insert on public.teams
  for each row execute function public.teams_default_threads();

-- ---------------------------------------------------------------------------------------------
-- Helpers (used by policies; security definer so they can read across RLS without recursion)
-- ---------------------------------------------------------------------------------------------

-- The signed-in member's club, from app_metadata (set only by edge functions; users can edit
-- user_metadata, never app_metadata).
create function public.auth_club_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select nullif(auth.jwt() -> 'app_metadata' ->> 'club_id', '')::uuid
$$;

create function public.is_platform_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'platform_admin'
$$;

create function public.auth_member() returns public.members
language sql stable security definer set search_path = '' as $$
  select m.* from public.members m
  where m.user_id = auth.uid() and m.club_id = public.auth_club_id()
$$;

create function public.auth_member_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select (public.auth_member()).id
$$;

create function public.member_teams(p_member uuid) returns text[]
language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(tm.team_id), '{}') from public.team_members tm where tm.member_id = p_member
$$;

-- KIND_GROUP in permissions.ts: whether a member of this kind is included by the thread's flags.
-- Club staff are never auto-included.
create function public.kind_included(p_kind text, p_staff boolean, p_parents boolean, p_players boolean)
returns boolean
language sql immutable set search_path = '' as $$
  select case p_kind
    when 'staff' then p_staff
    when 'parent' then p_parents
    when 'player' then p_players
    else false
  end
$$;

-- effectiveMembers(): the creator, people added individually, and members of the linked teams
-- whose group is included. Service role (tests, tools) may ask about any thread.
create function public.thread_member_ids(p_thread uuid) returns setof uuid
language sql stable security definer set search_path = '' as $$
  with t as (
    select * from public.threads
    where id = p_thread
      and (club_id = public.auth_club_id() or auth.role() = 'service_role')
  )
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

create function public.is_thread_member(p_thread uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.threads t
    join public.members me on me.id = public.auth_member_id() and me.club_id = t.club_id
    where t.id = p_thread
      and (
        t.creator_member_id = me.id
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

-- canManageThread(): club staff and the creator manage any custom thread; team staff manage
-- custom threads on their own teams. Default team channels are never editable.
create function public.can_manage_thread(p_thread uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.threads t
    join public.members me on me.id = public.auth_member_id() and me.club_id = t.club_id
    where t.id = p_thread
      and not t.is_default
      and (
        me.kind = 'club'
        or t.creator_member_id = me.id
        or (
          me.kind = 'staff' and t.scope <> 'club'
          and exists (select 1 from public.team_members x where x.member_id = me.id and x.team_id = t.scope)
        )
      )
  )
$$;

-- canEditEvent(): club staff edit anything; team staff edit their own teams' events, not 'ALL'.
create function public.can_edit_event(p_team text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.members me
    where me.id = public.auth_member_id()
      and (
        me.kind = 'club'
        or (
          me.kind = 'staff' and p_team <> 'ALL'
          and exists (select 1 from public.team_members x where x.member_id = me.id and x.team_id = p_team)
        )
      )
  )
$$;

create function public.is_club_staff() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((public.auth_member()).kind = 'club', false)
$$;

-- An attendee the signed-in member may RSVP for: themself, or a player they parent or are.
create function public.can_rsvp_for(p_attendee uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_attendee = public.auth_member_id()
    or exists (
      select 1 from public.player_profiles p
      where p.id = p_attendee
        and p.club_id = public.auth_club_id()
        and public.auth_member_id() in (p.parent_member_id, p.user_member_id)
    )
$$;

-- ---------------------------------------------------------------------------------------------
-- Views and RPCs
-- ---------------------------------------------------------------------------------------------

-- Public branding, readable before signing in (findClub, the manifest endpoint). Runs as its
-- owner so it can read clubs, which anonymous users otherwise cannot.
create view public.club_public as
  select id, slug, name, logo_url, ink, paper, icon_192_url, icon_512_url from public.clubs;

-- The signed-in member's threads (plus custom threads they can manage), with individually added
-- members and their unread count, in one round trip.
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
  created_at timestamptz,
  members uuid[],
  unread integer
)
language sql stable security invoker set search_path = '' as $$
  select
    t.id, t.name, t.scope, t.teams, t.include_staff, t.include_parents, t.include_players,
    t.creator_member_id, t.is_default, t.created_at,
    coalesce((select array_agg(tm.member_id) from public.thread_members tm where tm.thread_id = t.id), '{}'),
    (
      select count(*)::integer from public.messages m
      where m.thread_id = t.id
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

-- Clubs with their admin's name and sign-in, for the platform admin console. Platform admins
-- cannot read members directly.
create function public.platform_clubs()
returns table (
  id uuid,
  slug text,
  name text,
  logo_url text,
  ink text,
  paper text,
  logo_ink text,
  logo_paper text,
  icon_192_url text,
  icon_512_url text,
  created_at timestamptz,
  admin_name text,
  admin_email text
)
language sql stable security definer set search_path = '' as $$
  select c.id, c.slug, c.name, c.logo_url, c.ink, c.paper, c.logo_ink, c.logo_paper,
    c.icon_192_url, c.icon_512_url, c.created_at, m.name, m.username::text
  from public.clubs c
  left join public.members m on m.id = c.admin_member_id
  where public.is_platform_admin()
  order by c.created_at
$$;

-- Called after a member chooses their own password: they have accepted their invite.
create function public.accept_invite() returns void
language sql volatile security definer set search_path = '' as $$
  update public.members set invited = false where id = public.auth_member_id() and invited
$$;

-- ---------------------------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------------------------

revoke all on all tables in schema public from anon;
revoke execute on all functions in schema public from anon, public;
grant select on public.club_public to anon, authenticated;

grant execute on function
  public.auth_club_id(), public.is_platform_admin(), public.auth_member(), public.auth_member_id(),
  public.member_teams(uuid), public.kind_included(text, boolean, boolean, boolean),
  public.thread_member_ids(uuid), public.is_thread_member(uuid), public.can_manage_thread(uuid),
  public.can_edit_event(text), public.is_club_staff(), public.can_rsvp_for(uuid),
  public.list_my_threads(), public.platform_clubs(), public.accept_invite()
  to authenticated, service_role;

-- Column-level limits where RLS alone would allow too much.
revoke update on public.clubs from authenticated;
grant update (name, logo_url, ink, paper, logo_ink, logo_paper, icon_192_url, icon_512_url)
  on public.clubs to authenticated;
revoke update on public.members from authenticated;
grant update (name) on public.members to authenticated;
revoke update on public.threads from authenticated;
grant update (name, teams, include_staff, include_parents, include_players) on public.threads to authenticated;
revoke update on public.player_profiles from authenticated;
grant update (name, jersey, login) on public.player_profiles to authenticated;
revoke update on public.messages from authenticated;

-- ---------------------------------------------------------------------------------------------
-- Row-level security (default deny)
-- ---------------------------------------------------------------------------------------------

alter table public.clubs enable row level security;
alter table public.members enable row level security;
alter table public.teams enable row level security;
alter table public.team_members enable row level security;
alter table public.player_profiles enable row level security;
alter table public.events enable row level security;
alter table public.rsvps enable row level security;
alter table public.threads enable row level security;
alter table public.thread_members enable row level security;
alter table public.messages enable row level security;
alter table public.thread_reads enable row level security;
alter table public.thread_mutes enable row level security;

-- clubs: members read their own club; platform admins read and edit any club. Clubs are
-- created by the create-club edge function (service role).
create policy clubs_select on public.clubs for select to authenticated
  using (id = (select public.auth_club_id()) or (select public.is_platform_admin()));
create policy clubs_update on public.clubs for update to authenticated
  using ((select public.is_platform_admin())) with check ((select public.is_platform_admin()));

-- members: read your club. Invites go through the invite-member edge function. You may rename
-- yourself (column grant above).
create policy members_select on public.members for select to authenticated
  using (club_id = (select public.auth_club_id()));
create policy members_update_self on public.members for update to authenticated
  using (id = (select public.auth_member_id())) with check (id = (select public.auth_member_id()));

-- teams and team staff: club staff only (saveTeam).
create policy teams_select on public.teams for select to authenticated
  using (club_id = (select public.auth_club_id()));
create policy teams_insert on public.teams for insert to authenticated
  with check (club_id = (select public.auth_club_id()) and (select public.is_club_staff()));
create policy teams_update on public.teams for update to authenticated
  using (club_id = (select public.auth_club_id()) and (select public.is_club_staff()))
  with check (club_id = (select public.auth_club_id()));

create policy team_members_select on public.team_members for select to authenticated
  using (club_id = (select public.auth_club_id()));
create policy team_members_insert on public.team_members for insert to authenticated
  with check (club_id = (select public.auth_club_id()) and (select public.is_club_staff()));
create policy team_members_delete on public.team_members for delete to authenticated
  using (club_id = (select public.auth_club_id()) and (select public.is_club_staff()));

-- player_profiles: a parent requests a pending link for themself; parents, the player and club
-- staff edit a profile. Approving links (pending -> false) is team staff work for v2.
create policy player_profiles_select on public.player_profiles for select to authenticated
  using (club_id = (select public.auth_club_id()));
create policy player_profiles_insert on public.player_profiles for insert to authenticated
  with check (
    club_id = (select public.auth_club_id())
    and parent_member_id = (select public.auth_member_id())
    and user_member_id is null
    and pending
  );
create policy player_profiles_update on public.player_profiles for update to authenticated
  using (
    club_id = (select public.auth_club_id())
    and (
      (select public.auth_member_id()) in (parent_member_id, user_member_id)
      or (select public.is_club_staff())
    )
  )
  with check (club_id = (select public.auth_club_id()));

-- events: canEditEvent for every write, before and after.
create policy events_select on public.events for select to authenticated
  using (club_id = (select public.auth_club_id()));
create policy events_insert on public.events for insert to authenticated
  with check (club_id = (select public.auth_club_id()) and public.can_edit_event(team));
create policy events_update on public.events for update to authenticated
  using (club_id = (select public.auth_club_id()) and public.can_edit_event(team))
  with check (club_id = (select public.auth_club_id()) and public.can_edit_event(team));
create policy events_delete on public.events for delete to authenticated
  using (club_id = (select public.auth_club_id()) and public.can_edit_event(team));

-- rsvps: anyone in the club sees them; you set them for yourself and your players.
create policy rsvps_select on public.rsvps for select to authenticated
  using (club_id = (select public.auth_club_id()));
create policy rsvps_insert on public.rsvps for insert to authenticated
  with check (club_id = (select public.auth_club_id()) and public.can_rsvp_for(attendee_id));
create policy rsvps_update on public.rsvps for update to authenticated
  using (club_id = (select public.auth_club_id()) and public.can_rsvp_for(attendee_id))
  with check (club_id = (select public.auth_club_id()) and public.can_rsvp_for(attendee_id));
create policy rsvps_delete on public.rsvps for delete to authenticated
  using (club_id = (select public.auth_club_id()) and public.can_rsvp_for(attendee_id));

-- threads: visible to members, and to staff who can manage them (oversight). Anyone in the club
-- can start a custom thread as its creator; default channels are created by the teams trigger.
-- The inline creator check lets `insert ... returning` see the new row: the helper functions run
-- on the statement's snapshot, which does not include it yet.
create policy threads_select on public.threads for select to authenticated
  using (
    club_id = (select public.auth_club_id())
    and (
      creator_member_id = (select public.auth_member_id())
      or public.is_thread_member(id)
      or public.can_manage_thread(id)
    )
  );
create policy threads_insert on public.threads for insert to authenticated
  with check (
    club_id = (select public.auth_club_id())
    and creator_member_id = (select public.auth_member_id())
    and not is_default
  );
create policy threads_update on public.threads for update to authenticated
  using (club_id = (select public.auth_club_id()) and public.can_manage_thread(id))
  with check (club_id = (select public.auth_club_id()) and not is_default);

-- Inserting the creator's thread_members happens right after the thread insert, when the
-- creator can already manage it.
create policy thread_members_select on public.thread_members for select to authenticated
  using (club_id = (select public.auth_club_id()));
create policy thread_members_insert on public.thread_members for insert to authenticated
  with check (club_id = (select public.auth_club_id()) and public.can_manage_thread(thread_id));
create policy thread_members_delete on public.thread_members for delete to authenticated
  using (club_id = (select public.auth_club_id()) and public.can_manage_thread(thread_id));

-- messages: thread members only, sent as yourself.
create policy messages_select on public.messages for select to authenticated
  using (club_id = (select public.auth_club_id()) and public.is_thread_member(thread_id));
create policy messages_insert on public.messages for insert to authenticated
  with check (
    club_id = (select public.auth_club_id())
    and from_member_id = (select public.auth_member_id())
    and public.is_thread_member(thread_id)
  );

-- reads and mutes: your own rows only.
create policy thread_reads_own on public.thread_reads for all to authenticated
  using (member_id = (select public.auth_member_id()))
  with check (member_id = (select public.auth_member_id()) and club_id = (select public.auth_club_id()));
create policy thread_mutes_own on public.thread_mutes for all to authenticated
  using (member_id = (select public.auth_member_id()))
  with check (member_id = (select public.auth_member_id()) and club_id = (select public.auth_club_id()));

-- ---------------------------------------------------------------------------------------------
-- Realtime and storage
-- ---------------------------------------------------------------------------------------------

-- Postgres Changes applies the select policy, so members only hear about their threads.
alter publication supabase_realtime add table public.messages;

-- Club logos and app icons: public read, written only by edge functions (service role).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('club-assets', 'club-assets', true, 1048576, array['image/png', 'image/svg+xml', 'image/jpeg', 'image/webp'])
on conflict (id) do nothing;
