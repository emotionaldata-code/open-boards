import { boostValue } from '../boost';
import { mainFighter } from '../fighters';
import type { Definitions, GameState, Fighter, Player } from '../types';
import { adjacent } from '../movement';
import { inAttackRange, sharesZone } from '../targeting';
import type { Binding, Frame } from './state';
import type { Condition, PlayerRef, Value } from './vocabulary';
import { conditionalModifier, fighterCondition } from './fighter-conditions';

export function reference(
  state: GameState,
  binding: Binding,
  ref: PlayerRef = 'self',
): Fighter | undefined {
  const frame = state.resolution.frames[binding.frame];
  if (!frame) return;
  if (ref === 'ally') {
    const owner = state.fighters.find((f) => f.id === binding.owner);
    const allies = state.fighters.filter((f) => f.player === owner?.player && f.role === 'ally');
    return allies.length === 1 ? allies[0] : undefined;
  }
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
          : ref === 'opponent' || ref === 'opponent-main'
            ? opponent
            : ref === 'source'
              ? frame.kind === 'elimination'
                ? frame.source
                : frame.actor
              : ref in frame
                ? frame[ref as keyof Frame]
                : undefined;
  const fighter = state.fighters.find((p) => p.id === id);
  if (ref === 'opponent-main') return fighter ? mainFighter(state, fighter.player) : undefined;
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
  player: Pick<Fighter, 'character' | 'statuses' | 'player'>,
  defs: Definitions,
  state?: Pick<GameState, 'fighters'> & {
    players?: Pick<Player, 'id' | 'ongoing'>[];
  },
): number {
  const active = state?.players?.find((p) => p.id === player.player)?.ongoing;
  const base =
    active
      ?.map((c) => defs.cards[c.definition].ongoing?.movementValue)
      .find((n) => n !== undefined) ?? defs.characters[player.character].movement;
  return Math.max(
    0,
    base +
      modifier(player, 'movement', defs) +
      (state ? conditionalModifier(state, player, 'movement', defs) : 0),
  );
}
export function value(state: GameState, defs: Definitions, binding: Binding, v: Value): number {
  if (typeof v === 'number') return v;
  if ('fighters' in v) {
    const owner = reference(state, binding);
    const anchor = reference(state, binding, v.anchor);
    return state.fighters.filter(
      (f) =>
        !f.defeated &&
        f.position !== null &&
        (!v.exclude || f.id !== reference(state, binding, v.exclude)?.id) &&
        (v.fighters === 'any' ||
          (v.fighters === 'friendly' ? f.player === owner?.player : f.player !== owner?.player)) &&
        (!v.role || f.role === v.role) &&
        (!v.range ||
          (anchor &&
            (v.range === 'adjacent'
              ? adjacent(defs.map, anchor.position, f.position)
              : sharesZone(defs.map, anchor.position, f.position)))),
    ).length;
  }
  if ('event' in v) {
    const frame = state.resolution.frames[binding.frame];
    return frame && v.event in frame ? Number(frame[v.event as keyof Frame]) : 0;
  }
  if ('card' in v) {
    const frame = state.resolution.frames[binding.frame];
    const card =
      v.card === 'selected'
        ? binding.selectedCard
        : v.card === 'played'
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
    if (card && v.field === 'boost') {
      const fighter =
        v.card === 'selected'
          ? undefined
          : frame?.kind === 'combat'
            ? state.fighters.find(
                (f) => f.id === (card.id === frame.card.id ? frame.attacker : frame.defender),
              )
            : frame?.kind === 'card'
              ? state.fighters.find((f) => f.id === frame.actor)
              : undefined;
      const player = state.players.find(
        (p) => p.id === (v.card === 'selected' ? binding.selectedPlayer : fighter?.player),
      );
      return player ? boostValue(player, card, defs) : defs.cards[card.definition].boost;
    }
    return card
      ? v.field === 'value' && frame?.kind === 'combat' && card.id === frame.card.id && frame.bonus
        ? frame.bonus.value
        : defs.cards[card.definition][v.field]
      : 0;
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
      return movement(p, defs, state);
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
    case 'allies-defeated': {
      const owner = reference(state, binding);
      return !!owner && fighterCondition(state, owner, c);
    }
    case 'card-has-hook': {
      const card =
        frame?.kind === 'combat'
          ? binding.owner === frame.attacker
            ? frame.defenseCard
            : binding.owner === frame.defender
              ? frame.card
              : null
          : null;
      return (
        !!card &&
        !(frame?.kind === 'combat' && frame.bonus && card.id === frame.card.id) &&
        !!defs.cards[card.definition].abilities?.some((a) => a.trigger === c.hook)
      );
    }
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
    case 'fighter-role':
      return reference(state, binding, c.target)?.role === c.role;
    case 'relation': {
      const a = reference(state, binding, c.a),
        b = reference(state, binding, c.b);
      if (!a || !b) return false;
      if (['adjacent', 'zone', 'attack-range'].includes(c.relation) && (a.defeated || b.defeated))
        return false;
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
    case 'prediction-matches':
      return (
        frame?.kind === 'combat' &&
        frame.defender === binding.owner &&
        frame.prediction !== undefined &&
        frame.prediction === value(state, defs, binding, { card: 'attack', field: 'value' })
      );
    case 'defeated':
      return reference(state, binding, c.target)?.defeated ?? false;
    case 'on-token': {
      const fighter = reference(state, binding, c.target);
      const position =
        fighter && (c.atTurnStart ? state.resolution.turnPositions[fighter.id] : fighter.position);
      const tokens = c.atTurnStart ? state.resolution.turnTokens : state.boardTokens;
      return (
        !!fighter &&
        !fighter.defeated &&
        position != null &&
        !!tokens?.some(
          (t) => t.owner === binding.owner && t.kind === c.token && t.position === position,
        )
      );
    }
    case 'maneuvered':
      return (
        state.resolution.maneuvered?.includes(reference(state, binding, c.target)?.player ?? '') ??
        false
      );
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
      return (
        !!card &&
        (frame?.kind === 'combat' && frame.bonus && card.id === frame.card.id
          ? c.category === 'attack'
          : defs.cards[card.definition].category === c.category)
      );
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
