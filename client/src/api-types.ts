/**
 * Hand-written mirror of the backend's DTOs/response shapes actually
 * needed by Phase 1 (auth, character, world/travel, combat) - not a
 * generated client, not a shared workspace package yet. Revisit that
 * only once duplication with the backend's own types actually hurts
 * (see the Phase 1 plan's stack notes).
 */

export interface PublicUser {
  id: string;
  email: string;
  username: string;
  createdAt: string;
}

export type Archetype = 'DUELIST' | 'SCHOLAR' | 'DIPLOMAT';

export interface Character {
  id: string;
  userId: string;
  name: string;
  archetype: Archetype;
  body: number;
  mind: number;
  presence: number;
  level: number;
  xp: number;
  hp: number;
  maxHp: number;
  actionPoints: number;
  maxActionPoints: number;
  currentCityId: string;
  gold: number;
  profession: string | null;
  professionLevel: number;
  professionXp: number;
  createdAt: string;
  updatedAt: string;
}

export interface City {
  id: string;
  name: string;
  description: string;
  startingCity?: boolean;
}

export interface Region {
  id: string;
  name: string;
  description: string;
  cities: [string, string];
  travelCost: number;
  monsterIds: string[];
  encounterChance: number;
}

export interface TravelEncounter {
  monster: { id: string; name: string };
  log: string[];
  victory: boolean;
  xpGained: number;
  leveledUp: boolean;
  lootItemId: string | null;
}

export interface TravelResult {
  city: { id: string; name: string };
  encounter: TravelEncounter | null;
  character: Character;
}

export interface Monster {
  id: string;
  name: string;
  hp: number;
  attack: number;
  defense: number;
  xpReward: number;
  blurb: string;
}

export interface FightResult {
  victory: boolean;
  monster: { id: string; name: string };
  log: string[];
  xpGained: number;
  leveledUp: boolean;
  lootItemId: string | null;
  character: Character;
}

export interface ChatMessageView {
  id: string;
  senderId: string;
  username: string;
  body: string;
  createdAt: string;
}
