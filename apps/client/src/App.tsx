import { messageText } from './ui/messages';
import { useEffect, useRef, useState } from 'react';
import type { Command } from '@open-boards/game';
import type { GameView, RoomView, Snapshot, User } from '@open-boards/protocol';
import { Auth } from './auth/Auth';
import { Lobby } from './lobby/Lobby';
import { WaitingRoom } from './lobby/WaitingRoom';
import { Game } from './game/Game';
import { presentationEvents, type PresentationEvent } from './animation/events';
import { FullscreenButton } from './ui/DisplayControls';
import { SoundButton } from './ui/SoundButton';
import { HowToPlay } from './ui/HowToPlay';
import { http } from './network/http';
import { Connection } from './network/connection';
import { sound } from './audio/player';
export function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [room, setRoom] = useState<RoomView | null>(null);
  const [events, setEvents] = useState<PresentationEvent[]>([]);
  const previousGame = useRef<GameView | null>(null);
  const [reset, setReset] = useState(0);
  const [error, setError] = useState('');
  const [commandReset, setCommandReset] = useState(0);
  const [status, setStatus] = useState('Connected');
  const [busy, setBusy] = useState(false);
  const connection = useRef<Connection | null>(null);
  const receipt = useRef(0);
  useEffect(() => {
    if (error) sound.play('alert');
  }, [error]);
  function install(snapshot: Snapshot) {
    setCommandReset((x) => x + 1);
    setRoom(snapshot.room);
    const next = snapshot.room.game;
    const incoming =
      !snapshot.reset && next
        ? presentationEvents(previousGame.current, next, snapshot.outcomes, ++receipt.current)
        : [];
    previousGame.current = next;
    setEvents((old) => (snapshot.reset ? [] : [...old, ...incoming].slice(-96)));
    if (snapshot.reset) setReset((x) => x + 1);
    setBusy(false);
  }
  useEffect(() => {
    connection.current = new Connection(
      install,
      (message) => {
        setError(message);
        setCommandReset((x) => x + 1);
      },
      setStatus,
    );
    void http<User>('/auth/me')
      .then(async (user) => {
        setUser(user);
        await connection.current!.restore();
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);
  async function join(capacity?: 2 | 4, id?: string) {
    setBusy(true);
    setError('');
    try {
      await connection.current!.connect(capacity, id);
      history.replaceState(null, '', `/?room=${connection.current!.room!.roomId}`);
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function leave() {
    await connection.current?.leave();
    setRoom(null);
    setEvents([]);
    previousGame.current = null;
    setError('');
    history.replaceState(null, '', '/');
  }
  async function logout() {
    await leave();
    await http('/auth/logout', {});
    setUser(null);
  }
  function command(command: Command) {
    if (!room?.game) return;
    setError('');
    connection.current?.command({ id: crypto.randomUUID(), revision: room.game.revision, command });
  }
  return (
    <div className={`shell ${room?.game ? 'in-match' : ''}`}>
      <header className="topbar">
        <a className="wordmark" href="/" aria-label="Pagina iniziale di Open Boards">
          <svg viewBox="0 0 28 28" width="28" height="28" aria-hidden="true">
            <path
              d="M14 2 26 14 14 26 2 14Z M14 2v24 M2 14h24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            />
            <circle cx="14" cy="14" r="3" fill="currentColor" />
          </svg>
          <span>Open Boards</span>
        </a>
        <div className="topbar-right">
          <HowToPlay />
          <SoundButton />
          {!room?.game && <FullscreenButton />}
          {user && !room?.game ? (
            <>
              <span className="muted">{user.name}</span>
              <span className="connection-status">{messageText(status)}</span>
              <button
                className="text-button"
                onClick={() => void logout().catch((e) => setError(e.message))}
              >
                Esci
              </button>
            </>
          ) : null}
        </div>
      </header>
      {error && (
        <div className="notice" role="alert">
          <span>{messageText(error)}</span>
          <button onClick={() => setError('')} aria-label="Chiudi errore">
            Chiudi
          </button>
          {status === 'Disconnected' && (
            <button onClick={() => void leave()}>Torna alla lobby</button>
          )}
        </div>
      )}
      {loading ? (
        <main>
          <p role="status">Apertura del tavolo…</p>
        </main>
      ) : !user ? (
        <Auth onUser={setUser} />
      ) : !room ? (
        <Lobby
          onCreate={(capacity) => void join(capacity)}
          onJoin={(id) => void join(undefined, id)}
          busy={busy}
        />
      ) : room.game ? (
        <Game
          room={room}
          user={user}
          events={events}
          reset={reset}
          onCommand={command}
          onLeave={() => void leave()}
          connected={status === 'Connected'}
          commandReset={commandReset}
        />
      ) : (
        <WaitingRoom
          room={room}
          user={user}
          onReady={() => connection.current?.send('ready')}
          onCharacter={(character) => connection.current?.selectCharacter(character)}
          onStart={() => connection.current?.send('start')}
          onLeave={() => void leave()}
        />
      )}
    </div>
  );
}
