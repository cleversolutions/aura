-- Teams and seasons: free-text team names with stable ids, teams without staff, and seasons.
--
-- A club has one current season (ended_at is null). Teams, their rosters and events belong to a
-- season; starting a new one copies the current season's team memberships into past_team_members
-- and carries the teams club staff choose into the new season. So team_members, and every helper
-- that reads it (member_teams, can_manage_team, can_see_contact, thread membership, the edge
-- functions' checks, permissions.ts), always means "this season". Past seasons are read-only.

-- ---------------------------------------------------------------------------------------------
-- Seasons
-- ---------------------------------------------------------------------------------------------

create table public.seasons (
  club_id uuid not null references public.clubs on delete cascade,
  id uuid not null default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  started_at date not null default current_date,
  ended_at date,
  primary key (club_id, id),
  unique (id)
);
create unique index seasons_name_idx on public.seasons (club_id, lower(name));
create unique index seasons_current_idx on public.seasons (club_id) where ended_at is null;

-- seasonNameFor() in shared/util: school years run from August, e.g. `2026–27`.
create function public.season_name_for(p_date date) returns text
language sql immutable set search_path = '' as $$
  select v.y::text || '–' || lpad(((v.y + 1) % 100)::text, 2, '0')
  from (select case when extract(month from p_date) >= 8 then extract(year from p_date)::int
                    else extract(year from p_date)::int - 1 end as y) v
$$;

create function public.current_season_id(p_club uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select id from public.seasons where club_id = p_club and ended_at is null
$$;

insert into public.seasons (club_id, name)
select id, public.season_name_for(current_date) from public.clubs;

-- Every new club starts with a season.
create function public.clubs_first_season() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.seasons (club_id, name) values (new.id, public.season_name_for(current_date));
  return new;
end;
$$;
create trigger clubs_first_season after insert on public.clubs
  for each row execute function public.clubs_first_season();

-- ---------------------------------------------------------------------------------------------
-- Teams: a season, optional age and division, and ids that are not derived from the name.
-- Existing ids (U11B) stay.
-- ---------------------------------------------------------------------------------------------

create function public.new_team_id() returns text
language sql volatile set search_path = '' as $$
  select 't' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 11)
$$;

alter table public.teams
  alter column id set default public.new_team_id(),
  add column season_id uuid,
  add column age text check (length(trim(age)) > 0),
  add column division text check (length(trim(division)) > 0),
  add constraint teams_name_check check (length(trim(name)) > 0);

update public.teams t set season_id = public.current_season_id(t.club_id);
-- The old pickers' names (`U11 Boys`) give existing teams an age and division.
update public.teams
set age = (regexp_match(name, '^(U\d+)\M'))[1],
    division = (regexp_match(name, '\m(Boys|Girls)$'))[1];

alter table public.teams
  alter column season_id set not null,
  add constraint teams_season_fk foreign key (club_id, season_id) references public.seasons (club_id, id);
create unique index teams_season_name_idx on public.teams (season_id, lower(trim(name)));

create function public.teams_season() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.season_id := coalesce(new.season_id, public.current_season_id(new.club_id));
  return new;
end;
$$;
create trigger teams_season before insert on public.teams
  for each row execute function public.teams_season();

-- Club staff rename a team and change its age and division.
grant update (name, age, division) on public.teams to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Events belong to a season: their team's, or the current one for club-wide events.
-- ---------------------------------------------------------------------------------------------

alter table public.events add column season_id uuid;
update public.events e set season_id = coalesce(
  (select t.season_id from public.teams t where t.club_id = e.club_id and t.id = e.team),
  public.current_season_id(e.club_id)
);
alter table public.events
  alter column season_id set not null,
  add constraint events_season_fk foreign key (club_id, season_id) references public.seasons (club_id, id);

create function public.events_season() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' or new.team is distinct from old.team then
    new.season_id := coalesce(
      (select t.season_id from public.teams t where t.club_id = new.club_id and t.id = new.team),
      public.current_season_id(new.club_id)
    );
  end if;
  return new;
end;
$$;
create trigger events_season before insert or update on public.events
  for each row execute function public.events_season();

-- ---------------------------------------------------------------------------------------------
-- Who was on a past season's teams. Rows go when the member is removed from the club.
-- ---------------------------------------------------------------------------------------------

create table public.past_team_members (
  club_id uuid not null references public.clubs on delete cascade,
  member_id uuid not null,
  team_id text not null,
  primary key (member_id, team_id),
  foreign key (club_id, member_id) references public.members (club_id, id) on delete cascade,
  foreign key (club_id, team_id) references public.teams (club_id, id) on delete cascade
);
create index past_team_members_club_id_idx on public.past_team_members (club_id);

alter table public.seasons enable row level security;
alter table public.past_team_members enable row level security;
revoke all on public.seasons, public.past_team_members from anon;
revoke insert, update, delete on public.seasons, public.past_team_members from authenticated;
create policy seasons_select on public.seasons for select to authenticated
  using (club_id = (select public.auth_club_id()));
create policy past_team_members_select on public.past_team_members for select to authenticated
  using (club_id = (select public.auth_club_id()));

-- ---------------------------------------------------------------------------------------------
-- Past seasons are read-only. Errors raised without an errcode (P0001) are written for people; the
-- app shows them as they are (dbError). These guards apply to signed-in members (every app write, including
-- through the functions below); the service role's cascades, e.g. removing a member, still work.
-- ---------------------------------------------------------------------------------------------

create function public.is_past_team(p_club uuid, p_team text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.teams t join public.seasons s on s.club_id = t.club_id and s.id = t.season_id
    where t.club_id = p_club and t.id = p_team and s.ended_at is not null
  )
$$;

create function public.is_past_season(p_club uuid, p_season uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.seasons where club_id = p_club and id = p_season and ended_at is not null)
$$;

create function public.signed_in_write() returns boolean
language sql stable set search_path = '' as $$
  select coalesce(auth.jwt() ->> 'role', '') = 'authenticated'
$$;

create function public.past_season_error() returns void
language plpgsql set search_path = '' as $$
begin
  raise exception 'That season has ended. Its teams, rosters and events are read-only.';
end;
$$;

-- Rows with a team_id: teams, team_members, player_profiles.
create function public.guard_past_team() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_team_col text := case when tg_table_name = 'teams' then 'id' else 'team_id' end;
begin
  if public.signed_in_write() then
    if tg_op in ('UPDATE', 'DELETE')
      and public.is_past_team(old.club_id, (to_jsonb(old) ->> v_team_col)) then
      perform public.past_season_error();
    end if;
    if tg_op in ('INSERT', 'UPDATE')
      and public.is_past_team(new.club_id, (to_jsonb(new) ->> v_team_col)) then
      perform public.past_season_error();
    end if;
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;
create trigger guard_past_team before update or delete on public.teams
  for each row execute function public.guard_past_team();
create trigger guard_past_team before insert or delete on public.team_members
  for each row execute function public.guard_past_team();
create trigger guard_past_team before insert or update or delete on public.player_profiles
  for each row execute function public.guard_past_team();

create function public.guard_past_player_parents() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_row public.player_parents := case when tg_op = 'DELETE' then old else new end;
begin
  if public.signed_in_write() and exists (
    select 1 from public.player_profiles p
    where p.id = v_row.profile_id and public.is_past_team(p.club_id, p.team_id)
  ) then
    perform public.past_season_error();
  end if;
  return v_row;
end;
$$;
create trigger guard_past_player_parents before insert or delete on public.player_parents
  for each row execute function public.guard_past_player_parents();

-- Runs after events_season (triggers fire in name order), so a new row's season is set.
create function public.guard_past_event() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if public.signed_in_write() then
    if tg_op in ('UPDATE', 'DELETE') and public.is_past_season(old.club_id, old.season_id) then
      perform public.past_season_error();
    end if;
    if tg_op in ('INSERT', 'UPDATE') and public.is_past_season(new.club_id, new.season_id) then
      perform public.past_season_error();
    end if;
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;
create trigger guard_past_event before insert or update or delete on public.events
  for each row execute function public.guard_past_event();

create function public.guard_past_rsvp() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_row public.rsvps := case when tg_op = 'DELETE' then old else new end;
begin
  if public.signed_in_write() and exists (
    select 1 from public.events e
    where e.id = v_row.event_id and public.is_past_season(e.club_id, e.season_id)
  ) then
    perform public.past_season_error();
  end if;
  return v_row;
end;
$$;
create trigger guard_past_rsvp before insert or update or delete on public.rsvps
  for each row execute function public.guard_past_rsvp();

-- Messages in a past team's threads (posting, editing, deleting) and changes to those threads.
create function public.guard_past_thread() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_thread uuid := (to_jsonb(new) ->> case when tg_table_name = 'threads' then 'id' else 'thread_id' end)::uuid;
begin
  if public.signed_in_write() and exists (
    select 1 from public.threads t where t.id = v_thread and public.is_past_team(t.club_id, t.scope)
  ) then
    raise exception 'That season has ended. Its team chats are read-only.';
  end if;
  return new;
end;
$$;
create trigger guard_past_thread before insert or update on public.messages
  for each row execute function public.guard_past_thread();
create trigger guard_past_thread before update on public.threads
  for each row execute function public.guard_past_thread();

-- ---------------------------------------------------------------------------------------------
-- Starting a season, and deleting a team made by mistake. Club staff only.
-- ---------------------------------------------------------------------------------------------

-- p_teams: [{ from, name, age?, division?, staff, players }]. Teams left out end with the old season.
create function public.start_season(p_name text, p_teams jsonb) returns uuid
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_club uuid := public.auth_club_id();
  v_old uuid;
  v_new uuid;
  v_spec jsonb;
  v_team text;
  v_profile record;
  v_copy uuid;
begin
  if not public.is_club_staff() then
    raise exception 'Only club staff can start a season.' using errcode = '42501';
  end if;
  if length(trim(coalesce(p_name, ''))) = 0 then
    raise exception 'Name the new season.' using errcode = '22023';
  end if;
  if exists (select 1 from public.seasons where club_id = v_club and lower(name) = lower(trim(p_name))) then
    raise exception 'There is already a season called %.', trim(p_name);
  end if;
  v_old := public.current_season_id(v_club);
  for v_spec in select * from jsonb_array_elements(coalesce(p_teams, '[]'))
  loop
    if not exists (
      select 1 from public.teams where club_id = v_club and id = v_spec ->> 'from' and season_id = v_old
    ) then
      raise exception 'Only this season’s teams carry over.' using errcode = 'P0002';
    end if;
    if length(trim(coalesce(v_spec ->> 'name', ''))) = 0 then
      raise exception 'Name every team you carry over.' using errcode = '22023';
    end if;
  end loop;
  if (select count(distinct lower(trim(e ->> 'name'))) from jsonb_array_elements(coalesce(p_teams, '[]')) e)
     < jsonb_array_length(coalesce(p_teams, '[]')) then
    raise exception 'Give each team a different name.';
  end if;

  -- The old season's rosters become history.
  insert into public.past_team_members (club_id, member_id, team_id)
  select tm.club_id, tm.member_id, tm.team_id
  from public.team_members tm join public.teams t on t.club_id = tm.club_id and t.id = tm.team_id
  where tm.club_id = v_club and t.season_id = v_old
  on conflict do nothing;
  delete from public.team_members tm using public.teams t
  where t.club_id = tm.club_id and t.id = tm.team_id and tm.club_id = v_club and t.season_id = v_old;

  update public.seasons set ended_at = current_date where club_id = v_club and id = v_old;
  insert into public.seasons (club_id, name) values (v_club, trim(p_name)) returning id into v_new;

  for v_spec in select * from jsonb_array_elements(coalesce(p_teams, '[]'))
  loop
    insert into public.teams (club_id, name, age, division, season_id)
    values (
      v_club, trim(v_spec ->> 'name'), nullif(trim(v_spec ->> 'age'), ''), nullif(trim(v_spec ->> 'division'), ''),
      v_new
    )
    returning id into v_team;

    if coalesce((v_spec ->> 'staff')::boolean, false) then
      insert into public.team_members (club_id, member_id, team_id)
      select v_club, p.member_id, v_team
      from public.past_team_members p join public.members m on m.id = p.member_id
      where p.team_id = v_spec ->> 'from' and p.club_id = v_club and m.kind = 'staff'
      on conflict do nothing;
    end if;

    if coalesce((v_spec ->> 'players')::boolean, false) then
      for v_profile in
        select * from public.player_profiles
        where club_id = v_club and team_id = v_spec ->> 'from' and not pending
      loop
        insert into public.player_profiles (club_id, name, jersey, team_id, user_member_id)
        values (v_club, v_profile.name, v_profile.jersey, v_team, v_profile.user_member_id)
        returning id into v_copy;
        insert into public.player_parents (club_id, profile_id, member_id)
        select v_club, v_copy, pp.member_id from public.player_parents pp where pp.profile_id = v_profile.id;
        -- Their parents and own sign-in join the team, as move_player() does.
        insert into public.team_members (club_id, member_id, team_id)
        select v_club, m.id, v_team from public.members m
        where m.club_id = v_club
          and (
            (m.id = v_profile.user_member_id and m.kind = 'player')
            or (m.kind = 'parent' and m.id in (select member_id from public.player_parents where profile_id = v_copy))
          )
        on conflict do nothing;
      end loop;
    end if;
  end loop;
  return v_new;
end;
$$;

-- A team made by mistake: no players (pending requests go with it) and no events. Its channels go
-- too, and it is unlinked from other threads.
create function public.delete_team(p_team text) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_club uuid := public.auth_club_id();
begin
  if not public.is_club_staff() then
    raise exception 'Only club staff can delete teams.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.teams where club_id = v_club and id = p_team) then
    raise exception 'Team not found.' using errcode = 'P0002';
  end if;
  if public.is_past_team(v_club, p_team) then
    perform public.past_season_error();
  end if;
  if exists (select 1 from public.player_profiles where club_id = v_club and team_id = p_team and not pending)
     or exists (select 1 from public.events where club_id = v_club and team = p_team) then
    raise exception 'Only a team with no players and no events can be deleted. Move its players and events first, or leave it out of the next season.';
  end if;
  delete from public.threads where club_id = v_club and scope = p_team;
  update public.threads set teams = array_remove(teams, p_team) where club_id = v_club and p_team = any (teams);
  delete from public.teams where club_id = v_club and id = p_team;
end;
$$;

revoke execute on function
  public.season_name_for(date), public.current_season_id(uuid), public.new_team_id(),
  public.is_past_team(uuid, text), public.is_past_season(uuid, uuid), public.signed_in_write(),
  public.past_season_error(), public.start_season(text, jsonb), public.delete_team(text)
  from anon, public;
grant execute on function
  public.season_name_for(date), public.current_season_id(uuid), public.new_team_id(),
  public.is_past_team(uuid, text), public.is_past_season(uuid, uuid), public.signed_in_write(),
  public.past_season_error(), public.start_season(text, jsonb), public.delete_team(text)
  to authenticated, service_role;
