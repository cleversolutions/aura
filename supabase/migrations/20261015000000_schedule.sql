-- Phase 5: schedule and attendance.
-- * G8: events can be cancelled (kept, shown CANCELLED) as well as deleted.
-- * G21: a player's RSVP is always their player profile's, whether the player (with their own
--   sign-in) or a parent records it, so the two can no longer disagree. Members without a profile
--   (staff, parents) RSVP as themselves. Existing member-id RSVPs of players move to their profile.
-- * G31: an optional note on an RSVP ("Late, 15 min"), seen only by the event's staff and by whoever
--   RSVPs for that attendee. Statuses stay club-readable (attendance, G19).

alter table public.events add column cancelled boolean not null default false;
alter table public.rsvps add column note text not null default '' check (length(note) <= 200);

-- ---------------------------------------------------------------------------------------------
-- G21: who RSVPs for whom
-- ---------------------------------------------------------------------------------------------

-- The approved profile an attendee id stands for at an event: on the event's team, or, for a
-- club-wide event, on a team of the event's season.
create function public.rsvp_profile_fits(p_event uuid, p_profile uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.events e
    join public.player_profiles p on p.club_id = e.club_id and p.id = p_profile and not p.pending
    join public.teams t on t.club_id = p.club_id and t.id = p.team_id
    where e.id = p_event
      and (p.team_id = e.team or (e.team = 'ALL' and t.season_id = e.season_id))
  )
$$;

-- Whether the signed-in member may record `p_attendee`'s RSVP to `p_event`: their own (unless
-- they are a player, who RSVPs through their profile), or a player they parent or are, on the
-- event's team. Mirrors `canRsvp` in permissions.ts.
create function public.can_rsvp(p_event uuid, p_attendee uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.events e where e.id = p_event and e.club_id = public.auth_club_id())
    and (
      (
        p_attendee = public.auth_member_id()
        and not exists (select 1 from public.player_profiles p where p.user_member_id = p_attendee)
      )
      or (public.acts_for_player(p_attendee) and public.rsvp_profile_fits(p_event, p_attendee))
    )
$$;

create or replace function public.can_rsvp_for(p_attendee uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select (
      p_attendee = public.auth_member_id()
      and not exists (select 1 from public.player_profiles p where p.user_member_id = p_attendee)
    )
    or public.acts_for_player(p_attendee)
$$;

drop policy rsvps_insert on public.rsvps;
drop policy rsvps_update on public.rsvps;
drop policy rsvps_delete on public.rsvps;
create policy rsvps_insert on public.rsvps for insert to authenticated
  with check (club_id = (select public.auth_club_id()) and public.can_rsvp(event_id, attendee_id));
create policy rsvps_update on public.rsvps for update to authenticated
  using (club_id = (select public.auth_club_id()) and public.can_rsvp(event_id, attendee_id))
  with check (club_id = (select public.auth_club_id()) and public.can_rsvp(event_id, attendee_id));
create policy rsvps_delete on public.rsvps for delete to authenticated
  using (club_id = (select public.auth_club_id()) and public.can_rsvp(event_id, attendee_id));

-- Players' own member-id RSVPs move to their profile. Where a parent already answered for the
-- profile, the parent's answer stands.
with moves as (
  select distinct on (r.event_id, p.id) r.club_id, r.event_id, r.attendee_id as member_id, p.id as profile_id, r.status
  from public.rsvps r
  join public.player_profiles p on p.club_id = r.club_id and p.user_member_id = r.attendee_id
  where public.rsvp_profile_fits(r.event_id, p.id)
  order by r.event_id, p.id
), moved as (
  insert into public.rsvps (club_id, event_id, attendee_id, status)
  select club_id, event_id, profile_id, status from moves
  on conflict (event_id, attendee_id) do nothing
)
delete from public.rsvps r using moves m where r.event_id = m.event_id and r.attendee_id = m.member_id;

-- ---------------------------------------------------------------------------------------------
-- G31: RSVP notes, read through list_rsvps and written through set_rsvps
-- ---------------------------------------------------------------------------------------------

-- Who may read an RSVP's note: the event's staff, and whoever may RSVP for the attendee.
create function public.can_see_rsvp_note(p_event uuid, p_attendee uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
      select 1 from public.events e
      where e.id = p_event and e.club_id = public.auth_club_id() and public.can_edit_event(e.team)
    )
    or p_attendee = public.auth_member_id()
    or public.acts_for_player(p_attendee)
$$;

revoke select on public.rsvps from authenticated;
grant select (club_id, event_id, attendee_id, status) on public.rsvps to authenticated;

-- The club's RSVPs, with notes only where the signed-in member may read them.
create function public.list_rsvps()
returns table (event_id uuid, attendee_id uuid, status text, note text)
language sql stable security definer set search_path = '' as $$
  select r.event_id, r.attendee_id, r.status,
    case when public.can_see_rsvp_note(r.event_id, r.attendee_id) then r.note else '' end
  from public.rsvps r
  where r.club_id = public.auth_club_id()
$$;

-- Sets (or, with a null status, clears) the RSVP of each attendee. A null note keeps the one
-- already recorded. Runs as its definer to write notes; checks `can_rsvp` itself, and the
-- past-season trigger still applies.
create function public.set_rsvps(p_event uuid, p_attendees uuid[], p_status text, p_note text default null)
returns void
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_club uuid := public.auth_club_id();
  v_attendee uuid;
begin
  foreach v_attendee in array coalesce(p_attendees, '{}') loop
    if not public.can_rsvp(p_event, v_attendee) then
      raise exception 'You can only RSVP for yourself and your players.' using errcode = '42501';
    end if;
  end loop;
  if p_status is null then
    delete from public.rsvps where event_id = p_event and attendee_id = any (p_attendees);
    return;
  end if;
  if exists (select 1 from public.events where id = p_event and cancelled) then
    raise exception 'This event is cancelled.' using errcode = '22023';
  end if;
  insert into public.rsvps (club_id, event_id, attendee_id, status, note)
  select v_club, p_event, a, p_status, trim(coalesce(p_note, ''))
  from unnest(p_attendees) a
  on conflict (event_id, attendee_id) do update
    set status = excluded.status,
        note = case when p_note is null then public.rsvps.note else excluded.note end;
end;
$$;

revoke execute on function
  public.rsvp_profile_fits(uuid, uuid), public.can_rsvp(uuid, uuid), public.can_see_rsvp_note(uuid, uuid),
  public.list_rsvps(), public.set_rsvps(uuid, uuid[], text, text)
  from anon, public;
grant execute on function
  public.rsvp_profile_fits(uuid, uuid), public.can_rsvp(uuid, uuid), public.can_see_rsvp_note(uuid, uuid),
  public.list_rsvps(), public.set_rsvps(uuid, uuid[], text, text)
  to authenticated, service_role;
