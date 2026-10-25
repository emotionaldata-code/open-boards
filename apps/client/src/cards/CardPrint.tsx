import { basic, cardPresentation } from '@open-boards/content';
import { cardSvg } from './art';

export function CardPrint({ definition: id }: { definition: string }) {
  const card = basic.cards[id];
  const visual = cardPresentation[id];
  return (
    <>
      <span className="card-top">
        <span>
          <span className="card-boost">BOOST {card.boost}</span>
          {card.category} · {card.usableBy}
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
      <span className="card-description">{card.description}</span>
    </>
  );
}
