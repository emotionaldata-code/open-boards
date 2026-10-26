import { basic } from '@open-boards/content';
import { cardEligible, type Fighter, type Card, type Command } from '@open-boards/game';
import type { GameView } from '@open-boards/protocol';
import { CardFace } from './CardFace';
import { InactiveCards } from './InactiveCards';
import { AbilityChoice } from './AbilityChoice';
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
}: Props) {
  const choice = game.choice;
  const boosting = moving && game.maneuver?.boostable;
  function usable(card: Card) {
    const definition = basic.cards[card.definition];
    if (choice) return choice.options.some((o) => o.card?.id === card.id);
    return Boolean(
      discarding ||
      boosting ||
      (myTurn && definition.category !== 'defense' && cardEligible(definition, fighter)) ||
      (defending &&
        ['defense', 'versatile'].includes(definition.category) &&
        cardEligible(definition, fighter)),
    );
  }
  function label(card: Card) {
    const name = basic.cards[card.definition].name;
    if (choice) return choice.options.find((o) => o.card?.id === card.id)!.label;
    if (discarding) return `Discard ${name}`;
    if (boosting) return `Boost movement +${basic.cards[card.definition].boost} · ${name}`;
    if (defending) return `Defend with ${name}`;
    return basic.cards[card.definition].category === 'action'
      ? `Play ${name}`
      : `Prepare attack · ${name}`;
  }
  const playable = game.hand.filter(usable);
  const inactive = game.hand.filter((card) => !usable(card));
  return (
    <section className="hand-panel" aria-label="Your hand">
      <div className="section-heading">
        <h2>
          {choice?.prompt ??
            (eliminated
              ? 'You have been eliminated'
              : ended
                ? 'The battle is over'
                : 'Your hand')}{' '}
          <span className="muted">{game.hand.length} cards</span>
        </h2>
        <div className="button-row">
          {discarding && game.hand.length - 7 > 1 && (
            <button
              className="primary"
              disabled={disabled || selected.length !== game.hand.length - 7}
              onClick={() => onCommand({ type: 'discard', cards: selected })}
            >
              Discard {selected.length} / {game.hand.length - 7}
            </button>
          )}
          {choice && (choice.min !== 1 || choice.max !== 1) && (
            <button
              className="primary"
              disabled={disabled || selected.length < choice.min || selected.length > choice.max}
              onClick={() => onChoose(selected)}
            >
              {choice.min === 0 && !selected.length
                ? 'Pass'
                : `Confirm choice · ${selected.length} / ${choice.max}`}
            </button>
          )}
          {defending && (
            <button disabled={disabled} onClick={() => onCommand({ type: 'defend', card: null })}>
              Take the hit
            </button>
          )}
          {moving && (
            <button disabled={disabled} onClick={() => onCommand({ type: 'finish-maneuver' })}>
              Finish Maneuver
            </button>
          )}
        </div>
        <p className="prompt" role="status">
          {prompt}
        </p>
        {choice?.source?.name && (
          <p className="prompt choice-source">
            <strong>{choice.source.name}</strong>
            {' · '}
            {choice.source.description}
          </p>
        )}
      </div>
      <div className="hand">
        {myTurn && (
          <button
            className="draw-pile"
            aria-label="Maneuver · draw a card"
            disabled={disabled}
            onClick={() => onCommand({ type: 'maneuver' })}
          >
            <span className="pile-back" aria-hidden="true">
              Open Boards
            </span>
            <span>Draw & maneuver</span>
          </button>
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
              ? 'No defense cards for this fighter.'
              : 'No playable cards for this fighter.'}
          </p>
        )}
        {inactive.length > 0 && (
          <InactiveCards key={`${game.revision}:${fighter.id}`} cards={inactive} />
        )}
        {!game.hand.length && !choice && (
          <p className="empty">Your hand is empty. Maneuver to draw a card.</p>
        )}
      </div>
    </section>
  );
}
