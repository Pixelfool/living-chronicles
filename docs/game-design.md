# The Living Chronicles — Game Design

### *Every World Writes Its Own Legend.*

**Status:** Living design document — gameplay and systems, not implementation
**Companion documents:** `vision.md` (why this exists), `architecture.md` (long-term architecture), `build-plan-v1.md` (implementation roadmap)
**Audience:** Anyone designing, judging, or extending a system in this game

This document assumes `vision.md` is settled and doesn't re-argue it. Its job is narrower: turn that vision into an actual game — what a player does, minute to minute and year to year, and why each system earns its place. Where a system here doesn't obviously trace back to something in `vision.md`, that's a bug in this document, not a new idea worth keeping.

---

## 1. Design Goals

Vision is a feeling. These are the concrete commitments that produce it.

**Sessions should be short and still feel complete.** A player should be able to accomplish something real in five to ten minutes — not "log in and immediately log off," but genuinely finish a thought: a fight, a trade, a conversation, a small piece of progress. The game is built around being checked on, not sat through.

**Progress should be legible at a glance.** A player, and the people around them, should be able to tell that something changed without studying it. A level-up, a new trophy, a guild's shared score — these need to be visible in passing, not buried in a menu three clicks deep, because visible progress is what makes other players notice and react to each other.

**State should be felt before it's read.** Wherever the game asks a player to make a judgment call — is this safe, am I ready, should I push on — the answer should arrive in the world's voice, derived from the same mechanics a stat readout would use, but expressed as something a character would notice about themselves, not a number they'd have to interpret. This doesn't relax the legibility goal above — a line like "your pack feels lighter than you'd like" needs to land as fast as a percentage would — it just means legibility is measured by how quickly a player grasps what to do, not by how precise the display is. Precise figures still belong wherever a player is genuinely planning (a character sheet's HP total, an item's stats, gold in a trade); this principle governs moments of judgment, not the bookkeeping underneath them.

**Every core system should give players a reason to think about someone else.** Not just occupy the same world as them — depend on them, compete with them, owe them something, or want to show off for them. A system that a player can fully engage with alone, forever, without ever needing another person, is a system working against the actual point of this game.

**Choices should be interesting, not optimizable.** A decision is worth making when its value depends on context and consequence — who you're fighting, what your guild needs, who you trust — not when it depends on running the numbers correctly. If a choice has one objectively correct answer that a spreadsheet could find faster than a player can, the choice isn't doing its job.

**Failure should be real but survivable.** Losing should sting enough to matter and never enough to make someone quit. The game keeps score through memory and history, not through erasing what came before — which means failure has to be designed as a setback with a story attached, not a punishment that undoes one.

**The base game has to be whole on its own.** Every system described in this document needs to work, and be satisfying, with zero plugins installed. Plugins make a world more itself; they are never the thing that makes the core game complete. If a system only feels finished once a plugin fills a gap, that gap belongs in core, not in the plugin's credit column.

**Every system should leave room to be someone else's.** A server's identity comes from what its admins and players add to the shared foundation. That only works if core systems are built with enough restraint that there's real room left to add to — a system that already tries to be everything to everyone leaves nothing for a world to make its own.

---

## 2. Player Journey

**The first five minutes** have exactly one job: prove the premise. A player creates a character — a name and a small, flavorful starting choice, not a form to fill out — and is standing in a city within seconds, with something obvious to do next. They fight something small and win. They see their character sheet respond to it. Somewhere in that first stretch, they see evidence that other people are here right now — a name in chat, a recent arrival on a leaderboard, anything that says *this place is occupied.* Nothing in the first five minutes should require reading instructions; the tutorial is the first few actions themselves.

**The first day** is about momentum and a hook. Leveling should come quickly early on, so a new player feels forward motion without effort. Somewhere in the day, they should brush against another system that isn't combat — chat, a trade, a guild invitation, a quest they haven't finished — and that unfinished thing is what should pull them back tomorrow specifically, not just "eventually." A player who logs off their first day with nothing left undone has less reason to return than one who logs off mid-conversation.

**The first week** is where the character stops being generic. A few real choices have been made — a skill leaned into, a guild joined or at least noticed, maybe a death survived and shrugged off. By the end of the week, a player asked "what happened this week" should have an answer that isn't a number. Not "I hit level 14" — something more like "my guild finally cleared that dungeon" or "someone I don't even know keeps beating my score by a few points and it's driving me a little crazy." That's the first thread of a story, and it's the actual product this game is trying to produce.

