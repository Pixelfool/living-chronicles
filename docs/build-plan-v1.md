# The Living Chronicles — Build Plan v1

### *Every World Writes Its Own Legend.*

**Status:** Living implementation roadmap — not an architecture document
**Companion documents:** `vision.md` (why this exists), `architecture.md` (the long-term target — this document is the route there, not a replacement for it)
**Audience:** You, the solo developer, actually writing code today

---

## 0. Purpose

`architecture.md` describes what the system should eventually be able to become. This document describes what to actually build, starting now, as one person, in what order — and just as importantly, what to deliberately *not* build yet. Where the two disagree about what belongs in the code today, this document wins: it is the deliberately incomplete, more conservative version of the same target, not a competing opinion about the target itself.

Every simplification below is a **documented, reversible choice with a named trigger condition**, not a guess about what you'll never need. When a trigger fires, the corresponding section of `architecture.md` is already designed — you build it then, deliberately, instead of retrofitting it under pressure or, worse, guessing at a design you haven't thought through because you're mid-crisis.

---

## 1. The Central Discipline: Plugin-Ready, Not Plugin-Complete

Extensibility is a **product requirement** for this project — LoGD's longevity came from community extension, and that's a real, load-bearing part of the vision, not a technical nice-to-have. But a product requirement is not the same thing as "build the infrastructure for it before anyone needs it." The resolution is this distinction, and it governs every decision in this document:

- **Plugin-complete** (`architecture.md` §5) is the full two-tier system: a plugin loader, a manifest format, a versioned event/content contract, cross-plugin content dependency resolution, a documented trust model, and eventually the sandboxing to let genuinely untrusted third parties extend the game safely. Nobody needs this before a person other than you actually wants to extend the game.

- **Plugin-ready** means the code's *shape* doesn't foreclose that future, achieved through a small number of cheap habits adopted from day one — not through infrastructure:

  1. **Game content is data, not code, from the first line.** Cities, NPCs, monsters, items, and quests live in YAML (`architecture.md` §4.9), read by a loader — even though that loader supports exactly one pack (yours) and does none of the cross-pack dependency resolution the target architecture eventually needs. The day a second pack exists, you're adding a directory, not inventing a content system.
  2. **Cross-cutting actions go through named domain events, even with zero external subscribers.** When a player levels up, the code emits `PlayerLevelUp` and the leveling logic doesn't know or care who's listening — even though today the only listener is other core code, not a plugin. This is `architecture.md` §4.6's event catalog, minus the failure-isolation wrapper and durability guarantees in §4.7, which are additions for when a third party's code is actually on the bus, not before.
  3. **Code is organized by feature** (`combat/`, `inventory/`, `guilds/`) with a boundary you respect by habit — not by the domain/application/infrastructure layering in `architecture.md` §4.3, and not by a CI-enforced rule. This is the shape that *becomes* the module map in §3 later, without paying for hexagonal ceremony before any module has earned it.
  4. **Combat, loot, and currency logic is server-authoritative from day one.** This isn't a scale concern — it costs nothing extra to write it this way from the start, and it's genuinely expensive to retrofit once real trust and real players are on the line.
  5. **User-facing messages never get built by concatenation, from here on** (ADR-0001, `architecture.md` §4.12) — one complete template per message, named placeholders for dynamic values, no translation library or key format chosen yet. This is the one localization habit that actually can't be retrofitted cheaply later; everything else about *how* a message eventually gets displayed in another language is deliberately still undecided, waiting on requirements Combat, Quests, NPCs, and plugin content haven't produced yet.

Everything else in `architecture.md` — the plugin loader, the SDK, the trust model, the event bus's failure isolation, cross-module transaction orchestration *as reusable infrastructure* — is plugin-**complete** work. None of it belongs in v1. Building it now spends solo-developer time on infrastructure for plugin authors who don't exist, at the direct expense of the thing that actually determines whether this project survives its first two years: a game someone other than you wants to play.

---

## 2. The v1 Stack: One Deployable Application

