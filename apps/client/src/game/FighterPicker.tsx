import { contentText } from '../localization/text';
import { basic } from '@open-boards/content';
import { fighterLabel, type Fighter } from '@open-boards/game';
import { CharacterPortrait } from '../characters/CharacterPortrait';

export function FighterPicker({
  fighters,
  selected,
  disabled,
  onSelect,
}: {
  fighters: Fighter[];
  selected: string;
  disabled: boolean;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="fighter-controls" role="group" aria-label="I tuoi combattenti">
      <div className="fighter-picker">
        {fighters.map((fighter) => (
          <button
            key={fighter.id}
            type="button"
            aria-pressed={fighter.id === selected}
            disabled={disabled}
            onClick={() => onSelect(fighter.id)}
          >
            <CharacterPortrait character={fighter.definition} />
            <span>{contentText(fighterLabel(fighter, basic))}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
