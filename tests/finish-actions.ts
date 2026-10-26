import {
  execute,
  type Command,
  type Definitions,
  type GameState,
  type Outcome,
} from '../packages/game/src';

/** Spend remaining actions on Maneuvers, leaving end-step/start-step choices to the test. */
export function finishActions(state: GameState, defs: Definitions, actor = 'p0') {
  const outcomes: Outcome[] = [];
  const apply = (command: Command) => {
    const result = execute(
      state,
      actor,
      { id: `finish-${state.revision}`, revision: state.revision, command },
      defs,
    );
    if (!result.ok) throw new Error(result.message);
    state = result.state;
    outcomes.push(...result.outcomes);
  };
  while (state.players[state.turn].id === actor && state.phase.type === 'taking-actions') {
    apply({ type: 'maneuver' });
    if (state.maneuver && !state.resolution.choice) apply({ type: 'finish-maneuver' });
  }
  return { state, outcomes };
}
