import { TestBed } from '@angular/core/testing';
import { provideTestBackend } from '@aura/backend/mock';
import { PlatformStore } from './platform.store';

const NEW_CLUB = {
  name: 'Northside Aura',
  slug: 'nrth42',
  logoUrl: 'club-logo.svg',
  ink: '#123456',
  paper: '#fafafa',
  logoInk: '#123456',
  logoPaper: '#fafafa',
  adminName: 'Riley Shaw',
  adminEmail: 'riley@northside.example',
};

function setup(platformSignedIn = false) {
  TestBed.configureTestingModule({ providers: provideTestBackend({ platformSignedIn }) });
  return TestBed.inject(PlatformStore);
}

describe('PlatformStore', () => {
  it('signs the platform admin in and out', async () => {
    const store = setup();
    expect(await store.checkSession()).toBeNull();
    await expect(store.signIn('admin@aura.example', 'nope')).rejects.toThrow('Wrong email or password.');
    await store.signIn('Admin@Aura.example', 'password');
    expect(store.admin()?.name).toBe('Alex Rivera');
    await store.signOut();
    expect(store.admin()).toBeNull();
  });

  it('refuses club management when signed out', async () => {
    await expect(setup().loadClubs()).rejects.toThrow('Sign in as the platform admin.');
  });

  it('lists, creates and updates clubs', async () => {
    const store = setup(true);
    await store.loadClubs();
    expect(store.clubs().map((c) => c.name)).toEqual(['Spartans', 'Panthers']);

    const created = await store.createClub({ ...NEW_CLUB, temporaryPassword: 'TEMP-pass-22' });
    expect(store.club(created.id)).toMatchObject({ name: 'Northside Aura', slug: 'nrth42' });
    await expect(store.createClub({ ...NEW_CLUB, temporaryPassword: 'x' })).rejects.toThrow('already taken');

    const { slug: _slug, ...rest } = NEW_CLUB;
    await store.updateClub(created.id, { ...rest, name: 'Northside', ink: '#000000' });
    expect(store.club(created.id)).toMatchObject({ name: 'Northside', ink: '#000000', slug: 'nrth42' });
  });
});
