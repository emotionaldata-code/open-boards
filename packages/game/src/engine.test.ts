import { finishActions } from '../../../tests/finish-actions';
import { describe, it, expect } from 'vitest';
import { basic, deckDefinitions } from '../../../tests/rules-fixture';
import { createGame, execute, forfeit } from './engine';
import { reachablePaths } from './movement';
import type { Card, Command, GameState } from './types';
const deck = (prefix: string): Card[] =>
  deckDefinitions().map((definition, i) => ({ id: `${prefix}-${i}`, definition }));
function setup(count: 2 | 4 = 2) {
  return createGame(
    Array.from({ length: count }, (_, i) => ({
      id: `p${i}`,
      name: `Player ${i}`,
      character: 'vanguard',
      deck: deck(`p${i}`),
    })),
    basic,
  );
}
let sequence = 0;
function apply(state: GameState, actor: string, command: Command): GameState {
  const result = execute(
    state,
    actor,
    { id: `command-${++sequence}`, revision: state.revision, command },
    basic,
  );
  if (!result.ok) throw new Error(result.message);
  return result.state;
}
function hand(state: GameState, player: number, definitions: string[]) {
  state.players[player].hand = definitions.map((definition, i) => ({
    id: `custom-${player}-${i}`,
    definition,
  }));
}
function invalid(state: GameState, actor: string, command: Command) {
  const copy = structuredClone(state);
  expect(
    execute(state, actor, { id: `invalid-${++sequence}`, revision: state.revision, command }, basic)
      .ok,
  ).toBe(false);
  expect(state).toEqual(copy);
}

