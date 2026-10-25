import type { CSSProperties } from 'react';
import { figureSvg } from './art';
import { profiles } from './profiles';

export function CharacterPortrait({ character }: { character: string }) {
  const profile = profiles[character] ?? profiles.medusa;
  return (
    <span
      className="character-portrait"
      style={
        { '--character-ink': profile.accent, '--character-ground': profile.ground } as CSSProperties
      }
    >
      <img
        src={`data:image/svg+xml,${encodeURIComponent(figureSvg(character, profile.accent))}`}
        alt=""
        draggable={false}
      />
    </span>
  );
}
