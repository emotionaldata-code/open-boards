import { contentText } from '../localization/text';
import { useState, type CSSProperties } from 'react';
import { basic } from '@open-boards/content';
import type { Card } from '@open-boards/game';
import { CardArtwork } from '../cards/CardArtwork';
import { CardPrint } from '../cards/CardPrint';
import { Dialog } from '../ui/Dialog';

export function InactiveCards({ cards }: { cards: Card[] }) {
  const [inspected, setInspected] = useState<Card>();
  return (
    <>
      <div
        className="inactive-hand"
        aria-label="Carte non disponibili ora"
        style={{ '--inactive-rows': Math.min(4, cards.length) } as CSSProperties}
      >
        {cards.map((card) => (
          <button
            key={card.id}
            className="compact-card"
            data-card={basic.cards[card.definition].category}
            aria-label={`Esamina ${contentText(basic.cards[card.definition].name)} · non disponibile ora`}
            onClick={() => setInspected(card)}
          >
            <CardArtwork definition={card.definition} />
            <span>{contentText(basic.cards[card.definition].name)}</span>
          </button>
        ))}
      </div>
      {inspected && (
        <Dialog
          className="card-dialog"
          title={contentText(basic.cards[inspected.definition].name)}
          onClose={() => setInspected(undefined)}
        >
          <div className="printed-card">
            <CardPrint definition={inspected.definition} inspector />
          </div>
        </Dialog>
      )}
    </>
  );
}
