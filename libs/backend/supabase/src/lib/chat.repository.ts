import { Injectable, inject } from '@angular/core';
import { RealtimeChannel } from '@supabase/supabase-js';
import { ChatEvent, ChatRepository, NewThreadInput } from '@aura/backend/api';
import { ChatMessage, Thread, ThreadMembership, UserId } from '@aura/shared/models';
import { MessageRow, dbError, messagesByThread, toMessage, toThread } from './mapping';
import { PreviewData } from './preview';
import { AuraClient, SupabaseClients } from './supabase-clients';

/** PostgREST returns at most this many rows (`max_rows`); v1 loads the newest messages up to it. */
const MESSAGE_LIMIT = 1000;

@Injectable()
export class SupabaseChatRepository extends ChatRepository {
  private readonly clients = inject(SupabaseClients);
  private readonly preview = inject(PreviewData);
  private readonly listeners = new Set<(event: ChatEvent) => void>();
  private channel: { client: AuraClient; channel: RealtimeChannel } | null = null;
  /** Bumped on every reconnect, so a slower earlier one does not open a stale channel. */
  private generation = 0;

  constructor() {
    super();
    // One channel, for the active club only, re-opened when the club or session changes.
    this.clients.onChange(() => void this.reconnect());
  }

  async listThreads(): Promise<Thread[]> {
    if (this.clients.previewing) return this.preview.chat.listThreads();
    const { club, client } = this.clients.active();
    const [threads, messages] = await Promise.all([
      client.rpc('list_my_threads'),
      client
        .from('messages')
        .select()
        .eq('club_id', club.id)
        .order('sent_at', { ascending: false })
        .limit(MESSAGE_LIMIT),
    ]);
    if (threads.error) throw dbError(threads.error, 'Could not load chat.');
    if (messages.error) throw dbError(messages.error, 'Could not load chat.');
    const byThread = messagesByThread(messages.data);
    return threads.data.map((t) => toThread(t, byThread.get(t.id) ?? []));
  }

  private async loadThread(id: string): Promise<Thread> {
    const { client } = this.clients.active();
    const [threads, messages] = await Promise.all([
      client.rpc('list_my_threads').eq('id', id),
      client.from('messages').select().eq('thread_id', id).order('sent_at').limit(MESSAGE_LIMIT),
    ]);
    if (threads.error) throw dbError(threads.error);
    if (messages.error) throw dbError(messages.error);
    const row = threads.data[0];
    if (!row) throw new Error('Thread not found.');
    return toThread(row, messages.data.map(toMessage));
  }

  async createThread(input: NewThreadInput): Promise<Thread> {
    if (this.clients.previewing) return this.preview.chat.createThread(input);
    const { club, client } = this.clients.active();
    const { data, error } = await client
      .from('threads')
      .insert({
        club_id: club.id,
        name: input.name,
        scope: input.scope,
        teams: input.teams,
        include_staff: input.include.staff,
        include_parents: input.include.parents,
        include_players: input.include.players,
        creator_member_id: input.creatorId,
      })
      .select('id')
      .single();
    if (error) throw dbError(error, 'Could not create the thread.');
    await this.setMembers(data.id, [], input.members);
    return this.loadThread(data.id);
  }

  async updateMembership(threadId: string, membership: Omit<ThreadMembership, 'creatorId'>): Promise<Thread> {
    if (this.clients.previewing) return this.preview.chat.updateMembership(threadId, membership);
    const { client } = this.clients.active();
    const { error } = await client
      .from('threads')
      .update({
        teams: membership.teams,
        include_staff: membership.include.staff,
        include_parents: membership.include.parents,
        include_players: membership.include.players,
      })
      .eq('id', threadId)
      .select('id')
      .single();
    if (error) throw dbError(error, 'Could not update the thread.');
    const current = await client.from('thread_members').select('member_id').eq('thread_id', threadId);
    if (current.error) throw dbError(current.error);
    await this.setMembers(
      threadId,
      current.data.map((r) => r.member_id),
      membership.members,
    );
    return this.loadThread(threadId);
  }

