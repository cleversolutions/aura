-- Row-level security: club isolation, thread membership, RSVPs, event editing, anonymous access.
-- Run with `npm run db:test` (supabase test db). Everything happens in one rolled-back transaction.
begin;
create extension if not exists pgtap with schema extensions;

select plan(62);

-- ---------------------------------------------------------------------------------------------
-- Fixture: two clubs, each with a Jordan Smith who shares a username but is a different person.
-- Independent of seeded data (`npm run db:seed`), which may also be present.
-- Member ids end in the same digits as their auth user ids (a0.. members, a1.. users).
-- ---------------------------------------------------------------------------------------------

insert into auth.users (id, email, aud, role)
select ('a1000000-0000-0000-0000-0000000000' || n)::uuid, 'u' || n || '@login.aura.invalid', 'authenticated', 'authenticated'
from unnest(array['01', '02', '03', '04', '05', '06', '07', '11', '12', '13']) as n;

insert into public.clubs (id, slug, name, ink, paper, logo_ink, logo_paper) values
  ('c0000000-0000-0000-0000-000000000001', 'tst-spartans', 'Spartans', '#000000', '#ffffff', '#000000', '#ffffff'),
  ('c0000000-0000-0000-0000-000000000002', 'tst-panthers', 'Panthers', '#1d2a6b', '#f6c945', '#1d2a6b', '#f6c945');

