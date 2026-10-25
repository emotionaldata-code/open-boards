import { useState } from 'react';
import { basic } from '@open-boards/content';
import type { Card } from '@open-boards/game';
import { CardPrint } from '../cards/CardPrint';
import { CardDetails } from '../cards/CardDetails';

export function CardFace({
  card,
  selected = false,
  disabled = false,
  onClick,
  label,
}: {
  card: Card;
  selected?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  label?: string;
}) {
  const [inspected, setInspected] = useState(false);
  const definition = basic.cards[card.definition];
  return (
    <div className={`hand-card ${selected ? 'selected' : ''}`}>
      <button
        className={`game-card ${selected ? 'selected' : ''}`}
        aria-label={label}
        aria-pressed={selected}
        disabled={disabled}
        onClick={onClick}
        data-card={definition.category}
      >
        <CardPrint definition={card.definition} />
      </button>
      <button
        type="button"
        className="card-info"
        aria-label={label ? `Inspect ${label}` : `About ${definition.name}`}
        onClick={() => setInspected(true)}
      >
        <span aria-hidden="true">i</span>
      </button>
      {inspected && (
        <CardDetails definition={card.definition} onClose={() => setInspected(false)} />
      )}
    </div>
  );
}
