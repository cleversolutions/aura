import { Injectable, inject } from '@angular/core';
// The one place the Supabase backend imports the mock: preview needs sample data that no real club
// can see, so it lives in memory in the platform admin's browser, never in the database.
import { MockChatRepository, MockDb, MockDirectoryRepository, MockScheduleRepository } from '@aura/backend/mock';
import { Club } from '@aura/shared/models';

/** Sample data under a real club's branding, for the platform admin's preview. */
@Injectable()
export class PreviewData {
  private readonly db = inject(MockDb);
  readonly directory = inject(MockDirectoryRepository);
  readonly schedule = inject(MockScheduleRepository);
  readonly chat = inject(MockChatRepository);

  start(club: Club): void {
    this.db.startPreview({
      ...club,
      logoInk: club.ink,
      logoPaper: club.paper,
      adminName: '',
      adminEmail: '',
      createdAt: new Date(0).toISOString(),
    });
  }

  stop(): void {
    this.db.preview = null;
  }

  /** The sample session: signed in as sample club staff. */
  get userId(): string {
    return this.db.preview?.session.userId ?? '';
  }
}
