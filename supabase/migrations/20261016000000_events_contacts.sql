-- Phase 6: richer events and contacts.
-- * G32: events get an optional end time and arrive-by time. (The map link is built from the
--   location in the app.)
-- * G23: weekly events. Each week is its own event (with its own RSVPs, cancellation and score);
--   events created together share a series_id, so they can be changed or deleted from one week on.
-- * G22: members' phone numbers, shown by the same rule as emails (can_see_contact, the contacts
--   setting); and each player's emergency contact and medical notes, in player_care, which only
--   the player's family (parents, the player) and staff (club staff, the team's staff) read or
--   write, whatever the contacts setting.
--
-- Mirrors libs/shared/util/src/lib/permissions.ts (canSeePlayerCare); keep them in step.
-- update-member writes phone numbers.

-- ---------------------------------------------------------------------------------------------
-- G32: end and arrive-by times
-- ---------------------------------------------------------------------------------------------

alter table public.events
  add column end_time time,
  add column arrive_by time,
  add column series_id uuid,
  add constraint events_end_time_check check (end_time is null or ("time" is not null and end_time > "time")),
  add constraint events_arrive_by_check check (arrive_by is null or ("time" is not null and arrive_by <= "time"));
create index events_series_idx on public.events (series_id) where series_id is not null;

-- ---------------------------------------------------------------------------------------------
-- G23: changing a series from one week on
-- ---------------------------------------------------------------------------------------------

-- Applies an edit of `p_event` to it and to every later event of its series: the same fields, with
-- each date moved by as many days as this one's. Scores, cancellations and RSVPs stay with each
-- week. Runs as the caller, so the events policies and the past-season guard apply to every row;
-- returns the rows changed (none if the caller cannot edit the event).
create function public.save_event_series(
  p_event uuid,
  p_type text,
  p_team text,
  p_date date,
  p_time time,
  p_location text,
  p_notes text,
  p_title text default null,
  p_opponent text default null,
  p_home boolean default null,
  p_end_time time default null,
  p_arrive_by time default null
) returns setof public.events
language plpgsql volatile security invoker set search_path = '' as $$
declare
  v_event public.events;
begin
  select * into v_event from public.events where id = p_event;
  if v_event.id is null then
    raise exception 'Event not found.' using errcode = 'P0002';
  end if;
  if v_event.series_id is null or v_event.date is null then
    raise exception 'This event does not repeat.' using errcode = '22023';
  end if;
  if p_date is null or p_time is null then
    raise exception 'Pick a date and time for the series.' using errcode = '22023';
  end if;
  return query
  update public.events e
  set type = p_type,
      team = p_team,
      title = p_title,
      opponent = p_opponent,
      home = p_home,
      date = e.date + (p_date - v_event.date),
      "time" = p_time,
      end_time = p_end_time,
      arrive_by = p_arrive_by,
      tbd = false,
      location = p_location,
      notes = p_notes
  where e.club_id = v_event.club_id
    and e.series_id = v_event.series_id
    and (e.id = p_event or e.date >= v_event.date)
  returning e.*;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- G22: phone numbers, read with emails through member_contacts()
-- ---------------------------------------------------------------------------------------------

alter table public.members
  add column phone text not null default '' check (length(phone) <= 30);

drop function public.member_contacts();
create function public.member_contacts() returns table (id uuid, email text, phone text)
language sql stable security definer set search_path = '' as $$
  select m.id, coalesce(m.email, m.username::text), m.phone
  from public.members m
  where m.club_id = public.auth_club_id() and public.can_see_contact(m.id)
$$;

-- ---------------------------------------------------------------------------------------------
-- G22: a player's emergency contact and medical notes
-- ---------------------------------------------------------------------------------------------

create table public.player_care (
  club_id uuid not null references public.clubs on delete cascade,
  profile_id uuid primary key,
  emergency_contact text not null default '' check (length(emergency_contact) <= 200),
  medical_notes text not null default '' check (length(medical_notes) <= 1000),
  foreign key (club_id, profile_id) references public.player_profiles (club_id, id) on delete cascade
);
create index player_care_club_id_idx on public.player_care (club_id);

-- canSeePlayerCare(): the player's parents and the player themself, club staff and the team's
-- staff. The same people edit the player's profile.
create function public.can_see_player_care(p_profile uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.acts_for_player(p_profile)
    or exists (
      select 1 from public.player_profiles p
      where p.id = p_profile and p.club_id = public.auth_club_id() and public.can_manage_team(p.team_id)
    )
$$;

alter table public.player_care enable row level security;
revoke all on public.player_care from anon;
grant select, insert, update, delete on public.player_care to authenticated;
create policy player_care_select on public.player_care for select to authenticated
  using (club_id = (select public.auth_club_id()) and public.can_see_player_care(profile_id));
create policy player_care_insert on public.player_care for insert to authenticated
  with check (club_id = (select public.auth_club_id()) and public.can_see_player_care(profile_id));
create policy player_care_update on public.player_care for update to authenticated
  using (club_id = (select public.auth_club_id()) and public.can_see_player_care(profile_id))
  with check (club_id = (select public.auth_club_id()) and public.can_see_player_care(profile_id));
create policy player_care_delete on public.player_care for delete to authenticated
  using (club_id = (select public.auth_club_id()) and public.can_see_player_care(profile_id));

-- Past seasons' players are read-only, as their profiles are.
create function public.guard_past_player_care() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_row public.player_care := case when tg_op = 'DELETE' then old else new end;
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
create trigger guard_past_player_care before insert or update or delete on public.player_care
  for each row execute function public.guard_past_player_care();

-- start_season() as before, and carried players keep their emergency contact and medical notes.
create or replace function public.start_season(p_name text, p_teams jsonb) returns uuid
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
        insert into public.player_care (club_id, profile_id, emergency_contact, medical_notes)
        select v_club, v_copy, c.emergency_contact, c.medical_notes from public.player_care c where c.profile_id = v_profile.id;
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

revoke execute on function
  public.save_event_series(uuid, text, text, date, time, text, text, text, text, boolean, time, time),
  public.member_contacts(), public.can_see_player_care(uuid), public.guard_past_player_care()
  from anon, public;
grant execute on function
  public.save_event_series(uuid, text, text, date, time, text, text, text, text, boolean, time, time),
  public.member_contacts(), public.can_see_player_care(uuid), public.guard_past_player_care()
  to authenticated, service_role;
