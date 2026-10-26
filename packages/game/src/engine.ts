import { cardEligible, fighterById, mainFighter, ownedFighters } from './fighters';
import { canDeploy, deploymentSpaces } from './deployment';
import type {
  Card,
  CommandEnvelope,
  Definitions,
  GameState,
  Fighter,
  Outcome,
  Player,
  Result,
} from './types';
import { validPath } from './movement';
import { canAttack } from './targeting';
import { emitter, victory } from './rules';
import { Illegal, requireRule } from './errors';
import { Runtime } from './abilities/runtime';
import { emptyResolution } from './abilities/state';
import { choose } from './abilities/choices';
import { maneuverMovement, payBoost, revealBoost } from './boost';
import { cancelCombat, startCombat } from './abilities/combat';
import { validateDefinitions } from './abilities/validation';

export function createGame(
  seats: { id: string; name: string; character: string; deck: Card[] }[],
  defs: Definitions,
  seed = 1,
): GameState {
  if (seats.length !== 2 && seats.length !== 4) throw new Error('Games require 2 or 4 players');
  if (seats.some((p) => !Object.hasOwn(defs.characters, p.character)))
    throw new Error('Choose a supported character.');
  validateDefinitions(defs);
  if (new Set(seats.map((p) => p.id)).size !== seats.length)
    throw new Error('Seats must be unique.');
  const cardIds = seats.flatMap((p) => p.deck.map((c) => c.id));
  if (
    new Set(cardIds).size !== cardIds.length ||
    seats.some(
      (p) => p.deck.length < 5 || p.deck.some((c) => !Object.hasOwn(defs.cards, c.definition)),
    )
  )
    throw new Error('Supply unique cards and a valid opening deck.');
  for (const seat of seats) {
    const character = defs.characters[seat.character];
    if (
      character.deckSelection &&
      (seat.deck.length !== character.deck.reduce((sum, entry) => sum + entry.count, 0) ||
        character.deck.some(
          (entry) =>
            seat.deck.filter((card) => card.definition === entry.card).length !== entry.count,
        ))
    )
      throw new Error('Supply the complete selectable card pool.');
  }

  const state: GameState = {
    revision: 0,
    sequence: 0,
    turn: 0,
    actions: 2,
    phase: { type: 'taking-actions' },
    revealed: null,
    processed: [],
    resolution: { ...emptyResolution(), random: seed >>> 0 || 1 },
    maneuver: null,
    fighters: [],
    boardTokens: [],
    players: seats.map((p) => ({
      id: p.id,
      name: p.name,
      character: p.character,
      hand: defs.characters[p.character].deckSelection ? [] : structuredClone(p.deck.slice(0, 5)),
      deck: structuredClone(defs.characters[p.character].deckSelection ? p.deck : p.deck.slice(5)),
      discard: [],
      eliminated: false,
      departed: false,
    })),
  };
  for (const [seat, player] of seats.entries()) {
    const character = defs.characters[player.character];
    const add = (role: Fighter['role'], index: number) => {
      const definition = role === 'main' ? character : character.ally!;
      state.fighters.push({
        id: `${player.id}:${role}${role === 'ally' ? `-${index + 1}` : ''}`,
        player: player.id,
        character: character.id,
        definition: definition.id,
        role,
        hp: definition.hp,
        position: role === 'main' ? defs.map.spawns[seats.length as 2 | 4][seat] : null,
        defeated: false,
        statuses: [],
        counters: Object.fromEntries(
          Object.entries(definition.counters ?? {}).map(([key, c]) => [key, c.initial]),
        ),
      });
    };
    add('main', 0);
    if (character.boardTokens)
      for (let i = 0; i < character.boardTokens.count; i++)
        state.boardTokens!.push({
          id: `${player.id}:token-${i + 1}`,
          owner: `${player.id}:main`,
          kind: character.boardTokens.id,
          name: `${character.boardTokens.name} ${i + 1}`,
          position: null,
          linksMovement: character.boardTokens.linksMovement,
          exclusive: character.boardTokens.exclusive,
        });
    for (let i = 0; i < (character.ally?.count ?? 0); i++) add('ally', i);
  }
  if (!canDeploy(state, defs.map)) throw new Error('Selected fighters cannot deploy on this map.');
  const runtime = new Runtime(state, defs, emitter(state, []));
  runtime.prepend(
    ...state.players
      .filter((p) => defs.characters[p.character].deckSelection)
      .map((p) => ({ type: 'select-deck' as const, player: p.id, group: 0 })),
    { type: 'begin-play' },
  );
  runtime.run();
  return state;
}
function take(player: Player, id: string): Card {
  const index = player.hand.findIndex((c) => c.id === id);
  requireRule(index >= 0, 'Choose a card from your hand.');
  return player.hand.splice(index, 1)[0];
}

