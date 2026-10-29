import { contentText } from '../localization/text';
import { cardCategoryLabel } from '../ui/labels';
import { basic } from '@open-boards/content';
import { CardArtwork } from './CardArtwork';
import { cardFighter, cardText } from './text';
import { Icon } from '../ui/Icon';

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
        <span className="card-type">
          <Icon name={card.category} />
          <span className="card-kind">{cardCategoryLabel[card.category]}</span>
        </span>
        <span
          className="card-boost"
          aria-label={`BOOST ${card.boost}`}
          title={`BOOST ${card.boost}`}
        >
          <Icon name="boost" /> {card.boost}
        </span>
        {card.category !== 'action' && <strong className="card-value">{card.value}</strong>}
      </span>
      <CardArtwork definition={id} inspector={inspector} />
      <strong className="card-name">{contentText(card.name)}</strong>
      <span className="card-fighter">{cardFighter(id)}</span>
      {text && <span className="card-description">{text}</span>}
    </>
  );
}
