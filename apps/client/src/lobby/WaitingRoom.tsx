import { GameButton } from '../ui/GameButton';
import { GameFrame } from '../ui/GameFrame';
import { Icon } from '../ui/Icon';
import { contentText } from '../localization/text';
import { attackTypeLabel } from '../ui/labels';
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
  onAddBot,
  onRemoveBot,
  onLeave,
}: {
  room: RoomView;
  user: User;
  onReady: () => void;
  onCharacter: (character: string) => void;
  onStart: () => void;
  onAddBot: (character: string) => void;
  onRemoveBot: (id: string) => void;
  onLeave: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);
  const own =
    room.viewerRole === 'spectator' ? undefined : room.seats.find((s) => s.id === user.id);
  const [botCharacter, setBotCharacter] = useState(defaultCharacter);
  const character = characters[own?.character ?? defaultCharacter];
  const canStart = room.seats.length === room.capacity && room.seats.every((s) => s.ready);
  async function copyInvite() {
    setCopyError(false);
    try {
      await navigator.clipboard.writeText(
        `${location.origin}/?room=${room.id}${own ? '' : '&watch=1'}`,
      );
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
          <h1>Il tuo tavolo è aperto</h1>
          <p className="muted">
            {room.capacity === 2 ? 'Duello' : 'Tutti contro tutti a quattro'} · Tutti devono essere
            pronti prima che l’organizzatore avvii la partita.
          </p>
        </div>
        <GameButton onClick={onLeave}>Lascia il tavolo</GameButton>
      </div>
      <div className="waiting-grid">
        <section className="panel">
          <GameFrame />
          <div className="section-heading">
            <h2>Posti al tavolo</h2>
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
                    <span className="open-seat" aria-label={`Posto ${i + 1}`}>
                      +
                    </span>
                  )}
                  <div className="grow">
                    <strong>
                      {seat?.name ?? 'Posto libero'}
                      {own && seat?.id === own.id ? ' (tu)' : ''}
                      {seat?.controller.type === 'bot' ? ' · Bot' : ''}
                    </strong>
                    <small className="muted">
                      {seat
                        ? `${seat.id === room.host ? 'Organizzatore · ' : ''}${contentText(characters[seat.character].name)} · ${attackTypeLabel[characters[seat.character].attackType]}`
                        : 'Invita un amico'}
                    </small>
                  </div>
                  <span className={seat?.ready ? 'ready' : 'muted'}>
                    {seat ? (seat.ready ? 'Pronto' : 'Non pronto') : 'In attesa'}
                  </span>
                  {seat?.controller.type === 'bot' && room.host === user.id && (
                    <GameButton
                      className="icon-button remove-bot"
                      aria-label={`Rimuovi ${seat.name}`}
                      onClick={() => onRemoveBot(seat.id)}
                    >
                      <Icon name="close" />
                    </GameButton>
                  )}
                </li>
              );
            })}
          </ol>
          {room.host === user.id && room.seats.length < room.capacity && (
            <section className="bot-controls" aria-label="Schiera un bot">
              <h3>Schiera un bot</h3>
              <CharacterPicker selected={botCharacter} onChoose={setBotCharacter} purpose="bot" />
              <GameButton className="primary add-bot" onClick={() => onAddBot(botCharacter)}>
                <Icon name="duel" />
                Aggiungi bot
              </GameButton>
            </section>
          )}
          {own ? (
            <CharacterPicker selected={own.character} onChoose={onCharacter} />
          ) : (
            <p className="spectator-note muted">
              <Icon name="spectate" />
              <span>Sei uno spettatore. Segui il duello senza occupare un posto.</span>
            </p>
          )}
        </section>
        <section className="panel invite">
          <GameFrame />
          <MapPreview />
          <h2>{own ? 'Invita giocatori' : 'Invita spettatori'}</h2>
          <p className="muted">
            {own
              ? 'Condividi il link di invito a questo tavolo.'
              : 'Condividi il link per seguire la partita.'}
          </p>
          <label>
            Codice stanza
            <input readOnly value={room.id} onFocus={(e) => e.target.select()} />
          </label>
          <GameButton onClick={() => void copyInvite()}>
            {copied ? 'Link copiato' : 'Copia link di invito'}
          </GameButton>
          <span className={copyError ? 'error' : 'muted'} role="status">
            {copyError
              ? 'Copia non riuscita. Condividi il codice stanza qui sopra.'
              : copied
                ? 'Link di invito copiato negli appunti.'
                : `${room.seats.filter((seat) => seat.ready).length} / ${room.capacity} giocatori pronti`}
          </span>
          <div className="match-controls">
            <div className="button-row">
              {own && (
                <GameButton className="primary" onClick={onReady}>
                  {own.ready ? 'Non pronto' : 'Sono pronto'}
                </GameButton>
              )}
              {room.host === user.id && (
                <GameButton onClick={onStart} disabled={!canStart}>
                  Avvia partita
                </GameButton>
              )}
            </div>
            <p className="muted">
              {canStart
                ? 'Tutti pronti. L’organizzatore può avviare la partita.'
                : 'Per iniziare, tutti i posti devono essere occupati e i giocatori pronti.'}
            </p>
          </div>
          {own && (
            <p className="muted">
              {character.hp} vita · movimento {character.movement} ·{' '}
              {character.deck.reduce((sum, entry) => sum + entry.count, 0)} carte.{' '}
              {character.attackType === 'ranged'
                ? 'Attacca nemici adiacenti o in una zona dello stesso colore.'
                : 'Attacca nemici adiacenti.'}{' '}
              Cambiare personaggio annulla il tuo stato di pronto.
            </p>
          )}
          {(own ? (character.abilities ?? []) : []).map((ability) => (
            <p className="muted" key={ability.id}>
              <strong>{contentText(ability.name)}</strong> · {contentText(ability.description)}
            </p>
          ))}
        </section>
      </div>
    </main>
  );
}
