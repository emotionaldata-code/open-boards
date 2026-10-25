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
        <span className="muted">Your character · {profiles[selected].role}</span>
        <strong>{character.name}</strong>
        <span>
          {character.hp} HP · Move {character.movement} · {character.attackType}
        </span>
      </div>
      <button onClick={() => setOpen(true)}>Choose character</button>
      {open && (
        <Dialog
          title="Choose your fighter"
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
