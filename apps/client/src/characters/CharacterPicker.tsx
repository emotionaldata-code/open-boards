import { GameButton } from '../ui/GameButton';
import { contentText } from '../localization/text';
import { attackTypeLabel } from '../ui/labels';
import { useState } from 'react';
import { characters } from '@open-boards/content';
import { Dialog } from '../ui/Dialog';
import { CharacterPortrait } from './CharacterPortrait';
import { CharacterRoster } from './CharacterRoster';
import { profiles } from './profiles';

export function CharacterPicker({
  selected,
  onChoose,
}: {
  selected: string;
  onChoose: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const character = characters[selected];
  return (
    <div className="character-picker">
      <CharacterPortrait character={selected} />
      <div className="grow">
        <span className="muted">Il tuo personaggio · {profiles[selected].role}</span>
        <strong>{contentText(character.name)}</strong>
        <span>
          {character.hp} PV · Movimento {character.movement} ·{' '}
          {attackTypeLabel[character.attackType]}
        </span>
      </div>
      <GameButton onClick={() => setOpen(true)}>Scegli personaggio</GameButton>
      {open && (
        <Dialog
          title="Scegli il tuo combattente"
          className="roster-dialog"
          onClose={() => setOpen(false)}
        >
          <CharacterRoster
            selected={selected}
            onChoose={(id) => {
              onChoose(id);
              setOpen(false);
            }}
          />
        </Dialog>
      )}
    </div>
  );
}
