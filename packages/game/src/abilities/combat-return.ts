import { fighterById } from '../fighters';
import type { Runtime } from './runtime';
import type { Binding } from './state';

/** Transfer the exact combat commitment; it has already completed its reveal lifecycle. */
export function returnCombatCard(runtime: Runtime, binding: Binding): void {
  const frame = runtime.data.frames[binding.frame];
  if (frame.kind !== 'combat' || !binding.provenance) return;
  const card = binding.owner === frame.attacker ? frame.card : frame.defenseCard;
  if (!card || card.id !== binding.provenance.card || (frame.bonus && card.id === frame.card.id))
    return;
  const player = runtime.state.players.find(
    (p) => p.id === fighterById(runtime.state, binding.owner)!.player,
  )!;
  if (player.eliminated) return;
  const index = player.discard.findIndex((c) => c.id === card.id);
  if (index < 0) return;
  player.hand.push(...player.discard.splice(index, 1));
  runtime.emit({ type: 'draw', player: player.id, cards: [card] }, player.id);
}
