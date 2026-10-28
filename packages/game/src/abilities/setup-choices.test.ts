import { describe, expect, it } from 'vitest';
import { basic, deckDefinitions } from '../../../../tests/rules-fixture';
import {
  createGame,
  execute,
  validateDefinitions,
  type Command,
  type Definitions,
  type GameState,
} from '../index';
import { projectGame } from '../../../../apps/server/src/transport/projection';

function fixture(edit: (defs: Definitions) => void) {
  const defs = structuredClone(basic);
  edit(defs);
  let state = createGame(
    ['a', 'b'].map((id) => ({
      id,
      name: id,
      character: 'vanguard',
      deck: deckDefinitions().map((definition, i) => ({ id: `${id}-${i}`, definition })),
    })),
    defs,
  );
  const run = (command: Command, actor = state.resolution.choice?.player ?? 'a') =>
    execute(state, actor, { id: `c-${state.revision}`, revision: state.revision, command }, defs);
  return {
    defs,
    get state() {
      return state;
    },
    run,
    choose(options: string[]) {
      state = JSON.parse(JSON.stringify(state)) as GameState;
      const result = run({ type: 'choose', choice: state.resolution.choice!.id, options });
      if (!result.ok) throw new Error(result.message);
      state = result.state;
    },
  };
}
const options = [
  { id: 'heal', label: 'Heal', effects: [{ type: 'heal' as const, amount: 1 }] },
  { id: 'draw', label: 'Draw', effects: [{ type: 'draw' as const, count: 1 }] },
  { id: 'move', label: 'Move', effects: [{ type: 'move' as const, distance: 1 }] },
];
describe('setup events and fixed-count choices', () => {
  it('runs setup once for each seat, before opening hands and the first turn hooks, preserving nested choices', () => {
    const h = fixture((defs) => {
      defs.characters.vanguard.abilities = [
        {
          id: 'setup',
          name: 'Setup',
          description: 'Choose effects.',
          trigger: 'game-start',
          effects: [{ type: 'choose-option', count: 2, prompt: 'Choose two', options }],
        },
        {
          id: 'start',
          name: 'First turn',
          description: 'Draw one.',
          trigger: 'turn-start',
          effects: [{ type: 'draw', count: 1 }],
        },
      ];
    });
    expect(h.state.resolution.choice).toMatchObject({ player: 'a', min: 2, max: 2 });
    expect(h.state.players[0].hand).toHaveLength(0);
    h.choose(['move', 'draw']);
    expect(h.state.resolution.choice!.prompt).toBe('Choose a destination');
    h.choose(['$stay']);
    expect(h.state.resolution.choice!.player).toBe('b');
    h.choose(['draw', 'heal']);
    expect(h.state.resolution.choice).toBeNull();
    expect(h.state.players.map((p) => p.hand.length)).toEqual([7, 6]);
    expect(h.state.actions).toBe(2);
    expect(h.state.turn).toBe(0);
  });
  it('rejects wrong counts, duplicates, forged options, stale choices and other owners atomically', () => {
    const h = fixture((defs) => {
      defs.characters.vanguard.abilities = [
        {
          id: 'setup',
          name: 'Setup',
          description: 'Two choices.',
          trigger: 'game-start',
          effects: [{ type: 'choose-option', count: 2, prompt: 'Two', options }],
        },
      ];
    });
    const before = structuredClone(h.state);
    const choice = h.state.resolution.choice!;
    for (const selected of [
      [],
      ['draw'],
      ['draw', 'draw'],
      ['draw', 'forged'],
      ['draw', 'heal', 'move'],
    ])
      expect(h.run({ type: 'choose', choice: choice.id, options: selected }).ok).toBe(false);
    expect(h.run({ type: 'choose', choice: choice.id, options: ['draw', 'heal'] }, 'b').ok).toBe(
      false,
    );
    expect(h.run({ type: 'choose', choice: 'expired', options: ['draw', 'heal'] }).ok).toBe(false);
    expect(h.state).toEqual(before);
    expect(projectGame(h.state, 'b', false).choice).toBeNull();
    expect(projectGame(h.state, 'spectator', false).choice).toBeNull();
    expect(JSON.stringify(projectGame(h.state, 'a', false))).not.toContain('continuations');
  });
  it('honors submitted execution order across suspended choices', () => {
    const h = fixture((defs) => {
      defs.characters.vanguard.abilities = [
        {
          id: 'setup',
          name: 'Setup',
          description: 'Two choices.',
          trigger: 'game-start',
          effects: [{ type: 'choose-option', count: 2, prompt: 'Two', options }],
        },
      ];
    });
    h.choose(['move', 'draw']);
    expect(h.state.players[0].hand).toHaveLength(0);
    h.choose(['$stay']);
    expect(h.state.players[0].hand).toHaveLength(1);
  });
  it('rejects impossible authored counts and unknown fighter roles', () => {
    const defs = structuredClone(basic);
    defs.cards.prepare.effects = [{ type: 'choose-option', count: 4, prompt: 'Invalid', options }];
    expect(() => validateDefinitions(defs)).toThrow('count exceeds');
    defs.cards.prepare.effects = [{ type: 'choose-option', count: 0, prompt: 'Invalid', options }];
    expect(() => validateDefinitions(defs)).toThrow();
    const invalid = structuredClone(basic) as unknown as {
      characters: Record<string, { abilities: unknown[] }>;
    };
    invalid.characters.vanguard.abilities = [
      {
        id: 'role',
        name: 'Role',
        description: 'Role',
        trigger: 'game-start',
        when: { type: 'fighter-role', role: 'unknown' },
        effects: [],
      },
    ];
    expect(() => validateDefinitions(invalid)).toThrow();
  });
  it.each(['main', 'ally'] as const)(
    'tests the referenced fighter role (%s) without rebinding self',
    (role) => {
      const h = fixture((defs) => {
        defs.characters.vanguard.abilities = [
          {
            id: 'role',
            name: 'Role',
            description: 'Draw for a matching role.',
            trigger: 'game-start',
            when: { type: 'fighter-role', target: 'self', role },
            effects: [{ type: 'draw', count: 1 }],
          },
        ];
      });
      expect(h.state.players.map((p) => p.hand.length)).toEqual(role === 'main' ? [6, 6] : [5, 5]);
    },
  );
});
