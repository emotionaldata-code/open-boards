import { basic } from '@open-boards/content';
import type { Card, Command, Fighter } from '@open-boards/game';

export function HandActions({
  fighter,
  chosen,
  target,
  selected,
  discardCount,
  myTurn,
  moving,
  boosting,
  defending,
  discarding,
  onCommand,
}: {
  fighter: Fighter;
  chosen: Card | undefined;
  target: string;
  selected: string[];
  discardCount: number;
  myTurn: boolean;
  moving: boolean;
  boosting: boolean;
  defending: boolean;
  discarding: boolean;
  onCommand: (command: Command) => void;
}) {
  const definition = chosen ? basic.cards[chosen.definition] : null;
  if (discarding)
    return (
      <button
        className="primary"
        disabled={selected.length !== discardCount}
        onClick={() => onCommand({ type: 'discard', cards: selected })}
      >
        Discard {selected.length} / {discardCount}
      </button>
    );
  if (defending)
    return (
      <>
        {chosen && (
          <button
            className="primary"
            aria-label={`Defend with ${definition!.name}`}
            onClick={() => onCommand({ type: 'defend', card: chosen.id })}
          >
            Defend
          </button>
        )}
        <button onClick={() => onCommand({ type: 'defend', card: null })}>Take the hit</button>
      </>
    );
  if (boosting && chosen)
    return (
      <>
        <button
          className="primary"
          onClick={() => onCommand({ type: 'boost-maneuver', card: chosen.id })}
        >
          Boost movement +{definition!.boost}
        </button>
        <button aria-label="Finish Maneuver" onClick={() => onCommand({ type: 'finish-maneuver' })}>
          Finish
        </button>
      </>
    );
  if (myTurn && chosen)
    return definition?.category === 'action' ? (
      <button
        className="primary"
        onClick={() => onCommand({ type: 'play-action', fighter: fighter.id, card: chosen.id })}
      >
        Play {definition.name}
      </button>
    ) : (
      <button
        className="primary"
        disabled={!target}
        onClick={() => onCommand({ type: 'attack', fighter: fighter.id, card: chosen.id, target })}
      >
        Commit attack
      </button>
    );
  return (
    <>
      {myTurn && (
        <>
          <button className="primary" onClick={() => onCommand({ type: 'maneuver' })}>
            Maneuver
          </button>
          <button onClick={() => onCommand({ type: 'end-turn' })}>End turn</button>
        </>
      )}
      {moving && (
        <>
          <button
            className="primary"
            onClick={() => onCommand({ type: 'move', fighter: fighter.id, path: [] })}
          >
            Stay here
          </button>
          <button onClick={() => onCommand({ type: 'finish-maneuver' })}>Finish Maneuver</button>
        </>
      )}
    </>
  );
}
