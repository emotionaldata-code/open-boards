import { cardPresentation } from '@open-boards/content';
import { ArtworkImage } from '../artwork/ArtworkImage';
import { rasterForUrl } from '../artwork/assets';

export function CardArtwork({
  definition,
  inspector = false,
}: {
  definition: string;
  inspector?: boolean;
}) {
  const visual = cardPresentation[definition];
  const asset = rasterForUrl(visual.art.image);
  return (
    <span className="card-art" style={{ background: visual.palette.ground }}>
      <ArtworkImage
        asset={asset}
        sizes={inspector ? '(max-width: 600px) 90vw, 600px' : '(max-width: 600px) 160px, 240px'}
        priority={inspector}
      />
    </span>
  );
}
