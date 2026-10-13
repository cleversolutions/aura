-- Taking a player off the roster also takes them out of the team's chats.
-- * Their parents leave the team unless another of their players is on it (staff who are parents
--   keep their teams), as move_player() does.
-- * The player's own sign-in leaves the team too. If it is now on no team, remove_player() returns
--   its member id and manage-member removes it from the club with its sign-in, as removing a member
--   does. Only edge functions delete sign-ins.
-- * Player sign-ins already left behind (joined, with no roster entry in any season) are removed.

drop function public.remove_player(uuid);
create function public.remove_player(p_profile uuid) returns uuid
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_team text := public.managed_profile_team(p_profile, 'remove');
  v_player uuid;
  v_parents uuid[];
begin
  select user_member_id into v_player from public.player_profiles where id = p_profile;
  select coalesce(array_agg(member_id), '{}') into v_parents from public.player_parents where profile_id = p_profile;

  delete from public.rsvps where attendee_id = p_profile;
  delete from public.player_profiles where id = p_profile;

  -- Whoever is no longer tied to the team by a player on it leaves it.
  delete from public.team_members tm
  using public.members m
  where m.id = tm.member_id
    and tm.team_id = v_team
    and (
      (m.kind = 'parent' and m.id = any (v_parents))
      or (m.kind = 'player' and m.id = v_player)
    )
    and not exists (
      select 1 from public.player_profiles p
      where p.club_id = tm.club_id and p.team_id = v_team
        and (p.user_member_id = m.id or exists (
          select 1 from public.player_parents pp where pp.profile_id = p.id and pp.member_id = m.id
        ))
    );

  -- A player's sign-in on no team any more goes from the club (manage-member does that).
  if exists (
    select 1 from public.members m
    where m.id = v_player and m.kind = 'player'
      and not exists (select 1 from public.team_members tm where tm.member_id = m.id)
  ) then
    return v_player;
  end if;
  return null;
end;
$$;

revoke execute on function public.remove_player(uuid) from anon, public;
grant execute on function public.remove_player(uuid) to authenticated, service_role;

-- Player sign-ins left behind by removing their roster entries: joined, and on no roster in any
-- season. Their RSVPs, then them (foreign keys unlink the rest, as removing a member does), then
-- their sign-ins. Invites stay listed on the Roster, where they can be cancelled.
with orphans as (
  select m.id, m.user_id from public.members m
  where m.kind = 'player' and not m.invited
    and not exists (select 1 from public.player_profiles p where p.user_member_id = m.id)
), rsvps as (
  delete from public.rsvps r using orphans o where r.attendee_id = o.id
), members as (
  delete from public.members m using orphans o where m.id = o.id returning m.user_id
)
delete from auth.users u using members m where u.id = m.user_id;
