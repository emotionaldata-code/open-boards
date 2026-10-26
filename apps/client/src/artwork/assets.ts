import manifest from './manifest.generated';
import type { RasterManifest } from './types';

export const rasterAssets: RasterManifest = manifest;
const byUrl = new Map(Object.values(rasterAssets).map((asset) => [asset.url, asset]));

export function rasterForUrl(url: string | undefined) {
  return url ? byUrl.get(url) : undefined;
}

export const fighterArtwork: Record<string, { portrait: string; token: string }> = {
  medusa: { portrait: 'medusa-portrait', token: 'medusa-token' },
  'medusa-harpy': { portrait: 'harpy-portrait', token: 'harpy-token' },
};
