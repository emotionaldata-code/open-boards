import { requireRule } from '../errors';
import type { Runtime } from './runtime';
import type { CardProvenance, ChoiceOption, Task } from './state';

export function openChoice(
  runtime: Runtime,
  frame: number,
  player: string,
  prompt: string,
  options: (ChoiceOption & { tasks: Task[] })[],
  min = 1,
  max = 1,
  provenance?: CardProvenance,
): void {
  if (!options.length || max === 0) return;
  runtime.data.choice = {
    frame,
    id: `choice-${++runtime.data.next}`,
    player,
    prompt,
    options: options.map(({ id, label, card }) => ({ id, label, ...(card ? { card } : {}) })),
    min,
    max,
    continuations: Object.fromEntries(
      options.map((o) => [
        o.id,
        o.tasks.map((task) => ({ ...task, provenance: task.provenance ?? provenance })),
      ]),
    ),
  };
  runtime.state.phase = { type: 'ability-choice', player };
}
export function choose(runtime: Runtime, actor: string, id: string, options: string[]): void {
  const choice = runtime.data.choice;
  requireRule(
    choice &&
      runtime.state.phase.type === 'ability-choice' &&
      choice.player === actor &&
      choice.id === id,
    'This choice is not yours or has expired.',
  );
  requireRule(
    options.length >= choice.min &&
      options.length <= choice.max &&
      new Set(options).size === options.length &&
      options.every(
        (id) => choice.options.some((o) => o.id === id) && Object.hasOwn(choice.continuations, id),
      ),
    'Choose valid options from the current prompt.',
  );
  runtime.data.choice = null;
  runtime.state.phase = { type: 'taking-actions' };
  runtime.prepend(...options.flatMap((id) => choice.continuations[id]));
}
