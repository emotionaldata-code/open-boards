import { describe, expect, it } from 'vitest';
import { basic, deckDefinitions } from '../../../tests/rules-fixture';
import { createGame, execute } from './engine';
import { canAttack, sharesZone } from './targeting';
import type { Command, Definitions, GameState } from './types';

function setup(character = 'ranger', defs: Definitions = basic) {
  return createGame(
    ['a', 'b', 'c', 'd'].map((id, i) => ({
      id,
      name: id,
      character: i === 0 ? character : 'vanguard',
      deck: deckDefinitions().map((definition, index) => ({ id: `${id}-${index}`, definition })),
    })),
    defs,
  );
}
function run(state: GameState, actor: string, command: Command, defs = basic) {
  return execute(
    state,
    actor,
    { id: `test-${state.revision}`, revision: state.revision, command },
    defs,
  );
}

describe('character attack ranges', () => {
  it('keeps melee adjacent and lets ranged characters share a distant zone through occupied spaces', () => {
    const state = setup();
    state.fighters[1].position = 'n11';
    state.fighters[2].position = 'n9'; // Blocks the two-edge movement path, not range.
    const [a, b] = state.fighters;
    expect(canAttack(a, b, basic)).toBe(true);
    a.character = 'vanguard';
    expect(canAttack(a, b, basic)).toBe(false);
    b.position = 'n1';
    expect(canAttack(a, b, basic)).toBe(true);
  });
  it('uses every color on attacker and defender spaces without transitive zone chaining', () => {
    const state = setup();
    const [a, b] = state.fighters;
    a.position = 'n12';
    for (const position of ['n0', 'n26', 'n16']) {
      b.position = position;
      expect(canAttack(a, b, basic)).toBe(true);
    }
    a.position = 'n16';
    b.position = 'n12';
    expect(canAttack(a, b, basic)).toBe(true);
    a.position = 'n0';
    b.position = 'n13';
    expect(sharesZone(basic.map, a.position, b.position)).toBe(false);
    expect(canAttack(a, b, basic)).toBe(false); // Multicolor spaces don't link Brown to Yellow.
  });
  it('allows adjacent ranged attacks across different colors and rejects self or eliminated targets', () => {
    const state = setup();
    const [a, b] = state.fighters;
    a.position = 'n16';
    b.position = 'n17';
    expect(sharesZone(basic.map, a.position, b.position)).toBe(false);
    expect(canAttack(a, b, basic)).toBe(true);
    expect(canAttack(a, a, basic)).toBe(false);
    b.defeated = true;
    expect(canAttack(a, b, basic)).toBe(false);
    b.defeated = false;
    a.defeated = true;
    expect(canAttack(a, b, basic)).toBe(false);
  });
  it('authorizes ranged combat through the engine and preserves free defense and hidden commitment', () => {
    const state = setup();
    state.fighters[1].position = 'n11';
    const attacked = run(state, 'a', {
      type: 'attack',
      fighter: 'a:main',
      card: state.players[0].hand[0].id,
      target: 'b:main',
    });
    expect(attacked.ok).toBe(true);
    if (!attacked.ok) return;
    expect(attacked.state.revealed).toBeNull();
    expect(attacked.state.actions).toBe(1);
    const defended = run(attacked.state, 'b', { type: 'defend', card: null });
    expect(defended.ok).toBe(true);
    if (!defended.ok) return;
    expect(defended.state.fighters[1].hp).toBe(11);
    expect(defended.state.actions).toBe(1);
    expect(defended.state.players[0].discard).toHaveLength(1);
  });
  it.each(['vanguard', 'ranger'])(
    'rejects an out-of-range %s attack without mutation',
    (character) => {
      const state = setup(character);
      state.fighters[1].position = 'n13';
      const before = structuredClone(state);
      expect(
        run(state, 'a', {
          type: 'attack',
          fighter: 'a:main',
          card: state.players[0].hand[0].id,
          target: 'b:main',
        }).ok,
      ).toBe(false);
      expect(state).toEqual(before);
    },
  );
  it('takes per-player stats and movement from supplied definitions, with no character-specific branch', () => {
    const defs = structuredClone(basic);
    defs.characters.ranger.hp = 12;
    defs.characters.ranger.movement = 1;
    const state = setup('ranger', defs);
    expect(state.fighters[0].hp).toBe(12);
    expect(state.fighters[1].hp).toBe(15);
    const moving = run(state, 'a', { type: 'maneuver' }, defs);
    if (!moving.ok) throw new Error(moving.message);
    expect(
      run(moving.state, 'a', { type: 'move', fighter: 'a:main', path: ['n1', 'n2'] }, defs).ok,
    ).toBe(false);
    expect(run(moving.state, 'a', { type: 'move', fighter: 'a:main', path: ['n1'] }, defs).ok).toBe(
      true,
    );
    expect(() => setup('unknown', defs)).toThrow('supported character');
  });
});
