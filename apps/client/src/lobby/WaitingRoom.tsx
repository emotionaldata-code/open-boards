import { useState } from 'react';
import { characters, defaultCharacter } from '@open-boards/content';
import { CharacterPicker } from '../characters/CharacterPicker';
import { CharacterPortrait } from '../characters/CharacterPortrait';
import { MapPreview } from './MapPreview';
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
  const [copyError, setCopyError] = useState(false);
  const own = room.seats.find((s) => s.id === user.id);
  const character = characters[own?.character ?? defaultCharacter];
  const canStart = room.seats.length === room.capacity && room.seats.every((s) => s.ready);
  async function copyInvite() {
    setCopyError(false);
    try {
      await navigator.clipboard.writeText(`${location.origin}/?room=${room.id}`);
      setCopied(true);
    } catch {
      setCopied(false);
      setCopyError(true);
    }
  }
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
                  {seat ? (
                    <CharacterPortrait character={seat.character} />
                  ) : (
                    <span className="open-seat" aria-label={`Seat ${i + 1}`}>
                      +
                    </span>
                  )}
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
        </section>
        <section className="panel invite">
          <MapPreview />
          <h2>Invite players</h2>
          <p className="muted">Share the invite link to join this table.</p>
          <label>
            Room ID
            <input readOnly value={room.id} onFocus={(e) => e.target.select()} />
          </label>
          <button onClick={() => void copyInvite()}>
            {copied ? 'Link copied' : 'Copy invite link'}
          </button>
          <span className={copyError ? 'error' : 'muted'} role="status">
            {copyError
              ? 'Could not copy. Share the Room ID above.'
              : copied
                ? 'Invite link copied to clipboard.'
                : `${room.seats.filter((seat) => seat.ready).length} / ${room.capacity} players ready`}
          </span>
          <div className="match-controls">
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
            <p className="muted">
              {canStart
                ? 'Everyone is ready. The host can start the match.'
                : 'Fill every seat and ready up to begin.'}
            </p>
          </div>
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
