# The Living Chronicles

### *Every World Writes Its Own Legend.*

---

**Document:** Vision — the project's constitution
**Status:** Read this before proposing or judging any feature, plugin, or architectural change
**Companion documents:** `architecture.md` (what this becomes), `build-plan-v1.md` (what to build next)
**Audience:** Future me, future contributors, plugin authors, community members — anyone deciding whether something belongs in this game

---

## 1. Vision

There is a particular feeling that old browser RPGs like Legend of the Green Dragon used to produce, and almost nothing produces anymore: the feeling of checking in on a small world a few times a day, the way you'd check in on a group chat with old friends. Not a session you sit down and disappear into for three hours. A place you visit for five minutes between other things, where something has usually happened while you were away — a message, a trade offer, a guild squabble, a rival who passed your level — and where those small, accumulating events slowly turn into something that feels like a life you're living alongside other people, rather than a game you're playing against a scoreboard.

That feeling is the entire point of this project. Everything else — the architecture, the plugin system, the roadmap — exists in service of making that feeling possible, and making it last.

This game should make players feel *involved* rather than *optimized*. It should reward showing up, noticing things, and talking to people, more than it rewards calculating the mathematically correct build. It should make a player curious about what happened in the world since they last looked, not anxious about falling behind if they didn't log in today. The emotional target is closer to tending a garden or checking on a small town than it is to clearing a raid or climbing a competitive ladder.

Why should someone spend their evenings here instead of in another browser RPG, or another idle game, or another MMO? Not because this game has more features, better graphics, or a cleverer combat system. Because this game is trying to build a *place* — a small, persistent, sometimes idiosyncratic world with its own history and its own community — rather than a product designed to maximize the time any individual spends staring at it. The payoff isn't a single great session. It's the accumulation of many small ones, over months, into something that feels like it was actually yours.

That accumulation doesn't stop at the level of one player's story. Given enough time, a whole server accumulates a personality of its own — its own history, its own running jokes, its own reputation among the people who play there. The goal was never to build one world for everyone to consume. It was to build a platform where every world eventually becomes its own place, with its own legend, written by the people who actually showed up.

---

## 2. Design Philosophy

A handful of principles fall directly out of that vision and out of what LoGD got right. They aren't arbitrary preferences — each one is a direct answer to a question the project has already had to answer for real, and each one should be the first thing you reach for when a new idea needs judging.

**Social interaction over optimization.** The systems that matter most — chat, guilds, friends, trading — exist to put players in front of each other, not to give a single player a better spreadsheet to solve alone. When a proposed feature makes the game more efficient to play solo, that's a yellow flag, not automatically a rejection, but it should have to justify itself against what it costs the game's social fabric.

**Interesting choices over mathematical complexity.** A good decision in this game should feel meaningful because of its consequences and its context — *do I spend my gold on gear or lend it to a guildmate who needs it more* — not because it required modeling three interacting formulas correctly. Depth should come from the situations players find themselves in with each other, not from stat theorycrafting. This is also, not coincidentally, what keeps the game buildable and maintainable by a small team over many years: complexity that exists to be interesting is worth the cost; complexity that exists because a system grew unchecked is not.

**Long-term persistence over seasonal resets.** Characters, relationships, reputations, and consequences should be allowed to actually last. A world where progress and history evaporate every few months trains players to treat everything in it as disposable — including each other. This game is built to let a character's story, and a server's story, keep accumulating for years.

**Community creativity over developer control.** The most memorable version of this game will not be designed entirely by its original developer. It will be shaped by the admins who run their own worlds, the plugin authors who add things nobody on the core team thought of, and the players who turn a plain set of systems into a story worth telling. The project's job is to build a good foundation and then get out of the way, not to be the sole author of everything that happens inside it. Success here isn't measured by how much of any given world the original developer personally built — it's measured by how distinct each community's world eventually becomes once they've had the room and the time to make it their own.

**Accessibility over feature bloat.** New players should be able to understand what to do and why it matters within a few minutes, on a page that loaded fast, without reading a manual. Every system added to the game is a small tax on that first impression, and on everyone who has to maintain it for the next ten years. A smaller game that's easy to fall in love with beats a larger one that's exhausting to learn.

**Trust over unchecked competition.** Because so much of this game's value lives in relationships, trades, and shared history, players need to actually believe the world is fair — that their gold wasn't stolen by a bug, that their opponent wasn't a bot, that the leaderboard reflects real play. This is a design value as much as a technical one: a world people can't trust is a world they stop investing themselves in.

---

## 3. What Makes This Game Different

