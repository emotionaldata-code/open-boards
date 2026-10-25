import type { GameState, Outcome, OutcomeData } from './types';
export type Emit = (data: OutcomeData, audience?: string) => void;
export function emitter(state: GameState, outcomes: Outcome[]): Emit {
  return (data, audience = 'all') => {
    outcomes.push({ ...data, audience, sequence: ++state.sequence, revision: state.revision });
  };
}
export function victory(state: GameState, emit: Emit): boolean {
  const alive = state.players.filter((p) => !p.eliminated);
  if (alive.length > 1) return false;
  const winner = alive[0]?.id ?? null;
  state.phase = { type: 'finished', winner };
  emit({ type: 'finished', winner });
  return true;
}
