-- Row-level security: club isolation, thread membership, RSVPs, event editing, anonymous access,
-- disabled and removed members, contact details, roster corrections, event series and care details,
-- teams and seasons, archived clubs.
-- Run with `npm run db:test` (supabase test db). Everything happens in one rolled-back transaction.
begin;
create extension if not exists pgtap with schema extensions;

select plan(203);

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
grant insert on fx to authenticated;
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

-- A player's RSVP is always their profile's (G21), whoever records it.
select pg_temp.login('a0000000-0000-0000-0000-000000000006');
select lives_ok(
  $$select public.set_rsvps('e0000000-0000-0000-0000-000000000002', array['f0000000-0000-0000-0000-000000000003']::uuid[], 'going')$$,
  'player RSVPs for themself, through their profile'
);
select throws_ok(
  $$insert into public.rsvps (club_id, event_id, attendee_id, status)
    values ('c0000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000006', 'going')$$,
  '42501', null, '... never as a member, so a parent''s answer and theirs cannot disagree'
);
select pg_temp.login('a0000000-0000-0000-0000-000000000004');
select lives_ok(
  $$select public.set_rsvps('e0000000-0000-0000-0000-000000000002', array['f0000000-0000-0000-0000-000000000003']::uuid[], 'out', 'Sick')$$,
  'the player''s parent answers for the same profile'
);
select is(
  (select status || ':' || note from public.list_rsvps()
   where event_id = 'e0000000-0000-0000-0000-000000000002' and attendee_id = 'f0000000-0000-0000-0000-000000000003'),
  'out:Sick', '... one answer, with its note'
);
select throws_ok(
  $$select public.set_rsvps('e0000000-0000-0000-0000-000000000002', array['f0000000-0000-0000-0000-000000000001']::uuid[], 'going')$$,
  '42501', null, 'parents RSVP for their players on the event''s team only'
);
select lives_ok(
  $$select public.set_rsvps('e0000000-0000-0000-0000-000000000003', array['f0000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000003']::uuid[], 'going')$$,
  '... or club-wide events'
);
select pg_temp.login('a0000000-0000-0000-0000-000000000006');
select lives_ok(
  $$select public.set_rsvps('e0000000-0000-0000-0000-000000000002', array['f0000000-0000-0000-0000-000000000003']::uuid[], 'going')$$,
  'a new answer without a note'
);
select is(
  (select status || ':' || note from public.list_rsvps()
   where event_id = 'e0000000-0000-0000-0000-000000000002' and attendee_id = 'f0000000-0000-0000-0000-000000000003'),
  'going:Sick', '... keeps the note'
);

-- RSVP notes (G31): the event's staff and the family read them; others see the status only.
select pg_temp.login('a0000000-0000-0000-0000-000000000005');
select is(
  (select status || ':' || note from public.list_rsvps()
   where event_id = 'e0000000-0000-0000-0000-000000000002' and attendee_id = 'f0000000-0000-0000-0000-000000000003'),
  'going:', 'other families see the status but not the note'
);
select throws_ok(
  'select note from public.rsvps', '42501', null, '... and cannot read notes from the table'
);
select pg_temp.login('a0000000-0000-0000-0000-000000000003');
select is(
  (select note from public.list_rsvps()
   where event_id = 'e0000000-0000-0000-0000-000000000002' and attendee_id = 'f0000000-0000-0000-0000-000000000003'),
  'Sick', 'the event''s staff read notes'
);

-- Cancelling and deleting events (G8): whoever can edit the event.
select pg_temp.login('a0000000-0000-0000-0000-000000000002');
select lives_ok(
  $$update public.events set cancelled = true where id = 'e0000000-0000-0000-0000-000000000001'$$,
  'team staff cancel their team''s events'
);
select pg_temp.login('a0000000-0000-0000-0000-000000000004');
select throws_ok(
  $$select public.set_rsvps('e0000000-0000-0000-0000-000000000001', array['f0000000-0000-0000-0000-000000000001']::uuid[], 'going')$$,
  '22023', null, 'a cancelled event takes no RSVPs'
);
select lives_ok(
  $$select public.set_rsvps('e0000000-0000-0000-0000-000000000001', array['f0000000-0000-0000-0000-000000000001']::uuid[], null)$$,
  '... but answers can still be cleared'
);
select pg_temp.login('a0000000-0000-0000-0000-000000000002');
update public.events set cancelled = false where id = 'e0000000-0000-0000-0000-000000000001';
insert into public.events (id, club_id, type, team, location) values
  ('e0000000-0000-0000-0000-000000000004', 'c0000000-0000-0000-0000-000000000001', 'practice', 'U12G', 'Twice');
