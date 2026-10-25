import { useState } from 'react';
import { basic } from '@open-boards/content';
import { Dialog } from '../ui/Dialog';
import { CardPrint } from './CardPrint';
import { CardDetails } from './CardDetails';

export function DeckExplorer({ character, onClose }: { character: string; onClose: () => void }) {
  const [inspected, setInspected] = useState<string | null>(null);
  const fighter = basic.characters[character];
  return (
    <Dialog title={`${fighter.name}’s deck`} className="deck-dialog" onClose={onClose}>
      <p className="muted">
        {fighter.deck.reduce((n, c) => n + c.count, 0)} cards · {fighter.deck.length} designs.
      </p>
      <div className="deck-gallery">
        {fighter.deck.map(({ card, count }) => (
          <button
            type="button"
            className="printed-card"
            key={card}
            aria-label={`About ${basic.cards[card].name}, ${count} copies`}
            onClick={() => setInspected(card)}
          >
            <CardPrint definition={card} />
            <span className="card-copies">{count} copies</span>
          </button>
        ))}
      </div>
      {inspected && <CardDetails definition={inspected} onClose={() => setInspected(null)} />}
    </Dialog>
  );
}
