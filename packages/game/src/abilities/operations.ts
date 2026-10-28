import { fighterById, fighterDefinition, ownedFighters } from '../fighters';
import { validPath } from '../movement';
import type { Runtime } from './runtime';
import { cancelCombat, publishCombat } from './combat';
import { canPlace, validForcedPath } from './positions';

export function eliminate(runtime: Runtime, id: string, source: string): void {
  const fighter = fighterById(runtime.state, id)!;
  const owner = runtime.state.players.find((p) => p.id === fighter.player)!;
  if (fighter.defeated) return;
  fighter.hp = 0;
  fighter.defeated = true;
  runtime.emit({ type: 'defeated', fighter: id });
  if (fighter.role === 'main') {
    owner.eliminated = true;
    runtime.state.boardTokens = runtime.state.boardTokens?.filter(
      (t) => fighterById(runtime.state, t.owner)?.player !== owner.id,
    );
    for (const ally of runtime.state.fighters.filter(
      (f) => f.player === owner.id && f.role === 'ally' && !f.defeated,
    )) {
      ally.defeated = true;
      ally.hp = 0;
      runtime.emit({ type: 'defeated', fighter: ally.id });
    }
    runtime.emit({ type: 'eliminated', player: owner.id });
  }
  const combat = runtime.data.combat === null ? null : runtime.data.frames[runtime.data.combat];
  if (
    combat?.kind === 'combat' &&
    [combat.attacker, combat.defender].includes(id) &&
    !combat.revealed
  )
    cancelCombat(runtime);
  runtime.event('eliminated', { kind: 'elimination', actor: id, target: id, source });
}
export function applyOperation(runtime: Runtime, frameId: number): void {
  const frame = runtime.data.frames[frameId];
  const { state, emit } = runtime;
  const fighter = state.fighters.find(
    (p) => p.id === ('target' in frame ? frame.target : frame.actor),
  );
  if (!fighter || fighter.defeated) {
    if ('amount' in frame) frame.amount = 0;
    if (frame.kind === 'move') {
      frame.path = [];
      frame.distance = 0;
    }
    return;
  }
  const owner = state.players.find((p) => p.id === fighter.player)!;
  switch (frame.kind) {
    case 'draw': {
      if (runtime.data.dormant?.includes(owner.id)) {
        frame.amount = 0;
        break;
      }
      frame.amount = frame.cancelled ? 0 : Math.max(0, Math.min(100, frame.amount));
      const cards = owner.deck.splice(0, frame.amount);
      owner.hand.push(...cards);
      if (cards.length) emit({ type: 'draw', player: owner.id, cards }, owner.id);
      const missing = frame.amount - cards.length;
      frame.amount = cards.length;
      // Operations prepend their tasks; reverse to resolve in fighter order.
      if (missing)
        for (const fighter of ownedFighters(state, owner.id).reverse())
          runtime.operation({
            kind: 'damage',
            actor: fighter.id,
            target: fighter.id,
            amount: missing * 2,
            reason: 'exhaustion',
          });
      break;
    }
    case 'damage': {
      const combat =
        runtime.data.combat === null ? undefined : runtime.data.frames[runtime.data.combat];
      const protectedFighter =
        combat?.kind === 'combat' && combat.protectedFighters?.includes(fighter.id);
      const ongoingProtection =
        frame.reason === 'ability' &&
        fighter.role === 'main' &&
        owner.ongoing?.some(
          (c) => runtime.defs.cards[c.definition].ongoing?.preventMainAbilityDamage,
        );
      frame.amount =
        frame.cancelled || protectedFighter || ongoingProtection || fighter.position === null
          ? 0
          : Math.max(0, Math.min(1000, frame.amount));
      const area = frame.area === undefined ? undefined : runtime.data.frames[frame.area];
      if (area?.kind === 'area') area.amount += frame.amount;
      if (frame.combat !== undefined) {
        const combat = runtime.data.frames[frame.combat];
        if (combat?.kind === 'combat') {
          combat.amount = frame.amount;
          publishCombat(runtime, combat);
        }
      }
      fighter.hp = Math.max(0, fighter.hp - frame.amount);
      emit({ type: 'damage', fighter: fighter.id, amount: frame.amount, reason: frame.reason });
      frame.defeated = fighter.hp === 0 && frame.amount > 0;
      if (fighter.hp === 0) {
        const area = frame.area === undefined ? undefined : runtime.data.frames[frame.area];
        if (area?.kind === 'area') area.defeats++;
        eliminate(runtime, fighter.id, frame.actor);
      }
      break;
    }
    case 'heal':
      frame.amount = frame.cancelled
        ? 0
        : Math.max(
            0,
            Math.min(frame.amount, fighterDefinition(fighter, runtime.defs).hp - fighter.hp),
          );
      fighter.hp += frame.amount;
      emit({ type: 'heal', fighter: fighter.id, amount: frame.amount });
      break;
    case 'move': {
      const valid =
        !frame.cancelled &&
        (frame.mode === 'teleport'
          ? frame.path.length === 1 && canPlace(state, fighter, runtime.defs, frame.path[0], frame)
          : validPath(
              state,
              fighter,
              frame.path,
              runtime.defs.map,
              Math.max(0, frame.distance),
              frame.mode === 'move' && frame.throughEnemies,
            ) &&
            (frame.mode === 'move' ||
              validForcedPath(
                frame.path,
                fighter,
                fighterById(state, frame.actor)!,
                runtime.defs,
                frame.mode,
              )));
      if (!valid) {
        frame.path = [];
        frame.distance = 0;
        break;
      }
      const origin = fighter.position!;
      fighter.position = frame.path.at(-1) ?? origin;
      frame.distance = frame.path.length;
      if (origin === null)
        emit({ type: 'placed', fighter: fighter.id, position: fighter.position! });
      else emit({ type: 'move', fighter: fighter.id, path: [origin, ...frame.path] });
      break;
    }
  }
}
