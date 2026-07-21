import { I18nService, resolveLocaleFromHeader } from './i18n.service';

/**
 * Loads the real, committed translation files (not fixtures) - same
 * rationale as content.service.spec.ts: a regression test for the shipped
 * JSON itself, not just the lookup logic.
 */
describe('I18nService', () => {
  let i18n: I18nService;

  beforeAll(() => {
    i18n = new I18nService();
    i18n.onModuleInit();
  });

  it('resolves a key in English by default', () => {
    expect(i18n.t('friends.errors.playerNotFound')).toBe('No such player.');
  });

  it('resolves the same key in German when asked', () => {
    expect(i18n.t('friends.errors.playerNotFound', { lang: 'de' })).toBe(
      'Kein solcher Spieler.',
    );
  });

  it('falls back to English for an unsupported locale', () => {
    expect(i18n.t('friends.errors.playerNotFound', { lang: 'fr' })).toBe(
      'No such player.',
    );
  });

  it('interpolates named parameters', () => {
    expect(i18n.t('chat.errors.messageLength', { args: { max: 280 } })).toBe(
      'Message must be between 1 and 280 characters.',
    );
    expect(
      i18n.t('chat.errors.messageLength', {
        lang: 'de',
        args: { max: 280 },
      }),
    ).toBe('Die Nachricht muss zwischen 1 und 280 Zeichen lang sein.');
  });

  it('returns the key itself for a translation that does not exist', () => {
    expect(i18n.t('nonexistent.namespace.key')).toBe(
      'nonexistent.namespace.key',
    );
  });

  it('merges an additional namespace directory without losing the originals', () => {
    // registerNamespaceDir merging a directory with no matching files for
    // either locale is a no-op, not an error - a future plugin without its
    // own translations shouldn't break the catalog.
    i18n.registerNamespaceDir('/nonexistent/plugin/i18n/path');
    expect(i18n.t('friends.errors.playerNotFound')).toBe('No such player.');
  });
});

describe('resolveLocaleFromHeader', () => {
  it('defaults to English when no header is present', () => {
    expect(resolveLocaleFromHeader(undefined)).toBe('en');
  });

  it('picks a supported primary language tag', () => {
    expect(resolveLocaleFromHeader('de-DE,de;q=0.9,en;q=0.8')).toBe('de');
  });

  it('respects q-values over string order', () => {
    expect(resolveLocaleFromHeader('fr;q=0.9,de;q=0.95')).toBe('de');
  });

  it('falls back to English when nothing supported is requested', () => {
    expect(resolveLocaleFromHeader('fr-FR,fr;q=0.9')).toBe('en');
  });
});
