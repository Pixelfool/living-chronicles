import { z } from 'zod';

export const ItemSlotSchema = z.enum(['WEAPON', 'ARMOR']);
export type ItemSlot = z.infer<typeof ItemSlotSchema>;

// What an item *is* (EQUIPMENT/MATERIAL/CONSUMABLE) is deliberately
// separate from *where it's worn* (slot, only meaningful for EQUIPMENT) -
// M8 design discussion: crafting needs non-equippable material inputs,
// and conflating "type" with "slot" would have made that a breaking
// change to the existing WEAPON/ARMOR enum instead of an additive one.
export const ItemTypeSchema = z.enum(['EQUIPMENT', 'MATERIAL', 'CONSUMABLE']);
export type ItemType = z.infer<typeof ItemTypeSchema>;

export const ItemSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    type: ItemTypeSchema.default('EQUIPMENT'),
    slot: ItemSlotSchema.optional(),
    attackBonus: z.number().int().nonnegative().default(0),
    defenseBonus: z.number().int().nonnegative().default(0),
    price: z.number().int().nonnegative().default(0),
    blurb: z.string(),
  })
  .refine((item) => item.type !== 'EQUIPMENT' || item.slot !== undefined, {
    message: 'equipment items must have a slot',
  });
export type Item = z.infer<typeof ItemSchema>;

export const LootEntrySchema = z.object({
  itemId: z.string(),
  dropChance: z.number().min(0).max(1),
});
export type LootEntry = z.infer<typeof LootEntrySchema>;

export const MonsterSchema = z.object({
  id: z.string(),
  name: z.string(),
  hp: z.number().int().positive(),
  attack: z.number().int().nonnegative(),
  defense: z.number().int().nonnegative(),
  xpReward: z.number().int().nonnegative(),
  blurb: z.string(),
  lootTable: z.array(LootEntrySchema).default([]),
});
export type Monster = z.infer<typeof MonsterSchema>;

export const CitySchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  startingCity: z.boolean().optional().default(false),
});
export type City = z.infer<typeof CitySchema>;

export const RegionSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  cities: z.tuple([z.string(), z.string()]),
  travelCost: z.number().int().positive(),
  monsterIds: z.array(z.string()).default([]),
  encounterChance: z.number().min(0).max(1).default(0),
});
export type Region = z.infer<typeof RegionSchema>;

export const MonstersFileSchema = z.object({
  monsters: z.array(MonsterSchema),
});
export const CitiesFileSchema = z.object({
  cities: z.array(CitySchema),
});
export const RegionsFileSchema = z.object({
  regions: z.array(RegionSchema),
});
export const ItemsFileSchema = z.object({
  items: z.array(ItemSchema),
});

export const ShopSchema = z.object({
  cityId: z.string(),
  itemIds: z.array(z.string()),
});
export type Shop = z.infer<typeof ShopSchema>;

export const ShopsFileSchema = z.object({
  shops: z.array(ShopSchema),
});

export const ProfessionSchema = z.object({
  id: z.string(),
  name: z.string(),
  blurb: z.string(),
});
export type Profession = z.infer<typeof ProfessionSchema>;

export const ProfessionsFileSchema = z.object({
  professions: z.array(ProfessionSchema),
});

export const RecipeMaterialSchema = z.object({
  itemId: z.string(),
  quantity: z.number().int().positive(),
});
export type RecipeMaterial = z.infer<typeof RecipeMaterialSchema>;

export const RecipeSchema = z.object({
  id: z.string(),
  professionId: z.string(),
  name: z.string(),
  minProfessionLevel: z.number().int().positive().default(1),
  // Not exercised by any M8 content or gating logic beyond "recipes
  // marked true are uncraftable for now" - the field exists so a later
  // milestone (quest reward, drop, NPC-taught) can grant discovery
  // without changing the recipe schema or CraftingJob model (M8 design
  // discussion: level-gating and discovery-gating should both be
  // expressible from day one, even though only the former is wired up).
  requiresDiscovery: z.boolean().default(false),
  durationSeconds: z.number().int().positive(),
  materials: z.array(RecipeMaterialSchema).min(1),
  outputItemId: z.string(),
  outputQuantity: z.number().int().positive().default(1),
  professionXpReward: z.number().int().nonnegative().default(0),
  blurb: z.string(),
});
export type Recipe = z.infer<typeof RecipeSchema>;

