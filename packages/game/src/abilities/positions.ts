import type { Definitions, GameState, Fighter } from '../types';
import { fighterById } from '../fighters';
import { sharesZone } from '../targeting';
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

/** Placement uses physical adjacency and current occupancy, both at offer and application. */
export function canPlace(
  state: GameState,
  target: Fighter,
  defs: Definitions,
  destination: string,
  rule: {
    zone?: 'any' | 'shared';
    anchor?: string;
    range?: 'adjacent';
    allowDefeatedAnchor?: boolean;
    includeOrigin?: boolean;
  },
): boolean {
  if (
    !defs.map.nodes.includes(destination) ||
    (destination === target.position && !rule.includeOrigin && !rule.range) ||
    state.fighters.some((f) => f.id !== target.id && !f.defeated && f.position === destination)
  )
    return false;
  if (rule.zone === 'shared' && !sharesZone(defs.map, target.position, destination)) return false;
  if (!rule.range) return true;
  const anchor = fighterById(state, rule.anchor!);
  return (
    !!anchor &&
    (!anchor.defeated || !!rule.allowDefeatedAnchor) &&
    adjacent(defs.map, anchor.position, destination)
  );
}
