-- Roster corrections: approving or rejecting parents' link requests, moving and removing players,
-- changing which teams a member is on, giving a player their own sign-in, and who sees whose
-- contact details.
--
-- Mirrors libs/shared/util/src/lib/permissions.ts (canSeeContact, canChangeMemberTeam); keep them
-- in step. invite-member links a player's new sign-in to their profile.

-- ---------------------------------------------------------------------------------------------
-- Contact visibility, a club setting. 'staff': club staff see everyone's contacts, team staff
-- their teams' people, and families their teams' staff and the club staff. 'everyone': everyone in
-- the club sees everyone's.
-- ---------------------------------------------------------------------------------------------

alter table public.club_settings
  add column contacts text not null default 'staff' check (contacts in ('staff', 'everyone'));

-- canSeeContact(): whether the signed-in member may see `p_member`'s email.
create function public.can_see_contact(p_member uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.members me
    join public.members them on them.club_id = me.club_id and them.id = p_member
    where me.id = public.auth_member_id()
      and (
        me.id = them.id
        or me.kind = 'club'
        or them.kind = 'club'
        or coalesce((select s.contacts from public.club_settings s where s.club_id = me.club_id), 'staff') = 'everyone'
        -- A player you act for (your child, signing in themselves).
        or exists (
          select 1 from public.player_profiles p
          join public.player_parents pp on pp.profile_id = p.id
          where p.user_member_id = them.id and pp.member_id = me.id
        )
        or (
          (me.kind = 'staff' or them.kind = 'staff')
          and exists (
            select 1 from public.team_members a
            join public.team_members b on b.team_id = a.team_id and b.club_id = a.club_id
            where a.member_id = me.id and b.member_id = them.id
          )
        )
      )
  )
$$;

-- Members read each other's names, roles and teams; emails and usernames only through
-- member_contacts(), which applies the setting above.
revoke select on public.members from authenticated;
grant select (id, club_id, user_id, name, kind, title, invited, disabled) on public.members to authenticated;

create function public.member_contacts() returns table (id uuid, email text)
language sql stable security definer set search_path = '' as $$
  select m.id, coalesce(m.email, m.username::text)
  from public.members m
  where m.club_id = public.auth_club_id() and public.can_see_contact(m.id)
$$;

-- ---------------------------------------------------------------------------------------------
-- Player profiles. `login` copied the player's email, which would show it to everyone; a player's
-- own sign-in is their member (user_member_id), whose email member_contacts() returns.
-- ---------------------------------------------------------------------------------------------

alter table public.player_profiles drop column login;

