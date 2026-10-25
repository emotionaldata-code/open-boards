import type { Definitions, Fighter, MapDefinition } from './types';
import { adjacent } from './movement';
import { fighterDefinition } from './fighters';
export function sharesZone(map: MapDefinition, a: string | null, b: string | null): boolean {
  return (
    a !== null && b !== null && (map.zones[a] ?? []).some((zone) => map.zones[b]?.includes(zone))
  );
}
export function inAttackRange(attacker: Fighter, defender: Fighter, defs: Definitions): boolean {
  if (
    attacker.id === defender.id ||
    attacker.defeated ||
    defender.defeated ||
    attacker.position === null ||
    defender.position === null
  )
    return false;
  if (!defs.map.nodes.includes(attacker.position) || !defs.map.nodes.includes(defender.position))
    return false;
  return (
    adjacent(defs.map, attacker.position, defender.position) ||
    (fighterDefinition(attacker, defs).attackType === 'ranged' &&
      sharesZone(defs.map, attacker.position, defender.position))
  );
}

export function canAttack(attacker: Fighter, defender: Fighter, defs: Definitions): boolean {
  return attacker.player !== defender.player && inAttackRange(attacker, defender, defs);
}
