# ADR-0001: Localization Principles

**Status:** Accepted
**Date:** 2026-07-21
**Related:** `architecture.md` §4.12 (Localization / i18n), §1 (Key Decisions), §4.9/§5.1 (content pack self-containment)

## Context

`vision.md` and the community-driven ambitions behind this project imply eventual multi-language support, including plugin-provided content, with English and German as the two languages named concretely so far. At the time of this decision, M7 (Economy) has just shipped and no module that would meaningfully define localization's real shape exists yet: Combat's floating text and status effects, Quests' branching dialogue, NPC flavor text, and plugin-provided content packs are all still unbuilt. Background jobs and any future non-HTTP API surface (a mobile client, third-party integrations — `architecture.md` §7) may also need to produce player-facing text with no request in scope at all.

Establishing localization discipline *now*, while the codebase is still small, is valuable — retrofitting it once dozens of modules have organically grown ad hoc, inconsistently worded, sometimes-concatenated user-facing strings is expensive and error-prone (`architecture.md` already counts roughly 80 hardcoded exception messages across the modules built through M7). But the concrete mechanism — translation library, locale resolution, plural handling — can't yet be chosen well, because none of the modules that would actually stress-test it exist. An earlier draft of this decision built a working custom `I18nService` and wired it into two modules; on review, that was premature for exactly this reason (see Rejected Alternatives) and was reverted.

## Decision

Fix architectural *principles* now. Leave the *mechanism* undecided until real requirements exist.

1. **No user-facing message is assembled by concatenation.** A message with a dynamic value (a count, a name, a price) is a complete template with named placeholders, never built by joining translated fragments around a raw value in code. This is the one principle that can't be retrofitted cheaply later — concatenation bakes in English word order and grammar that a language like German (different word order, case-dependent noun forms) often can't just slot a value into, no matter what mechanism eventually does the translating.

2. **One message, one place.** A given user-facing message is defined once per module and referenced, not re-typed with slightly different wording every time the same situation occurs — the same discipline as not duplicating a magic number, and what makes a later mechanical extraction (message → key) a find-and-replace instead of an audit.

3. **Business logic never depends on localized text.** A service, guard, or event handler makes every decision on domain objects, typed error/result codes, event names, or IDs — never by inspecting, comparing, or branching on a translated (or even default-locale) display string. Localized text is presentation, produced *from* a decision the domain has already made, for reasons entirely its own; it is never an input to one.

4. **Plugins own their own localization resources.** A plugin or content pack that introduces its own user-facing text is responsible for its own translations, independently of core. Core is never a bottleneck for a plugin's language coverage, and a plugin's translations never need to live inside, or be merged into, core's own resource files — the same self-containment `architecture.md` §4.9/§5.1 already require of content packs generally.

## Consequences

- New user-facing strings, in new or actively-touched modules, follow principles 1–3 immediately: plain English today, but never concatenated and never duplicated with inconsistent wording.
- The ~80 existing hardcoded messages across Combat, Guilds, Economy, Social, etc. are **not** retrofitted as a consequence of this ADR — they're converted incrementally, module by module, the next time that module is touched for a real feature reason (`build-plan-v1.md` §4).
- No new runtime dependency, module, or code is introduced by this decision.
- The following remain explicitly open, to be resolved by a future ADR once real requirements exist:
  - Translation library/mechanism (i18next, nestjs-i18n, a custom loader, or something else).
  - Locale resolution and threading — for an HTTP request, a WebSocket connection, a background job, or a plugin-triggered event with no request in scope at all.
  - Plural/grammar-rule complexity beyond English/German's simple one/other categories.
  - Server-side vs. client-side resolution, once a real client exists.
  - The concrete mechanics of "a plugin owns its translations" (a directory core discovers, a self-registered resource, something else).

## Rejected Alternatives

- **Adopting i18next or nestjs-i18n now.** Both are mature, capable libraries, rejected on timing, not merit — committing to a resolution mechanism before Combat, Quests, NPC dialogue, or plugin content exist risks building infrastructure shaped by a guess instead of a real requirement.
- **A custom `I18nService`, built and wired in now.** An early draft of this exact decision did this: a small JSON-catalog service, loaded like the content pack, wired into `FriendsService` and `ChatGateway`. It was reverted after review — even a deliberately small custom service is still a mechanism decision, and design choices made inside it (how locale is threaded through a call, how plugins would register resources) would have been guesses in exactly the same way a full library's would, just with less capability to show for it.

## Revisit When

A second language is actually being shipped to players (not just discussed), or enough post-M7 modules exist that the real shape of "what needs translating" is visible enough to design the mechanism with actual data instead of a guess.
