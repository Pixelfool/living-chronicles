import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parse } from 'yaml';
import {
  CitiesFileSchema,
  City,
  Item,
  ItemsFileSchema,
  MonstersFileSchema,
  Monster,
  RegionsFileSchema,
  Region,
} from './schemas';

const CONTENT_DIR =
  process.env.CONTENT_DIR ?? join(process.cwd(), 'content', 'core');

/**
 * Loads and validates the one content pack that exists in v1 (build-plan
 * §1: "content is data, not code, from the first line" - even though this
 * loader supports exactly one pack and does none of the cross-pack
 * dependency resolution the target architecture eventually needs).
 * Fails loudly at boot, before the app accepts traffic, on malformed data
 * or a broken in-pack reference (a region pointing at a city or monster
 * that doesn't exist, or a monster's loot table pointing at an item that
 * doesn't exist).
 */
@Injectable()
export class ContentService implements OnModuleInit {
  private readonly logger = new Logger(ContentService.name);
  private cities = new Map<string, City>();
  private monsters = new Map<string, Monster>();
  private items = new Map<string, Item>();
  private regions: Region[] = [];
  private startingCityId!: string;

  onModuleInit(): void {
    this.load();
  }

  private load(): void {
    const citiesFile = CitiesFileSchema.parse(this.readYaml('cities.yaml'));
    const monstersFile = MonstersFileSchema.parse(
      this.readYaml('monsters.yaml'),
    );
    const regionsFile = RegionsFileSchema.parse(this.readYaml('regions.yaml'));
    const itemsFile = ItemsFileSchema.parse(this.readYaml('items.yaml'));

    const cities = new Map<string, City>();
    for (const city of citiesFile.cities) {
      if (cities.has(city.id)) {
        throw new Error(`duplicate city id in content pack: "${city.id}"`);
      }
      cities.set(city.id, city);
    }

    const items = new Map<string, Item>();
    for (const item of itemsFile.items) {
      if (items.has(item.id)) {
        throw new Error(`duplicate item id in content pack: "${item.id}"`);
      }
      items.set(item.id, item);
    }

    const monsters = new Map<string, Monster>();
    for (const monster of monstersFile.monsters) {
      if (monsters.has(monster.id)) {
        throw new Error(
          `duplicate monster id in content pack: "${monster.id}"`,
        );
      }
      for (const drop of monster.lootTable) {
        if (!items.has(drop.itemId)) {
          throw new Error(
            `monster "${monster.id}" loot table references unknown item "${drop.itemId}"`,
          );
        }
      }
      monsters.set(monster.id, monster);
    }

    for (const region of regionsFile.regions) {
      for (const cityId of region.cities) {
        if (!cities.has(cityId)) {
          throw new Error(
            `region "${region.id}" references unknown city "${cityId}"`,
          );
        }
      }
      for (const monsterId of region.monsterIds) {
        if (!monsters.has(monsterId)) {
          throw new Error(
            `region "${region.id}" references unknown monster "${monsterId}"`,
          );
        }
      }
    }

    const startingCities = [...cities.values()].filter(
      (city) => city.startingCity,
    );
    if (startingCities.length !== 1) {
      throw new Error(
        `expected exactly one city with startingCity: true, found ${startingCities.length}`,
      );
    }

    this.cities = cities;
    this.monsters = monsters;
    this.items = items;
    this.regions = regionsFile.regions;
    this.startingCityId = startingCities[0].id;

    this.logger.log(
      `Loaded content pack: ${this.cities.size} cities, ${this.regions.length} regions, ${this.monsters.size} monsters, ${this.items.size} items`,
    );
  }

  private readYaml(fileName: string): unknown {
    const raw = readFileSync(join(CONTENT_DIR, fileName), 'utf-8');
    return parse(raw);
  }

  getStartingCityId(): string {
    return this.startingCityId;
  }

  getCities(): City[] {
    return [...this.cities.values()];
  }

  getCity(id: string): City | undefined {
    return this.cities.get(id);
  }

  getRegions(): Region[] {
    return this.regions;
  }

  findRoute(fromCityId: string, toCityId: string): Region | undefined {
    return this.regions.find(
      (region) =>
        (region.cities[0] === fromCityId && region.cities[1] === toCityId) ||
        (region.cities[1] === fromCityId && region.cities[0] === toCityId),
    );
  }

  getMonsters(): Monster[] {
    return [...this.monsters.values()];
  }

  findMonster(id: string): Monster | undefined {
    return this.monsters.get(id);
  }

  getItems(): Item[] {
    return [...this.items.values()];
  }

  findItem(id: string): Item | undefined {
    return this.items.get(id);
  }
}
