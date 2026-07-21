import { ContentService } from './content.service';

/**
 * Loads the real, committed content pack (not fixtures) - this is a
 * regression test for the shipped YAML itself: if a future edit breaks a
 * reference (a region pointing at a city or monster that no longer
 * exists) or removes the starting city, this fails immediately instead
 * of only surfacing as a boot crash later.
 */
describe('ContentService (real content pack)', () => {
  let content: ContentService;

  beforeAll(() => {
    content = new ContentService();
    content.onModuleInit();
  });

  it('loads all three cities including exactly one starting city', () => {
    const cities = content.getCities();
    expect(cities.length).toBe(3);
    expect(content.getStartingCityId()).toBe('haven');
  });

  it('loads the monster roster', () => {
    const monsters = content.getMonsters();
    expect(monsters.map((m) => m.id).sort()).toEqual([
      'bandit',
      'direwolf',
      'millbrook-thing',
      'rat',
    ]);
  });

  it('finds a route between two connected cities in either direction', () => {
    expect(content.findRoute('haven', 'millbrook')).toBeDefined();
    expect(content.findRoute('millbrook', 'haven')).toBeDefined();
  });

  it('returns undefined for cities with no direct route', () => {
    // haven <-> ashford and ashford <-> millbrook exist, but every region
    // in the current pack connects two cities directly, so a city always
    // has a route to itself only via "already there", never "self".
    expect(content.findRoute('haven', 'haven')).toBeUndefined();
  });

  it('resolves every monster referenced by every region', () => {
    for (const region of content.getRegions()) {
      for (const monsterId of region.monsterIds) {
        expect(content.findMonster(monsterId)).toBeDefined();
      }
    }
  });

  it('loads the item roster', () => {
    const items = content.getItems();
    expect(items.map((i) => i.id).sort()).toEqual([
      'bandit-dagger',
      'iron-dagger',
      'leather-vest',
      'rusty-sword',
      'scrap-metal',
      'vitality-tonic',
      'wolf-fang',
      'wolf-pelt-cloak',
    ]);
  });

  it('gives every EQUIPMENT item a slot, and no other item a slot', () => {
    for (const item of content.getItems()) {
      if (item.type === 'EQUIPMENT') {
        expect(item.slot === 'WEAPON' || item.slot === 'ARMOR').toBe(true);
      } else {
        expect(item.slot).toBeUndefined();
      }
    }
  });

  it('resolves every item referenced by every monster loot table', () => {
    for (const monster of content.getMonsters()) {
      for (const drop of monster.lootTable) {
        expect(content.findItem(drop.itemId)).toBeDefined();
      }
    }
  });

  it('resolves every item referenced by every shop', () => {
    for (const city of content.getCities()) {
      const shop = content.getShop(city.id);
      if (!shop) {
        continue;
      }
      for (const itemId of shop.itemIds) {
        expect(content.findItem(itemId)).toBeDefined();
      }
    }
  });

  it('loads the profession roster', () => {
    expect(
      content
        .getProfessions()
        .map((p) => p.id)
        .sort(),
    ).toEqual(['alchemist', 'blacksmith']);
  });

  it('resolves every profession and every material/output item referenced by every recipe', () => {
    for (const profession of content.getProfessions()) {
      const recipes = content.getRecipesForProfession(profession.id);
      for (const recipe of recipes) {
        expect(content.findProfession(recipe.professionId)).toBeDefined();
        expect(content.findItem(recipe.outputItemId)).toBeDefined();
        for (const material of recipe.materials) {
          expect(content.findItem(material.itemId)).toBeDefined();
        }
      }
    }
  });

  it('loads the quest roster as a single linear chain', () => {
    const quests = content.getQuests();
    expect(quests.map((q) => q.id).sort()).toEqual([
      'highwaymen',
      'rat-problem',
      'the-ashford-road',
    ]);
    expect(content.findQuest('rat-problem')?.requiresQuestId).toBeUndefined();
    expect(content.findQuest('the-ashford-road')?.requiresQuestId).toBe(
      'rat-problem',
    );
    expect(content.findQuest('highwaymen')?.requiresQuestId).toBe(
      'the-ashford-road',
    );
  });

  it('resolves every quest giver, prerequisite, and objective/reward reference', () => {
    for (const quest of content.getQuests()) {
      expect(content.findNpc(quest.giverNpcId)).toBeDefined();
      if (quest.requiresQuestId) {
        expect(content.findQuest(quest.requiresQuestId)).toBeDefined();
      }
      for (const objective of quest.objectives) {
        if (objective.kind === 'KILL_MONSTER') {
          expect(content.findMonster(objective.monsterId)).toBeDefined();
        }
        if (objective.kind === 'COLLECT_ITEM') {
          expect(content.findItem(objective.itemId)).toBeDefined();
        }
        if (objective.kind === 'REACH_CITY') {
          expect(content.getCity(objective.cityId)).toBeDefined();
        }
      }
      for (const itemId of quest.rewardItemIds) {
        expect(content.findItem(itemId)).toBeDefined();
      }
    }
  });

  it('resolves every npc to a real city', () => {
    for (const quest of content.getQuests()) {
      const npc = content.findNpc(quest.giverNpcId);
      expect(npc && content.getCity(npc.cityId)).toBeDefined();
    }
  });

  it('loads the dungeon roster', () => {
    expect(
      content
        .getDungeons()
        .map((d) => d.id)
        .sort(),
    ).toEqual(['old-mill-depths']);
  });

  it('resolves every dungeon city, beat monster, and reward reference', () => {
    for (const dungeon of content.getDungeons()) {
      expect(content.getCity(dungeon.cityId)).toBeDefined();
      for (const beat of dungeon.beats) {
        if (beat.kind === 'COMBAT' || beat.kind === 'BOSS') {
          expect(content.findMonster(beat.monsterId)).toBeDefined();
        }
      }
      for (const itemId of dungeon.rewardItemIds) {
        expect(content.findItem(itemId)).toBeDefined();
      }
    }
  });

  it('gives every dungeon at least one beat and a flavor line for every preparedness tier', () => {
    for (const dungeon of content.getDungeons()) {
      expect(dungeon.beats.length).toBeGreaterThan(0);
      for (const tier of [
        'CONFIDENT',
        'STEADY',
        'UNEASY',
        'DESPERATE',
      ] as const) {
        expect(dungeon.preparednessFlavor[tier].length).toBeGreaterThan(0);
      }
    }
  });
});
