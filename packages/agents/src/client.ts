import { Client, type Room } from '@colyseus/sdk';
import type { Command, Definitions } from '@open-boards/game';
import type { CommandError, RoomListing, Snapshot, User } from '@open-boards/protocol';
import { legalActions, pendingActor, type PlayerObservation } from './observation';

export interface RemoteClientOptions {
  endpoint: string;
  /** Required by the server origin policy; defaults to endpoint's origin. */
  origin?: string;
  fetch?: typeof fetch;
  /** Node only. Browsers send the existing HttpOnly session automatically. */
  cookie?: string;
  /** Supply an SDK client for custom transports/proxies. */
  createTransport?: (endpoint: string, headers: Record<string, string>) => Client;
}
export interface RemoteHandlers {
  snapshot(snapshot: Snapshot): void;
  error?(error: CommandError): void;
  leave?(code: number): void;
}

/** Uses the application's existing account endpoints and Colyseus session. */
export class RemoteClient {
  private cookie: string | undefined;
  constructor(private readonly options: RemoteClientOptions) {
    this.cookie = options.cookie;
  }

  private async request<T>(path: string, body?: unknown): Promise<T> {
    const headers: Record<string, string> = {
      Origin: this.options.origin ?? new URL(this.options.endpoint).origin,
    };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (this.cookie) headers.Cookie = this.cookie;
    const response = await (this.options.fetch ?? fetch)(
      new URL(`/api${path}`, this.options.endpoint),
      {
        method: body === undefined ? 'GET' : 'POST',
        headers,
        credentials: 'include',
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      },
    );
    if (!response.ok) {
      const error = (await response.json().catch(() => null)) as { message?: string } | null;
      throw new Error(error?.message ?? `Request failed (${response.status})`);
    }
    const cookie = response.headers.get('set-cookie');
    if (cookie) this.cookie = cookie.split(';')[0];
    return response.status === 204 ? (undefined as T) : (response.json() as Promise<T>);
  }
  register(username: string, password: string): Promise<User> {
    return this.request('/auth/register', { username, password });
  }
  login(username: string, password: string): Promise<User> {
    return this.request('/auth/login', { username, password });
  }
  session(): Promise<User> {
    return this.request('/auth/me');
  }
  async logout(): Promise<void> {
    await this.request('/auth/logout', {});
    this.cookie = undefined;
  }
  rules(): Promise<Definitions> {
    return this.request('/rules');
  }
  rooms(): Promise<RoomListing[]> {
    return this.request('/rooms');
  }

  private transport(): Client {
    const headers: Record<string, string> = {
      Origin: this.options.origin ?? new URL(this.options.endpoint).origin,
    };
    if (this.cookie) headers.Cookie = this.cookie;
    return (
      this.options.createTransport?.(this.options.endpoint, headers) ??
      new Client(this.options.endpoint, { headers })
    );
  }
  async create(
    capacity: 2 | 4,
    handlers: RemoteHandlers,
    role: 'player' | 'spectator' = 'player',
  ): Promise<RemoteRoom> {
    return new RemoteRoom(await this.transport().create('arena', { capacity, role }), handlers);
  }
  async join(
    id: string,
    handlers: RemoteHandlers,
    role: 'player' | 'spectator' = 'player',
  ): Promise<RemoteRoom> {
    return new RemoteRoom(await this.transport().joinById(id, { role }), handlers);
  }
  async reconnect(token: string, handlers: RemoteHandlers): Promise<RemoteRoom> {
    return new RemoteRoom(await this.transport().reconnect(token), handlers);
  }
}

export class RemoteRoom {
  snapshot: Snapshot | null = null;
  constructor(
    readonly room: Room,
    handlers: RemoteHandlers,
  ) {
    room.onMessage('snapshot', (snapshot: Snapshot) => {
      this.snapshot = snapshot;
      handlers.snapshot(snapshot);
    });
    room.onMessage('error', (error: CommandError) => handlers.error?.(error));
    room.onError((code, message) =>
      handlers.error?.({ code: String(code), message: message ?? 'Connection error.' }),
    );
    room.onLeave((code) => handlers.leave?.(code));
    room.onReconnect(() => room.send('sync'));
    room.send('sync');
  }
  get id(): string {
    return this.room.roomId;
  }
  get reconnectionToken(): string {
    return this.room.reconnectionToken;
  }
  character(character: string): void {
    this.room.send('character', { character });
  }
  ready(): void {
    this.room.send('ready');
  }
  start(): void {
    this.room.send('start');
  }
  addBot(character: string): void {
    this.room.send('add-bot', { character, policy: 'random' });
  }
  removeBot(id: string): void {
    this.room.send('remove-bot', { id });
  }
  command(
    command: Command,
    revision = this.snapshot?.room.game?.revision,
    id: string = crypto.randomUUID(),
  ): void {
    if (revision === undefined)
      throw new Error('Wait for a game snapshot before submitting commands.');
    this.room.send('command', { id, revision, command });
  }
  observation(player: string, definitions: Definitions): PlayerObservation | null {
    const game = this.snapshot?.room.game;
    if (!game || this.snapshot?.room.viewerRole !== 'player') return null;
    const copy = structuredClone({ game, definitions });
    return {
      ...copy,
      player,
      actor: pendingActor(copy.game),
      legal: legalActions(copy.game, copy.definitions, player),
    };
  }
  async leave(): Promise<void> {
    this.room.reconnection.enabled = false;
    await this.room.leave();
  }
}
