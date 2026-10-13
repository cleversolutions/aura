-- Phase 7: platform admin housekeeping (G24).
-- * Archiving a club: clubs.archived_at. An archived club is read-only. Its members still sign in and
--   read everything, but nothing they do changes it: a guard on every table they can write refuses
--   their writes, and the edge functions refuse club members' requests (callerMember). Reading
--   threads (thread_reads) and muting them (thread_mutes) are personal and still work. The platform
--   admin archives and restores clubs through update-club.
-- * Club cards: platform_clubs() also returns each club's member, invite and team counts.

alter table public.clubs add column archived_at timestamptz;

-- Public branding, readable before signing in, now with whether the club is archived.
create or replace view public.club_public as
  select id, slug, name, logo_url, ink, paper, icon_192_url, icon_512_url, archived_at from public.clubs;

-- ---------------------------------------------------------------------------------------------
-- Archived clubs are read-only for their members. Like the past-season guards, these apply to
-- signed-in members only; the service role (edge functions, cascades) and the platform admin
-- still write.
-- ---------------------------------------------------------------------------------------------

create function public.is_club_archived(p_club uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.clubs where id = p_club and archived_at is not null)
$$;

create function public.guard_archived_club() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_row jsonb := to_jsonb(case when tg_op = 'DELETE' then old else new end);
  v_club uuid := (v_row ->> case when tg_table_name = 'clubs' then 'id' else 'club_id' end)::uuid;
begin
  if public.signed_in_write() and not public.is_platform_admin() and public.is_club_archived(v_club) then
    -- Accepting an invite (choosing a password at first sign-in) still works.
    if tg_table_name = 'members' and tg_op = 'UPDATE'
      and (to_jsonb(new) - 'invited') = (to_jsonb(old) - 'invited') then
      return new;
    end if;
    raise exception 'This club is archived. It is read-only.';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'clubs', 'club_settings', 'members', 'seasons', 'teams', 'team_members', 'player_profiles',
    'player_parents', 'player_care', 'events', 'rsvps', 'threads', 'thread_members', 'messages'
  ]
  loop
    execute format(
      'create trigger guard_archived_club before insert or update or delete on public.%I
         for each row execute function public.guard_archived_club()',
      v_table
    );
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Platform admin: clubs with their admin, whether they are archived, and how many people (joined
-- and not disabled), open invites and this season's teams they have.
-- ---------------------------------------------------------------------------------------------

drop function public.platform_clubs();
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
  archived_at timestamptz,
  admin_name text,
  admin_email text,
  member_count integer,
  invited_count integer,
  team_count integer
)
language sql stable security definer set search_path = '' as $$
  select c.id, c.slug, c.name, c.logo_url, c.ink, c.paper, c.logo_ink, c.logo_paper,
    c.icon_192_url, c.icon_512_url, c.created_at, c.archived_at, a.name, a.username::text,
    (select count(*)::int from public.members m where m.club_id = c.id and not m.invited and not m.disabled),
    (select count(*)::int from public.members m where m.club_id = c.id and m.invited),
    (select count(*)::int from public.teams t
      where t.club_id = c.id and t.season_id = public.current_season_id(c.id))
  from public.clubs c
  left join public.members a on a.id = c.admin_member_id
  where public.is_platform_admin()
  order by c.created_at
$$;

revoke execute on function
  public.is_club_archived(uuid), public.guard_archived_club(), public.platform_clubs()
  from anon, public;
grant execute on function
  public.is_club_archived(uuid), public.platform_clubs()
  to authenticated, service_role;
