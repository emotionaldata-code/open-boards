import { fighterById } from '../fighters';
import { payBoost, revealBoost } from '../boost';
import { modifyCombatValue } from './combat-values';
import { openChoice } from './choices';
import type { Runtime } from './runtime';
import type { CardProvenance, Frame } from './state';

function canBoost(
  runtime: Runtime,
  frame: Frame | undefined,
  owner: string,
  grant: string,
  field: 'attack' | 'defense' = 'attack',
): frame is Extract<Frame, { kind: 'combat' }> {
  return (
    frame?.kind === 'combat' &&
    (field === 'attack' ? frame.attacker === owner : frame.defender === owner) &&
    !fighterById(runtime.state, owner)?.defeated &&
    !frame.boosts.some((b) => b.grant === grant && (b.fighter ?? frame.attacker) === owner) &&
    (frame.hook === 'before-attack' || frame.hook === 'before-combat')
  );
}

export function offerAttackBoost(
  runtime: Runtime,
  frameId: number,
  owner: string,
  provenance?: CardProvenance,
  grant = 'attack',
  cancelWithCard = false,
  field: 'attack' | 'defense' = 'attack',
): void {
  const frame = runtime.data.frames[frameId];
  if (!canBoost(runtime, frame, owner, grant, field)) return;
  const player = runtime.state.players.find(
    (p) => p.id === fighterById(runtime.state, owner)!.player,
  )!;
  if (!player.hand.length) return;
  openChoice(
    runtime,
    frameId,
    player.id,
    `Boost ${field}`,
    [
      ...player.hand.map((card) => ({
        id: card.id,
        card: { ...card },
        label: `${runtime.defs.cards[card.definition].name} · BOOST +${runtime.defs.cards[card.definition].boost}`,
        tasks: [
          {
            type: 'boost-attack' as const,
            frame: frameId,
            owner,
            card: card.id,
            grant,
            cancelWithCard,
            field,
          },
        ],
      })),
      { id: '$skip', decline: true, label: 'Skip', tasks: [] },
    ],
    1,
    1,
    provenance,
    { fighter: owner },
  );
}

export function commitAttackBoost(
  runtime: Runtime,
  frameId: number,
  owner: string,
  id: string,
  grant: string,
  cancelWithCard: boolean,
  field: 'attack' | 'defense' = 'attack',
  provenance?: CardProvenance,
): void {
  const frame = runtime.data.frames[frameId];
  if (!canBoost(runtime, frame, owner, grant, field)) return;
  const player = runtime.state.players.find(
    (p) => p.id === fighterById(runtime.state, owner)!.player,
  )!;
  const { card, amount } = payBoost(player, id, runtime.defs);
  frame.boosts.push({
    card,
    grant,
    cancelWithCard,
    field,
    fighter: owner,
    cardEffect: !!provenance,
  });
  modifyCombatValue(frame, field, amount, !!provenance);
  if (frame.revealed) {
    if (runtime.state.revealed) runtime.state.revealed.boosts = publicBoosts(runtime, frame);
    revealBoost(runtime, owner, card, field);
  }
}

export function publicBoosts(runtime: Runtime, frame: Extract<Frame, { kind: 'combat' }>) {
  return frame.boosts.map(({ card, cancelled, field }) => ({
    card,
    amount: cancelled ? 0 : runtime.defs.cards[card.definition].boost,
    ...(cancelled ? { cancelled: true } : {}),
    ...(field === 'defense' ? { field } : {}),
  }));
}
