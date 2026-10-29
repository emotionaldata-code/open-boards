import { Client, type Room } from '@colyseus/sdk';
import { http } from './http';
import type { CommandEnvelope } from '@open-boards/game';
import type { CommandError, Snapshot } from '@open-boards/protocol';
const storageKey = 'open-boards-reconnect';
export class Connection {
  private client = new Client(window.location.origin, {
    urlBuilder: (url) => {
      if (import.meta.env.DEV && (url.protocol === 'ws:' || url.protocol === 'wss:'))
        url.pathname = `/ws${url.pathname}`;
      return url.toString();
    },
  });
  room: Room | null = null;
  private intentional = false;
  private viewerRole: 'player' | 'spectator' = 'player';
  constructor(
    private snapshot: (snapshot: Snapshot) => void,
    private error: (error: string) => void,
    private status: (status: string) => void,
  ) {}
  async connect(
    capacity?: 2 | 4,
    id?: string,
    role: 'player' | 'spectator' = 'player',
  ): Promise<void> {
    this.intentional = false;
    const room = capacity
      ? await this.client.create('arena', { capacity, role })
      : await this.client.joinById(id!, { role });
    this.viewerRole = role;
    this.bind(room);
  }
  async restore(): Promise<boolean> {
    const token = sessionStorage.getItem(storageKey);
    if (!token) return false;
    try {
      this.bind(await this.client.reconnect(token));
      return true;
    } catch {
      sessionStorage.removeItem(storageKey);
      this.error('Il posto salvato è scaduto. Entra in una stanza o creane una nuova.');
      return false;
    }
  }
  private bind(room: Room): void {
    this.room = room;
    sessionStorage.setItem(storageKey, room.reconnectionToken);
    this.status('Connected');
    room.onMessage('snapshot', (snapshot: Snapshot) => {
      this.viewerRole = snapshot.room.viewerRole;
      if (this.viewerRole === 'spectator') sessionStorage.removeItem(storageKey);
      this.snapshot(snapshot);
    });
    room.onMessage('error', (error: CommandError) => this.error(error.message));
    room.onError((_code, message) => this.error(message ?? 'Errore di connessione.'));
    room.onDrop(() => this.status(this.viewerRole === 'player' ? 'Reconnecting…' : 'Disconnected'));
    room.onReconnect(() => {
      sessionStorage.setItem(storageKey, room.reconnectionToken);
      this.status('Connected');
      room.send('sync');
    });
    room.onLeave(() => {
      if (!this.intentional) {
        this.status('Disconnected');
        this.error('Connessione interrotta. Torna alla lobby per giocare di nuovo.');
      }
      sessionStorage.removeItem(storageKey);
    });
    room.send('sync');
  }
  send(type: 'ready' | 'start'): void {
    this.room?.send(type);
  }
  selectCharacter(character: string): void {
    this.room?.send('character', { character });
  }
  addBot(character: string): void {
    this.room?.send('add-bot', { character, policy: 'random' });
  }
  removeBot(id: string): void {
    this.room?.send('remove-bot', { id });
  }
  command(command: CommandEnvelope): void {
    this.room?.send('command', command);
  }
  async leave(): Promise<void> {
    this.intentional = true;
    sessionStorage.removeItem(storageKey);
    if (this.room) {
      this.room.reconnection.enabled = false;
      if (this.room.connection.isOpen) await this.room.leave();
      else if (this.viewerRole === 'player') await http('/rooms/leave', {});
    }
    this.room = null;
    this.status('Connected');
  }
}
