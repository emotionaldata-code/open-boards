import { basic, cardPresentation } from '@open-boards/content';
import { cardSvg } from './art';
import { cardFighter, cardText } from './text';

export function CardPrint({ definition: id }: { definition: string }) {
  const card = basic.cards[id];
  const visual = cardPresentation[id];
  const text = cardText(id);
  return (
    <>
      <span className="card-top">
        <span>
          <span className="card-boost">BOOST {card.boost}</span>
          <span className="card-kind">{card.category}</span> · {cardFighter(id)}
        </span>
        {card.category !== 'action' && <strong>{card.value}</strong>}
      </span>
      <span className="card-art" style={{ background: visual.palette.ground }}>
        <img
          alt=""
          src={visual.art.image ?? `data:image/svg+xml,${encodeURIComponent(cardSvg(visual))}`}
        />
      </span>
      <strong className="card-name">{card.name}</strong>
      {text && <span className="card-description">{text}</span>}
    </>
  );
}
