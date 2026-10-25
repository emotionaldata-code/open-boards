import { basic } from '@open-boards/content';
import {
  cardEligible,
  fighterDefinition,
  type Fighter,
  type Card,
  type Command,
} from '@open-boards/game';
import type { GameView } from '@open-boards/protocol';
import { CardFace } from './CardFace';
import { HandActions } from './HandActions';
import { InactiveCards } from './InactiveCards';
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
  selected: string[];
  setSelected: React.Dispatch<React.SetStateAction<string[]>>;
  target: string;
  targets: Fighter[];
  chosen: Card | undefined;
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
  selected,
  setSelected,
  target,
  targets,
  chosen,
  onCommand,
}: Props) {
  const chosenDefinition = chosen ? basic.cards[chosen.definition] : null;
  const boosting = moving && game.maneuver?.boostable;
  function usable(card: Card) {
    const definition = basic.cards[card.definition];
    return Boolean(
      discarding ||
      boosting ||
      (myTurn && definition.category !== 'defense' && cardEligible(definition, fighter)) ||
      (defending &&
        ['defense', 'versatile'].includes(definition.category) &&
        cardEligible(definition, fighter)),
    );
  }
  const playable = game.hand.filter(usable);
  const inactive = game.hand.filter((card) => !usable(card));
  return (
    <section className="hand-panel" aria-label="Your hand">
      <div className="section-heading">
        <h2>
          {eliminated ? 'You have been eliminated' : ended ? 'The battle is over' : 'Your hand'}{' '}
          <span className="muted">{game.hand.length} cards</span>
        </h2>
        <div className="button-row">
          <HandActions
            fighter={fighter}
            chosen={chosen}
            target={target}
            selected={selected}
            discardCount={game.hand.length - 7}
            myTurn={myTurn}
            moving={moving}
            boosting={Boolean(boosting)}
            defending={defending}
            discarding={discarding}
            onCommand={onCommand}
          />
        </div>
        {(prompt ||
          (chosen && myTurn && ['attack', 'versatile'].includes(chosenDefinition!.category))) && (
          <p className="prompt" role="status">
            {chosen && myTurn && ['attack', 'versatile'].includes(chosenDefinition!.category)
              ? targets.length
                ? target
                  ? `Target: ${
                      fighterDefinition(
                        targets.find((f) => f.id === target)!,
                        basic,
                      ).name
                    }`
                  : 'Choose a highlighted rival.'
                : 'No rivals in range. Maneuver to get closer.'
              : prompt}
          </p>
        )}
      </div>
      <div className="hand">
        {playable.map((card) => (
          <CardFace
            key={card.id}
            card={card}
            selected={selected.includes(card.id)}
            onClick={() =>
              setSelected((old) =>
                discarding
                  ? old.includes(card.id)
                    ? old.filter((id) => id !== card.id)
                    : [...old, card.id]
                  : old.includes(card.id)
                    ? []
                    : [card.id],
              )
            }
          />
        ))}
        {playable.length === 0 && (myTurn || defending) && game.hand.length > 0 && (
          <p className="empty">
            {defending
              ? 'No defense cards for this fighter.'
              : 'No playable cards for this fighter.'}
          </p>
        )}
        {inactive.length > 0 && (
          <InactiveCards key={`${game.revision}:${fighter.id}`} cards={inactive} />
        )}
        {game.hand.length === 0 && (
          <p className="empty">Your hand is empty. Maneuver to draw a card.</p>
        )}
      </div>
    </section>
  );
}
