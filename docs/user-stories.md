# User stories

The scenarios a club runs through in its first season, written so each one can become an end-to-end test. They come
from a hands-on walkthrough of the app on 2026-10-10 against local Supabase, as every kind of user in a brand-new
club.

Each story has a **status**:

- ✅ **Passes**: the app does this today. A future e2e suite should lock it in as a regression test.
- ❌ **Gap**: the app can't do this yet. The story states the behaviour we want; the e2e test should be written
  once it's built, or kept as an expected failure until then. Gap ids (G1, G2, …) refer to the gap list from the
  same walkthrough.

## Cast and test data

Every run creates its own club, so tests never depend on or change the seeded demo clubs (Spartans, Panthers).

| Who          | Role                                          | Signs in as           | Notes                                            |
| ------------ | --------------------------------------------- | --------------------- | ------------------------------------------------ |
| Alex         | Platform admin                                | `admin@aura.example`  | Seeded by `npm run db:seed`.                     |
| Casey Morgan | Club admin (club staff)                       | `casey@<run>.example` | Created with the club.                           |
| Evan Moore   | Team staff, U11 Boys, **and** Davis's parent  | `evan@<run>.example`  | Invited while creating the team.                 |
| Jenn Buell   | Parent of Davis                               | `jenn@<run>.example`  | First invited with a typo, `jenn@<run>.exmaple`. |
| Rosa Ortiz   | Parent of Liam                                | `rosa@<run>.example`  |                                                  |
| Noah Kim     | Player with his own sign-in                   | `noah@<run>.example`  |                                                  |
| Davis Moore  | Player, #7, managed by Evan and Jenn          | (no sign-in)          |                                                  |
| Liam Ortiz   | Player, #12, first linked to the wrong parent | (no sign-in)          |                                                  |

`<run>` is a per-run suffix, so runs never collide. Temporary passwords come from the app (the invite-ready sheet,
or the "club created" screen). Each person then chooses their own.

---

## 1. Platform admin

**US-1.1 Sign in to the admin console** ✅

- Given the platform admin account exists
- When Alex opens `/admin` and signs in with email and password
- Then the CLUBS list shows every club with its logo, colours, admin and link.

**US-1.2 Create a club** ✅

- When Alex opens + NEW CLUB, enters "Riverside Rockets", and uploads a PNG logo (a red circle on white):
  - The app colours are read from the logo (primary `#b3122e`, secondary `#ffffff`).
  - The contrast check passes.
  - The live preview uses those colours.
- When Alex enters the admin's name and email and presses CREATE CLUB
- Then "CLUB CREATED" shows the club link and a temporary password.
- And the club appears on the CLUBS list.
- And the URL is the club's own page (`/admin/clubs/<id>`), so a refresh shows the club rather than an empty form.

**US-1.3 Edit a club** ✅

- When Alex opens a club from the list
- Then the name, logo, colours, admin name and admin email can be changed and saved.
- Changing the admin's email moves their sign-in to the new address. The edge function tests cover this.

**US-1.4 Preview a club** ✅

- When Alex presses OPEN APP PREVIEW
- Then the club opens with its own branding over sample data, and no real member's data is shown.

**US-1.5 Reset a club admin's password** ❌ G5

- Given Casey has forgotten their password
- When Alex chooses "Reset password" for Casey
- Then a new temporary password is shown, and Casey must choose their own at next sign-in.

**US-1.6 Change who the club admin is, or add a second one** ❌ G16, G24

**US-1.7 Archive a club** ❌ G24

---

## 2. Club admin: first run

**US-2.1 First sign-in with a temporary password** ✅

- When Casey opens the club link and signs in as `Casey@Rockets.example ` (capital letter, trailing space)
- Then sign-in succeeds: usernames ignore case and surrounding spaces.
- And Casey is asked to choose a password:
  - mismatched passwords show "The passwords don’t match.";
  - reusing the temporary password shows "Choose a password different from the temporary one.";
  - a valid password lands on the schedule with "Password saved. Welcome to Riverside Rockets!"

**US-2.2 Know what to do first** ❌ G27

- Given a new club with no teams
- When Casey opens Roster
- Then they're guided to create a team. Today the page is blank, and team creation is only under More.

**US-2.3 Create a team with a new coach** ✅

- When Casey opens More → + CREATE TEAM, picks U11 and BOYS, and fills in "invite new staff" with Evan Moore and
  his email
- Then the team "U11 Boys" is created with #announcements and #general.
- And the invite-ready sheet shows the club link, Evan's username and a temporary password, each with a copy
  button, plus COPY INVITE MESSAGE.

