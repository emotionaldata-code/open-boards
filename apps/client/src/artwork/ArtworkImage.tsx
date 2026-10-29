import { useState } from 'react';
import type { RasterAsset } from './types';

/** The surrounding frame owns layout, including while the image is loading or unavailable. */
export function ArtworkImage({
  asset,
  sizes,
  priority = false,
}: {
  asset?: RasterAsset;
  sizes: string;
  priority?: boolean;
}) {
  const [failed, setFailed] = useState<string>();
  const raster = asset && failed !== asset.url ? asset : undefined;
  if (!raster) return null;
  return (
    <img
      key={raster.url}
      alt=""
      draggable={false}
      src={raster.variants[0].url}
      srcSet={raster.variants.map((variant) => `${variant.url} ${variant.width}w`).join(', ')}
      sizes={sizes}
      width={raster.width}
      height={raster.height}
      loading={priority ? 'eager' : 'lazy'}
      fetchPriority={priority ? 'high' : 'auto'}
      decoding="async"
      data-raster=""
      style={{ objectPosition: `${raster.focal[0] * 100}% ${raster.focal[1] * 100}%` }}
      onError={() => setFailed(raster.url)}
    />
  );
}
