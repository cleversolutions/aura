import { TestBed } from '@angular/core/testing';
import { AuthRepository, ChatRepository, DirectoryRepository, ScheduleRepository } from '@aura/backend/api';
import { provideTestBackend } from './testing';

/** Seasons, as start_season() and the past-season guards in the database behave. */
describe('mock backend: seasons', () => {
  function setup(initialUserId = 'sam') {
    TestBed.configureTestingModule({ providers: provideTestBackend({ initialUserId }) });
    return {
      directory: TestBed.inject(DirectoryRepository),
      schedule: TestBed.inject(ScheduleRepository),
      chat: TestBed.inject(ChatRepository),
      auth: TestBed.inject(AuthRepository),
    };
  }

  async function startNext(directory: DirectoryRepository) {
    return directory.startSeason({
      name: 'Next',
      teams: [{ from: 'U12G', name: 'U13 Girls', age: 'U13', division: 'Girls', staff: true, players: true }],
    });
  }

  it('only lets club staff start a season', async () => {
    const { directory } = setup('dana');
    await expect(startNext(directory)).rejects.toThrow('Only club staff');
  });

  it('copies carried players with their parents and own sign-ins, and keeps the old ones', async () => {
    const { directory } = setup();
    const before = await directory.load();
    const dir = await startNext(directory);
    const team = dir.teams.find((t) => t.name === 'U13 Girls')!;
    expect(dir.seasons.map((s) => [s.name, !!s.endedAt])).toEqual([
      [before.seasons[0].name, true],
      ['Next', false],
    ]);
    const oldU12 = before.profiles.filter((p) => p.team === 'U12G' && !p.pending);
    expect(dir.profiles.map((p) => p.name).sort()).toEqual(oldU12.map((p) => p.name).sort());
    expect(dir.profiles.every((p) => p.team === team.id && !oldU12.some((o) => o.id === p.id))).toBe(true);
    expect(dir.users.find((u) => u.id === 'dana')?.teams).toEqual([team.id]);
    // Team staff on teams that were not carried are on no team now.
    expect(dir.users.find((u) => u.id === 'mike')?.teams).toEqual([]);

    const past = await directory.loadSeason(before.seasons[0].id);
    expect(
      past.profiles
        .filter((p) => p.team === 'U12G')
        .map((p) => p.id)
        .sort(),
    ).toEqual(oldU12.map((p) => p.id).sort());
    expect(past.members['U18B']).toContain('mike');
  });

  it('keeps past seasons read-only', async () => {
    const { directory, schedule, chat } = setup();
    const before = await directory.load();
    const oldEvent = (await schedule.listEvents()).find((e) => e.team === 'U12G')!;
    await startNext(directory);
    const past = /season has ended/;

    await expect(directory.addPlayer({ team: 'U12G', name: 'Late', jersey: '', parentIds: [] })).rejects.toThrow();
    await expect(directory.saveTeam({ id: 'U12G', name: 'Renamed', staffIds: [] })).rejects.toThrow(past);
    await expect(directory.deleteTeam('U12G')).rejects.toThrow(past);
    await expect(
      directory.inviteMember({ team: 'U12G', kind: 'parent', name: 'Late', email: 'late@x.example' }),
    ).rejects.toThrow();
    const oldProfile = before.profiles.find((p) => p.team === 'U12G')!;
    await expect(directory.updateProfile({ id: oldProfile.id, name: 'X', jersey: '1' })).rejects.toThrow(past);

    await expect(schedule.saveEvent({ ...oldEvent, notes: 'changed' })).rejects.toThrow(past);
    await expect(schedule.saveEvent({ ...oldEvent, id: undefined })).rejects.toThrow(past);
    await expect(schedule.setRsvp(oldEvent.id, ['sam'], 'going')).rejects.toThrow(past);
    await expect(chat.sendMessage('U12G-gen', 'sam', 'Hello?')).rejects.toThrow();

    // Club-wide events made now belong to the new season.
    const created = await schedule.saveEvent({
      type: 'special',
      team: 'ALL',
      title: 'Kickoff',
      location: '',
      notes: '',
    });
    expect(created.season).toBe((await directory.load()).seasons.at(-1)?.id);
  });

  it('refuses a season name that was used, and duplicate team names', async () => {
    const { directory } = setup();
    const { seasons } = await directory.load();
    await expect(directory.startSeason({ name: seasons[0].name, teams: [] })).rejects.toThrow('already a season');
    await expect(
      directory.startSeason({
        name: 'Next',
        teams: [
          { from: 'U12G', name: 'Red', staff: false, players: false },
          { from: 'U14B', name: 'red', staff: false, players: false },
        ],
      }),
    ).rejects.toThrow('different name');
  });

  it('deletes a team only while it has no players and no events', async () => {
    const { directory } = setup();
    await expect(directory.deleteTeam('U10B')).rejects.toThrow('no players and no events');
    const { directory: dir } = await directory.saveTeam({ name: 'U8 Mixed', staffIds: ['dana'] });
    const team = dir.teams.find((t) => t.name === 'U8 Mixed')!;
    const after = await directory.deleteTeam(team.id);
    expect(after.teams.some((t) => t.id === team.id)).toBe(false);
    expect(after.users.find((u) => u.id === 'dana')?.teams).not.toContain(team.id);
  });
});