export const RecipesFileSchema = z.object({
  recipes: z.array(RecipeSchema),
});

export const NpcSchema = z.object({
  id: z.string(),
  name: z.string(),
  cityId: z.string(),
  blurb: z.string(),
});
export type Npc = z.infer<typeof NpcSchema>;

export const NpcsFileSchema = z.object({
  npcs: z.array(NpcSchema),
});

// Fixed, strongly-typed objective kinds (M9 design discussion: no
// condition/scripting language - a closed set that maps directly onto
// events already in the domain event catalog, so quest progress can be
// driven entirely by subscribing to those events rather than inventing a
// second way to describe "something happened").
export const QuestObjectiveSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('KILL_MONSTER'),
    monsterId: z.string(),
    count: z.number().int().positive(),
  }),
  z.object({
    kind: z.literal('COLLECT_ITEM'),
    itemId: z.string(),
    count: z.number().int().positive(),
  }),
  z.object({
    kind: z.literal('REACH_CITY'),
    cityId: z.string(),
  }),
]);
export type QuestObjective = z.infer<typeof QuestObjectiveSchema>;

// Deliberately does NOT carry a list of quest ids on the giver NPC -
// quests reference their giver (giverNpcId), not the other way around, so
// a plugin can add a new quest for an existing core NPC without touching
// that NPC's own definition (M9 design discussion).
export const QuestSchema = z.object({
  id: z.string(),
  name: z.string(),
  giverNpcId: z.string(),
  // Linear chains only for M9: at most one prerequisite, no branching.
  requiresQuestId: z.string().optional(),
  minLevel: z.number().int().nonnegative().default(0),
  objectives: z.array(QuestObjectiveSchema).min(1),
  rewardXp: z.number().int().nonnegative().default(0),
  rewardGold: z.number().int().nonnegative().default(0),
  rewardItemIds: z.array(z.string()).default([]),
  blurb: z.string(),
});
export type Quest = z.infer<typeof QuestSchema>;

export const QuestsFileSchema = z.object({
  quests: z.array(QuestSchema),
});

// Beats, not stages: combat is one tool a dungeon uses, not its identity
// (M11 design discussion, game-design.md §8). A DISCOVERY beat is pure
// authored flavor with no fight and no reward of its own; COMBAT/BOSS
// beats resolve through the same resolveFight() every other fight in the
// game uses and emit the same BattleFinished event, so nothing downstream
// (Quests' KILL_MONSTER objectives, future Achievements) needs to know or
// care that a kill happened inside a dungeon rather than on the road.
export const DungeonBeatSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('DISCOVERY'), text: z.string() }),
  z.object({ kind: z.literal('COMBAT'), monsterId: z.string() }),
  z.object({
    kind: z.literal('BOSS'),
    monsterId: z.string(),
    text: z.string().optional(),
  }),
]);
export type DungeonBeat = z.infer<typeof DungeonBeatSchema>;

// The only vocabulary a caller outside dungeon-resolver.ts ever sees for
// "how prepared does this look" - a closed, named tier, never a raw score
// (architecture.md §4.13: the domain produces a fact, content owns the
// words describing it).
export const PreparednessTierSchema = z.enum([
  'CONFIDENT',
  'STEADY',
  'UNEASY',
  'DESPERATE',
]);
export type PreparednessTier = z.infer<typeof PreparednessTierSchema>;

export const DungeonSchema = z.object({
  id: z.string(),
  name: z.string(),
  cityId: z.string(),
  minLevel: z.number().int().nonnegative().default(0),
  entryCost: z.number().int().positive(),
  rumor: z.string(),
  beats: z.array(DungeonBeatSchema).min(1),
  rewardItemIds: z.array(z.string()).default([]),
  rewardGold: z.number().int().nonnegative().default(0),
  // One non-empty pool of flavor lines per tier - content's job, not the
  // domain's, to say anything at all (architecture.md §4.13).
  preparednessFlavor: z.object({
    CONFIDENT: z.array(z.string()).min(1),
    STEADY: z.array(z.string()).min(1),
    UNEASY: z.array(z.string()).min(1),
    DESPERATE: z.array(z.string()).min(1),
  }),
});
export type Dungeon = z.infer<typeof DungeonSchema>;

