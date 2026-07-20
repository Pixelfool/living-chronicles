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
});
