import { execute, type Definitions, type GameState } from '../packages/game/src/index';

/** Resolve only pre-deal loadout choices; leave ordinary gameplay decisions untouched. */
export function completeDeckSelection(state: GameState, defs: Definitions): GameState {
  while (state.resolution.choice?.prompt.startsWith('Always Prepared')) {
    const choice = state.resolution.choice;
    const result = execute(
      state,
      choice.player,
      {
        id: `loadout-${state.revision}`,
        revision: state.revision,
        command: { type: 'choose', choice: choice.id, options: [choice.options[0].id] },
      },
      defs,
    );
    if (!result.ok) throw new Error(result.message);
    state = result.state;
  }
  return state;
}
