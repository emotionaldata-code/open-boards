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
  return (
    <section className="hand-panel" aria-label="Your hand">
      <div className="section-heading">
        <div>
          <h2>
            {eliminated ? 'You have been eliminated' : ended ? 'The battle is over' : 'Your hand'}{' '}
            <span className="muted">{game.hand.length} cards</span>
          </h2>
          <p className="prompt" role="status">
            {prompt}
          </p>
        </div>
        <div className="button-row">
          {myTurn && (
            <>
              <button className="primary" onClick={() => onCommand({ type: 'maneuver' })}>
                Maneuver
              </button>
              <button onClick={() => onCommand({ type: 'end-turn' })}>End turn</button>
            </>
          )}
          {moving && (
            <button
              className="primary"
              onClick={() => onCommand({ type: 'move', fighter: fighter.id, path: [] })}
            >
              Stay here
            </button>
          )}
          {moving && (
            <button onClick={() => onCommand({ type: 'finish-maneuver' })}>Finish Maneuver</button>
          )}
          {defending && (
            <button onClick={() => onCommand({ type: 'defend', card: null })}>Take the hit</button>
          )}
        </div>
      </div>
      <div className="hand">
        {game.hand.map((card) => {
          const definition = basic.cards[card.definition];
          const usable =
            discarding ||
            boosting ||
            (myTurn && definition.category !== 'defense' && cardEligible(definition, fighter)) ||
            (defending &&
              ['defense', 'versatile'].includes(definition.category) &&
              cardEligible(definition, fighter));
          return (
            <CardFace
              key={card.id}
              card={card}
              selected={selected.includes(card.id)}
              disabled={!usable}
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
          );
        })}
        {game.hand.length === 0 && (
          <p className="empty">Your hand is empty. Maneuver to draw a card.</p>
        )}
      </div>
      {(selected.length > 0 || defending || discarding) && (
        <div className="selection-actions">
          {discarding ? (
            <button
              className="primary"
              disabled={selected.length !== game.hand.length - 7}
              onClick={() => onCommand({ type: 'discard', cards: selected })}
            >
              Discard {selected.length} / {game.hand.length - 7}
            </button>
          ) : defending ? (
            <button
              className="primary"
              disabled={!chosen}
              onClick={() => onCommand({ type: 'defend', card: chosen!.id })}
            >
              Defend{chosenDefinition ? ` with ${chosenDefinition.name}` : ''}
            </button>
          ) : boosting && chosen ? (
            <button
              className="primary"
              onClick={() => onCommand({ type: 'boost-maneuver', card: chosen.id })}
            >
              Boost movement +{chosenDefinition!.boost}
            </button>
          ) : chosenDefinition?.category === 'action' ? (
            <button
              className="primary"
              onClick={() =>
                onCommand({ type: 'play-action', fighter: fighter.id, card: chosen!.id })
              }
            >
              Play {chosenDefinition.name}
            </button>
          ) : (
            chosen && (
              <>
                <span className="muted">
                  {targets.length
                    ? target
                      ? `Target: ${
                          fighterDefinition(
                            targets.find((f) => f.id === target)!,
                            basic,
                          ).name
                        }`
                      : 'Choose a highlighted rival on the board.'
                    : 'No rivals in range. Maneuver to get closer.'}
                </span>
                <button
                  className="primary"
                  disabled={!target}
                  onClick={() =>
                    onCommand({ type: 'attack', fighter: fighter.id, card: chosen.id, target })
                  }
                >
                  Commit attack
                </button>
              </>
            )
          )}
        </div>
      )}
    </section>
  );
}
