import { EnvironmentProviders, makeEnvironmentProviders } from '@angular/core';
import {
  AuthRepository,
  ChatRepository,
  DirectoryRepository,
  PlatformRepository,
  ScheduleRepository,
} from '@aura/backend/api';
import {
  MOCK_BACKEND_OPTIONS,
  MockChatRepository,
  MockDirectoryRepository,
  MockScheduleRepository,
  mockBackendOptions,
} from '@aura/backend/mock';
import { SupabaseAuthRepository } from './auth.repository';
import { SupabaseChatRepository } from './chat.repository';
import { SupabaseDirectoryRepository } from './directory.repository';
import { SupabasePlatformRepository } from './platform.repository';
import { PreviewData } from './preview';
import { SupabaseScheduleRepository } from './schedule.repository';
import { SUPABASE_BACKEND_CONFIG, SupabaseBackendConfig, SupabaseClients } from './supabase-clients';

/** Binds every backend port to Supabase. */
export function provideSupabaseBackend(config: SupabaseBackendConfig): EnvironmentProviders {
  return makeEnvironmentProviders([
    { provide: SUPABASE_BACKEND_CONFIG, useValue: config },
    SupabaseClients,
    { provide: AuthRepository, useClass: SupabaseAuthRepository },
    { provide: DirectoryRepository, useClass: SupabaseDirectoryRepository },
    { provide: ScheduleRepository, useClass: SupabaseScheduleRepository },
    { provide: ChatRepository, useClass: SupabaseChatRepository },
    { provide: PlatformRepository, useClass: SupabasePlatformRepository },
    // Preview's in-memory sample data: no demo club is open and nobody is signed in to it.
    PreviewData,
    MockDirectoryRepository,
    MockScheduleRepository,
    MockChatRepository,
    { provide: MOCK_BACKEND_OPTIONS, useValue: mockBackendOptions({ latencyMs: 0, initialUserId: null }) },
  ]);
}