  private async setMembers(threadId: string, current: UserId[], wanted: UserId[]): Promise<void> {
    const { club, client } = this.clients.active();
    const removed = current.filter((id) => !wanted.includes(id));
    const added = [...new Set(wanted)].filter((id) => !current.includes(id));
    if (removed.length) {
      const { error } = await client.from('thread_members').delete().eq('thread_id', threadId).in('member_id', removed);
      if (error) throw dbError(error, 'Could not update the thread members.');
    }
    if (added.length) {
      const { error } = await client
        .from('thread_members')
        .insert(added.map((member_id) => ({ club_id: club.id, thread_id: threadId, member_id })));
      if (error) throw dbError(error, 'Could not update the thread members.');
    }
  }

  async sendMessage(threadId: string, from: UserId, text: string): Promise<ChatMessage> {
    if (this.clients.previewing) return this.preview.chat.sendMessage(threadId, from, text);
    const { club, client } = this.clients.active();
    const { data, error } = await client
      .from('messages')
      .insert({ club_id: club.id, thread_id: threadId, from_member_id: from, text })
      .select()
      .single();
    if (error) throw dbError(error, 'Could not send the message.');
    return toMessage(data);
  }

  async markRead(threadId: string): Promise<void> {
    if (this.clients.previewing) return this.preview.chat.markRead(threadId);
    const { error } = await this.clients.active().client.rpc('mark_thread_read', { p_thread: threadId });
    if (error) throw dbError(error);
  }

  async listMuted(): Promise<string[]> {
    if (this.clients.previewing) return this.preview.chat.listMuted();
    const { club, client } = this.clients.active();
    const { data, error } = await client.from('thread_mutes').select('thread_id').eq('club_id', club.id);
    if (error) throw dbError(error);
    return data.map((r) => r.thread_id);
  }

  async setMuted(threadId: string, muted: boolean): Promise<void> {
    if (this.clients.previewing) return this.preview.chat.setMuted(threadId, muted);
    const { club, client } = this.clients.active();
    const memberId = await this.clients.memberId();
    const { error } = muted
      ? await client
          .from('thread_mutes')
          .upsert({ club_id: club.id, thread_id: threadId, member_id: memberId }, { ignoreDuplicates: true })
      : await client.from('thread_mutes').delete().eq('thread_id', threadId).eq('member_id', memberId);
    if (error) throw dbError(error);
  }

  subscribe(listener: (event: ChatEvent) => void): () => void {
    this.listeners.add(listener);
    const stopPreview = this.preview.chat.subscribe(listener);
    void this.reconnect();
    return () => {
      this.listeners.delete(listener);
      stopPreview();
      if (!this.listeners.size) void this.reconnect();
    };
  }

  /** New messages from other people in the active club. Row-level security limits them to my threads. */
  private async reconnect(): Promise<void> {
    const generation = ++this.generation;
    if (this.channel) {
      const { client, channel } = this.channel;
      this.channel = null;
      await client.removeChannel(channel);
    }
    const active = this.clients.activeOrNull();
    if (!active || !this.listeners.size || this.clients.previewing) return;
    const session = await this.clients.session().catch(() => null);
    if (!session || generation !== this.generation) return;
    const me = session.user.app_metadata['member_id'];
    const { club, client } = active;
    await client.realtime.setAuth(session.access_token);
    const channel = client
      .channel(`messages:${club.id}`)
      .on<MessageRow>(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `club_id=eq.${club.id}` },
        ({ new: row }) => {
          if (row.from_member_id === me) return;
          const event: ChatEvent = { type: 'message', threadId: row.thread_id, message: toMessage(row) };
          this.listeners.forEach((l) => l(event));
        },
      )
      .subscribe();
    this.channel = { client, channel };
  }
}