export function execute(
  previous: GameState,
  actor: string,
  envelope: CommandEnvelope,
  defs: Definitions,
): Result {
  const key = `${actor}:${envelope.id}`;
  if (previous.processed.includes(key))
    return { ok: false, error: 'DUPLICATE', message: 'This command was already applied.' };
  if (envelope.revision !== previous.revision)
    return {
      ok: false,
      error: 'STALE',
      message: 'The board changed. Try again with the latest state.',
    };
  const state = structuredClone(previous);
  state.revision++;
  const outcomes: Outcome[] = [];
  const runtime = new Runtime(state, defs, emitter(state, outcomes));
  try {
    const player = state.players.find((p) => p.id === actor);
    requireRule(
      player &&
        (!player.eliminated ||
          (!player.departed &&
            envelope.command.type === 'choose' &&
            state.resolution.choice?.player === actor)),
      'You do not have an active seat.',
    );
    requireRule(state.phase.type !== 'finished', 'The match is finished.');
    const command = envelope.command;
    if (command.type === 'place-ally') {
      requireRule(
        state.phase.type === 'placing-allies' && state.phase.player === actor,
        'Wait for your deployment turn.',
      );
      const fighter = fighterById(state, command.fighter);
      requireRule(
        fighter?.player === actor &&
          deploymentSpaces(state, fighter.id, defs.map).includes(command.position),
        'Choose a legal empty starting space.',
      );
      fighter.position = command.position;
      const pending = state.fighters.find((f) => !f.defeated && f.position === null);
      if (pending) state.phase = { type: 'placing-allies', player: pending.player };
      else {
        state.phase = { type: 'taking-actions' };
        runtime.prepend({ type: 'flow', action: 'start-game' });
      }
    } else if (command.type === 'choose') choose(runtime, actor, command.choice, command.options);
    else if (command.type === 'defend') {
      requireRule(
        state.phase.type === 'awaiting-defense' &&
          fighterById(state, state.phase.defender)?.player === actor,
        'Only the defender can respond.',
      );
      const defense = command.card === null ? null : take(player, command.card);
      if (defense)
        requireRule(
          ['defense', 'versatile'].includes(defs.cards[defense.definition].category) &&
            cardEligible(defs.cards[defense.definition], fighterById(state, state.phase.defender)!),
          'That card cannot defend.',
        );
      const id = runtime.data.combat!;
      const frame = runtime.data.frames[id];
      requireRule(frame?.kind === 'combat', 'No combat is pending.');
      frame.defenseCard = defense;
      frame.faceUpDefense = !!defense && !!defs.cards[defense.definition].faceUpDefense;
      state.phase = { type: 'taking-actions' };
      runtime.prepend(
        { type: 'event', frame: id, hook: 'before-defense' },
        { type: 'combat-step', frame: id, step: 'defend' },
      );
    } else if (command.type === 'boost-maneuver') {
      requireRule(
        state.phase.type === 'choosing-movement' &&
          state.maneuver?.player === actor &&
          state.maneuver.boostable,
        'Boost only once, before any fighter moves in this Maneuver.',
      );
      const { card, amount } = payBoost(player, command.card, defs);
      state.maneuver.boost = amount;
      state.maneuver.boostable = false;
      state.phase = { type: 'taking-actions' };
      const fighter = mainFighter(state, actor).id;
      runtime.event('maneuver-boosted', { kind: 'maneuver-boost', actor: fighter, amount });
      revealBoost(runtime, fighter, card, 'maneuver');
    } else if (command.type === 'finish-maneuver') {
      requireRule(
        state.phase.type === 'choosing-movement' && state.maneuver?.player === actor,
        'No Maneuver is pending for you.',
      );
      state.maneuver.boostable = false;
      state.maneuver.finishing = true;
      state.phase = { type: 'taking-actions' };
      runtime.resumeManeuver();
    } else if (command.type === 'move') {
      requireRule(
        state.phase.type === 'choosing-movement' && state.phase.player === actor,
        'No movement is pending for you.',
      );
      const fighter = fighterById(state, command.fighter);
      requireRule(
        fighter &&
          fighter.player === actor &&
          !fighter.defeated &&
          state.maneuver?.remaining.includes(fighter.id),
        'Choose a fighter that has not moved in this Maneuver.',
      );
      const distance = maneuverMovement(state, fighter, defs);
      requireRule(
        validPath(state, fighter, command.path, defs.map, distance),
        'Choose an unoccupied path within your movement range.',
      );
      state.maneuver!.boostable = false;
      state.maneuver!.remaining = state.maneuver!.remaining.filter((id) => id !== fighter.id);
      state.phase = { type: 'taking-actions' };
      runtime.operation({
        kind: 'move',
        actor: fighter.id,
        target: fighter.id,
        path: command.path,
        distance,
        mode: 'move',
        origin: fighter.position!,
      });
    } else if (command.type === 'discard') {
      requireRule(
        state.phase.type === 'discarding' && state.phase.player === actor,
        'No discard is pending for you.',
      );
      requireRule(
        new Set(command.cards).size === command.cards.length &&
          command.cards.length === player.hand.length - 7,
        'Discard exactly enough cards to keep seven.',
      );
      for (const id of command.cards)
        requireRule(
          player.hand.some((c) => c.id === id),
          'Choose a card from your hand.',
        );
      state.phase = { type: 'taking-actions' };
      runtime.prepend(
        ...command.cards.map((card) => ({ type: 'discard-card' as const, player: actor, card })),
      );
    } else {
      requireRule(state.phase.type === 'taking-actions', 'Resolve the pending choice first.');
      requireRule(state.players[state.turn].id === actor, 'Wait for your turn.');
      requireRule(state.actions > 0, 'No actions remain.');
      runtime.prepend({ type: 'flow', action: 'settle' });
      switch (command.type) {
        case 'end-turn':
          runtime.prepend({ type: 'flow', action: 'end-turn' });
          break;
        case 'maneuver':
          state.actions--;
          state.maneuver = {
            player: actor,
            remaining: ownedFighters(state, actor)
              .filter((f) => f.position !== null)
              .map((f) => f.id),
            finishing: false,
            boost: 0,
            boostable: true,
          };
          runtime.operation({ kind: 'draw', actor: mainFighter(state, actor).id, amount: 1 });
          break;
        case 'attack': {
          const fighter = fighterById(state, command.fighter);
          const target = fighterById(state, command.target);
          requireRule(
            fighter && fighter.player === actor && target && canAttack(fighter, target, defs),
            'Choose an opponent within your character’s attack range.',
          );
          const card = take(player, command.card);
          requireRule(
            ['attack', 'versatile'].includes(defs.cards[card.definition].category) &&
              cardEligible(defs.cards[card.definition], fighter),
            'That card cannot attack.',
          );
          state.actions--;
          (runtime.data.attacked ??= []).push(actor);
          startCombat(runtime, fighter.id, target.id, card);
          break;
        }
        case 'play-action': {
          const fighter = fighterById(state, command.fighter);
          requireRule(
            fighter && fighter.player === actor && !fighter.defeated && fighter.position !== null,
            'Choose a living owned fighter.',
          );
          const card = take(player, command.card),
            definition = defs.cards[card.definition];
          requireRule(
            definition.category === 'action' && cardEligible(definition, fighter),
            'Choose an action card.',
          );
          state.actions--;
          const frame = runtime.frame({ kind: 'card', actor: fighter.id, card, discarded: false });
          if (!definition.ongoing) player.discard.push(card);
          runtime.emit({ type: 'played', player: actor, fighter: fighter.id, card });
          runtime.prepend(
            { type: 'event', frame, hook: 'card-played' },
            ...runtime.effects(definition.effects ?? [], {
              frame,
              owner: fighter.id,
              provenance: { kind: 'card', card: card.id },
            }),
            ...(definition.ongoing
              ? [{ type: 'activate-ongoing' as const, frame, owner: fighter.id, card }]
              : [{ type: 'event' as const, frame, hook: 'card-discarded' as const }]),
            { type: 'release', frame },
          );
          break;
        }
      }
    }
    runtime.run();
    state.processed.push(key);
    return { ok: true, state, outcomes };
  } catch (error) {
    if (error instanceof Illegal) return { ok: false, error: 'ILLEGAL', message: error.message };
    throw error;
  }
}

