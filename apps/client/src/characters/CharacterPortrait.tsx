import type { CSSProperties } from 'react';
import { figureSvg } from './art';
import { profiles } from './profiles';
import { ArtworkImage } from '../artwork/ArtworkImage';
import { fighterArtwork, rasterAssets } from '../artwork/assets';

export function CharacterPortrait({ character }: { character: string }) {
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
        sizes="(max-width: 600px) 128px, 256px"
      />
    </span>
  );
}