**US-2.4 Create a team before a coach is found** ❌ G15

- When Casey creates a team without assigning staff
- Then the team is created. Today: "Assign at least one team staff member."

**US-2.5 Teams the age and division pickers can't express** ❌ G17

- For example: U11 Boys Red and U11 Boys Blue, a U8 team, a mixed team, adults.

---

## 3. Club admin: people and roster

**US-3.1 Invite a parent** ✅

- When Casey opens Roster → INVITE MEMBER → Parent, and enters "Jenn Buell" with the email `jenn@<run>.exmaple`
  (typo)
- Then the invite-ready sheet shows her sign-in.
- And Jenn appears under INVITED as "Parent · invited as jenn@<run>.exmaple".
- Known issue (G2): the toast says "Added to 0 U11 Boys threads"; for club staff the count is wrong.

**US-3.2 Fix a typo in an invite, then resend it** ✅

- When Casey taps Jenn under INVITED → EDIT, corrects the email and presses SAVE
- Then her details show the corrected email.
- When Casey presses RESEND INVITE
- Then a new temporary password is shown with the corrected username.
- And the previous temporary password no longer signs in.

**US-3.3 Cancel an invite** ✅

- When staff tap an invited person → CANCEL INVITE → confirm
- Then they're removed from the roster, and their temporary password no longer works.

**US-3.4 Add a player with two parents, one of them the coach** ✅

- When Casey presses ADD PLAYER, enters "Davis Moore", #7, ticks Evan Moore (Team Staff) and Jenn Buell (Parent),
  and presses ADD PLAYER
- Then Davis appears under PLAYERS with "Parents: Evan Moore, Jenn Buell".

**US-3.5 Correct a player linked to the wrong parent** ✅

- Given Liam Ortiz was added with Jenn as his parent by mistake, and Rosa Ortiz has been invited
- When Casey opens Liam → EDIT, unticks Jenn, ticks Rosa and saves
- Then Liam's parents show only Rosa Ortiz, and his row reads "Parents: Rosa Ortiz".

**US-3.6 Add a player who signs in themselves** ✅

- When Casey adds "Noah Kim", #9, ticks "Signs in themselves" and enters his email
- Then the invite-ready sheet shows Noah's sign-in.
- And Noah is on the roster, linked to that sign-in.

**US-3.7 Remove a parent from a child (a family change)** ✅

- When Casey opens Davis → EDIT, unticks Evan and saves
- Then Davis's parents show only Jenn Buell.
- And Evan no longer sees Davis as his player.

**US-3.8 Remove a player from the roster** ❌ G10

**US-3.9 Move a player to another team** ❌ G9

**US-3.10 Put an existing parent on a second team (a sibling elsewhere)** ❌ G12

- Today, inviting the same email again fails with "already has an account at this club".

**US-3.11 Change an invite's team** ❌ G11

**US-3.12 Remove a member who has left the club** ❌ G13

**US-3.13 A coach steps down before a replacement is found** ❌ G14

- Today the last coach can't be unticked: "Assign at least one team staff member."

**US-3.14 Approve or reject a parent's link request** ❌ G3

- See US-5.5.

**US-3.15 Reset a member's password** ❌ G5

**US-3.16 Invite another club staff member** ❌ G16

**US-3.17 Edit own profile** ✅

- When Casey opens More → EDIT PROFILE and changes their name, email or title
- Then More shows the new details, and the new email is their sign-in from now on.

---

## 4. Club admin and coach: schedule and chat

**US-4.1 Create a practice for a team** ✅ for the coach, ⚠ for club staff (G7)

- When the coach (Evan) presses + EVENT → PRACTICE, sets a date, time and location, and presses CREATE EVENT
- Then the practice appears under UPCOMING with the U11B badge.
- Club staff: the form defaults to "Club-wide", so an event they don't assign is silently club-wide. Expected: it
  defaults to a team, or asks.

**US-4.2 Create a game** ✅

- With an opponent, home or away, date, time and location.

**US-4.3 Fix an event's team, time or place** ✅

- When staff open the event → EDIT EVENT, change the team and press SAVE CHANGES
- Then the card shows the new team badge.

**US-4.4 A coach can't edit club-wide or other teams' events** ✅

- When Evan opens a club-wide game
- Then there's no EDIT EVENT.

**US-4.5 Cancel or delete an event** ❌ G8

**US-4.6 Weekly practices** ❌ G23

**US-4.7 See who's coming** ❌ G19

