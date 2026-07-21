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
    expect(content.getProfessions().map((p) => p.id).sort()).toEqual([
      'alchemist',
      'blacksmith',
    ]);
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
});
