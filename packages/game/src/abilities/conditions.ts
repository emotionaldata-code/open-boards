import { mainFighter } from '../fighters';
import type { Definitions, GameState, Fighter } from '../types';
import { adjacent } from '../movement';
import { inAttackRange, sharesZone } from '../targeting';
import type { Binding, Frame } from './state';
import type { Condition, PlayerRef, Value } from './vocabulary';

export function reference(
  state: GameState,
  binding: Binding,
  ref: PlayerRef = 'self',
): Fighter | undefined {
  const frame = state.resolution.frames[binding.frame];
  if (!frame) return;
  const opponent =
    frame.kind === 'combat'
      ? frame.attacker === binding.owner
        ? frame.defender
        : frame.defender === binding.owner
          ? frame.attacker
          : undefined
      : 'target' in frame && frame.actor !== frame.target
        ? frame.actor === binding.owner
          ? frame.target
          : frame.target === binding.owner
            ? frame.actor
            : undefined
        : undefined;
  const id =
    ref === 'main'
      ? mainFighter(state, state.fighters.find((f) => f.id === binding.owner)!.player).id
      : ref === 'self'
        ? binding.owner
        : ref === 'chosen'
          ? binding.chosen
          : ref === 'opponent'
            ? opponent
            : ref === 'source'
              ? frame.kind === 'elimination'
                ? frame.source
                : frame.actor
              : ref in frame
                ? frame[ref as keyof Frame]
                : undefined;
  const fighter = state.fighters.find((p) => p.id === id);
  return fighter &&
    frame.kind === 'card' &&
    frame.hook === 'card-discarded' &&
    (ref === 'actor' || ref === 'source')
    ? mainFighter(state, fighter.player)
    : fighter;
}
export function modifier(
  player: Pick<Fighter, 'statuses'>,
  field: 'attack' | 'defense' | 'movement',
  defs: Definitions,
): number {
  return player.statuses.reduce(
    (sum, status) => sum + (defs.statuses?.[status.id]?.modifiers?.[field] ?? 0) * status.stacks,
    0,
  );
}
export function movement(
  player: Pick<Fighter, 'character' | 'statuses'>,
  defs: Definitions,
): number {
  return Math.max(
    0,
    defs.characters[player.character].movement + modifier(player, 'movement', defs),
  );
}
export function value(state: GameState, defs: Definitions, binding: Binding, v: Value): number {
  if (typeof v === 'number') return v;
  if ('event' in v) {
    const frame = state.resolution.frames[binding.frame];
    return frame && v.event in frame ? Number(frame[v.event as keyof Frame]) : 0;
  }
  if ('card' in v) {
    const frame = state.resolution.frames[binding.frame];
    const card =
      v.card === 'played'
        ? frame?.kind === 'card'
          ? frame.card
          : null
        : frame?.kind === 'combat'
          ? v.card === 'attack'
            ? frame.card
            : v.card === 'defense'
              ? frame.defenseCard
              : frame.attacker === binding.owner
                ? frame.defenseCard
                : frame.defender === binding.owner
                  ? frame.card
                  : null
          : null;
    return card ? defs.cards[card.definition][v.field] : 0;
  }
  if (v.stat === 'actions') return state.actions;
  const p = reference(state, binding, v.of);
  if (!p) return 0;
  switch (v.stat) {
    case 'hp':
      return p.hp;
    case 'hand':
      return state.players.find((owner) => owner.id === p.player)!.hand.length;
    case 'deck':
      return state.players.find((owner) => owner.id === p.player)!.deck.length;
    case 'counter':
      return p.counters[v.name] ?? 0;
    case 'movement':
      return movement(p, defs);
  }
}
export function condition(
  state: GameState,
  defs: Definitions,
  binding: Binding,
  c: Condition,
): boolean {
  const frame = state.resolution.frames[binding.frame];
  switch (c.type) {
    case 'all':
      return c.conditions.every((child) => condition(state, defs, binding, child));
    case 'any':
      return c.conditions.some((child) => condition(state, defs, binding, child));
    case 'not':
      return !condition(state, defs, binding, c.condition);
    case 'compare': {
      const a = value(state, defs, binding, c.left),
        b = value(state, defs, binding, c.right);
      return { eq: a === b, ne: a !== b, lt: a < b, lte: a <= b, gt: a > b, gte: a >= b }[c.op];
    }
    case 'role':
      return reference(state, binding, c.role)?.id === binding.owner;
    case 'relation': {
      const a = reference(state, binding, c.a),
        b = reference(state, binding, c.b);
      if (!a || !b) return false;
      return c.relation === 'friendly'
        ? a.player === b.player
        : c.relation === 'enemy'
          ? a.player !== b.player
          : c.relation === 'same'
            ? a.id === b.id
            : c.relation === 'adjacent'
              ? adjacent(defs.map, a.position, b.position)
              : c.relation === 'zone'
                ? sharesZone(defs.map, a.position, b.position)
                : inAttackRange(a, b, defs);
    }
    case 'changed-position': {
      const fighter = reference(state, binding, c.target);
      const start = fighter && state.resolution.turnPositions[fighter.id];
      return !!fighter && start != null && fighter.position !== null && fighter.position !== start;
    }
    case 'has-status':
      return reference(state, binding, c.player)?.statuses.some((s) => s.id === c.status) ?? false;
    case 'card-category': {
      const card =
        c.card === 'played'
          ? frame?.kind === 'card'
            ? frame.card
            : null
          : frame?.kind === 'combat'
            ? c.card === 'defense'
              ? frame.defenseCard
              : frame.card
            : null;
      return !!card && defs.cards[card.definition].category === c.category;
    }
    case 'combat-result': {
      if (frame?.kind !== 'combat') return false;
      const attacker = frame.attacker === binding.owner,
        defender = frame.defender === binding.owner;
      if (!attacker && !defender) return false;
      if (c.result === 'blocked') return frame.amount === 0;
      const won = attacker ? frame.amount > 0 : frame.amount === 0;
      return c.result === 'won' ? won : !won;
    }
  }
}
