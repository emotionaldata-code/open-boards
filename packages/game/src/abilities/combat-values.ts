import { fighterById } from '../fighters';
import { reference, value } from './conditions';
import type { Runtime } from './runtime';
import type { Binding, Frame } from './state';
import type { Effect } from './vocabulary';

type Combat = Extract<Frame, { kind: 'combat' }>;
type Field = 'attack' | 'defense';

/** Status replacements follow base values/modifiers. A lock takes precedence over other setters. */
export function applyCombatValues(
  runtime: Runtime,
  frame: Combat,
  fields: readonly Field[] = ['attack', 'defense'],
): void {
  for (const field of fields) {
    if (field === 'defense' && (!frame.defenseCard || frame.defenseCancelled)) continue;
    const fighter = fighterById(
      runtime.state,
      field === 'attack' ? frame.attacker : frame.defender,
    )!;
    for (const status of fighter.statuses) {
      const rule = runtime.defs.statuses?.[status.id]?.combatValue;
      if (!rule || frame.lockedValues?.[field]) continue;
      frame[field] = rule.value;
      if (rule.locked) frame.lockedValues = { ...frame.lockedValues, [field]: true };
    }
  }
}

export function modifyCombatValue(frame: Combat, field: Field, amount: number): void {
  if (!frame.ignoredValues?.includes(field) && !frame.lockedValues?.[field])
    frame[field] = Math.max(0, frame[field] + amount);
}

export function setCombatValue(
  runtime: Runtime,
  binding: Binding,
  effect: Extract<Effect, { type: 'set-combat-value' }>,
): void {
  const frame = runtime.data.frames[binding.frame];
  if (frame?.kind !== 'combat' || frame.hook !== 'before-combat') return;
  const target = reference(runtime.state, binding, effect.target);
  const field =
    target?.id === frame.attacker
      ? 'attack'
      : target?.id === frame.defender && frame.defenseCard && !frame.defenseCancelled
        ? 'defense'
        : null;
  if (!field || frame.ignoredValues?.includes(field) || frame.lockedValues?.[field]) return;
  const next = Math.max(
    0,
    Math.min(100, value(runtime.state, runtime.defs, binding, effect.value)),
  );
  if (effect.mode === 'printed') {
    const card = field === 'attack' ? frame.card : frame.defenseCard!;
    const previous =
      frame.cardValues?.[card.id] ??
      (field === 'attack' ? frame.bonus?.value : undefined) ??
      runtime.defs.cards[card.definition].value;
    frame[field] = Math.max(0, frame[field] + next - previous);
    (frame.cardValues ??= {})[card.id] = next;
  } else frame[field] = next;
}
