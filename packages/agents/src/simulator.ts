import {
  createGame,
  execute,
  type Card,
  type Command,
  type Definitions,
  type GameState,
} from '@open-boards/game';
import { observe, pendingActor, type Agent } from './observation';
import { projectGame } from './projection';
import { createRandomAgent, seededRandom, shuffled } from './random';

export interface SimulationPlayer {
  id: string;
  name: string;
  character: string;
}
export interface Replay {
  seed: number;
  /** Definitions are part of the replay so content edits cannot silently change playback. */
  definitions: Definitions;
  setup: (SimulationPlayer & { deck: Card[] })[];
  commands: { actor: string; revision: number; id: string; command: Command }[];
}
export type SimulationResult = {
  state: GameState;
  replay: Replay;
  steps: number;
} & (
  | { status: 'finished'; winner: string | null }
  | {
      status: 'stopped';
      reason: 'step-limit' | 'aborted' | 'no-actor' | 'policy-error' | 'illegal-command';
      message?: string;
    }
);
export interface SimulationOptions {
  definitions: Definitions;
  players: SimulationPlayer[];
  seed: number;
  agents?: Record<string, Agent>;
  maxSteps?: number;
  signal?: AbortSignal;
}

/** Trusted offline policies only: use a worker/process for expensive or untrusted code. */
export async function simulate(options: SimulationOptions): Promise<SimulationResult> {
  const maxSteps = options.maxSteps ?? 10000;
  if (!Number.isInteger(maxSteps) || maxSteps < 0)
    throw new Error('maxSteps must be a nonnegative integer.');
  const definitions = structuredClone(options.definitions);
  const random = seededRandom(options.seed);
  const setup = options.players.map((player) => ({
    ...player,
    deck: shuffled(
      definitions.characters[player.character].deck.flatMap((entry) =>
        Array.from({ length: entry.count }, (_, index) => ({
          id: `${player.id}:${entry.card}:${index}`,
          definition: entry.card,
        })),
      ),
      random,
    ),
  }));
  const replay: Replay = {
    seed: options.seed,
    definitions,
    setup: structuredClone(setup),
    commands: [],
  };
  let state = createGame(setup, definitions, options.seed);
  const agents = Object.fromEntries(
    options.players.map((p, index) => [
      p.id,
      options.agents?.[p.id] ?? createRandomAgent(options.seed + index + 1),
    ]),
  );
  const stopped = (
    reason: Extract<SimulationResult, { status: 'stopped' }>['reason'],
    message?: string,
  ): SimulationResult => ({
    status: 'stopped',
    reason,
    ...(message ? { message } : {}),
    state,
    replay,
    steps: replay.commands.length,
  });
  for (let step = 0; step < maxSteps && state.phase.type !== 'finished'; step++) {
    if (options.signal?.aborted) return stopped('aborted');
    const actor = pendingActor(projectGame(state, null));
    if (!actor) return stopped('no-actor');
    let command: Command;
    try {
      command = await agents[actor].decide(observe(state, definitions, actor), options.signal);
    } catch (error) {
      return stopped(options.signal?.aborted ? 'aborted' : 'policy-error', String(error));
    }
    if (options.signal?.aborted) return stopped('aborted');
    const envelope = {
      id: `simulation-${step}`,
      revision: state.revision,
      command: structuredClone(command),
    };
    const result = execute(state, actor, envelope, definitions);
    if (!result.ok) return stopped('illegal-command', result.message);
    replay.commands.push({ actor, ...envelope });
    state = result.state;
  }
  return state.phase.type === 'finished'
    ? {
        status: 'finished',
        winner: state.phase.winner,
        state,
        replay,
        steps: replay.commands.length,
      }
    : stopped('step-limit');
}

export function replaySimulation(replay: Replay): GameState {
  let state = createGame(replay.setup, replay.definitions, replay.seed);
  for (const { actor, ...envelope } of replay.commands) {
    const result = execute(state, actor, envelope, replay.definitions);
    if (!result.ok)
      throw new Error(`Invalid replay at revision ${envelope.revision}: ${result.message}`);
    state = result.state;
  }
  return state;
}