select public.set_rsvps('e0000000-0000-0000-0000-000000000004', array['f0000000-0000-0000-0000-000000000001']::uuid[], 'going');
delete from public.events where id in ('e0000000-0000-0000-0000-000000000003', 'e0000000-0000-0000-0000-000000000004');
reset role;
select is(
  (select array_agg(id::text order by id) from public.events where id in ('e0000000-0000-0000-0000-000000000003', 'e0000000-0000-0000-0000-000000000004')),
  array['e0000000-0000-0000-0000-000000000003'],
  'team staff delete their team''s events, not club-wide ones'
);
select is_empty(
  $$select 1 from public.rsvps where event_id = 'e0000000-0000-0000-0000-000000000004'$$,
  '... and the RSVPs go with them'
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

-- ---------------------------------------------------------------------------------------------
-- Communication: club-wide channel, club staff in team channels, announcement channels, settings,
-- editing and deleting messages
-- ---------------------------------------------------------------------------------------------

reset role;
select ok(
  (select announce_only from public.threads where id = (select id from fx where name = 'u12g_general')) = false
  and (select bool_and(announce_only) from public.threads
       where club_id = 'c0000000-0000-0000-0000-000000000001' and is_default and name = '#announcements'),
  'team #announcements are announcement channels, #general is not'
);
insert into fx
select 'u12g_ann', id from public.threads
where club_id = 'c0000000-0000-0000-0000-000000000001' and scope = 'U12G' and name = '#announcements';
insert into public.threads (id, club_id, name, scope, teams, is_default, announce_only, creator_member_id) values
  ('d0000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000001', '#club-announcements', 'club', '{}', true, true, 'a0000000-0000-0000-0000-000000000001');
insert into public.messages (club_id, thread_id, from_member_id, text) values
  ('c0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', 'Welcome to the app!');
-- Rosa joins after the club channel exists, on no team yet.
insert into auth.users (id, email, aud, role)
values ('a1000000-0000-0000-0000-000000000008', 'u08@login.aura.invalid', 'authenticated', 'authenticated');
insert into public.members (id, club_id, user_id, username, name, kind) values
  ('a0000000-0000-0000-0000-000000000008', 'c0000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000008', 'rosa@spartans.example', 'Rosa Diaz', 'parent');

select set_eq(
  $$select public.thread_member_ids('d0000000-0000-0000-0000-000000000003')$$,
  $$select id from public.members where club_id = 'c0000000-0000-0000-0000-000000000001'$$,
  'the club channel has everyone in the club'
);
select ok(
  'a0000000-0000-0000-0000-000000000001' not in (select public.thread_member_ids((select id from fx where name = 'u12g_general'))),
  'club staff are not counted as members of team channels'
);

select pg_temp.login('a0000000-0000-0000-0000-000000000008');
select ok(public.is_thread_member('d0000000-0000-0000-0000-000000000003'), 'a member who joined later is in the club channel');
select is(
  (select text from public.messages where thread_id = 'd0000000-0000-0000-0000-000000000003'),
  'Welcome to the app!', '... and reads it'
);
select throws_ok(
  $$insert into public.messages (club_id, thread_id, from_member_id, text)
    values ('c0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000008', 'Hi!')$$,
  '42501', null, 'parents cannot post in the club channel'
);

-- Wei, a U12G parent, reads #announcements but cannot post in it.
select pg_temp.login('a0000000-0000-0000-0000-000000000005');
select ok(public.can_read_thread((select id from fx where name = 'u12g_ann')), 'parents read their team''s #announcements');
select throws_ok(
  $$insert into public.messages (club_id, thread_id, from_member_id, text)
    values ('c0000000-0000-0000-0000-000000000001', (select id from fx where name = 'u12g_ann'), 'a0000000-0000-0000-0000-000000000005', 'Ride Sunday?')$$,
  '42501', null, 'parents cannot post in #announcements'
);
select throws_ok(
  $$insert into public.club_settings (club_id, announcements) values ('c0000000-0000-0000-0000-000000000001', 'everyone')$$,
  '42501', null, 'parents cannot change club settings'
);

-- Dana, U12G staff, posts in her team's #announcements, not in the club channel.
select pg_temp.login('a0000000-0000-0000-0000-000000000002');
select lives_ok(
  $$insert into public.messages (club_id, thread_id, from_member_id, text)
    values ('c0000000-0000-0000-0000-000000000001', (select id from fx where name = 'u12g_ann'), 'a0000000-0000-0000-0000-000000000002', 'Gym change Tuesday.')$$,
  'team staff post in their team''s #announcements'
);
select throws_ok(
  $$insert into public.messages (club_id, thread_id, from_member_id, text)
    values ('c0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000002', 'Hello club')$$,
  '42501', null, 'team staff cannot post in the club channel'
);

-- Mike, U18B staff, has nothing to do with U12G #announcements.
select pg_temp.login('a0000000-0000-0000-0000-000000000003');
select ok(not public.can_read_thread((select id from fx where name = 'u12g_ann')), 'other teams'' staff do not read a team''s channels');

-- Sam, club staff: reads and posts in every team channel, and in the club channel.
select pg_temp.login('a0000000-0000-0000-0000-000000000001');
select ok(public.can_read_thread((select id from fx where name = 'u12g_general')), 'club staff read every team channel');
select is(
  (select count(*)::int from public.threads where is_default and scope = 'U18B'), 2, 'and see them in their thread list'
);
select is(
  (select count(*)::int from public.messages where thread_id = (select id from fx where name = 'u12g_ann')), 1,
  'and read their messages'
);
select lives_ok(
  $$insert into public.messages (club_id, thread_id, from_member_id, text)
    values ('c0000000-0000-0000-0000-000000000001', (select id from fx where name = 'u12g_general'), 'a0000000-0000-0000-0000-000000000001', 'Great season!')$$,
  'club staff post in team channels'
);
select lives_ok(
  $$insert into public.messages (club_id, thread_id, from_member_id, text)
    values ('c0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', 'Registration is open.')$$,
  'club staff post in the club channel'
);
select ok(not public.can_read_thread('d0000000-0000-0000-0000-000000000001'), 'but do not read custom threads they are not in');
select lives_ok(
  $$insert into public.club_settings (club_id, announcements) values ('c0000000-0000-0000-0000-000000000001', 'everyone')$$,
  'club staff let everyone post in announcement channels'
);

select pg_temp.login('a0000000-0000-0000-0000-000000000005');
select lives_ok(
  $$insert into public.messages (club_id, thread_id, from_member_id, text)
    values ('c0000000-0000-0000-0000-000000000001', (select id from fx where name = 'u12g_ann'), 'a0000000-0000-0000-0000-000000000005', 'Thanks coach!')$$,
  '... then parents post in #announcements'
);
select is(public.club_announcements('c0000000-0000-0000-0000-000000000002'), 'staff', 'other clubs keep the default');

-- Editing and deleting messages. Wei's 'Spare shoes?' is in U12G #general.
reset role;
insert into fx
select 'wei_msg', id from public.messages where text = 'Spare shoes?';
insert into fx
select 'priya_msg', id from public.messages where text = 'Thanks!' and from_member_id = 'a0000000-0000-0000-0000-000000000007';
select pg_temp.login('a0000000-0000-0000-0000-000000000005');
select is(
  (select text from public.edit_message((select id from fx where name = 'wei_msg'), ' Spare shoes, size 6? ')),
  'Spare shoes, size 6?', 'authors edit their own messages'
);
select isnt((select edited_at from public.messages where id = (select id from fx where name = 'wei_msg')), null, '... marked edited');
select throws_ok(
  $$select public.edit_message((select id from fx where name = 'priya_msg'), 'Hacked')$$,
  '42501', null, 'nobody edits other people''s messages'
);
select throws_ok(
  $$select public.delete_message((select id from fx where name = 'priya_msg'))$$,
  '42501', null, 'parents cannot delete other people''s messages'
);
select throws_ok(
  $$update public.messages set text = 'Hacked' where id = (select id from fx where name = 'priya_msg')$$,
  '42501', null, 'messages are only changed through edit_message and delete_message'
);

select pg_temp.login('a0000000-0000-0000-0000-000000000003');
select throws_ok(
  $$select public.delete_message((select id from fx where name = 'priya_msg'))$$,
  '42501', null, 'staff of another team cannot delete messages'
);

select pg_temp.login('a0000000-0000-0000-0000-000000000002');
select lives_ok($$select public.delete_message((select id from fx where name = 'priya_msg'))$$, 'team staff delete messages in their team''s channels');
reset role;
select ok(
  (select text = '' and deleted_at is not null from public.messages where id = (select id from fx where name = 'priya_msg')),
  '... which keeps the message, without its text'
);

-- ---------------------------------------------------------------------------------------------
-- Contact details: emails only through member_contacts(), by the club's contacts setting
-- ---------------------------------------------------------------------------------------------

reset role;
delete from public.club_settings where club_id = 'c0000000-0000-0000-0000-000000000001';
select pg_temp.login('a0000000-0000-0000-0000-000000000004');
select throws_ok($$select username from public.members limit 1$$, '42501', null, 'members'' usernames are not readable directly');
select throws_ok($$select email from public.members limit 1$$, '42501', null, '... nor their emails');
select set_eq(
  $$select id from public.member_contacts()$$,
  array[
    'a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000002',
    'a0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000004',
    'a0000000-0000-0000-0000-000000000006'
  ]::uuid[],
  'parents see their own, the club staff''s, their teams'' staff''s and their own players'' contacts'
);
select pg_temp.login('a0000000-0000-0000-0000-000000000003');
select ok(
  not exists (select 1 from public.member_contacts() where id = 'a0000000-0000-0000-0000-000000000005'),
  'team staff do not see other teams'' families'
);
select pg_temp.login('a0000000-0000-0000-0000-000000000002');
select ok(
  exists (select 1 from public.member_contacts() where id = 'a0000000-0000-0000-0000-000000000005'),
  '... but do see their own teams'''
);
select pg_temp.login('a0000000-0000-0000-0000-000000000001');
select is((select count(*)::int from public.member_contacts()), (select count(*)::int from public.members), 'club staff see everyone''s');
insert into public.club_settings (club_id, contacts) values ('c0000000-0000-0000-0000-000000000001', 'everyone');
select pg_temp.login('a0000000-0000-0000-0000-000000000004');
select is((select count(*)::int from public.member_contacts()), (select count(*)::int from public.members), 'with contacts = everyone, everyone sees everyone''s');
reset role;
delete from public.club_settings where club_id = 'c0000000-0000-0000-0000-000000000001';

-- ---------------------------------------------------------------------------------------------
-- Roster corrections: link requests, moving and removing players, members' teams
-- ---------------------------------------------------------------------------------------------

select pg_temp.login('a0000000-0000-0000-0000-000000000005');
insert into fx select 'request', public.request_player_link('U12G', 'Kai Chen', '');
select throws_ok($$select public.approve_player((select id from fx where name = 'request'))$$, '42501', null, 'parents cannot approve link requests');
select pg_temp.login('a0000000-0000-0000-0000-000000000003');
select throws_ok($$select public.approve_player((select id from fx where name = 'request'))$$, '42501', null, '... nor other teams'' staff');
select throws_ok($$select public.remove_player((select id from fx where name = 'request'))$$, '42501', null, '... who cannot reject them either');
select pg_temp.login('a0000000-0000-0000-0000-000000000002');
select lives_ok($$select public.approve_player((select id from fx where name = 'request'))$$, 'the team''s staff approve link requests');
select is((select pending from public.player_profiles where id = (select id from fx where name = 'request')), false, '... which joins the roster');
select lives_ok($$select public.remove_player((select id from fx where name = 'request'))$$, 'the team''s staff remove players');
select is_empty($$select 1 from public.player_profiles where id = (select id from fx where name = 'request')$$, '... who are gone');

-- Removing a player takes their parents and own sign-in off the team, unless another of their
-- players ties them to it. Rae parents Tess and Uma on U12G; Uma also plays on U18B.
reset role;
insert into public.members (id, club_id, name, kind) values
  ('a0000000-0000-0000-0000-0000000000a1', 'c0000000-0000-0000-0000-000000000001', 'Rae', 'parent'),
  ('a0000000-0000-0000-0000-0000000000a2', 'c0000000-0000-0000-0000-000000000001', 'Tess', 'player'),
  ('a0000000-0000-0000-0000-0000000000a3', 'c0000000-0000-0000-0000-000000000001', 'Uma', 'player');
insert into public.team_members (club_id, member_id, team_id)
select 'c0000000-0000-0000-0000-000000000001', m::uuid, t
from (values
  ('a0000000-0000-0000-0000-0000000000a1', 'U12G'), ('a0000000-0000-0000-0000-0000000000a2', 'U12G'),
  ('a0000000-0000-0000-0000-0000000000a3', 'U12G'), ('a0000000-0000-0000-0000-0000000000a3', 'U18B')
) v (m, t);
select pg_temp.login('a0000000-0000-0000-0000-000000000002');
insert into fx select 'tess', public.add_player('U12G', 'Tess', '4', array['a0000000-0000-0000-0000-0000000000a1']::uuid[], 'a0000000-0000-0000-0000-0000000000a2');
insert into fx select 'uma', public.add_player('U12G', 'Uma', '5', array['a0000000-0000-0000-0000-0000000000a1']::uuid[], 'a0000000-0000-0000-0000-0000000000a3');
select is(
  public.remove_player((select id from fx where name = 'tess')), 'a0000000-0000-0000-0000-0000000000a2'::uuid,
  'removing a player whose own sign-in is on no other team returns it, for manage-member to remove'
);
select is(public.member_teams('a0000000-0000-0000-0000-0000000000a2'), '{}'::text[], '... after taking it off the team');
select is(public.member_teams('a0000000-0000-0000-0000-0000000000a1'), array['U12G'], '... their parent stays, with another player on it');
select is(
  public.remove_player((select id from fx where name = 'uma')), null::uuid,
  'a player''s sign-in on another team stays in the club'
);
select is(public.member_teams('a0000000-0000-0000-0000-0000000000a3'), array['U18B'], '... leaving only this team');
select is(public.member_teams('a0000000-0000-0000-0000-0000000000a1'), '{}'::text[], '... as does a parent with no player left on it');
reset role;
delete from public.members where id in (
  'a0000000-0000-0000-0000-0000000000a1', 'a0000000-0000-0000-0000-0000000000a2', 'a0000000-0000-0000-0000-0000000000a3'
);

-- Ava (Wei's only player) moves from U12G to U18B, and back.
select throws_ok(
  $$select public.move_player('f0000000-0000-0000-0000-000000000002', 'U18B')$$,
  '42501', null, 'team staff only move players to teams they manage'
);
select pg_temp.login('a0000000-0000-0000-0000-000000000001');
select lives_ok($$select public.move_player('f0000000-0000-0000-0000-000000000002', 'U18B')$$, 'club staff move players');
select is(
  public.member_teams('a0000000-0000-0000-0000-000000000005'), array['U18B'],
  '... and their parents follow, leaving the old team when they have no other player on it'
);
select lives_ok($$select public.move_player('f0000000-0000-0000-0000-000000000002', 'U12G')$$, '... and back');
select is(public.member_teams('a0000000-0000-0000-0000-000000000005'), array['U12G'], '... parents too');

select pg_temp.login('a0000000-0000-0000-0000-000000000003');
select lives_ok(
  $$select public.set_member_teams('a0000000-0000-0000-0000-000000000005', '{U12G,U18B}')$$,
  'team staff put families on their own teams'
);
select throws_ok(
  $$select public.set_member_teams('a0000000-0000-0000-0000-000000000005', '{U18B}')$$,
  '42501', null, '... but not take them off other teams'
);
select throws_ok(
  $$select public.set_member_teams('a0000000-0000-0000-0000-000000000002', '{U12G,U18B}')$$,
  '42501', null, '... nor change staff''s teams'
);
select pg_temp.login('a0000000-0000-0000-0000-000000000001');
select lives_ok(
  $$select public.set_member_teams('a0000000-0000-0000-0000-000000000005', '{U12G}')$$,
  'club staff change anyone''s teams'
);
select is(public.member_teams('a0000000-0000-0000-0000-000000000005'), array['U12G'], '... as asked');
select throws_ok(
  $$select public.set_member_teams('a0000000-0000-0000-0000-000000000001', '{U12G}')$$,
  '42501', null, 'club staff join no team'
);

-- ---------------------------------------------------------------------------------------------
-- Member lifecycle: disabled members have no access; removed members' messages stay
-- ---------------------------------------------------------------------------------------------

reset role;
update public.members set disabled = true where id = 'a0000000-0000-0000-0000-000000000007';
select pg_temp.login('a0000000-0000-0000-0000-000000000007');
select is((select count(*)::integer from public.members), 0, 'a disabled member reads nobody');
select is((select count(*)::integer from public.messages), 0, '... and no messages');
select throws_ok(
  $$insert into public.messages (club_id, thread_id, from_member_id, text)
    values ('c0000000-0000-0000-0000-000000000001', (select id from fx where name = 'u12g_general'), 'a0000000-0000-0000-0000-000000000007', 'Still here?')$$,
  '42501', null, '... and cannot post'
);
select pg_temp.login('a0000000-0000-0000-0000-000000000001');
select ok(
  'a0000000-0000-0000-0000-000000000007' not in (select public.thread_member_ids((select id from fx where name = 'u12g_general'))),
  'disabled members are in no thread'
);
reset role;
update public.members set disabled = false where id = 'a0000000-0000-0000-0000-000000000007';
select pg_temp.login('a0000000-0000-0000-0000-000000000007');
select ok((select count(*) from public.members) > 0, 'enabled again, they have access again');

-- Jordan's unread count in U12G #general, before Wei is removed (kept as Jordan's claims).
select pg_temp.login('a0000000-0000-0000-0000-000000000004');
reset role;
create temporary table unread_before as
select unread from public.list_my_threads() where id = (select id from fx where name = 'u12g_general');
grant select on unread_before to authenticated;
delete from public.members where id = 'a0000000-0000-0000-0000-000000000005';
select is(
  (select from_member_id from public.messages where id = (select id from fx where name = 'wei_msg')),
  null, 'a removed member''s messages stay, from a former member'
);
select pg_temp.login('a0000000-0000-0000-0000-000000000004');
select is(
  (select unread from public.list_my_threads() where id = (select id from fx where name = 'u12g_general')),
  (select unread from unread_before), '... and still count as unread'
);

select pg_temp.login_platform();
select set_eq(
  $$select id from public.platform_club_staff('c0000000-0000-0000-0000-000000000001')$$,
  array['a0000000-0000-0000-0000-000000000001'::uuid],
  'the platform admin lists a club''s staff'
);
select pg_temp.login('a0000000-0000-0000-0000-000000000001');
select is_empty(
  $$select id from public.platform_club_staff('c0000000-0000-0000-0000-000000000001')$$,
  '... which club members cannot'
);

-- ---------------------------------------------------------------------------------------------
-- Richer events (G32, G23) and contacts (G22): end and arrive-by times, weekly series, phone
-- numbers, and players' emergency contacts and medical notes
-- ---------------------------------------------------------------------------------------------

select pg_temp.login('a0000000-0000-0000-0000-000000000001');
select throws_ok(
  $$insert into public.events (club_id, type, team, location, date, time, end_time)
    values ('c0000000-0000-0000-0000-000000000001', 'practice', 'U12G', 'Gym', '2030-01-08', '18:00', '17:00')$$,
  '23514', null, 'an event ends after it starts'
);
select throws_ok(
  $$insert into public.events (club_id, type, team, location, date, time, arrive_by)
    values ('c0000000-0000-0000-0000-000000000001', 'practice', 'U12G', 'Gym', '2030-01-08', '18:00', '18:15')$$,
  '23514', null, '... and players arrive no later than the start'
);

-- Dana's weekly U12G practice: three weeks, the last one cancelled.
select pg_temp.login('a0000000-0000-0000-0000-000000000002');
insert into fx values ('series', gen_random_uuid());
insert into public.events (club_id, type, team, location, date, time, end_time, series_id, cancelled)
select 'c0000000-0000-0000-0000-000000000001', 'practice', 'U12G', 'Northview', d::date, '18:00', '19:30',
  (select id from fx where name = 'series'), d = '2030-01-22'
from unnest(array['2030-01-08', '2030-01-15', '2030-01-22']) d;
insert into fx select 'week2', id from public.events where date = '2030-01-15' and series_id = (select id from fx where name = 'series');

select pg_temp.login('a0000000-0000-0000-0000-000000000003');
select is_empty(
  $$select * from public.save_event_series((select id from fx where name = 'week2'), 'practice', 'U12G', '2030-01-16', '18:30', 'Eastside', '')$$,
  'other teams'' staff cannot change a series'
);
select pg_temp.login('a0000000-0000-0000-0000-000000000002');
select is(
  (select count(*)::integer from public.save_event_series(
    (select id from fx where name = 'week2'), 'practice', 'U12G', '2030-01-16', '18:30', 'Eastside', '', p_end_time => '20:00'
  )),
  2, 'the team''s staff change a series from one week on'
);
select set_eq(
  $$select date::text || ' ' || time::text || ' ' || coalesce(end_time::text, '-') || ' ' || location || ' ' || cancelled::text
    from public.events where series_id = (select id from fx where name = 'series')$$,
  array[
    '2030-01-08 18:00:00 19:30:00 Northview false',
    '2030-01-16 18:30:00 20:00:00 Eastside false',
    '2030-01-23 18:30:00 20:00:00 Eastside true'
  ],
  '... moving each later week by the same days, keeping earlier weeks and each week''s cancellation'
);

-- Phone numbers: never read from members directly; through member_contacts() by the contacts rule.
reset role;
update public.members set phone = '555-0134' where id = 'a0000000-0000-0000-0000-000000000002';
update public.members set phone = '555-0177' where id = 'a0000000-0000-0000-0000-000000000007';
select pg_temp.login('a0000000-0000-0000-0000-000000000004');
select throws_ok($$select phone from public.members limit 1$$, '42501', null, 'phone numbers are not readable directly');
select is(
  (select phone from public.member_contacts() where id = 'a0000000-0000-0000-0000-000000000002'),
  '555-0134', 'families read their teams'' staff''s phone numbers'
);
select pg_temp.login('a0000000-0000-0000-0000-000000000003');
select is_empty(
  $$select phone from public.member_contacts() where id = 'a0000000-0000-0000-0000-000000000007'$$,
  '... and staff do not read other teams'' families'''
);

-- Care details: Maya's (Jordan and Dana are her parents, Dana coaches U12G) and Eli's (Jordan's,
-- signing in himself).
select pg_temp.login('a0000000-0000-0000-0000-000000000004');
select lives_ok(
  $$insert into public.player_care (club_id, profile_id, emergency_contact, medical_notes) values
    ('c0000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000001', 'Grandma · 555-0100', 'Asthma'),
    ('c0000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000003', 'Jordan · 555-0101', '')$$,
  'parents record their players'' care details'
);
select pg_temp.login('a0000000-0000-0000-0000-000000000006');
select set_eq(
  $$select profile_id from public.player_care$$, array['f0000000-0000-0000-0000-000000000003'::uuid],
  'players read their own'
);
select pg_temp.login('a0000000-0000-0000-0000-000000000007');
select is_empty($$select 1 from public.player_care$$, 'other parents on the team read none');
select pg_temp.login('a0000000-0000-0000-0000-000000000003');
select set_eq(
  $$select profile_id from public.player_care$$, array['f0000000-0000-0000-0000-000000000003'::uuid],
  'team staff read their own team''s players'' only'
);
select throws_ok(
  $$insert into public.player_care (club_id, profile_id) values ('c0000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000002')$$,
  '42501', null, '... and write no other team''s'
);
select pg_temp.login('a0000000-0000-0000-0000-000000000001');
update public.player_care set medical_notes = 'Asthma: inhaler in her bag' where profile_id = 'f0000000-0000-0000-0000-000000000001';
select is(
  (select medical_notes from public.player_care where profile_id = 'f0000000-0000-0000-0000-000000000001'),
  'Asthma: inhaler in her bag', 'club staff read and edit every player''s'
);
reset role;
insert into public.club_settings (club_id, contacts) values ('c0000000-0000-0000-0000-000000000001', 'everyone');
select pg_temp.login('a0000000-0000-0000-0000-000000000007');
select is_empty($$select 1 from public.player_care$$, 'letting everyone see contacts shows nobody else''s care details');
reset role;
delete from public.club_settings where club_id = 'c0000000-0000-0000-0000-000000000001';
select pg_temp.login('a0000000-0000-0000-0000-000000000012');
select is_empty($$select 1 from public.player_care$$, 'other clubs read none');

-- ---------------------------------------------------------------------------------------------
-- Teams and seasons: new teams' ids, starting a season, past seasons read-only, deleting teams
-- ---------------------------------------------------------------------------------------------

reset role;
create temporary table season_fx (name text primary key, id text);
grant select, insert on season_fx to authenticated;
insert into season_fx values ('old', public.current_season_id('c0000000-0000-0000-0000-000000000001')::text);

select pg_temp.login('a0000000-0000-0000-0000-000000000001');
select is(
  (select count(*)::integer from public.seasons where ended_at is null),
  1, 'a club starts with one current season, and members see only their club''s'
);
insert into public.teams (club_id, name, age, division) values ('c0000000-0000-0000-0000-000000000001', 'U8 Mixed', 'U8', 'Mixed');
select ok(
  (select id from public.teams where name = 'U8 Mixed') ~ '^t[0-9a-f]{11}$',
  'new teams get an id not derived from their name'
);
select is(
  (select season_id::text from public.teams where name = 'U8 Mixed'), (select id from season_fx where name = 'old'),
  '... in the current season'
);
select throws_ok(
  $$insert into public.teams (club_id, name) values ('c0000000-0000-0000-0000-000000000001', 'u8 mixed ')$$,
  '23505', null, 'team names are unique within a season'
);
select lives_ok(
  $$update public.teams set name = 'U12 Girls Red' where id = 'U12G'$$, 'club staff rename a team'
);

select pg_temp.login('a0000000-0000-0000-0000-000000000002');
select throws_ok(
  $$select public.start_season('Next', '[]')$$, '42501', null, 'only club staff start a season'
);
select throws_ok($$select public.delete_team('U8 Mixed')$$, '42501', null, '... or delete teams');

select pg_temp.login('a0000000-0000-0000-0000-000000000001');
select throws_ok(
  $$select public.delete_team('U12G')$$, 'P0001', null, 'a team with players or events cannot be deleted'
);
select lives_ok(
  $$select public.delete_team((select id from public.teams where name = 'U8 Mixed'))$$, 'an empty team can'
);
select is(
  (select count(*)::integer from public.threads where scope = (select id from public.teams where name = 'U8 Mixed')),
  0, '... with its channels'
);
select throws_ok(
  $$select public.start_season('Next', '[{"from": "U12G", "name": "A"}, {"from": "U18B", "name": "a"}]')$$,
  'P0001', null, 'carried teams need different names'
);
insert into season_fx
select 'new', public.start_season('Next', '[{"from": "U12G", "name": "U13 Girls", "age": "U13", "division": "Girls", "staff": true, "players": true}]')::text;
insert into season_fx select 'u13g', id from public.teams where name = 'U13 Girls';

select ok(
  (select ended_at is not null from public.seasons where id::text = (select id from season_fx where name = 'old')),
  'starting a season ends the old one'
);
select is(
  (select season_id::text from public.teams where name = 'U13 Girls'), (select id from season_fx where name = 'new'),
  'carried teams join the new season'
);
select is_empty(
  $$select 1 from public.team_members where team_id in ('U12G', 'U18B')$$,
  'the old season''s memberships move to history'
);
select set_eq(
  $$select member_id from public.past_team_members where team_id = 'U12G'$$,
  array[
    'a0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000004',
    'a0000000-0000-0000-0000-000000000007'
  ]::uuid[],
  '... where they are kept'
);
select set_eq(
  $$select member_id from public.team_members where team_id = (select id from season_fx where name = 'u13g')$$,
  $$select 'a0000000-0000-0000-0000-000000000002'::uuid
    union select pp.member_id from public.player_profiles p
      join public.player_parents pp on pp.profile_id = p.id join public.members m on m.id = pp.member_id
      where p.team_id = 'U12G' and not p.pending and m.kind = 'parent'$$,
  'the new team has its staff, and the parents of its approved players'
);
select is(
  public.member_teams('a0000000-0000-0000-0000-000000000003'), '{}'::text[],
  'staff of a team left out are on no team'
);
select set_eq(
  $$select pp.member_id from public.player_profiles p join public.player_parents pp on pp.profile_id = p.id
    where p.team_id = (select id from season_fx where name = 'u13g') and p.name = 'Maya Smith'$$,
  array['a0000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000002']::uuid[],
  'carried players are copied with their parents'
);
select is(
  (select count(*)::integer from public.player_profiles where team_id = 'U12G' and not pending),
  (select count(*)::integer from public.player_profiles where team_id = (select id from season_fx where name = 'u13g')),
  '... and the old season keeps its own'
);
select is(
  (select c.medical_notes from public.player_care c join public.player_profiles p on p.id = c.profile_id
    where p.team_id = (select id from season_fx where name = 'u13g') and p.name = 'Maya Smith'),
  'Asthma: inhaler in her bag', 'carried players keep their care details'
);

-- Past seasons are read-only, for club staff too.
select throws_ok(
  $$update public.events set location = 'Moved' where id = 'e0000000-0000-0000-0000-000000000001'$$,
  'P0001', null, 'a past season''s events cannot change'
);
select throws_ok(
  $$insert into public.events (club_id, type, team, location) values ('c0000000-0000-0000-0000-000000000001', 'practice', 'U12G', 'Gym')$$,
  'P0001', null, '... nor gain events'
);
select throws_ok(
  $$update public.teams set name = 'Renamed' where id = 'U12G'$$, 'P0001', null, '... nor its teams'
);
select throws_ok(
  $$select public.set_member_teams('a0000000-0000-0000-0000-000000000003', '{U18B}')$$,
  'P0001', null, '... nor its rosters'
);
select throws_ok(
  $$select public.remove_player('f0000000-0000-0000-0000-000000000002')$$, 'P0001', null, '... nor its players'
);
select throws_ok(
  $$update public.player_care set medical_notes = '' where profile_id = 'f0000000-0000-0000-0000-000000000001'$$,
  'P0001', null, '... nor their care details'
);
select throws_ok(
  $$insert into public.messages (club_id, thread_id, from_member_id, text)
    values ('c0000000-0000-0000-0000-000000000001', (select id from fx where name = 'u12g_general'), 'a0000000-0000-0000-0000-000000000001', 'Anyone?')$$,
  'P0001', null, '... nor its team chats'
);
select pg_temp.login('a0000000-0000-0000-0000-000000000004');
select throws_ok(
  $$insert into public.rsvps (club_id, event_id, attendee_id, status)
    values ('c0000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000001', 'going')$$,
  'P0001', null, '... nor its RSVPs'
);
select pg_temp.login('a0000000-0000-0000-0000-000000000001');
insert into public.events (club_id, type, team, location) values ('c0000000-0000-0000-0000-000000000001', 'special', 'ALL', 'Hall 2');
select is(
  (select season_id::text from public.events where location = 'Hall 2'), (select id from season_fx where name = 'new'),
  'club-wide events made now belong to the new season'
);
select pg_temp.login('a0000000-0000-0000-0000-000000000011');
select ok(
  (select ended_at is null from public.seasons where club_id = 'c0000000-0000-0000-0000-000000000002'),
  'other clubs'' seasons are untouched'
);

-- ---------------------------------------------------------------------------------------------
-- Archived clubs (G24): members read everything and change nothing; the platform admin sees it.
-- The Panthers are archived as the service would (no signed-in member).
-- ---------------------------------------------------------------------------------------------

select set_config('role', 'postgres', true);
select set_config('request.jwt.claims', '', true);
update public.members set invited = true where id = 'a0000000-0000-0000-0000-000000000013';
update public.clubs set archived_at = now() where id = 'c0000000-0000-0000-0000-000000000002';

select pg_temp.logout();
select ok(
  (select archived_at is not null from public.club_public where slug = 'tst-panthers'),
  'an archived club says so before signing in'
);

select pg_temp.login('a0000000-0000-0000-0000-000000000011');
select is(
  (select count(*)::int from public.members where club_id = 'c0000000-0000-0000-0000-000000000002'), 3,
  'members of an archived club still read it'
);
select throws_ok(
  $$update public.teams set name = 'Renamed' where id = 'U13B'$$,
  'P0001', 'This club is archived. It is read-only.', 'an archived club''s teams cannot change'
);
select throws_ok(
  $$insert into public.events (club_id, type, team, location) values ('c0000000-0000-0000-0000-000000000002', 'practice', 'U13B', 'Gym')$$,
  'P0001', null, '... nor its schedule'
);
select throws_ok(
  $$insert into public.messages (club_id, thread_id, from_member_id, text)
    select club_id, id, 'a0000000-0000-0000-0000-000000000011', 'Hello?' from public.threads
    where club_id = 'c0000000-0000-0000-0000-000000000002' limit 1$$,
  'P0001', null, '... nor its chats'
);
select throws_ok(
  $$update public.members set name = 'Morgan L.' where id = 'a0000000-0000-0000-0000-000000000011'$$,
  'P0001', null, '... nor its members'
);
select lives_ok(
  $$select public.mark_thread_read(id) from public.threads where club_id = 'c0000000-0000-0000-0000-000000000002' limit 1$$,
  'members still mark threads read'
);

select pg_temp.login('a0000000-0000-0000-0000-000000000013');
select lives_ok($$select public.accept_invite()$$, 'an invited member still joins an archived club');
select is(
  (select invited from public.members where id = 'a0000000-0000-0000-0000-000000000013'), false,
  '... and is no longer invited'
);

select pg_temp.login_platform();
select is(
  (select row(archived_at is not null, member_count, invited_count, team_count)::text
   from public.platform_clubs() where id = 'c0000000-0000-0000-0000-000000000002'),
  row(true, 3, 0, 1)::text,
  'the platform admin sees the club archived, with its members, invites and teams counted'
);

select set_config('role', 'postgres', true);
select set_config('request.jwt.claims', '', true);
update public.clubs set archived_at = null where id = 'c0000000-0000-0000-0000-000000000002';
select pg_temp.login('a0000000-0000-0000-0000-000000000011');
select lives_ok($$update public.teams set name = 'U13 Boys Red' where id = 'U13B'$$, 'a restored club can change again');

select * from finish();
rollback;
