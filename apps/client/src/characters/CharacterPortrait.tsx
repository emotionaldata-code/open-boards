import type { CSSProperties } from 'react';
import { figureSvg } from './art';
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
      style={
        { '--character-ink': profile.accent, '--character-ground': profile.ground } as CSSProperties
      }
    >
      <ArtworkImage
        asset={rasterAssets[fighterArtwork[character]?.portrait]}
        fallback={`data:image/svg+xml,${encodeURIComponent(figureSvg(character, profile.accent))}`}
        sizes={sizes}
        priority={priority}
      />
    </span>
  );
}
