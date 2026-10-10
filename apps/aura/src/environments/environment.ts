import { AppEnvironment } from './app-environment';

/**
 * Development (`npm start`): the local Supabase from `npm run db:start`, seeded with `npm run db:seed`.
 * The anon key is the fixed demo key every local Supabase uses; it is not a secret.
 */
export const environment: AppEnvironment = {
  backend: {
    kind: 'supabase',
    url: 'http://127.0.0.1:54321',
    anonKey:
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0',
    loginDomain: 'login.aura.invalid',
    // The dev server has no per-club manifest endpoint; the app keeps the static manifest.
    clubManifests: false,
  },
};
