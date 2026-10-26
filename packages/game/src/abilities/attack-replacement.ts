import { cardEligible, fighterById } from '../fighters';
import { openChoice } from './choices';
import { modifier } from './conditions';
import { applyCombatValues } from './combat-values';
import { inspectHand } from './hand';
import { cardProvenance } from './suppression';
import type { Runtime } from './runtime';
import type { Binding, Task } from './state';

/** Return the revealed commitment without a discard event, then inspect its owner's whole hand. */
export function offerAttackReplacement(runtime: Runtime, binding: Binding): void {
  const frame = runtime.data.frames[binding.frame];
  if (frame.kind !== 'combat' || frame.hook !== 'combat-reveal' || frame.bonus || !frame.revealed)
    return;
  const attacker = fighterById(runtime.state, frame.attacker)!;
  const player = runtime.state.players.find((p) => p.id === attacker.player)!;
  if (attacker.defeated || player.eliminated) return;
  const index = player.discard.findIndex((c) => c.id === frame.card.id);
  if (index < 0) return;
  player.hand.push(player.discard.splice(index, 1)[0]);
  runtime.prepend({ ...binding, type: 'select-attack' });
  inspectHand(runtime, binding, { type: 'inspect-hand', target: 'attacker' });
}

export function selectAttack(runtime: Runtime, binding: Binding): void {
  const frame = runtime.data.frames[binding.frame];
  if (frame.kind !== 'combat' || frame.bonus) return;
  const attacker = fighterById(runtime.state, frame.attacker)!;
  const player = runtime.state.players.find((p) => p.id === attacker.player)!;
  if (attacker.defeated || player.eliminated) return;
  openChoice(
    runtime,
    binding.frame,
    fighterById(runtime.state, binding.owner)!.player,
    'Choose the replacement attack',
    player.hand
      .filter((card) => {
        const definition = runtime.defs.cards[card.definition];
        return (
          (definition.category === 'attack' || definition.category === 'versatile') &&
          cardEligible(definition, attacker)
        );
      })
      .map((card) => ({
        id: card.id,
        label: runtime.defs.cards[card.definition].name,
        card: { ...card },
        tasks: [{ ...binding, type: 'replace-attack', card: card.id }],
      })),
    1,
    1,
    binding.provenance,
    { fighter: binding.owner },
  );
}

export function replaceAttack(
  runtime: Runtime,
  task: Extract<Task, { type: 'replace-attack' }>,
): void {
  const frame = runtime.data.frames[task.frame];
  if (frame.kind !== 'combat' || frame.bonus || frame.hook !== 'combat-reveal') return;
  const attacker = fighterById(runtime.state, frame.attacker)!;
  const player = runtime.state.players.find((p) => p.id === attacker.player)!;
  const index = player.hand.findIndex((c) => c.id === task.card);
  if (index < 0 || attacker.defeated || player.eliminated) return;
  const card = player.hand[index],
    definition = runtime.defs.cards[card.definition];
  if (!cardEligible(definition, attacker) || !['attack', 'versatile'].includes(definition.category))
    return;
  const previous = frame.card;
  frame.card = player.hand.splice(index, 1)[0];
  player.discard.push(frame.card);
  // Old immediate effects were collected before the defense replaced the card. Never run them.
  runtime.data.queue = runtime.data.queue.filter(
    (t) => !(t.provenance?.combat === task.frame && t.provenance.card === previous.id),
  );
  if (frame.cardValues) delete frame.cardValues[previous.id];
  if (frame.lockedValues) delete frame.lockedValues.attack;
  if (!frame.cardLockedValues?.includes('attack')) {
    frame.attack = Math.max(
      0,
      definition.value +
        modifier(attacker, 'attack', runtime.defs) +
        frame.boosts.reduce(
          (sum, b) => sum + (b.cancelled ? 0 : runtime.defs.cards[b.card.definition].boost),
          0,
        ),
    );
  }
  applyCombatValues(runtime, frame, ['attack']);
  if (runtime.state.revealed) runtime.state.revealed.attack = { ...frame.card };
  // Only the new attacking card's immediate effects run; defense/passives do not repeat.
  runtime.prepend(
    ...(definition.abilities ?? [])
      .filter((a) => a.trigger === 'combat-reveal')
      .map((ability): Task => ({
        type: 'ability',
        frame: task.frame,
        owner: attacker.id,
        ability,
        key: `${attacker.id}/card/${card.definition}/${ability.id}`,
        provenance: cardProvenance(runtime, frame, card.id),
      })),
  );
}
