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
  onCreate: (capacity: 2 | 4) => void;
  onJoin: (id: string) => void;
  busy: boolean;
}) {
  const [rooms, setRooms] = useState<RoomListing[]>([]);
  const [id, setId] = useState(new URLSearchParams(location.search).get('room') ?? '');
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
          <h2>Apri un tavolo</h2>
          <div className="create-options">
            <button onClick={() => onCreate(2)} disabled={busy}>
              <strong>2</strong>
              <span>Duello</span>
            </button>
            <button onClick={() => onCreate(4)} disabled={busy}>
              <strong>4</strong>
              <span>Tutti contro tutti</span>
            </button>
          </div>
          <h2>Gioca con gli amici</h2>
          <form
            className="inline-form"
            onSubmit={(e) => {
              e.preventDefault();
              onJoin(id.trim());
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
            <button disabled={busy || !id.trim()} className="primary">
              Entra al tavolo
            </button>
          </form>
        </section>
        <section className="panel room-list">
          <div className="section-heading">
            <h2>In attesa di giocatori</h2>
            <span className="muted">
              {rooms.length} {rooms.length === 1 ? 'tavolo aperto' : 'tavoli aperti'}
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
                      <button disabled={busy} onClick={() => onJoin(room.id)}>
                        Entra
                      </button>
                    </li>
                  ))}
              </ul>
            )}
          </div>
          {pages > 1 && (
            <nav className="pagination" aria-label="Pagine delle stanze">
              <button disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>
                Precedente
              </button>
              <span>
                {currentPage + 1} / {pages}
              </span>
              <button disabled={currentPage + 1 === pages} onClick={() => setPage(currentPage + 1)}>
                Successiva
              </button>
            </nav>
          )}
        </section>
      </div>
    </main>
  );
}
