import type { SupabaseBackendConfig } from '@aura/backend/supabase';

/** Which backend the app talks to. Picked per build configuration (see project.json). */
export interface AppEnvironment {
  backend: { kind: 'mock' } | ({ kind: 'supabase' } & SupabaseBackendConfig);
}