describe('authoritative rules', () => {
  it('creates identical stats, five-card hands, fixed seat order and separate spawns', () => {
    const state = setup(4);
    expect(state.fighters.map((p) => p.position)).toEqual(['n0', 'n13', 'n4', 'n24']);
    expect(
      state.fighters.every((f) => f.hp === 15) &&
        state.players.every((p) => p.hand.length === 5 && p.deck.length === 15),
    ).toBe(true);
    expect(state.actions).toBe(2);
  });
  it('spends exactly two actions, requires movement choice and does not draw at turn start', () => {
    let s = setup();
    s = apply(s, 'p0', { type: 'maneuver' });
    expect(s.actions).toBe(1);
    expect(s.players[0].hand).toHaveLength(6);
    invalid(s, 'p0', { type: 'maneuver' });
    s = apply(s, 'p0', { type: 'move', fighter: 'p0:main', path: [] });
    s = apply(s, 'p0', { type: 'maneuver' });
    expect(s.actions).toBe(0);
    s = apply(s, 'p0', { type: 'move', fighter: 'p0:main', path: [] });
    expect(s.turn).toBe(1);
    expect(s.players[1].hand).toHaveLength(5);
    expect(s.actions).toBe(2);
  });
  it.each(['end-turn', 'unknown-command'])(
    'rejects the public %s command without mutation',
    (type) => {
      const state = setup();
      invalid(state, 'p0', { type } as Command);
    },
  );
  it('cannot skip its remaining action after finishing a Maneuver', () => {
    let s = setup();
    s = apply(s, 'p0', { type: 'maneuver' });
    s = apply(s, 'p0', { type: 'finish-maneuver' });
    expect(s.turn).toBe(0);
    expect(s.actions).toBe(1);
    invalid(s, 'p0', { type: 'end-turn' } as unknown as Command);
    s = apply(s, 'p0', { type: 'maneuver' });
    expect(s.turn).toBe(0);
    expect(s.actions).toBe(0);
    expect(s.phase.type).toBe('choosing-movement');
    s = apply(s, 'p0', { type: 'finish-maneuver' });
    expect(s.turn).toBe(1);
  });
  it.each([0, 1, 2])('draw-two damages only for missing cards with %i available', (available) => {
    let s = setup();
    s.players[0].deck = s.players[0].deck.slice(0, available);
    hand(s, 0, ['prepare']);
    s = apply(s, 'p0', { type: 'play-action', fighter: 'p0:main', card: s.players[0].hand[0].id });
    expect(s.fighters[0].hp).toBe(15 - (2 - available) * 2);
    expect(s.players[0].hand).toHaveLength(available);
    expect(s.players[0].deck).toEqual([]);
  });
  it('drawing the final card is safe and both later empty-deck Maneuvers cause damage', () => {
    let s = setup();
    s.players[0].deck = s.players[0].deck.slice(0, 1);
    s = apply(s, 'p0', { type: 'maneuver' });
    expect(s.fighters[0].hp).toBe(15);
    s = apply(s, 'p0', { type: 'finish-maneuver' });
    s = apply(s, 'p0', { type: 'maneuver' });
    expect(s.fighters[0].hp).toBe(13);
    s = apply(s, 'p0', { type: 'finish-maneuver' });
    s = finishActions(s, basic, 'p1').state;
    s = finishActions(s, basic, 'p0').state;
    expect(s.fighters[0].hp).toBe(9);
  });
  it('validates graph edges, distance, occupied destinations and occupied traversal', () => {
    let s = setup();
    s.fighters[1].position = 'n1';
    s = apply(s, 'p0', { type: 'maneuver' });
    for (const path of [['n1'], ['n1', 'n2'], ['n3'], ['n5', 'n9', 'n10'], ['n5', 'n0']])
      invalid(s, 'p0', { type: 'move', fighter: 'p0:main', path });
    expect(reachablePaths(s, s.fighters[0], basic.map, 2)).not.toHaveProperty('n1');
    s = apply(s, 'p0', { type: 'move', fighter: 'p0:main', path: ['n5', 'n9'] });
    expect(s.fighters[0].position).toBe('n9');
  });
  it('offers shortest movement paths when a junction also has longer detours', () => {
    let s = setup();
    s.fighters[0].position = 'n15';
    const paths = reachablePaths(s, s.fighters[0], basic.map, 2);
    expect(paths.n14).toEqual(['n14']);
    expect(paths.n4).toEqual(['n8', 'n4']);
    s = apply(s, 'p0', { type: 'maneuver' });
    s = apply(s, 'p0', { type: 'move', fighter: 'p0:main', path: paths.n4 });
    expect(s.fighters[0].position).toBe('n4');
  });
  it('commits an attack, resolves free defense, reveals both and consumes cards once', () => {
    let s = setup();
    s.fighters[1].position = 'n1';
    hand(s, 1, ['guard']);
    s = apply(s, 'p0', {
      type: 'attack',
      fighter: 'p0:main',
      card: s.players[0].hand[0].id,
      target: 'p1:main',
    });
    expect(s.phase.type).toBe('awaiting-defense');
    expect(s.revealed).toBeNull();
    expect(s.players[0].discard).toHaveLength(0);
    expect(s.players[0].hand).toHaveLength(4);
    invalid(s, 'p0', { type: 'maneuver' });
    s = apply(s, 'p1', { type: 'defend', card: s.players[1].hand[0].id });
    expect(s.fighters[1].hp).toBe(14);
    expect(s.actions).toBe(1);
    expect(s.turn).toBe(0);
    expect(s.players[0].discard).toHaveLength(1);
    expect(s.players[1].discard).toHaveLength(1);
    expect(s.revealed?.damage).toBe(1);
  });
  it('allows versatile attack and defense, and declining defense', () => {
    let s = setup();
    s.fighters[1].position = 'n1';
    hand(s, 0, ['adapt', 'strike']);
    hand(s, 1, ['adapt']);
    s = apply(s, 'p0', {
      type: 'attack',
      fighter: 'p0:main',
      card: s.players[0].hand[0].id,
      target: 'p1:main',
    });
    s = apply(s, 'p1', { type: 'defend', card: s.players[1].hand[0].id });
    expect(s.fighters[1].hp).toBe(15);
    s = apply(s, 'p0', {
      type: 'attack',
      fighter: 'p0:main',
      card: s.players[0].hand[0].id,
      target: 'p1:main',
    });
    s = apply(s, 'p1', { type: 'defend', card: null });
    expect(s.fighters[1].hp).toBe(11);
    expect(s.turn).toBe(1);
  });
  it('plays draw-two, discards the action, and enforces exactly seven at turn end', () => {
    let s = setup();
    hand(s, 0, ['prepare', 'prepare', 'guard', 'guard', 'guard', 'guard', 'guard']);
    s = apply(s, 'p0', { type: 'play-action', fighter: 'p0:main', card: s.players[0].hand[0].id });
    expect(s.players[0].hand).toHaveLength(8);
    expect(s.players[0].discard[0].definition).toBe('prepare');
    s = apply(s, 'p0', { type: 'maneuver' });
    s = apply(s, 'p0', { type: 'finish-maneuver' });
    expect(s.phase.type).toBe('discarding');
    invalid(s, 'p0', { type: 'maneuver' });
    invalid(s, 'p0', { type: 'discard', cards: [] });
    invalid(s, 'p0', {
      type: 'discard',
      cards: [s.players[0].hand[0].id, s.players[0].hand[0].id],
    });
    s = apply(s, 'p0', { type: 'discard', cards: s.players[0].hand.slice(0, 2).map((c) => c.id) });
    expect(s.players[0].hand).toHaveLength(7);
    expect(s.turn).toBe(1);
  });
  it('deals two damage for each missing draw without reshuffling', () => {
    let s = setup();
    s.players[0].deck = [];
    hand(s, 0, ['prepare']);
    s = apply(s, 'p0', { type: 'play-action', fighter: 'p0:main', card: s.players[0].hand[0].id });
    expect(s.fighters[0].hp).toBe(11);
    expect(s.players[0].deck).toHaveLength(0);
    expect(s.players[0].discard).toHaveLength(1);
    s = apply(s, 'p0', { type: 'maneuver' });
    expect(s.fighters[0].hp).toBe(9);
  });
  it('eliminates immediately on exhaustion, cancels movement and skips dead turns', () => {
    let s = setup(4);
    s.fighters[0].hp = 2;
    s.players[0].deck = [];
    s = apply(s, 'p0', { type: 'maneuver' });
    expect(s.players[0].eliminated).toBe(true);
    expect(s.turn).toBe(1);
    expect(s.phase.type).toBe('taking-actions');
    s = finishActions(s, basic, 'p1').state;
    s = finishActions(s, basic, 'p2').state;
    s = finishActions(s, basic, 'p3').state;
    expect(s.turn).toBe(1);
  });
  it('finishes on lethal combat or exhaustion and supports zero-survivor draws', () => {
    let s = setup();
    s.fighters[1].position = 'n1';
    s.fighters[1].hp = 4;
    s = apply(s, 'p0', {
      type: 'attack',
      fighter: 'p0:main',
      card: s.players[0].hand[0].id,
      target: 'p1:main',
    });
    s = apply(s, 'p1', { type: 'defend', card: null });
    expect(s.phase).toEqual({ type: 'finished', winner: 'p0' });
    invalid(s, 'p0', { type: 'maneuver' });
    s = setup();
    s.fighters[0].hp = 2;
    s.players[0].deck = [];
    s = apply(s, 'p0', { type: 'maneuver' });
    expect(s.phase).toEqual({ type: 'finished', winner: 'p1' });
    s = setup();
    s.players[1].eliminated = true;
    s.fighters[1].hp = 0;
    expect(forfeit(s, 'p0', basic).state.phase).toEqual({ type: 'finished', winner: null });
  });
  it('rejects actors, wrong ownership, wrong categories and invalid targets without mutation', () => {
    const s = setup();
    hand(s, 0, ['guard', 'prepare', 'strike']);
    for (const [actor, command] of [
      ['intruder', { type: 'maneuver' }],
      ['p1', { type: 'maneuver' }],
      [
        'p0',
        { type: 'attack', fighter: 'p0:main', card: s.players[0].hand[0].id, target: 'p0:main' },
      ],
      ['p0', { type: 'play-action', fighter: 'p0:main', card: s.players[0].hand[0].id }],
      ['p0', { type: 'play-action', fighter: 'p0:main', card: 'foreign' }],
      [
        'p0',
        { type: 'attack', fighter: 'p0:main', card: s.players[0].hand[2].id, target: 'p1:main' },
      ],
    ] as [string, Command][])
      invalid(s, actor, command);
    s.fighters[1].position = 'n1';
    invalid(s, 'p0', {
      type: 'attack',
      fighter: 'p0:main',
      card: s.players[0].hand[0].id,
      target: 'p1:main',
    });
    invalid(s, 'p0', {
      type: 'attack',
      fighter: 'p0:main',
      card: s.players[0].hand[1].id,
      target: 'p1:main',
    });
  });
  it('rejects stale and duplicate command execution', () => {
    const state = setup();
    const command = { id: 'id', revision: 0, command: { type: 'maneuver' } as const };
    const result = execute(state, 'p0', command, basic);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(execute(result.state, 'p0', command, basic)).toMatchObject({
      ok: false,
      error: 'DUPLICATE',
    });
    expect(execute(result.state, 'p0', { ...command, id: 'different' }, basic)).toMatchObject({
      ok: false,
      error: 'STALE',
    });
  });
  it('does not let a defender use attack or action cards', () => {
    let s = setup();
    s.fighters[1].position = 'n1';
    hand(s, 1, ['strike', 'prepare']);
    s = apply(s, 'p0', {
      type: 'attack',
      fighter: 'p0:main',
      card: s.players[0].hand[0].id,
      target: 'p1:main',
    });
    for (const c of s.players[1].hand) invalid(s, 'p1', { type: 'defend', card: c.id });
    invalid(s, 'p0', { type: 'defend', card: null });
  });
});
