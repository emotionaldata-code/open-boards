import { GameButton } from '../ui/GameButton';
import { basic } from '@open-boards/content';
import type { Card } from '@open-boards/game';
import { CardPrint } from '../cards/CardPrint';
import { useLayoutEffect, useRef, useState } from 'react';

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
  const host = useRef<HTMLDivElement>(null);
  const [wide, setWide] = useState(false);
  useLayoutEffect(() => {
    const node = host.current!;
    const dock = node.closest('.hand');
    if (!dock) return;
    // Expand only cards whose actual translated rules overflow a short screen.
    // Short effects retain their portrait shape, and every rule stays on the card.
    const fit = () => {
      if (!matchMedia('(max-height: 450px) and (orientation: landscape)').matches) {
        setWide(false);
        return;
      }
      const description = node.querySelector('.card-description');
      if (
        description &&
        (description.scrollHeight > description.clientHeight ||
          description.getBoundingClientRect().bottom > dock.getBoundingClientRect().bottom + 1)
      )
        setWide(true);
    };
    fit();
    const resize = new ResizeObserver(fit);
    resize.observe(dock);
    return () => resize.disconnect();
  }, [card.definition]);
  return (
    <div
      ref={host}
      className={`hand-card ${selected ? 'selected' : ''} ${wide ? 'wide-rules' : ''}`}
    >
      <GameButton
        className={`game-card ${selected ? 'selected' : ''}`}
        aria-label={label}
        title={label}
        aria-pressed={selected}
        disabled={disabled}
        onClick={onClick}
        data-card={definition.category}
      >
        <CardPrint definition={card.definition} />
      </GameButton>
    </div>
  );
}
