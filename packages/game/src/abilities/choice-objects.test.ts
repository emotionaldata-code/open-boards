import { expect, it } from 'vitest';
import { basic, deckDefinitions } from '../../../../tests/rules-fixture';
import { createGame, execute } from '../index';
import { prepareDefinitions } from './validation';
import { Runtime } from './runtime';
import { openChoice } from './choices';
import { emitter } from '../rules';

it('resolves authored target references into explicit fighter objects without changing continuations', () => {
  const defs = structuredClone(basic);
  defs.cards.strike.abilities = [
    {
      id: 'pick',
      name: 'Pick',
      description: 'Choose a fighter',
      trigger: 'before-attack',
      effects: [
        {
          type: 'choose-option',
          prompt: 'Move a fighter',
          options: [
            {
              id: 'opaque-a',
              label: 'Your fighter',
              target: 'self',
              effects: [{ type: 'move', distance: 1 }],
            },
            {
              id: 'opaque-b',
              label: 'Opponent',
              target: 'opponent',
              effects: [{ type: 'move', target: 'opponent', distance: 1 }],
            },
          ],
        },
      ],
    },
  ];
  prepareDefinitions(defs);
  let state = createGame(
    ['a', 'b'].map((id) => ({
      id,
      name: id,
      character: 'vanguard',
      deck: deckDefinitions().map((definition, i) => ({ id: `${id}-${i}`, definition })),
    })),
    defs,
  );
  state.fighters[1].position = 'n1';
  state.players[0].hand[0].definition = 'strike';
  const result = execute(
    state,
    'a',
    {
      id: 'play',
      revision: state.revision,
      command: {
        type: 'attack',
        target: 'b:main',
        fighter: 'a:main',
        card: state.players[0].hand[0].id,
      },
    },
    defs,
  );
  if (!result.ok) throw new Error(result.message);
  state = result.state;
  expect(state.resolution.choice?.source?.fighter).toBe('a:main');
  expect(state.resolution.choice?.options.map((o) => o.object)).toEqual([
    { type: 'fighter', id: 'a:main' },
    { type: 'fighter', id: 'b:main' },
  ]);
  const next = execute(
    state,
    'a',
    {
      id: 'choose',
      revision: state.revision,
      command: { type: 'choose', choice: state.resolution.choice!.id, options: ['opaque-b'] },
    },
    defs,
  );
  if (!next.ok) throw new Error(next.message);
  expect(
    next.state.resolution.choice?.options
      .filter((o) => !o.decline)
      .every((o) => o.object?.type === 'space'),
  ).toBe(true);
  expect(next.state.resolution.choice?.options.find((o) => o.decline)?.id).toBe('$stay');
});

it('copies only presentation metadata into options and preserves explicit numeric zero', () => {
  const state = createGame(
    ['a', 'b'].map((id) => ({
      id,
      name: id,
      character: 'vanguard',
      deck: deckDefinitions().map((definition, i) => ({ id: `${id}-${i}`, definition })),
    })),
    basic,
  );
  const runtime = new Runtime(state, basic, emitter(state, []));
  const frame = runtime.frame({ kind: 'turn', actor: 'a:main' });
  openChoice(runtime, frame, 'a', 'Choose', [
    { id: 'opaque', label: 'Zero', value: 0, decline: true, tasks: [{ type: 'begin-play' }] },
  ]);
  expect(state.resolution.choice?.options).toEqual([
    { id: 'opaque', label: 'Zero', value: 0, decline: true },
  ]);
  expect(state.resolution.choice?.continuations.opaque).toHaveLength(1);
});