**The long term** is where leveling quietly stops being the point. A character develops a reputation, a circle of people who recognize them, a small history of wins, losses, trades, and rivalries specific to their server. The habit that keeps someone playing months in should look less like grinding and more like checking a group chat — a few minutes, a few times a day, out of genuine curiosity about what happened while they were gone. If a player's main reason for logging in six months from now is still "my level isn't high enough yet," the long-term design has failed; it should be "I want to know what my guild's up to."

---

## 3. Core Gameplay Loop

Every session runs through the same shape, whether it's five minutes or twenty.

**Check in.** The player sees what happened without them: messages waiting, guild activity, a market shift, a challenge from a rival, quest progress ticking along. This is the moment the world proves it kept living while they were away — it's the single most important beat in the whole loop, and every other system exists partly to make sure this moment has something worth showing.

**Act, within limits.** Play is paced by a limited pool of actions that regenerates over time rather than by a clock the player has to manage themselves. This isn't a technical throttle — it's what makes short sessions feel complete instead of interrupted. A player who has ten actions can spend all ten in five focused minutes and walk away having genuinely finished something, instead of feeling like they left a long session half-played.

**Decide.** Within those actions, the game should keep putting small, real decisions in front of the player: fight this or avoid it, spend this gold or save it, help a guildmate or take the opportunity for themselves. These decisions are where "interesting choices over mathematical complexity" actually lives — the loop should be full of moments where the right call depends on the situation, not on a formula.

**Connect.** Somewhere in most sessions, the player should interact with another person directly — chat, a trade, a guild coordination, a PvP challenge, even just reacting to something someone else did. A session with zero human contact should be the exception the loop produces sometimes, not the default it produces every time.

**Leave something in motion.** The best sessions end with something unresolved — a craft that will finish later, a guild event scheduled, a message sent and not yet answered. That open thread is what turns "I should check in later" from an obligation into actual curiosity.

Repeated daily, this loop accumulates into a week worth talking about. Repeated for months, it accumulates into a character with a real history, a server with a real personality, and a player who would genuinely miss it if it were gone.

---

## 4. Character Progression

**Attributes** stay few and legible — a handful, not a dozen. Body, Mind, and Presence are enough to give combat, crafting, and social systems each something to lean on, without asking a new player to understand a stat sheet before they understand the game. More attributes would mean more interesting-looking math and less actual interesting choice — most of the added complexity would go toward optimization, which is exactly the thing this game is trying to avoid rewarding.

**Levels** climb quickly at first and slow down deliberately, toward a real cap rather than an infinite curve. An endless number that always goes up is the easiest possible retention hook to build and the worst one for this particular game — it trains players to treat their level as the point of playing, and it puts permanent pressure on every future system to keep scaling to match it. A cap says, plainly, that the number was never supposed to be the long game. What happens after the cap — socially, economically, narratively — is supposed to be the actual answer to "why keep playing."

**Skills** are a modest, chosen set that leans a character toward a playstyle rather than stacking raw power. A skill should make a character feel like a specific kind of person to play — someone who fights carefully, someone who trades shrewdly, someone who explores compulsively — more than it should make them simply stronger than someone who chose differently. Skills are where a character's personality lives.

**Classless or classes:** neither extreme. A fully classless system tends to converge — enough optimization pressure and everyone ends up building the same "correct" character, which quietly kills the interesting-choice goal it was supposed to serve. A large, rigid class system with deep exclusive skill trees solves that but creates a different problem: it's a lot of surface area to design, balance, and explain to a new player, for a game that's supposed to be understandable in five minutes. The middle path is a small number of broad, flavorful starting archetypes that bias playstyle without hard-locking a character out of anything. They give a new player an immediate identity — "I'm playing the duelist" — without demanding they understand the whole system to make that first choice. Deeper, more specific archetypes are exactly the kind of thing a server's own plugins should be free to add later (§10).

**Death is a setback, never an ending.** Permadeath, or anything close to it, would directly undercut the entire premise of this game: a character is supposed to be a persistent, accumulating story, and a story that can simply end on a bad roll is a story players will learn not to get attached to. Death in ordinary play (fighting monsters, exploring, misjudging a risk) should cost a little time and a little material progress — enough to make the risk of a fight real — and nothing that erases who the character is or what they've built. What death should cost in PvP specifically is genuinely unresolved and treated as an open question (§12), because it's a sharper version of the same trust problem: losing to another player has to sting less than it would make someone quit playing near that player again.

**Prestige or rebirth** is not something this document commits to. There's a real tension between "levels shouldn't be the long-term hook" and "a level cap could feel like a dead end" — and rather than paper over it, it's listed as an open question (§12) worth deciding once there's a real population of capped-out characters to observe, not before.

