import { useState } from 'react';
import type { RasterAsset } from './types';

/** Responsive raster selection; an omitted fallback reveals the layer underneath on failure. */
export function ArtworkImage({
  asset,
  fallback,
  sizes,
  priority = false,
}: {
  asset?: RasterAsset;
  fallback?: string;
  sizes: string;
  priority?: boolean;
}) {
  const [failed, setFailed] = useState<string>();
  const raster = asset && failed !== asset.url ? asset : undefined;
  if (!raster && !fallback) return null;
  return (
    <img
      alt=""
      draggable={false}
      src={raster?.variants[0].url ?? fallback}
      srcSet={raster?.variants.map((variant) => `${variant.url} ${variant.width}w`).join(', ')}
      sizes={raster ? sizes : undefined}
      width={raster?.width}
      height={raster?.height}
      loading={priority ? 'eager' : 'lazy'}
      fetchPriority={priority ? 'high' : 'auto'}
      decoding="async"
      data-raster={raster ? '' : undefined}
      style={
        raster
          ? { objectPosition: `${raster.focal[0] * 100}% ${raster.focal[1] * 100}%` }
          : undefined
      }
      onError={raster ? () => setFailed(raster.url) : undefined}
    />
  );
}
