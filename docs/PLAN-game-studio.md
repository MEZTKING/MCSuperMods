# Game and map Studio: plan and briefs (Plan A)

Orchestrator (Fable), 2026-11-23. Checked at commit `b0c0ae9` on `ccr-d077e76e-4gnbx2` (the head moved to `bc8fb16` during the review, a Try it fix that changes nothing here). Nothing in the repository was changed by this review but for this file and its two sisters, `docs/PLAN-instances.md` (Plan B) and `docs/PLAN-paper.md` (Plan C). Brief ids B720 to B759 (B717 to B719 stay free). Draft ADR 0132 is in section 9. The running plan `docs/PLAN-one-mode-rest.md` is not changed; section 5 says how this plan fits round it.

The user's words (2026-11-23): "make a modpack studio / gamemode studio / and more / you should be able to even manhunts with timers / command blocks configurator etc / redstone contraption guide and showroom / map maker / world story builder and more"; "you should be able to build things from lifesteal / hypixel etc like spleef / hide and seek and more that exist that the community enjoys"; and, of the mock-up, "also the game studio looks good". The mock-up (the catalogue of 18 game types, the Lifesteal set-up screen, the nine tabs; https://claude.ai/artifact/SftGHY1DHn734FxTqcMBUN) is therefore the decided design; everything else here is a vetoable default. Its words are copied into section 12, so no brief needs the mock-up's own file.

Community genre names only. No server's name, branding, map, texture or wording is used anywhere: not in labels, search words, examples, art or the AI helper's prompt. "Bed Wars-style", "Sky battles", "Survival games" and "Murder mystery" are the genre words the mock-up uses and stay.

## 1. What was checked, and what is true in the code

