import { GameButton } from '../ui/GameButton';
import { useState } from 'react';
import { characters } from '@open-boards/content';
import { Dialog } from '../ui/Dialog';
import { CharacterRoster } from './CharacterRoster';

export function CharacterExplorer() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <GameButton className="roster-trigger" onClick={() => setOpen(true)}>
        Esplora {Object.keys(characters).length}{' '}
        {Object.keys(characters).length === 1 ? 'personaggio' : 'personaggi'}
      </GameButton>
      {open && (
        <Dialog
          title="Scopri i combattenti"
          className="roster-dialog"
          onClose={() => setOpen(false)}
        >
          <CharacterRoster />
        </Dialog>
      )}
    </>
  );
}
