import { z } from 'zod';

export const ItemSlotSchema = z.enum(['WEAPON', 'ARMOR']);
export type ItemSlot = z.infer<typeof ItemSlotSchema>;

export const ItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  slot: ItemSlotSchema,
  attackBonus: z.number().int().nonnegative().default(0),
  defenseBonus: z.number().int().nonnegative().default(0),
  price: z.number().int().nonnegative().default(0),
  blurb: z.string(),
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
