import { fighterById, mainFighter } from '../fighters';
import { offerDiscardProtection } from './ongoing';
import { openChoice } from './choices';
import { reference } from './conditions';
import type { Runtime } from './runtime';
import type { Binding, Task } from './state';
import type { Effect } from './vocabulary';

/** Offer the full validated domain, independent of any private hand or commitment. */
function values(tasks: (value: number) => Task[]) {
  return Array.from({ length: 101 }, (_, value) => ({
    id: `value-${value}`,
    label: String(value),
    value,
    tasks: tasks(value),
  }));
}
export function predictValue(runtime: Runtime, binding: Binding): void {
  const frame = runtime.data.frames[binding.frame];
  if (frame.kind !== 'combat' || frame.defender !== binding.owner || frame.revealed) return;
  openChoice(
    runtime,
    binding.frame,
    fighterById(runtime.state, binding.owner)!.player,
    'Predict the printed attack value',
    values((value) => [{ ...binding, type: 'predict-value', value }]),
    1,
    1,
    binding.provenance,
    { fighter: binding.owner },
  );
}
export function commitPrediction(
  runtime: Runtime,
  task: Extract<Task, { type: 'predict-value' }>,
): void {
  const frame = runtime.data.frames[task.frame];
  if (frame.kind !== 'combat' || frame.revealed || frame.defender !== task.owner) return;
  frame.prediction = task.value;
  runtime.emit({
    type: 'ability',
    fighter: task.owner,
    name: `Predicted attack value: ${task.value}`,
  });
}
export function inspectHand(
  runtime: Runtime,
  binding: Binding,
  effect: Extract<Effect, { type: 'inspect-hand' }>,
): void {
  const target = reference(runtime.state, binding, effect.target);
  if (!target) return;
  const player = runtime.state.players.find((p) => p.id === target.player)!;
  const viewer = fighterById(runtime.state, binding.owner)!.player;
  if (effect.public)
    runtime.emit({ type: 'hand-revealed', player: player.id, cards: structuredClone(player.hand) });
  openChoice(
    runtime,
    binding.frame,
    viewer,
    `${effect.public ? 'Revealed' : 'Look at'} ${player.name}’s hand`,
    player.hand.map((card) => ({
      id: card.id,
      card: { ...card },
      label: runtime.defs.cards[card.definition].name,
      tasks: [],
    })),
    1,
    1,
    binding.provenance,
    { fighter: binding.owner },
  );
  if (effect.public && runtime.data.choice) runtime.data.choice.public = true;
}
export function nameValue(
  runtime: Runtime,
  binding: Binding,
  effect: Extract<Effect, { type: 'named-value-discard' }>,
): void {
  const target = reference(runtime.state, binding, effect.target);
  if (!target) return;
  openChoice(
    runtime,
    binding.frame,
    fighterById(runtime.state, binding.owner)!.player,
    'Name an attack or defense value',
    values((value) => [{ ...binding, type: 'named-value-discard', target: target.id, value }]),
    1,
    1,
    binding.provenance,
    { fighter: binding.owner },
  );
}
export function discardNamedValue(
  runtime: Runtime,
  task: Extract<Task, { type: 'named-value-discard' }>,
): void {
  const target = fighterById(runtime.state, task.target);
  if (!target) return;
  const player = runtime.state.players.find((p) => p.id === target.player)!;
  if (player.eliminated) return;
  const matches = player.hand.filter((card) => {
    const def = runtime.defs.cards[card.definition];
    return def.category !== 'action' && def.value === task.value;
  });
  runtime.emit({ type: 'ability', fighter: task.owner, name: `Named card value: ${task.value}` });
  if (!matches.length) {
    // Only this required reveal is public. Ordinary inspection and the discard choice stay private.
    inspectHand(
      runtime,
      { ...task, chosen: target.id },
      { type: 'inspect-hand', target: 'chosen', public: true },
    );
    return;
  }
  if (offerDiscardProtection(runtime, task, player.id)) return;
  openChoice(
    runtime,
    task.frame,
    player.id,
    `Discard a card with printed value ${task.value}`,
    matches.map((card) => ({
      id: card.id,
      card: { ...card },
      label: runtime.defs.cards[card.definition].name,
      tasks: [
        { type: 'discard-card', player: player.id, card: card.id },
        {
          type: 'operation',
          operation: {
            kind: 'damage',
            actor: task.owner,
            target: mainFighter(runtime.state, player.id).id,
            amount: runtime.defs.cards[card.definition].boost,
            reason: 'ability',
          },
        },
      ],
    })),
    1,
    1,
    task.provenance,
    { fighter: task.owner },
  );
}
