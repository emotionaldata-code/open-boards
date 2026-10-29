import { contentText } from '../localization/text';
import { basic } from '@open-boards/content';
import { ArtworkImage } from '../artwork/ArtworkImage';
import { mapArtwork, rasterAssets } from '../artwork/assets';
import { arenaSize } from '../board/layout';
import { Scenery } from '../board/Scenery';

/** The same registered scenery as the board, with its vector fallback underneath. */
export function MapPreview() {
  return (
    <figure className="map-preview">
      <div className="map-preview-art" aria-hidden="true">
        <svg
          viewBox={`0 0 ${arenaSize.width} ${arenaSize.height}`}
          preserveAspectRatio="xMidYMid slice"
        >
          <Scenery />
        </svg>
        <ArtworkImage
          asset={rasterAssets[mapArtwork[basic.map.id]]}
          sizes="(max-width: 760px) 100vw, 1200px"
          priority
        />
      </div>
      <figcaption>
        <strong>{contentText(basic.map.name)}</strong>
        <span>29 caselle · 7 zone · Passaggi segreti</span>
      </figcaption>
    </figure>
  );
}