export const DungeonsFileSchema = z.object({
  dungeons: z.array(DungeonSchema),
});

// The engine's closed vocabulary of what a player can fundamentally do
// during a world event (M12 design discussion). A definition selects
// which of these apply to its situation; it never invents a new one -
// adding a value here is an engine capability change, not a per-event
// exception. Watch is deliberately absent: it's the implicit result of
// doing neither of these, never a tracked verb (see WorldEventInstance's
// schema comment in prisma/schema.prisma).
export const WorldEventResponseTypeSchema = z.enum(['FIGHT', 'SUPPORT']);
export type WorldEventResponseType = z.infer<
  typeof WorldEventResponseTypeSchema
>;

// Outcome tags are content's own vocabulary, not a shared enum - same
// reasoning as Character.profession being a plain string: a new event's
// outcome names must never require an engine change. residue is the
// permanent, additive text the city carries once resolved; flavor is the
// resolution-moment text pool (mirrors preparednessFlavor). Exactly one
// outcome per definition must be favoredByPlayerResponse - this replaces
// any reliance on array order for "which outcome does player effort lean
// toward" (M12 design discussion).
export const WorldEventOutcomeSchema = z.object({
  tag: z.string(),
  residue: z.string(),
  flavor: z.array(z.string()).min(1),
  favoredByPlayerResponse: z.boolean().default(false),
});
export type WorldEventOutcome = z.infer<typeof WorldEventOutcomeSchema>;

// Deliberately not tied to a city - cityId lives on WorldEventInstance,
// not here, so the same definition (e.g. "a raiding warband") can
// threaten a different city later without duplicating content (M12
// design discussion).
//
// Per-response-type config is one bespoke optional field plus one
// .refine() per verb (monsterId+refine for FIGHT, supportCost+refine for
// SUPPORT) - flagged in the M12 code review as a shape that won't scale
// past 2-3 response types. Left as-is deliberately: two verbs don't
// prove the shape is actually a problem yet, and generalizing into a
// keyed responseConfig now would mean designing for a third response
// type that doesn't exist (build-plan-v1.md §4). Revisit when one does.
export const WorldEventDefinitionSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    telegraph: z.string(),
    telegraphHours: z.number().int().positive(),
    activeHours: z.number().int().positive(),
    responseTypes: z.array(WorldEventResponseTypeSchema).min(1),
    monsterId: z.string().optional(),
    supportCost: z.object({ gold: z.number().int().positive() }).optional(),
    // One non-empty pool of flavor lines per mood tier - content's job,
    // never the domain's, to say anything at all (architecture.md §4.13,
    // same idiom as Dungeon.preparednessFlavor).
    moodFlavor: z.object({
      STRUGGLING: z.array(z.string()).min(1),
      HOLDING: z.array(z.string()).min(1),
    }),
    outcomes: z.array(WorldEventOutcomeSchema).min(2),
  })
  .refine(
    (def) =>
      !def.responseTypes.includes('FIGHT') || def.monsterId !== undefined,
    { message: 'an event recognizing FIGHT must declare a monsterId' },
  )
  .refine(
    (def) =>
      !def.responseTypes.includes('SUPPORT') || def.supportCost !== undefined,
    { message: 'an event recognizing SUPPORT must declare a supportCost' },
  )
  .refine(
    (def) =>
      def.outcomes.filter((outcome) => outcome.favoredByPlayerResponse)
        .length === 1,
    { message: 'exactly one outcome must be favoredByPlayerResponse' },
  );
export type WorldEventDefinition = z.infer<typeof WorldEventDefinitionSchema>;

export const WorldEventsFileSchema = z.object({
  worldEvents: z.array(WorldEventDefinitionSchema),
});