---

## 5. Combat

Combat's job is to produce consequences the rest of the game can use — loot, risk, rivalry, a story worth telling — not to be a deep system competing for the player's attention on its own terms. A player choosing this game over a dedicated combat game is not choosing it for the combat; combat exists here to feed everything else.

**Turn structure** stays fast and legible. A fight resolves in seconds, consumes a small number of actions, and produces a short, readable account of what happened — not a real-time exchange demanding sustained attention. The goal is that several fights can happen inside one short check-in, each one quick enough that the player's attention stays on the outcome and what to do with it, not on managing the fight itself.

**Enemy encounters** scale with the regions they live in (§8) and should telegraph their danger honestly — a player deciding whether to engage should be making an informed bet, not a blind guess. Rewarding curiosity about *whether* to fight is a better use of design effort here than rewarding precision about *how* to fight.

**PvP exists because conflict is part of a living world**, not because this is meant to be a competitive game. It should be possible, visible, and genuinely consequential — rivalries and revenge are some of the best stories this game produces — while staying bounded enough that a loss doesn't feel like a reason to quit. New or clearly outmatched characters need some form of protection from being repeatedly targeted; that protection's exact shape is an open question (§12), but the requirement that it exist is not.

**Difficulty stays forgiving in the default path and real in the paths players opt into.** Ordinary early play should build confidence, not test it — the risk belongs in the content a player deliberately walks toward: a dangerous region, a dungeon, a fight they didn't have to pick. This keeps the baseline game welcoming while still leaving room for genuine stakes for players who want them.

Combat should not grow tactical depth for its own sake. Every hour spent making combat richer is an hour not spent on the systems that actually carry this game for a decade, and every new combat mechanic is one more thing a new player has to learn before the game feels approachable. Combat supports the social game. It should never get complex enough to compete with it.

---

## 6. Economy

**Gold** is the shared, liquid currency behind almost everything a player wants — gear, consumables, services, guild contributions. Its value depends entirely on there being real, ongoing reasons to spend it; a currency that just accumulates stops meaning anything, and a trade between two rich players stops feeling like a trade at all.

**Items** split cleanly into two kinds that shouldn't be confused with each other: power items (gear, consumables, materials) that affect what a character can do, and vanity items that affect only how a character looks or presents. Vanity goods matter more than their lack of power suggests — they let a player express identity and taste without engaging the competitive economy at all, which is one of the few forms of self-expression in the game with genuinely no downside and no pressure to "keep up."

**Trading is a social system wearing an economic costume.** Its real job is to manufacture reasons for two players to talk to each other, negotiate, and build (or break) trust — the resource allocation is almost a side effect. It should stay player-driven and direct rather than growing into an anonymous, automated marketplace; anonymity would strip out exactly the relationship-building trading is actually for.

**Crafting** gives players something to become known for. A server should be able to develop a reputation economy where certain players are simply *the* blacksmith or *the* alchemist people go to — an identity conferred by the community, not just claimed by the player. Recipes and processes should be discoverable through play, not gated behind outside reference material; needing a wiki open to craft anything would quietly break the accessibility goal.

**Resource sinks are not optional.** Repair costs, consumable use, vanity purchases, guild-level expenses — the economy needs real, ongoing reasons for gold and materials to leave circulation, or trade eventually stops meaning anything once everyone is simply wealthy. This matters more here than in most games with an economy, for a specific reason worth stating plainly: **this game has no seasonal reset to fall back on as an inflation fix.** Persistence is a stated design principle (`vision.md` §2), which means the usual escape hatch — periodically wiping the economy and starting clean — isn't available. Sinks have to be taken seriously as a first-class, ongoing design responsibility from the very first version of the economy, not patched in later once inflation is already a visible problem. The exact tuning is an open question (§12); the requirement that tuning happens continuously, by design, is not.

---

## 7. Social Systems

Every system in this section exists for the same underlying reason: to give players a persistent reason to think about each other. Each earns its place differently.

**Guilds** are a small world inside the world — a group with its own shared goals, its own history, its own inside jokes, capable of developing an identity the same way a whole server can. A guild is, in miniature, exactly what this project wants every server to become: something that started as a shared container and turned into a place people belong to.

**Friends** give a lighter-weight, lower-commitment version of the same thing, and matter most in the first week — a new player is far more likely to return for one specific person they've connected with than for the game in the abstract. Friends are the fastest hook this game has to offer, and the easiest one to build.

