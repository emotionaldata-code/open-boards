import { GameButton } from '../ui/GameButton';
import { contentText } from '../localization/text';
import { messageText } from '../ui/messages';
import { choiceLabel } from './choice-label';
import { boostValue } from '@open-boards/game';
import { basic } from '@open-boards/content';
import {
  canPlayAttack,
  canPlayDefense,
  cardEligible,
  type Fighter,
  type Card,
  type Command,
} from '@open-boards/game';
import { useState } from 'react';
import { CardDetails } from '../cards/CardDetails';
import type { GameView } from '@open-boards/protocol';
import { CardFace } from './CardFace';
import { InactiveCards } from './InactiveCards';
import { AbilityChoice } from './AbilityChoice';
import { Icon } from '../ui/Icon';
import { GameFrame } from '../ui/GameFrame';
interface Props {
  game: GameView;
  fighter: Fighter;
  eliminated: boolean;
  ended: boolean;
  prompt: string;
  myTurn: boolean;
  moving: boolean;
  defending: boolean;
  discarding: boolean;
  disabled: boolean;
  selected: string[];
  onSelect: (id: string) => void;
  onChoose: (ids: string[]) => void;
  onCommand: (command: Command) => void;
  faceUpAttack?: { active: boolean; toggle: () => void };
}
export function Hand({
  game,
  fighter,
  eliminated,
  ended,
  prompt,
  myTurn,
  moving,
  defending,
  discarding,
  disabled,
  selected,
  onSelect,
  onChoose,
  onCommand,
  faceUpAttack,
}: Props) {
  const [inspected, setInspected] = useState<string | null>(null);
  const choice = game.choice;
  const committedAttack =
    game.phase.type === 'awaiting-defense' ? game.phase.committedCard : undefined;
  const boosting = moving && game.maneuver?.boostable;
  function usable(card: Card) {
    const definition = basic.cards[card.definition];
    if (choice) return choice.options.some((o) => o.card?.id === card.id);
    return Boolean(
      discarding ||
      boosting ||
      (myTurn &&
        (definition.category === 'action'
          ? cardEligible(definition, fighter)
          : canPlayAttack(game, fighter, definition))) ||
      (defending && canPlayDefense(game, fighter, definition, basic)),
    );
  }
  function label(card: Card) {
    const name = contentText(basic.cards[card.definition].name);
    if (choice)
      return choiceLabel(
        choice.options.find((o) => o.card?.id === card.id)!,
        game.fighters,
      );
    if (discarding) return `Scarta ${name}`;
    if (boosting)
      return `Potenzia movimento +${boostValue(
        game.players.find((p) => p.id === fighter.player)!,
        card,
        basic,
      )} · ${name}`;
    if (defending) return `Difendi con ${name}`;
    return basic.cards[card.definition].category === 'action'
      ? `Gioca ${name}`
      : `Prepara attacco · ${name}`;
  }
  const playable = game.hand.filter(usable);
  const inactive = game.hand.filter((card) => !usable(card));
  return (
    <>
      <section className="hand-panel" aria-label="La tua mano">
        <GameFrame />
        <div className="section-heading">
          <h2>
            {(choice ? messageText(choice.prompt) : undefined) ??
              (eliminated
                ? 'Sei stato eliminato'
                : ended
                  ? 'La battaglia è finita'
                  : 'La tua mano')}{' '}
            <span className="muted">{game.hand.length} carte</span>
          </h2>
          <div className="button-row">
            {faceUpAttack && myTurn && (
              <GameButton
                aria-pressed={faceUpAttack.active}
                disabled={disabled}
                onClick={faceUpAttack.toggle}
              >
                Gioca scoperta · colpisci qualsiasi casella
              </GameButton>
            )}
            {defending && committedAttack && (
              <GameButton onClick={() => setInspected(committedAttack.definition)}>
                Esamina attacco scoperto ·{' '}
                {contentText(basic.cards[committedAttack.definition].name)}
              </GameButton>
            )}
            {choice &&
              game.observation?.cards.map((card) => (
                <GameButton key={card.id} onClick={() => setInspected(card.definition)}>
                  Esamina carta rivelata · {contentText(basic.cards[card.definition].name)}
                </GameButton>
              ))}
            {discarding && game.hand.length - 7 > 1 && (
              <GameButton
                className="primary"
                disabled={disabled || selected.length !== game.hand.length - 7}
                onClick={() => onCommand({ type: 'discard', cards: selected })}
              >
                Scarta {selected.length} / {game.hand.length - 7}
              </GameButton>
            )}
            {choice && (choice.min !== 1 || choice.max !== 1) && (
              <GameButton
                className="primary"
                disabled={disabled || selected.length < choice.min || selected.length > choice.max}
                onClick={() => onChoose(selected)}
              >
                {choice.min === 0 && !selected.length
                  ? 'Passa'
                  : `Conferma scelta · ${selected.length} / ${choice.max}`}
              </GameButton>
            )}
            {defending && (
              <GameButton
                disabled={disabled}
                onClick={() => onCommand({ type: 'defend', card: null })}
              >
                <Icon name="attack" /> Subisci il colpo
              </GameButton>
            )}
            {moving && (
              <GameButton
                disabled={disabled}
                onClick={() => onCommand({ type: 'finish-maneuver' })}
              >
                <Icon name="move" /> Termina manovra
              </GameButton>
            )}
          </div>
          <p className="prompt" role="status">
            {prompt}
          </p>
          {choice?.source?.name && (
            <p className="prompt choice-source">
              <strong>{contentText(choice.source.name)}</strong>
              {' · '}
              {contentText(choice.source.description)}
            </p>
          )}
        </div>
        <div className="hand">
          {myTurn && (
            <GameButton
              className="draw-pile"
              aria-label="Manovra · pesca una carta"
              disabled={disabled}
              onClick={() => onCommand({ type: 'maneuver' })}
            >
              <span className="pile-back" aria-hidden="true">
                Open Boards
              </span>
              <span>
                <Icon name="cards" /> Pesca e manovra
              </span>
            </GameButton>
          )}
          {playable.map((card) => (
            <CardFace
              key={card.id}
              card={card}
              label={label(card)}
              selected={selected.includes(
                choice?.options.find((o) => o.card?.id === card.id)?.id ?? card.id,
              )}
              disabled={disabled}
              onClick={() =>
                onSelect(choice?.options.find((o) => o.card?.id === card.id)?.id ?? card.id)
              }
            />
          ))}
          {choice && (
            <AbilityChoice
              choice={choice}
              fighters={game.fighters}
              handIds={game.hand.map((c) => c.id)}
              disabled={disabled}
              selected={selected}
              onSelect={onSelect}
              onSubmit={onChoose}
            />
          )}
          {!playable.length && (myTurn || defending) && game.hand.length > 0 && (
            <p className="empty">
              {defending
                ? 'Nessuna carta difesa per questo combattente.'
                : 'Nessuna carta giocabile per questo combattente.'}
            </p>
          )}
          {inactive.length > 0 && (
            <InactiveCards key={`${game.revision}:${fighter.id}`} cards={inactive} />
          )}
          {!game.hand.length && !choice && (
            <p className="empty">La tua mano è vuota. Manovra per pescare una carta.</p>
          )}
        </div>
      </section>
      {inspected && <CardDetails definition={inspected} onClose={() => setInspected(null)} />}
    </>
  );
}
