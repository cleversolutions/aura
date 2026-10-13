import { TestBed } from '@angular/core/testing';
import { ChatRepository, DirectoryRepository, PlatformRepository, ScheduleRepository } from '@aura/backend/api';
import { SPARTANS_SLUG } from './clubs';
import { provideTestBackend } from './testing';

/** The platform admin's housekeeping: member counts, archiving and restoring a club. */
describe('mock backend: platform admin', () => {
  function setup() {
    TestBed.configureTestingModule({
      providers: provideTestBackend({ initialUserId: 'jordan', platformSignedIn: true }),
    });
    return {
      platform: TestBed.inject(PlatformRepository),
      directory: TestBed.inject(DirectoryRepository),
      schedule: TestBed.inject(ScheduleRepository),
      chat: TestBed.inject(ChatRepository),
    };
  }
  const archived = 'This club is archived. It is read-only.';

  it('counts each club’s members, invites and this season’s teams', async () => {
    const { platform } = setup();
    const spartans = (await platform.listClubs()).find((c) => c.slug === SPARTANS_SLUG);
    const users = (await TestBed.inject(DirectoryRepository).load()).users;
    expect(spartans?.counts).toEqual({
      members: users.filter((u) => !u.invited && !u.disabled).length,
      invited: users.filter((u) => u.invited).length,
      teams: 5,
    });
  });

  it('archives a club: members still read it but change nothing, until it is restored', async () => {
    const { platform, directory, schedule, chat } = setup();
    const club = await platform.setArchived('spartans', true);
    expect(club.archivedAt).toBe(new Date('2026-10-05T12:00:00').toISOString());
    expect((await directory.findClub(SPARTANS_SLUG))?.archivedAt).toBe(club.archivedAt);

    // Reading works, and so does marking a thread read.
    expect((await directory.load()).club.archivedAt).toBe(club.archivedAt);
    expect((await chat.listThreads()).length).toBeGreaterThan(0);
    await expect(chat.markRead('club-ann')).resolves.toBeUndefined();

    await expect(schedule.setRsvp('e1', ['maya'], 'going')).rejects.toThrow(archived);
    await expect(chat.sendMessage('U12G-gen', 'jordan', 'Hello?')).rejects.toThrow(archived);
    await expect(
      directory.requestPlayerLink({ team: 'U12G', name: 'Ava', jersey: '', parentId: 'jordan' }),
    ).rejects.toThrow(archived);

    // Archiving again keeps the date; restoring makes the club writable again.
    expect((await platform.setArchived('spartans', true)).archivedAt).toBe(club.archivedAt);
    expect((await platform.setArchived('spartans', false)).archivedAt).toBeUndefined();
    await expect(schedule.setRsvp('e1', ['maya'], 'going')).resolves.toBeUndefined();
  });

  it('only lets the platform admin archive clubs', async () => {
    TestBed.configureTestingModule({ providers: provideTestBackend() });
    await expect(TestBed.inject(PlatformRepository).setArchived('spartans', true)).rejects.toThrow('platform admin');
  });
});
