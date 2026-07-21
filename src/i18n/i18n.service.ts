import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

export const DEFAULT_LOCALE = 'en';
export const SUPPORTED_LOCALES = ['en', 'de'] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];

function isSupportedLocale(value: string): value is Locale {
  return (SUPPORTED_LOCALES as readonly string[]).includes(value);
}

type TranslationNode = string | { [key: string]: TranslationNode };

export interface TranslateOptions {
  lang?: string;
  args?: Record<string, string | number>;
  /** When given, picks the `_one`/`_other` variant of `key` before falling back to the bare key. */
  count?: number;
}

/**
 * Loads namespaced JSON translation files per locale from disk at boot -
 * the same load-once-at-boot, fail-quiet-and-fall-back pattern already used
 * for the YAML content pack (content/content.service.ts), scoped down to
 * exactly what this project needs (architecture.md §4.12): key lookup,
 * `{param}` interpolation, and a two-category one/other plural rule that
 * already covers both English and German.
 *
 * Deliberately not a general i18n framework: no request-scoped context, no
 * AsyncLocalStorage. Callers pass the locale to `t()` explicitly, the same
 * way the rest of the codebase already threads session userId or a CSRF
 * token from a controller into a service - see architecture.md §4.12 for
 * why that tradeoff was made on purpose.
 */
@Injectable()
export class I18nService implements OnModuleInit {
  private readonly logger = new Logger(I18nService.name);
  private readonly namespaceDirs: string[] = [join(__dirname, 'locales')];
  private catalog = new Map<Locale, Map<string, string>>();

  onModuleInit(): void {
    this.load();
  }

  /**
   * Merges an additional directory of per-locale namespace JSON files into
   * the catalog - the hook a future plugin loader would call with its own
   * translation resources. No plugin loader exists yet to call this
   * automatically (build-plan-v1.md: plugin-ready, not plugin-complete);
   * this just means the day one exists, it doesn't need this service
   * rewritten to support it.
   */
  registerNamespaceDir(dir: string): void {
    this.namespaceDirs.push(dir);
    this.load();
  }

  private load(): void {
    const catalog = new Map<Locale, Map<string, string>>();
    for (const locale of SUPPORTED_LOCALES) {
      catalog.set(locale, new Map());
    }

    let namespaceCount = 0;
    for (const dir of this.namespaceDirs) {
      for (const locale of SUPPORTED_LOCALES) {
        const localeDir = join(dir, locale);
        let files: string[];
        try {
          files = readdirSync(localeDir).filter((f) => f.endsWith('.json'));
        } catch {
          continue; // no namespace files for this locale in this source - fine
        }
        for (const file of files) {
          const namespace = file.replace(/\.json$/, '');
          const raw = readFileSync(join(localeDir, file), 'utf-8');
          const parsed = JSON.parse(raw) as Record<string, TranslationNode>;
          this.flatten(parsed, namespace, catalog.get(locale)!);
          namespaceCount += 1;
        }
      }
    }

    this.catalog = catalog;
    this.logger.log(
      `Loaded ${namespaceCount} translation namespace file(s) across ${SUPPORTED_LOCALES.length} locale(s)`,
    );
  }

  private flatten(
    node: Record<string, TranslationNode>,
    prefix: string,
    into: Map<string, string>,
  ): void {
    for (const [key, value] of Object.entries(node)) {
      const fullKey = `${prefix}.${key}`;
      if (typeof value === 'string') {
        into.set(fullKey, value);
      } else {
        this.flatten(value, fullKey, into);
      }
    }
  }

  t(key: string, options?: TranslateOptions): string {
    const lang = this.normalizeLocale(options?.lang);
    const lookupKey = this.resolveKeyForCount(key, options?.count, lang);

    const template =
      this.catalog.get(lang)?.get(lookupKey) ??
      this.catalog.get(DEFAULT_LOCALE)?.get(lookupKey) ??
      this.catalog.get(lang)?.get(key) ??
      this.catalog.get(DEFAULT_LOCALE)?.get(key) ??
      key; // last resort: surface the key itself rather than throw for a missing translation

    return this.interpolate(template, options?.args);
  }

  private resolveKeyForCount(
    key: string,
    count: number | undefined,
    lang: Locale,
  ): string {
    if (count === undefined) {
      return key;
    }
    const suffix = count === 1 ? 'one' : 'other';
    const suffixedKey = `${key}_${suffix}`;
    const table = this.catalog.get(lang) ?? this.catalog.get(DEFAULT_LOCALE);
    return table?.has(suffixedKey) ? suffixedKey : key;
  }

  private interpolate(
    template: string,
    args?: Record<string, string | number>,
  ): string {
    if (!args) {
      return template;
    }
    return template.replace(/\{(\w+)\}/g, (match, name: string) =>
      Object.prototype.hasOwnProperty.call(args, name)
        ? String(args[name])
        : match,
    );
  }

  private normalizeLocale(lang: string | undefined): Locale {
    return lang && isSupportedLocale(lang) ? lang : DEFAULT_LOCALE;
  }
}

/**
 * Picks the best supported locale from a raw `Accept-Language` header value
 * (e.g. "de-DE,de;q=0.9,en;q=0.8"). Not a full RFC 4647 implementation -
 * just enough q-value-aware matching to prefer what the client actually
 * asked for over the first tag in the string.
 */
export function resolveLocaleFromHeader(
  acceptLanguage: string | string[] | undefined,
): Locale {
  const header = Array.isArray(acceptLanguage)
    ? acceptLanguage[0]
    : acceptLanguage;
  if (!header) {
    return DEFAULT_LOCALE;
  }

  const candidates = header
    .split(',')
    .map((part) => {
      const [tag, qPart] = part.trim().split(';q=');
      const q = qPart ? parseFloat(qPart) : 1;
      return {
        primary: tag.trim().split('-')[0].toLowerCase(),
        q: Number.isFinite(q) ? q : 1,
      };
    })
    .sort((a, b) => b.q - a.q);

  for (const { primary } of candidates) {
    if (isSupportedLocale(primary)) {
      return primary;
    }
  }
  return DEFAULT_LOCALE;
}
