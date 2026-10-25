import { useEffect, useState } from 'react';
import type { RoomListing } from '@open-boards/protocol';
import { http } from '../network/http';
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
          <h1>Find your table</h1>
        </div>
        <span className="muted">King Solomon’s Mine · Basic rules</span>
      </div>
      <div className="lobby-grid">
        <section className="panel">
          <h2>Open a table</h2>
          <div className="create-options">
            <button onClick={() => onCreate(2)} disabled={busy}>
              <strong>2</strong>
              <span>Head to head</span>
            </button>
            <button onClick={() => onCreate(4)} disabled={busy}>
              <strong>4</strong>
              <span>Free-for-all</span>
            </button>
          </div>
          <h2>Join your friends</h2>
          <form
            className="inline-form"
            onSubmit={(e) => {
              e.preventDefault();
              onJoin(id.trim());
            }}
          >
            <label className="grow">
              Room ID
              <input
                value={id}
                onChange={(e) => setId(e.target.value)}
                required
                placeholder="Paste a room ID"
                maxLength={40}
              />
            </label>
            <button disabled={busy || !id.trim()} className="primary">
              Join table
            </button>
          </form>
        </section>
        <section className="panel room-list">
          <div className="section-heading">
            <h2>Waiting for players</h2>
            <span className="muted">
              {rooms.length} open {rooms.length === 1 ? 'table' : 'tables'}
            </span>
          </div>
          {error ? (
            <p className="error" role="alert">
              {error}
            </p>
          ) : rooms.length === 0 ? (
            <p className="empty">No open tables yet. Create one and invite a friend.</p>
          ) : (
            <ul>
              {rooms
                .slice(currentPage * pageSize, currentPage * pageSize + pageSize)
                .map((room) => (
                  <li key={room.id}>
                    <div>
                      <strong>{room.host}’s table</strong>
                      <small className="muted">
                        {room.id} · {room.capacity === 2 ? 'Duel' : 'Free-for-all'}
                      </small>
                    </div>
                    <span>
                      {room.seats} / {room.capacity} seated
                    </span>
                    <button disabled={busy} onClick={() => onJoin(room.id)}>
                      Join
                    </button>
                  </li>
                ))}
            </ul>
          )}
          {pages > 1 && (
            <nav className="pagination" aria-label="Room pages">
              <button disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>
                Previous
              </button>
              <span>
                {currentPage + 1} / {pages}
              </span>
              <button disabled={currentPage + 1 === pages} onClick={() => setPage(currentPage + 1)}>
                Next
              </button>
            </nav>
          )}
        </section>
      </div>
    </main>
  );
}
