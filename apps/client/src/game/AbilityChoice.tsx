import { useState } from 'react';
import type { Command } from '@open-boards/game';
import type { ChoiceView } from '@open-boards/protocol';
import { CardFace } from './CardFace';

export function AbilityChoice({
  choice,
  disabled,
  onCommand,
}: {
  choice: ChoiceView;
  disabled: boolean;
  onCommand: (command: Command) => void;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const single = choice.min === 1 && choice.max === 1;
  function submit(options: string[]) {
    onCommand({ type: 'choose', choice: choice.id, options });
  }
  function select(id: string) {
    if (single) submit([id]);
    else
      setSelected((old) => (old.includes(id) ? old.filter((value) => value !== id) : [...old, id]));
  }
  return (
    <section className="hand-panel" aria-label="Ability choice">
      <div className="section-heading">
        <div>
          <h2>{choice.prompt}</h2>
          <p className="prompt" role="status">
            {single
              ? 'Choose an option to continue.'
              : choice.min === choice.max
                ? `Choose ${choice.min} cards.`
                : `Choose ${choice.min}–${choice.max} cards.`}
          </p>
        </div>
      </div>
      <div className="ability-options">
        {choice.options.map((option) =>
          option.card ? (
            <CardFace
              key={option.id}
              card={option.card}
              label={option.label}
              selected={selected.includes(option.id)}
              disabled={disabled}
              onClick={() => select(option.id)}
            />
          ) : (
            <button
              key={option.id}
              disabled={disabled}
              aria-pressed={selected.includes(option.id)}
              onClick={() => select(option.id)}
            >
              {option.label}
            </button>
          ),
        )}
      </div>
      {!single && (
        <button
          className="primary"
          disabled={disabled || selected.length < choice.min || selected.length > choice.max}
          onClick={() => submit(selected)}
        >
          Confirm choice
        </button>
      )}
    </section>
  );
}
