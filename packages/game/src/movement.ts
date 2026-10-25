import type { Fighter, GameState, MapDefinition } from './types';
export function adjacent(map: MapDefinition, a: string | null, b: string | null): boolean {
  return (
    a !== null &&
    b !== null &&
    map.edges.some(([x, y]) => (x === a && y === b) || (x === b && y === a))
  );
}
export function portalStep(map: MapDefinition, from: string, to: string): boolean {
  return from !== to && !!map.portals?.includes(from) && map.portals.includes(to);
}
type BoardState = Pick<GameState, 'fighters'>;
export function emptyEndpoint(state: BoardState, node: string): boolean {
  return !state.fighters.some((f) => !f.defeated && f.position === node);
}
/** Traversal is separate from stopping: friendly pieces can be crossed. */
export function traversablePath(
  state: BoardState,
  fighter: Fighter,
  path: string[],
  map: MapDefinition,
  distance: number,
  throughEnemies = false,
): boolean {
  if (
    fighter.defeated ||
    fighter.position === null ||
    path.length > distance ||
    new Set(path).size !== path.length ||
    path.includes(fighter.position)
  )
    return false;
  let previous = fighter.position;
  for (const node of path) {
    if (
      !map.nodes.includes(node) ||
      !(adjacent(map, previous, node) || portalStep(map, previous, node)) ||
      (!throughEnemies &&
        state.fighters.some(
          (f) => !f.defeated && f.player !== fighter.player && f.position === node,
        ))
    )
      return false;
    previous = node;
  }
  return true;
}
export function validPath(
  state: BoardState,
  fighter: Fighter,
  path: string[],
  map: MapDefinition,
  distance: number,
  throughEnemies = false,
): boolean {
  return (
    traversablePath(state, fighter, path, map, distance, throughEnemies) &&
    (!path.length || emptyEndpoint(state, path.at(-1)!))
  );
}
export function reachablePaths(
  state: BoardState,
  fighter: Fighter,
  map: MapDefinition,
  distance: number,
  throughEnemies = false,
): Record<string, string[]> {
  const found: Record<string, string[]> = {};
  const visited = new Set<string>();
  const queue: string[][] = [[]];
  for (const path of queue) {
    if (path.length >= distance) continue;
    for (const node of map.nodes) {
      const next = [...path, node];
      if (
        !visited.has(node) &&
        traversablePath(state, fighter, next, map, distance, throughEnemies)
      ) {
        visited.add(node);
        queue.push(next);
        if (emptyEndpoint(state, node)) found[node] = next;
      }
    }
  }
  return found;
}
