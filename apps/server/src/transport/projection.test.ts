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
