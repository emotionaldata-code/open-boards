import type { CardDefinition, Definitions, Fighter, FighterDefinition, GameState } from './types';

export function fighterById(state: Pick<GameState, 'fighters'>, id: string): Fighter | undefined {
  return state.fighters.find((fighter) => fighter.id === id);
}
export function mainFighter(state: Pick<GameState, 'fighters'>, player: string): Fighter {
  return state.fighters.find((fighter) => fighter.player === player && fighter.role === 'main')!;
}
export function fighterDefinition(fighter: Fighter, defs: Definitions): FighterDefinition {
  const character = defs.characters[fighter.character];
  if (character.heroSelection) {
    const identity = fighter.definition === character.ally!.id ? character.ally! : character;
    return {
      ...identity,
      name: identity === character ? character.heroSelection.mainName : identity.name,
      hp: fighter.role === 'main' ? character.hp : character.ally!.hp,
    };
  }
  return fighter.role === 'main' ? character : character.ally!;
}
export function ownedFighters(state: Pick<GameState, 'fighters'>, player: string): Fighter[] {
  return state.fighters.filter((fighter) => fighter.player === player && !fighter.defeated);
}
export function cardEligible(
  card: CardDefinition,
  fighter: Pick<Fighter, 'role' | 'defeated'> & Partial<Pick<Fighter, 'definition'>>,
): boolean {
  return (
    !fighter.defeated &&
    (!card.fighter || card.fighter === fighter.definition) &&
    (card.usableBy === 'BOTH' || card.usableBy === fighter.role.toUpperCase())
  );
}

export function fighterLabel(fighter: Fighter, defs: Definitions): string {
  const name = fighterDefinition(fighter, defs).name;
  return fighter.role === 'ally' ? `${name} ${fighter.id.split('-').at(-1)}` : name;
}