insert into public.members (id, club_id, user_id, username, name, kind) values
  -- Spartans
  ('a0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'sam@spartans.example', 'Sam Okoro', 'club'),
  ('a0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000002', 'dana@spartans.example', 'Dana Reyes', 'staff'),
  ('a0000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000003', 'mike@spartans.example', 'Mike Tran', 'staff'),
  ('a0000000-0000-0000-0000-000000000004', 'c0000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000004', 'jordan.smith@email.com', 'Jordan Smith', 'parent'),
  ('a0000000-0000-0000-0000-000000000005', 'c0000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000005', 'wei@spartans.example', 'Wei Chen', 'parent'),
  ('a0000000-0000-0000-0000-000000000006', 'c0000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000006', 'eli.smith@email.com', 'Eli Smith', 'player'),
  ('a0000000-0000-0000-0000-000000000007', 'c0000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000007', 'priya@spartans.example', 'Priya Patel', 'parent'),
  -- Panthers
  ('a0000000-0000-0000-0000-000000000011', 'c0000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000011', 'morgan@panthers.example', 'Morgan Lee', 'club'),
  ('a0000000-0000-0000-0000-000000000012', 'c0000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000012', 'jordan.smith@email.com', 'Jordan Smith', 'parent'),
  ('a0000000-0000-0000-0000-000000000013', 'c0000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000013', 'pat@panthers.example', 'Pat Kim', 'staff');

insert into public.teams (club_id, id, name) values
  ('c0000000-0000-0000-0000-000000000001', 'U12G', 'U12 Girls'),
  ('c0000000-0000-0000-0000-000000000001', 'U18B', 'U18 Boys'),
  ('c0000000-0000-0000-0000-000000000002', 'U13B', 'U13 Boys');

insert into public.team_members (club_id, member_id, team_id) values
  ('c0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000002', 'U12G'),
  ('c0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000003', 'U18B'),
  ('c0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000004', 'U12G'),
  ('c0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000004', 'U18B'),
  ('c0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000005', 'U12G'),
  ('c0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000006', 'U18B'),
  ('c0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000007', 'U12G'),
  ('c0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000012', 'U13B'),
  ('c0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000013', 'U13B');

insert into public.player_profiles (id, club_id, name, jersey, team_id, user_member_id) values
  ('f0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'Maya Smith', '8', 'U12G', null),
  ('f0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000001', 'Ava Chen', '4', 'U12G', null),
  ('f0000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000001', 'Eli Smith', '1', 'U18B', 'a0000000-0000-0000-0000-000000000006'),
  ('f0000000-0000-0000-0000-000000000011', 'c0000000-0000-0000-0000-000000000002', 'Sky Smith', '12', 'U13B', null);
-- Maya has two parents: Jordan, and Dana, who is also U12G staff.
insert into public.player_parents (club_id, profile_id, member_id) values
  ('c0000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000004'),
  ('c0000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000002'),
  ('c0000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000005'),
  ('c0000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000004'),
  ('c0000000-0000-0000-0000-000000000002', 'f0000000-0000-0000-0000-000000000011', 'a0000000-0000-0000-0000-000000000012');

insert into public.events (id, club_id, type, team, location) values
  ('e0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'practice', 'U12G', 'Northview'),
  ('e0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000001', 'game', 'U18B', 'Spartan Centre'),
  ('e0000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000001', 'special', 'ALL', 'Hall'),
  ('e0000000-0000-0000-0000-000000000011', 'c0000000-0000-0000-0000-000000000002', 'practice', 'U13B', 'Eastside Gym');

insert into public.rsvps (club_id, event_id, attendee_id, status) values
  ('c0000000-0000-0000-0000-000000000002', 'e0000000-0000-0000-0000-000000000011', 'f0000000-0000-0000-0000-000000000011', 'going');

-- Custom threads. Carpool: creator Jordan plus Wei, no linked teams. Coaches: staff of both teams.
insert into public.threads (id, club_id, name, scope, teams, include_staff, include_parents, include_players, creator_member_id) values
  ('d0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'Carpool', 'U12G', '{}', true, true, true, 'a0000000-0000-0000-0000-000000000004'),
  ('d0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000001', 'Club coaches', 'club', '{U12G,U18B}', true, false, false, 'a0000000-0000-0000-0000-000000000001'),
  ('d0000000-0000-0000-0000-000000000011', 'c0000000-0000-0000-0000-000000000002', 'Panthers news', 'club', '{U13B}', true, true, true, 'a0000000-0000-0000-0000-000000000011');
insert into public.thread_members (club_id, thread_id, member_id) values
  ('c0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000005');
insert into public.messages (club_id, thread_id, from_member_id, text) values
  ('c0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000004', 'I can drive Thursday.'),
  ('c0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'Coaches meeting Thursday.'),
  ('c0000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000011', 'a0000000-0000-0000-0000-000000000011', 'Welcome!');

-- Default U12G #general, created by the teams trigger.
create temporary table fx (name text primary key, id uuid);
grant select on fx to authenticated, anon;
insert into fx
select 'u12g_general', id from public.threads
where club_id = 'c0000000-0000-0000-0000-000000000001' and scope = 'U12G' and name = '#general';
insert into public.messages (club_id, thread_id, from_member_id, text)
select 'c0000000-0000-0000-0000-000000000001', id, 'a0000000-0000-0000-0000-000000000005', 'Spare shoes?'
from fx where name = 'u12g_general';

-- Sign in as a member (by member id), as the platform admin, or as nobody.
create function pg_temp.login(p_member uuid) returns void language plpgsql as $$
declare
  m record;
begin
  perform set_config('role', 'postgres', true);
  select user_id, club_id into m from public.members where id = p_member;
  perform set_config('request.jwt.claims', json_build_object(
    'sub', m.user_id, 'role', 'authenticated',
    'app_metadata', json_build_object('club_id', m.club_id, 'member_id', p_member)
  )::text, true);
  perform set_config('role', 'authenticated', true);
end;
$$;
create function pg_temp.login_platform() returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', json_build_object(
    'sub', 'a1000000-0000-0000-0000-000000000099', 'role', 'authenticated',
    'app_metadata', json_build_object('role', 'platform_admin')
  )::text, true);
  perform set_config('role', 'authenticated', true);
end;
$$;
create function pg_temp.logout() returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
  perform set_config('role', 'anon', true);
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Default channels
-- ---------------------------------------------------------------------------------------------

select is(
  (select count(*)::int from public.threads where is_default and club_id = 'c0000000-0000-0000-0000-000000000001'),
  4, 'each team gets #announcements and #general'
);

-- ---------------------------------------------------------------------------------------------
-- Club isolation: Spartans' Jordan and Panthers' Jordan see only their own club
-- ---------------------------------------------------------------------------------------------

select pg_temp.login('a0000000-0000-0000-0000-000000000004');
select is((select count(*)::int from public.clubs), 1, 'Spartans Jordan sees one club');
select is((select slug from public.clubs), 'tst-spartans', '... and it is the Spartans');
select is((select count(*)::int from public.members where club_id <> 'c0000000-0000-0000-0000-000000000001'), 0, 'no Panthers members');
select is((select count(*)::int from public.members), 7, 'all Spartans members');
select is((select count(*)::int from public.teams where club_id <> 'c0000000-0000-0000-0000-000000000001'), 0, 'no Panthers teams');
select is((select count(*)::int from public.player_profiles where club_id <> 'c0000000-0000-0000-0000-000000000001'), 0, 'no Panthers profiles');
select is((select count(*)::int from public.events where club_id <> 'c0000000-0000-0000-0000-000000000001'), 0, 'no Panthers events');
select is((select count(*)::int from public.rsvps where club_id <> 'c0000000-0000-0000-0000-000000000001'), 0, 'no Panthers RSVPs');
select is((select count(*)::int from public.threads where club_id <> 'c0000000-0000-0000-0000-000000000001'), 0, 'no Panthers threads');
select is((select count(*)::int from public.messages where club_id <> 'c0000000-0000-0000-0000-000000000001'), 0, 'no Panthers messages');
select is(public.auth_member_id(), 'a0000000-0000-0000-0000-000000000004'::uuid, 'auth_member_id resolves the Spartans Jordan');
select throws_ok(
  $$insert into public.messages (club_id, thread_id, from_member_id, text)
    values ('c0000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000011', 'a0000000-0000-0000-0000-000000000004', 'hi')$$,
  '42501', null, 'cannot post into a Panthers thread'
);

select pg_temp.login('a0000000-0000-0000-0000-000000000012');
select is((select slug from public.clubs), 'tst-panthers', 'Panthers Jordan sees only the Panthers');
select is((select count(*)::int from public.members where club_id <> 'c0000000-0000-0000-0000-000000000002'), 0, 'no Spartans members');
select is((select count(*)::int from public.events where club_id <> 'c0000000-0000-0000-0000-000000000002'), 0, 'no Spartans events');
select is((select count(*)::int from public.messages where club_id <> 'c0000000-0000-0000-0000-000000000002'), 0, 'no Spartans messages');
select is(public.auth_member_id(), 'a0000000-0000-0000-0000-000000000012'::uuid, 'same username, different member');
select is((select count(*)::int from public.messages), 1, 'reads the Panthers thread it is in via its team');

-- ---------------------------------------------------------------------------------------------
-- Thread membership
-- ---------------------------------------------------------------------------------------------

-- Wei: added individually to Carpool, parent on U12G (so in #general), not staff.
select pg_temp.login('a0000000-0000-0000-0000-000000000005');
select ok(public.is_thread_member('d0000000-0000-0000-0000-000000000001'), 'individually added member is in Carpool');
select ok(public.is_thread_member((select id from fx where name = 'u12g_general')), 'parent on U12G is in U12G #general via team');
select ok(not public.is_thread_member('d0000000-0000-0000-0000-000000000002'), 'parents are not in a staff-only thread');
select is((select count(*)::int from public.messages where thread_id = 'd0000000-0000-0000-0000-000000000002'), 0, 'cannot read the staff thread');

-- Priya: parent on U12G, not in Carpool.
select pg_temp.login('a0000000-0000-0000-0000-000000000007');
select is((select count(*)::int from public.threads where id = 'd0000000-0000-0000-0000-000000000001'), 0, 'non-member does not see Carpool');
select is((select count(*)::int from public.messages where thread_id = 'd0000000-0000-0000-0000-000000000001'), 0, 'non-member cannot read Carpool');
select throws_ok(
  $$insert into public.messages (club_id, thread_id, from_member_id, text)
    values ('c0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000007', 'hi')$$,
  '42501', null, 'non-member cannot post to Carpool'
);
select throws_ok(
  $$insert into public.messages (club_id, thread_id, from_member_id, text)
    values ('c0000000-0000-0000-0000-000000000001', (select id from fx where name = 'u12g_general'), 'a0000000-0000-0000-0000-000000000005', 'spoof')$$,
  '42501', null, 'cannot post as someone else'
);
select lives_ok(
  $$insert into public.messages (club_id, thread_id, from_member_id, text)
    values ('c0000000-0000-0000-0000-000000000001', (select id from fx where name = 'u12g_general'), 'a0000000-0000-0000-0000-000000000007', 'Thanks!')$$,
  'team member can post to #general'
);

-- Dana: U12G staff. Sees Carpool (scope U12G) for oversight but not its messages; in the coaches thread.
select pg_temp.login('a0000000-0000-0000-0000-000000000002');
select ok(public.can_manage_thread('d0000000-0000-0000-0000-000000000001'), 'team staff can manage custom threads on their team');
select is((select count(*)::int from public.threads where id = 'd0000000-0000-0000-0000-000000000001'), 1, 'and see them');
select is((select count(*)::int from public.messages where thread_id = 'd0000000-0000-0000-0000-000000000001'), 0, 'but not read them');
select ok(public.is_thread_member('d0000000-0000-0000-0000-000000000002'), 'staff are in the coaches thread via their team');
select ok(not public.can_manage_thread((select id from fx where name = 'u12g_general')), 'default channels are never manageable');

-- Sam: club staff are never auto-included, but manage every custom thread.
select pg_temp.login('a0000000-0000-0000-0000-000000000001');
select ok(not public.is_thread_member((select id from fx where name = 'u12g_general')), 'club staff are not auto-included');
select ok(public.can_manage_thread('d0000000-0000-0000-0000-000000000001'), 'club staff manage any custom thread');

reset role;
select set_eq(
  $$select public.thread_member_ids('d0000000-0000-0000-0000-000000000002')$$,
  $$values ('a0000000-0000-0000-0000-000000000001'::uuid), ('a0000000-0000-0000-0000-000000000002'), ('a0000000-0000-0000-0000-000000000003')$$,
  'coaches thread: creator plus staff of linked teams'
);

-- ---------------------------------------------------------------------------------------------
-- RSVPs: parents for their own players only
-- ---------------------------------------------------------------------------------------------

select pg_temp.login('a0000000-0000-0000-0000-000000000004');
select lives_ok(
  $$insert into public.rsvps (club_id, event_id, attendee_id, status)
    values ('c0000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000001', 'going')$$,
  'parent RSVPs for their player'
);
select throws_ok(
  $$insert into public.rsvps (club_id, event_id, attendee_id, status)
    values ('c0000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000002', 'going')$$,
  '42501', null, 'parent cannot RSVP for another family''s player'
);
delete from public.rsvps where event_id = 'e0000000-0000-0000-0000-000000000011';
reset role;
select is(
  (select count(*)::int from public.rsvps where event_id = 'e0000000-0000-0000-0000-000000000011'),
  1, 'cannot clear another club''s RSVP'
);

select pg_temp.login('a0000000-0000-0000-0000-000000000006');
select lives_ok(
  $$insert into public.rsvps (club_id, event_id, attendee_id, status)
    values ('c0000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000006', 'going')$$,
  'player RSVPs for themself'
);

-- ---------------------------------------------------------------------------------------------
-- Events: team staff edit their own teams only, never club-wide events
-- ---------------------------------------------------------------------------------------------

select pg_temp.login('a0000000-0000-0000-0000-000000000002');
select lives_ok(
  $$insert into public.events (club_id, type, team, location)
    values ('c0000000-0000-0000-0000-000000000001', 'practice', 'U12G', 'Gym')$$,
  'team staff add events for their team'
);
select throws_ok(
  $$insert into public.events (club_id, type, team, location)
    values ('c0000000-0000-0000-0000-000000000001', 'special', 'ALL', 'Hall')$$,
  '42501', null, 'team staff cannot add ALL events'
);
update public.events set location = 'Elsewhere'
where id in ('e0000000-0000-0000-0000-000000000002', 'e0000000-0000-0000-0000-000000000003');
reset role;
select is(
  (select count(*)::int from public.events where location = 'Elsewhere'),
  0, 'team staff cannot edit another team''s or club-wide events'
);
select pg_temp.login('a0000000-0000-0000-0000-000000000002');
select throws_ok(
  $$update public.events set team = 'U18B' where id = 'e0000000-0000-0000-0000-000000000001'$$,
  '42501', null, 'team staff cannot move an event to another team'
);

select pg_temp.login('a0000000-0000-0000-0000-000000000001');
select lives_ok(
  $$update public.events set score_us = 1, score_them = 2 where id = 'e0000000-0000-0000-0000-000000000003'$$,
  'club staff edit club-wide events'
);

-- ---------------------------------------------------------------------------------------------
-- Platform admin and anonymous access
-- ---------------------------------------------------------------------------------------------

select pg_temp.login_platform();
select is((select count(*)::int from public.clubs where slug like 'tst-%'), 2, 'platform admin reads every club');
select is((select count(*)::int from public.members), 0, 'but no club content');

select pg_temp.logout();
select is((select count(*)::int from public.club_public where slug like 'tst-%'), 2, 'anonymous users read public branding');
select throws_ok('select * from public.clubs', '42501', null, 'but not the clubs table');
select throws_ok('select * from public.members', '42501', null, 'or club content');

-- ---------------------------------------------------------------------------------------------
-- Players: several parents, staff who are parents, and who adds and edits players
-- ---------------------------------------------------------------------------------------------

-- Dana coaches U12G and is Maya's parent: she RSVPs for Maya, not for Ava.
select pg_temp.login('a0000000-0000-0000-0000-000000000002');
select ok(public.can_rsvp_for('f0000000-0000-0000-0000-000000000001'), 'a coach who is a parent RSVPs for their player');
select ok(not public.can_rsvp_for('f0000000-0000-0000-0000-000000000002'), 'but not for other players');
select lives_ok(
  $$select public.add_player('U12G', 'Davis Moore', '7', array['a0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000007']::uuid[], null)$$,
  'team staff add a player with two parents and no email'
);
select is(
  (select count(*)::int from public.player_parents pp join public.player_profiles p on p.id = pp.profile_id where p.name = 'Davis Moore'),
  2, '... linked to both parents'
);
select throws_ok(
  $$select public.add_player('U18B', 'Nope', '', '{}', null)$$,
  '42501', null, 'team staff cannot add players to other teams'
);
select lives_ok(
  $$update public.player_profiles set jersey = '9' where id = 'f0000000-0000-0000-0000-000000000002'$$,
  'team staff edit players on their team'
);

select pg_temp.login('a0000000-0000-0000-0000-000000000004');
select ok(public.can_rsvp_for('f0000000-0000-0000-0000-000000000001'), 'the other parent still RSVPs for Maya');
select throws_ok(
  $$select public.add_player('U12G', 'Nope', '', '{}', null)$$,
  '42501', null, 'parents cannot add players'
);
select throws_ok(
  $$select public.set_player_parents('f0000000-0000-0000-0000-000000000001', '{}')$$,
  '42501', null, 'parents cannot change a player''s parents'
);
select throws_ok(
  $$insert into public.player_parents (club_id, profile_id, member_id) values ('c0000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000004')$$,
  '42501', null, 'nobody writes player_parents directly'
);
select lives_ok(
  $$select public.request_player_link('U12G', 'Sky Smith', '')$$,
  'a parent requests a pending link for their player'
);
reset role;
select is(
  (select pending from public.player_profiles where name = 'Sky Smith' and club_id = 'c0000000-0000-0000-0000-000000000001'),
  true, '... which is pending'
);

select * from finish();
rollback;
