/**
 * Hardcoded starting roster, same pattern as character/archetypes.ts.
 * build-plan-v1.md M3 ("first YAML pack: cities, monsters") is where this
 * moves into real content-as-data; before that pipeline exists, hardcoding
 * a small roster here is the honest v1 stopgap rather than building the
 * YAML loader a milestone early.
 */
export interface MonsterDefinition {
  id: string;
  name: string;
  hp: number;
  attack: number;
  defense: number;
  xpReward: number;
  blurb: string;
}

export const MONSTERS: readonly MonsterDefinition[] = [
  {
    id: 'rat',
    name: 'Sewer Rat',
    hp: 10,
    attack: 2,
    defense: 0,
    xpReward: 15,
    blurb: 'Small, fast, and unreasonably angry.',
  },
  {
    id: 'bandit',
    name: 'Highway Bandit',
    hp: 20,
    attack: 4,
    defense: 1,
    xpReward: 35,
    blurb: 'Wants your coin purse more than your life, but will settle for either.',
  },
  {
    id: 'direwolf',
    name: 'Direwolf',
    hp: 35,
    attack: 6,
    defense: 2,
    xpReward: 60,
    blurb: 'Bigger than it has any right to be.',
  },
] as const;

export const MONSTER_IDS = MONSTERS.map((m) => m.id);

export function findMonster(id: string): MonsterDefinition | undefined {
  return MONSTERS.find((m) => m.id === id);
}
