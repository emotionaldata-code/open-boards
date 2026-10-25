import { expect, it } from 'vitest';
import { adjacent, sharesZone } from '@open-boards/game';
import { basic, boardLayout, boardSize, deckDefinitions, zoneStyles } from './index';

it('provides a connected, colored graph with valid distinct spawns and a separate horizontal layout', () => {
  const { map } = basic;
  expect(map.id).toBe('king-solomons-mine');
  expect(map.nodes).toHaveLength(29);
  expect(map.edges).toHaveLength(42);
  expect(Object.keys(zoneStyles)).toHaveLength(7);
  expect(Object.keys(boardLayout).sort()).toEqual([...map.nodes].sort());
  expect(new Set(map.nodes).size).toBe(map.nodes.length);
  const reached = new Set([map.nodes[0]]);
  for (let i = 0; i < map.nodes.length; i++) {
    for (const [a, b] of map.edges) {
      expect(map.nodes).toContain(a);
      expect(map.nodes).toContain(b);
      expect(a).not.toBe(b);
      if (reached.has(a) || reached.has(b)) {
        reached.add(a);
        reached.add(b);
      }
    }
  }
  expect(new Set(map.edges.map(([a, b]) => [a, b].sort().join(':'))).size).toBe(map.edges.length);
  expect(reached.size).toBe(map.nodes.length);
  for (const node of map.nodes) {
    expect(map.zones[node].length).toBeGreaterThan(0);
    for (const zone of map.zones[node]) expect(zoneStyles[zone]).toBeDefined();
    expect(boardLayout[node].x).toBeGreaterThan(0);
    expect(boardLayout[node].x).toBeLessThan(boardSize.width);
    expect(boardLayout[node].y).toBeGreaterThan(0);
    expect(boardLayout[node].y).toBeLessThan(boardSize.height);
  }
  for (const [size, spawns] of Object.entries(map.spawns)) {
    expect(new Set(spawns).size).toBe(Number(size));
    expect(spawns.every((node) => map.nodes.includes(node))).toBe(true);
  }
  expect(boardSize.width).toBeGreaterThan(boardSize.height * 2);
  expect(JSON.parse(JSON.stringify(basic))).toEqual(basic);
  expect(deckDefinitions()).toEqual(deckDefinitions('medusa'));
});

it('preserves the printed starts, six passages and multicolor spaces', () => {
  const { map } = basic;
  expect(map.spawns[2]).toEqual(['n0', 'n13']);
  expect(map.zones.n0).toEqual(['brown']);
  expect(map.zones.n13).toEqual(['gray', 'yellow']);
  expect(map.portals).toEqual(['n7', 'n6', 'n16', 'n1', 'n21', 'n5']);
  expect([...map.zones.n4].sort()).toEqual(['gold', 'red', 'yellow']);
  expect([...map.zones.n12].sort()).toEqual(['blue', 'brown', 'red']);
  expect(map.zones.center).toEqual(['blue', 'red']);
});

it('keeps the well entrances, bridges and passages distinct from adjacency', () => {
  const { map } = basic;
  const neighbors = (node: string) => map.nodes.filter((other) => adjacent(map, node, other));
  expect(neighbors('center')).toEqual(['n11', 'n27']);
  expect(neighbors('n7')).toEqual(['n6']);
  expect(neighbors('n16')).toEqual(['n14', 'n15', 'n17']);
  expect(neighbors('n21')).toEqual(['n22', 'n23']);
  expect(adjacent(map, 'n20', 'n22')).toBe(true);
  expect(adjacent(map, 'n9', 'n11')).toBe(true);
  expect(adjacent(map, 'n7', 'n16')).toBe(false);
  expect(adjacent(map, 'n1', 'n16')).toBe(false);
  // Gray and blue each span a chasm without a direct path across it.
  expect(sharesZone(map, 'n17', 'n22')).toBe(true);
  expect(adjacent(map, 'n17', 'n22')).toBe(false);
  expect(sharesZone(map, 'n10', 'n21')).toBe(true);
  expect(adjacent(map, 'n10', 'n21')).toBe(false);
});

it('connects the lower right chamber to the upper right only by its bridge on foot', () => {
  const { map } = basic;
  const reached = new Set(['n21']);
  const edges = map.edges.filter(([a, b]) => !(a === 'n20' && b === 'n22'));
  for (let i = 0; i < map.nodes.length; i++) {
    for (const [a, b] of edges) {
      if (reached.has(a) || reached.has(b)) {
        reached.add(a);
        reached.add(b);
      }
    }
  }
  expect([...reached].sort()).toEqual(['n21', 'n22', 'n23', 'n24']);
  expect(map.portals).toContain('n21');
});