**Private messaging** is where one-on-one relationships actually get built: coordination, trust, negotiation, and occasionally drama. It should stay simple — a way to talk, not a platform with its own feature set to maintain.

**Chat** is the town square: ambient proof, at any given moment, that this is a place other people are currently occupying. It's one of the highest-value systems in the whole game for exactly that reason, and also, honestly, the one most likely to need real moderation attention as a server grows — every player needs a reliable way to mute or ignore someone else, and that capability isn't something to defer even while the fuller tools around it are.

**Events** give a server a shared, time-bound moment — something the whole population can point back to later. "Remember when the dragon hit the capital" is exactly the kind of sentence this project is trying to make possible, and events are the system built specifically to produce it.

**Reputation** makes visible the half of a character's identity that isn't self-authored — how other players actually see them, based on what they've done. A character's build is a story the player writes; reputation is the part the community writes back. The exact mechanism (titles, trust signals, informal community memory) is an open question (§12); that some visible version of it should exist is not.

---

## 8. World Structure

**Cities** are home base — services, market, guild halls, and the densest concentration of other players. Even a small number of cities in the base game should each feel like a distinct place with its own flavor, not interchangeable copies of the same hub; the moment a plugin adds a new one, it should feel like a genuinely new place joining the map, not a reskin.

**Regions** connect cities and carry the game's difficulty and thematic range — where monsters, resources, and danger actually live. They give exploration and combat somewhere to happen with a sense of geography, rather than being an abstract list of fights.

**Dungeons** are not a longer sequence of fights — they're an authored place a character deliberately commits to, and combat is only one of the tools they use to make that place memorable. Entering one should feel like a threshold, not a route: travel is routine and reversible, a dungeon is a deliberate expedition, and the moment of stepping in deserves its own weight rather than resolving as an instant continuation of whatever the player was already doing. What a character brings with them — gear, consumables, HP, prior experience — should matter before the first beat happens, not only during it: preparation should shift a player's odds and their margin for error, never gate entry outright, so there's always more than one legitimate way to be ready (better gear, a stocked pack, or simply choosing an easier expedition today). The measure of a good dungeon clear isn't its loot table — loot reinforces the achievement, it isn't the reason to remember it — it's whether a player would tell someone else about it afterward, with or without anything to show for it.

**Travel** stays simple — a small time or action cost between places, not a system in its own right. Travel exists to make the world feel like it has size, not to be a minigame competing for the player's attention.

**Exploration** should reward curiosity in small ways as often as it rewards effort in big ones — a strange detail, a bit of flavor text, an easily-missed corner, not only loot. This is some of the cheapest, highest-value content this game can produce, and it's also a natural place for a server's own content to expand the map without touching anything load-bearing.

**NPCs** do two jobs, and both matter more than they might look like they do. Functionally, they run shops, hand out quests, teach skills. But the flavor NPCs — the ones with a joke, an opinion, a bit of personality — are often a new player's very first signal that this world has a character of its own, before they've met a single other player. They're also one of the clearest, lowest-risk kinds of content a server can add to make its world feel distinctly its own.

---

## 9. Content Philosophy

Core content's job is to be a complete, well-taught foundation — not to be exhaustive. A small set of well-made quests, a handful of distinct cities and regions, a couple of genuinely good dungeons, and enough NPC personality to prove the world has one: that's the bar. Everything beyond that bar is where a server's own identity is supposed to start getting written, and the base game is deliberately built modest enough to leave that room rather than crowd it out.

| | Core game | Plugin content |
|---|---|---|
| Purpose | Teach every system through play; be complete and satisfying alone | Give one specific world a personality beyond the shared foundation |
| Quests | A small set of foundational storylines that introduce combat, trade, guilds, exploration | Expansions, server-specific storylines, community-requested arcs |
| Dungeons | A few, well-crafted, demonstrating the format | The deep, ongoing well of variety over time |
| Events | The capacity for the world to have shared moments | The specific calendar and content of those moments |
| Narrative | Light-touch; enough to set tone, not to march players through a plot | Emergent — mostly written by players, guilds, and admins as they go |

**Seasonal content is welcome. Seasonal resets are not**, and the two should never be allowed to blur together. A recurring winter festival, an anniversary event, a limited-time cosmetic — all fine, all in the spirit of giving a world's calendar some texture. Wiping or devaluing a player's permanent progress on any kind of schedule is a different thing entirely, and it directly contradicts the persistence this project is built around. Any proposed seasonal system needs to survive the question "does this touch anything permanent" before it survives anything else.

Narrative overall should stay light-touch and mostly emergent. The story worth telling about this game is not the one the developers wrote — it's the one players, guilds, and admins accumulate by playing. Core narrative's job is to set a tone and get out of the way, not to be the main event.

