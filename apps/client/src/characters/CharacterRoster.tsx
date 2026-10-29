import { GameButton } from '../ui/GameButton';
import { contentText } from '../localization/text';
import { attackTypeLabel } from '../ui/labels';
import { useId, useRef, useState } from 'react';
import { characters, defaultCharacter } from '@open-boards/content';
import { CharacterPortrait } from './CharacterPortrait';
import { profiles } from './profiles';
import { DeckExplorer } from '../cards/DeckExplorer';

/** Shared, read-only exploration; only the waiting room supplies an admission change callback. */
export function CharacterRoster({
  selected = defaultCharacter,
  onChoose,
  featured = false,
}: {
  selected?: string;
  onChoose?: (character: string) => void;
  featured?: boolean;
}) {
  const [inspected, setInspected] = useState(selected);
  const id = useId();
  const [deckOpen, setDeckOpen] = useState(false);
  const detail = useRef<HTMLDivElement>(null);
  const character = characters[inspected];
  const profile = profiles[inspected];
  return (
    <section
      className={`character-roster ${featured ? 'roster-featured' : ''}`}
      aria-label="Personaggi disponibili"
    >
      <div className="roster-heading">
        <h2>Scegli il tuo combattente</h2>
        <span>
          {Object.keys(characters).length}{' '}
          {Object.keys(characters).length === 1 ? 'personaggio' : 'personaggi'}
        </span>
      </div>
      <div className="roster-detail" id={id} ref={detail}>
        <CharacterPortrait
          character={inspected}
          sizes={
            featured
              ? '(max-width: 760px) calc(100vw - 32px), (max-width: 1100px) 55vw, 720px'
              : '(max-width: 600px) 140px, 280px'
          }
          priority
        />
        <div className="roster-description" aria-live="polite" aria-atomic="true">
          <p className="character-role">
            {profile.role} · {attackTypeLabel[character.attackType]}
          </p>
          <h3>{contentText(character.name)}</h3>
          <dl className="character-stats">
            <div>
              <dt>Vita</dt>
              <dd>{character.hp}</dd>
            </div>
            <div>
              <dt>Movimento</dt>
              <dd>{character.movement}</dd>
            </div>
            <div>
              <dt>{character.deckSelection ? 'Carte disponibili' : 'Mazzo'}</dt>
              <dd>{character.deck.reduce((sum, entry) => sum + entry.count, 0)}</dd>
            </div>
          </dl>
        </div>
      </div>
      <div className="roster-list" role="group" aria-label="Esplora i personaggi">
        {Object.values(characters).map((candidate) => (
          <GameButton
            type="button"
            className="roster-portrait"
            key={candidate.id}
            aria-label={`Esamina ${contentText(candidate.name)}`}
            aria-pressed={candidate.id === inspected}
            aria-controls={id}
            onClick={(event) => {
              setInspected(candidate.id);
              if (event.detail) detail.current?.scrollIntoView({ block: 'nearest' });
            }}
          >
            <CharacterPortrait character={candidate.id} sizes="(max-width: 760px) 110px, 160px" />
            <span>{contentText(candidate.name)}</span>
          </GameButton>
        ))}
      </div>
      <details className="roster-more" open={featured ? undefined : true} key={inspected}>
        <summary>Abilità e tattiche</summary>
        <div className="roster-rules">
          <p className="character-range">
            {character.attackType === 'ranged'
              ? 'Portata: caselle adiacenti o zone dello stesso colore.'
              : 'Portata: solo caselle adiacenti.'}
          </p>
          {character.cardEffectProtection && (
            <p>
              <strong>{contentText(character.cardEffectProtection.name)}</strong>{' '}
              {contentText(character.cardEffectProtection.description)}
            </p>
          )}
          {character.deckSelection && (
            <p>
              <strong>{contentText(character.deckSelection.name)}</strong> ·{' '}
              {contentText(character.deckSelection.description)}
            </p>
          )}
          {character.heroSelection && (
            <p>
              <strong>{contentText(character.heroSelection.name)}</strong> ·{' '}
              {contentText(character.heroSelection.description)}
            </p>
          )}
          {character.conditionalModifiers?.map((rule) => (
            <p key={rule.name}>
              <strong>{contentText(rule.name)}</strong> {contentText(rule.description)}
            </p>
          ))}
          {character.maneuverBonus && (
            <p>
              <strong>{contentText(character.maneuverBonus.name)}</strong>{' '}
              {contentText(character.maneuverBonus.description)}
            </p>
          )}
          {(character.abilities ?? []).length
            ? character.abilities!.map((ability) => (
                <p key={ability.id}>
                  <strong>{contentText(ability.name)}</strong> {contentText(ability.description)}
                </p>
              ))
            : !character.cardEffectProtection &&
              !character.maneuverBonus &&
              !character.conditionalModifiers?.length &&
              !character.deckSelection && <p>Nessuna abilità speciale.</p>}
          {character.ally && (
            <div className="ally-rules">
              <p>
                <strong>
                  {character.ally.count} × {contentText(character.ally.name)}
                </strong>{' '}
                · {character.ally.hp} PV ciascuno · {attackTypeLabel[character.ally.attackType]} ·
                usa il movimento dell’eroe.
              </p>
              {character.ally.abilities?.map((ability) => (
                <p key={ability.id}>
                  <strong>{contentText(ability.name)}</strong> {contentText(ability.description)}
                </p>
              ))}
            </div>
          )}
          <p className="character-tactic">{profile.tactic}</p>
        </div>
      </details>
      <GameButton type="button" className="roster-deck" onClick={() => setDeckOpen(true)}>
        Mazzo di {contentText(character.name)} · {character.deck.length} carte diverse
      </GameButton>
      {deckOpen && <DeckExplorer character={inspected} onClose={() => setDeckOpen(false)} />}
      {onChoose && (
        <div className="roster-confirm">
          <p>Cambiare personaggio annulla il tuo stato di pronto.</p>
          <GameButton type="button" className="primary" onClick={() => onChoose(inspected)}>
            Scegli {contentText(character.name)}
          </GameButton>
        </div>
      )}
    </section>
  );
}
