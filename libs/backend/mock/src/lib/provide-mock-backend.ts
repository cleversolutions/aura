import { EnvironmentProviders, makeEnvironmentProviders } from '@angular/core';
import { AuthRepository, ChatRepository, DirectoryRepository, ScheduleRepository } from '@aura/backend/api';
import { MOCK_BACKEND_OPTIONS, MockBackendOptions } from './mock-db';
import {
  MockAuthRepository,
  MockChatRepository,
  MockDirectoryRepository,
  MockScheduleRepository,
} from './mock-repositories';

/** Binds every backend port to an in-memory implementation seeded with demo data. */
export function provideMockBackend(options: Partial<MockBackendOptions> = {}): EnvironmentProviders {
  return makeEnvironmentProviders([
    {
      provide: MOCK_BACKEND_OPTIONS,
      useValue: { latencyMs: 150, replyDelayMs: 1800, initialUserId: 'jordan', ...options },
    },
    { provide: AuthRepository, useClass: MockAuthRepository },
    { provide: DirectoryRepository, useClass: MockDirectoryRepository },
    { provide: ScheduleRepository, useClass: MockScheduleRepository },
    { provide: ChatRepository, useClass: MockChatRepository },
  ]);
}
