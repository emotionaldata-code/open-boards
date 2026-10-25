import type { Definitions, GameState, Fighter } from '../types';
import { adjacent, reachablePaths } from '../movement';

function distances(from: string, defs: Definitions): Record<string, number> {
  const result: Record<string, number> = { [from]: 0 },
    queue = [from];
  for (const node of queue)
    for (const next of defs.map.nodes)
      if (result[next] === undefined && adjacent(defs.map, node, next)) {
        result[next] = result[node] + 1;
        queue.push(next);
      }
  return result;
}
export function validForcedPath(
  path: string[],
  target: Fighter,
  source: Fighter,
  defs: Definitions,
  mode: 'push' | 'pull',
): boolean {
  const from = distances(source.position!, defs);
  let previous = target.position!;
  for (const next of path) {
    if (
      !adjacent(defs.map, previous, next) ||
      from[next] === undefined ||
      !(mode === 'push' ? from[next] > from[previous] : from[next] < from[previous])
    )
      return false;
    previous = next;
  }
  return true;
}
export function forcedPaths(
  state: GameState,
  target: Fighter,
  source: Fighter,
  defs: Definitions,
  distance: number,
  mode: 'push' | 'pull',
): Record<string, string[]> {
  return Object.fromEntries(
    // Forced movement follows physical paths, without taking a portal shortcut.
    Object.entries(reachablePaths(state, target, { ...defs.map, portals: [] }, distance)).filter(
      ([, path]) => validForcedPath(path, target, source, defs, mode),
    ),
  );
}
