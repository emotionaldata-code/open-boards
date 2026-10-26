import { mainFighter, fighterById } from '../fighters';
import { openChoice } from './choices';
import type { Runtime } from './runtime';
import type { Task } from './state';

export function actionGainPrevented(runtime: Runtime, player: string): boolean {
  return runtime.state.players.some(
    (p) =>
      !p.eliminated &&
      p.id !== player &&
      p.ongoing?.some((c) => runtime.defs.cards[c.definition].ongoing?.preventEnemyActionGain),
  );
}

/** Decide before another player is allowed to inspect/select the protected hand. */
export function offerDiscardProtection(
  runtime: Runtime,
  task: Extract<Task, { type: 'effect' | 'named-value-discard' }>,
  player: string,
): boolean {
  const p = runtime.state.players.find((p) => p.id === player)!;
  if (
    task.discardAllowed ||
    !p.hand.length ||
    !p.ongoing?.some((c) => runtime.defs.cards[c.definition].ongoing?.optionalDiscardProtection)
  )
    return false;
  openChoice(
    runtime,
    task.frame,
    player,
    'Ignore this discard effect?',
    [
      {
        id: 'ignore',
        card: {
          ...p.ongoing!.find(
            (c) => runtime.defs.cards[c.definition].ongoing?.optionalDiscardProtection,
          )!,
        },
        label: 'Ignore the effect',
        tasks: runtime.effects(
          task.type === 'effect' && task.effect.type === 'discard'
            ? (task.effect.onDecline ?? [])
            : [],
          task,
        ),
      },
      {
        id: 'allow',
        decline: true,
        label: 'Resolve the effect',
        tasks: [{ ...task, discardAllowed: true }],
      },
    ],
    1,
    1,
    task.provenance,
    {
      fighter: mainFighter(runtime.state, player).id,
      card: {
        ...p.ongoing!.find(
          (c) => runtime.defs.cards[c.definition].ongoing?.optionalDiscardProtection,
        )!,
      },
    },
  );
  return true;
}

export function expireOngoing(runtime: Runtime, player: string): void {
  const p = runtime.state.players.find((p) => p.id === player)!;
  if (runtime.data.attacked?.includes(player)) return;
  const expired = (p.ongoing ?? []).filter(
    (c) => runtime.defs.cards[c.definition].ongoing?.discardUnlessAttacked,
  );
  p.ongoing = (p.ongoing ?? []).filter((c) => !expired.includes(c));
  // Normal discard receipts and reactions run once for each exact ongoing instance.
  for (const card of expired) {
    p.discard.push(card);
    runtime.cardEvents(mainFighter(runtime.state, player).id, card, true);
  }
}

/** The regular scheme effects finish before the new ongoing takes effect. */
export function activateOngoing(
  runtime: Runtime,
  task: Extract<Task, { type: 'activate-ongoing' }>,
): void {
  const p = runtime.state.players.find(
    (p) => p.id === fighterById(runtime.state, task.owner)?.player,
  )!;
  if (p.eliminated) {
    p.discard.push(task.card);
    return;
  }
  const previous = p.ongoing ?? [];
  p.ongoing = [task.card];
  for (const card of previous) {
    p.discard.push(card);
    runtime.cardEvents(task.owner, card, true);
  }
}
