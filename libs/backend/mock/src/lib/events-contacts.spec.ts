import { TestBed } from '@angular/core/testing';
import { AuthRepository, DirectoryRepository, ScheduleRepository } from '@aura/backend/api';
import { provideTestBackend } from './testing';

/** Phone numbers, players' care details, and event times, as the database allows them. */
describe('mock backend: richer events and contacts', () => {
  function setup(initialUserId = 'sam') {
    TestBed.configureTestingModule({ providers: provideTestBackend({ initialUserId }) });
    return TestBed.inject(DirectoryRepository);
  }

  const maya = async (directory: DirectoryRepository) => (await directory.load()).profiles.find((p) => p.id === 'maya');

  it('shows phone numbers by the same rule as emails', async () => {
    const directory = setup('priya-patel');
    const users = (await directory.load()).users;
    expect(users.find((u) => u.id === 'dana')?.phone).toBe('555-0134');
    expect(users.find((u) => u.id === 'jordan')).not.toHaveProperty('phone');
  });

  it('lets members set and clear their phone number, and rejects nonsense', async () => {
    const directory = setup('jordan');
    const me = { id: 'jordan', name: 'Jordan Smith', email: 'jordan.smith@email.com' };
    await expect(directory.updateMember({ ...me, phone: 'call me' })).rejects.toThrow('valid phone');
    expect((await directory.updateMember({ ...me, phone: ' 555-0199 ' })).phone).toBe('555-0199');
    expect((await directory.updateMember(me)).phone).toBe('555-0199');
    expect(await directory.updateMember({ ...me, phone: '' })).not.toHaveProperty('phone');
  });

  it('shows a player’s care details to their family and staff only', async () => {
    const directory = setup('jordan');
    const auth = TestBed.inject(AuthRepository);
    expect((await maya(directory))?.care?.medicalNotes).toContain('asthma');
    await auth.signInAs('dana');
    expect((await maya(directory))?.care).toBeDefined();
    await auth.signInAs('sam');
    expect((await maya(directory))?.care).toBeDefined();
    await auth.signInAs('priya-patel');
    expect(await maya(directory)).not.toHaveProperty('care');
    await auth.signInAs('mike');
    expect(await maya(directory)).not.toHaveProperty('care');
  });

  it('lets the family and the team’s staff edit care details', async () => {
    const directory = setup('jordan');
    const care = { emergencyContact: 'Aunt Bea · 555-0111', medicalNotes: 'Peanut allergy' };
    const saved = await directory.updateProfile({ id: 'maya', name: 'Maya Smith', jersey: '8', care });
    expect(saved.care).toEqual(care);
    await TestBed.inject(AuthRepository).signInAs('mike');
    await expect(directory.updateProfile({ id: 'maya', name: 'Maya Smith', jersey: '8', care })).rejects.toThrow(
      'permission',
    );
  });

  it('rejects an end before the start, and arriving after it', async () => {
    setup('dana');
    const schedule = TestBed.inject(ScheduleRepository);
    const draft = {
      type: 'practice' as const,
      team: 'U12G',
      date: '2026-10-08',
      time: '18:00',
      location: 'Gym',
      notes: '',
    };
    await expect(schedule.saveEvent({ ...draft, endTime: '17:00' })).rejects.toThrow('end time');
    await expect(schedule.saveEvent({ ...draft, arriveBy: '18:30' })).rejects.toThrow('arrive-by');
    await expect(schedule.createWeekly({ ...draft, tbd: true }, '2026-10-29')).rejects.toThrow('date and time');
  });
});