create or replace function public.add_player(
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
  insert into public.player_profiles (club_id, name, jersey, team_id, user_member_id)
  values (v_club, trim(p_name), coalesce(nullif(trim(p_jersey), ''), '–'), p_team, p_user_member)
  returning id into v_id;
  insert into public.player_parents (club_id, profile_id, member_id)
  select v_club, v_id, m.id from public.members m
  where m.club_id = v_club and m.id = any (coalesce(p_parents, '{}'));
  return v_id;
end;
$$;

-- The team of a profile in the signed-in member's club, if they manage it.
create function public.managed_profile_team(p_profile uuid, p_action text) returns text
language plpgsql stable security definer set search_path = '' as $$
declare
  v_team text;
begin
  select team_id into v_team from public.player_profiles where id = p_profile and club_id = public.auth_club_id();
  if v_team is null then
    raise exception 'Player not found.' using errcode = 'P0002';
  end if;
  if not public.can_manage_team(v_team) then
    raise exception 'Only club staff and this team’s staff can % players.', p_action using errcode = '42501';
  end if;
  return v_team;
end;
$$;

-- A parent's link request joins the roster.
create function public.approve_player(p_profile uuid) returns void
language plpgsql volatile security definer set search_path = '' as $$
begin
  perform public.managed_profile_team(p_profile, 'approve');
  update public.player_profiles set pending = false where id = p_profile;
end;
$$;

-- Takes a player off the roster, or rejects a link request. Their parents stay members, and a
-- player's own sign-in stays (club staff remove it separately). Their RSVPs go with them.
create function public.remove_player(p_profile uuid) returns void
language plpgsql volatile security definer set search_path = '' as $$
begin
  perform public.managed_profile_team(p_profile, 'remove');
  delete from public.rsvps where attendee_id = p_profile;
  delete from public.player_profiles where id = p_profile;
end;
$$;

-- Moves a player to another team, for whoever manages both. Their parents and own sign-in join
-- the new team (and its channels); parents leave the old team unless another of their players is
-- on it, and staff who are parents keep their teams. RSVPs for the old team's events go.
create function public.move_player(p_profile uuid, p_team text) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_club uuid := public.auth_club_id();
  v_old text := public.managed_profile_team(p_profile, 'move');
  v_player uuid;
begin
  if v_old = p_team then
    return;
  end if;
  if not exists (select 1 from public.teams where club_id = v_club and id = p_team) then
    raise exception 'Team not found.' using errcode = 'P0002';
  end if;
  if not public.can_manage_team(p_team) then
    raise exception 'You can only move players to teams you manage.' using errcode = '42501';
  end if;

  update public.player_profiles set team_id = p_team where id = p_profile returning user_member_id into v_player;
  delete from public.rsvps r
  using public.events e
  where r.attendee_id = p_profile and e.id = r.event_id and e.team = v_old;

  insert into public.team_members (club_id, member_id, team_id)
  select v_club, m.id, p_team
  from public.members m
  where m.club_id = v_club
    and (
      m.id = v_player
      or (m.kind = 'parent' and m.id in (select member_id from public.player_parents where profile_id = p_profile))
    )
  on conflict do nothing;

  delete from public.team_members tm
  using public.members m
  where tm.member_id = m.id
    and tm.team_id = v_old
    and m.club_id = v_club
    and (
      (m.id = v_player and m.kind = 'player')
      or (
        m.kind = 'parent'
        and m.id in (select member_id from public.player_parents where profile_id = p_profile)
        and not exists (
          select 1 from public.player_profiles other
          join public.player_parents pp on pp.profile_id = other.id
          where other.team_id = v_old and pp.member_id = m.id
        )
      )
    );
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- A member's teams: club staff for any team member, team staff for parents and players on their
-- own teams. Club staff join no team.
-- ---------------------------------------------------------------------------------------------

-- canChangeMemberTeam(): whether the signed-in member may put `p_member` on, or take them off,
-- `p_team`.
create function public.can_change_member_team(p_member uuid, p_team text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.members me
    join public.members them on them.club_id = me.club_id and them.id = p_member
    where me.id = public.auth_member_id()
      and them.kind <> 'club'
      and (
        me.kind = 'club'
        or (
          me.kind = 'staff'
          and them.kind in ('parent', 'player')
          and exists (select 1 from public.team_members x where x.member_id = me.id and x.team_id = p_team)
        )
      )
  )
$$;

create function public.set_member_teams(p_member uuid, p_teams text[]) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_club uuid := public.auth_club_id();
  v_team text;
begin
  if not exists (select 1 from public.members where id = p_member and club_id = v_club) then
    raise exception 'Member not found.' using errcode = 'P0002';
  end if;
  for v_team in
    (select unnest(coalesce(p_teams, '{}')) except select team_id from public.team_members where member_id = p_member)
    union
    (select team_id from public.team_members where member_id = p_member except select unnest(coalesce(p_teams, '{}')))
  loop
    if not public.can_change_member_team(p_member, v_team) then
      raise exception 'You can’t change who is on %.', v_team using errcode = '42501';
    end if;
  end loop;
  delete from public.team_members where member_id = p_member and not (team_id = any (coalesce(p_teams, '{}')));
  insert into public.team_members (club_id, member_id, team_id)
  select v_club, p_member, t.id from public.teams t
  where t.club_id = v_club and t.id = any (coalesce(p_teams, '{}'))
  on conflict do nothing;
end;
$$;

revoke execute on function
  public.can_see_contact(uuid), public.member_contacts(), public.managed_profile_team(uuid, text),
  public.approve_player(uuid), public.remove_player(uuid), public.move_player(uuid, text),
  public.can_change_member_team(uuid, text), public.set_member_teams(uuid, text[])
  from anon, public;
grant execute on function
  public.can_see_contact(uuid), public.member_contacts(), public.managed_profile_team(uuid, text),
  public.approve_player(uuid), public.remove_player(uuid), public.move_player(uuid, text),
  public.can_change_member_team(uuid, text), public.set_member_teams(uuid, text[])
  to authenticated, service_role;
