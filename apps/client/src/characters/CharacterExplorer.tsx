import { useState } from 'react';
import { characters } from '@open-boards/content';
import { Dialog } from '../ui/Dialog';
import { CharacterRoster } from './CharacterRoster';

export function CharacterExplorer() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="roster-trigger" onClick={() => setOpen(true)}>
        Explore {Object.keys(characters).length}{' '}
        {Object.keys(characters).length === 1 ? 'character' : 'characters'}
      </button>
      {open && (
        <Dialog title="Meet the fighters" className="roster-dialog" onClose={() => setOpen(false)}>
          <CharacterRoster />
        </Dialog>
      )}
    </>
  );
}
