import { basic } from '@open-boards/content';
import { CardArtwork } from './CardArtwork';
import { cardFighter, cardText } from './text';

export function CardPrint({
  definition: id,
  inspector = false,
}: {
  definition: string;
  inspector?: boolean;
}) {
  const card = basic.cards[id];
  const text = cardText(id);
  return (
    <>
      <span className="card-top" data-kind={card.category}>
        <span>
          <span className="card-boost">BOOST {card.boost}</span>
          <span className="card-kind">
            {card.category === 'versatile' ? 'Attack / Defense' : card.category}
          </span>{' '}
          · {cardFighter(id)}
        </span>
        {card.category !== 'action' && <strong>{card.value}</strong>}
      </span>
      <CardArtwork definition={id} inspector={inspector} />
      <strong className="card-name">{card.name}</strong>
      {text && <span className="card-description">{text}</span>}
    </>
  );
}
