import { ArtworkImage } from '../artwork/ArtworkImage';
import { mapArtwork, rasterAssets } from '../artwork/assets';

/** Decorative layers only. The vector terrain above owns every playable marking. */
export function MapScenery({ id }: { id: string }) {
  return (
    <div className="map-scenery" aria-hidden="true">
      <ArtworkImage asset={rasterAssets[mapArtwork[id]]} sizes="100vw" priority />
    </div>
  );
}
