import { useState } from 'react';
import { characters, defaultCharacter } from '@open-boards/content';
import { CharacterPicker } from '../characters/CharacterPicker';
import type { RoomView, User } from '@open-boards/protocol';
export function WaitingRoom({
  room,
  user,
  onReady,
  onCharacter,
  onStart,
  onLeave,
}: {
  room: RoomView;
  user: User;
  onReady: () => void;
  onCharacter: (character: string) => void;
  onStart: () => void;
  onLeave: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const own = room.seats.find((s) => s.id === user.id);
  const character = characters[own?.character ?? defaultCharacter];
  const canStart = room.seats.length === room.capacity && room.seats.every((s) => s.ready);
  return (
    <main className="waiting-page">
      <div className="page-title">
        <div>
          <h1>Your table is open</h1>
          <p className="muted">
            {room.capacity === 2 ? 'Head to head' : 'Four-player free-for-all'} · Everyone readies
            up before the host starts.
          </p>
        </div>
        <button onClick={onLeave}>Leave table</button>
      </div>
      <div className="waiting-grid">
        <section className="panel">
          <div className="section-heading">
            <h2>Seats at the table</h2>
            <span className="muted">
              {room.seats.length} / {room.capacity}
            </span>
          </div>
          <ol className="seats">
            {Array.from({ length: room.capacity }, (_, i) => {
              const seat = room.seats[i];
              return (
                <li key={i}>
                  <span className="seat-number">0{i + 1}</span>
                  <div className="grow">
                    <strong>
                      {seat?.name ?? 'Open seat'}
                      {seat?.id === user.id ? ' (you)' : ''}
                    </strong>
                    <small className="muted">
                      {seat
                        ? `${seat.id === room.host ? 'Host · ' : ''}${characters[seat.character].name} · ${characters[seat.character].attackType}`
                        : 'Invite a friend to join'}
                    </small>
                  </div>
                  <span className={seat?.ready ? 'ready' : 'muted'}>
                    {seat ? (seat.ready ? 'Ready' : 'Not ready') : 'Waiting'}
                  </span>
                </li>
              );
            })}
          </ol>
          <CharacterPicker selected={own?.character ?? defaultCharacter} onChoose={onCharacter} />
          <div className="button-row">
            <button className="primary" onClick={onReady}>
              {own?.ready ? 'Not ready' : 'Ready up'}
            </button>
            {room.host === user.id && (
              <button onClick={onStart} disabled={!canStart}>
                Start match
              </button>
            )}
          </div>
        </section>
        <section className="panel invite">
          <h2>Bring your rivals</h2>
          <p className="muted">Share this link. Your friends will sign in and join this table.</p>
          <label>
            Room ID
            <input readOnly value={room.id} onFocus={(e) => e.target.select()} />
          </label>
          <button
            onClick={() => {
              void navigator.clipboard
                .writeText(`${location.origin}/?room=${room.id}`)
                .then(() => setCopied(true));
            }}
          >
            {copied ? 'Link copied' : 'Copy invite link'}
          </button>
          <p className="muted">
            {character.hp} health · movement {character.movement} ·{' '}
            {character.deck.reduce((sum, entry) => sum + entry.count, 0)} cards.{' '}
            {character.attackType === 'ranged'
              ? 'Attack adjacent rivals or rivals sharing any space color.'
              : 'Attack adjacent rivals.'}{' '}
            Changing character clears your ready status.
          </p>
          {(character.abilities ?? []).map((ability) => (
            <p className="muted" key={ability.id}>
              <strong>{ability.name}</strong> · {ability.description}
            </p>
          ))}
        </section>
      </div>
    </main>
  );
}