/** Lifecycle forfeits bypass abilities; they cannot be prevented or used for death retaliation. */
export function forfeit(
  previous: GameState,
  id: string,
  defs: Definitions,
): { state: GameState; outcomes: Outcome[] } {
  const previousPlayer = previous.players.find((p) => p.id === id);
  if (previous.phase.type === 'finished' || !previousPlayer || previousPlayer.departed)
    return { state: previous, outcomes: [] };
  const state = structuredClone(previous);
  state.revision++;
  const outcomes: Outcome[] = [],
    runtime = new Runtime(state, defs, emitter(state, outcomes));
  const player = state.players.find((p) => p.id === id)!;
  if (!player.eliminated) runtime.emit({ type: 'eliminated', player: id });
  for (const fighter of state.fighters.filter((f) => f.player === id)) {
    fighter.hp = 0;
    fighter.defeated = true;
    fighter.position = null;
  }
  if (state.maneuver?.player === id) state.maneuver = null;
  state.boardTokens = state.boardTokens?.filter((t) => fighterById(state, t.owner)?.player !== id);
  player.eliminated = true;
  player.departed = true;
  const combat = runtime.data.combat === null ? null : runtime.data.frames[runtime.data.combat];
  if (
    combat?.kind === 'combat' &&
    [combat.attacker, combat.defender].some((f) => fighterById(state, f)?.player === id)
  )
    cancelCombat(runtime, false);
  const choice = runtime.data.choice;
  if (choice) {
    choice.options = choice.options.filter(
      (o) => o.id !== id && fighterById(state, o.id)?.player !== id,
    );
    for (const key of Object.keys(choice.continuations))
      if (key === id || fighterById(state, key)?.player === id) delete choice.continuations[key];
    choice.max = Math.min(choice.max, choice.options.length);
    choice.min = Math.min(choice.min, choice.max);
    if (choice.player === id || !runtime.data.frames[choice.frame] || !choice.options.length) {
      runtime.data.choice = null;
      state.phase = { type: 'taking-actions' };
    }
  }
  if (
    (state.phase.type === 'choosing-movement' || state.phase.type === 'discarding') &&
    state.phase.player === id
  )
    state.phase = { type: 'taking-actions' };
  if (state.phase.type === 'placing-allies') {
    const pending = state.fighters.find((f) => !f.defeated && f.position === null);
    if (pending) state.phase = { type: 'placing-allies', player: pending.player };
    else {
      state.phase = { type: 'taking-actions' };
      runtime.prepend({ type: 'flow', action: 'start-game' });
    }
  }
  if (victory(state, runtime.emit)) runtime.clear();
  else if (state.phase.type === 'taking-actions') {
    runtime.data.queue.push({ type: 'flow', action: 'settle' });
    runtime.run();
  }
  return { state, outcomes };
}
