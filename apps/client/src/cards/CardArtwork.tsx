import { cardPresentation } from '@open-boards/content';
import { cardSvg } from './art';

export function CardArtwork({ definition }: { definition: string }) {
  const visual = cardPresentation[definition];
  return (
    <span className="card-art" style={{ background: visual.palette.ground }}>
      <img
        alt=""
        src={visual.art.image ?? `data:image/svg+xml,${encodeURIComponent(cardSvg(visual))}`}
      />
    </span>
  );
}
