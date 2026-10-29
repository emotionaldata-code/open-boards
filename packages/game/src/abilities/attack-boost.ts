import { fighterById } from '../fighters';
import { boostValue, payBoost, revealBoost } from '../boost';
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
    (frame.hook === 'before-attack' ||
      frame.hook === 'before-combat' ||
      frame.hook === 'combat-reveal')
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
        label: `${runtime.defs.cards[card.definition].name} · BOOST +${boostValue(player, card, runtime.defs)}`,
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
    amount,
    revealed: frame.revealed,
    grant,
    cancelWithCard,
    field,
    fighter: owner,
    cardEffect: !!provenance,
  });
  modifyCombatValue(frame, field, amount, !!provenance);
  if (frame.revealed) {
    if (runtime.state.revealed) runtime.state.revealed.boosts = publicBoosts(runtime, frame);
    revealBoost(runtime, owner, card, field, true, false, amount);
  }
}

export function publicBoosts(runtime: Runtime, frame: Extract<Frame, { kind: 'combat' }>) {
  return frame.boosts.map(({ card, amount, cancelled, field }) => ({
    card,
    amount: cancelled ? 0 : (amount ?? runtime.defs.cards[card.definition].boost),
    ...(cancelled ? { cancelled: true } : {}),
    ...(field === 'defense' ? { field } : {}),
  }));
}

/** Choose every payment before paying or resolving any printed BOOST effect. */
export function offerBoostGroup(
  runtime: Runtime,
  binding: import('./state').Binding,
  target: string,
  grant: string,
  count: number,
  optional = true,
): void {
  const frame = runtime.data.frames[binding.frame];
  const fighter = fighterById(runtime.state, target);
  if (frame?.kind !== 'combat' || !fighter || fighter.defeated) return;
  const player = runtime.state.players.find((p) => p.id === fighter.player)!;
  if (player.hand.length < count) return;
  if (optional) {
    openChoice(
      runtime,
      binding.frame,
      player.id,
      `BOOST with ${count} cards?`,
      [
        {
          id: 'boost',
          label: `BOOST with ${count} cards`,
          tasks: runtime.effects(
            [{ type: 'boost-combat', target: 'self', grant, count, optional: false }],
            { ...binding, owner: target },
          ),
        },
        { id: '$skip', decline: true, label: 'Skip', tasks: [] },
      ],
      1,
      1,
      binding.provenance,
      { fighter: target },
    );
    return;
  }
  frame.selectedBoosts = [];
  runtime.prepend({ ...binding, type: 'commit-boost-group', target, grant, count });
  openChoice(
    runtime,
    binding.frame,
    player.id,
    `Choose ${count} BOOST cards`,
    player.hand.map((card) => ({
      id: card.id,
      card: { ...card },
      label: `${runtime.defs.cards[card.definition].name} · BOOST +${boostValue(player, card, runtime.defs)}`,
      tasks: [{ type: 'select-boost-card' as const, frame: binding.frame, card: card.id }],
    })),
    count,
    count,
    binding.provenance,
    { fighter: target },
  );
}

export function commitBoostGroup(
  runtime: Runtime,
  task: Extract<import('./state').Task, { type: 'commit-boost-group' }>,
): void {
  const frame = runtime.data.frames[task.frame];
  if (frame?.kind !== 'combat') return;
  const ids = frame.selectedBoosts ?? [];
  delete frame.selectedBoosts;
  const player = runtime.state.players.find(
    (p) => p.id === fighterById(runtime.state, task.target)?.player,
  );
  if (
    ids.length !== task.count ||
    !player ||
    ids.some((id) => !player.hand.some((c) => c.id === id))
  )
    return;
  const field = frame.attacker === task.target ? 'attack' : 'defense';
  for (const [i, id] of ids.entries())
    commitAttackBoost(
      runtime,
      task.frame,
      task.target,
      id,
      `${task.grant}-${i + 1}`,
      false,
      field,
      task.provenance,
    );
}
