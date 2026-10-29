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
  'darth-vader': { portrait: 'darth-vader-portrait', token: 'darth-vader-token' },
  'geralt-of-rivia': { portrait: 'geralt-of-rivia-portrait', token: 'geralt-of-rivia-token' },
  'geralt-of-rivia-dandelion': {
    portrait: 'geralt-of-rivia-dandelion-portrait',
    token: 'geralt-of-rivia-dandelion-token',
  },
  'invisible-man': { portrait: 'invisible-man-portrait', token: 'invisible-man-token' },
  eredin: { portrait: 'eredin-portrait', token: 'eredin-token' },
  'eredin-red-rider': { portrait: 'eredin-red-rider-portrait', token: 'eredin-red-rider-token' },
  philippa: { portrait: 'philippa-portrait', token: 'philippa-token' },
  'philippa-dijkstra': { portrait: 'philippa-dijkstra-portrait', token: 'philippa-dijkstra-token' },
  'yennefer-triss': { portrait: 'yennefer-portrait', token: 'yennefer-token' },
  'yennefer-triss-triss': { portrait: 'triss-portrait', token: 'triss-token' },
  'bruce-lee': { portrait: 'bruce-lee-portrait', token: 'bruce-lee-token' },
  alice: { portrait: 'alice-portrait', token: 'alice-token' },
  'alice-jabberwock': { portrait: 'alice-jabberwock-portrait', token: 'alice-jabberwock-token' },
  achilles: { portrait: 'achilles-portrait', token: 'achilles-token' },
  'achilles-patroclus': {
    portrait: 'achilles-patroclus-portrait',
    token: 'achilles-patroclus-token',
  },
  dracula: { portrait: 'dracula-portrait', token: 'dracula-token' },
  'dracula-sister': { portrait: 'dracula-sister-portrait', token: 'dracula-sister-token' },
  bigfoot: { portrait: 'bigfoot-portrait', token: 'bigfoot-token' },
  'bigfoot-jackalope': { portrait: 'bigfoot-jackalope-portrait', token: 'bigfoot-jackalope-token' },
  'the-genie': { portrait: 'the-genie-portrait', token: 'the-genie-token' },
  'sherlock-holmes': { portrait: 'sherlock-holmes-portrait', token: 'sherlock-holmes-token' },
  'sherlock-holmes-dr-watson': {
    portrait: 'sherlock-holmes-dr-watson-portrait',
    token: 'sherlock-holmes-dr-watson-token',
  },
  'robin-hood': { portrait: 'robin-hood-portrait', token: 'robin-hood-token' },
  'robin-hood-outlaw': {
    portrait: 'robin-hood-outlaw-portrait',
    token: 'robin-hood-outlaw-token',
  },
  medusa: { portrait: 'medusa-portrait', token: 'medusa-token' },
  'medusa-harpy': { portrait: 'harpy-portrait', token: 'harpy-token' },
  'king-arthur': { portrait: 'king-arthur-portrait', token: 'king-arthur-token' },
  'king-arthur-merlin': {
    portrait: 'king-arthur-merlin-portrait',
    token: 'king-arthur-merlin-token',
  },
};
