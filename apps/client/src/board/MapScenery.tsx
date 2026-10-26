import { ArtworkImage } from '../artwork/ArtworkImage';
import { mapArtwork, rasterAssets } from '../artwork/assets';
import { arenaSize } from './layout';
import { Scenery } from './Scenery';

/** Decorative layers only. The vector terrain above owns every playable marking. */
export function MapScenery({ id }: { id: string }) {
  return (
    <div className="map-scenery" aria-hidden="true">
      <svg viewBox={`0 0 ${arenaSize.width} ${arenaSize.height}`}>
        <Scenery />
      </svg>
      <ArtworkImage asset={rasterAssets[mapArtwork[id]]} sizes="100vw" priority />
    </div>
  );
}
