import { boostValue } from '../boost';
import { mainFighter } from '../fighters';
import { openChoice } from './choices';
import type { Runtime } from './runtime';
import type { Task } from './state';

type BoostDraw = Extract<Task, { type: 'boost-draw' }>;

/** Hidden commitments finish before any reveal, draw, reaction or comparison. */
export function resolveBoostDraw(runtime: Runtime, task: BoostDraw): void {
  if (task.stage === 'commit') {
    if (task.selected) {
      const player = runtime.state.players.find((p) => p.id === task.selected!.player)!;
      const card = player.hand.find((c) => c.id === task.selected!.card);
      if (!card || player.eliminated) return;
      task = {
        ...task,
        selected: undefined,
        commitments: [
          ...task.commitments,
          { player: player.id, card: { ...card }, boost: boostValue(player, card, runtime.defs) },
        ],
      };
    }
    const [id, ...remaining] = task.remaining;
    if (id) {
      const p = runtime.state.players.find((p) => p.id === id)!;
      if (p.eliminated || !p.hand.length) {
        runtime.prepend({
          ...task,
          remaining,
          commitments: [...task.commitments, { player: id, boost: 0 }],
        });
        return;
      }
      openChoice(
        runtime,
        task.frame,
        id,
        'Secretly choose a card to reveal',
        p.hand.map((card) => ({
          id: card.id,
          card: { ...card },
          label: runtime.defs.cards[card.definition].name,
          tasks: [{ ...task, remaining, selected: { player: id, card: card.id } }],
        })),
        1,
        1,
        task.provenance,
        { fighter: task.owner },
      );
      return;
    }
    for (const c of task.commitments)
      if (c.card) runtime.emit({ type: 'hand-revealed', player: c.player, cards: [c.card] });
    runtime.prepend({ ...task, stage: 'draw', index: 0 });
    return;
  }
  if (task.stage === 'draw') {
    const commitment = task.commitments[task.index];
    if (!commitment) {
      runtime.prepend({ ...task, stage: 'damage', index: 0 });
      return;
    }
    const actor = mainFighter(runtime.state, commitment.player).id;
    const frame = runtime.frame({ kind: 'draw', actor, amount: commitment.boost });
    // Retain the actual draw receipt until every participant has drawn.
    const commitments = task.commitments.map((c, i) =>
      i === task.index ? { ...c, draw: frame } : c,
    );
    runtime.prepend(
      { type: 'event', frame, hook: 'before-draw' },
      { type: 'apply', frame, provenance: task.provenance },
      { type: 'event', frame, hook: 'after-draw' },
      { ...task, commitments, index: task.index + 1 },
    );
    return;
  }
  const results = task.commitments.map((c) => {
    const draw = c.draw === undefined ? undefined : runtime.data.frames[c.draw];
    return { player: c.player, amount: draw?.kind === 'draw' ? draw.amount : 0 };
  });
  const most = Math.max(0, ...results.map((r) => r.amount));
  runtime.prepend(
    ...results
      .filter((r) => r.amount === most && r.amount > 0)
      .map((r): Task => ({
        type: 'operation',
        provenance: task.provenance,
        operation: {
          kind: 'damage',
          actor: mainFighter(runtime.state, r.player).id,
          target: mainFighter(runtime.state, r.player).id,
          amount: r.amount,
          reason: 'ability',
        },
      })),
    ...task.commitments.flatMap((c): Task[] =>
      c.draw === undefined ? [] : [{ type: 'release', frame: c.draw }],
    ),
  );
}
