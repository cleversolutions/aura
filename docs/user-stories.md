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
- Then the CLUBS list shows every club with its logo, colours, admin and link, and how many members, open invites
  and teams (this season's) it has (G24).

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

**US-1.5 Reset a club admin's password** ✅ (G5)

- Given Casey has forgotten their password
- When Alex opens the club → ADMIN ACCOUNT → RESET PASSWORD and confirms RESET
- Then a new temporary password is shown once, with a copy button.
- And Casey's old password no longer signs in, open sessions end, and Casey must choose their own password at next
  sign-in.

**US-1.6 Change who the club admin is, or add a second one** ✅ (G16)

- Given Casey has invited a second club staff member (US-3.16), who has signed in
- When Alex opens the club → CHANGE ADMIN → MAKE ADMIN next to them, and confirms
- Then they are the club admin: the CLUBS list shows them, and the club form edits their details.
- And Casey stays on the club staff.
- Club staff who are still invited, or disabled, have no MAKE ADMIN.

**US-1.7 Archive a club** ✅ (G24)

- Given the Riverside Rockets have stopped using the app
- When Alex opens the club → ARCHIVE → ARCHIVE CLUB and confirms ARCHIVE
- Then the CLUBS list shows the club under ARCHIVED, with the date it was archived.
- And its members can still sign in and read the schedule, roster and chat, under a banner saying the club is
  archived; but there is nothing to RSVP, post, invite or edit, and the database and edge functions refuse any
  change they try.
- When Alex presses RESTORE CLUB, the club works as before.

---

## 2. Club admin: first run

**US-2.1 First sign-in with a temporary password** ✅

- When Casey opens the club link and signs in as `Casey@Rockets.example ` (capital letter, trailing space)
- Then sign-in succeeds: usernames ignore case and surrounding spaces.
- And Casey is asked to choose a password:
  - mismatched passwords show "The passwords don’t match.";
  - reusing the temporary password shows "Choose a password different from the temporary one.";
  - a valid password lands on the schedule with "Password saved. Welcome to Riverside Rockets!"

**US-2.2 Know what to do first** ✅ (G27)

- Given a new club with no teams
- When Casey opens Roster
- Then GET STARTED · 0 OF 3 lists: create a team, invite a coach, add players. Only CREATE TEAM has a button,
  which opens the team form under More.
- When the team exists, INVITE COACH (the invite form, set to Team Staff) and ADD PLAYER appear.
- The checklist goes once the club has a team, a coach and an approved player. Other people never see it.

**US-2.3 Create a team with a new coach** ✅

- When Casey opens More → + CREATE TEAM, picks U11 and BOYS (which fill in the name "U11 Boys"), and fills in
  "invite new staff" with Evan Moore and his email
- Then the team "U11 Boys" is created with #announcements and #general.
- And the invite-ready sheet shows the club link, Evan's username and a temporary password, each with a copy
  button, plus COPY INVITE MESSAGE.

**US-2.4 Create a team before a coach is found** ✅ (G15)

- When Casey creates a team without assigning staff
- Then the team is created: "… created. #announcements and #general are ready. Club staff manage it until it has
  staff."

**US-2.5 Teams the age and division pickers can't express** ✅ (G17)

- When Casey picks U11 and BOYS, then types the name "U11 Boys Red", and creates "U11 Boys Blue" the same way
- Then both teams exist; the age (U6–U19, Adult) and division (Boys, Girls, Mixed) are optional, and a typed name
  is kept.
- A second "u11 boys red" this season is refused: "u11 boys red already exists this season."
- Team ids are generated, never derived from the name, so MANAGE TEAM can rename a team.
- A team created by mistake, with no players and no events, can be deleted (DELETE TEAM, confirmed), with its
  channels. Any other team is refused.

**US-2.6 Start a new season** ✅ (G18)

- Given the club's first season, `2026–27` (named for the school year when the club was created)
- When Casey opens More → SEASON → START NEW SEASON
- Then the new season is named `2027–28`, and each team is listed a year older ("U11 Boys Red" → "U12 Boys Red"),
  ticked, with STAFF and PLAYERS ticked.
- When Casey unticks a team, unticks PLAYERS on another (to rebuild it), and confirms START SEASON
- Then the new season has the ticked teams. Their staff, approved players (copied, with their parents) and those
  players' parents and own sign-ins are on them; everyone else stays in the club on no team.
- And `2026–27` is read-only: its teams, rosters, events, RSVPs and team chats cannot change, even for club staff.
- Roster and Schedule show a season picker. The past season's rosters (staff, players, parents) and schedule
  (results) are shown read-only. Its team chats are kept but no longer listed.
- Move single players between the new teams afterwards (US-3.9).

---

## 3. Club admin: people and roster

**US-3.1 Invite a parent** ✅

- When Casey opens Roster → INVITE MEMBER → Parent, and enters "Jenn Buell" with the email `jenn@<run>.exmaple`
  (typo)
- Then the invite-ready sheet shows her sign-in.
- And Jenn appears under INVITED as "Parent · invited as jenn@<run>.exmaple".
- And the toast says "Jenn Buell invited. Added to 3 chat threads automatically." (#club-announcements, and U11B
  #announcements and #general).
- And no toast or sheet claims anyone was emailed or notified (G25).

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

**US-3.8 Remove a player from the roster** ✅ (G10)

- When Casey opens Liam → REMOVE FROM ROSTER and confirms REMOVE
- Then Liam is gone from PLAYERS, with his RSVPs.
- And Rosa stays in the club, but leaves U11 Boys and its chats, since she has no other player on it. Evan, a parent
  who is also staff, keeps his teams.
- When a player with their own sign-in (Noah) is removed, his sign-in leaves the team too. If U11 Boys was his only
  team, his sign-in is removed from the club: he can no longer sign in, and his messages stay, from "Former member".
  If he is on another team, he stays in the club on that team.
- Only club staff and the team's staff can do it.

**US-3.9 Move a player to another team** ✅ (G9)

- When Casey opens Davis → EDIT, picks another TEAM and saves
- Then the roster follows Davis to his new team.
- And his parents join the new team and its channels; Jenn leaves U11 Boys unless another of her players is on it,
  and Evan (staff) keeps coaching it. His RSVPs for U11 Boys events go.
- Team staff move players only between teams they coach.

**US-3.10 Put an existing parent on a second team (a sibling elsewhere)** ✅ (G12)

- When Casey opens INVITE MEMBER → ALREADY IN CLUB, picks the other team and Jenn, and presses ADD TO TEAM
- Then Jenn is on both teams with one sign-in, and in both teams' channels.
- Or: Jenn's details → EDIT → tick the team under TEAMS.
- Team staff add families to their own teams only; inviting the same email again still fails with "already has
  an account at this club".

**US-3.11 Change an invite's team** ✅ (G11)

- When Casey opens an invited parent → EDIT, unticks the wrong team, ticks the right one and saves
- Then the invite moves teams; their temporary password still works.

**US-3.12 Disable or remove a member who has left the club** ✅ (G13)

- When Casey opens Rosa's details → DISABLE and confirms
- Then Rosa can't sign in ("This account is disabled. Ask your club’s staff."), any session she has open reads
  nothing, and she drops out of every chat thread.
- And club staff still see her, marked "disabled", with ENABLE to restore her.
- When Casey chooses REMOVE FROM CLUB instead and confirms
- Then Rosa is gone from the roster and her sign-in is deleted. She is unlinked from Liam, and her RSVPs are
  deleted.
- And her messages stay, from "Former member".
- Nobody can disable or remove themselves or the club admin, and only club staff can do either.

**US-3.13 A coach steps down before a replacement is found** ✅ (G14)

- When Casey opens More → the team → MANAGE TEAM, unticks the last coach, and saves
- Then the team has no staff ("No staff assigned"), and club staff manage it meanwhile.

**US-3.14 Approve or reject a parent's link request** ✅ (G3)

- Given Jenn requested Ava Moore (US-5.5)
- When Evan (U11 Boys staff) opens the roster
- Then PENDING REQUESTS lists "Ava Moore · Requested by Jenn Buell", and Ava isn't under PLAYERS or in Jenn's
  PARENTS line.
- When he opens Ava, corrects her jersey (EDIT), and presses APPROVE
- Then Ava is on the roster, and Jenn reads "Parent of Ava Moore, Davis Moore".
- Or REJECT, confirmed, deletes the request.
- Parents and other teams' staff can't approve.

**US-3.18 Give an older player their own sign-in** ✅ (G30)

- When Casey opens Davis → GIVE OWN SIGN-IN, enters his email and presses CREATE SIGN-IN
- Then the invite-ready sheet shows Davis's sign-in, and his details show OWN SIGN-IN.
- And his parents keep access. Parents ask staff for this; the More tab no longer has an "own login" field that
  did nothing.

**US-3.19 Add a player and invite their parent in one go** ✅ (G29)

- When Casey presses ADD PLAYER, enters "Liam Ortiz", presses "+ Invite a parent who isn't listed" and enters
  Rosa's name and email
- Then Rosa is invited to the team and linked to Liam, and the invite-ready sheet shows her sign-in (then Liam's,
  if he signs in himself).
- And Rosa shows under PARENTS as "Parent of Liam Ortiz · invited" until she joins (G28).

**US-3.15 Reset a member's password** ✅ (G5)

- Given Jenn has joined and forgotten her password
- When Casey, or Evan as U11 Boys staff, opens Jenn's details → RESET PASSWORD and confirms RESET
- Then the "PASSWORD RESET" sheet shows the club link, Jenn's username and a new temporary password, with COPY
  MESSAGE.
- And Jenn's old password no longer signs in; she chooses a new one at her next sign-in.
- Team staff reset only their teams' parents and players. Invites are resent instead (US-3.2).

**US-3.16 Invite another club staff member** ✅ (G16)

- When Casey opens Roster → INVITE MEMBER → Club Staff, and enters a name, email and title ("Registrar")
- Then the invite-ready sheet shows their sign-in. They join no team, and the CLUB STAFF section lists them as
  invited.
- Coaches and parents have no Club Staff option.

**US-3.17 Edit own profile** ✅

- When Casey opens More → EDIT PROFILE and changes their name, email or title
- Then More shows the new details, and the new email is their sign-in from now on.
- Evan, as team staff, has a title too: More → EDIT PROFILE shows TITLE for club and team staff, not for parents
  or players.

**US-3.20 Staff titles** ✅

- When Casey opens Evan's details on the Roster → EDIT, enters the title "Head Coach" and presses SAVE
- Then the U11 Boys TEAM STAFF list shows Evan as "Head Coach" instead of "Team Staff", and his More page reads
  "Team Staff · Head Coach · U11 Boys".
- Titles are free text (up to 60 characters), e.g. Head Coach, Assistant Coach, Team Manager. Clearing one shows
  "Team Staff" (or "Club Staff") again.
- Club staff, the club admin included, can change any staff member's title. Team staff can change any team staff
  member's title, even on another team, but not club staff's. Their other details stay with the usual rules
  (US-3.17): staff of another team see only TITLE under EDIT.
- Parents and players have no title, and can't change anyone's.

**US-3.21 Make a parent team staff** ✅

- Given Rosa joined as a U11 Boys parent, and has agreed to help coach
- When Evan (U11 Boys staff) opens Rosa's details on the Roster → MAKE TEAM STAFF and confirms CHANGE ROLE
- Then Rosa moves to the U11 Boys TEAM STAFF list, keeps her sign-in, and stays Liam's parent. Evan can then give
  her a title (US-3.20).
- Team staff can only do this for parents whose teams are all theirs. Club staff can for any parent.
- Only club staff turn team staff back into parents (MAKE PARENT), which also clears their title.
- Invites can change role too, for someone invited as a parent who is really a coach. Club staff and players
  can't be changed, and nobody changes their own role.

**US-3.18 Phone numbers** ✅ (G22)

- When Jenn opens More → EDIT PROFILE, enters her phone number and presses SAVE
- Then Evan (her team's staff) and Casey see it in her details on the Roster, as a link that calls her.
- Phone numbers follow the contacts setting, like emails (US-5.5): by default another U11B parent doesn't see
  Jenn's. Jenn sees Evan's and Casey's.

**US-3.19 Emergency contact and medical notes** ✅ (G22)

- When Jenn opens Davis from More → YOUR PLAYERS (or the Roster) and enters an emergency contact ("Grandma Buell ·
  555-0142") and medical notes ("Peanut allergy: EpiPen in his bag")
- Then Evan, as U11B staff, and Casey see them in Davis's details on the Roster, and can correct them.
- Rosa, another U11B parent, sees neither, whatever the contacts setting. Noah sees his own.
- When a new season carries Davis over, his emergency contact and notes come with him.

---

## 4. Club admin and coach: schedule and chat

**US-4.1 Create a practice for a team** ✅ (G7)

- When the coach (Evan) presses + EVENT → PRACTICE, sets a date, time and location, and presses CREATE · U11 BOYS
- Then the practice appears under UPCOMING with the U11B badge.
- Club staff: the form starts on the first team, not "Club-wide", and the create button names the team, so an
  event is never made club-wide by accident.

**US-4.2 Create a game** ✅

- With an opponent, home or away, date, time and location.

**US-4.3 Fix an event's team, time or place** ✅

- When staff open the event → EDIT EVENT, change the team and press SAVE CHANGES
- Then the card shows the new team badge.

**US-4.4 A coach can't edit club-wide or other teams' events** ✅

- When Evan opens a club-wide game
- Then there's no EDIT EVENT.

**US-4.5 Cancel or delete an event** ✅ (G8)

- When the coach opens a practice → EDIT EVENT → CANCEL EVENT, and confirms
- Then the card stays on the schedule, struck through and marked CANCELLED, with no GOING / OUT buttons; RESTORE
  EVENT brings it back.
- When they press DELETE EVENT instead and confirm (an event entered twice)
- Then it is gone, with its RSVPs.

**US-4.6 Weekly practices** ✅ (G23)

- When Evan creates a practice for Tuesday 6:00–7:30 PM, ticks "Repeats weekly" and picks an UNTIL date
- Then the form says "Every Tuesday: 8 practices." and CREATE adds one practice per week, each with its own RSVPs.
- When he opens the third week → EDIT EVENT, moves it to Wednesday 6:30 PM, picks LATER WEEKS TOO and saves
- Then that week and every later one move to Wednesday 6:30 PM; earlier weeks stay. A week he cancelled stays
  cancelled.
- When he picks THIS WEEK instead, only that practice changes (a gym clash).
- DELETE EVENT asks THIS WEEK or ALL LATER WEEKS (the season ended early).

**US-4.7 See who's coming** ✅ (G19, G31)

- Given parents and players have RSVP'd, some with a note ("Late, 15 min")
- When the coach looks at the schedule
- Then each card of their team shows "8 going · 1 out · 3 undecided".
- When they open the event
- Then ATTENDANCE lists each player under GOING, OUT or UNDECIDED, with their notes.
- Notes are seen by the event's staff and the player's family only; other parents see the answers.

**US-4.8 Coach-parent RSVPs separately for themself and their child** ✅ (G20)

- When Evan opens a U11B practice
- Then RSVP FOR lists Evan Moore (You) and Davis Moore, both ticked; he unticks himself and confirms OUT for Davis.
- The one-tap GOING / OUT on the card still answers for both.

**US-4.9 Post a club announcement everyone receives** ✅ (G1)

- When Casey posts in #club-announcements
- Then every member of the club sees it, including people invited after it was posted: the header says
  "Club-wide · N members" with everyone in the club.
- And the coach and parents have no composer there: "Only club staff post in club announcements."

**US-4.10 Club admin messages a team** ✅ (G2)

- When Casey opens Chat
- Then TEAM CHANNELS lists every team's #announcements and #general.
- When she opens U11B #general and sends "Gym change Tuesday"
- Then the coach and parents see it; the header still counts the team only ("U11 Boys · 3 members").

**US-4.11 Coach posts to the team** ✅

- When Evan opens U11B #announcements and sends a message
- Then it appears in the thread, with "U11 Boys · 3 members" (the coach and two invited parents).
- And parents see it as unread.

**US-4.12 Record a game score** ✅ (seen in the demo club; not run in the new club, which had no past games)

**US-4.13 Edit or delete a message** ✅ (G34)

- When Evan taps ⋯ on his own message in U11B #general, changes the text and presses SAVE
- Then everyone sees the new text, marked "edited".
- When he deletes it instead
- Then everyone sees "Message deleted" in its place.
- When Evan (U11B staff) or Casey (club staff) taps ⋯ on Jenn's message in a U11B channel and confirms DELETE
- Then it shows as "Message deleted". Parents get ⋯ only on their own messages.

**US-4.14 Let everyone post announcements** ✅ (G4 setting)

- When Casey opens More → CLUB SETTINGS → Announcements, picks EVERYONE and presses SAVE
- Then parents get a composer in #announcements and #club-announcements.
- Coaches and parents have no CLUB SETTINGS.

**US-4.15 When to arrive, when it ends, and where** ✅ (G32)

- When Evan creates a game with ENDS 7:30 PM and ARRIVE BY 5:45 PM
- Then the card reads "Sat, Oct 17 · 6:00 PM – 7:30 PM", and the event shows "Arrive by 5:45 PM".
- OPEN MAP beside the location opens it in a map, in a new tab.
- An end before the start, or arriving after it, is refused.

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

**US-5.4 What parents can see about others** ✅ (G26)

- When Jenn opens Rosa's details
- Then she sees Rosa's name, teams and players, but no email.
- And she sees Evan's and Casey's emails (her coach and the club staff), and has no INVITED list.
- When Casey sets More → CLUB SETTINGS → WHO SEES CONTACT DETAILS to EVERYONE
- Then Jenn sees everyone's email, and the INVITED list.
- The database enforces this: members' emails are only readable through `member_contacts()`.

**US-5.5 Link a second child** ✅ (G3)

- When Jenn presses LINK NEW PLAYER and sends a request for Ava Moore
- Then Ava shows on her More tab as "Pending team staff approval", and on the roster as "Your player · pending
  approval".
- When the team's staff approve it (US-3.14)
- Then Ava is her player like Davis.

**US-5.6 Parents can't post in #announcements** ✅ (G4)

- When Jenn opens U11B #announcements
- Then there's no composer: "Only club staff and U11 Boys staff post announcements."
- And the database refuses her message too (unless the club lets everyone post, US-4.14).

**US-5.7 Player access shows co-parents** ✅

- More shows "Davis Moore · Managed by you and Evan Moore".

**US-5.8 Forgot password** ✅ (G5, by staff)

- Given Jenn has forgotten her password
- When she asks the club's staff, and they reset it (US-3.15)
- Then she signs in with the temporary password and chooses a new one.
- Resetting it herself by email waits for email delivery.

---

## 6. Player

**US-6.1 Player signs in themselves** ✅

- When Noah signs in with the temporary password from US-3.6 and chooses his own
- Then More shows "Player · U11 Boys" and his player tile "Has own login · noah@…".
- And he RSVPs for himself.

**US-6.2 A player and their parents RSVP to the same record** ✅ (G21)

- When Noah marks himself out for a practice
- Then his parents see Noah as out, and the coach's attendance counts him once.
- A player's RSVP is always their player profile's, whoever answers; existing RSVPs were moved to it.

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
