import { GameButton } from '../ui/GameButton';
import { contentText } from '../localization/text';
import { useState } from 'react';
import { basic } from '@open-boards/content';
import { Dialog } from '../ui/Dialog';
import { CardPrint } from './CardPrint';
import { CardDetails } from './CardDetails';

export function DeckExplorer({ character, onClose }: { character: string; onClose: () => void }) {
  const [inspected, setInspected] = useState<string | null>(null);
  const fighter = basic.characters[character];
  return (
    <Dialog
      title={`Mazzo di ${contentText(fighter.name)}`}
      className="deck-dialog"
      onClose={onClose}
    >
      <p className="muted">
        {fighter.deck.reduce((n, c) => n + c.count, 0)} carte · {fighter.deck.length} carte diverse.
      </p>
      <div className="deck-gallery">
        {fighter.deck.map(({ card, count }) => (
          <GameButton
            type="button"
            className="printed-card"
            key={card}
            aria-label={`Dettagli di ${contentText(basic.cards[card].name)}, ${count} copie`}
            onClick={() => setInspected(card)}
          >
            <CardPrint definition={card} />
            <span className="card-copies">{count} copie</span>
          </GameButton>
        ))}
      </div>
      {inspected && <CardDetails definition={inspected} onClose={() => setInspected(null)} />}
    </Dialog>
  );
}
