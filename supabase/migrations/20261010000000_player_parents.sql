-- Players can have several parents, and any member can be one (a coach can be a parent too).
-- Replaces player_profiles.parent_member_id with player_parents, keeping existing links.
-- Staff add players to their teams; players with their own sign-in are linked by user_member_id.

create table public.player_parents (
  club_id uuid not null references public.clubs on delete cascade,
  profile_id uuid not null,
  member_id uuid not null,
  primary key (profile_id, member_id),
  foreign key (club_id, profile_id) references public.player_profiles (club_id, id) on delete cascade,
  foreign key (club_id, member_id) references public.members (club_id, id) on delete cascade
);
create index player_parents_club_id_idx on public.player_parents (club_id);
create index player_parents_member_idx on public.player_parents (member_id);

insert into public.player_parents (club_id, profile_id, member_id)
select club_id, id, parent_member_id from public.player_profiles where parent_member_id is not null;

-- Policies and helpers that read the old column go first.
drop policy player_profiles_insert on public.player_profiles;
drop policy player_profiles_update on public.player_profiles;
alter table public.player_profiles drop column parent_member_id;

-- Club staff, or team staff of `p_team`: who manages a team's roster.
create function public.can_manage_team(p_team text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.members me
    where me.id = public.auth_member_id()
      and (
        me.kind = 'club'
        or (
          me.kind = 'staff'
          and exists (select 1 from public.team_members x where x.member_id = me.id and x.team_id = p_team)
        )
      )
  )
$$;

-- The signed-in member is one of the player's parents, or the player.
create function public.acts_for_player(p_profile uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.player_profiles p
    where p.id = p_profile
      and p.club_id = public.auth_club_id()
      and (
        p.user_member_id = public.auth_member_id()
        or exists (
          select 1 from public.player_parents pp
          where pp.profile_id = p.id and pp.member_id = public.auth_member_id()
        )
      )
  )
$$;

create or replace function public.can_rsvp_for(p_attendee uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_attendee = public.auth_member_id() or public.acts_for_player(p_attendee)
$$;

-- Staff add a player to a team: managed by `p_parents`, and/or signing in as `p_user_member`
-- (a member created by the invite-member function). Atomic, so no player is left without links.
create function public.add_player(
  p_team text,
  p_name text,
  p_jersey text,
  p_parents uuid[],
  p_user_member uuid
) returns uuid
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_club uuid := public.auth_club_id();
  v_id uuid;
begin
  if not public.can_manage_team(p_team) then
    raise exception 'Only club staff and this team’s staff can add players.' using errcode = '42501';
  end if;
  if length(trim(coalesce(p_name, ''))) = 0 then
    raise exception 'Enter the player’s name.' using errcode = '22023';
  end if;
  insert into public.player_profiles (club_id, name, jersey, team_id, user_member_id, login)
  values (
    v_club, trim(p_name), coalesce(nullif(trim(p_jersey), ''), '–'), p_team, p_user_member,
    coalesce((select m.email from public.members m where m.id = p_user_member and m.club_id = v_club), '')
  )
  returning id into v_id;
  insert into public.player_parents (club_id, profile_id, member_id)
  select v_club, v_id, m.id from public.members m
  where m.club_id = v_club and m.id = any (coalesce(p_parents, '{}'));
  return v_id;
end;
$$;

-- A parent asks to link a player they manage; team staff approve it later (v2).
create function public.request_player_link(p_team text, p_name text, p_jersey text) returns uuid
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_club uuid := public.auth_club_id();
  v_me uuid := public.auth_member_id();
  v_id uuid;
begin
  if v_me is null then
    raise exception 'Sign in first.' using errcode = '42501';
  end if;
  insert into public.player_profiles (club_id, name, jersey, team_id, pending)
  values (v_club, trim(p_name), coalesce(nullif(trim(p_jersey), ''), '–'), p_team, true)
  returning id into v_id;
  insert into public.player_parents (club_id, profile_id, member_id) values (v_club, v_id, v_me);
  return v_id;
end;
$$;

-- Who manages a player's parents: club staff and the team's staff.
create function public.set_player_parents(p_profile uuid, p_parents uuid[]) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_club uuid := public.auth_club_id();
  v_team text;
begin
  select team_id into v_team from public.player_profiles where id = p_profile and club_id = v_club;
  if v_team is null or not public.can_manage_team(v_team) then
    raise exception 'Only club staff and this team’s staff can change a player’s parents.' using errcode = '42501';
  end if;
  delete from public.player_parents where profile_id = p_profile and not (member_id = any (coalesce(p_parents, '{}')));
  insert into public.player_parents (club_id, profile_id, member_id)
  select v_club, p_profile, m.id from public.members m
  where m.club_id = v_club and m.id = any (coalesce(p_parents, '{}'))
  on conflict do nothing;
end;
$$;

-- Parents, the player, club staff and the team's staff edit a profile.
create policy player_profiles_update on public.player_profiles for update to authenticated
  using (
    club_id = (select public.auth_club_id())
    and (public.acts_for_player(id) or public.can_manage_team(team_id))
  )
  with check (club_id = (select public.auth_club_id()));

-- Readable across the club; written only through the functions above.
alter table public.player_parents enable row level security;
revoke all on public.player_parents from anon;
create policy player_parents_select on public.player_parents for select to authenticated
  using (club_id = (select public.auth_club_id()));

revoke execute on function
  public.can_manage_team(text), public.acts_for_player(uuid), public.add_player(text, text, text, uuid[], uuid),
  public.request_player_link(text, text, text), public.set_player_parents(uuid, uuid[])
  from anon, public;
grant execute on function
  public.can_manage_team(text), public.acts_for_player(uuid), public.add_player(text, text, text, uuid[], uuid),
  public.request_player_link(text, text, text), public.set_player_parents(uuid, uuid[])
  to authenticated, service_role;
