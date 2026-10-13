import { Injectable, inject } from '@angular/core';
import { ScheduleRepository } from '@aura/backend/api';
import { ClubEvent, ClubEventDraft, RsvpMap, RsvpStatus, Score } from '@aura/shared/models';
import { weeklyDates } from '@aura/shared/util';
import { dbError, fromEventDraft, seasonFromTrigger, toEvent, toRsvpMap } from './mapping';
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
    const { data, error } = await this.clients.active().client.rpc('list_rsvps');
    if (error) throw dbError(error, 'Could not load RSVPs.');
    return toRsvpMap(data);
  }

  async saveEvent(draft: ClubEventDraft): Promise<ClubEvent> {
    if (this.clients.previewing) return this.preview.schedule.saveEvent(draft);
    const { club, client } = this.clients.active();
    const row = fromEventDraft(draft, club.id);
    const { data, error } = draft.id
      ? await client.from('events').update(row).eq('id', draft.id).select().single()
      : await client.from('events').insert(seasonFromTrigger(row)).select().single();
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

  async setCancelled(eventId: string, cancelled: boolean): Promise<ClubEvent> {
    if (this.clients.previewing) return this.preview.schedule.setCancelled(eventId, cancelled);
    const { data, error } = await this.clients
      .active()
      .client.from('events')
      .update({ cancelled })
      .eq('id', eventId)
      .select()
      .single();
    if (error) throw dbError(error, 'Could not change the event.');
    return toEvent(data);
  }

  async deleteEvent(eventId: string): Promise<void> {
    if (this.clients.previewing) return this.preview.schedule.deleteEvent(eventId);
    // RLS hides rows it refuses to delete: ask for the row back to tell "not allowed" from done.
    const { data, error } = await this.clients.active().client.from('events').delete().eq('id', eventId).select('id');
    if (error) throw dbError(error, 'Could not delete the event.');
    if (!data.length) throw new Error('Only club staff and the team’s staff can delete this event.');
  }

  async createWeekly(draft: ClubEventDraft, until: string): Promise<ClubEvent[]> {
    if (this.clients.previewing) return this.preview.schedule.createWeekly(draft, until);
    if (draft.tbd || !draft.date || !draft.time) throw new Error('Pick a date and time for a weekly event.');
    const dates = weeklyDates(draft.date, until);
    if (!dates.length) throw new Error('Repeat until a date after the first event.');
    const { club, client } = this.clients.active();
    const row = fromEventDraft({ ...draft, seriesId: crypto.randomUUID() }, club.id);
    const { data, error } = await client
      .from('events')
      .insert(dates.map((date) => seasonFromTrigger({ ...row, date })))
      .select();
    if (error) throw dbError(error, 'Could not save the events.');
    return data.map(toEvent);
  }

  async saveSeries(draft: ClubEventDraft & { id: string }): Promise<ClubEvent[]> {
    if (this.clients.previewing) return this.preview.schedule.saveSeries(draft);
    const row = fromEventDraft(draft, this.clients.active().club.id);
    const { data, error } = await this.clients.active().client.rpc('save_event_series', {
      p_event: draft.id,
      p_type: row.type,
      p_team: row.team,
      p_title: row.title ?? undefined,
      p_opponent: row.opponent ?? undefined,
      p_home: row.home ?? undefined,
      p_date: row.date ?? '',
      p_time: row.time ?? '',
      p_end_time: row.end_time ?? undefined,
      p_arrive_by: row.arrive_by ?? undefined,
      p_location: row.location ?? '',
      p_notes: row.notes ?? '',
    });
    if (error) throw dbError(error, 'Could not save the events.');
    // The update runs under the events policies, which skip rows the caller cannot edit.
    if (!data.length) throw new Error('Only club staff and the team’s staff can change this event.');
    return data.map(toEvent);
  }

  async deleteSeries(eventId: string): Promise<string[]> {
    if (this.clients.previewing) return this.preview.schedule.deleteSeries(eventId);
    const { client } = this.clients.active();
    const event = await client.from('events').select('series_id, date').eq('id', eventId).single();
    if (event.error) throw dbError(event.error, 'Could not delete the events.');
    const { series_id, date } = event.data;
    if (!series_id) throw new Error('This event does not repeat.');
    let query = client.from('events').delete().eq('series_id', series_id);
    // This week, later weeks, and weeks moved to TBD.
    if (date) query = query.or(`id.eq.${eventId},date.gte.${date},date.is.null`);
    const { data, error } = await query.select('id');
    if (error) throw dbError(error, 'Could not delete the events.');
    if (!data.length) throw new Error('Only club staff and the team’s staff can delete this event.');
    return data.map((r) => r.id);
  }

  async setRsvp(eventId: string, attendeeIds: string[], status: RsvpStatus | null, note?: string): Promise<void> {
    if (this.clients.previewing) return this.preview.schedule.setRsvp(eventId, attendeeIds, status, note);
    if (!attendeeIds.length) return;
    const { client } = this.clients.active();
    // Notes are only written through set_rsvps; clearing needs no note.
    const { error } = status
      ? await client.rpc('set_rsvps', { p_event: eventId, p_attendees: attendeeIds, p_status: status, p_note: note })
      : await client.from('rsvps').delete().eq('event_id', eventId).in('attendee_id', attendeeIds);
    if (error) throw dbError(error, 'Could not save your RSVP.');
  }
}
