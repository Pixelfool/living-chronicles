import { z } from 'zod';

export const MonsterSchema = z.object({
  id: z.string(),
  name: z.string(),
  hp: z.number().int().positive(),
  attack: z.number().int().nonnegative(),
  defense: z.number().int().nonnegative(),
  xpReward: z.number().int().nonnegative(),
  blurb: z.string(),
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
