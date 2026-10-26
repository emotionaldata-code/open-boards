import { fighterById, type GameState, type Outcome } from '@open-boards/game';
import type { GameView } from '@open-boards/protocol';
export function projectGame(state: GameState, viewer: string, paused: boolean): GameView {
  const phase =
    state.phase.type === 'awaiting-defense'
      ? {
          type: 'awaiting-defense' as const,
          attacker: state.phase.attacker,
          defender: state.phase.defender,
          ...(state.phase.bonus ? { bonus: state.phase.bonus } : {}),
          ...(fighterById(state, state.phase.attacker)?.player === viewer
            ? { committedCard: state.phase.card }
            : {}),
        }
      : state.phase;
  const choice = state.resolution.choice;
  const combat =
    state.resolution.combat === null ? undefined : state.resolution.frames[state.resolution.combat];
  const publicDefense =
    combat?.kind === 'combat' &&
    !combat.revealed &&
    combat.defenseCard &&
    state.phase.type === 'ability-choice' &&
    // The face-up property was copied into the combat frame when defense was committed.
    combat.faceUpDefense
      ? combat.defenseCard
      : null;
  return {
    ...(choice?.public
      ? {
          observation: {
            prompt: choice.prompt,
            cards: choice.options.flatMap((o) => (o.card ? [o.card] : [])),
          },
        }
      : publicDefense
        ? {
            observation: {
              prompt: 'Face-up defense · predicting the attack value',
              cards: [publicDefense],
            },
          }
        : {}),
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
    movementLocks: [...(state.resolution.movementLocks ?? [])],
    revision: state.revision,
    sequence: state.sequence,
    players: state.players.map((p) => ({
      id: p.id,
      name: p.name,
      character: p.character,
      handCount: p.hand.length,
      deckCount: p.deck.length,
      discard: p.discard,
      ongoing: p.ongoing ?? [],
      eliminated: p.eliminated,
    })),
    fighters: structuredClone(state.fighters),
    boardTokens: structuredClone(state.boardTokens ?? []),
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
