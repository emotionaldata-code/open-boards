import { contentText } from '../localization/text';
import { choiceLabel } from './choice-label';
import { basic } from '@open-boards/content';
import type { Fighter } from '@open-boards/game';
import type { ChoiceView } from '@open-boards/protocol';
import { CardFace } from './CardFace';
import { CharacterPortrait } from '../characters/CharacterPortrait';

/** Only objects outside the visible hand/map need a representation in the dock. */
export function AbilityChoice({
  choice,
  fighters,
  handIds,
  disabled,
  selected,
  onSelect,
  onSubmit,
}: {
  choice: ChoiceView;
  fighters: Fighter[];
  handIds: string[];
  disabled: boolean;
  selected: string[];
  onSelect: (id: string) => void;
  onSubmit: (ids: string[]) => void;
}) {
  const numeric = choice.options.length > 0 && choice.options.every((o) => o.value !== undefined);
  return (
    <>
      <div className="ability-options">
        {numeric ? (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              onSubmit([selected[0] ?? choice.options[0].id]);
            }}
          >
            <label>
              Valore{' '}
              <select
                aria-label="Valore"
                disabled={disabled}
                value={selected[0] ?? choice.options[0].id}
                onChange={(e) => onSelect(e.target.value)}
              >
                {choice.options.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.value}
                  </option>
                ))}
              </select>
            </label>{' '}
            <button className="primary" disabled={disabled}>
              Conferma valore
            </button>
          </form>
        ) : (
          choice.options.map((option) => {
            if (option.card && handIds.includes(option.card.id)) return null;
            const object = option.object;
            const fighter =
              object?.type === 'fighter' ? fighters.find((f) => f.id === object.id) : undefined;
            if (
              object?.type === 'space' ||
              object?.type === 'token' ||
              // Older saved matches also attach a fighter object to the Use action.
              (fighter && fighter.position !== null && !fighter.defeated && !choice.source?.name)
            )
              return null;
            if (option.card)
              return (
                <CardFace
                  key={option.id}
                  card={option.card}
                  label={choiceLabel(option, fighters)}
                  selected={selected.includes(option.id)}
                  disabled={disabled}
                  onClick={() => onSelect(option.id)}
                />
              );
            return (
              <button
                key={option.id}
                className={
                  option.decline
                    ? 'text-button'
                    : object?.type === 'pile'
                      ? 'choice-pile'
                      : 'choice-tile'
                }
                disabled={disabled}
                aria-pressed={selected.includes(option.id)}
                onClick={() => onSelect(option.id)}
              >
                {fighter && <CharacterPortrait character={fighter.definition} />}
                {object?.type === 'pile' && (
                  <span className="pile-back" aria-hidden="true">
                    {contentText(
                      basic.characters[
                        fighters.find((f) => f.player === object.player)?.character ?? 'medusa'
                      ]?.name,
                    )}
                  </span>
                )}
                <span>{choiceLabel(option, fighters)}</span>
              </button>
            );
          })
        )}
      </div>
    </>
  );
}
