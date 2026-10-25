import { basic } from '@open-boards/content';
import type { Card } from '@open-boards/game';
import { CardPrint } from '../cards/CardPrint';

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
    </div>
  );
}