- **Backend:** Node.js + TypeScript, a single process, organized by feature folders. Framework choice (lean NestJS, Fastify, whatever) matters far less than the discipline in §1 — don't spend more than an afternoon on this decision.
- **Database:** PostgreSQL + Prisma, one schema. Same technology as `architecture.md` §4.5/§4.6, without §4.4's boundary-enforcement tooling.
- **Frontend:** one React SPA. No separate SSR/static "site" app (`architecture.md` §4.8) — if you want a public landing page at all, it's one hand-written static HTML file, no framework, an afternoon of work.
- **Background jobs:** in-process `node-cron` for scheduled ticks (HP regen, world-event triggers). No Redis queue, no separate worker process (`architecture.md` §2, §4.1) — that solves a load problem you don't have yet.
- **Auth:** httpOnly session cookie, Redis-backed session store (see §3 — this one's worth doing immediately, cheaply).
- **Deployment:** Docker Compose on one VPS. Manual `docker compose up -d` after a manual migration run. No gated CI/CD pipeline, no health-checked rollover (`architecture.md` §11) — brief downtime on your own deploys is a fine trade against building a release pipeline nobody but you uses yet.
- **Content:** YAML files loaded at boot, validated against a schema for your own sanity. No cross-pack dependency resolution (`architecture.md` §4.9) — there's only one pack.

---

## 3. Do These Now, Regardless of Milestone

A few things don't fit the "defer until triggered" pattern, because they're either free today or carry non-technical risk that doesn't wait for your roadmap to get around to it.

| Item | Why it doesn't wait |
|---|---|
| **Redis-backed sessions from the start** | Costs nothing extra today and removes a migration step later. The one deliberate exception to "don't build ahead of need," because the cost today really is zero. |
| **Minimal account deletion / data export** | Doesn't need to be self-service — a documented admin script is enough for v1. This is legal exposure (GDPR), not a feature backlog item. One real EU signup before this exists is non-compliance, not tech debt. Build it small, early, and move on. |
| **Registration/login rate limiting** | A few lines of middleware. The alternative is bot-farmed accounts feeding your economy before Economy even ships. |
| **Basic mute/block, alongside global chat** | Not a moderation *system* — just the ability for a player to mute another, and for you to manually ban from the DB. Social features are the first place real-world abuse shows up in a game built around player interaction; "I'll add safety later" is a bad bet here specifically. |
| **Server-authoritative combat/loot/currency** | Repeated from §1 because it's this important: cheap now, expensive to retrofit, not a "when triggered" item. |

---

## 4. Deferred Features: What's Postponed, Why, and What Actually Triggers Building It

| Feature | `architecture.md` ref | Why deferred now | Trigger condition |
|---|---|---|---|
| Plugin loader + SDK (code plugins) | §5.2 | No plugin authors exist; a manifest/loader/trust system for zero consumers is pure overhead | A specific person (including future-you) wants to extend the game without touching your deploy — or you're ready to open-source and expect outside contribution |
| Multi-pack content + cross-pack dependency validation | §4.9, §5.1 | One author, one pack — dependency graphs across packs are meaningless with a single pack | A second content pack (yours or someone else's) actually exists |
| Event bus failure isolation, per-plugin tracking, selective durability | §4.7 | Every current listener is your own code — an unhandled exception is a bug you fix directly, not a blast radius to contain from a third party | The first code plugin *not written by you* is loaded in-process |
| Cross-module orchestration as reusable infrastructure | §4.4 | The *pattern* (a real DB transaction for tightly-coupled writes) gets applied case-by-case as each need arises — it is not deferred, but it is also not pre-built as a generic framework | N/A as infrastructure — apply directly, ad hoc, at the first feature that needs it (almost certainly the shop-purchase flow in the Economy milestone) |
| DDD/hexagonal tiered layering | §4.3 | Deciding a module is "Rich" before writing it is a prediction, not a fact | Apply **per module**, only once that specific module's flat service+repository is causing real, felt pain (hard-to-test branching, a growing god-function) — never applied uniformly in advance |
| dependency-cruiser CI boundary enforcement | §4.4, §9 | A lint rule earns its keep when there's a second reviewer or a memory-refresh need; solo, it's a chore with no counterpart benefit | A second contributor joins, or you personally notice you've been sloppy about the boundary often enough to want a machine catching it |
| Dedicated worker process + BullMQ/Redis queue | §2, §4.1 | Current background jobs (regen, world-event ticks) are light — in-process cron is enough | A specific background job is measurably slowing foreground request latency — observed, not anticipated |
| SSR/static public site app | §4.8 | No public content worth indexing yet | Real leaderboards/guild pages with real players worth someone finding via search, or an actual marketing push |
| Token-based auth (JWT/API keys) for third-party/mobile clients | §7 | No second client exists | You start building a second client |
| Load testing (k6) | §8, §14 | No load to test | Before any public launch/marketing push, or before spending money on infra upgrades based on a scaling guess |
| Turborepo / monorepo build tooling | §9 | One app — nothing to orchestrate | Build/CI time is a felt, measured annoyance, not a prediction |
| Gated CI/CD, migration-ordered deploys, health-checked rollover, blue-green | §11 | You are the only one who notices your own downtime | Real uptime expectations exist — paying users, or a community actually depending on availability |
| Full Admin & Moderation module | §3 (module table), §7 | Covered minimally by this document's §3 "do now" items | Report/ban volume outgrows a manual DB update |
| Choosing a translation library/mechanism (i18next, nestjs-i18n, a custom loader) and converting existing hardcoded messages to it | ADR-0001, `architecture.md` §4.12 | Combat, Quests, NPC dialogue, and plugin content — the modules whose message *shape* would actually inform this choice — don't exist yet. Picking now means guessing | A second language is actually being shipped to players (not just infrastructure), or enough later modules exist that the real shape of "what needs translating" is finally visible |
| Locale resolution mechanism (header, persisted per-user preference, plugin-defined logic), client-side translation catalog | ADR-0001, `architecture.md` §4.12 | Same reason as above — no chosen mechanism yet means nothing to resolve locale *for* | Follows directly from the trigger above — this is designed together with the library choice, not separately |

---

## 5. Milestone Roadmap (v1)

Each milestone still ends in something playable, per `architecture.md` §14 — the sequence is the same spirit, adjusted to the single-process, no-plugin-system reality above.

| # | Milestone | Playable result | Notes |
|---|---|---|---|
| M0 | Scaffolding: one app, one repo, Docker Compose (Postgres + Redis + app), health check | "Server is alive" | Basic lint/test on push; **no** gated CI (§4) |
| M1 | Auth & character creation | Register, log in, create/view a character | Redis-backed sessions from day one (§3); cookie auth only, no token path (§4) |
| M2 | Core loop: server-authoritative NPC combat, stats, in-process cron for regen | Fight a monster, gain XP, level up | No worker process (§4) |
| M3 | World & content: first YAML pack (cities, monsters) | Walk between towns, fight along the way | **First plugin-ready milestone** — content is data now, even though nothing else about plugins exists yet |
| M4 | Items & inventory: loot, equipment | Loot drops, equip gear | First real cross-module touch (Combat → Inventory); apply the transaction pattern directly (§4), don't build a framework for it |
| M5 | Social I: global chat (WS), friends list, mute/block | Live chat, with mute capability | Mute/block per §3, not deferred |
| M6 | Guilds & private messaging | Form a guild, DM someone | — |
| M7 | Economy: shops, trading, currency, audit log | Buy/sell/trade | Registration/login rate limiting (§3) must already be live — bots target economies, not empty games. Purchase flow is where the cross-module transaction pattern becomes non-optional |
| M8 | Crafting & professions | Craft from gathered materials | New user-facing strings avoid concatenation per §1 item 5 (ADR-0001) |
| M9 | Quests | Accept and complete a quest line | — |
| M10 | PvP | Fight another player, server-resolved | — |
| M11 | Dungeons & world events | Clear a multi-stage dungeon | — |
| M12 | Achievements & leaderboards | Unlock an achievement, see a ranking | — |
| M13 | Minimal admin tooling | Manual ban/mute via direct DB access or a small internal script | Account deletion/export (§3) must exist by here at the latest — sooner if any real user has registered |
| M14 | Polish, public beta | Public-facing launch | **Before this milestone:** run the load-testing pass (§4) and decide, with data, whether vertical scaling is enough. Natural point to reconsider dependency-cruiser and gated CI if inviting outside contributors |
| M15+ | Post-launch | — | This is where "plugin-ready becomes plugin-complete" is a real decision, made with actual player/contributor demand in hand — not a guess. Revisit §4's plugin loader, multi-pack content, and event-bus hardening as an actual project, using the design in `architecture.md` that's been sitting ready since before you needed it |

---

## 6. Guardrails Against Drift

Solo projects drift in both directions — worth naming both so you can catch yourself.

**Drifting back toward plugin-complete too early** looks like: writing a manifest format with no second author to use it; adding a config flag for a feature only you exercise; generalizing a pattern that's been used exactly once. If you catch yourself doing this, stop and check §4 — is the actual trigger condition met, or does this just feel like "good practice"? Good practice with no one to practice it on yet is how `architecture.md` v1 became five thousand words of infrastructure for an audience of zero.

**Drifting toward under-building** looks like: skipping the §3 "do now" items because they're not blocking the current milestone, treating server-authoritative combat as optional because "it's just me testing," or letting chat ship without mute/block because moderation felt like Later's problem. These are cheap now and expensive later in the other direction — the cost shows up as a security incident or a compliance problem, not as a refactor.

The test for both: does this trigger condition in §4 actually describe something that has happened, or something you're predicting will happen? Build for the first. Write the second down and wait.
