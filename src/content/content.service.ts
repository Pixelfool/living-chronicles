import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parse } from 'yaml';
import {
  CitiesFileSchema,
  City,
  Dungeon,
  DungeonsFileSchema,
  Item,
  ItemsFileSchema,
  MonstersFileSchema,
  Monster,
  Npc,
  NpcsFileSchema,
  Profession,
  ProfessionsFileSchema,
  Quest,
  QuestsFileSchema,
  Recipe,
  RecipesFileSchema,
  RegionsFileSchema,
  Region,
  Shop,
  ShopsFileSchema,
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
  private shops = new Map<string, Shop>();
  private professions = new Map<string, Profession>();
  private recipes = new Map<string, Recipe>();
  private npcs = new Map<string, Npc>();
  private quests = new Map<string, Quest>();
  private dungeons = new Map<string, Dungeon>();
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
    const shopsFile = ShopsFileSchema.parse(this.readYaml('shops.yaml'));
    const professionsFile = ProfessionsFileSchema.parse(
      this.readYaml('professions.yaml'),
    );
    const recipesFile = RecipesFileSchema.parse(this.readYaml('recipes.yaml'));
    const npcsFile = NpcsFileSchema.parse(this.readYaml('npcs.yaml'));
    const questsFile = QuestsFileSchema.parse(this.readYaml('quests.yaml'));
    const dungeonsFile = DungeonsFileSchema.parse(
      this.readYaml('dungeons.yaml'),
    );

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

    const shops = new Map<string, Shop>();
    for (const shop of shopsFile.shops) {
      if (shops.has(shop.cityId)) {
        throw new Error(
          `duplicate shop for city id in content pack: "${shop.cityId}"`,
        );
      }
      if (!cities.has(shop.cityId)) {
        throw new Error(`shop references unknown city "${shop.cityId}"`);
      }
      for (const itemId of shop.itemIds) {
        if (!items.has(itemId)) {
          throw new Error(
            `shop in "${shop.cityId}" references unknown item "${itemId}"`,
          );
        }
      }
      shops.set(shop.cityId, shop);
    }

    const professions = new Map<string, Profession>();
    for (const profession of professionsFile.professions) {
      if (professions.has(profession.id)) {
        throw new Error(
          `duplicate profession id in content pack: "${profession.id}"`,
        );
      }
      professions.set(profession.id, profession);
    }

    const recipes = new Map<string, Recipe>();
    for (const recipe of recipesFile.recipes) {
      if (recipes.has(recipe.id)) {
        throw new Error(`duplicate recipe id in content pack: "${recipe.id}"`);
      }
      if (!professions.has(recipe.professionId)) {
        throw new Error(
          `recipe "${recipe.id}" references unknown profession "${recipe.professionId}"`,
        );
      }
      if (!items.has(recipe.outputItemId)) {
        throw new Error(
          `recipe "${recipe.id}" references unknown output item "${recipe.outputItemId}"`,
        );
      }
      for (const material of recipe.materials) {
        if (!items.has(material.itemId)) {
          throw new Error(
            `recipe "${recipe.id}" references unknown material item "${material.itemId}"`,
          );
        }
      }
      recipes.set(recipe.id, recipe);
    }

    const npcs = new Map<string, Npc>();
    for (const npc of npcsFile.npcs) {
      if (npcs.has(npc.id)) {
        throw new Error(`duplicate npc id in content pack: "${npc.id}"`);
      }
      if (!cities.has(npc.cityId)) {
        throw new Error(
          `npc "${npc.id}" references unknown city "${npc.cityId}"`,
        );
      }
      npcs.set(npc.id, npc);
    }

    const quests = new Map<string, Quest>();
    for (const quest of questsFile.quests) {
      if (quests.has(quest.id)) {
        throw new Error(`duplicate quest id in content pack: "${quest.id}"`);
      }
      if (!npcs.has(quest.giverNpcId)) {
        throw new Error(
          `quest "${quest.id}" references unknown giver npc "${quest.giverNpcId}"`,
        );
      }
      for (const objective of quest.objectives) {
        if (
          objective.kind === 'KILL_MONSTER' &&
          !monsters.has(objective.monsterId)
        ) {
          throw new Error(
            `quest "${quest.id}" objective references unknown monster "${objective.monsterId}"`,
          );
        }
        if (objective.kind === 'COLLECT_ITEM' && !items.has(objective.itemId)) {
          throw new Error(
            `quest "${quest.id}" objective references unknown item "${objective.itemId}"`,
          );
        }
        if (objective.kind === 'REACH_CITY' && !cities.has(objective.cityId)) {
          throw new Error(
            `quest "${quest.id}" objective references unknown city "${objective.cityId}"`,
          );
        }
      }
      for (const itemId of quest.rewardItemIds) {
        if (!items.has(itemId)) {
          throw new Error(
            `quest "${quest.id}" reward references unknown item "${itemId}"`,
          );
        }
      }
      quests.set(quest.id, quest);
    }
    // requiresQuestId is validated in a second pass, once every quest id is
    // known - a prerequisite may be defined later in the same file, and a
    // chain also needs to be checked for cycles as a whole, not just
    // "does this one id exist".
    for (const quest of quests.values()) {
      if (!quest.requiresQuestId) {
        continue;
      }
      if (!quests.has(quest.requiresQuestId)) {
        throw new Error(
          `quest "${quest.id}" requires unknown quest "${quest.requiresQuestId}"`,
        );
      }
      const chain = new Set<string>([quest.id]);
      let current: Quest | undefined = quest;
      while (current?.requiresQuestId) {
        if (chain.has(current.requiresQuestId)) {
          throw new Error(
            `quest prerequisite cycle detected involving "${quest.id}"`,
          );
        }
        chain.add(current.requiresQuestId);
        current = quests.get(current.requiresQuestId);
      }
    }

    const dungeons = new Map<string, Dungeon>();
    for (const dungeon of dungeonsFile.dungeons) {
      if (dungeons.has(dungeon.id)) {
        throw new Error(
          `duplicate dungeon id in content pack: "${dungeon.id}"`,
        );
      }
      // "current" is a reserved path segment (GET/POST .../dungeons/current
      // means "my active expedition", not a dungeon lookup) - a content
      // pack using it as a dungeon id would silently make that dungeon
      // unreachable by id and shadow the current-run endpoints instead.
      if (dungeon.id === 'current') {
        throw new Error(
          `dungeon id "current" is reserved by the API and cannot be used as a content id`,
        );
      }
      if (!cities.has(dungeon.cityId)) {
        throw new Error(
          `dungeon "${dungeon.id}" references unknown city "${dungeon.cityId}"`,
        );
      }
      for (const beat of dungeon.beats) {
        if (
          (beat.kind === 'COMBAT' || beat.kind === 'BOSS') &&
          !monsters.has(beat.monsterId)
        ) {
          throw new Error(
            `dungeon "${dungeon.id}" beat references unknown monster "${beat.monsterId}"`,
          );
        }
      }
      for (const itemId of dungeon.rewardItemIds) {
        if (!items.has(itemId)) {
          throw new Error(
            `dungeon "${dungeon.id}" reward references unknown item "${itemId}"`,
          );
        }
      }
      dungeons.set(dungeon.id, dungeon);
    }

    this.cities = cities;
    this.monsters = monsters;
    this.items = items;
    this.regions = regionsFile.regions;
    this.shops = shops;
    this.professions = professions;
    this.recipes = recipes;
    this.npcs = npcs;
    this.quests = quests;
    this.dungeons = dungeons;
    this.startingCityId = startingCities[0].id;

    this.logger.log(
      `Loaded content pack: ${this.cities.size} cities, ${this.regions.length} regions, ${this.monsters.size} monsters, ${this.items.size} items, ${this.shops.size} shops, ${this.professions.size} professions, ${this.recipes.size} recipes, ${this.npcs.size} npcs, ${this.quests.size} quests, ${this.dungeons.size} dungeons`,
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

  getShop(cityId: string): Shop | undefined {
    return this.shops.get(cityId);
  }

  getProfessions(): Profession[] {
    return [...this.professions.values()];
  }

  findProfession(id: string): Profession | undefined {
    return this.professions.get(id);
  }

  getRecipesForProfession(professionId: string): Recipe[] {
    return [...this.recipes.values()].filter(
      (recipe) => recipe.professionId === professionId,
    );
  }

  findRecipe(id: string): Recipe | undefined {
    return this.recipes.get(id);
  }

  findNpc(id: string): Npc | undefined {
    return this.npcs.get(id);
  }

  getQuests(): Quest[] {
    return [...this.quests.values()];
  }

  findQuest(id: string): Quest | undefined {
    return this.quests.get(id);
  }

  getDungeons(): Dungeon[] {
    return [...this.dungeons.values()];
  }

  findDungeon(id: string): Dungeon | undefined {
    return this.dungeons.get(id);
  }
}