---

## 10. Plugin Philosophy

A good candidate for plugin content is something that would make one world meaningfully different from another if it existed there and not elsewhere — without being required for the base game to feel whole. A bad candidate is something a new player needs in order to understand or trust the game at all. "Leveling exists" can never be a plugin. "This specific dungeon exists" always can be.

**New classes** are one of the clearest cases. Core ships a small number of broad, teachable archetypes (§4); everything more specific or unusual — a homebrew class a community fell in love with, a highly specialized build only one server's culture would want — is exactly the kind of thing that gives a world a reputation without asking every new player everywhere to learn it first.

**New dungeons** are naturally self-contained, which makes them close to ideal plugin content: a server can have a dungeon nobody else does, built around its own community's taste, without touching anything the rest of the game depends on.

**New professions** work the same way as classes: a small, teachable foundation in core, with room for a server to develop a genuinely unique crafting culture around specialties nobody else's world has.

**Minigames** are close to pure plugin territory. A fishing contest, a card game at the tavern — these add flavor and make a world feel lived-in without ever needing to be load-bearing for the core loop, which means there's no cost to some servers having one and others not.

**World events** are the most instructive example, because they need to exist in two different senses at once. The *capacity* for the world to have a shared, time-bound moment belongs in core — without it, there's nothing for a plugin to plug into. The *specific* event — what it is, when it happens, what it means to that community — belongs to the server. This is the plugin-ready/plugin-complete distinction (`vision.md` §4) in its purest gameplay form: build the capacity now, because building it later would mean tearing up something already load-bearing; leave the actual authored content for later, because inventing it now would mean guessing at what a community wants instead of learning it from one that actually exists.

Core is the shared grammar. Plugins are where each world writes its own sentences in it.

---

## 11. Design Principles

Before any new mechanic — core or plugin — earns a place in this game, it should be able to answer these honestly:

1. **Does this give players a reason to think about each other**, or does it let them succeed just as well playing entirely alone?
2. **Is the choice it creates interesting because of context**, or does it have one correct answer a calculator would find faster than a player?
3. **Does it hold up over months**, or does it burn bright for a week and then become something players feel obligated to maintain?
4. **Would a player five minutes into their first session understand it**, or does it quietly assume hours of prior investment?
5. **Does it belong here, or does it belong to a world that specifically wants it** — could it be a plugin instead, and if so, should it be, so core stays small enough to leave room for that?

A mechanic that fails most of these isn't automatically cut. It just owes the rest of this document a genuinely good reason, the same way `vision.md` §7 asks of anything larger than a single mechanic.

---

## 12. Open Questions

These are real, unresolved, and deliberately left that way rather than answered just to make this document feel finished.

**What should losing a PvP fight actually cost?** Enough to make PvP matter, not so much that it reads as punishment — and specifically, how do we protect new or clearly outmatched characters from being repeatedly targeted without making PvP feel toothless for everyone else?

**Should an opt-in prestige or rebirth system exist once a character hits the level cap?** There's a real tension between "levels shouldn't be the long-term hook" and "a hard cap could feel like a dead end" that shouldn't be resolved on paper — it needs real characters actually reaching the cap first.

**What does reputation actually look like, mechanically?** Self-reported titles are easy to build and easy to game. System-tracked trust scores are harder to game and harder to keep legible. Purely informal, social reputation is the most honest version and the least designed — it needs a decision about how much structure to put underneath something that's supposed to feel earned, not granted.

**How sparse should the starting world actually be?** A world with too little core content risks feeling unfinished before any plugin exists to fill it; a world with too much risks nothing feeling like a real addition once plugins arrive. Where exactly that line sits is a judgment call best made by watching how quickly players exhaust the starting content, not by guessing now.

**Should guild size or structure be actively bounded?** One dominant mega-guild swallowing a server's social scene would quietly recreate, at server scale, the exact single-shared-world outcome this whole project is trying to avoid at the platform scale. Whether that needs a hard limit, a soft incentive toward multiple mid-size guilds, or nothing at all is unresolved.

**Should crafting specialization be exclusive or flexible?** Locking a player into one profession permanently creates stronger identity and real interdependence between players — but it risks punishing a new player who picked before they understood what they wanted. A respec option solves that at the cost of some of the identity.

**How much should core actually decide about world events, versus leaving that space visibly, deliberately empty for the first plugins to fill?** Too much core content here risks making the eventual plugin feel redundant; too little risks the base game feeling inert before any world has grown into its own identity.
