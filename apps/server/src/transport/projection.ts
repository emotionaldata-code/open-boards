import { fighterById, type GameState, type Outcome } from '@open-boards/game';
import type { GameView } from '@open-boards/protocol';
export function projectGame(state: GameState, viewer: string, paused: boolean): GameView {
  const phase =
    state.phase.type === 'awaiting-defense'
      ? {
          type: 'awaiting-defense' as const,
          attacker: state.phase.attacker,
          defender: state.phase.defender,
          ...(fighterById(state, state.phase.attacker)?.player === viewer
            ? { committedCard: state.phase.card }
            : {}),
        }
      : state.phase;
  const choice = state.resolution.choice;
  return {
    choice:
      choice?.player === viewer
        ? {
            id: choice.id,
            player: choice.player,
            prompt: choice.prompt,
            options: choice.options,
            min: choice.min,
            max: choice.max,
          }
        : null,
    revision: state.revision,
    sequence: state.sequence,
    players: state.players.map((p) => ({
      id: p.id,
      name: p.name,
      character: p.character,
      handCount: p.hand.length,
      deckCount: p.deck.length,
      discard: p.discard,
      eliminated: p.eliminated,
    })),
    fighters: structuredClone(state.fighters),
    maneuver: structuredClone(state.maneuver),
    turn: state.turn,
    actions: state.actions,
    phase,
    revealed: state.revealed,
    hand: state.players.find((p) => p.id === viewer)?.hand ?? [],
    paused,
  };
}
export function projectOutcomes(outcomes: Outcome[], viewer: string): Outcome[] {
  return outcomes.filter((o) => o.audience === 'all' || o.audience === viewer);
}
