import { basic } from '@open-boards/content';
import { fighterLabel, type Fighter } from '@open-boards/game';
import { CharacterPortrait } from '../characters/CharacterPortrait';

export function FighterPicker({
  fighters,
  selected,
  disabled,
  label,
  hint,
  onSelect,
}: {
  fighters: Fighter[];
  selected: string;
  disabled: boolean;
  label: string;
  hint?: string;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="fighter-controls" role="group" aria-label="Your fighters">
      <span className="fighter-picker-label">{label}</span>
      <div className="fighter-picker">
        {fighters.map((fighter) => (
          <button
            key={fighter.id}
            type="button"
            aria-pressed={fighter.id === selected}
            disabled={disabled}
            onClick={() => onSelect(fighter.id)}
          >
            <CharacterPortrait
              character={fighter.role === 'ally' ? fighter.definition : fighter.character}
            />
            <span>{fighterLabel(fighter, basic)}</span>
          </button>
        ))}
      </div>
      {hint && <span className="fighter-picker-hint">{hint}</span>}
    </div>
  );
}
