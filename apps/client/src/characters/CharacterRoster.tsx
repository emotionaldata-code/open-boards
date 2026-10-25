import { useId, useRef, useState } from 'react';
import { characters, defaultCharacter } from '@open-boards/content';
import { CharacterPortrait } from './CharacterPortrait';
import { profiles } from './profiles';
import { DeckExplorer } from '../cards/DeckExplorer';

/** Shared, read-only exploration; only the waiting room supplies an admission change callback. */
export function CharacterRoster({
  selected = defaultCharacter,
  onChoose,
}: {
  selected?: string;
  onChoose?: (character: string) => void;
}) {
  const [inspected, setInspected] = useState(selected);
  const id = useId();
  const [deckOpen, setDeckOpen] = useState(false);
  const detail = useRef<HTMLDivElement>(null);
  const character = characters[inspected];
  const profile = profiles[inspected];
  return (
    <section className="character-roster" aria-label="Character roster">
      <div className="roster-heading">
        <h2>Find your fighter</h2>
        <span>
          {Object.keys(characters).length}{' '}
          {Object.keys(characters).length === 1 ? 'character' : 'characters'}
        </span>
      </div>
      <div className="roster-detail" id={id} ref={detail}>
        <CharacterPortrait character={inspected} />
        <div className="roster-description">
          <p className="character-role">
            {profile.role} · {character.attackType}
          </p>
          <h3>{character.name}</h3>
          <p className="character-summary">{profile.summary}</p>
          <dl className="character-stats">
            <div>
              <dt>Health</dt>
              <dd>{character.hp}</dd>
            </div>
            <div>
              <dt>Movement</dt>
              <dd>{character.movement}</dd>
            </div>
            <div>
              <dt>Deck</dt>
              <dd>{character.deck.reduce((sum, entry) => sum + entry.count, 0)}</dd>
            </div>
          </dl>
        </div>
      </div>
      <div className="roster-rules" aria-live="polite" aria-atomic="true">
        <p className="character-range">
          {character.attackType === 'ranged'
            ? 'Reach: adjacent or any shared color.'
            : 'Reach: adjacent spaces only.'}
        </p>
        {character.cardEffectProtection && (
          <p>
            <strong>{character.cardEffectProtection.name}</strong>{' '}
            {character.cardEffectProtection.description}
          </p>
        )}
        {(character.abilities ?? []).length
          ? character.abilities!.map((ability) => (
              <p key={ability.id}>
                <strong>{ability.name}</strong> {ability.description}
              </p>
            ))
          : !character.cardEffectProtection && (
              <p>
                <strong>Fundamentals</strong> No special rules. Learn positioning, cards and timing.
              </p>
            )}
        {character.ally && (
          <div className="ally-rules">
            <p>
              <strong>
                {character.ally.count} × {character.ally.name}
              </strong>{' '}
              · {character.ally.hp} HP each · {character.ally.attackType} · use the hero’s movement.
            </p>
            {character.ally.abilities?.map((ability) => (
              <p key={ability.id}>
                <strong>{ability.name}</strong> {ability.description}
              </p>
            ))}
          </div>
        )}
        <p className="character-tactic">{profile.tactic}</p>
      </div>
      <button type="button" className="roster-deck" onClick={() => setDeckOpen(true)}>
        Explore {character.name}’s deck · {character.deck.length} designs
      </button>
      {deckOpen && <DeckExplorer character={inspected} onClose={() => setDeckOpen(false)} />}
      <div className="roster-list" role="group" aria-label="Explore characters">
        {Object.values(characters).map((candidate) => (
          <button
            type="button"
            key={candidate.id}
            aria-label={`Inspect ${candidate.name}`}
            aria-pressed={candidate.id === inspected}
            aria-controls={id}
            onClick={(event) => {
              setInspected(candidate.id);
              if (event.detail) detail.current?.scrollIntoView({ block: 'nearest' });
            }}
          >
            <CharacterPortrait character={candidate.id} />
            <span>{candidate.name}</span>
          </button>
        ))}
      </div>
      {onChoose && (
        <div className="roster-confirm">
          <p>Changing character clears your ready status.</p>
          <button type="button" className="primary" onClick={() => onChoose(inspected)}>
            Choose {character.name}
          </button>
        </div>
      )}
    </section>
  );
}