This is not simply a Legend of the Green Dragon clone, and the difference isn't a feature list — it's an intent, and it's worth being precise about which part of LoGD this project is actually chasing. It wasn't the daily-turn mechanic, and it wasn't even the ability for admins to run their own servers, exactly. It was what happened *because* they could: given enough time, a server stopped being an install of LoGD and became its own place, with its own history, its own running jokes, its own reputation, its own community. Players didn't say they played LoGD. They said they played on a specific server — the way you'd name a hometown, not a product. The servers themselves became memorable, and that's the ingredient this project is actually trying to preserve — not decentralization for its own sake, but the identity that decentralization made possible. Most of those servers were held together by duct tape and one person's spare time, and most of them eventually died — not because the idea was wrong, but because nothing about how they were built was made to last long enough for that identity to fully form, let alone survive. This project keeps the goal — worlds that become genuinely their own places — and rebuilds the foundation underneath it: something designed from day one to survive a decade, survive its own popularity, and survive being handed off to people who weren't there when it started.

That's also the honest answer to "why is running your own server worthwhile?" Running an instance of this game isn't customizing a theme or picking a difficulty setting. It's making real creative decisions — what monsters live in your world, what quests exist, what the economy feels like, what kind of behavior your community tolerates and celebrates — the same kind of decisions a LoGD admin made twenty years ago, except now those decisions don't have to be fought out of a fragile, unmaintainable codebase. An admin who runs a server here is a creative director of a small world, not a system administrator babysitting someone else's product.

And that's why communities should build their own worlds instead of everyone sharing one official one: a game controlled entirely by its original developer is something you consume. A game that can be genuinely reshaped by the people playing and running it is something you belong to. Big MMORPGs offer scale and spectacle, at the cost of every player being a small, replaceable part of one enormous, centrally-controlled machine. This project deliberately trades that scale for the opposite: many small worlds, each capable of having a real identity, each shaped by the specific people in it. Every one of those worlds is writing its own legend, whether or not anyone outside it ever reads it — and that's exactly the point.

---

## 4. The Role of Plugins

Extensibility is not an infrastructure feature bolted onto this game. It is one of the central reasons this game is worth building at all. Plugins are not valuable because dynamic loading or event systems are interesting engineering — they're valuable because they're the mechanism by which one world stops looking like every other world running the same code, and starts becoming a specific, memorable place with its own legend.

LoGD didn't stay alive for two decades because one team kept adding content to one server. It stayed alive because it was porous enough that admins, hackers, and communities could keep pouring their own ideas into it long after the original authors had moved on. The content that made any given server memorable was rarely the content that shipped by default — it was the monster someone's admin added as an in-joke, the quest line a community begged for and got, the custom economy rule that made one server's marketplace feel different from every other server's. A game that only the original developer can add to has a lifespan bounded by that one person's energy and attention. A game that a community can genuinely extend does not — its lifespan is bounded by whether people still care enough to keep building on it, which is a far better problem to have.

That's why plugins matter more than any single feature they might deliver: they're what lets this game's story keep being written after the person who designed it stops being the only author. A world that can grow new content without waiting on a central roadmap is a world that can stay alive far longer than any one developer could sustain alone.

At the same time, building a full plugin ecosystem — a proper toolkit, a stable contract for outside creators, real documentation and support — before a single outside creator exists would be a mistake in the other direction: it would spend the project's early, limited energy building tools for an audience that doesn't exist yet, instead of building a game good enough that such an audience eventually shows up wanting to extend it. Getting this right depends on being honest about what the goal actually is. The goal was never simply *support plugins.* The goal is *let every world become its own place.* Plugins are the means, not the end — which is exactly why the infrastructure around them can be delayed without delaying the thing that infrastructure ultimately serves. That's the reasoning behind a distinction worth naming explicitly: **plugin-ready** versus **plugin-complete**.

*Plugin-ready* means the game is built from the very first line of code so that nothing structural has to be torn apart later to make room for outside creators. Content lives as data that could be authored by anyone, not code only the original developer can touch. The systems that matter are built to announce what's happening inside them, even before anything outside the core game is listening. The seams where a plugin will eventually attach already exist, quietly, whether or not anyone is using them yet.

*Plugin-complete* means those seams have grown into an actual toolkit: a real way for someone outside the project to package their own content or behavior, share it, and see it running in someone else's world, with real thought given to what happens when that someone isn't fully trusted. This is deliberately not built on day one. It's built once real plugin authors — real people with real ideas they want to add — are actually waiting for it. Building it earlier would mean guessing at what creators will need instead of learning it from the people who show up wanting to build.

This ordering — preserve the capability, delay the infrastructure — is not a compromise between the vision and practicality. It's the most honest way to serve both. Promising a rich plugin ecosystem before the game itself is any good would waste the tools on a game nobody wants to extend. Building the game without ever preparing for extension would betray the entire reason this project exists in the first place, echoing the very failure mode — a closed, single-author world — that this project is explicitly trying not to repeat. Keeping both of those in view, honestly, is what "plugin-ready, not plugin-complete" actually means.

