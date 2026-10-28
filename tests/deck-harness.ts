import {
  createGame,
  deploymentSpaces,
  execute,
  type Command,
  type Definitions,
  type GameState,
} from '../packages/game/src';
import { completeDeckSelection } from './complete-deck-selection';

/** Fixed decks and JSON reconnects for authored rules and neutral operation fixtures. */
export function deckHarness(defs: Definitions, roster: string[]) {
  let state = completeDeckSelection(
    createGame(
      roster.map((character, i) => ({
        id: `p${i}`,
        name: `Seat ${i}`,
        character,
        deck: defs.characters[character].deck.flatMap(({ card, count }) =>
          Array.from({ length: count }, (_, j) => ({ id: `p${i}-${card}-${j}`, definition: card })),
        ),
      })),
      defs,
      731,
    ),
    defs,
  );
  const h = {
    defs,
    get state() {
      return state;
    },
    fighter(id = 'p0:main') {
      return state.fighters.find((f) => f.id === id)!;
    },
    reconnect() {
      state = JSON.parse(JSON.stringify(state)) as GameState;
    },
    run(command: Command, actor = 'p0') {
      return execute(
        state,
        actor,
        { id: `c-${state.revision}`, revision: state.revision, command },
        defs,
      );
    },
    apply(command: Command, actor = 'p0') {
      const result = h.run(command, actor);
      if (!result.ok) throw new Error(result.message);
      state = result.state;
      return result.outcomes;
    },
    choose(option?: string) {
      h.reconnect();
      const c = state.resolution.choice!;
      return h.apply(
        { type: 'choose', choice: c.id, options: [option ?? c.options[0].id] },
        c.player,
      );
    },
    action(definition: string, fighter = 'p0:main') {
      const p = state.players.find((p) => p.id === h.fighter(fighter).player)!;
      p.hand[0].definition = definition;
      return h.apply({ type: 'play-action', fighter, card: p.hand[0].id }, p.id);
    },
    attack(definition: string, attacker = 'p0:main', defender = 'p1:main', faceUp = false) {
      const p = state.players.find((p) => p.id === h.fighter(attacker).player)!;
      state.turn = state.players.indexOf(p);
      p.hand[0].definition = definition;
      return h.apply(
        {
          type: 'attack',
          fighter: attacker,
          target: defender,
          card: p.hand[0].id,
          ...(faceUp ? { faceUp: true } : {}),
        },
        p.id,
      );
    },
    defend(definition: string | null = null, actor = 'p1') {
      const p = state.players.find((p) => p.id === actor)!;
      if (definition) p.hand[0].definition = definition;
      return h.apply({ type: 'defend', card: definition ? p.hand[0].id : null }, actor);
    },
  };
  while (state.phase.type === 'placing-allies') {
    const f = state.fighters.find((f) => f.position === null)!;
    h.apply(
      { type: 'place-ally', fighter: f.id, position: deploymentSpaces(state, f.id, defs.map)[0] },
      f.player,
    );
  }
  return h;
}
