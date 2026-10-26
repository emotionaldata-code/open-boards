import manifest from './manifest.generated';
import type { RasterManifest } from './types';

export const rasterAssets: RasterManifest = manifest;
const byUrl = new Map(Object.values(rasterAssets).map((asset) => [asset.url, asset]));

export function rasterForUrl(url: string | undefined) {
  return url ? byUrl.get(url) : undefined;
}

export const mapArtwork: Record<string, string> = {
  'king-solomons-mine': 'king-solomons-mine-scenery',
};

export const fighterArtwork: Record<string, { portrait: string; token: string }> = {
  'the-genie': { portrait: 'the-genie-portrait', token: 'the-genie-token' },
  'sherlock-holmes': { portrait: 'sherlock-holmes-portrait', token: 'sherlock-holmes-token' },
  'sherlock-holmes-dr-watson': {
    portrait: 'sherlock-holmes-dr-watson-portrait',
    token: 'sherlock-holmes-dr-watson-token',
  },
  medusa: { portrait: 'medusa-portrait', token: 'medusa-token' },
  'medusa-harpy': { portrait: 'harpy-portrait', token: 'harpy-token' },
  'king-arthur': { portrait: 'king-arthur-portrait', token: 'king-arthur-token' },
  'king-arthur-merlin': {
    portrait: 'king-arthur-merlin-portrait',
    token: 'king-arthur-merlin-token',
  },
};
