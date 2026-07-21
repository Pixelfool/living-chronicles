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
