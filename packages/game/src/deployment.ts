import type { GameState, MapDefinition } from './types';
import { mainFighter } from './fighters';
import { emptyEndpoint } from './movement';
import { sharesZone } from './targeting';

/** Bipartite matching also handles intersecting starting zones without greedy dead ends. */
export function canDeploy(
  state: Pick<GameState, 'fighters' | 'boardTokens'>,
  map: MapDefinition,
  placement?: { fighter: string; position: string },
): boolean {
  const occupied = new Set(
    state.fighters.filter((f) => !f.defeated && f.position !== null).map((f) => f.position),
  );
  if (placement) occupied.add(placement.position);
  const pending = state.fighters.filter(
    (f) => !f.defeated && f.position === null && f.id !== placement?.fighter,
  );
  const assigned = new Map<string, string>();
  const candidates = new Map(
    pending.map((f) => [
      f.id,
      map.nodes.filter(
        (n) => !occupied.has(n) && sharesZone(map, mainFighter(state, f.player).position, n),
      ),
    ]),
  );
  function assign(id: string, seen: Set<string>): boolean {
    for (const node of candidates.get(id) ?? []) {
      if (seen.has(node)) continue;
      seen.add(node);
      const other = assigned.get(node);
      if (!other || assign(other, seen)) {
        assigned.set(node, id);
        return true;
      }
    }
    return false;
  }
  if (!pending.every((f) => assign(f.id, new Set()))) return false;
  // Tokens do not occupy spaces during play. At setup each owner's tokens need
  // distinct empty starting spaces; reserve those slots alongside pending allies.
  const owners = new Set(
    (state.boardTokens ?? []).filter((t) => t.position === null).map((t) => t.owner),
  );
  for (const owner of owners) {
    const fighter = state.fighters.find((f) => f.id === owner);
    if (!fighter || fighter.defeated) continue;
    const tokens = state.boardTokens!.filter((t) => t.owner === owner && t.position === null);
    const spaces = map.nodes.filter(
      (n) => !occupied.has(n) && sharesZone(map, fighter.position, n),
    );
    for (const token of tokens) candidates.set(token.id, spaces);
    assigned.clear();
    const possible = [...pending, ...tokens].every((f) => assign(f.id, new Set()));
    for (const token of tokens) candidates.delete(token.id);
    if (!possible) return false;
  }
  const exclusive = (state.boardTokens ?? []).filter(
    (t) =>
      t.exclusive && t.position === null && !state.fighters.find((f) => f.id === t.owner)?.defeated,
  );
  for (const token of exclusive) {
    const owner = state.fighters.find((f) => f.id === token.owner)!;
    candidates.set(
      token.id,
      map.nodes.filter((n) => !occupied.has(n) && sharesZone(map, owner.position, n)),
    );
  }
  assigned.clear();
  return [...pending, ...exclusive].every((f) => assign(f.id, new Set()));
}
export function deploymentSpaces(
  state: Pick<GameState, 'fighters' | 'boardTokens'>,
  fighter: string,
  map: MapDefinition,
): string[] {
  const f = state.fighters.find((f) => f.id === fighter);
  if (!f || f.role !== 'ally' || f.defeated || f.position !== null) return [];
  return map.nodes.filter(
    (position) =>
      emptyEndpoint(state, position) &&
      sharesZone(map, mainFighter(state, f.player).position, position) &&
      canDeploy(state, map, { fighter, position }),
  );
}
