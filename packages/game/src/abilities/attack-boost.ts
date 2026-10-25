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
): frame is Extract<Frame, { kind: 'combat' }> {
  return (
    frame?.kind === 'combat' &&
    frame.attacker === owner &&
    !fighterById(runtime.state, owner)?.defeated &&
    !frame.boosts.some((b) => b.grant === grant) &&
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
): void {
  const frame = runtime.data.frames[frameId];
  if (!canBoost(runtime, frame, owner, grant)) return;
  const player = runtime.state.players.find(
    (p) => p.id === fighterById(runtime.state, owner)!.player,
  )!;
  if (!player.hand.length) return;
  openChoice(
    runtime,
    frameId,
    player.id,
    'Boost attack',
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
          },
        ],
      })),
      { id: '$skip', label: 'Skip', tasks: [] },
    ],
    1,
    1,
    provenance,
  );
}

export function commitAttackBoost(
  runtime: Runtime,
  frameId: number,
  owner: string,
  id: string,
  grant: string,
  cancelWithCard: boolean,
): void {
  const frame = runtime.data.frames[frameId];
  if (!canBoost(runtime, frame, owner, grant)) return;
  const player = runtime.state.players.find(
    (p) => p.id === fighterById(runtime.state, owner)!.player,
  )!;
  const { card, amount } = payBoost(player, id, runtime.defs);
  frame.boosts.push({ card, grant, cancelWithCard });
  modifyCombatValue(frame, 'attack', amount);
  if (frame.revealed) {
    if (runtime.state.revealed) runtime.state.revealed.boosts = publicBoosts(runtime, frame);
    revealBoost(runtime, owner, card, 'attack');
  }
}

export function publicBoosts(runtime: Runtime, frame: Extract<Frame, { kind: 'combat' }>) {
  return frame.boosts.map(({ card, cancelled }) => ({
    card,
    amount: cancelled ? 0 : runtime.defs.cards[card.definition].boost,
    ...(cancelled ? { cancelled: true } : {}),
  }));
}
