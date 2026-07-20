/**
 * Starting archetypes per game-design.md §4: a small number of broad,
 * flavorful choices that bias playstyle without hard-locking a character
 * out of anything. Deeper/more specific archetypes belong to plugins,
 * not core (game-design.md §10).
 */
export const ARCHETYPES = {
  DUELIST: {
    body: 5,
    mind: 3,
    presence: 3,
    blurb: 'Fights carefully, trusts steel over words.',
  },
  SCHOLAR: {
    body: 3,
    mind: 5,
    presence: 3,
    blurb: 'Reads the world like a ledger, trades shrewdly.',
  },
  DIPLOMAT: {
    body: 3,
    mind: 3,
    presence: 5,
    blurb: 'Explores people as much as places.',
  },
} as const;

export type ArchetypeKey = keyof typeof ARCHETYPES;

export const ARCHETYPE_KEYS = Object.keys(ARCHETYPES) as ArchetypeKey[];
