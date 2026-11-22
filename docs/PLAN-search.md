# Plan: Search everything

**Status: draft (2026-11-22).** Brief ids B650–B673, reserves B674–B676 (B649 stays free); [ADR 0124](adr/0124-search-everything.md) (Proposed). Nothing after wave 0 starts before the spike B650 has reported. No runtime work, no Script API change, no new dependency, no in-game check; one plugin API minor (1.23.0, after the game modes plan's 1.22.0).

Working plan for the user's request of 2026-11-22: "Make an elite search bar so that whatever a user types it brings up the closest context or accurate search for what the user wants and can make it." Under the standing rules: take the recommended options, **Everything visible live** ([ADR 0119](adr/0119-live-worldgen-preview.md) D1), vanilla parity, document everything, British English, no emojis, clean room, never bundle Mojang assets. Written 2026-11-22 by the orchestrator at de72850 (branch `ccr-d077e76e-4gnbx2`). Every "today" claim below was checked against the code at that commit (fact table SF1–SF26); every number that says "draft" is the spike's to measure (SQ1–SQ16); what was not checked says "(verify at implementation)".

## In plain words

- **What it is.** One bar. You type what you want in your own words, spelling mistakes and all, and it shows the closest things MCSuperMods can do about it, best first, each with one button that does it.
- **What it finds.** Things you can make (every Creator flow, starter, template, example and Showcase card), the things already in your mod, Minecraft's own blocks, items, mobs, biomes, effects and sounds, the "When" and "Do" lines of the Rule book, settings, every menu command, the pages of the guide and your Things to fix.
- **It reads your words into answers.** "a blue sword" opens the Weapon flow with Sword and blue already chosen and the name "Blue Sword". "custom ore that drops xp" makes the ore and adds one rule: when a player breaks it, give experience. "a blue sword that sets mobs on fire" makes the sword and, beside it, an enchantment for swords that sets its target on fire. It shows what it understood as small labels you can remove, and strikes through the words it could not place.
- **You see it before you make it.** The result you have selected is drawn live beside the list, by the same preview the Creator uses, before anything is added to your mod. Undo takes back whatever you make.
- **It works with no internet and no AI.** Nothing you type leaves your computer. If you have set up the AI helper, the last line offers to hand it your words; nothing is sent until you press Send there.
- **Where it is.** At the top of Home, in the toolbar in every mode, and on Ctrl+K. The command palette stays where it is and gets the same brain, and so do the small filter boxes in the sidebar, Add element, Examples and the thing picker: "armor" finds "armour" everywhere.
- **Honest.** It matches words, it does not think. It knows the words its vocabulary knows. When nothing is close it says so and offers your Wishlist.
- **What it is not.** Not a web search, not an AI, not a find-in-files for the text inside functions and scripts, no index kept on disk, no telemetry, English only.
- **Build first:** the spike (how big, how fast, the first 80 test queries); then the engine and the words; then the panel, the actions and the live preview; the doors (Home, toolbar, Ctrl+K, the palette) last.

## What exists to build on

| Piece | Today | Reuse as is | Missing |
|---|---|---|---|
| Command palette | A subsequence score over titles, then ids (`fuzzyScore`); 51 built-in commands and the plugins' (SF1) | The dialog for quick picks, its key and test ids | Typos, synonyms, anything but commands |
| Add element, Examples, sidebar, ThingPicker | Four substring or word-start filters, each over one list (SF3–SF6) | Their places and looks | One matcher; Minecraft's own names |
| Creator flows | 62 flows of typed questions; the Creator rebuilds a preview 150 ms after an answer (SF9, SF10) | `validateParameter`, `planCreate`, `CreatorPreview`, `bundlePreviewProject` | Opening a new flow with starting answers; nothing reads answers from words |
| Surprise me | Answers flows by program, adds a rule book beside a flow, applies all as one undo step (SF11) | `planCreate`, `applyChangeset`, `foldItems`, the rule book it builds | The same from a query instead of a seed |
| Home and the Showcase | 27 tiles under eight headings, picks, the chooser; 13 cards with stills and clips (SF12, SF13) | The stills, one live clip at a time, **Make this** | A bar; tiles and cards are read, not searched |
| Rules catalogue | A label and a sentence for each of 62 triggers, 47 steps, 21 conditions and 14 values, exported by the plugin (SF14) | The words; the Rule book Studio | Finding a "When" or "Do" by words; adding a rule from outside the Studio |
| Things to fix | Plain words and one-step fixes per problem code (SF15) | The words, the fixes | Finding one by words |
| The guide | 38 pages, 474 headings, no pictures; not in the app (SF16) | The text | An index, a reader inside the app |
| The jar cache | `en_us.json` is extracted and nothing reads it (SF7) | The extraction | An IPC that returns the names |
| The AI helper | Build mode from one prompt; lists starters and templates page by page (SF18) | The panel, the changeset review, New project with the AI helper | A search tool for the helper; a door from search |
| The Wishlist | Requests MSM could not build, in `msm.wishlist.json` (SF19) | The file and dialog | A door from "nothing close" |
| Workers | The terrain worker and its client: lanes, a newer request cancels an older (SF20) | The pattern | A search worker |

## Size

`app.asar` is 26.2 of 32 MB and the renderer 17.6 of 19 MB (after B587; stop lines 31 and 18.5 MB, [ADR 0123](adr/0123-gzipped-vendored-target-data.md)). The live views plan budgets 0.4, 0.4 and 0.2 MB of renderer output for its three batches, which is already more than the 0.9 MB of room (SF21). So:

- **Draft budgets (set by B650):** renderer output at most **0.2 MB** in all, in lazy chunks (the engine and the worker chunk about 0.05 MB, the panel and preview pane about 0.06 MB, the plugins' search data about 0.08 MB); nothing in the first-paint bundle but the bar and the client's stub. `app.asar` at most 0.3 MB.
- **The guide stays out of the renderer and out of `app.asar`:** its Markdown (0.79 MB) is packaged with `extraResources` and read by main (ADR 0124 D14).
- **If the room is gone when this plan starts,** the lazy loading of the 26.3 Java project generator ([ADR 0123](adr/0123-gzipped-vendored-target-data.md) D4's follow-up, about 1 MB) runs first; it needs its own ADR and the orchestrator. Every app brief runs `pnpm build` and `node tools/check-size/index.ts` and stops above a stop line.

## Decisions in short

All in [ADR 0124](adr/0124-search-everything.md); the numbers are drafts until B650 reports.

| # | Decision | Recommended, and why |
|---|---|---|
| D1 | Offline, no AI by default, deterministic | The request must work for a child with no key and no internet, and a fixed query set can test it |
| D2 | The engine is a package, `@msm/search`, pure TypeScript, no dependency | Tested alone in Node; no new dependency rule; the app only collects entries |
| D3 | Index of entries in three layers (static, vanilla, project), built in a Web Worker after first paint, never stored | About 1,400 static entries and 5,400 vanilla ids (SF8, SF9) plus the mod; typing never waits on it; nothing to migrate |
| D4 | Matching: fold spellings, light stemmer with protected words, phrases and synonyms, joined and split words, one or two wrong letters by word length, intent words | Forgiving without turning "creeper" into "creep" |
| D5 | The Minecraft vocabulary is data owned by the plugins | The app never knows plugin content; third-party plugins are found by their own words; version facts stay in targets |
| D6 | BM25F over fields times intent times context; three Best matches, then six sections | "Rank across everything" with a list a beginner can read |
| D7 | Answers only from typed words; one clause, making at most one rule or one companion flow | Never invents; the result says what it understood |
| D9 | One action per result; the selected result drawn live before it is made | The user's words "and can make it"; the live rule |
| D10 | Home and the start surface, the toolbar, Ctrl/Cmd+K; the palette kept as a second door; one matcher in every filter box | One engine; no habit or e2e spec broken |
| D11 | Combobox pattern, keyboard for everything, a live region; no telemetry, an optional local history | Standing rules |
| D12 | The AI helper as the last row, prefilled, never sent by itself | ADR 0041 D1's promise |
| D13 | Plugin API 1.23.0: search data only, no code | Safe through the sandbox |
| D14 | The guide read inside the app, packaged beside it | **Show me how** needs no browser; the renderer budget is untouched |
| D15 | The findable rule for every later brief | The search stays complete as content grows |
| D16 | A fixed set of at least 200 queries on both targets; 85 % first, 95 % top three (draft) | Ranking is a claim until it is measured |

## How a query is read

```
"make a blu sword that sets mobs on fire"
  1 words        make | a | blu | sword | that | sets | mobs | on | fire
  2 intent       make  (flows, starters, templates and cards first)
  3 split        head "blu sword"            clause "sets mobs on fire"
  4 spelling     blu -> blue (one letter; shown: "Showing results for blue")
  5 vocabulary   blue = a colour (the dye's blue)    sword = the thing   "sets ... on fire" = the idea fire
  6 candidates   every entry that matches a word or an idea
  7 answers      Weapon flow: type = Sword, colour = blue, name = "Blue Sword"
  8 behaviour    the phrase "sets on fire" for a sword: the Enchantment flow beside it (swords, Set the target on fire)
  9 rank         text score x intent x context; the flow that used the most words first
 10 show         Best match "Blue Sword" with chips [Blue] [Sword] [sets mobs on fire], its live preview, Make this
```

Step 8 needs something MSM can make. Today the Rules catalogue has no step that sets a mob on fire, but the Enchantment flow has the effect "Set the target on fire" for swords (SF14), so this behaviour is a companion flow, not a rule. Whether the made sword can carry that enchantment from the start, or the two are simply made together, is the spike's to say (SQ12). A behaviour nothing in MSM can make reads as not understood (limit SL6).

## The first queries (draft expectations, for B650 to confirm on the real corpus)

| Query | Class | Expected first | Expected answers and notes |
|---|---|---|---|
| blue sword that sets mobs on fire | one thing and what it does | The Weapon flow (`weapon`) | type Sword, colour blue, name "Blue Sword"; beside it the Enchantment flow (`enchantment`) for swords with "Set the target on fire" (SF14, SQ12) |
| skyblock | slang | Until the game modes plan's B557: the world flow "Empty sky with a start island" (`world-empty-sky`). After it: the Skyblock flow | The golden entry carries `needs: starter skyblock` and both expectations |
| make a pig fly | plain, vanilla id | The Flying mob flow | name "Flying Pig"; a line says Minecraft's own pig stays as it is (limit SL6); second: the Mount flow; then the guide's flying section |
| custom ore that drops xp | one thing and what it does | The Custom ore flow | one rule: when a player breaks the ore, give experience (`block_broken`, `give_experience`, both in the catalogue, SF14) |
| how do I add a recipe | how to | The guide section on recipes | second: the tile "Make a recipe" (the Recipe pack starter); third: the recipe templates |
| armor / armour | American | The Gear set flow (`gear-set`, the tile "Make armour") | the same list for both spellings |
| creper | misspelt | The vanilla mob creeper, and what can be made with it | "Showing results for creeper" |
| netherite pick | slang | The Gear set flow (`gear-set`; verify at B650 which flow makes one pickaxe) | tier Netherite; "pick" read as pickaxe |
| 20 damage bow | plain, number | The Weapon flow | type Bow; damage 20 only if the bow's question accepts it, else dropped and shown struck through |
| turn off showcase clips | settings | The setting **Play showcase clips** | Open |
| export jar | command | Export Fabric Mod Jar… | Run |
| `minecraft:iron_ingot` | id | The vanilla item | Make something with it |
| ruby sword (in a mod that has one) | the mod's own things | The mod's Ruby Sword | Open; the Weapon flow second |
| why is my block pink | how to, fix | The Thing to fix about a missing picture, when there is one; else the guide's troubleshooting section | |
| asdfgh | nonsense | No Best match | "Nothing close to that yet", the Wishlist, the AI row with a key |

## The entry and the engine's interface (for B651 and B652 to freeze after the spike)

```ts
// @msm/plugin-api (1.23.0), data only
interface SearchVocabulary { words?: SearchWordGroup[]; colours?: SearchColour[]; }
interface SearchWordGroup { idea: string; same: string[]; near?: string[]; slang?: string[]; phrases?: string[]; vanillaIds?: string[]; }
interface SearchColour { names: string[]; colour: string /* #rrggbb */; }
interface SearchBehaviour { id: string; phrases: string[]; sentence: string; appliesTo: ('item' | 'block' | 'mob' | 'vehicle')[];
  answers?: Record<string /* starter id */, Record<string, Json>>;           // answers of the flow itself ("glows")
  rule?: Json;                                                                // one msm:rules rule; "$thing" is the made thing ("drops xp")
  beside?: { starter: string; values: Record<string, Json> }; }               // one companion flow ("sets mobs on fire": the Enchantment flow)
interface SearchEntryContribution { id: string; title: string; sentence: string; words?: string[];
  opens: { type: 'starter' | 'template' | 'example' | 'kind' | 'command'; id: string; values?: Record<string, Json> }; supports?(target: TargetFacts): boolean; }
// plus keywords?: string[] on ElementTemplate, ProjectStarter, ElementKind; search?: { role?: 'name' | 'main-colour' | 'main-number'; words?: string[] } on StarterParameterBase; words?: string[] on a choice

// @msm/search
type SearchSource = 'flow' | 'starter' | 'template' | 'example' | 'kind' | 'project' | 'vanilla' | 'rule' | 'setting' | 'command' | 'guide' | 'problem';
interface SearchEntry { id: string; source: SearchSource; title: string; sentence?: string; words?: string[]; body?: string; ids?: string[];
  available: boolean; unavailableReason?: string; technical?: boolean; plugin?: string; questions?: SearchQuestion[]; action: SearchAction; preview: SearchPreview; }
interface SearchRequest { text: string; mode: UiMode; scope?: 'make' | 'mine' | 'minecraft' | 'help' | 'commands'; limit?: number; }
interface SearchAnswer { understood: Understood; best: SearchHit[]; sections: { id: string; hits: SearchHit[]; more: number }[]; confident: boolean; }
interface SearchHit { entry: SearchEntry; score: number; answers?: Record<string, Json>; behaviour?: { id: string; sentence: string }; why: string[] }
```

`SearchAction` and `SearchPreview` are descriptors (which flow with which answers, which element, which guide page and heading), never functions: they cross the worker boundary, and the app's `search/actions.ts` and `ResultPreview.tsx` turn them into work. `why` lists the signals of a hit for tests and for Advanced's hover text.

## Fact table (SF1 to SF26)

Read in this repository at de72850 on 2026-11-22. No game jar was opened and nothing was measured in this session.

| # | Fact | Source |
|---|---|---|
| SF1 | The command palette is a Radix dialog with `fuzzyScore` (the query's letters in order; consecutive letters, word starts and a prefix score more) over a command's title, then its id. Ctrl/Cmd+Shift+P. 51 built-in command ids plus the plugins' `commands`. The component is reused for quick picks through its `title`, `placeholder`, `testId` and `emptyText` props; test ids `command-palette`, `command-palette-input`, `command-<id>` | `app/src/renderer/src/components/CommandPalette.tsx`, `commands/built-in-commands.ts`, `shortcuts.ts` |
| SF2 | Ctrl/Cmd+K is bound to nothing: `shortcutFor` has no `k` and the menu has no such accelerator. Monaco uses Ctrl+K as a chord prefix inside its editors (verify at implementation, SQ9) | `shortcuts.ts`, `app/src/main/menu.ts` (grep) |
| SF3 | The Add element dialog filters with `templateMatches`: every word of the filter is a substring of the template's title, description or category. 297 templates | `components/NewElementDialog.tsx`; root `CLAUDE.md` |
| SF4 | The Examples gallery filters with `exampleMatches`: the text is a substring of the title, kind, category or a tag. 200 examples. `ExampleProject.tags` is the only keyword field in the plugin API: templates, starters and kinds have none | `components/ExamplesDialog.tsx`, `packages/plugin-api/src/library.ts` |
| SF5 | The sidebar filters with `matchesSearch` on an element's id, kind or friendly group | `components/ElementSidebar.tsx` |
| SF6 | The ThingPicker filters with `filterThings`: every word starts a word of the name or id. A vanilla thing's name is words made from its id, not Minecraft's own name | `components/thing-picker/thing-sources.ts` |
| SF7 | The jar extraction keeps `assets/minecraft/lang/en_us.json` (`PREVIEW_ASSET_PATTERNS`); no code under `app/src` reads it | `packages/interop/src/minecraft-install/extract.ts`; grep `en_us` in `app/src` |
| SF8 | The 26.3 target's vendored `registries.json` has 190 registries and 33,217 ids: block 1,286, item 1,658, entity type 161, effect 40, sound event 1,991, particle type 128, enchantment 43, potion 46. The session reads them through `SchemaContext.registries`. About 5,400 ids are of the sorts search shows | `packages/targets/mc-26.3/vendor/mcmeta/registries.json`, `session/schema-context.ts` |
| SF9 | 74 starters, 62 of them Creator flows (`creator:` in the starter index). Questions are typed `string`, `number`, `boolean`, `colour`, `choice`, `set`, `image`, `audio`; the starter files declare 168 choice, 94 number, 78 yes or no, 62 text, 55 colour and 10 set questions (a grep count; some are shared) | `packages/plugins/library/src/starters/`, `packages/plugin-api/src/library.ts` |
| SF10 | `CreatorDialog` takes `flowIds`, `picks` and `edit` (reopening a set); it has no prop for the starting answers of a new set. The preview rebuilds 150 ms after an answer (`debounceMs`); `CreatorPreview` draws a bundle over `bundlePreviewProject` | `components/creator/CreatorDialog.tsx`, `preview/bundle-source.ts` |
| SF11 | Surprise me answers a flow's questions by program (each passing `validateParameter`), plans with the Creator's `planCreate`, folds a set's items (`foldItems`), adds a rule book beside a flow and applies everything as one undo step | `surprise/surprise.ts`, `surprise/themes.ts`, [ADR 0086](adr/0086-surprise-me-random-mod.md) findings |
| SF12 | Home is Very easy's editor area when nothing is open (`home` is passed only when `veryEasy`); Easy and Advanced show "Select an element to edit it, or add one with Add element." 27 tiles in `MAKE_TILES` under eight headings; picks and `MakeChooser` | `App.tsx`, `components/EditorArea.tsx`, `components/home/tiles.ts` |
| SF13 | The Showcase: 13 cards (`SHOWCASES`), drawn stills (`drawnStill`, `still-cache.ts`), one live clip at a time, the setting **Play showcase clips** | `showcase/` |
| SF14 | `@msm/plugin-rules` exports its catalogue: each trigger, step, condition and value has an `id`, a `label` and a `sentence`. It has `item_hit_mob`, `block_broken`, `give_experience`, `give_effect`, `explode` (with a fire option), `launch`, `spawn_mob`, `drop_item`; it has **no step that sets a mob or player on fire**, and the Script API has none either. The Enchantment flow does: its effect choices include `fire` ("Set the target on fire") and its targets include `swords` | `packages/plugins/rules/src/catalogue/`; grep `fire`, `ignite`, `burn` there and in `script-api-v1.json`; `packages/plugins/library/src/starters/enchantment.ts` |
| SF15 | Things to fix: `PLAIN_PROBLEMS` gives plain words for about 250 problem codes and two one-step fixes (`remove-step`, `paint-picture`) | `session/plain-problems.ts` |
| SF16 | The guide: 38 Markdown files, 791 KB, 474 `##` and `###` headings, no pictures, tables on many pages. The app shows none of it (only the Welcome's steps); the Help menu has no guide entry. `Markdown.tsx` renders headings, bullet lists, paragraphs, code and `https:` links: no tables, no numbered lists, no links between pages | `docs/guide/`, `app/src/main/menu.ts`, `components/Markdown.tsx` |
| SF17 | Settings is one dialog with the sections Game locations, Vanilla assets, Updates, Showcase, World backups, AI helper, AI pictures and Plugins; it has no search and no way to open at a given line | `components/SettingsDialog.tsx` |
| SF18 | The AI helper's tools: 12 read tools (among them `list_starters`, `list_templates`, `list_kinds`), 6 proposal tools (among them `add_starter` with values), `run_checks`, `propose_plan`, `checkpoint`, `note_missing_feature`. No search tool. The key lives only in main; nothing is sent before the user sends a message | `packages/ai/src/tools/`, [ADR 0041](adr/0041-ai-helper.md) D1, D4 |
| SF19 | The Wishlist is `msm.wishlist.json` beside the project file, with entries from the helper (`ai`) or the user (`user`) | `wishlist/wishlist.ts`, [ADR 0053](adr/0053-missing-features-and-the-wishlist.md) |
| SF20 | The terrain worker is a Vite module worker loaded by `import('./worker?worker')`, with a client of lanes in which a newer request cancels an older and a host for tests (`createTerrainHost`) | `terrain/worker.ts`, `terrain/client.ts` |
| SF21 | `app.asar` 26.2 of 32 MB, renderer 17.6 of 19 MB, stop lines 31 and 18.5 MB; the live views plan budgets 0.4 + 0.4 + 0.2 MB of renderer output | root `CLAUDE.md`, `docs/PLAN-live-views.md` "Size" |
| SF22 | The plugin API is 1.21.0; the game modes plan's B550 takes 1.22.0 | `packages/plugin-api/src/version.ts`, `docs/HANDOFF.md` |
| SF23 | The app has no search or fuzzy matching dependency | `app/package.json` (grep) |
| SF24 | Package layers are listed in `tools/check-deps/layers.json`; a new package needs its line (`@msm/sim` and `@msm/terrain` are the models) | `tools/check-deps/layers.json` |
| SF25 | Third-party plugins run in sandbox workers; their contributions reach the host through `plugins/sandbox/protocol.ts` | `app/src/renderer/src/plugins/sandbox/` |
| SF26 | View preferences (mode, folds, the Showcase's setting) live in the renderer's local storage through `store/preferences.ts`; they change no file | `store/preferences.ts` |

## Spike questions (SQ1 to SQ16)

Answered by B650 in Node and in the app, on both targets. No game server is needed; where a question needs the jar's names the spike uses a jar when the container has one and a made-up names file otherwise (never a committed Mojang string).

- **SQ1** The corpus: how many entries per source and per target the built-in plugins give (expected about 1,400 static and 5,400 vanilla), the words in the dictionary, and the time and memory to build each layer in a Worker on the CI class of machine and at a four times CPU slow-down.
- **SQ2** Query time: median and 95th centile for one to six words over the static layer, with the vanilla layer, and with a made-up mod of 500 and 5,000 things; the cost of the worker round trip against the same call on the main thread. **Go or no-go for the worker (ADR 0124 D3; else reserve B676).**
- **SQ3** Typo candidates: deletion neighbourhoods (the SymSpell idea, written by us) against trigram overlap against a BK-tree: recall and false matches on a set of 300 misspellings (every flow title and 100 vanilla names with one or two seeded edits, plus a hand list of misspellings players really type), memory, build time. Whether a cheap sound-alike key is worth it (**else reserve B674**).
- **SQ4** The stemmer: which pairs of different dictionary words the light stemmer merges, with and without the protected list; the list of exceptions it needs.
- **SQ5** A baseline: the first 80 queries of the fixed set, written by hand in the classes of ADR 0124 D16, with the expected result each can really reach on today's corpus; how today's matchers do on them (the palette's `fuzzyScore`, `templateMatches`, `exampleMatches`, `filterThings`), as the number to beat.
- **SQ6** Answers from words: for the 62 flows, the share of choice, colour, number, yes or no and name questions that can be answered from label words alone, the questions that need `search` hints, and the clashes (a word that fits two questions of one flow, such as a material tier and a crafting ingredient) with the rule that settles each.
- **SQ7** Preview cost: the time to build each of the 62 flows' bundles with default answers and to get a first picture from `CreatorPreview`, and which flows miss 250 ms (the Wood set, the world flows that want the terrain worker and the jar).
- **SQ8** The jar's names: the size of `en_us.json` in the cache, the cheapest way to hand the block, item, mob, biome, effect, enchantment and sound subtitle names to the renderer (a new IPC over the existing cache; no cache schema change expected, verify), the time to index them, and what search shows with no jar.
- **SQ9** Ctrl/Cmd+K: what happens to the key inside a Monaco editor (the chord prefix), a text input and the function editor, and how the menu accelerator and `shortcutFor` pair up (`createCommandDeduper`). The exact binding for B667.
- **SQ10** The guide: packaging with `extraResources` and reading from source in dev; the index size for 474 sections; what `Markdown.tsx` must learn for the guide's pages (tables, numbered lists, nested lists, links between pages and to headings).
- **SQ11** Size: the renderer and `app.asar` deltas of a throwaway build with the engine, an empty panel, the worker chunk and 2,000 vocabulary lines. **The budgets of "Size", confirmed or changed.**
- **SQ12** Behaviours: for 30 clauses taken from the query set ("that glows", "that explodes", "drops xp", "sets mobs on fire", "gives speed", "that you can ride"), whether each maps to flow answers, to one rule, to one companion flow (the Enchantment flow beside a sword, and whether the made sword can carry the enchantment from the start), or to nothing MSM can make; the last group as a gap list for `docs/COVERAGE-AUDIT.md`.
- **SQ13** The sandbox: the sample plugin contributing vocabulary and one entry; the size after structured clone, the checking time, and that a plugin cannot name another plugin's things.
- **SQ14** Starting answers: the smallest change that lets `CreatorDialog` open a new set of a flow with given answers (not the `edit` route), and that `planCreate` can make a flow with given answers plus one rule book as one undo step from outside Surprise me.
- **SQ15** Accessibility: the accessibility tree Playwright sees for a combobox with a grouped listbox and a live region in Electron; what cannot be checked in a cloud session (a real screen reader on Windows) becomes a line for the user's own check.
- **SQ16** Order effects: which expectations depend on work that has not landed (the Skyblock flow of the game modes plan's B557, Play on sounds of Live views 3, the Creator's Live tab of B615), written into the query set as conditions.

## Limits (SL1 to SL17)

| # | Limit | Why | What users see | Mitigation |
|---|---|---|---|---|
| SL1 | **It matches words, it does not think.** A wording the vocabulary does not know may miss. | ADR 0124 D1: offline and repeatable | The chips say what was understood; unknown words are struck through | The vocabulary grows with every brief (D15); the AI row for free wording |
| SL2 | English only, British and American. | The app's text is English | Other languages find little | An idea for later |
| SL3 | One "that…" clause, and at most one rule or one companion flow from it. | Keeps the result explainable | "I could only use the first part" on the chips | The Rule book; the AI helper |
| SL4 | A rule made by search needs the Fabric mod jar, as every rule does. | Rules run in the runtime (R8) | The existing note on vanilla pack exports | None needed |
| SL5 | Minecraft's own names and pictures need the Minecraft folder set up. | Never bundle Mojang assets | Without it: names made from ids, a plain icon, the set-up line | Set up once in Settings |
| SL6 | It cannot make what MSM cannot make. "Make a pig fly" gives a new flying mob named Flying Pig, not Minecraft's pig with wings; a behaviour with no flow answer, rule step or companion flow behind it is not made. | Search opens doors, it does not add features | A line on the result: "Minecraft's own pig stays as it is"; a struck-through chip | Gaps go to `docs/COVERAGE-AUDIT.md` and the plan that owns the area; the Wishlist |
| SL7 | Answers come only from typed words; a number with nothing beside it is not used. | Never invent (D7) | Defaults for everything else, visible in the preview | **Change it first** |
| SL8 | Only the selected result is drawn live, and some flows take longer than 250 ms (the Wood set, worlds). | One preview at a time; SQ7 | A plain tile first, then the picture | The fidelity lines of the Creator's preview apply |
| SL9 | Things of later plans are found when they land (the Skyblock flow, Play on a sound result, the Creator's Live tab). | Order | The closest thing that exists | The findable rule |
| SL10 | A third-party plugin's words point only at its own things and carry its name. | ADR 0124 D13 | The plugin's name on the row | None needed |
| SL11 | The history is on this computer only and can be switched off. Nothing is sent. | ADR 0124 D11 | **Remember my searches**, **Clear** | None needed |
| SL12 | The guide inside the app is text; links to the web open the browser. | The guide has no pictures; the app has no network | As said | None needed |
| SL13 | Typos: one wrong letter in words of four to seven letters, two in longer ones; words of three letters or fewer must be exact; a misspelling that is itself a word is not corrected ("bow", "box"). | Fewer false matches | "Showing results for…" when corrected | The vocabulary's slang lists |
| SL14 | The mod is searched by names, ids, kinds, display names and rule sentences, not by every value inside every file, and not inside the text of functions and scripts. | Index size and noise | A thing is found by what it is called | An idea for later: find in files |
| SL15 | On a very large mod the first search after opening may take longer than the budget. | The project layer is built once | A short "Looking…" | Deltas afterwards |
| SL16 | Settings and commands have no live picture. | Nothing to see | One sentence on what they do | Listed as exempt in `docs/LIVE-VIEW-AUDIT.md` |
| SL17 | Inside the code editors Ctrl+K may belong to the editor. | Monaco's chords (SQ9) | The toolbar field, or Escape first | Decided by B667 from SQ9 |

## Rules for every brief

The rules of `docs/HANDOFF.md` "Rules for every brief" apply unchanged (clean room, no new dependency, git worktrees in the scratchpad with the given identity and no `git config`, commit messages ending ` [skip ci]` with no credit lines, disk limits, stubs first, one owner per shared file per wave, notes for the plan, exit criteria, the live view line, plain words, models), with these names and additions:

- **Stubs first.** B652 makes every shared registration point: the package `packages/search` with its frozen interfaces, its `pnpm-lock.yaml` and `tools/check-deps/layers.json` lines, the app folder `app/src/renderer/src/search/` with one file per later brief, one empty `src/search.ts` in each built-in plugin with its line in the plugin's `src/index.ts`, the skipped e2e specs and the query set file. No later brief edits `pnpm-lock.yaml`, `layers.json` or a plugin's `src/index.ts`.
- **Plugin API.** Only B651 edits `packages/plugin-api/src/` (plugin API 1.23.0, numbered by the main session if the game modes plan's B550 has not landed).
- **IPC.** One brief per wave owns `app/src/shared/` and `app/src/preload/`: B656 in wave 2, B667 in wave 5. Never in the same wave as the game modes plan's B554 or B556 or the live views plan's B603.
- **`App.tsx` has one owner in this plan: B667.** Every other app brief exports functions and components that B667 wires.
- **Vocabulary is data in the plugins.** No Minecraft word in `@msm/search` or in the app's collectors; no version literal anywhere outside `packages/targets` (`tools/check-deps` checks `26.<n>`); a vocabulary line naming a vanilla id is tested against both targets.
- **No Mojang text in the repository.** The jar's names are read at run time from the user's cache. Tests use a small made-up names file; a golden query that needs a real name says the name is made from the id.
- **The fixed query set is written by hand.** `app/test/search/golden-queries.json` is never regenerated by `UPDATE_GOLDENS`; changing an expectation needs a `reason` in the entry and a line in the brief's report. Only B666 and B673 tune weights.
- **Nothing leaves the computer.** No brief adds a network call; the AI row hands text to the existing helper and sends nothing itself.
- **Live view.** Every brief that shows a result names how it is drawn before it is made, or the exempt line for `docs/LIVE-VIEW-AUDIT.md`.
- **Exit criteria** always include `pnpm lint`, `pnpm typecheck`, `node tools/check-deps/index.ts` and the touched packages' tests; app briefs also `pnpm build` and `node tools/check-size/index.ts`, reporting `app.asar`, the renderer and the new chunks.
- **Models.** Opus (`claude-opus-5-5`) at medium effort; B650 and B658 at high effort; Sonnet (`claude-sonnet-5-5`) for B652 and the guide half of B672.

## Overlaps with other work

- **Live views 2 (B600–B618, running).** B603 owns the jar reading and `app/src/shared/` in its wave 1; B608 the frame; B615 `CreatorPreview.tsx` and the AI review; B617 the AI helper's words. This plan's B656 (shared, preload, main) and B669 (`packages/ai`) run after B603 and B617 have merged. B665 reads `CreatorPreview` without changing it; if it needs a new prop it stops and reports. Search shows the Creator's Live tab and the `live_view` registry's views for free once they exist.
- **The game modes plan (B547–B564).** B550 edits `packages/plugin-api/src/` first (1.22.0); B651 follows it. B554 (its wave 2) and B556 (wave 3) own `app/src/shared/` and the preload; B557 (wave 4) edits the library's starter index, `tiles.ts` and `showcases.ts`; B561 (wave 6) the AI helper's words. Its briefs that add flows, kinds, Studios and Rules lines after this plan's wave 2 add their search words and query set lines themselves (ADR 0124 D15); if they land first, B666 adds them.
- **Live views 3 and 4.** B622's sound player gives sound results a **Play** button: a follow-up line for B630 or for this plan's close, whichever is later. No shared files otherwise.
- **Surprise me.** B657 moves the "make a flow with given answers, and a rule book beside it, as one undo step" part of `surprise/surprise.ts` into a shared module both use; `surprise.test.ts` (200 seeds per target) must stay green.
- **ADR numbers:** 0124. **Brief ids:** B650–B676. **Versions:** plugin API 1.23.0; no Script API change; no cache schema change expected (SQ8).

## Waves

At most five executors at once; no file in two briefs of one wave. No engine-mod executor in this plan, so both engine-mod slots stay free for the plans beside it.

| Wave | Briefs (parallel) | Depends on |
|---|---|---|
| 0 | B650 spike | nothing (may run beside Live views 2) |
| 1 | B651 plugin API 1.23.0; then B652 scaffold and stubs | B650 reported; the game modes plan's B550 merged, or the main session's word on the number |
| 2 | B653 engine: text; B654 words: the library; B655 words: the content plugins and Rules; B656 main and IPC: jar names and the guide; B657 the Creator: starting answers and make at once | B652; B656 after the live views plan's B603 |
| 3 | B658 engine: index and ranking; B659 engine: answers and behaviours; B660 app: sources, worker and client; B661 the guide reader; B662 settings lines and command words | wave 2 |
| 4 | B663 the panel; B664 actions; B665 the live preview pane; B666 the fixed query set and tuning | wave 3 |
| 5 | B667 the doors; B668 one matcher everywhere; B669 the AI helper; B670 third-party plugins | wave 4; B669 after the live views plan's B617 |
| 6 | B671 e2e; B672 AI words, guide, changelog | wave 5 |
| 7 | B673 close | all |
| reserve | B674 a sound-alike key for typos (only if SQ3 says so); B675 a faster or split index build (only if SQ1 misses its budget); B676 the engine on the main thread, no worker (only if SQ2 says the worker costs more than it saves) | B650 |

## Order, and the other plans

**Recommended:** Live views 2 first, as now (with the game modes plan's waves 0 and 1 beside it); then **this plan**, its app waves beside the game modes plan's waves 2 and 3; then the rest of the game modes plan; then Live views 3; then Live views 4.

- **Why after Live views 2.** The search's live preview is the Creator's preview; B615 gives that preview its Live tab for mobs, vehicles, particles, liquids and merchants, and B601 and B608 give the registry that draws a thing of the mod. Built before them, the preview pane would show less and be reworked. B603 and this plan's B656 both edit the jar reading and the IPC contract.
- **What may start earlier.** B650 touches no shared file and may run beside Live views 2's waves 2 to 5. Waves 1 and 2 touch only the new package, the plugins' new `search.ts` files, `packages/plugin-api/src/` (after B550) and, in B656 and B657, files Live views 2 leaves alone after its wave 1 (B656 waits for B603). They may run beside Live views 2's last waves if executors are free.
- **Why before the game modes plan's flows.** That plan's wave 4 (B557) adds the Skyblock, one-block, sky island, lucky block, adventure map and minigame flows. If search is in place, each arrives findable, with its words and its queries written by the brief that knows it. The game modes plan's waves 2 and 3 are plugin, runtime and Studio work in files this plan does not own; the shared ones (`app/src/shared/`, the preload, `App.tsx`) get one owner per wave across the two plans, set by the main session when the waves go out.
- **Why before Live views 3 and 4.** They add views, not things to find; they lose nothing by waiting, and search gains their views when they land.
- **If one plan at a time is wanted:** Live views 2, this plan, the game modes plan, Live views 3, Live views 4. This plan is the shortest of them (24 briefs, no runtime work, no in-game check).
- **If the user wants the game modes plan whole and first:** this plan follows it unchanged, and B654, B655 and B666 write the games kinds' words and queries.

## Briefs

### B650 Spike: the corpus, matching, the first 80 queries, sizes (wave 0; Opus, high effort; one session; no engine-mod)

- **Owner files:** throwaway code in the executor's worktree only (a scratch package and scratch Vitest files, deleted before the report); evidence into `docs/reference/spikes/b650/` (new: `README.md` with the answers, `queries-draft.json` with the 80 queries, `results/` with the numbers, `spike-src/` with the throwaway matcher). The README line in `docs/reference/spikes/README.md` is the main session's. Nothing under `packages/` or `app/src` is kept.
- **Scope:** SQ1–SQ16. A throwaway matcher and index good enough to measure; the real corpus collected from the built-in plugin registry for both targets; three typo methods compared; the stemmer's collisions; the 80 queries with reachable expectations and today's matchers as the baseline; answers from words over the 62 flows; preview times per flow; the jar's names route; the Ctrl/Cmd+K behaviour; the guide's packaging and what the Markdown renderer lacks; a throwaway build for sizes; 30 behaviour clauses sorted into answers, one rule, or a gap; the sample plugin through the sandbox; the smallest `CreatorDialog` change; the accessibility tree.
- **Exit criteria:** a report answering SQ1–SQ16 per target with numbers; measured values in place of every draft budget and bar of ADR 0124 D3 and D16 and of "Size"; go or no-go for the worker (D3), the typo method (D4), the palette door (D10) and the guide packaging (D14); the frozen interface for B651 and B652 (the block above, corrected); the gap list for `docs/COVERAGE-AUDIT.md`; the spike code deleted from `packages/` and `app/`; `pnpm lint` and `pnpm typecheck` green.

### B651 Plugin API 1.23.0: search data (wave 1; Opus)

- **Owner files:** `packages/plugin-api/src/search.ts` (new), `contributions.ts`, `library.ts`, `index.ts`, `version.ts`, the package's tests (`test/library.test.ts`, `types.test.ts`, `define-plugin.test.ts`). The guide's plugin page is B672's and the scoped `CLAUDE.md` line is the close's.
- **Scope:** `SearchVocabulary`, `SearchWordGroup`, `SearchColour`, `SearchBehaviour`, `SearchEntryContribution`; `PluginContributions.searchVocabulary`, `searchBehaviours`, `searchEntries`; `keywords?` on `ElementTemplate`, `ProjectStarter` and `ElementKind`; `search?` on `StarterParameterBase` and `words?` on choices; "Since 1.23.0" on each; limits as exported constants (entries, lines and string lengths per plugin); a pure `validateSearchContributions` the host and the sandbox both call. No internal dependency (the golden rule).
- **Exit criteria:** lint, typecheck, the package's tests; built-in plugins still declare `^1.0.0` and build; the sample plugin builds unchanged; `tools/check-deps` green.

### B652 Scaffold and stubs (wave 1; Sonnet; after B651)

- **Owner files:** new `packages/search/` (`package.json` for `@msm/search`, `tsconfig.json`, `vitest.config.ts`, `src/index.ts` exporting the frozen interfaces with "not yet" bodies, empty `src/text/`, `src/index/`, `src/rank/`, `src/slots/`, `src/compose/` modules, a smoke test, `CLAUDE.md` of at most 55 lines); `pnpm-lock.yaml`; `tools/check-deps/layers.json` (`"@msm/search": ["@msm/plugin-api"]`); the Turbo pipeline file if a package needs a line; `app/package.json` (the workspace dependency); `app/src/renderer/src/search/` stubs: `worker.ts`, `client.ts`, `host.ts`, `sources/index.ts` and one empty file per source (`flows.ts`, `templates.ts`, `examples.ts`, `kinds.ts`, `project.ts`, `vanilla.ts`, `rules.ts`, `settings.ts`, `commands.ts`, `guide.ts`, `problems.ts`), `plugin-data.ts`, `vanilla-names.ts`, `actions.ts`, `run-action.ts`, `ask-ai.ts`, `history.ts`, `SearchPanel.tsx`, `SearchField.tsx`, `ResultPreview.tsx`, and `components/settings-catalogue.ts` (an empty list); an empty `src/search.ts` (exporting empty vocabulary, behaviours and entries) and its line in `src/index.ts` in each built-in plugin (`resourcepack`, `datapack`, `structures`, `worldgen`, `blocks-items`, `models-anim`, `entities`, `scripting`, `rules`, `controls`, `library`, and `games` if it exists by then); `app/test/search/golden-queries.json` (the spike's 80) and a skipped `golden.test.ts`; skipped `app/e2e/search-path.spec.ts` and `search-keyboard-path.spec.ts`; the line for Search under the surfaces of `docs/LIVE-VIEW-AUDIT.md`.
- **Scope:** wiring only, with B650's renames.
- **Exit criteria:** lint, typecheck, tests, `pnpm build`, `tools/check-deps` green (the new package imports only `@msm/plugin-api`); `tools/check-size` reported.

### B653 Engine: text (wave 2; Opus)

- **Owner files:** `packages/search/src/text/` (`normalise.ts`, `tokens.ts`, `spelling.ts`, `stem.ts`, `stop-words.ts`, `intent.ts`, `numbers.ts`, `typos.ts`, `phrases.ts`) and their tests.
- **Scope:** ADR 0124 D4: normalising and splitting (ids kept whole as well as split), the British and American folding rules with the exception list, the light stemmer with a protected-word set handed in, stop words, the intent reader, number words and units (hearts, seconds, ticks, blocks, per cent), joined and split words, the typo candidate method B650 chose with its edit limits by word length and prefix matching for the last word, and the phrase matcher over a vocabulary handed in. Pure and deterministic; no Minecraft word in the code.
- **Exit criteria:** unit tests per module; the spike's 300 misspellings at B650's recall and false-match bars; the stemmer's collision list empty against a dictionary fixture; a property test that folding is idempotent; lint, typecheck.

### B654 Words: the library (wave 2; Opus)

- **Owner files:** `packages/plugins/library/src/search.ts`, new files under `packages/plugins/library/src/search/` (`colours.ts`, `materials.ts`, `things.ts`, `behaviours.ts`, `entries.ts`), `keywords` and question `search` hints in `packages/plugins/library/src/starters/*.ts` and `src/examples/*.ts` (tags), the library's tests, `examples/` goldens if a starter's description changes (it should not).
- **Scope:** the vocabulary of the 74 starters and 200 examples: word groups for every thing a flow makes (sword: blade, katana; mob: creature, monster, animal), slang and short forms, colour names with their colours (the sixteen dye names, gem and metal names, British and American spellings), materials and tiers, `role` hints for name, main colour and main number questions, extra words on choices where the label is not what people type, the clashes B650 listed; the behaviour phrases that are flow answers or a companion flow; extra entries for things known by another name (as "Skyblock" once that starter exists). A test checks every vanilla id named in the data against both targets' registries and every hinted question and value against its starter.
- **Live view:** none added; the entries reuse the flows' previews.
- **Exit criteria:** the library's tests (2,211 and the new ones) green on both targets; `UPDATE_GOLDENS=1` shows no change in `examples/`; lint, typecheck, `tools/check-deps` (the plugin imports only `@msm/plugin-api` and `@msm/schemas`).

### B655 Words: the content plugins and Rules (wave 2; Opus)

- **Owner files:** `src/search.ts` of `packages/plugins/resourcepack`, `datapack`, `structures`, `worldgen`, `blocks-items`, `models-anim`, `entities`, `scripting`, `rules`, `controls` (and `games` if it exists), `keywords` on their kinds and templates (the kinds' and templates' own files), their tests.
- **Scope:** plain words for each of the 118 kinds and the 297 templates where the title does not carry them (loot table: drops, loot; advancement: achievement, goal; `msm:hud`: screen, overlay); the Rules plugin's words for triggers, steps and conditions and its behaviour phrases as one rule each (subject `$thing`, by `appliesTo`), every one compiled by the plugin's own compiler in a test; controls' words for keys and the HUD. Vanilla ids named in the data are tested against both targets.
- **Exit criteria:** each touched plugin's tests green; every behaviour rule validates against `rules.mcdoc` and compiles; lint, typecheck, `tools/check-deps`.

### B656 Main and IPC: the jar's names and the guide (wave 2; Opus; after the live views plan's B603)

- **Owner files:** `app/src/main/platform/minecraft.ts` (or a new `vanilla-names.ts` beside it), new `app/src/main/guide.ts`, `app/src/main/ipc.ts`, `app/src/shared/ipc-channels.ts`, `ipc-contract.ts`, `platform.ts`, `app/src/preload/`, `app/electron-builder.yml` (`extraResources`: `docs/guide` to `guide`), `app/test/main/` tests, `app/test/ipc-contract.test.ts`.
- **Scope:** `minecraft:names` (`{ targetId }` to the names of blocks, items, entity types, biomes, effects, enchantments and sound subtitles from the cached `en_us.json`, keyed by id; `null` without the cache; size-limited and every value checked); `guide:index` (page, heading, anchor, first sentence, built on first call and kept) and `guide:page` (`{ page }` to the Markdown, the name checked against the packaged list, real-path containment); from source the guide is read from `docs/guide/`, packaged from `resources/guide/`.
- **Exit criteria:** main tests for both channels (a made-up names file, a traversal attempt refused); `ipc-contract.test.ts`; `pnpm build`; `dist:dir` shows `resources/guide/` and `tools/check-size` shows `app.asar` unchanged by the guide; lint, typecheck.

### B657 The Creator: starting answers and make at once (wave 2; Opus)

- **Owner files:** `app/src/renderer/src/components/creator/CreatorDialog.tsx`, `creator-model.ts`, new `app/src/renderer/src/changeset/make-flow.ts`, `app/src/renderer/src/surprise/surprise.ts` (to use the shared module), their tests (`creator-scenario.test.ts`, `surprise.test.ts`, the Creator's component tests).
- **Scope:** a `start` prop on `CreatorDialog` (`{ flowId, values, note? }`): the flow opens on a new set with those answers (each checked by `validateParameter`, a bad one dropped), the preview following as for typed answers; `makeFlow(session, project, { flowId, values, rule?, beside? })`: plans with `planCreate`, folds, optionally adds one rule book (`<namespace>:<thing>_rules`, numbered when taken) with the made thing as subject or one companion flow planned against the project as it would be after the first, and returns one changeset for `applyChangeset` (one undo step, labelled "Make <name>"); Surprise me calls the same module. Sets carry `meta.creator` as before.
- **Live view:** the Creator's own preview, unchanged.
- **Exit criteria:** the Creator and Surprise me tests green (200 seeds on both targets); a new scenario test makes a flow with answers and a rule and undoes it to the starting project; lint, typecheck, `pnpm build`, `tools/check-size`.

### B658 Engine: index and ranking (wave 3; Opus, high effort)

- **Owner files:** `packages/search/src/index/` (`entry.ts`, `layer.ts`, `dictionary.ts`, `postings.ts`), `src/rank/` (`bm25f.ts`, `signals.ts`, `weights.ts`, `sections.ts`, `fold.ts`), `src/query.ts`, their tests and a `test/perf.test.ts`.
- **Scope:** ADR 0124 D3 and D6: layers that are built, replaced and patched by deltas; the dictionary with the protected words; fields and their weights; BM25F with the bonuses and penalties; the intent by source table; availability, mode, mod context and history signals handed in as plain data; folding of duplicates; three Best matches and the sections with their counts; the confidence floor; the `why` list; deterministic ties. A request never throws on any string.
- **Exit criteria:** unit tests per signal; the same request twice gives the same answer; the perf test meets B650's budgets on a made-up corpus of 1,400 static entries, 5,400 ids and 5,000 mod things (three times the budget allowed on CI); a fuzz test of 10,000 random strings; lint, typecheck.

### B659 Engine: answers and behaviours (wave 3; Opus)

- **Owner files:** `packages/search/src/slots/` (`colour.ts`, `choice.ts`, `number.ts`, `boolean.ts`, `name.ts`, `things.ts`, `assign.ts`), `src/compose/` (`clause.ts`, `behaviour.ts`), `src/understood.ts`, their tests.
- **Scope:** ADR 0124 D7 and D8: the head and clause split; answers by question type with the clash rules B650 found; the name from quoted text, "called", or the describing words and noun (within the question's pattern and length); vanilla and project things named in the words; a validator handed in by the host so every answer passes the wizard's check; behaviours matched by phrase and `appliesTo` (flow answers, one rule or one companion flow); words absorbed into answers counted as matched for the ranker; the `Understood` value (understood, corrected, not placed).
- **Exit criteria:** a table test over B650's answer cases for the 62 flows' question shapes (as fixtures, no plugin import); no answer without a typed word behind it (a property test); lint, typecheck.

### B660 App: sources, the worker and the client (wave 3; Opus)

- **Owner files:** `app/src/renderer/src/search/sources/*.ts`, `plugin-data.ts`, `vanilla-names.ts`, `worker.ts`, `client.ts`, `host.ts`, `history.ts`, `app/src/renderer/src/store/preferences.ts` (the history and **Remember my searches**), tests under `app/test/search/` (not `golden.test.ts`). `plugins/built-in.ts`, `plugins/external-plugins.ts` and `session/project-session.ts` are read, not changed.
- **Scope:** `plugin-data.ts` gathers the registered plugins' search vocabulary, behaviours, entries, keywords and hints from the plugin list itself, so the static layer exists with no mod open (the default target then); `vanilla-names.ts` is a cached read of `minecraft:names` for the search and, later, the ThingPicker; one pure collector per source from the plugin list, the session and the app's lists to `SearchEntry[]`, with availability from `supports(target)` and registered kinds, the `technical` mark for Very easy, Home's tiles and Showcase cards folded into their flows, rule sentences from the mod's rule books, the vanilla layer from the target's registries named by `minecraft:names` (else words from the id), guide sections from `guide:index`, Things to fix from the session's problems through `PLAIN_PROBLEMS`; the worker protocol (build, patch, query, cancel), the client (newest wins, a main-thread host when no worker starts), project deltas 300 ms after an edit; the local history.
- **Live view:** none drawn here; each entry carries its preview descriptor.
- **Exit criteria:** a test that every flow, starter, template, example, kind, command, trigger and step of the built-in registry yields exactly one entry per target; that the plugins' keywords and vocabulary reach the entries they name; that the static layer builds with no mod open; that a project edit reaches a query within the debounce; lint, typecheck, `pnpm build`, `tools/check-size`.

### B661 The guide reader (wave 3; Opus)

- **Owner files:** `app/src/renderer/src/components/Markdown.tsx`, new `components/GuideDialog.tsx`, their tests (`test/components/`).
- **Scope:** `Markdown.tsx` learns what SQ10 listed (tables, numbered and nested lists, links to headings and between guide pages as in-app navigation; still no raw HTML, `https:` links still open outside); `GuideDialog`: a page from `guide:page`, opened at a heading, with a contents list, Back, and **Open on the web**; labelled, keyboard reachable, readable at 200 % zoom.
- **Exit criteria:** every one of the 38 pages renders without a dropped block (a test reads `docs/guide/` from source); What's New and the release notes render as before; lint, typecheck, `pnpm build`, `tools/check-size`.

### B662 Settings lines and command words (wave 3; Opus)

- **Owner files:** `app/src/renderer/src/components/SettingsDialog.tsx` and its section components (`ai/AiSettingsSection.tsx`, `ai-pictures/AiPicturesSettingsSection.tsx`, `WorldBackupsSection.tsx`), new `components/settings-catalogue.ts`, `commands/built-in-commands.ts`, their tests.
- **Scope:** a catalogue of every setting (id, label, one sentence, extra words, section) checked by a test against the dialog's controls; `SettingsDialog` opens at a setting (`focusSetting`), scrolls to it and marks it for a moment (no motion under reduced motion); one sentence and extra words for each of the 51 built-in commands (the palette shows titles as before).
- **Live view:** exempt (limit SL16).
- **Exit criteria:** the catalogue test; the dialog's tests; lint, typecheck, `pnpm build`.

### B663 The panel (wave 4; Opus)

- **Owner files:** `app/src/renderer/src/search/SearchPanel.tsx`, `SearchField.tsx`, new `ResultRow.tsx`, `UnderstoodChips.tsx`, `ScopeChips.tsx`, `wording.ts`, tests under `app/test/components/search/`.
- **Scope:** ADR 0124 D6, D8, D10 and D11: the field, the chips of what was understood (removable; removing one asks again), scopes as chips and, in Advanced, prefixes; Best matches and sections with **Show more**; rows with a source picture and word; the wording per mode from `wording.ts` (Very easy: no ids, the sentences of "Very easy wording"); the empty state with three example searches taken from the query set; "Closest things" and "Nothing close" with the Wishlist offer; the combobox and grouped listbox roles, `aria-activedescendant`, the live region, every key of D11; the layout at 800 px and 200 % zoom. It calls `props.onAction(hit, which)` and renders `props.preview(hit)`; it wires nothing itself.
- **Exit criteria:** component tests for keys, roles, the live region's text, the modes' wording (no id or kind word in Very easy, by a test over the whole query set's results), reduced motion; lint, typecheck, `pnpm build`, `tools/check-size`.

### B664 Actions (wave 4; Opus)

- **Owner files:** `app/src/renderer/src/search/actions.ts`, `run-action.ts`, new `vanilla-uses.ts`, `app/src/renderer/src/studios/rules/add-rule.ts` (new: a rule added to a book from outside the Studio), tests under `app/test/search/`.
- **Scope:** ADR 0124 D9's table: each action descriptor turned into work through a host interface (`SearchActionHost`: open the Creator with a start, make a flow at once through `makeFlow`, add a bundle, add an element from a template with a name, open an element, open Settings at a line, run a command, open the guide at a heading, fix a problem, add to the Wishlist); **Make something with it** for a vanilla id (the flows whose questions take that sort of thing, already answered); **Add this rule** (the mod's rule book or a new one, a new rule starting with the trigger or holding the step, the subject asked for when the trigger needs one); with no mod open, the mod's name is asked first as the Showcase does. Everything that writes is one undo step with a label.
- **Live view:** nothing is written before the action; each making action names the preview B665 draws for it.
- **Exit criteria:** a test per action against a session fixture, each followed by Undo back to the starting project; a flow with a behaviour made and undone; lint, typecheck.

### B665 The live preview pane (wave 4; Opus)

- **Owner files:** `app/src/renderer/src/search/ResultPreview.tsx`, new `preview-bundle.ts`, tests under `app/test/components/search/`.
- **Scope:** ADR 0124 D9: for the selected hit only, 150 ms after it or the words change: a flow, starter, example or template built in memory with the understood answers and drawn by `CreatorPreview` over `bundlePreviewProject` (read, not changed), with the line "Makes …" as Surprise me words it; a Showcase-backed hit's still with a play button (one live clip, the setting and reduced motion respected); a thing of the mod through the preview panel's route for its kind; a vanilla id's picture through `ThingPictures`; a rule as a read-only rule card; a guide section's first paragraph; a setting's or command's sentence. An older build is dropped when the selection moves; a failed build shows the plain tile and a line.
- **Live view:** this is the live view of search; first picture within 250 ms for the flows SQ7 found inside it, a plain tile first for the others (limit SL8).
- **Exit criteria:** component tests with a fake clock for the debounce, the cancel and each preview type; no WebGL falls back as the Creator does; lint, typecheck, `pnpm build`, `tools/check-size`.

### B666 The fixed query set and tuning (wave 4; Opus)

- **Owner files:** `app/test/search/golden-queries.json`, `golden.test.ts`, `misspellings.test.ts`, `packages/search/src/rank/weights.ts`, and additions to the plugins' `src/search.ts` and `src/search/*.ts` data (no other wave 4 brief touches them).
- **Scope:** the set grown to at least 200 queries across the classes of ADR 0124 D16, each with its class, mode, expected first or top three, expected answers, an optional `needs` condition (SQ16) and, when changed later, a `reason`; the runner over the real built-in registry on both targets, with and without the made-up names file, on an empty mod and on `fixtures/sample-mod`; the report per class and per target (first, top three, mean reciprocal rank); the seeded misspelling test over every flow title; the availability rule between targets; weights and vocabulary tuned until the bars of B650 are met, with the before and after numbers in the report.
- **Exit criteria:** the bars met per class and per target; the nonsense class finds no Best match; determinism (two runs, the same order); lint, typecheck.

### B667 The doors (wave 5; Opus)

- **Owner files:** `app/src/renderer/src/App.tsx`, `components/Toolbar.tsx`, `components/home/Home.tsx`, `components/EditorArea.tsx`, `shortcuts.ts`, `components/CommandPalette.tsx`, `app/src/main/menu.ts`, `app/src/shared/` (`MENU_COMMANDS`), `app/src/preload/` if the menu command needs it, their tests.
- **Scope:** ADR 0124 D10: the large bar on Very easy's Home (with and without a mod) and on the empty editor area and no-mod screen of Easy and Advanced; the toolbar field in every mode; Ctrl/Cmd+K as SQ9 decided, Edit > **Search…**, the palette command "Search everything"; the palette door: Ctrl/Cmd+Shift+P opens the same engine with the commands scope, keeping the test ids `command-palette`, `command-palette-input` and `command-<id>` and the order of an empty query; `CommandPalette` kept for quick picks; the host side of `SearchActionHost`, the preview and `ask-ai.ts` wired; the client started after first paint; focus returned to where it was on close.
- **Exit criteria:** the app's tests green (2,919 and the new ones); the existing e2e specs that use the palette green unchanged (run the full e2e once); lint, typecheck, `pnpm build`, `tools/check-size` under the stop lines.

### B668 One matcher everywhere (wave 5; Opus)

- **Owner files:** `app/src/renderer/src/components/ElementSidebar.tsx`, `NewElementDialog.tsx`, `ExamplesDialog.tsx`, `components/thing-picker/thing-sources.ts`, `ThingPicker.tsx`, their tests.
- **Scope:** `matchesSearch`, `templateMatches`, `exampleMatches` and `filterThings` call `@msm/search`'s text matching (spellings, stems, synonyms, one or two wrong letters) on the main thread over their own lists, keeping what an exact match shows today first; the ThingPicker shows Minecraft's own names when the jar is set up and matches on them, reading them through `search/vanilla-names.ts` (B660's module), not through a new prop from `App.tsx`. Looks, places and test ids unchanged.
- **Exit criteria:** each surface's tests, with new cases for a misspelling and for "armor" against "armour"; nothing that matched before is lost (a test over the old matchers' cases); lint, typecheck, `pnpm build`.

### B669 The AI helper (wave 5; Opus; after the live views plan's B617)

- **Owner files:** `packages/ai/src/tools/read.ts`, `catalogue.ts`, `system-prompt.ts`, the package's tests; `app/src/renderer/src/ai/tool-executor.ts`, `ai/context-blocks.ts`, `components/ai/ai-controller.ts`, `app/src/renderer/src/search/ask-ai.ts`, their tests (`ai-tool-executor.test.ts`, the scenario tests).
- **Scope:** ADR 0124 D12: the read-only tool `search_library { query, limit }` over the static layer and vanilla ids (library ids, titles, questions with their defaults; ids only for vanilla, never a name from the jar; bounded and paged as the other read tools); the prompt tells the helper to search before listing; `askAi(query, hits)` opens the helper in Build mode, or New project with the AI helper with no mod, with the words as the message and a hints block of at most five lines (library ids and understood answers), not sent until the user presses Send; with no key the function says so and the panel shows the one quiet line.
- **Exit criteria:** the tool's schema and executor tests; a scripted scenario in which the helper calls `search_library` and then `add_starter` with values; a test that the hints block holds no project content and no jar name; lint, typecheck.

### B670 Third-party plugins (wave 5; Opus)

- **Owner files:** `app/src/renderer/src/plugins/sandbox/protocol.ts`, `host.ts`, `worker-bootstrap.ts`, `plugins/external-plugins.ts`, `components/SettingsDialog.tsx` (the `PluginsSection` only), `fixtures/sample-plugin/` (a vocabulary group and one entry), `tools/new-plugin/` (the external template's commented example), their tests.
- **Scope:** ADR 0124 D13: search contributions cross the sandbox as data, checked by `validateSearchContributions` with the size limits; an entry may open only the plugin's own things; a plugin cannot add stop or intent words; results carry the plugin's name; a plugin whose search data fails the check loads without it and says so in Settings > Plugins.
- **Exit criteria:** the sandbox tests, with a plugin that names another plugin's starter refused; the sample plugin found by its words; the Windows plugin build in CI unaffected (`tools/new-plugin --external`); lint, typecheck.

### B671 e2e (wave 6; Opus)

- **Owner files:** `app/e2e/search-path.spec.ts`, `search-keyboard-path.spec.ts`, e2e helpers if needed.
- **Scope:** `search-path`: in Very easy with no mod, the bar on Home, "a blue sword" (with a misspelling), the chips, the preview drawn (a canvas or the drawn picture, read back), **Make this** asking for the mod's name, the Creator open with Sword and blue, Create, the thing on My things, Undo; "custom ore that drops xp" with **Add to my mod**, the ore and its rule book in the mod, one Undo removing both; "how do I add a recipe" and **Show me how** opening the guide at the heading; a setting opened at its line; in Advanced, Ctrl/Cmd+K, `>` and a command run, `@` and a thing opened; the palette's own key still running a command; on the 26.4 target, a flow that target cannot make shown last with its reason. `search-keyboard-path`: the whole first path with the keyboard only, focus back where it was, the accessibility tree's roles and the live region's words; reduced motion showing no clip.
- **Exit criteria:** both specs green three times in a row under `xvfb-run -a`; the full e2e run green; no network request during the specs (asserted).

### B672 AI helper words, guide and changelog (wave 6; Opus for the AI part, Sonnet for the guide)

- **Owner files:** `docs/guide/search.md` (new), `docs/guide/README.md`, `very-easy.md`, `getting-started.md`, `templates-and-examples.md`, `ai-helper.md`, `plugins.md` (the search data of a plugin), `docs/site/.vitepress/config.ts` (the sidebar), `CHANGELOG.md` `[Unreleased]`, the plugin API docs comments if a label changed.
- **Scope:** the guide page (what it finds, the chips, the buttons, the scopes, what it does not do: limits SL1–SL17 in plain words, privacy), the lines on the other pages, the changelog. Labels match the code (the plan's "Very easy wording" as built).
- **Exit criteria:** the guide's labels checked against the code by grep; the site builds; `test/components/WhatsNew.test.tsx` green; the new page is found by search itself (a query set line).

### B673 Close (wave 7; main session)

- ADR 0124 accepted with findings (the measured budgets and bars, the fact table with a "Since" column, the limits with their outcome, the spike's answers in short, the vetoable defaults); DESIGN section 8 (search, the palette door, the guide reader) and section 7 (the search contributions); ROADMAP ticked with a Milestone Log row; the findable rule added to `docs/HANDOFF.md` "Rules for every brief" and to the root `CLAUDE.md` golden rules if the user agrees; `docs/LIVE-VIEW-AUDIT.md` and `docs/COVERAGE-AUDIT.md` (the gap list); the scoped `CLAUDE.md` status lines; the clean-worktree run; this plan deleted.

### Reserves

- **B674 A sound-alike key for typos** (only if SQ3 shows recall under its bar without one): `packages/search/src/text/typos.ts` and its tests.
- **B675 A faster or split index build** (only if SQ1 misses the build budget): the vanilla layer built in slices, or the static layer prepared at build time as data.
- **B676 The engine on the main thread** (only if SQ2 shows the worker costs more than it saves): `client.ts` calls `host.ts` directly; the worker file is removed.

## Very easy wording

- The bar: "What do you want to make?"; in the toolbar: "Search or make anything"; examples under an empty bar: "Try: a blue sword · a flying pig · skyblock".
- Headings: "Best match", "Closest things", "Things you can make", "In your mod", "From Minecraft", "How to", "Settings and commands", "Things to fix", "More".
- Chips: "I understood:", "Showing results for creeper", "Not understood: …".
- Buttons: "Make this", "Change it first", "Add to my mod", "Start a mod with this", "Open", "Make something with it", "Add this rule", "Show me how", "Fix it", "Show me", "Show more", "Ask the AI helper".
- Lines: "Makes Blue Sword." "Adds it to your mod straight away. Undo takes it back." "Minecraft's own pig stays as it is. This makes a new mob." "Not on this Minecraft version." "Nothing close to that yet. Try other words, or add it to your Wishlist." "Set up your Minecraft folder to see Minecraft's own names and pictures." "Nothing you type here leaves your computer."
- Settings: "Remember my searches", "Clear my searches".
- No ids, and none of the words template, element, starter, kind, namespace or JSON in Very easy.

## Notes from implementation

### B650 (spike, 2026-11-22)

Evidence and the full answers: [`docs/reference/spikes/b650/README.md`](reference/spikes/b650/README.md) (results per question in `results/`, the 82 draft queries in `queries-draft.json`, the throwaway engine in `spike-src/`). Both targets gave the same answers unless said.

- **SQ1 corpus:** 1,661 static entries per target (62 flows, 12 other starters, 297 templates, 200 examples, 118 kinds, 51 commands, 144 Rules entries, 251 problems, 27 tiles, 13 cards, 12 settings, 474 guide sections), 1,644 after folding; vanilla 5,420 ids on 26.3 and 5,536 on 26.4 of the shown sorts, 4,291 and 4,382 entries with a block and its item as one; about 4,100 dictionary words, 3,360 index terms. Build in an Electron worker: static 90 to 110 ms, vanilla 49 to 73 ms, 5,000 things 40 to 45 ms, all at once 139 to 177 ms; on the main thread at four times slower 380 to 640 ms. Memory 9.4 MB with a 5,000-thing mod (trigram typo index, typed postings).
- **SQ2 queries:** p95 2.4 to 7.3 ms in the worker with or without vanilla and with 5,000 things, 13 to 24 ms at four times slower; the worker round trip adds about 0.9 ms median and 4 to 5 ms p95 (whole hits cloned: send slim hits). **Worker: go; B676 not needed.**
- **SQ3 typos:** 302 misspellings; trigram overlap, deletion neighbourhoods and a BK-tree find the same candidates: 277 right first (91.7 %), 4 wrong, 21 none with B650's tie rules (first letter, neighbouring key, longer word, then frequency). Trigrams use 0.9 MB against 7.4 MB. **Trigram overlap: go. Sound-alike key: no (7 to 8 rescued, 6 to 8 wrong); B674 not taken;** misspellings beyond the limit become vocabulary lines. Flow titles with one wrong letter: 55 of 59 in the top three (three-letter "Tank", and vehicle flows below the vehicle tile).
- **SQ4 stemmer:** the dictionary-aware stemmer with B650's order (plural -s before -ves, -e form before the bare stem, a bare stem of four letters or more) and an exception list of 18 words leaves 1 harmless merge of 20 known bad ones (rule stemmer: 11, with protected words: 8).
- **SQ5 queries:** 82 in eleven classes. Today's matchers 17 first (20.7 %) and 18 in the top three (22.0 %); the spike as first written 58 and 71; after one tuning pass 72 (87.8 %) and 78 (95.1 %), with and without jar names, both targets. How to is 5 of 8: the guide has no recipes and no data pack section (lines for B672); the New project starter Custom sword outranks the Weapon flow (fold or weigh it, B654/B658).
- **SQ6 answers:** of the 62 flows' questions, from label words alone: names 53 of 55, colours 50 of 82, choices 166 of 215, numbers 108 of 142, yes or no 84 of 88; 156 clashing words in 26 flows, settled by eight rules (from-questions only after "from/of", "like X" only after "like", numbered repeats in order, variants never, shared words by `sameAs`, numbers out of range dropped not clamped, `appliesWhen` for questions that apply to some answers, else declaration order).
- **SQ7 preview:** bundle, plan and overlay under 30 ms for every flow (median about 1 ms; the Tank 27 ms); the first picture was not measured (no GL here): B665 measures it per flow in its e2e.
- **SQ8 jar names:** `en_us.json` 547 and 562 kB; the wanted keys 228 and 231 kB as JSON; read 14 to 22 ms; names every block, item, mob, effect, enchantment and biome, half the potions, no particle and no sound (subtitles are in the asset index, verify); no cache schema change.
- **SQ9 Ctrl/Cmd+K:** Monaco stops Ctrl+K in the capture phase and keeps its chords; elsewhere the bubble listener sees it. Binding: `shortcutFor` returns `search` for Ctrl/Cmd+K; the Edit menu item **Search…** shows `CmdOrCtrl+K` with `registerAccelerator: false`. The menu path could not be observed with synthetic keys: a Windows check line.
- **SQ10 guide:** 791 kB, 474 sections, an index of 105 kB; stage into `app/build/guide` like the runtime jars, `extraResources` to `guide`. `Markdown.tsx` must learn tables (106), numbered lists (184 items), nested lists, `####`, links between pages (491) and to anchors (116). **D14: go.**
- **SQ11 size:** engine and worker 19.4 kB, an empty panel 0.5 kB, the client stub 0.6 kB, 2,000 vocabulary lines 111 kB; renderer and `app.asar` +0.13 MB. **Budgets hold (0.2 and 0.3 MB) only with lazy plugin search data:** the built-in plugins are eagerly imported.
- **SQ12 behaviours:** 34 clauses: 4 flow answers, 6 the flow itself, 16 one rule, 5 a companion flow (the Enchantment flow), 3 gaps. "Sets mobs on fire": no Rules step or Script API member; the Enchantment flow's "Set the target on fire" for swords, which the Weapon flow's sword can take at the table or anvil; not from the start (`minecraft:enchantments` is not in `ComponentPassthrough.DELAYED`). Gaps for `docs/COVERAGE-AUDIT.md`: set on fire (Rules and Script API), an enchantment on a made item from the start, a Frost Walker-like effect, "unbreakable" as a flow answer.
- **SQ13 sandbox:** the existing describe path carries search arrays as data; 200 lines are 23 kB, cloned in 0.8 ms, checked in 0.2 ms; an entry opening another plugin's starter was refused.
- **SQ14:** `CreatorDialog` gains `start?: { flowId, values }` (about eight lines); `rollSurprise`'s build-plan-fold loop moves into `changeset/make-at-once.ts` for both callers.
- **SQ15:** the combobox, grouped listbox, options and polite status read as intended in Playwright's tree; hide the visible group headings from the tree (`aria-hidden`). A Narrator or NVDA check goes to the user.
- **SQ16:** `skyblock` waits for B557; the how-to expectations for recipes and data packs wait for B672's sections; a future "Set on fire" step changes the fire behaviour.
- **Decisions:** D3 go with the budgets unchanged; D4 trigram overlap, no sound-alike, the B650 stemmer; D10 the palette door go; D14 go; D16 85 % and 95 % overall plus floors of 75 % and 85 % per class and 100 % for ids, commands and nonsense; Size go if lazy.
- **For B651 (interface corrections):** `PluginContributions.searchData?(): MaybePromise<PluginSearchData>` (lazy, data only; a `searchData` sandbox method) in place of eager arrays and `keywords`/`search` fields on templates, starters, kinds and questions (or accept about 0.1 MB per 2,000 lines in the first paint); `SearchWordGroup.misspellings`; `SearchBehaviour.flows`; `SearchQuestionHint { role, words, after, never, sameAs, appliesWhen, choiceWords }`; limits: built-in 3,000 lines, 300 behaviours, 300 entries; third-party 500, 50, 50; words 64 characters, sentences 200.
- **For B652 (stubs):** `SearchSource` gains `'tile'` (`sources/tiles.ts`, `showcases.ts`); `SearchHit` across the worker is `{ id, score, answers?, behaviour?, why }`; `packages/search/src/text/typos.ts` (trigram) and `stem.ts` (exceptions); `golden-queries.json` from the 82 draft queries; each plugin's `src/search.ts` exports `SEARCH` and its `index.ts` adds the lazy `searchData` line.
- **D7 to amend:** answers read the corrected and vocabulary words, and a number out of range is dropped and struck through, not clamped.
