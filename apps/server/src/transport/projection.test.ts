import { expect, it } from 'vitest';
import { basic, deckDefinitions } from '../../../../tests/rules-fixture';
import { createGame, execute, type Command, type GameState } from '@open-boards/game';
import { projectGame, projectOutcomes } from './projection';

it('keeps hidden card hook names, hand choice identities and continuations private across nested prompts', () => {
  const defs = structuredClone(basic);
  defs.cards.strike.abilities = [
    {
      id: 'secret',
      name: 'Secret card ability',
      description: 'Choose an option before defense.',
      trigger: 'before-attack',
      effects: [
        {
          type: 'choose-option',
          prompt: 'Secret tactic',
          options: [
            { id: 'discard', label: 'Discard a card', effects: [{ type: 'discard', count: 1 }] },
          ],
        },
      ],
    },
  ];
  let state = createGame(
    ['a', 'b', 'c', 'd'].map((id) => ({
      id,
      name: id,
      character: 'vanguard',
      deck: deckDefinitions().map((definition, i) => ({ id: `${id}-${i}`, definition })),
    })),
    defs,
  );
  state.fighters[1].position = 'n1';
  function apply(actor: string, command: Command) {
    const result = execute(
      state,
      actor,
      { id: `step-${state.revision}`, revision: state.revision, command },
      defs,
    );
    if (!result.ok) throw new Error(result.message);
    state = result.state;
    return result.outcomes;
  }
  const secretCard = state.players[0].hand[0];
  const outcomes = apply('a', {
    type: 'attack',
    fighter: 'a:main',
    card: secretCard.id,
    target: 'b:main',
  });
  expect(projectOutcomes(outcomes, 'a')).toContainEqual(
    expect.objectContaining({ type: 'ability', name: 'Secret card ability' }),
  );
  for (const viewer of ['b', 'c', 'd']) {
    const view = projectGame(state, viewer, false);
    expect(view.choice).toBeNull();
    expect(JSON.stringify({ view, outcomes: projectOutcomes(outcomes, viewer) })).not.toMatch(
      /Secret|a-0|continuations|frames/,
    );
  }
  apply('a', { type: 'choose', choice: state.resolution.choice!.id, options: ['discard'] });
  const snapshot = JSON.parse(JSON.stringify(state)) as GameState;
  const own = projectGame(snapshot, 'a', false);
  expect(own.choice!.options.map((o) => o.id)).toEqual(state.players[0].hand.map((c) => c.id));
  expect(own.choice).not.toHaveProperty('continuations');
  for (const viewer of ['b', 'c', 'd'])
    expect(JSON.stringify(projectGame(snapshot, viewer, false))).not.toMatch(/a-[0-9]|Secret/);
  const discarded = state.players[0].hand[0].id;
  apply('a', { type: 'choose', choice: own.choice!.id, options: [discarded] });
  expect(state.phase.type).toBe('awaiting-defense');
  expect(projectGame(state, 'b', false).phase).not.toHaveProperty('committedCard');
  apply('b', { type: 'defend', card: null });
  expect(projectGame(state, 'c', false).revealed?.attack.id).toBe(secretCard.id);
});

it('projects typed choice objects and source only to the chooser after serialized recovery', () => {
  const state = createGame(
    ['a', 'b'].map((id) => ({
      id,
      name: id,
      character: 'vanguard',
      deck: deckDefinitions().map((definition, i) => ({ id: `${id}-${i}`, definition })),
    })),
    basic,
  );
  const secret = state.players[0].hand[0];
  state.phase = { type: 'ability-choice', player: 'a' };
  state.resolution.choice = {
    frame: 0,
    id: 'choice',
    player: 'a',
    prompt: 'Private ability',
    source: {
      fighter: 'a:main',
      card: secret,
      name: 'Private source',
      description: 'Private description',
    },
    options: [
      { id: 'opaque-fighter', label: 'Player', object: { type: 'fighter', id: 'b:main' } },
      { id: 'opaque-pile', label: 'Pile', object: { type: 'pile', player: 'a', zone: 'deck' } },
      { id: 'opaque-number', label: 'Zero', value: 0 },
      { id: 'opaque-pass', label: 'Pass', decline: true },
    ],
    min: 1,
    max: 1,
    continuations: {
      'opaque-pass': [
        { type: 'select-deck', player: 'a', group: 0, selected: 'private-definition' },
      ],
    },
  };
  const restored = JSON.parse(JSON.stringify(state)) as GameState;
  const own = projectGame(restored, 'a', false).choice!;
  expect(own.source?.card).toEqual(secret);
  expect(own.options).toEqual(state.resolution.choice.options);
  expect(own).not.toHaveProperty('continuations');
  const other = projectGame(restored, 'b', false);
  expect(other.choice).toBeNull();
  expect(JSON.stringify(other)).not.toMatch(/Private|opaque|private-definition|continuations/);
});
