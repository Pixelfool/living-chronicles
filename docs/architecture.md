# The Living Chronicles — Architecture

### *Every World Writes Its Own Legend.*

**Status:** Target architecture (long-term) — this is the destination, not the build order
**Audience:** Solo founding developer, future contributors, plugin authors
**Horizon:** Designed to remain maintainable for ~10 years by a small/solo team, extensible by a community

---

## 0. How to Read This Document

This is a decision record, not a tutorial. Every major choice includes *why*, what was *rejected*, and *when to revisit*. If you're a future contributor (including future-you), start here, then read the ADRs in `docs/adr/` for the fuller reasoning behind any single decision.

**Read `vision.md` first if you haven't.** It answers *why this project exists* — every decision below is in service of one goal: making it possible for every world running this game to become its own place, with its own legend. This document is the *how*, not the *why*; if a section here ever seems to drift from that goal, `vision.md` is the tiebreaker, not this one.

**This document describes where the system should eventually be able to go — it is not the order in which to build it.** `build-plan-v1.md` is the actual implementation roadmap: it defers most of this document's infrastructure behind explicit trigger conditions, and draws a hard line between **plugin-ready** (the core is shaped so this architecture stays reachable) and **plugin-complete** (this architecture is actually built). If you're about to write code, read `build-plan-v1.md` first. Read this document to know what you're building toward, and why each piece exists, so that when a trigger condition fires, the design is already thought through instead of improvised under deadline pressure.

**Ground rule for the whole project:** build for the scale you have (one dev, one VPS), in a shape that doesn't have to be rewritten when you get the scale you want (a community, real concurrency, real money moving through the economy). That tension is the spine of every decision below.

### Revision History

- **v1:** Initial architecture, covering the 14 requested deliverables.
- **v2 (this version):** Incorporates a critical self-review. Four issues turned out to be real bugs-waiting-to-happen, not just style preferences, and got structural fixes: cross-module transactional consistency (§4.4), event bus failure isolation (§4.7), module-boundary enforcement being weaker than implied (§4.4), and background-job process isolation (§2, §9). Several other decisions turned out to be real, load-bearing limitations that v1 described too optimistically — those are now stated plainly rather than glossed over (plugin hot-install, auth model vs. multi-client goals, SPA vs. SEO/accessibility). Keeping this changelog is itself the discipline the ADR process asks for — don't delete it in v3, add to it.

---

## 1. Key Decisions at a Glance

