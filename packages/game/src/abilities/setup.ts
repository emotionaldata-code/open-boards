import { mainFighter } from '../fighters';
import { openChoice } from './choices';
import { shuffle } from './deck';
import type { Runtime } from './runtime';
import type { Task } from './state';

/** Select from the supplied card pool before dealing; no new card instances are invented. */
export function selectDeck(runtime: Runtime, task: Extract<Task, { type: 'select-deck' }>): void {
  const player = runtime.state.players.find((p) => p.id === task.player)!;
  if (player.eliminated) return;
  const selection = runtime.defs.characters[player.character].deckSelection!;
  if (task.selected) {
    const group = selection.groups[task.group - 1];
    player.deck = player.deck.filter(
      (c) => !group.cards.includes(c.definition) || c.definition === task.selected,
    );
  }
  const group = selection.groups[task.group];
  if (!group) {
    shuffle(runtime, player.deck);
    player.hand.push(...player.deck.splice(0, 5));
    return;
  }
  const frame = runtime.frame({ kind: 'turn', actor: mainFighter(runtime.state, player.id).id });
  runtime.prepend({ type: 'release', frame });
  openChoice(
    runtime,
    frame,
    player.id,
    `${selection.name} · Choose ${group.name}`,
    group.cards.map((card) => ({
      id: card,
      label: runtime.defs.cards[card].name,
      tasks: [{ type: 'select-deck', player: player.id, group: task.group + 1, selected: card }],
    })),
  );
}

export function beginPlay(runtime: Runtime): void {
  const pending = runtime.state.fighters.find((f) => !f.defeated && f.position === null);
  if (pending) runtime.state.phase = { type: 'placing-allies', player: pending.player };
  else {
    runtime.prepend({ type: 'flow', action: 'start-game' });
  }
}