| # | Subject | Verified in | Finding |
|---|---|---|---|
| A1 | The games kinds | `packages/plugins/games/src/kinds/index.ts`, `lowering/*.ts`, ADR 0113 findings | Six kinds: `msm:world_setup`, `msm:one_block`, `msm:team`, `msm:objective`, `msm:timer`, `msm:area`. All lower to data pack files only. Lowering sees one element at a time; the plugin's `load` and `tick` are function tags; hooks are empty merged tags. There is no kind for a whole game, a round, a kit, a role, a lobby, a shop, a generator or a story. |
| A2 | The games Studios | `app/src/renderer/src/studios/games/` (six Studios, `shell.tsx`, `pickers.tsx`, `studios.tsx`) | Six lazy Studios with live views (ADR 0117 D1). Reached only through the element list and the Creator; nothing gathers a game's pieces in one place. |
| A3 | The game flows | `packages/plugins/library/src/starters/{skyblock,one-block,sky-islands,lucky-block,adventure-map,arena-game,race,goals}.ts`, `gallery-model.ts` | Eight flows in `CreatorGroup` `games`; Home's gallery makes one card per flow by itself. Round logic is hand-written in each starter as function text (`arena-game.ts` writes `start` and `round_end`, started with `/function`). A flow's answers are not kept: after Make this the game is loose elements. |
| A4 | Rules for games | `packages/plugins/rules/src/catalogue/{triggers,steps,conditions,values}.ts`, ADR 0115 | 66 triggers, 62 steps, 25 conditions, 17 values. Present: `player_joined`, `player_left`, `player_respawned`, `any_mob_died` (actor labels "the killer", "the player who killed it"), `area_entered`, `timer_ended`, `set_game_mode`, `join_team`, `set_score`, `start_timer`, `reset_area`, `set_world_border`, `for_each_player`. Missing: a trigger for a player's death, a step to change most health, a "last one left" condition. Rules need the Fabric jar (limit M1), so a game that must play as a data pack cannot be built from Rules. |
| A5 | Scoreboard facts | `packages/targets/mc-26.3/src/target.ts` line 1703 | `scoreboard.criteria` lists only `dummy`, `health`, `playerKillCount` (the three B547 ran). `deathCount`, `trigger`, `totalKillCount` and the team kill criteria are not measured. |
| A6 | Command handling | `packages/sim/src/commands/vanilla.ts` (`VANILLA_COMMANDS`), `@msm/schemas/mcfunction`, `TargetFacts.commands.forms` (80 forms), `msm:command` | The Function editor checks lines offline and marks what Try it runs. Try it runs 29 commands; it does not run `attribute`, `gamemode`, `bossbar`, `worldborder`, `spreadplayers`, `item`, `trigger` or `gamerule`. There is no command builder in plain words and no command block support anywhere (the only mention is a search word in `packages/plugins/datapack/src/search.ts`). The Structure Studio edits chest block entities (`ContainersSection.tsx`), which is the pattern a command block section would follow. |
| A7 | Try it and players | `packages/sim/CLAUDE.md`, ADR 0117 limit M14, `tryit/games/GamesPanel.tsx` | Try it is single player. The panel **Your game** shows boss bars, the sidebar, the player's team, magic blocks and areas. Nothing stands in for a second player, so a kill, a team win or "last one standing" cannot be seen in the app. |
| A8 | Redstone in Try it | `packages/sim/src/tick/power.ts` | The Power tool toggles one block's `powered` or `lit` property; "No signal travels". A redstone showroom needs a signal engine first. |
| A9 | Maps | ADR 0116, `ExportMapDialog.tsx`, `ImportFilesDialog.tsx`, `ContainersSection.tsx`, the Adventure map flow | Play my game, Export as a Map…, builds from the test worlds and chest editing exist as separate doors. No one place walks through making a map. |
| A10 | Stories | `packages/plugins/datapack` (advancements, `dialog`), the Rules step `open_dialog`, the advancement tab and dialog views of ADR 0120 | The pieces exist as single kinds with live views. Nothing strings them into steps ("talk to her, then go there, then get this"). |
| A11 | Modpacks | `packages/core/src/modpack/modpack.ts`, `app/src/renderer/src/components/ModpacksDialog.tsx` (572 lines), `app/src/main/platform/modpacks.ts`, ADR 0046 | A dialog reached from the menu (and from the More menu once B701's `onModpacks` is wired at I1). Modpacks are files of their own, not project elements. Testing uses the one shared test instance and removes other content jars from it. |
| A12 | Needs the mod or not | `app/src/renderer/src/session/project-session.ts` (`needsJar`, `modOnlyIdsOf`, line 2478 on), `ExportMapDialog.tsx` | The session already knows whether a project's vanilla data pack would leave something out. The catalogue's pill and the hub's "What it is made of" can read it; no new check is needed. |
| A13 | Where a hub can live | `App.tsx` (4,667 lines; Try it is a store-driven view, `tryItOpen`), `Toolbar.tsx` (optional props pattern of B701), `components/home/gallery/` | A hub fits the Try it pattern: its own folder and store, rendered by `App.tsx` as a view. `App.tsx`, `Toolbar.tsx` and the gallery's card files have owners in the running plan until its wave 2 is merged. |
| A14 | Search | ADR 0124 D15, `packages/plugins/games/src/search.ts`, `app/test/search/golden-queries.json` | Starters are indexed by themselves; game types need words for what they do ("break the floor", "lose hearts"). The golden file belongs to B704 until it merges. |

## 2. What each game type is made of

The marks follow the approved mock-up: sixteen types play without mods, Hide and seek and Prison need MSM's mod. The spike (B720, and B740 for batch 2) measures each; a mark changes only on evidence, recorded in ADR 0132 by the orchestrator. "Paper later" is Plan C. Every type is a library starter that makes one `msm:game` with its teams, areas, timers, kits and arena, plus a library example.

| Type | Batch | Made of (the vanilla way) | Without mods | MSM's mod adds | Paper adds later |
|---|---|---|---|---|---|
| Lifesteal | 1 | `hearts`: kill and death scores, most health set by `attribute` through a macro function, a Heart item (a recipe whose result carries components, eaten to gain a heart), `/trigger withdraw`, a revive item; at zero: spectator, kept out by a clock score, or a fresh start | Yes | `/withdraw` as a real command, a Heart block of the mod's own | Real timed bans, hearts kept for players who are offline |
| Manhunt | 1 | Roles runner and hunters, a head start (hunters held), a tracking compass refreshed by a macro function, win when the runner dies or the dragon advancement is given | Yes | Nothing needed | Several hunts on one server |
| Bed Wars-style | 1 | Two to four teams on islands drawn by the library, `team_base` (a bed test, respawn while the bed stands), `generators`, `shop` (a trader with offers), void deaths, last team standing, the arena rebuilt | Yes | Currency items and blocks of the mod's own | An arena world per match, click menus, blocks protected by cancelling |
| Spleef | 1 | A snow floor area, a shovel kit with `can_break`, adventure mode, a fall-out area, last one standing, the floor rebuilt | Yes | Nothing needed | Nothing needed |
| Sky battles | 2 | An island per player, loot chests, a border, last one standing | Yes | | An arena world per match |
| TNT run | 2 | The floor under each player removed after a delay by the tick function | Yes | | |
| Hide and seek | 2 | Hiders unseen with a block display kept on them, seekers held then released, a timer | Mock-up: needs the mod. B720 K18 measures the display route | A true disguise | A disguise without a client mod |
| Murder mystery | 2 | Secret roles by tags, the detective's bow, titles to one player | Yes | | |
| Build battle | 2 | A plot area per player, a theme by weighted pick, a timer, votes by `/trigger` or a dialog | Yes, with a limit: plot edges are kept by moving players back, not by protecting blocks | | Plots protected by cancelling |
| Parkour | 2 | Checkpoint areas that set the spawn point, a clock score per player, best times on the list | Yes | | |
| Survival games | 2 | The user's arena or a drawn one, chests refilled from loot tables, a grace time, a shrinking border | Yes | | |
| UHC | 2 | The natural healing game rule off, a shrinking border, health shown under names | Yes | | |
| Capture the flag | 3 | A banner at each base, a flag area, the carrier marked, a score per capture | Yes | | |
| King of the hill | 3 | A hill area adding to a team's score each second, a target score | Yes | | |
| Duels | 3 | A small arena, a kit picked by a dialog, best of three | Yes | | A queue across arenas |
| Skyblock | exists | The Skyblock flow (B557) | Yes | | |
| One block | exists | The One block flow (B557) | Yes | | |
| Prison | 3 | Mines that refill, a sell area, a money score, ranks | Mock-up: needs the mod (`/sell`, `/rankup`, money on the screen by `msm:hud`) | As the mock-up | Its natural home: an economy and permissions |

## 3. Decisions taken here (vetoable defaults) and questions for the user

Decided by the user (2026-11-23, recorded in ADR 0132 as the user's choice): the hub with its nine tabs (Game, Teams and players, Timers and scores, Areas, Command blocks, Map, Story, Lobby, Test and share); the catalogue of 18 types with their sentences, kinds of game and player counts; the pill "Plays without mods" or "Needs MSM's mod"; the Lifesteal set-up screen (sections Hearts, When someone has no hearts left, Heart items, World and border, a live view that plays a round, "What it is made of"); one mode with More options.

Vetoable defaults of this plan:

- **D1 A game is one element.** A new kind `msm:game` in `@msm/plugin-games` holds the type, the round (how it starts, how long, how it is won, what happens after), the lobby, the roles and a list of **mechanics** with their settings. It lowers to data pack files only, as its six sisters do. The Game tab is its Studio. A flow's answers are therefore never lost: the game stays editable as the mock-up's screen.
- **D2 Mechanics, not eighteen programs.** A type is a named set of mechanics with defaults. Batch 1's mechanics: `hearts`, `tracker`, `head_start`, `elimination`, `fall_out`, `floor`, `team_base`, `generators`, `shop`, `border`, `kit_on` (which kit at the start and at a respawn) and the win conditions `last_standing`, `role_dies`, `advancement`, `score_target`, `timer_ends`. Each mechanic is one lowering file and one Studio section.
- **D3 A kit is a kind.** `msm:kit` (items, armour, off hand, effects, clear first) lowers to one `give` function. Rules get a step "Give a kit". `msm:world_setup`'s new-player items stay as they are.
- **D4 Data pack first, the mod second, Paper third.** A type marked "Plays without mods" must pass its parity tests as a vanilla data pack. Where the mod makes a thing better (a real `/withdraw`), the game says so in "What it is made of" and uses the better form only when the project already needs the jar.
- **D5 The pill is computed**, from the session's `needsJar` for an open mod and from each starter's default bundle in a library test for the catalogue.
- **D6 One game per mod in batches 1 and 2** (`games.too-many-games`); several games behind one lobby come in batch 3.
- **D7 Make this asks for a name only**, builds the type with its defaults and opens the hub on the Game tab. With a game already in the open mod, it offers to start a new mod.
- **D8 The catalogue lists the 18 types first**, in the mock-up's order; the six older flows that are not types (Sky islands, Lucky block, Adventure map, Arena game, Race, Goals) follow under "More to start from". Home's row is headed **Games and maps**.
- **D9 Lifesteal without mods uses `/trigger withdraw`**; "kept out for a time" is spectator mode with a clock that survives leaving and joining. A real ban and a real `/withdraw` need the mod or Paper, and the Studio says which.
- **D10 Practice players.** Try it gains up to seven stand-in players (names, teams, health) driven from the panel **Your game** and by a round script per type, so a round can be watched in the app (amends ADR 0117 limit M14).
- **D11 Positions are typed or picked on the building's own view** (the Area Studio's view from above and the side). Picking a place in the running game is a reserve brief.
- **D12 Command blocks are edited, not simulated block by block.** The tab builds commands in plain words, edits the command blocks inside a building and makes chains; Try it runs a chain as a function and says so. Functions are recommended over command blocks in words on the tab.
- **D13 Stories lower to advancements, reward functions and dialogs** (`msm:story`, batch 2), so a story plays without mods and shows as a quest log in the game's own advancements screen.
- **D14 The Modpack Studio is the Modpacks dialog grown into a view** with a "Your modpacks" row under Your mods; modpacks stay files of their own (ADR 0046), not elements.
- **D15 The redstone showroom is last** (batch 4): it needs a signal engine in `@msm/sim`, which has its own spike.

Questions that need the user (none blocks the spike or wave 1):

1. **Hide and seek and Prison.** If the spikes show they can play without mods (in a simpler form), should the card say "Plays without mods" with the mod's better form as an option? Default: yes, the mark follows the evidence.
2. **Releases.** The standing word is "keep going and publishing". This plan proposes a release when batch 1 closes (the hub with four games) and one per later batch. Default: yes.

## 4. Rules for every brief below

These add to `docs/HANDOFF.md` "Rules" and "Rules for every brief" and to section 3 of `docs/PLAN-one-mode-rest.md` (worktrees, commits as the user with no credit lines and ` [skip ci]`, never `git config`, owner files complete, no loosened tests, screenshots at scale 2, disk, no new dependency), which all apply.

- **Read first:** root `CLAUDE.md`, the scoped `CLAUDE.md` of the area, the last DEVLOG entry, ADRs 0113 to 0117 with their findings, draft ADR 0132 (section 9 until the main session files it), the spike's README `docs/reference/spikes/b720/README.md` once it exists, and this plan's "Notes from implementation" (section 11).
- **Files only the orchestrator edits:** root `CLAUDE.md`, `docs/HANDOFF.md`, `docs/ROADMAP.md`, `docs/LIVE-VIEW-AUDIT.md`, `docs/ONE-MODE-AUDIT.md`, `docs/COVERAGE-AUDIT.md`, `docs/adr/`, `CHANGELOG.md`, the scoped `CLAUDE.md` files, this plan. Lines for them go in the report's "Notes for the plan".
- **Files with one owner at a time across all plans** (the main session names the owner when it starts a brief): `App.tsx`, `Toolbar.tsx`, `app/e2e/fixtures.ts` and every existing spec, `app/test/components/App.test.tsx`, `app/test/search/golden-queries.json`, `packages/ai/src/prompt/` with the pinned hashes, `docs/guide/`, `components/home/gallery/`, `tryit/TryItView.tsx`, `tryit/tryit-store.ts`, `packages/sim/src/grounds/`. A brief here touches one of them only where its "Owner files" say so.
- **Data packs first.** Nothing a "Plays without mods" type lowers may need the jar. Every lowered line passes `@msm/schemas/mcfunction` with no error or warning on both targets and is written from `TargetFacts.commands.forms`; a form the facts lack is added by B723, never written as loose text.
- **Clean room** as always; game behaviour is learned by observation in GameTests. No server's name, map, wording or art.
- **Live view.** Every brief that adds a kind, a mechanic, a Studio section or a type names its live view; the lines for `docs/LIVE-VIEW-AUDIT.md` go in the notes. A mechanic with nothing drawn is refused at review.
- **Findable.** Every type, tab, mechanic and kind gets search words and at least one query; until the golden file is free the queries go in the notes and B735 adds them.
- **One mode.** Plain words, a one-line why per section, **New here?** on each tab, ids and rare settings in **More options**; the default view of every new surface passes `expectPlain` (`app/test/components/plain-sweep.ts`).
- **Exit criteria always:** `pnpm lint`, `pnpm typecheck`, the touched packages' tests, `node tools/check-deps/index.ts`; mcdoc changes `node tools/build-msm-mcdoc/index.ts --check`; library changes `UPDATE_GOLDENS=1` once, then a clean run; app briefs `pnpm --filter @msm/app build` and `node tools/check-size/index.ts` (stop above 20.5 MB renderer, 5.5 MB first paint or 31 MB asar); engine-mod briefs `./gradlew build`, `-Pmc=26.4` and `-PwithoutGeckolib`.
- **The goal line.** Each brief says which of the three questions it moves (any mod, quickly, higher quality); they are given below as *Moves*.
- **Models:** Opus `claude-opus-5-5` at medium unless the brief says high; Sonnet `claude-sonnet-5-5` where said; a stuck brief is rerun at high.

## 5. Order, and how it fits the running plan

At most five executors at once across all plans, and at most two that run Gradle. The running plan has first call on the slots; a brief here starts when a slot is free, its "after" is merged and no running brief shares a file with it.

**Can start now** (they own only new files and folders, or packages the running plan does not touch): B720, then B721, B722, B723, B724, B725, B726, B727, B728, B729, B733 as slots allow. **Must wait:** B730 to B732 need B721 only, but their e2e and wiring wait; B735 (wiring) waits for the running plan's wave 2 to be merged (`App.tsx` and the gallery free of B713, `Toolbar.tsx` free of B701 and I1) and for B704 (the golden file); B738's guide and prompt halves take the guide and the prompt pin in a wave where the running plan has no owner for them (its wave 3, or after B644).

| Wave | Briefs (model, effort) | Notes |
|---|---|---|
| A0 | **B720** spike (Opus, high) | Alone of this plan; Gradle. Its report amends section 2 and the draft ADR before A1. |
| A1 | **B721** scaffold and stubs (Opus, medium), then **B722** format (Opus, medium) · **B723** plugin API 1.27.0 and facts (Opus, medium) | B721 first and alone (it owns the index and registry lines); B722 and B723 together. |
| A2 | **B724** round engine and kits (Opus, high) · **B725** mechanics: hearts, tracker, head start (Opus, high) · **B726** mechanics: floor, fall-out, team bases, generators, shops (Opus, high) · **B727** Try it's commands for games (Opus, medium) · **B729** Rules 4 for games (Opus, medium) | After B722 and B723. One mechanic, one file: no shared files. B729 is the only one that may touch `engine-mod`. |
| A3 | **B728** practice players and round scripts (Opus, high) · **B730** the hub's shell (Opus, high) · **B731** the catalogue (Opus, medium) · **B732** the Game and Kit Studios (Opus, high) · **B733** four types: starters, examples, arenas, art (Opus, high; art by Sonnet) | B728 after B727; B733 after B724 to B726. B730 to B732 need only B721's stubs and B722's format. |
| A4 | **B734** the Map and Test and share tabs (Opus, medium) · **B735** wiring: App, Home, More, palette, search (Opus, medium) · **B736** fixture, parity tests and CI (Opus, high) | B735 only when `App.tsx`, `Toolbar.tsx`, the gallery and the golden file are free. B736 after B733. |
| A5 | **B737** e2e (Opus, medium) · **B738** AI helper topic, guide, changelog lines (Opus and Sonnet) | After B735. |
| A6 | **B739** close of batch 1 (main session); a release | |
| Batch 2 | **B740** spike 2 · **B741** `msm:story` · **B742** the Story tab · **B743** command builder and the Command blocks tab · **B744** command blocks in Try it · **B745** the Lobby tab 2 · **B746** to **B748** eight more types · **B749** fixture, e2e, guide, close | Section 7. |
| Modpack Studio | **B750** to **B752** | After the running plan's B716 (it owns `ModpacksDialog.tsx` in its wave 4) and Plan B's B767. Section 7. |
| Batch 3 | **B753** to **B755** | Section 7. |
| Batch 4 | **B756** to **B759** redstone in Try it and the showroom | Section 7. |

Merge order inside a wave: the format and facts before anything that reads them; B721's stubs mean no later brief edits `packages/plugins/games/src/kinds/index.ts`, `lowering/index.ts`, `validators.ts`, `studios/games/studios.tsx`, `packages/plugins/library/src/starters/index.ts`, `examples/index.ts`, `engine-mod/parity`'s `fabric.mod.json`, `.github/workflows/ci.yml`, `tools/check-deps/layers.json` or `pnpm-lock.yaml`.

Against Plans B and C: this plan does not wait for either. Its **Test and share** tab ships with Try it, Play my game and the exports that exist; **Play with friends** appears when Plan B's B769 lands, and **Export as a Paper plugin** when Plan C's B788 lands (both are optional props that render nothing while absent).

## 6. The briefs of batch 1

### B720 Spike: community games on a data pack (wave A0; Opus, high)

- **Purpose:** measure, on both targets, what the four first types and the two doubtful marks need, before any format is fixed. *Moves: any mod, higher quality.*
- **Owner files:** new `docs/reference/spikes/b720/` (README with the answers, `spike-src/`, observation JSON). Throwaway code under `engine-mod/src/gametest/` and a throwaway pack are deleted before the report; no commit outside the spike folder.
- **Method:** GameTests on a dedicated server on 26.3 and 26.4 (and a client GameTest where a screen matters), a throwaway data pack per question, signatures by `javap` only. Each answer is "go", "no-go" or "go with this change", with the exact command forms that worked.
- **Questions:**
  - K1 Which scoreboard criteria exist and when they update against the tick function: `deathCount`, `playerKillCount`, `totalKillCount`, `health`, `trigger`, `killedByTeam.<colour>`, `teamkill.<colour>`, and the statistics `minecraft.custom:minecraft.deaths`, `player_kills`, `time_since_death`, `leave_game`.
  - K2 `attribute <player> minecraft:max_health base set <n>` from a macro function fed by a score: does it hold through death, leaving and joining; what happens to current health; the lowest value that works.
  - K3 Who killed whom in one tick: the advancement triggers for a player killing a player and a player killed by a player, whom their reward functions run as, and their order against K1's scores.
  - K4 A Heart item: a recipe whose result carries components (name, model, `custom_data`, consumable) on both targets; its use found by an advancement trigger with a predicate on `custom_data`; revoking to arm it again. The revive item: whom it brings back (the one out longest, or a pick through a dialog).
  - K5 `/trigger`: enabling an objective for everyone each tick, its cost, reading and clearing the value.
  - K6 "Kept out for a time": spectator mode with the return time held as a game-time score; behaviour across leaving, joining and a restart.
  - K7 A tracking compass: `lodestone_tracker` set by a macro function from the runner's position and dimension; how the compass is found in the inventory (`execute if items`); the cost a second for ten hunters; what it shows across dimensions.
  - K8 Winning a hunt: the dragon advancement's reward function, the runner's death.
  - K9 Holding hunters for a head start: effects, a barrier box or a teleport each tick; which is kindest and cheapest.
  - K10 Spleef: adventure mode with a `can_break` shovel on snow, breaking at once, drops off (the game rule's name on 26.x), a fall found by an area or a height predicate, rebuilding a 32 by 32 floor by `fill` or by `place template` (cost of each).
  - K11 Beds: testing that a bed still stands (both halves), a team's spawn point, respawn at once (the game rule's name), a respawn delay by spectator mode and a clock, a death in the void.
  - K12 Generators: an item summoned every n ticks with a cap on items nearby; the cost of twelve.
  - K13 Shops: a trader summoned with offers on 26.x (the data form, items with components), still and safe from harm; the same through `villager_trade` or `trade_set` data if that works without NBT; a dialog with buy buttons as the other route.
  - K14 Last one standing: counting players and teams still in, announcing, and a one-player practice mode.
  - K15 The round's state across `/reload` and a restart (scores and storage); a player who joins in the middle.
  - K16 The lobby: a countdown once enough players are in, an even random split into teams, its cost for 16 players.
  - K17 Protection without cancelling: what adventure mode with `can_break` and `can_place_on` still lets a player spoil (fire, TNT, buckets, entities); the list becomes limits.
  - K18 Hide and seek: a block display kept on a hider (lag, turning, what a seeker still sees). Verdict for the pill.
  - K19 The cost of each of the four games' tick functions with 16 mock players; the bar is 1.0 ms a tick for a whole game.
  - K20 How a GameTest stands in two or more players so that K1 and K3 can be automated in the parity tests (the mock players already used by `SampleGameModesParityTest`, or a client GameTest).
  - K21 Rules: whether the Script API's `entity.death` fires for a player and names the killer; what a "player dies" trigger needs in the runtime.
- **Exit criteria:** the README answers K1 to K21 for both targets with evidence files; a table "type, mechanic, form that worked, cost"; a list of facts for B723 (criteria, command forms, game rule names); the changes it asks of section 2, section 3 and the draft ADR. No code left in `engine-mod/`.
- **Out of scope:** any format or lowering; batch 2's types but for K18.

### B721 Scaffold and stubs (wave A1; Opus, medium)

- **Purpose:** every shared registration point, so later briefs never share a file. *Moves: quickly.*
- **Owner files:** `packages/plugins/games/src/kinds/index.ts`, `lowering/index.ts`, `validators.ts`, `search.ts`, `templates/pieces.ts` (the index lines only); new `kinds/game.ts` and `kinds/kit.ts` (each kind's own definition, imported by the index, so B722 never edits the index); new folders with "not yet" stubs: `packages/plugins/games/src/lowering/game/` (`index.ts`, `round.ts`, `lobby.ts`, `roles.ts`, `mechanics/index.ts` and one stub file per mechanic of D2), `lowering/kit.ts`, `validators-game.ts`, `validators-kit.ts`; `packages/schemas/mcdoc/msm/games.mcdoc` is **not** touched (B722); `app/src/renderer/src/studios/games/studios.tsx` (two lazy entries) with stub `GameStudio.tsx` and `KitStudio.tsx`; new `app/src/renderer/src/gamehub/` (`GameHub.tsx`, `hub-store.ts`, `hub-model.ts`, `Catalogue.tsx`, `tabs/` with one stub per tab, `rounds/`); new `packages/sim/src/players/` (stub); `packages/plugins/library/src/starters/index.ts` and `examples/index.ts` (four type entries that build an empty bundle until B733) with stub files `starters/games/{lifesteal,manhunt,bed-wars,spleef}.ts`; new `fixtures/sample-community-games/` (README only); `engine-mod/parity`: the class `SampleCommunityGamesParityTest` (no tests yet) and its `fabric.mod.json` entry; `.github/workflows/ci.yml` (the fixture's export, server check and parity lines, as `sample-game-modes` has them); `tools/run-fabric-server` (the fixture in its lists); empty specs `app/e2e/game-hub-path.spec.ts` and `game-types-path.spec.ts` (one skipped placeholder each is **not** allowed: an empty `describe` with a comment).
- **Exit criteria:** everything builds and every existing test passes unchanged; the two new kinds are registered with an empty schema that B722 fills; the Add dialog does not yet list them (hidden until B722 by a flag in the plugin, removed by B722); lint, typecheck, check-deps, app build, check-size; `./gradlew -p parity build`.
- **Out of scope:** any behaviour.

### B722 Format: `msm:game` and `msm:kit` (wave A1; Opus, medium)

- **Purpose:** the two kinds' schema, from D1 to D3 and the spike. *Moves: any mod.*
- **Owner files:** `packages/schemas/mcdoc/msm/games.mcdoc`, the conformance corpus entries for the two kinds, `packages/plugins/games/src/kinds/game.ts` and `kinds/kit.ts` (B721's stubs), `packages/plugins/games/test/kinds*.test.ts`.
- **Scope:** `msm:game { type, name, players { min, max }, round { kind: endless | rounds, start: command | enough_players | world_start, countdown, length?, win: [condition], after: lobby | stay | next_round }, lobby? { spawn, area?, building?, teams: auto | pick | none }, roles?: [{ id, name, count | rest, team?, kit? }], mechanics: [ one struct per mechanic of D2, dispatched on type ] }` and `msm:kit { name, items: [{ item, count, slot?, components? }], armour?, off_hand?, effects?, clear_first }`. Every field has a doc comment in plain words (the schema form and the AI helper read them). References are ids of the project's own teams, areas, timers, kits, buildings, loot tables and advancements.
- **Exit criteria:** `node tools/build-msm-mcdoc/index.ts --check`; the corpus holds a valid and an invalid case per mechanic; the kinds' tests; lint, typecheck. Notes: the field names for B724 to B726 and B732.
- **Out of scope:** `msm:story` (B741), lowering.

### B723 Plugin API 1.27.0 and the facts (wave A1; Opus, medium)

- **Owner files:** `packages/plugin-api/src/library.ts`, `target.ts`, the API report and version files, `packages/targets/mc-26.3/src/target.ts`, `mc-26.4/src/target.ts`, `packages/targets/all/test/games.test.ts`.
- **Scope:** `ProjectStarter.game?: { category: survival | battle | team | minigame | party | chase | creative | course | economy, players: [min, max] }` (the catalogue's chips and pills); `scoreboard.criteria` grown by what K1 measured; the command forms the four games write (`attribute`, `gamemode`, `effect`, `item replace`, `clear`, `spreadplayers`, `trigger`, `schedule`, `worldborder`, the trader summon) as named `commands.forms`; `TargetFacts.gameRules` names the spike used. Every value is the spike's; anything unmeasured is left out with "(verify at implementation)".
- **Exit criteria:** each filled form checked against the vendored command tree on both targets (`games.test.ts`); the plugin API tests and report; `node tools/check-deps/index.ts`; lint, typecheck. *Moves: higher quality.*

### B724 The round engine and kits (wave A2; Opus, high)

- **Owner files:** `packages/plugins/games/src/lowering/game/index.ts`, `round.ts`, `lobby.ts`, `roles.ts`, `lowering/kit.ts`, `validators-game.ts`, `validators-kit.ts`, their tests under `packages/plugins/games/test/game/`.
- **Scope:** the state machine every type shares, as functions under `<ns>:msm_games/game/`: lobby, countdown, playing, ending; `start`, `stop` and `end` functions and a hook tag for each change of state (so Rules and stories attach, as the timer's `ended` does); roles dealt at random by count; teams split evenly; a player who joins in the middle (K15); the win conditions of D2 as one file each under `game/win/`; the state on scores and storage so `/reload` and a restart keep it. `msm:kit` lowers to `<ns>:msm_games/kit/<path>/give`. Validators: unknown references, more roles than players, a round with no way to end (`games.game.never-ends`), more than one game (`games.too-many-games`).
- **Live view:** named for B732 (the round strip: the states in order with the time in each).
- **Exit criteria:** tests that lower three hand-written games and check every line offline on both targets with no error or warning; a played-through test in the sim's function engine for the state machine (start, win, back to the lobby); the plugin's tests; lint, typecheck. *Moves: any mod.*

### B725 Mechanics: hearts, the tracker and the head start (wave A2; Opus, high)

- **Owner files:** `packages/plugins/games/src/lowering/game/mechanics/{hearts,tracker,head-start}.ts`, their validators' files made by B721, tests under `packages/plugins/games/test/game/mechanics/`.
- **Scope:** as the spike's forms. Hearts: starting, most and per-kill hearts, only player kills moving a heart, the three endings at zero, the Heart item, withdraw by `/trigger`, the revive item. Tracker: who tracks whom, how often, what it shows in another dimension. Head start: seconds, and the way K9 chose.
- **Exit criteria:** every line checked offline on both targets; a sim play-through per mechanic once B727's commands exist (written to skip with a clear reason until then, and un-skipped by B728); lint, typecheck, the plugin's tests. *Moves: any mod.*

### B726 Mechanics: the floor, falling out, team bases, generators and shops (wave A2; Opus, high)

- **Owner files:** `packages/plugins/games/src/lowering/game/mechanics/{floor,fall-out,team-base,generators,shop,border,kit-on,elimination}.ts`, their validators' files, tests beside B725's.
- **Scope and exit criteria:** as B725, from K10 to K14 and K17. The tick cost of a Bed Wars-style game with four teams and twelve generators is reported against K19's bar.

### B727 Try it runs the commands games use (wave A2; Opus, medium)

- **Owner files:** `packages/sim/src/commands/vanilla.ts`, `packages/sim/test/commands/`, new `packages/sim/src/commands/games-commands.ts`.
- **Scope:** `attribute` (most health, shown on the hearts row), `gamemode` (spectator drawn as a ghost and unable to touch), `bossbar`, `worldborder` (drawn as a wall inside the area), `spreadplayers`, `item replace` and `item modify`, `trigger`, `gamerule` (kept as state; the ones the sim obeys named), `weather`, `difficulty`; scores with criteria change by themselves when the sim's player dies or kills. What a form cannot do stays one "Only in Minecraft" line.
- **Exit criteria:** the function engine runs at least 95 % of the lines B724 to B726 lower for the four types (the test lists the rest by name); `lineSupport` marks follow; sim tests; lint, typecheck. *Moves: quickly, higher quality.*

### B728 Practice players and round scripts (wave A3; Opus, high; after B727)

- **Owner files:** `packages/sim/src/players/` (all), `packages/sim/src/games/` (the panel's data only), `packages/sim/test/players/`, `app/src/renderer/src/gamehub/rounds/` (one script per type), `app/src/renderer/src/tryit/games/GamesPanel.tsx`.
- **Scope:** up to seven stand-in players with a name, a team, health and a place; `@a`, `@r`, `@p` and `execute as` see them; actions from the panel and from a script: walks to a place or into an area, hits, is knocked out by, breaks the block under, leaves, joins. A round script is a short timed list of such actions for a type ("Alex takes a heart from Sam"), run headless for the Game tab's live view and in Try it by **Watch a round**. Un-skips B725's and B726's play-throughs.
- **Exit criteria:** the four types' scripts play to a win in the sim from the real lowered files, with the lines the mock-up shows ("Alex took a heart from Sam."); frame rate in Try it with seven players reported; sim and app tests; build, check-size; ADR 0117's limit M14 amendment text in the notes. *Moves: higher quality.*

### B729 Rules 4 for games (wave A2; Opus, medium)

- **Owner files:** `packages/plugins/rules/src/catalogue/` (the new entries), `compile/games.ts`, `packages/schemas/mcdoc/msm/rules.mcdoc`, `packages/plugins/rules/src/search/`, the plugin's tests; only if K21 says the runtime lacks it: `packages/plugins/scripting/api/script-api-v1.json`, the typings golden and `engine-mod`'s `ScriptApi` with a GameTest and a parity test.
- **Scope:** triggers "A player dies" (actors: the player, the killer) and "The game starts", "The game ends" (through B724's hook tags and the function bridge); steps "Set most hearts", "Add to most hearts", "Give a kit", "Start the game", "End the game", "Take out of the game"; the condition "Only one is left". Each compiles to `runCommand` with forms from the facts.
- **Exit criteria:** catalogue counts updated in the tests; the Rule book Studio's pickers cover the new slots (kit, game); the AI's `kind_schema` allowance reported; engine-mod builds on both versions if touched; lint, typecheck. *Moves: any mod.*

### B730 The hub's shell (wave A3; Opus, high)

- **Owner files:** `app/src/renderer/src/gamehub/GameHub.tsx`, `hub-store.ts`, `hub-model.ts`, `tabs/TeamsTab.tsx`, `TimersTab.tsx`, `AreasTab.tsx`, `tabs/shared/`, tests under `app/test/components/gamehub/`.
- **Scope:** the nine tabs of the mock-up in its order. A tab is a list of the mod's own things on the left and the chosen thing's Studio on the right, through the Studio registry (the hub never imports a Studio file). Teams and players: teams, roles and kits; Timers and scores: timers and objectives; Areas: areas and the game's named places. Each tab has **New here?**, a one-line why, **Make a new one** and an empty state in plain words. The tabs not built in batch 1 (Command blocks, Story) show what is coming in one sentence and what works today instead (the Function editor; the advancement and dialog Studios). The hub is lazy (its own chunk) and keeps its tab in the mod's view state.
- **Live view:** each tab shows the chosen Studio's own live view; the hub adds none of its own.
- **Exit criteria:** `hub-model` unit tests (what each tab lists for three example mods); component tests (keyboard through the tabs, the lists, an empty mod); `expectPlain` on every tab's default view; build, check-size (the chunk's size reported); screenshots at 1280 and 1920 of each tab. *Moves: quickly.*
- **Out of scope:** `App.tsx` (B735); the Game tab's content (B732); the catalogue (B731).

### B731 The catalogue (wave A3; Opus, medium)

- **Owner files:** `app/src/renderer/src/gamehub/Catalogue.tsx`, `catalogue-model.ts`, tests.
- **Scope:** the mock-up's first screen: the heading and sentence, **Start from an empty game**, the kind-of-game chips (All, Survival, Battle, Team, Minigame, Party, Chase, Creative, Course, Economy), a card per type from the session's library (`ProjectStarter.game`): the picture, the kind, the players, the pill, the name, the sentence, **Make this** and **Try it**. Types not yet built show "Coming soon" in place of the buttons and are still findable. The pill is read, never typed (D5). **Try it** on a card plays the type's library example in Try it without adding it to a mod, through the Showcase's example source; if a full Try it over an example is more than this brief, it plays the type's clip in place and the report says so. The six older flows follow under "More to start from".
- **Exit criteria:** tests for the chips, the order, the pills and Coming soon; `expectPlain`; the card uses the gallery's card look (`card-style.ts`, read-only); screenshots. *Moves: quickly.*

### B732 The Game Studio and the Kit Studio (wave A3; Opus, high)

- **Owner files:** `app/src/renderer/src/studios/games/GameStudio.tsx`, `game-sections/` (one file per mechanic, plus `RoundSection.tsx`, `LobbySection.tsx`, `RolesSection.tsx`, `MadeOf.tsx`, `RoundView.tsx`), `KitStudio.tsx`, `kit-view.ts`, tests under `app/test/components/studios/games/`.
- **Scope:** the mock-up's second screen. Sections come from the game's mechanics in a fixed order, each with its why line, the two or three settings most people change and **More options**; the Lifesteal sections are exactly the mock-up's (Hearts; When someone has no hearts left; Heart items; World and border; their labels and defaults are in section 12). A choice the data pack cannot give ("A fresh world each season") is shown with what it needs, never hidden. The live view (`RoundView`) plays the type's round script on the real lowered files through the sim headless and shows the scene, the players' hearts or scores and the last line, and replays within 300 ms of an edit. **What it is made of** counts the lowered files in plain words and says "Plays without mods" or what needs the mod, with the file list in More options. **Add something to this game** lists the mechanics the game does not have. The Lobby tab of the hub shows `LobbySection` alone. The Kit Studio shows the kit as a hotbar, armour figure and off hand, drawn with the mod's and Minecraft's pictures.
- **Exit criteria:** component tests per section; the Lifesteal default view matches the mock-up's labels (a table test); an edit changes the round view (hearts per kill 1 to 2 changes the line); `expectPlain`; with every More options open no field of the schema is unreachable (a test over the mcdoc's fields); build, check-size; screenshots of all four types. Notes: the audit lines for `msm:game` and `msm:kit`. *Moves: quickly, higher quality.*

### B733 Four types: starters, examples, arenas and art (wave A3; Opus, high; art recipes by Sonnet from a designer brief)

- **Owner files:** `packages/plugins/library/src/starters/games/{lifesteal,manhunt,bed-wars,spleef}.ts`, `examples/community-games.ts`, `content/arenas.ts`, `art/recipes/community-games.ts`, the library's tests and goldens, `examples/` mirrors.
- **Scope:** each starter asks for a name (and, for Spleef and Bed Wars-style, a size) and builds the `msm:game` with its teams, areas, timers, kits, the arena as structure templates of vanilla block names (Spleef: a floor over a pit; Bed Wars-style: two to four team islands, a middle, beds, generator and shop spots), the world setup and `ProjectStarter.game`. One example per type (ADR 0129 D2). Art: the Heart, the revive item, a generator mark and the four cards' pictures from the art generator.
- **Exit criteria:** the library's golden test builds each on both targets with nothing above info from the project checker; the computed pill equals the mock-up's for the four ("Plays without mods"); `checkArtRules` passes; `UPDATE_GOLDENS=1` once, then clean; `tools/check-project` on each example. *Moves: quickly.*

### B734 The Map tab and the Test and share tab (wave A4; Opus, medium)

- **Owner files:** `app/src/renderer/src/gamehub/tabs/MapTab.tsx`, `map-steps.ts`, `tabs/TestShareTab.tsx`, tests.
- **Scope:** **Map** is the map maker as one flow, a checklist whose every step opens the thing that exists and shows done or not from the mod itself: 1 The world (the world setup's Studio); 2 Buildings (Bring builds from my test worlds, Chests and containers); 3 Where players start and what they may break (spawn, adventure mode, Can break); 4 The story (the Story tab; in batch 1 the advancement and dialog Studios); 5 Try it and Play my game; 6 Export as a map. **Test and share**: Try it, Watch a round, Play my game, Play with friends (shown when the prop from Plan B is present), Export as a data pack (when the game plays without mods), Export as a map, Add to a modpack, and later Export as a Paper plugin (a prop from Plan C); each with one sentence and its state.
- **Exit criteria:** `map-steps` unit tests over four example mods; component tests; `expectPlain`; screenshots. The handlers are props (B735 wires them). *Moves: quickly.*

### B735 Wiring: the app, Home, More, the palette and search (wave A4; Opus, medium)

- **After:** the running plan's wave 2 merged, I1 done, B704 merged; the main session confirms the owners are free.
- **Owner files:** `App.tsx` (the hub view, its handlers, nothing else), `Toolbar.tsx` (one optional More entry "Make a game or map…", `toolbar-game-hub`), `components/creator/creator-model.ts` (the heading "Games and maps"), `components/home/gallery/gallery-model.ts` (the lead card "Open the Game and map Studio" and the types' order), `commands/built-in-commands.ts` (the palette entry), `packages/plugins/games/src/search.ts` and the library's search words for the four types, `app/test/search/golden-queries.json` (the queries from the notes of B724 to B734, written by hand), `components/ElementSidebar.tsx` (a `msm:game` row opens the hub; nothing else).
- **Exit criteria:** a mod with a game opens the hub from Home's row, the More menu, the palette and the element list; "lose hearts", "break the floor", "manhunt", "bed wars", "last one standing", "kit" find their type or thing first on all configurations and the golden bars hold (97.0 % first or better; report the figure); app tests, build, check-size; run (not edit) `one-mode-path`, `toolbar-path`, `home-gallery-path`, `games-path`, `search-path`. *Moves: quickly.*

### B736 Fixture, parity tests and CI (wave A4; Opus, high; after B733)

- **Owner files:** `fixtures/sample-community-games/`, `engine-mod/parity/.../SampleCommunityGamesParityTest.java`, the fixture's golden test, `tools/run-fabric-server` lists.
- **Scope:** the fixture is made by the four starters in its golden test. Parity tests, on the content jar and on the vanilla data pack, both versions, with the stand-in players K20 found: a kill moves a heart and the most health follows; a player at zero goes where the setting says and returns after the time; the compass turns to the runner and the hunt ends at the runner's death; a broken floor drops a player out and the last one wins; a broken bed stops respawns and the last team wins; a generator fills to its cap; the round returns to the lobby and the arena is rebuilt.
- **Exit criteria:** every test green on both versions and both forms; `./gradlew -p parity build`; the server check passes with no `[msm_runtime]` error; the README's in-game check list for the user. *Moves: higher quality.*

### B737 e2e (wave A5; Opus, medium)

- **Owner files:** `app/e2e/game-hub-path.spec.ts`, `game-types-path.spec.ts`.
- **Exit criteria:** from Home's row to the catalogue, Make this for Lifesteal, the Game tab's sections, an edit changing the round view, each tab opened by keyboard, Watch a round in Try it for Spleef, the pill on all four, Export as a data pack producing a zip with no problem above info; green three runs in a row; nothing loosened.

### B738 AI helper topic, guide and changelog lines (wave A5; Opus for the prompt, Sonnet for the guide)

- **Owner files (when the main session grants them):** `packages/ai/src/prompt/game-studio.ts` and the truth test and pinned hash; `docs/guide/game-studio.md` (new) with `game-modes.md`, `maps.md`, `rules.md`, `try-it.md` and the sidebar entry in `docs/site/.vitepress/config.ts`.
- **Exit criteria:** the prompt within its budget (a raise is a line in ADR 0125 D7, asked of the orchestrator); the guide matches the shipped labels; the search's golden test green; changelog lines in the notes.

### B739 Close of batch 1 (wave A6; main session)

- ADR 0132 to "accepted with findings" for batch 1 with the spike's answers K1 to K21 and the limits; the audits; ROADMAP; a measured line for the goal ("from Home to a playing Lifesteal in N clicks and M seconds"); `app.asar` measured (B700's method) before the release.

## 7. Later batches (briefs in outline; each is written in full after the batch before it closes)

**Batch 2: stories, command blocks, lobbies and eight more types.**

- **B740 Spike 2** (Opus, high): the display-entity disguise in full, TNT run's cost, secret roles and titles to one player, plot keeping, checkpoints, loot chest refills, dialogs as shops and votes, command block block entities on 26.x (fields, the chain's facing, `/give` of a filled command block), stories by advancements (order, hidden steps, the quest log's look).
- **B741 `msm:story`** (format and lowering, in `@msm/plugin-games`): steps with a "when" (enters an area, talks to someone, has an item, defeats a mob, finishes a step) and a "then" (lines to say, a dialog, give, teleport, a timer, a building placed, a function), and the people of the story (a name, a look, a place, lines). Lowers to advancements, reward functions and dialogs. Exit: every line checked offline; a play-through in the sim.
- **B742 The Story tab**: the steps as a chart with each step's sentence; live view: the chart with the step being played, the lines as the game shows them (the dialog view of ADR 0120), **Play from here** in Try it. Audit line for `msm:story`.
- **B743 The command builder and the Command blocks tab**: a shared `components/command-builder/` that builds a command from the target's command tree and forms in plain words with pickers, shows the line, its sentence and whether Try it runs it; the tab lists the mod's command chains and the command blocks inside its buildings; the Structure Studio gains **Command blocks** beside Chests and containers (command, impulse, chain or repeat, conditional, needs redstone or always on, written back as SNBT); **Make a chain** makes a small building of command blocks; **Turn into a function**; **Give me this block** (a `/give` line and a place in the test world's chests). Exit: every written block entity checked against the target's schema; one undo step per edit.
- **B744 Command blocks in Try it** (`@msm/sim`): a command block in a building runs its command when powered by the Power tool, each tick when it repeats, and chains in order; said where it differs.
- **B745 The Lobby tab 2**: picking a team by walking into its area, ready by `/trigger`, leaderboards as text displays, a lobby building picker, back to the lobby after a round.
- **B746 Types: Sky battles, Survival games, UHC** · **B747 Types: TNT run, Parkour, Murder mystery** · **B748 Types: Hide and seek, Build battle**: each brief adds its mechanics (one file each), sections, starters, examples, round scripts and parity tests, as B725, B732, B733 and B736 did for the first four.
- **B749** fixture additions, e2e, guide, close of batch 2.

**Modpack Studio (after the running plan's B716 and Plan B's B767).**

- **B750 The Modpack Studio**: `ModpacksDialog.tsx`'s parts moved into `app/src/renderer/src/modpacks/` as a view (the list, the members with their state, extra mods, details), Home's row **Your modpacks** under Your mods, the More menu's Modpacks… opening the view; every old test id kept. Live view: a card per member mod drawn as Your mods draws them, and "What players get" (the mods list as the launcher will show it).
- **B751 A modpack's own instance and test**: through Plan B's recipes (`MCSuperMods: <modpack>`), so testing a modpack no longer clears the shared test instance.
- **B752** e2e `modpack-studio-path`, the guide's `modpacks.md`, search words.

**Batch 3: the last types and several games in one mod.**

- **B753 Types: Capture the flag, King of the hill, Duels** · **B754 Prison; Skyblock and One block as types** (their flows make an `msm:game`, so they have a Game tab) · **B755 Several games behind one lobby** (lifts D6: a lobby that sends players to a chosen game) and the close.

**Batch 4: redstone, last.**

- **B756 Spike**: what a signal engine in `@msm/sim` must cover for the showroom (dust, torches, repeaters, comparators, pistons, observers, lamps, doors, hoppers, droppers) against the real game; the tick order observed in GameTests; cost in the 48 by 32 by 48 area.
- **B757 The signal engine** in `packages/sim/src/redstone/`, with `fixtures/sim-parity` scenarios per part.
- **B758 The Redstone showroom**: Help > **Redstone showroom** and a Home row **Learn**; each contraption is a library building drawn from vanilla block names with a sentence on how it works, running live in Try it, with **Use this in my map** and **Put it in a building**.
- **B759** e2e, guide page `redstone.md`, close.

## 8. The main session's own steps

- **Before B720:** file ADR 0132 from section 9 as Proposed; add the ROADMAP section from section 10; put section 3's questions to the user.
- **After B720:** amend sections 2 and 3 and the ADR from its report; only then start A1.
- **Each wave:** name the owner of each one-owner file (section 4) before starting a brief; merge in the order of section 5; append the executors' notes to section 11; review each diff against its exit criteria and screenshots, refusing a mechanic without a live view or a type without search words.
- **B735** is given only when the running plan's owners are free; if they are not when A4 is otherwise ready, B734 and B736 go ahead and B735 follows.
- **Close of each batch:** the ADR's findings, both audits, the HANDOFF, a release on the user's standing word.

## 9. Draft ADR text

**ADR 0132: The Game and map Studio, game types and the kinds behind them** (Proposed)

- *Context.* The games kinds (ADRs 0113 to 0117) are loose pieces: nothing holds a whole game, a flow's answers are lost once it is made, round logic is hand-written per flow, Rules need the jar, and Try it has one player. The user asked for a place to make the game modes the community plays, with timers, command blocks, maps, stories, modpacks and a redstone showroom, and approved the mock-up of 2026-11-23.
- *D1 (the user's choice).* One hub, the **Game and map Studio**, reached from Home's row **Games and maps**, the More menu's **Make a game or map…**, the palette, search and a game's row in the element list. Tabs: Game, Teams and players, Timers and scores, Areas, Command blocks, Map, Story, Lobby, Test and share. Its front page is a catalogue of 18 game types under community genre names, each a working game to start from, each marked "Plays without mods" or "Needs MSM's mod".
- *D2.* A game is one element of the new kind `msm:game`: type, round, lobby, roles and mechanics. It lowers to data pack files only. One per mod until batch 3.
- *D3.* A type is a set of mechanics with defaults; a mechanic is one lowering file, one validator and one Studio section. The catalogue is the library's starters carrying `ProjectStarter.game` (plugin API 1.27.0).
- *D4.* `msm:kit` is a kind; `msm:story` (batch 2) lowers to advancements, reward functions and dialogs.
- *D5.* Data pack first: a type marked "Plays without mods" passes its parity tests as a vanilla data pack on both targets. The mark is computed from the project, never typed. The mod's better forms and Paper's (ADR 0134) are named in the Studio.
- *D6.* Try it gains practice players and round scripts; the Game tab's live view plays a round on the real lowered files (amends ADR 0117 limit M14). Every mechanic has something drawn.
- *D7.* Command blocks are built and edited (a command builder in plain words, the blocks inside buildings, chains), and run in Try it as functions; functions are recommended.
- *D8.* The map maker is one checklist over what exists (ADR 0116). The Modpack Studio is the Modpacks dialog as a view with a Home row; modpacks stay files (ADR 0046). The redstone showroom follows a signal engine in `@msm/sim` and comes last.
- *D9.* No server's name, branding, map or art is used; genre names only.
- *Consequences.* Three new kinds (`msm:game`, `msm:kit`, later `msm:story`) with Studios and live views; the audits grow; the renderer gains a lazy hub chunk; game flows written as function text (Arena game, Race) can later be re-made as types. Rules gain a death trigger and health steps. The spike's answers K1 to K21 and the limits join this ADR at the close of batch 1.
- *Status.* Proposed. D1 and D9 are the user's; D2 to D8 are vetoable defaults.

## 10. ROADMAP and DEVLOG text for the main session

ROADMAP, a new section "Game and map Studio (ADR 0132, `docs/PLAN-game-studio.md`, 2026-11-23)" with one checkbox per brief B720 to B739 by its title above, and one line each for batch 2, the Modpack Studio, batch 3 and batch 4.

```
## 2026-11-23 — orchestrator — Plans for the Game and map Studio, instances and Paper

**What**
- Checked the games plugin, its Studios and flows, Rules for games, command handling, Try it, Play and Test in Minecraft, modpacks and the launcher readers against the code at b0c0ae9, and wrote three plans with draft ADRs: `docs/PLAN-game-studio.md` (ADR 0132, B720 to B759), `docs/PLAN-instances.md` (ADR 0133, B760 to B779) and `docs/PLAN-paper.md` (ADR 0134, B780 to B799). No code changed.
- Found: no kind holds a whole game and flows lose their answers; Rules have no trigger for a player's death and need the jar; Try it runs 29 commands (not `attribute`, `gamemode`, `bossbar`, `worldborder`) and has one player; no command block or signal support; managed instances are Prism only, one per Minecraft version, always Fabric; no local server; no loader seam beside Fabric.

**Decisions** (vetoable defaults; the hub, its tabs and the catalogue are the user's choice)
- A game is one element (`msm:game`) made of mechanics, lowered to data pack files; `msm:kit`; practice players in Try it; the pill computed.
- Instances are made from recipes and offered, never taken; a vanilla instance and a local server join the Fabric test instance.
- Paper by one self-contained plugin jar built from a prebuilt runtime, API only, after a spike.

**Next**
- B720 and B760 in the two free slots; B780 when a slot frees; then wave A1.
- Ask the user: the marks of Hide and seek and Prison; PaperMC's download service as a new source and what the app names itself to it; Java for a local server.
```

## 11. Notes from implementation

(The main session appends each executor's "Notes for the plan" here.)

## 12. The approved mock-up, in words

Copied from the mock-up of 2026-11-23 so the design outlives its file. Toolbar as ADR 0131. Tabs, in order: Game, Teams and players, Timers and scores, Areas, Command blocks, Map, Story, Lobby, Test and share.

**The catalogue.** Heading "Pick a game type"; under it "Each starts as a working game you can play in Try it at once, then change: teams, timers, kits, arenas, rules and the map. All of it is your own copy."; the button **Start from an empty game**; chips All, Survival, Battle, Team, Minigame, Party, Chase, Creative, Course, Economy. Each card: a picture, three pills (the kind, "N players", "Plays without mods" or "Needs MSM's mod"), the name, the sentence, **Make this** and **Try it**.

| Type | Kind | Players | Sentence | Mark |
|---|---|---|---|---|
| Lifesteal | Survival | 2-100 | Kill a player to take a heart; lose them all and you are out (or banned for a while). | Plays without mods |
| Manhunt | Chase | 2-10 | One runner beats the game while hunters track them with a compass. | Plays without mods |
| Bed Wars-style | Team | 4-16 | Protect your team's bed, buy gear with resources from generators, break the others' beds. | Plays without mods |
| Sky battles | Battle | 2-12 | Start on your own sky island with loot chests; last one standing wins. | Plays without mods |
| Spleef | Minigame | 2-16 | Break the floor under the others with your shovel; last one up wins. | Plays without mods |
| TNT run | Minigame | 2-16 | The floor disappears behind you as you run; do not stop. | Plays without mods |
| Hide and seek | Party | 3-20 | Hiders blend in as blocks or mobs; seekers have a timer to find them. | Needs MSM's mod |
| Murder mystery | Party | 4-16 | One murderer, one detective with a bow, everyone else survives the round. | Plays without mods |
| Build battle | Creative | 2-16 | Build to a theme against the clock, then everyone votes. | Plays without mods |
| Parkour | Course | 1-50 | Checkpoints, a timer and a leaderboard on your own course. | Plays without mods |
| Survival games | Battle | 4-24 | Loot chests in an arena, a shrinking border, last one standing. | Plays without mods |
| UHC | Survival | 2-50 | No natural healing, a shrinking border, golden apples only. | Plays without mods |
| Capture the flag | Team | 4-20 | Take the other team's banner to your base. | Plays without mods |
| King of the hill | Team | 2-20 | Hold the hill to score; first to the target wins. | Plays without mods |
| Duels | Battle | 2 | One on one with a kit you choose, best of three. | Plays without mods |
| Skyblock | Survival | 1-8 | Start on a tiny island in the void and grow it. | Plays without mods |
| One block | Survival | 1-8 | One block that refills with something new each time. | Plays without mods |
| Prison | Economy | 1-50 | Mine ranks, sell blocks, rank up to get out. | Needs MSM's mod |

**Lifesteal, set up.** Heading "Lifesteal"; "Hearts move from the loser to the winner of every fight. Change any part below; the live view plays a round as you edit."; buttons **Try it** and **Play my game**. A tip: "New here? A Lifesteal game needs a starting number of hearts and what happens when someone runs out. Everything else is optional." Each section ends with **More options**.

- **Hearts** ("Each player starts with 10 hearts, like normal Minecraft."): Starting hearts 10; Most hearts a player can have 20; Hearts taken per kill 1; the help line "Only kills by another player count; falling or lava takes a heart away without giving it to anyone."
- **When someone has no hearts left** ("What happens to a player at zero."): They: "Watch as a spectator until the next round", "Are kept out for a time", "Start again with 3 hearts"; For: 1 hour.
- **Heart items** ("Let players craft or withdraw hearts as an item they can give away."): Recipe: 4 diamond blocks, 4 netherite scraps and a totem make 1 Heart; using it adds a heart. Command: `/withdraw` turns one of your hearts into a Heart item (not below 1). Revive: a Revive beacon brings back a player who ran out, with 3 hearts.
- **World and border** ("Where the game is played."): World: "A normal survival world", "One of my maps", "A fresh world each season"; Border: 5,000 blocks across.
- **The live view**: the scene, each player's hearts and number ("Alex 11", "Sam 9"), the last line ("Alex took a heart from Sam."), and **What it is made of**: "Plays without mods: a data pack with 2 functions, 1 recipe, 1 advancement, a scoreboard and a timer." with More options.

