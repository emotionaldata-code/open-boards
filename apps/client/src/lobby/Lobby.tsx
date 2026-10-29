import { GameButton } from '../ui/GameButton';
import { GameFrame } from '../ui/GameFrame';
import { messageText } from '../ui/messages';
import { useEffect, useState } from 'react';
import type { RoomListing } from '@open-boards/protocol';
import { http } from '../network/http';
import { MapPreview } from './MapPreview';
export function Lobby({
  onCreate,
  onJoin,
  busy,
}: {
  onCreate: (capacity: 2 | 4, role?: 'player' | 'spectator') => void;
  onJoin: (id: string, role?: 'player' | 'spectator') => void;
  busy: boolean;
}) {
  const [rooms, setRooms] = useState<RoomListing[]>([]);
  const [id, setId] = useState(new URLSearchParams(location.search).get('room') ?? '');
  const [watch, setWatch] = useState(new URLSearchParams(location.search).has('watch'));
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const compactQuery = '(max-width: 680px) and (orientation: portrait), (max-height: 600px)';
  const [compact, setCompact] = useState(() => matchMedia(compactQuery).matches);
  const pageSize = compact ? 1 : 3;
  const pages = Math.max(1, Math.ceil(rooms.length / pageSize));
  useEffect(() => {
    const media = matchMedia(compactQuery);
    const update = () => setCompact(media.matches);
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  const currentPage = Math.min(page, pages - 1);
  useEffect(() => {
    let active = true;
    const load = () => {
      void http<RoomListing[]>('/rooms')
        .then((data) => {
          if (active) {
            setRooms(data);
            setError('');
          }
        })
        .catch((error) => {
          if (active) setError(error.message);
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    };
    load();
    const interval = setInterval(load, 4000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, []);
  return (
    <main className="lobby-page">
      <div className="page-title">
        <div>
          <h1>Trova il tuo tavolo</h1>
        </div>
        <span className="muted">2 o 4 giocatori · Regole base</span>
      </div>
      <MapPreview />
      <div className="lobby-grid">
        <section className="panel">
          <GameFrame />
          <h2>Apri un tavolo</h2>
          <div className="create-options">
            <GameButton onClick={() => onCreate(2)} disabled={busy}>
              <strong>2</strong>
              <span>Duello</span>
            </GameButton>
            <GameButton onClick={() => onCreate(4)} disabled={busy}>
              <strong>4</strong>
              <span>Tutti contro tutti</span>
            </GameButton>
          </div>
          <GameButton onClick={() => onCreate(2, 'spectator')} disabled={busy}>
            Organizza una partita tra bot
          </GameButton>
          <h2>Entra con un codice</h2>
          <form
            className="inline-form"
            onSubmit={(e) => {
              e.preventDefault();
              onJoin(id.trim(), watch ? 'spectator' : 'player');
            }}
          >
            <label className="grow">
              Codice stanza
              <input
                value={id}
                onChange={(e) => setId(e.target.value)}
                required
                placeholder="Incolla il codice stanza"
                maxLength={40}
              />
            </label>
            <GameButton disabled={busy || !id.trim()} className="primary">
              {watch ? 'Osserva' : 'Entra al tavolo'}
            </GameButton>
          </form>
          <label className="watch-option">
            <input type="checkbox" checked={watch} onChange={(e) => setWatch(e.target.checked)} />
            Entra come spettatore
          </label>
        </section>
        <section className="panel room-list">
          <GameFrame />
          <div className="section-heading">
            <h2>Tavoli disponibili</h2>
            <span className="muted">
              {rooms.length} {rooms.length === 1 ? 'tavolo' : 'tavoli'}
            </span>
          </div>
          <div className="room-list-content" aria-busy={loading}>
            {loading ? (
              <p className="empty" role="status">
                Ricerca dei tavoli aperti…
              </p>
            ) : error ? (
              <p className="error" role="alert">
                {messageText(error)}
              </p>
            ) : rooms.length === 0 ? (
              <p className="empty">Nessun tavolo aperto. Creane uno e invita un amico.</p>
            ) : (
              <ul>
                {rooms
                  .slice(currentPage * pageSize, currentPage * pageSize + pageSize)
                  .map((room) => (
                    <li key={room.id}>
                      <div>
                        <strong>Tavolo di {room.host}</strong>
                        <small className="muted">
                          {room.id} · {room.capacity === 2 ? 'Duello' : 'Tutti contro tutti'}
                        </small>
                      </div>
                      <span>
                        {room.seats} / {room.capacity} giocatori
                      </span>
                      <GameButton
                        disabled={busy || (!room.joinable && !room.watchable)}
                        onClick={() => onJoin(room.id, room.joinable ? 'player' : 'spectator')}
                      >
                        {room.joinable ? 'Entra' : 'Osserva'}
                      </GameButton>
                    </li>
                  ))}
              </ul>
            )}
          </div>
          {pages > 1 && (
            <nav className="pagination" aria-label="Pagine delle stanze">
              <GameButton disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>
                Precedente
              </GameButton>
              <span>
                {currentPage + 1} / {pages}
              </span>
              <GameButton
                disabled={currentPage + 1 === pages}
                onClick={() => setPage(currentPage + 1)}
              >
                Successiva
              </GameButton>
            </nav>
          )}
        </section>
      </div>
    </main>
  );
}
