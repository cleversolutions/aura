import { EnvironmentProviders, makeEnvironmentProviders } from '@angular/core';
import {
  AuthRepository,
  ChatRepository,
  DirectoryRepository,
  PlatformRepository,
  ScheduleRepository,
} from '@aura/backend/api';
import { MOCK_BACKEND_OPTIONS, MockBackendOptions, mockBackendOptions } from './mock-db';
import {
  MockAuthRepository,
  MockChatRepository,
  MockDirectoryRepository,
  MockPlatformRepository,
  MockScheduleRepository,
} from './mock-repositories';

/** Binds every backend port to an in-memory implementation seeded with demo data. */
export function provideMockBackend(options: Partial<MockBackendOptions> = {}): EnvironmentProviders {
  return makeEnvironmentProviders([
    {
      provide: MOCK_BACKEND_OPTIONS,
      useValue: mockBackendOptions(options),
    },
    { provide: AuthRepository, useClass: MockAuthRepository },
    { provide: DirectoryRepository, useClass: MockDirectoryRepository },
    { provide: ScheduleRepository, useClass: MockScheduleRepository },
    { provide: ChatRepository, useClass: MockChatRepository },
    { provide: PlatformRepository, useClass: MockPlatformRepository },
  ]);
}