- Given parents and players have RSVP'd
- When the coach opens the event
- Then they see each player as going, out or undecided, with a count.
- Today only "YOUR RSVP" is shown.

**US-4.8 Coach-parent RSVPs separately for themself and their child** ❌ G20

- Today one tap marks both Evan and Davis going.

**US-4.9 Post a club announcement everyone receives** ❌ G1

- When Casey posts in #club-announcements
- Then every member of the club sees it. Today the thread has 1 member: Casey.

**US-4.10 Club admin messages a team** ❌ G2

- Club staff don't see teams' #announcements or #general.

**US-4.11 Coach posts to the team** ✅

- When Evan opens U11B #announcements and sends a message
- Then it appears in the thread, with "U11 Boys · 3 members" (the coach and two invited parents).
- And parents see it as unread.

**US-4.12 Record a game score** ✅ (seen in the demo club; not run in the new club, which had no past games)

---

## 5. Parent

**US-5.1 Accept an invite** ✅

- When Jenn signs in with the temporary password from US-3.2 and chooses her own password
- Then she's on the schedule, with "Parent · 1 linked player".

**US-5.2 RSVPs are shared between parents** ✅

- Given Evan marked Davis going for Sunday's practice
- When Jenn opens that practice
- Then "RSVP FOR: Davis Moore · GOING" is already set.
- And confirming OUT changes it for both parents.

**US-5.3 See the team** ✅

- Jenn's roster shows the team staff, players with their parents, and a PARENTS section ("Jenn Buell (you) · Parent
  of Davis Moore").
- She has no ADD PLAYER or INVITE MEMBER.
- She has no EDIT on other families' players or on staff.

**US-5.4 What parents can see about others** ❌ G26 (decision needed)

- Today parents can open anyone's details and see their email, and see the INVITED list with emails.

**US-5.5 Link a second child** ⚠ request ✅, approval ❌ G3

- When Jenn presses LINK NEW PLAYER and sends a request for Ava Moore
- Then Ava shows on her More tab as "Pending team staff approval".
- Missing: staff can't see or approve the request, and Ava already appears in the PARENTS line for Jenn.

**US-5.6 Parents can't post in #announcements** ❌ G4

- Today Jenn's message posts.

**US-5.7 Player access shows co-parents** ✅

- More shows "Davis Moore · Managed by you and Evan Moore".

**US-5.8 Forgot password** ❌ G5

---

## 6. Player

**US-6.1 Player signs in themselves** ✅

- When Noah signs in with the temporary password from US-3.6 and chooses his own
- Then More shows "Player · U11 Boys" and his player tile "Has own login · noah@…".
- And he RSVPs for himself.

**US-6.2 A player and their parents RSVP to the same record** ❌ G21

- Today a player's own RSVP and their parents' RSVP for them are stored separately and can disagree.

---

## Turning this into an e2e suite

Notes from running these scenarios by hand:

- **Isolation.**
  - Create a fresh club per run, through `/admin` (UI) or the `create-club` edge function (faster setup). Use a
    random slug.
  - Delete the club and its auth users afterwards.
  - Don't reseed the demo clubs: `npm run db:seed` replaces the Spartans and Panthers (it refuses if they were
    changed by hand, unless forced). `npm run test:supabase` already works this way: see
    `libs/backend/supabase/src/lib/demo-clubs.ts`.
- **Order.** The stories build on each other (club → team → invites → players → people accept). Run them as one
  serial flow per club, or seed the earlier steps through the API and test each story on its own.
- **Several people.** Most stories switch user. Prefer a separate browser context per person, so their sessions
  are independent (sessions are stored per club in `localStorage`). Signing out and in on one page also works.
- **Temporary passwords** are only shown once, on the invite-ready sheet: read them from the page.
- **Selectors.** Prefer roles and accessible names:
  - Buttons by text (`ADD PLAYER`, `SEND INVITE`, `SAVE`).
  - `aria-label`s such as `Edit Spartans` and `Close`.
  - Component tags (`aura-person-details`, `aura-add-player-form`) as containers.
  - Chat threads are links (`<a>`), not buttons.
  - Event cards are `<article>`s whose first button opens the event.
- **Inputs** are bound through `input` events, so use real typing (e.g. Playwright's `fill`), not value assignment
  alone.
- **Password managers.** Browser extensions that offer to save passwords can cover the page after a sign-in. Run
  the suite in a clean browser profile.
- **Time.** Schedule tests use dates relative to today. A run late in the day can push "tomorrow" across midnight
  in other time zones, so pin the browser's time zone.
