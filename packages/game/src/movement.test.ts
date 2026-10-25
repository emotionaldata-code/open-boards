import { expect, it } from 'vitest';
import { basic, deckDefinitions } from '../../../tests/rules-fixture';
import { createGame, execute } from './engine';
import { adjacent, reachablePaths, validPath } from './movement';
import { canAttack } from './targeting';
import { prepareDefinitions } from './abilities/validation';
import { forcedPaths, validForcedPath } from './abilities/positions';

function setup() {
  const character = Object.values(basic.characters).find((c) => c.movement >= 2)!.id;
  return createGame(
    ['a', 'b'].map((id) => ({
      id,
      name: id,
      character,
      deck: deckDefinitions(character).map((definition, i) => ({ id: `${id}-${i}`, definition })),
    })),
    basic,
  );
}
it('spends one point entering a portal, one teleporting, and one continuing on foot', () => {
  const state = setup(),
    player = state.fighters[0];
  const path = ['n1', 'n16', 'n17'];
  expect(validPath(state, player, path, basic.map, 3)).toBe(true);
  expect(validPath(state, player, path, basic.map, 2)).toBe(false);
  expect(reachablePaths(state, player, basic.map, 2).n16).toEqual(['n1', 'n16']);
  expect(validPath(state, player, ['n16'], basic.map, 2)).toBe(false);
  expect(validPath(state, player, ['n1', 'n16', 'n1'], basic.map, 3)).toBe(false);
});
it('allows every portal pair while rejecting occupied portals and traversal through them', () => {
  const state = setup(),
    [player, rival] = state.fighters;
  for (const from of basic.map.portals!) {
    player.position = from;
    for (const to of basic.map.portals!) {
      if (from === to) continue;
      expect(validPath(state, player, [to], basic.map, 1)).toBe(true);
    }
  }
  player.position = 'n1';
  rival.position = 'n16';
  expect(validPath(state, player, ['n16'], basic.map, 1)).toBe(false);
  expect(reachablePaths(state, player, basic.map, 2)).not.toHaveProperty('n16');
  expect(validPath(state, player, ['n16', 'n17'], basic.map, 2)).toBe(false);
  rival.defeated = true;
  expect(validPath(state, player, ['n16'], basic.map, 1)).toBe(true);
});
it('authorizes portal movement through the engine and emits the complete confirmed route', () => {
  const state = setup();
  const maneuver = execute(
    state,
    'a',
    { id: 'draw', revision: 0, command: { type: 'maneuver' } },
    basic,
  );
  if (!maneuver.ok) throw new Error(maneuver.message);
  const moved = execute(
    maneuver.state,
    'a',
    {
      id: 'portal',
      revision: maneuver.state.revision,
      command: { type: 'move', fighter: 'a:main', path: ['n1', 'n21'] },
    },
    basic,
  );
  if (!moved.ok) throw new Error(moved.message);
  expect(moved.state.fighters[0].position).toBe('n21');
  expect(moved.outcomes).toContainEqual(
    expect.objectContaining({ type: 'move', fighter: 'a:main', path: ['n0', 'n1', 'n21'] }),
  );
});
it('keeps portal connections out of attack adjacency and forced movement', () => {
  const state = setup(),
    [player, rival] = state.fighters;
  player.position = 'n1';
  rival.position = 'n21';
  expect(adjacent(basic.map, player.position, rival.position)).toBe(false);
  expect(canAttack(player, rival, basic)).toBe(false);
  player.character = Object.values(basic.characters).find((c) => c.attackType === 'ranged')!.id;
  expect(canAttack(player, rival, basic)).toBe(false);
  player.position = 'n0';
  rival.position = 'n1';
  expect(forcedPaths(state, rival, player, basic, 1, 'push')).not.toHaveProperty('n21');
  expect(validForcedPath(['n21'], rival, player, basic, 'push')).toBe(false);
});
it('validates portal references and retains compatibility with maps without portals', () => {
  const defs = structuredClone(basic);
  defs.map.portals = ['missing'];
  expect(() => prepareDefinitions(defs)).toThrow('invalid portals');
  defs.map.portals = ['n1', 'n1'];
  expect(() => prepareDefinitions(defs)).toThrow('invalid portals');
  delete defs.map.portals;
  expect(prepareDefinitions(defs).map.portals).toBeUndefined();
  const state = setup();
  state.fighters[0].position = 'n1';
  expect(validPath(state, state.fighters[0], ['n21'], defs.map, 1)).toBe(false);
});
