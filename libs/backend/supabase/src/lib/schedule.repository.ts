import { Injectable, inject } from '@angular/core';
import { ScheduleRepository } from '@aura/backend/api';
import { ClubEvent, ClubEventDraft, RsvpMap, RsvpStatus, Score } from '@aura/shared/models';
import { dbError, fromEventDraft, toEvent, toRsvpMap } from './mapping';
import { PreviewData } from './preview';
import { SupabaseClients } from './supabase-clients';

@Injectable()
export class SupabaseScheduleRepository extends ScheduleRepository {
  private readonly clients = inject(SupabaseClients);
  private readonly preview = inject(PreviewData);

  async listEvents(): Promise<ClubEvent[]> {
    if (this.clients.previewing) return this.preview.schedule.listEvents();
    const { club, client } = this.clients.active();
    const { data, error } = await client.from('events').select().eq('club_id', club.id);
    if (error) throw dbError(error, 'Could not load the schedule.');
    return data.map(toEvent);
  }

  async listRsvps(): Promise<RsvpMap> {
    if (this.clients.previewing) return this.preview.schedule.listRsvps();
    const { club, client } = this.clients.active();
    const { data, error } = await client.from('rsvps').select('event_id, attendee_id, status').eq('club_id', club.id);
    if (error) throw dbError(error, 'Could not load RSVPs.');
    return toRsvpMap(data);
  }

  async saveEvent(draft: ClubEventDraft): Promise<ClubEvent> {
    if (this.clients.previewing) return this.preview.schedule.saveEvent(draft);
    const { club, client } = this.clients.active();
    const row = fromEventDraft(draft, club.id);
    const { data, error } = draft.id
      ? await client.from('events').update(row).eq('id', draft.id).select().single()
      : await client.from('events').insert(row).select().single();
    if (error) throw dbError(error, 'Could not save the event.');
    return toEvent(data);
  }

  async saveScore(eventId: string, score: Score): Promise<ClubEvent> {
    if (this.clients.previewing) return this.preview.schedule.saveScore(eventId, score);
    const { data, error } = await this.clients
      .active()
      .client.from('events')
      .update({ score_us: score.us, score_them: score.them })
      .eq('id', eventId)
      .select()
      .single();
    if (error) throw dbError(error, 'Could not save the score.');
    return toEvent(data);
  }

  async setRsvp(eventId: string, attendeeIds: string[], status: RsvpStatus | null): Promise<void> {
    if (this.clients.previewing) return this.preview.schedule.setRsvp(eventId, attendeeIds, status);
    if (!attendeeIds.length) return;
    const { club, client } = this.clients.active();
    const { error } = status
      ? await client.from('rsvps').upsert(
          attendeeIds.map((attendee_id) => ({ club_id: club.id, event_id: eventId, attendee_id, status })),
          { onConflict: 'event_id,attendee_id' },
        )
      : await client.from('rsvps').delete().eq('event_id', eventId).in('attendee_id', attendeeIds);
    if (error) throw dbError(error, 'Could not save your RSVP.');
  }
}
