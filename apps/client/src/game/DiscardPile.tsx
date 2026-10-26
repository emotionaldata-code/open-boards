import { useState } from 'react';
import { basic } from '@open-boards/content';
import type { GameView } from '@open-boards/protocol';
import { CardDetails } from '../cards/CardDetails';
import { Dialog } from '../ui/Dialog';
import { Icon } from '../ui/Icon';

export function DiscardPile({
  player,
  onClose,
}: {
  player: GameView['players'][number];
  onClose: () => void;
}) {
  const [inspected, setInspected] = useState<string | null>(null);
  return (
    <>
      <Dialog title={`${player.name}’s discards`} onClose={onClose}>
        <p className="muted">
          {player.discard.length} {player.discard.length === 1 ? 'card' : 'cards'} · Most recent
          first
        </p>
        {player.discard.length ? (
          <ol className="discard-list" aria-label="Discarded cards, most recent first">
            {player.discard.toReversed().map((card) => {
              const definition = basic.cards[card.definition];
              return (
                <li key={card.id}>
                  <button onClick={() => setInspected(card.definition)}>
                    <Icon name={definition.category} />
                    <span>
                      {definition.name}
                      <small>{definition.category}</small>
                    </span>
                    <strong>Value {definition.value}</strong>
                  </button>
                </li>
              );
            })}
          </ol>
        ) : (
          <p>No cards discarded yet.</p>
        )}
      </Dialog>
      {inspected && <CardDetails definition={inspected} onClose={() => setInspected(null)} />}
    </>
  );
}
