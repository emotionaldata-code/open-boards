import { describe, expect, it } from 'vitest';
import { basic } from '@open-boards/content';
import {
  BotDriver,
  createRandomAgent,
  observe,
  projectGame,
  projectOutcomes,
  replaySimulation,
  simulate,
} from './index';
import type { Command } from '@open-boards/game';

const roster = Object.keys(basic.characters);
const players = (a = roster[0], b = roster[1]) => [
  { id: 'a', name: 'A', character: a },
  { id: 'b', name: 'B', character: b },
];

it('reproduces seeded games including shuffled decks and engine effects', async () => {
  const options = { definitions: basic, players: players(), seed: 42 };
  const first = await simulate(options);
  const second = await simulate(options);
  expect(first.status).toBe('finished');
  expect(first).toEqual(second);
  expect(replaySimulation(first.replay)).toEqual(first.state);
  expect((await simulate({ ...options, seed: 43 })).replay.setup).not.toEqual(first.replay.setup);
});

it('reports step limits without pretending a game finished', async () => {
  const result = await simulate({ definitions: basic, players: players(), seed: 1, maxSteps: 0 });
  expect(result).toMatchObject({ status: 'stopped', reason: 'step-limit', steps: 0 });
});

it('detaches observations, definitions and outcomes and hides opponents private zones', async () => {
  const { state } = await simulate({
    definitions: basic,
    players: players(),
    seed: 1,
    maxSteps: 0,
  });
  const original = structuredClone(state);
  const observation = observe(state, basic, 'a');
  expect(observation.game.hand).toEqual(state.players[0].hand);
  expect(projectGame(state, null).hand).toEqual([]);
  expect(observation.game.players[1]).not.toHaveProperty('hand');
  expect(observation.game.players[1]).not.toHaveProperty('deck');
  observation.game.players[0].discard.push({ id: 'fake', definition: 'fake' });
  observation.game.hand.length = 0;
  observation.game.phase.type = 'taking-actions';
  observation.definitions.map.nodes.length = 0;
  expect(state).toEqual(original);
  expect(basic.map.nodes.length).toBeGreaterThan(0);
  const outcomes = [
    {
      type: 'draw' as const,
      player: 'a',
      cards: [{ id: 'private', definition: 'x' }],
      audience: 'a',
      sequence: 1,
      revision: 1,
    },
  ];
  expect(projectOutcomes(outcomes, null)).toEqual([]);
  projectOutcomes(outcomes, 'a')[0].revision = 9;
  expect(outcomes[0].revision).toBe(1);
});

describe('roster self play', () => {
  for (let i = 0; i < roster.length; i += 2) {
    const a = roster[i],
      b = roster[(i + 1) % roster.length];
    it(`${a} vs ${b} completes real engine decisions`, async () => {
      const result = await simulate({ definitions: basic, players: players(a, b), seed: 123 + i });
      expect(
        result.status,
        JSON.stringify(
          result.status === 'stopped'
            ? { reason: result.reason, message: result.message, phase: result.state.phase }
            : {},
        ),
      ).toBe('finished');
    });
  }
});

it('ignores obsolete async decisions and stops without retries', async () => {
  const { state } = await simulate({
    definitions: basic,
    players: players(),
    seed: 1,
    maxSteps: 0,
  });
  let observation = observe(
    state,
    basic,
    state.phase.type === 'placing-allies' || state.phase.type === 'ability-choice'
      ? state.phase.player
      : 'a',
  );
  let resolve: (command: Command) => void = () => {};
  let calls = 0;
  const submitted: Command[] = [];
  const driver = new BotDriver({
    agent: {
      decide: () => {
        calls++;
        return new Promise((r) => {
          resolve = r;
        });
      },
    },
    observe: () => observation,
    submit: (command) => {
      submitted.push(command);
    },
  });
  driver.update();
  driver.update();
  await Promise.resolve();
  const command = await createRandomAgent().decide(observation);
  observation = { ...observation, game: { ...observation.game, revision: 1 } };
  resolve(command);
  await Promise.resolve();
  await Promise.resolve();
  expect(submitted).toEqual([]);
  expect(calls).toBe(1);
  driver.update();
  driver.stop();
  await Promise.resolve();
  expect(calls).toBe(1);
});

it('does not retry a failing policy on an unchanged snapshot', async () => {
  const { state } = await simulate({
    definitions: basic,
    players: players(),
    seed: 7,
    maxSteps: 0,
  });
  const actor =
    state.phase.type === 'placing-allies' || state.phase.type === 'ability-choice'
      ? state.phase.player
      : 'a';
  const observation = observe(state, basic, actor);
  let calls = 0;
  const errors: unknown[] = [];
  const driver = new BotDriver({
    agent: {
      decide: () => {
        calls++;
        throw new Error('Policy failed');
      },
    },
    observe: () => observation,
    submit: () => {
      throw new Error('Must not submit');
    },
    onError: (error) => {
      errors.push(error);
    },
  });
  driver.update();
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  driver.update();
  await Promise.resolve();
  expect(calls).toBe(1);
  expect(errors).toHaveLength(1);
  driver.stop();
});
