import type { CSSProperties } from 'react';
import { profiles } from './profiles';
import { ArtworkImage } from '../artwork/ArtworkImage';
import { fighterArtwork, rasterAssets } from '../artwork/assets';

export function CharacterPortrait({
  character,
  sizes = '(max-width: 600px) 80px, 160px',
  priority = false,
}: {
  character: string;
  sizes?: string;
  priority?: boolean;
}) {
  const profile = profiles[character] ?? profiles.medusa;
  return (
    <span
      className="character-portrait"
      style={{ '--character-ground': profile.ground } as CSSProperties}
    >
      <ArtworkImage
        asset={rasterAssets[fighterArtwork[character]?.portrait]}
        sizes={sizes}
        priority={priority}
      />
    </span>
  );
}
