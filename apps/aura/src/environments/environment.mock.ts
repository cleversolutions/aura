import { AppEnvironment } from './app-environment';

/** `npm run start:mock`: the in-memory mock backend with demo accounts; no Supabase needed. */
export const environment: AppEnvironment = {
  backend: { kind: 'mock' },
};
