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
  purpose = 'player',
}: {
  selected: string;
  onChoose: (id: string) => void;
  purpose?: 'player' | 'bot';
}) {
  const [open, setOpen] = useState(false);
  const character = characters[selected];
  return (
    <div className="character-picker">
      <CharacterPortrait character={selected} />
      <div className="grow">
        <span className="muted">
          {purpose === 'bot' ? 'Personaggio del bot' : 'Il tuo personaggio'} ·{' '}
          {profiles[selected].role}
        </span>
        <strong>{contentText(character.name)}</strong>
        <span>
          {character.hp} PV · Movimento {character.movement} ·{' '}
          {attackTypeLabel[character.attackType]}
        </span>
      </div>
      <GameButton type="button" onClick={() => setOpen(true)}>
        {purpose === 'bot' ? 'Scegli personaggio del bot' : 'Scegli personaggio'}
      </GameButton>
      {open && (
        <Dialog
          title={purpose === 'bot' ? 'Scegli il combattente del bot' : 'Scegli il tuo combattente'}
          className="roster-dialog"
          onClose={() => setOpen(false)}
        >
          <CharacterRoster
            selected={selected}
            choiceHint={purpose === 'bot' ? 'Il bot giocherà con questo combattente.' : undefined}
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
