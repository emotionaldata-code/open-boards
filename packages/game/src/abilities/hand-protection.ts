import { fighterById } from '../fighters';
import { openChoice } from './choices';
import { reference } from './conditions';
import type { Runtime } from './runtime';
import type { Binding } from './state';
import type { Effect } from './vocabulary';

/** Protect an inspection before any private card identities reach the inspecting player. */
export function offerHandProtection(runtime: Runtime, binding: Binding, effect: Effect): boolean {
  if (binding.inspectionAllowed) return false;
  const target = reference(
    runtime.state,
    binding,
    'target' in effect ? effect.target : 'self',
    false,
  );
  const owner = fighterById(runtime.state, binding.owner);
  if (!target || !owner || target.player === owner.player) return false;
  const frame = runtime.data.frames[binding.frame];
  const frameCards =
    frame?.kind === 'card'
      ? [frame.card]
      : frame?.kind === 'combat'
        ? [frame.card, ...(frame.defenseCard ? [frame.defenseCard] : [])]
        : [];
  const source =
    binding.provenance &&
    [
      ...frameCards,
      ...runtime.state.players.flatMap((p) => [...p.hand, ...p.discard, ...(p.ongoing ?? [])]),
    ].find((c) => c.id === binding.provenance?.card);
  if (
    source &&
    (runtime.defs.cards[source.definition].effectsCannotBeCancelled ||
      runtime.defs.characters[owner.character].cardEffectProtection?.tags.includes(
        runtime.defs.cards[source.definition].usableBy,
      ))
  )
    return false;
  const player = runtime.state.players.find((p) => p.id === target.player)!;
  const cards = player.hand.filter(
    (c) => runtime.defs.cards[c.definition].handInspectionProtection,
  );
  if (!cards.length) return false;
  openChoice(
    runtime,
    binding.frame,
    player.id,
    'Reveal a card to cancel the hand inspection?',
    [
      ...cards.map((card) => ({
        id: card.id,
        label: `Reveal ${runtime.defs.cards[card.definition].name}`,
        card: { ...card },
        tasks: [
          { type: 'reveal-protection' as const, player: player.id, card: card.id, cancel: binding },
        ],
      })),
      {
        id: '$allow',
        decline: true,
        label: 'Allow inspection',
        tasks: [{ ...binding, type: 'effect' as const, effect, inspectionAllowed: true }],
      },
    ],
    1,
    1,
    binding.provenance,
    { fighter: target.id },
  );
  return true;
}
