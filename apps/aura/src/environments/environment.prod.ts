import { AppEnvironment } from './app-environment';

/**
 * Production builds. Until a hosted Supabase project exists this is the mock demo. The hosting
 * build overwrites this file from its environment variables with `node tools/write-environment.mjs`
 * (see "Hosting" in the README).
 */
export const environment: AppEnvironment = {
  backend: { kind: 'mock' },
};
