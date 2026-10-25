import { fighterById } from '../fighters';
import type { Card, CombatReveal } from '../types';
import { modifier } from './conditions';
import type { Runtime } from './runtime';
import type { Frame, Task } from './state';
import { revealBoost } from '../boost';
import { publicBoosts } from './attack-boost';
import { applyCombatValues } from './combat-values';

export function publishCombat(runtime: Runtime, frame: Extract<Frame, { kind: 'combat' }>): void {
  const combat: CombatReveal = {
    attacker: frame.attacker,
    defender: frame.defender,
    attack: frame.card,
    defense: frame.defenseCard,
    boosts: publicBoosts(runtime, frame),
    damage: frame.amount,
  };
  runtime.state.revealed = combat;
  runtime.emit({ type: 'combat', combat });
}
export function cancelCombat(runtime: Runtime, hooks = true): void {
  const id = runtime.data.combat;
  if (id === null) return;
  const frame = runtime.data.frames[id];
  runtime.data.combat = null;
  if (frame?.kind === 'combat' && !frame.revealed) {
    for (const boost of frame.boosts)
      revealBoost(runtime, frame.attacker, boost.card, 'attack', hooks, boost.cancelled);
    for (const [player, card] of [
      [frame.attacker, frame.card],
      [frame.defender, frame.defenseCard],
    ] as const)
      if (card) {
        if (hooks) runtime.card(player, card, true);
        else {
          runtime.state.players
            .find((p) => p.id === fighterById(runtime.state, player)!.player)!
            .discard.push(card);
          runtime.emit({
            type: 'played',
            player: fighterById(runtime.state, player)!.player,
            fighter: player,
            card,
          });
        }
      }
  }
  for (const [key, nested] of Object.entries(runtime.data.frames))
    if (Number(key) === id || nested.combatRoot === id) delete runtime.data.frames[Number(key)];
  if (runtime.state.phase.type === 'awaiting-defense')
    runtime.state.phase = { type: 'taking-actions' };
}
export function startCombat(
  runtime: Runtime,
  attacker: string,
  defender: string,
  card: Card,
): void {
  const frame = runtime.frame({
    kind: 'combat',
    actor: attacker,
    target: defender,
    attacker,
    defender,
    card,
    defenseCard: null,
    boosts: [],
    attack: runtime.defs.cards[card.definition].value,
    defense: 0,
    amount: 0,
  });
  runtime.data.combat = frame;
  runtime.prepend(
    { type: 'event', frame, hook: 'before-attack' },
    { type: 'combat-step', frame, step: 'commit' },
  );
}
export function combatStep(
  runtime: Runtime,
  frameId: number,
  step: Extract<Task, { type: 'combat-step' }>['step'],
): void {
  const frame = runtime.data.frames[frameId];
  if (frame.kind !== 'combat') return;
  const attacker = fighterById(runtime.state, frame.attacker)!;
  const defender = fighterById(runtime.state, frame.defender)!;
  if ((attacker.defeated || defender.defeated) && !frame.revealed) {
    cancelCombat(runtime);
    return;
  }
  switch (step) {
    case 'commit':
      if (frame.cancelled) {
        cancelCombat(runtime);
        return;
      }
      runtime.state.phase = {
        type: 'awaiting-defense',
        attacker: attacker.id,
        defender: defender.id,
        card: frame.card,
      };
      break;
    case 'defend':
      frame.defenseCancelled = frame.cancelled;
      frame.defense = frame.cancelled
        ? 0
        : frame.defenseCard
          ? runtime.defs.cards[frame.defenseCard.definition].value
          : 0;
      frame.cancelled = false;
      runtime.prepend({ type: 'combat-step', frame: frameId, step: 'reveal' });
      break;
    case 'reveal':
      // Reveal only after both commitments. Hooks may now safely inspect both cards.
      frame.revealed = true;
      runtime.state.players.find((p) => p.id === attacker.player)!.discard.push(frame.card);
      if (frame.defenseCard)
        runtime.state.players
          .find((p) => p.id === defender.player)!
          .discard.push(frame.defenseCard);
      frame.attack = Math.max(0, frame.attack + modifier(attacker, 'attack', runtime.defs));
      if (frame.defenseCard && !frame.defenseCancelled)
        frame.defense = Math.max(0, frame.defense + modifier(defender, 'defense', runtime.defs));
      applyCombatValues(runtime, frame);
      runtime.state.revealed = {
        attacker: frame.attacker,
        defender: frame.defender,
        attack: frame.card,
        defense: frame.defenseCard,
        boosts: publicBoosts(runtime, frame),
        damage: 0,
      };
      runtime.prepend(
        { type: 'event', frame: frameId, hook: 'combat-reveal' },
        { type: 'combat-step', frame: frameId, step: 'lifecycle' },
        { type: 'event', frame: frameId, hook: 'before-combat' },
        { type: 'combat-step', frame: frameId, step: 'damage' },
        { type: 'event', frame: frameId, hook: 'after-combat' },
        { type: 'event', frame: frameId, hook: 'after-attack' },
        { type: 'event', frame: frameId, hook: 'after-defense' },
        { type: 'combat-step', frame: frameId, step: 'finish' },
        { type: 'release', frame: frameId },
      );
      break;
    case 'lifecycle':
      runtime.cardEvents(attacker.id, frame.card, false);
      if (frame.defenseCard)
        runtime.cardEvents(defender.id, frame.defenseCard, frame.defenseCancelled ?? false);
      for (const boost of frame.boosts)
        revealBoost(runtime, attacker.id, boost.card, 'attack', true, boost.cancelled);
      break;
    case 'damage':
      frame.amount =
        frame.cancelled || attacker.defeated || defender.defeated
          ? 0
          : Math.max(0, frame.attack - frame.defense);
      if (defender.defeated || frame.cancelled) publishCombat(runtime, frame);
      else
        runtime.operation({
          kind: 'damage',
          actor: attacker.id,
          target: defender.id,
          amount: frame.amount,
          reason: 'combat',
          combat: frameId,
        });
      break;
    case 'finish':
      runtime.data.combat = null;
      break;
  }
}