---

## 5. The Core Gameplay Loop

A player logs in for a few minutes, and the first thing they see is what happened while they were gone. A friend sent a message. A guildmate needs help with something. The market moved. Someone challenged them, or thanked them, or beat their score. The world kept existing without them, and the game's job in that moment is to make them curious about it, not anxious to catch up.

They spend a little time acting on that: fighting something, exploring somewhere new, working toward a goal that will take days or weeks rather than minutes. Along the way they make a handful of small, real decisions — help someone or help themselves, spend or save, fight or avoid — each one shaping who their character is becoming and how other players see them, more than it's optimizing a number.

They talk to people. That's not a side activity bolted onto the "real" game — for most players, over a long enough time, it becomes the real game. A guild forms not because the mechanics require one, but because five people wanted an excuse to keep running into each other. A rivalry becomes a running joke. A trade becomes the start of a friendship, or the source of a grudge that outlasts the item that started it.

Then they log off, having spent a few genuinely satisfying minutes, looking forward to what will have changed the next time they check in. That anticipation — not a login-streak timer, not a fear of missing a bonus — is what should bring them back. Repeated for months, this loop stops being a loop and starts being a history: a character with a story, a reputation with weight, a server that feels like somewhere specific, and relationships that would be genuinely strange to just walk away from.

---

## 6. Non-Goals

Knowing what this project deliberately refuses to become is as important as knowing what it's reaching for.

**This is not an MMORPG.** It doesn't want thousands of players sharing one enormous, centrally-managed world. It wants many small worlds, each one actually knowable by the people in it.

**This is not a Diablo-style action game.** Combat is a meaningful part of the loop, not the point of the loop. There is no reflex requirement, no gear treadmill designed to consume hundreds of hours, and no ambition to compete with action games on their own terms.

**This is not a competitive esport.** There's no design goal around perfectly balanced PvP, ranked ladders, or a spectator scene. PvP exists because conflict between players is part of a living world, not because the game wants to be watched or professionally played.

**This is not an economy simulator.** The economy exists to give trade and cooperation somewhere to happen, not to be a deep, self-justifying system that rewards players for mastering its mechanics over engaging with each other.

**This is not feature-complete at launch, and it doesn't want to be.** A smaller game that ships, gets played, and grows through real community demand is worth more than a larger one that never ships because it tried to anticipate every need in advance. Incompleteness at launch isn't a flaw to apologize for here — it's the plan.

---

## 7. Design Guardrails

Before accepting any significant feature, mechanic, plugin, or architectural change, it should be able to survive being asked:

1. Does this bring players toward each other, or let them avoid each other more comfortably?
2. Does this create a genuinely interesting choice, or just another number to optimize?
3. Could this reasonably be built as a plugin or content pack instead of core — and if so, should it be, so the core stays small?
4. Does this still make sense to a player five minutes into their first session, or does it quietly assume they've already invested hours?
5. If this were removed a year from now, would players actually miss it — or just the idea of it?
6. Does this trust the people running and playing their own worlds to make good decisions, or does it try to control their world from the center?
7. Is this solving a problem real players or creators actually have right now, or a problem we're predicting they might have someday?

A feature that fails most of these isn't automatically wrong — but it owes the project a genuinely good reason, not just enthusiasm.

---

## 8. Success Metrics

Success here isn't measured in uptime, request latency, or lines of code — those matter, but they're not what this project is *for*. Success looks like this:

Players come back not because a mechanic is pressuring them to, but because they're curious what happened to their friends, their rivals, and their guild while they were gone. Individual servers develop real, distinct identities — someone who has played on two different communities' worlds should be able to tell you they felt like different places, not the same product with a different name on it. People make things: content packs, plugins, in-character stories, community events nobody on the core team asked for or expected. Plugin authors eventually extend the game in directions its original design never anticipated, and that surprise gets treated as the system working, not as scope creep to be reined in. Long-time players stay not because of a sunk-cost mechanic keeping them trapped, but because the relationships and reputation they've built only stay valuable if they keep showing up. And when someone recommends this game to a friend, they tell a story about something that happened to them — a rivalry, a trade, a guild triumph, an inside joke — not a pitch about its tech stack or its feature list.

If, years from now, this project is still alive because people are still telling each other stories about their characters and their servers, it will have succeeded, regardless of how large it ever became.

*Every world writes its own legend.* That line is the whole philosophy compressed into one sentence, and it should outlive every technical decision described anywhere in this document. When a proposal doesn't obviously fit anywhere else here, it's usually enough to ask: does this help a world become more itself — or does it make every world a little more like all the others? That answer is usually the whole answer.