| Concern | Decision | Alternative rejected (for now) |
|---|---|---|
| Language/runtime | TypeScript on Node.js | Go (plugin loading too hard), Python (weaker typing/real-time story), PHP (viable but weaker DI/typing ergonomics) |
| Backend framework | NestJS, with tiered internal layering (see §4.3) | Raw Express/Fastify (no enforced structure — bad for solo 10-yr maintenance); *also considered and rejected reversing this: Nest's ceremony is real overhead, mitigated by not applying full hexagonal layering everywhere* |
| Architecture style | Modular monolith, hexagonal layering *for complex modules only*, DDD bounded contexts | Microservices (operational overhead you can't afford yet); uniform hexagonal layering everywhere (overkill for CRUD-shaped modules) |
| Cross-module writes | Orchestrating application services for tightly-coupled multi-module transactions (§4.4) | Pure event-driven writes for everything (loses atomicity on operations like "buy item") |
| Database | PostgreSQL | MongoDB (game data is relational: players, items, guilds, trades) |
| ORM | Prisma, one schema — module boundary is a **convention enforced by CI tooling**, not a structural guarantee (§4.4) | Drizzle (close second — see §4.6) |
| Cache / sessions / event transport | Redis, **used for session storage from v1**, not just cache | Kafka/RabbitMQ (overkill at this scale) |
| Background jobs | BullMQ, **run in a dedicated worker process, separate from the API process** | Running jobs inline in the API process (blocks the event loop under load — this was a v1 gap) |
| Real-time | WebSocket gateway (Socket.IO) for chat/presence/notifications only | Full real-time combat protocol (not needed — combat is turn-based) |
| Event bus | In-process typed emitter, **wrapped for per-listener error isolation and selective durability** (§4.7) | Raw EventEmitter2 with no containment (v1 gap — a single bad plugin listener could crash the process) |
| Auth | httpOnly session cookie for the first-party web client; **separate token-based path reserved for third-party/mobile clients when they exist** | Pure JWT-in-localStorage (XSS risk); pretending cookie-only auth satisfies "API-first for future clients" (it doesn't — said so now) |
| Frontend | React SPA for the authenticated game; **lightweight SSR/static rendering for public, pre-auth, SEO-relevant pages** (landing, leaderboards, guild pages) | Pure SPA for everything (v1 default — hurts first-paint and SEO for exactly the pages that benefit from being discoverable) |
| Monorepo tooling | pnpm workspaces now; **add Turborepo only once build times actually hurt** | Turborepo from day one (v1 default — likely solving a problem you don't have yet) |
| CQRS | **Rejected for now** | Revisit only if one bounded context (likely Economy or Combat) has read/write patterns that genuinely diverge |
| Event Sourcing | **Rejected for now** | Use append-only audit logs for economy-critical actions instead — 90% of the benefit, 10% of the cost |
| Microservices | **Rejected for now** | Modular monolith is explicitly built so it *can* split later without a rewrite |
| GraphQL | **Deferred** | Add only if/when you build a data-hungry admin dashboard or third-party clients need flexible queries |
| Plugin model | Two-tier: **Content Packs** (data, no code) and **Code Plugins** (npm packages, trusted). **Explicitly: install/update = rebuild + redeploy, not runtime hot-swap** in v1 | Fully sandboxed, hot-loadable untrusted plugins — real future need, not a v1 problem, and not implied to already exist |
| Deployment | Docker Compose on a single VPS, **migrations run as a gated step before traffic cutover** (§11) | Kubernetes (you don't have the scale or the ops budget for this); naive `up -d` with no migration ordering (v1 gap) |
| Localization | **Rules only for now** — message-hygiene discipline (§4.12) that keeps every future module translation-ready; no library, loader, or resolution mechanism chosen yet | Committing to i18next / nestjs-i18n / a custom service today — premature while Combat, Quests, NPC dialogue, and plugin content haven't defined what localization actually needs to support |

Every "rejected for now" is a trigger condition, not a permanent no — spelled out in each section.

---

## 2. System Overview

```
                        ┌─────────────────────────┐
                        │  React SPA (game, auth) │
                        │  + SSR/static (public   │
                        │  landing & leaderboard  │
                        │  pages — SEO, fast load)│
                        └────────────┬────────────┘
                                     │ HTTPS (REST) + WSS (Socket.IO)
                        ┌────────────▼────────────┐
                        │   Nginx (TLS, static)   │
                        └────────────┬────────────┘
                                     │
                        ┌────────────▼────────────┐        ┌──────────────────┐
                        │   NestJS API process     │◄──────►│  Worker process   │
                        │   (modular monolith,      │        │  (BullMQ consumer,│
                        │   hexagonal for complex    │        │  separate Node    │
                        │   modules)                │        │  process — heavy  │
                        │   ◄── Plugin loader        │        │  jobs never block │
                        │   ◄── Content pack loader  │        │  API requests)    │
                        └───┬─────────┬─────────┬───┘        └─────────┬────────┘
                            │         │         │                       │
                  ┌─────────▼──┐ ┌────▼────────▼─┐             ┌───────▼───┐
                  │ PostgreSQL │ │     Redis      │             │  BullMQ   │
                  │  (state)   │ │ (cache, session│◄────────────┤  (queue,  │
                  │            │ │  store, pub/sub)│            │ scheduled │
                  │            │ │                │             │  jobs)    │
                  └────────────┘ └────────────────┘             └───────────┘
```

**Change from v1:** the worker is now drawn as a separate process, not a detail buried in prose — this is load-bearing, not cosmetic. It's the fix for §9's "heavy background job stalls the whole game" failure mode.

---

## 3. Module Overview (Bounded Contexts)

Unchanged from v1, with one addition: each module is now explicitly tagged by its layering tier (see §4.3) so it's clear which ones warrant full hexagonal treatment and which don't.

| Module | Owns | Layering tier | Notable events it emits |
|---|---|---|---|
| **Identity** | Accounts, auth, sessions | Rich | `PlayerRegistered`, `PlayerLoggedIn` |
| **Character** | Character sheet, stats, leveling | Rich | `CharacterCreated`, `PlayerLevelUp` |
| **Combat** | NPC combat, PvP resolution (server-authoritative) | Rich | `BattleStarted`, `BattleFinished` |
| **Inventory & Items** | Item instances, equipment | Rich | `ItemAcquired`, `ItemEquipped` |
| **Crafting & Professions** | Recipes, profession progression | Rich | `ItemCrafted`, `ProfessionLeveledUp` |
| **Economy** | Shops, trading, currency, audit log | Rich | `TradeCompleted`, `ShopPurchase` |
| **Guilds** | Guild membership, roles, guild bank | Rich | `GuildCreated`, `GuildMemberJoined` |
| **Social** | Friends, private messages, global chat (via WS gateway) | Light | `FriendRequestSent`, `ChatMessagePosted` |
| **Quests** | Quest state machine, objectives | Rich | `QuestAccepted`, `QuestCompleted` |
| **World** | Cities, dungeons, exploration, movement | Light | `PlayerEnteredLocation`, `DungeonCleared` |
| **Events & Progression** | Achievements, leaderboards, seasonal events | Light | `AchievementUnlocked`, `SeasonStarted` |
| **Admin & Moderation** | Bans, mutes, content flags, admin actions | Light | `PlayerBanned`, `ContentReported` |
| **Plugin Runtime** | Plugin lifecycle, content pack loading | Rich | `PluginLoaded`, `PluginRegistrationFailed` |

"Rich" = has real domain logic worth isolating from the framework (combat resolution rules, crafting/leveling formulas, economy invariants). "Light" = mostly CRUD with a thin service + repository, no forced domain/application/infrastructure split. Promote a Light module to Rich the moment its logic actually gets complex enough to need it — don't do it preemptively, and don't resist doing it once the signal shows up.

---

## 4. Deep-Dive Decisions

### 4.1 Language & Runtime: TypeScript on Node.js

Unchanged from v1 — this held up under review. One addition from the self-review: Node's single-threaded event loop means CPU-heavy work (bulk recalculation, mass content re-seeding) must never run inline in the API process. This is now a structural decision, not a footnote — see §2 and §9.

*(Full rationale and rejected alternatives: unchanged from v1 — TypeScript's unified stack and refactoring safety over Go's plugin-loading limitations, Python's weaker typing/real-time story, and PHP's weaker DI ergonomics.)*

### 4.2 Backend Framework: NestJS — Reviewed Honestly

**The v1 case still holds:** DI, `EventEmitterModule`, Guards/Interceptors/Pipes, WebSocket Gateways, and a migration path to extracted microservices all map directly to your stated principles.

**What the self-review added:** NestJS's decorator/DI ceremony is real overhead for a solo developer, especially in early milestones building CRUD-shaped features (friends list, achievements) that don't have complex domain logic yet. Applying full DI-container discipline and four-layer hexagonal structure to *every* module from M0 would tax exactly the milestones (M0–M2) where you most need to move fast and learn the domain.

**Resolution:** the tiered layering in §4.3 is the actual fix — Nest's structural tools stay available project-wide, but you only pay the ceremony cost where the domain complexity justifies it.

### 4.3 Architecture Style: Modular Monolith, Tiered Layering, DDD

**Rich modules** (Combat, Economy, Crafting, Character, Inventory, Quests, Identity, Plugin Runtime) keep the full split:

```
module/
  domain/          — entities, value objects, domain events, domain services (zero framework deps)
  application/      — use cases / command & query handlers, orchestrates domain + ports
  infrastructure/    — Prisma repositories, external adapters, implements the ports
  interface/         — REST controllers, WebSocket gateways, DTOs
```

**Light modules** (Social, World, Events & Progression, Admin & Moderation) use a flat `service + repository` pattern — no forced domain layer. This is a deliberate rejection of my own v1 default of applying hexagonal structure uniformly; uniform application was over-engineering for the CRUD-shaped modules and would have cost real solo-dev velocity for no corresponding benefit.

**Why not microservices now:** unchanged from v1 — one developer, one VPS, none of the independent-scaling/independent-deployment benefits are worth the distributed-systems cost yet.

### 4.4 Module Boundaries and Cross-Module Transactions — the v1 Gap

This is the most consequential fix from the self-review, so it gets its own subsection instead of a passing mention.

**The honest state of the boundary:** all modules share one Prisma schema and one generated `PrismaClient`. Nothing at the type-system or runtime level stops Module A's repository from querying Module B's table directly. The boundary is a **convention enforced by a `dependency-cruiser` rule in CI** (§9) — real, but a lint rule, not a database-level guarantee. Say this plainly rather than implying more structural safety than exists. Full Postgres-schema-per-module separation was considered and is still not worth the migration complexity at this scale — but know that the current boundary is a promise you're keeping by discipline plus a CI check, not by construction.

**The transactional consistency problem:** a straightforward reading of "modules talk only through events" breaks the moment an operation needs atomicity *across* modules — the canonical example being a shop purchase: check + deduct gold (Economy), grant an item (Inventory), possibly check a level gate (Character). If Economy fires a fire-and-forget `GoldDeducted` event for Inventory to react to, you get a real failure mode: gold is spent, the process restarts or the listener throws, and the item is never granted. This is exactly the kind of bug that erodes player trust in a game's economy, and v1's architecture didn't rule it out — it just didn't mention it.

**Fix — orchestrating application services for tightly-coupled writes:** operations that must be atomic across modules (purchases, trades, crafting-that-consumes-and-produces-items) are implemented as an explicit **use case in a thin orchestration layer** (e.g., `PurchaseItemUseCase`), which:
1. Opens a single Postgres transaction (legitimate, since it's genuinely one database).
2. Calls each affected module's *transactional* repository method within that transaction (Economy's `debitGold(tx, ...)`, Inventory's `grantItem(tx, ...)`).
3. Commits atomically — succeeds or fails as a unit.
4. **Only after commit**, emits events for side effects that are genuinely fine to be eventually-consistent (`ShopPurchase` for achievement-progress checks, analytics, notifications).

This means events are reserved for what they're actually good at — decoupled, eventually-consistent side effects — and are no longer being asked to carry transactional correctness they were never designed to guarantee. Domain layers stay pure (§4.3); only this thin orchestration layer is allowed to know about more than one module's repositories, and it's a small, auditable set of use cases (purchases, trades, crafting) — not a general escape hatch.

### 4.5 Database: PostgreSQL

Unchanged from v1 — the relational shape of the domain (players, items, guilds, trades, all with real referential relationships) still makes this the right call over MongoDB.

### 4.6 ORM: Prisma (with Drizzle noted as a real alternative)

Unchanged recommendation, but see §4.4 above for the honest caveat about what Prisma does and doesn't enforce regarding module boundaries — that caveat is the actual update here.

### 4.7 Event Architecture — Now With Failure Isolation and Selective Durability

**The v1 gap:** a raw `EventEmitter2` setup gives no isolation between listeners. An unhandled exception in one plugin's event handler, or an unhandled promise rejection from an async listener, can propagate and — on a single-process, single-VPS deployment with no failover instance — take down the entire game server. With core modules *and* an unknown number of third-party code plugins all listening on the same bus, this is the highest-blast-radius weak point in the whole design, and v1 treated the event bus as inert plumbing.

**Fix — a thin `CoreEventBus` wrapper around EventEmitter2** that every emit and every listener registration goes through, providing:
1. **Per-listener error containment:** each listener invocation is wrapped in try/catch (or `Promise.allSettled` for async listeners) — one handler throwing never propagates to crash the emitting call site or the process. Errors are logged with the offending plugin/module identified.
2. **Per-plugin failure tracking:** a plugin whose listener fails repeatedly within a time window gets its listeners automatically disabled and logged loudly, rather than silently degrading the whole event bus or repeatedly crashing.
3. **Selective durability:** most events remain fire-and-forget in-memory (fine — chat notifications, achievement-progress checks are OK to lose on a restart). But a small, explicitly marked set of **critical events** (anything Admin/Moderation or Economy audit-relevant) get an additional synchronous write to the `audit_log` table (§4.9, unchanged from v1) *before* the event is emitted — so the record of "what happened" survives a crash even if the async listener reacting to it doesn't run.

This keeps the in-process emitter (still the right call over a message broker at this scale — see unchanged rationale below) while removing the two things v1 got wrong about it: no error containment, and an implicit assumption that "fire an event" was an acceptable substitute for "record what happened" for consequential actions.

*(Unchanged from v1: rejection of Kafka/RabbitMQ at this scale, and the trigger condition — revisit if a module is extracted into its own service and needs cross-process durable messaging.)*

### 4.8 Frontend — Hybrid, Not Pure SPA

**The v1 gap:** a pure client-rendered SPA for literally everything is in tension with two things I'd already committed to elsewhere in the same document — "simple to learn, easy to play in short sessions" (a blank-page-until-JS-loads first paint works against low-friction accessibility) and any hope of organic discovery (zero SEO for a "community-driven" project's own public pages).

**Fix:** the authenticated game itself stays a React SPA (this part of the v1 reasoning holds — it's genuinely interactive, session-based, not discovery-relevant). Public, pre-auth, SEO-relevant pages — landing page, public leaderboards, public guild pages — are server-rendered or statically generated instead, as a separate lightweight surface sharing the same API. This is a small addition in scope (one more rendering path), not a reversal of the API-first decision — both surfaces consume the same versioned REST API.

### 4.9 Content Format: YAML (with JSON Schema validation) — Now With Cross-Plugin Referential Integrity

**The v1 gap:** each content pack was validated against its own schema in isolation. Nothing checked whether a reference *between* content packs from different plugins actually resolves — e.g., Plugin B's quest referencing a monster ID that only Plugin A defines. If Plugin A is later disabled, that reference silently dangles, and a player can end up stuck on a quest referencing a monster that no longer exists.

**Fix:** plugin manifests (§5.3) now declare explicit content dependencies on other plugins/content packs, not just a core-version range. The content loader validates referential integrity across the **currently-enabled set** at startup — not just per-file schema validity — and fails loudly, before accepting traffic, if a declared or detected dependency is missing.

*(Unchanged from v1: YAML over JSON for human-authorability, YAML over TOML for handling deeply nested/list-heavy structures like loot tables.)*

### 4.10 CQRS and Event Sourcing: Still Rejected For Now

Held up under review — restated from v1 with trigger conditions unchanged: introduce `@nestjs/cqrs` only in a specific module (most likely Leaderboards or Economy) if its read patterns genuinely diverge from its write model; the audit-log approach (§4.9 unchanged, now reinforced by §4.7's synchronous-write-before-emit fix) continues to cover the auditability need without committing to full event sourcing.

### 4.11 Real-Time: WebSocket Gateway, Scoped to Chat/Presence/Notifications

Unchanged from v1 — still the right scope given turn-based combat. One addition: session store is now Redis-backed from v1 (§7), which happens to also be exactly what the Socket.IO Redis adapter needs for future multi-instance chat — a case where fixing one gap (session store choice) removes a future migration step for a different concern almost for free.

### 4.12 Localization / i18n — Rules Now, Mechanism Later

**Status:** this section defines binding *rules* for how user-facing text gets written from here on. It deliberately does **not** choose a translation library, loader, or runtime resolution mechanism — that choice depends on requirements that don't exist yet (Combat's floating combat text and status effects, Quests' branching dialogue, NPC flavor text, plugin-provided content packs). Committing to a specific mechanism now, before any of those modules exist, risks building infrastructure shaped by a guess instead of a real requirement — exactly the mistake §1's "don't build ahead of need" and §5.2's plugin-loader honesty already warn against elsewhere in this document. What's fixed today is the *shape* of the code every module writes, not the machinery that will eventually read it.

**Rule 1 — no user-facing string is assembled by concatenation.** A message with a dynamic value (a count, a name, a price) is written as one complete template with named placeholders, never built by joining translated fragments around a raw value in code (`'only ' + count + ' left'` is exactly what this rule forbids). This is the one rule that can't be retrofitted cheaply later — concatenation bakes in English word order and grammar that a language like German (different word order, case-dependent noun forms) often can't just slot a value into. Every other rule below is about organization; this one is about correctness, and it applies **today**, to code being written right now, regardless of whether a translation system exists yet.

**Rule 2 — one message, one place.** A given user-facing message is defined once per module and referenced, not re-typed with slightly different wording every time the same situation occurs. This isn't new ceremony — it's the same discipline as not duplicating a magic number — but it's what makes a later mechanical extraction (message → key) a find-and-replace instead of an audit.

**Rule 3 — messages stay out of domain logic's control flow.** A service decides *that* it needs to communicate something to the player and *what data* that message needs (a count, a name, an ID) — it does not decide *how* that gets displayed. Concretely: exception messages, WebSocket error payloads, and any other player-facing text are plain, self-contained values passed to `throw`/`emit`, not built inline from branching string logic scattered through a method body.

**Rule 4 — locale, if and when it exists, is request-derived context passed explicitly.** *If* a resolution mechanism is introduced later, it must follow the same pattern this codebase already uses for other request-derived context (session `userId`, the CSRF token): a controller or gateway reads it and passes it into the service as an ordinary parameter. No request-scoped DI, no `AsyncLocalStorage`, no ambient state — that would force request-scoped lifecycle onto every service that wants to localize a message, module by module, which is a real cost this document has repeatedly said not to pay before it's needed (§4.3). This rule is written now, ahead of the mechanism, specifically so nobody reaches for the framework-idiomatic-but-expensive option by default once a library gets picked.

**Deliberately left open, until real requirements exist:**
- Which library or custom mechanism eventually resolves a message/key to display text (i18next, nestjs-i18n, a small custom loader, or something else) — genuinely undecided, see the rejected alternative in §1's table.
- How locale is determined for a given request (header, stored per-user preference, plugin-defined logic).
- Plural/grammar-rule complexity — Combat, Quests, and NPC dialogue haven't been designed yet, and may need more than a simple one/other plural rule (a proper library earns its keep exactly here, if it turns out to be needed).
- Whether resolution happens server-side or client-side, once a real client exists.

**What changes immediately:** nothing is retrofitted — the ~80 existing hardcoded exception messages across Combat, Guilds, Economy, Social, etc. stay exactly as they are (`build-plan-v1.md` §4 tracks converting them as each module is next touched for a real feature reason, not as a standalone pass). What changes is discipline going forward: **new** user-facing strings, in new or actively-touched modules, follow Rules 1–3 above from the moment they're written — plain, complete English messages today, organized so that giving them a translation key later is mechanical, not a rewrite.

---

## 5. Plugin Architecture

### 5.1 Content Packs (data only, no code, trusted by default)

Unchanged from v1, with the referential-integrity fix described in §4.9.

### 5.2 Code Plugins — Stated Honestly This Time

Unchanged trust model from v1 (in-process, npm packages, same trust level as core — a deliberate, documented v1 boundary, not an oversight).

**The v1 framing gap:** describing this as "the plugin system" without saying plainly that it does not support runtime hot-install risks implying more dynamism than exists. Stated plainly now: **installing or updating a code plugin means adding/updating an npm dependency, rebuilding the Docker image, and redeploying.** There is no self-service "admin installs a plugin from a UI while the game stays up" capability in this design, and there shouldn't be yet — that would require solving plugin isolation (§5.2 original) and a hot-loading mechanism (dynamic module federation or similar) simultaneously, which is real, separate engineering work belonging in §16, not something to half-imply exists now.

For a solo operator this limitation is genuinely fine — you're both the developer and the one doing the redeploy. It becomes a real constraint the moment "community-driven" means someone other than you wants to add a plugin without your involvement in every deploy — which is a good concrete signal for when to prioritize the hot-loading roadmap item.

### 5.3 Plugin Lifecycle

Unchanged from v1, with one addition: manifests now include a `contentDependencies` field alongside `coreVersionRange`, feeding the referential-integrity check in §4.9.

---

## 6. Data Architecture

Unchanged from v1 for core state and content, with the save/schema versioning strategy now made concrete instead of left vague:

**Migration strategy — eager batch, not lazy:** v1 gestured at "a migration script path" without deciding when it runs. At this scale (one small-to-medium Postgres instance, not millions of rows), lazy per-record migration-on-read is unnecessary complexity that would require the application to understand N historical schema versions simultaneously. Instead: schema-version migrations for save/character data run as an **explicit batch job during deploy**, before the new application version starts accepting traffic (see §11) — the same discipline as a Prisma migration, just scoped to save-data shape changes that aren't simple column adds.

---

## 7. Security Considerations

Unchanged items from v1 (server-authoritative combat/RNG, input validation, CSRF via SameSite + double-submit, combat/trade/chat rate limiting, plugin trust boundary, dependency hygiene) all held up under review. Additions from the self-review:

- **Session store is Redis-backed from v1**, not deferred to "when you need to scale horizontally" — it costs nothing extra now (Redis is already a dependency) and removes a migration step from the future horizontal-scaling path (§8).
- **Registration/login-specific rate limiting and bot mitigation**, distinct from the gameplay rate limits already specified — account creation and login are the actual target for credential-stuffing and bot-farmed accounts feeding gold/item farming, which v1's economy-exploit mitigation didn't cover because it only addressed in-game actions, not account creation itself.
- **Auth model vs. multi-client goal, reconciled:** httpOnly session cookies remain correct for the first-party web client's XSS resistance, but I was asserting an "API-first, future mobile/third-party clients" goal elsewhere in the same document while picking an auth model that doesn't actually extend to those clients. Resolution: cookie-session auth for the web client now; a **separate token-based auth path (short-lived JWT + refresh rotation, or scoped API keys) is reserved and documented as required infrastructure the day a second client type actually exists** — not built speculatively now, but no longer silently contradicted either.
- **Data protection / account deletion:** not addressed at all in v1. A public multiplayer game collecting accounts needs an account-deletion and data-export flow eventually; noted here and added to Identity module's backlog (§16) rather than designed now, since it's a real requirement but not a v0–v1 blocker.

---

## 8. Scalability Considerations

Unchanged structural analysis from v1 (what breaks first: WebSocket connections → DB write contention → single-instance ceiling, and the fixes for each). One correction from the self-review: v1 asserted vertical scaling "probably takes you further than you'd expect" with no basis for the claim. **Replaced with a concrete recommendation:** establish a lightweight load-testing pass (k6 or similar, scripted against realistic combat/trade/chat traffic patterns) as a pre-launch milestone item (§14) so the vertical-scaling runway is a measured number, not an assumption, before you're relying on it in production.

The separate worker process (§2, §9) also directly addresses one scaling/reliability axis v1 missed: CPU-bound background jobs no longer compete with the API process for event-loop time, which was a real bottleneck-and-incident risk, not just a performance nicety.

---

## 9. Repository Structure

```
/apps
  /api                 — NestJS API process
  /worker              — BullMQ worker process (separate from api — see §2, §4.1)
  /web                 — React SPA (authenticated game)
  /site                — SSR/static public pages (landing, leaderboards) — new in v2, see §4.8
/packages
  /shared-types        — DTOs/types shared across api, web, site
  /plugin-sdk          — types/interfaces for plugin authors
  /content-schema      — Zod/JSON Schema definitions, now including cross-pack dependency validation (§4.9)
/plugins
  /example-plugin       — reference implementation; note real third-party plugins are external npm packages, not repo contents (§5.2)
/content
  /core                 — the base game's own YAML content
/infra
  docker-compose.yml
  /nginx
/docs
  ...                   — see §10
/.github/workflows
  ci.yml
  deploy.yml
```

**Tooling change from v1:** pnpm workspaces alone for now; **Turborepo deferred** until build times are an actual measured problem, not adopted preemptively.

**Unchanged and reinforced:** the `dependency-cruiser` rule enforcing module-boundary imports is not an optional nice-to-have anymore — given §4.4's honest assessment that this rule is the *primary* real enforcement of module boundaries (not just a style preference), it belongs in CI starting at M0, not added later once habits (and violations) have already accumulated.

---

## 10. Documentation Structure

Unchanged from v1.

---

## 11. CI/CD & Deployment

Unchanged CI steps from v1 (lint, typecheck, unit/integration tests, dependency-cruiser check). **CD sequencing fixed** based on the self-review — v1's `docker compose pull && up -d` didn't sequence database/save-data migrations against the container swap, risking new code briefly hitting an old schema or vice versa:

1. Run Prisma migrations and any pending save-data batch migrations (§6) as a distinct, gated step.
2. Only after migrations succeed, pull and start the new containers.
3. Health-check the new containers before considering the deploy complete.

Brief downtime during this sequence is an explicitly accepted tradeoff at hobby scale, not an oversight — true zero-downtime (blue-green behind Nginx) is a reasonable future upgrade once actual uptime expectations justify the added complexity, not a v1 requirement.

Backups: unchanged from v1 (automated, off-VPS).

---

## 12. Testing Strategy

Unchanged core strategy from v1 (unit tests on pure domain logic for Rich modules, integration tests against containerized Postgres, E2E via Supertest/Playwright, plugin conformance tests). Additions from the self-review:

- **Content-pack validation tests:** referential integrity across the enabled content-pack set (§4.9), and sanity checks on data shape (e.g., loot table weights summing to a sane total, quest chains having no orphaned steps) — v1 mentioned plugin conformance tests but never addressed testing the *content* plugins ship, which is at least as likely a source of runtime breakage.
- **Load testing** as a named pre-launch activity (§8, §14), not left implicit.

---

## 13. Observability

Unchanged from v1 — right-sized for hobby scale held up under review; no changes.

---

## 14. Development Roadmap

Unchanged milestone sequence from v1, with two additions reflecting the self-review:

| # | Milestone | Playable result | Change from v1 |
|---|---|---|---|
| M0 | Scaffolding: monorepo, CI, Docker Compose dev env, health-check endpoint | "Server is alive" page | **dependency-cruiser boundary rule now included at M0, not added later** |
| M1–M14 | Unchanged from v1 | — | — |
| M15 | Seasonal events, polish, public beta | Public-facing launch | **Load-testing pass (§8) now an explicit pre-M15 gate, not assumed** |

---

## 15. Risk Analysis

Unchanged risks from v1 remain valid. New risks identified in the self-review:

| Risk | Mitigation |
|---|---|
| Cross-module writes lose atomicity if implemented as pure fire-and-forget events (e.g., paid-but-no-item bugs) | Orchestrating application services with real DB transactions for tightly-coupled writes (§4.4) — a small, explicit, auditable set of use cases, not a general pattern |
| A single failing plugin event listener crashes the whole process (no other instance to fail over to) | `CoreEventBus` wrapper with per-listener error containment and per-plugin failure tracking (§4.7) |
| Module boundary is a CI lint rule, not a structural guarantee — can erode silently if the rule is ever weakened or bypassed | Treat the dependency-cruiser rule as load-bearing infrastructure from M0 (§9), not an optional nicety; don't let "just this once" exceptions accumulate |
| Heavy background jobs block the API's event loop, causing platform-wide lag during a single job | Dedicated worker process, separate from the API process (§2) |
| "Community-driven, easily extended" implies more plugin dynamism than the in-process/redeploy model actually delivers | State the limitation plainly (§5.2) rather than let expectations diverge from reality; hot-loading is a named future roadmap item with a clear trigger condition |
| Registration/login bot abuse (gold-farming account mills), not covered by in-game rate limits | Dedicated rate limiting and bot mitigation at registration/login (§7) |

---

## 16. Future Expansion Ideas

Unchanged from v1, with additions from the self-review:

- Mobile app or third-party clients — now explicitly requires building out the reserved token-based auth path (§7), not just "the API is already there."
- Runtime hot-loadable plugin registry (dynamic module federation or similar) — the actual fix for §5.2's stated limitation, once there's a real community submitting plugins independently of your own deploy cadence.
- WASM-sandboxed plugin tier for genuinely untrusted community submissions (unchanged from v1).
- Account deletion / data export flow for the Identity module (§7 — newly identified, not previously mentioned at all).
- In-game admin content editor, reducing the git-plus-redeploy friction for quick content tweaks (implicitly assumed but never stated as a limitation in v1 — content contribution currently requires the same redeploy cycle as code plugins).
- Blue-green zero-downtime deploys, once actual uptime expectations justify it (§11).
- Horizontal scaling / read replicas / module extraction, per §8, once load-testing data (not assumption) says it's warranted.
- Everything else from v1 (GraphQL for dashboards, guild wars as a plugin proving case, seasonal resets, localization via content packs, a plugin discovery site) remains valid and unchanged.

---

## 17. Open Questions For You

Unchanged from v1 — still worth deciding before M0:

1. Single persistent world, or multiple realms/shards from the start?
2. Open source license and contribution model (including a lightweight plugin submission/review process, given §5.2's clarified reality that plugins currently require your direct involvement to ship anyway).
3. Frontend approach — the hybrid model in §4.8 is now the default recommendation rather than a pure SPA; still worth confirming before M0 since it adds one more app (`/apps/site`) to the initial scaffolding.

---

*Next step, if this direction looks right: I can turn Milestone 0 into a concrete scaffolding checklist — now including the dependency-cruiser rule and the separate worker process from the start — or draft the first ADRs (0001–0004, adding one for the cross-module transaction pattern in §4.4) to formalize the decisions above. I won't write production code until you ask for it.*
