import { fighterDefinition, mainFighter } from '../fighters';
import { openChoice } from './choices';
import { shuffle } from './deck';
import type { Runtime } from './runtime';
import type { Task } from './state';

export function selectHero(runtime: Runtime, task: Extract<Task, { type: 'select-hero' }>): void {
  const player = runtime.state.players.find((p) => p.id === task.player)!;
  const character = runtime.defs.characters[player.character];
  if (!character.heroSelection || player.eliminated) return;
  const hero = mainFighter(runtime.state, player.id);
  const ally = runtime.state.fighters.find((f) => f.player === player.id && f.role === 'ally')!;
  if (task.identity) {
    hero.definition = task.identity;
    ally.definition = task.identity === character.id ? character.ally!.id : character.id;
    for (const fighter of [hero, ally]) {
      const definition = fighterDefinition(fighter, runtime.defs);
      fighter.hp = definition.hp;
      fighter.counters = Object.fromEntries(
        Object.entries(definition.counters ?? {}).map(([key, c]) => [key, c.initial]),
      );
    }
    return;
  }
  const frame = runtime.frame({ kind: 'turn', actor: hero.id });
  runtime.data.frames[frame].hook = 'game-start';
  runtime.prepend({ type: 'release', frame });
  openChoice(
    runtime,
    frame,
    player.id,
    character.heroSelection.name,
    [
      {
        id: character.id,
        label: character.heroSelection.mainName,
        object: { type: 'fighter', id: hero.id },
        tasks: [{ ...task, identity: character.id }],
      },
      {
        id: character.ally!.id,
        label: character.ally!.name,
        object: { type: 'fighter', id: ally.id },
        tasks: [{ ...task, identity: character.ally!.id }],
      },
    ],
    1,
    1,
    undefined,
    { fighter: hero.id, description: character.heroSelection.description },
  );
}

/** Main fighters are placed, but opening hands and ally deployment are still pending. */
export function setupAbilities(runtime: Runtime): Task[] {
  return runtime.state.players.flatMap((p): Task[] => {
    const frame = runtime.frame({ kind: 'turn', actor: mainFighter(runtime.state, p.id).id });
    return [
      { type: 'event', frame, hook: 'game-start' },
      { type: 'release', frame },
    ];
  });
}

/** Select from the supplied card pool before dealing; no new card instances are invented. */
export function selectDeck(runtime: Runtime, task: Extract<Task, { type: 'select-deck' }>): void {
  const player = runtime.state.players.find((p) => p.id === task.player)!;
  if (player.eliminated) return;
  const selection = runtime.defs.characters[player.character].deckSelection;
  if (!selection) {
    player.hand.push(...player.deck.splice(0, 5));
    return;
  }
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
      card: { id: card, definition: card },
      label: runtime.defs.cards[card].name,
      tasks: [{ type: 'select-deck', player: player.id, group: task.group + 1, selected: card }],
    })),
    1,
    1,
    undefined,
    { fighter: mainFighter(runtime.state, player.id).id },
  );
}

export function beginPlay(runtime: Runtime): void {
  const pending = runtime.state.fighters.find((f) => !f.defeated && f.position === null);
  if (pending) runtime.state.phase = { type: 'placing-allies', player: pending.player };
  else {
    runtime.prepend({ type: 'flow', action: 'start-game' });
  }
}
