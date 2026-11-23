# Search: the fixed query set (B666)

Measured on 2026-11-23 for [ADR 0124](../adr/0124-search-everything.md) D16 and brief B666 of the search plan (deleted at its close B673; [ADR 0124](../adr/0124-search-everything.md) has its findings), over the search as the app builds it: the host (`app/src/renderer/src/search/host.ts`) fed by the sources (`sources/`) from the built-in plugins and the app's lists, the guide layer from `docs/guide` through main's guide service, the vanilla layer of each target from its vendored registries with and without the test's made-up names file, and the project layer of an empty mod or of `fixtures/sample-mod`. Targets mc-26.3 and mc-26.4 (26.4-snapshot-7).

- The set: `app/test/search/golden-queries.json` (240 queries).
- The runner: `app/test/search/golden-runner.ts`, used by `golden.test.ts` (the bars, nonsense, the ids the set names, answers, determinism, availability) and `misspellings.test.ts` (every flow title with one seeded wrong letter).
- Regenerate the per-configuration tables with `GOLDEN_REPORT=<file> pnpm --filter @msm/app exec vitest run test/search/golden.test.ts`.

## Scoring

- **First:** the expected result is the first row the panel shows (Best matches, then each section's rows in order). **Top three:** among the first three. **MRR:** the mean of 1 / its rank among the shown rows (0 when not shown).
- **`same`:** ids that count as the expected result, each a reviewed edit with its reason: a plugin's door that opens the expected flow with a choice made (the door Sword is the Weapon flow with Sword chosen), a door or card that has the flow's own action and so folds into it (the panel shows whichever scored higher), a guide page and its section.
- **Nonsense:** right when there is no Best match.
- **Answers:** the expected answers and behaviour of the expected hit (a door's own values count as read).
- **`needs`:** the query waits on later work (SQ16); it is run and reported, never counted, until the work lands and the line is removed.
- Mine (the open mod's things) runs on the sample mod only; every other class runs on both an empty mod and the sample mod.

## Bars (B650, ADR 0124 D16)

85 % first and 95 % in the top three overall; at least 75 % first and 85 % in the top three in each class; 100 % for ids, commands and nonsense; per target, per names setting and per mod. **All met in all eight configurations.**

## Before and after

The counted numbers are the same on both targets and with or without the names file (the names file moves only the three id queries that wait on the exact-id finding below), so each table stands for four configurations.

### B650's 82 draft queries

"Before" is the engine and words as B653 to B665 left them, with only the ids respelt as B660's `entryIds` (the same results): mc-26.3 and mc-26.4 alike.

| Configuration | Before: first | Before: top three | After: first | After: top three |
|---|---|---|---|---|
| Sample mod, no names | 59 of 82 (72.0 %) | 68 (82.9 %) | 78 (95.1 %) | 79 (96.3 %) |
| Sample mod, names file | 57 of 82 (69.5 %) | 67 (81.7 %) | 76 (92.7 %) | 78 (95.1 %) |
| Empty mod, no names | 51 of 74 (68.9 %) | 61 (82.4 %) | 70 (94.6 %) | 71 (95.9 %) |
| Empty mod, names file | 49 of 74 (66.2 %) | 60 (81.1 %) | 68 (91.9 %) | 70 (94.6 %) |

"After" counts every draft query, the four that now wait on later work included; with those left out it is 76 of 78 (97.4 %) and 77 (98.7 %) on the sample mod, 68 of 70 and 69 on the empty mod. B650's spike reached 72 of 82 (87.8 %) and 78 (95.1 %) on its own throwaway engine; today's matchers 17 and 18.

### The whole set, per class

"Before" here is the final set of 240 queries (with its `same` lines and `needs`) over the engine and words before B666's tuning; "after" the same set after it. Counted queries only.

**Sample mod** (232 queries, 224 counted):

| Class | Counted | Before: first | Before: top three | After: first | After: top three | After: MRR |
|---|---|---|---|---|---|---|
| plain | 28 | 25 (89.3 %) | 27 (96.4 %) | 28 (100 %) | 28 (100 %) | 1.000 |
| misspelt | 24 | 22 (91.7 %) | 24 (100 %) | 24 (100 %) | 24 (100 %) | 1.000 |
| american | 18 | 17 (94.4 %) | 18 (100 %) | 18 (100 %) | 18 (100 %) | 1.000 |
| slang | 20 | **15 (75.0 %)** | 19 (95.0 %) | 19 (95.0 %) | 19 (95.0 %) | 0.960 |
| how-to | 26 | **19 (73.1 %)** | 25 (96.2 %) | 20 (76.9 %) | 25 (96.2 %) | 0.846 |
| id | 16 | **14 (87.5 %)** | **14 (87.5 %)** | 16 (100 %) | 16 (100 %) | 1.000 |
| mine | 22 | 22 (100 %) | 22 (100 %) | 22 (100 %) | 22 (100 %) | 1.000 |
| setting | 18 | 16 (88.9 %) | 18 (100 %) | 18 (100 %) | 18 (100 %) | 1.000 |
| command | 22 | **20 (90.9 %)** | **21 (95.5 %)** | 22 (100 %) | 22 (100 %) | 1.000 |
| behaviour | 20 | 17 (85.0 %) | 19 (95.0 %) | 20 (100 %) | 20 (100 %) | 1.000 |
| nonsense | 18 | 18 (100 %) | 18 (100 %) | 18 (100 %) | 18 (100 %) | 1.000 |
| **overall** | 232 | 205 (88.4 %) | 225 (97.0 %) | **225 (97.0 %)** | **230 (99.1 %)** | 0.979 |

**Empty mod** (209 counted; mine does not run): before 182 (87.1 %) first and 203 (97.1 %) in the top three; after **202 (96.7 %)** and **207 (99.0 %)**, MRR 0.922 to 0.977. Per class as above but for id (15 counted): before 13 (86.7 %) and 14 (93.3 %), after 15 and 15.

Bold "before" cells missed their bar. Answers and behaviours read right: 25 of 28 before, 26 of 28 after (the two wand queries, below).

### What still misses (after, every configuration)

- How-to: `how do I test my mod` (Blocks and items' "Test in Minecraft" first; the Playing and testing page third), `how do rules work` (a Rules trigger "The machine starts working" first: `work` counts as a word), `how do key binds work` (Try it's section "Keys and the screen" first; the keys page's own sections second and third), `how do I make a fluid` (the templates page's "Fluids" list one point above the Fluids page), `how do I make a game` (the Rules section "Games: …" first), `how do I make a machine` (the "Machine" inventory section above "Make a machine in the Creator").
- Slang: `tp to spawn` (examples with "spawn" first; the Teleport step fifth).
- Answers: `a wand that teleports you` and `a wand that strikes lightning` come first (the Magic wand door folds into the Scripted behaviour flow) but read no behaviour: the Scripted behaviour flow is in the Creator group `scripts`, which `GROUP_SORTS` (`sources/flows.ts`) gives no sort, so a per-sort Rules behaviour never fits it.

## What was tuned, and why

### Weights (`packages/search/src/rank/weights.ts`)

| Number | Was | Now | Why (the queries it fixed) |
|---|---|---|---|
| `FIELD_B.words` | 0.5 | 0.3 | A flow's long keyword list lost to a door's two words: "a block that explodes" showed the Glowing block door above Simple block. |
| `make.vanilla` | 0.55 | 0.45 | B650's lesson: under the make lean the flow (or its door) that makes the thing beats the game's thing of that exact name ("netherrite sword", "netherite pick"). |
| `make.kind` | 0.6 | 0.45 | "a new block" opened the element kind Block above the Make a block tile and the Simple block flow. |
| `make.command` | 0.5 | 0.7 | "new project" and "add namespace" read as make (`new`, `add`); kept below `none`'s 0.75 so Very easy still leans away from commands (B658's test). |
| `none.guide` | 0.6 | 0.5 | Guide sections titled like a setting or command came first with no intent: "import structure", "minecraft folder", "world backups"; "mob behavior" still finds its page. |
| `learn.flow` | 0.75 | 0.65 | "how to make particles" found the Particle flow above the guide. |
| `id.kind` | 0.9 | 1.2 | "msm:block", "msm:item" and "minecraft:recipe" with the sample mod open: the mod's elements of that kind (their kind is an id) came first. 1.5 was tried and put `kind:minecraft:zombie_nautilus_variant` above `minecraft:zombie`. |

The confidence floor (3, absolute) is unchanged: on the real corpus every expected first result of the plain to behaviour classes is a Best match except "an item that heals you" (2.8: the Scripted behaviour flow, found through one word) and nonsense never reaches it. Raising `none.command` to 0.9 fixed "import structure" too but put "Install resource pack" above the Resource pack starter for "texture pack" and "Check for updates" above the setting for "automatic updates", so it was left at 0.75 and the guide weight lowered instead.

### Plugin words

- Library (`things.ts`): `block` no longer has the same word `cube` (sulfur and magma cubes came first for "a new block"); `furnace` and `grinder` move from the same words of `machine` to its near words (the Furnace and Grinder doors were exact titles for "machine"); `pie`, `pies`, `tart` move to the near words of `cake` (the Pie door beat the Cake flow for "make a cake"); `potion` leaves the near words of `status effect` (the Status effect flow beat the Potion flow for "make a potion" and the Potions guide for "how do I make a potion"); `items` leaves the near words of `storage` ("an item that heals you" found the Storage crate); `mob` and `animal` are no longer near words of each other (every "a mob that …" chose the Farm animal through the four-legged body); `void world` and `empty world` move from `skyblock` to `void` ("void world" is the Empty sky flow).
- Library (`keywords.ts`): the Weapon flow loses `op` and `overpowered` ("op armor" chose the Weapon flow; `op` is the slang of the materials' `overpowered` idea); the Blank project starter loses `new project` (it beat the New project command); the Scripted behaviour flow gains `usable item` and `magic item`.
- Library (`entries.ts`): the Glowing block door's words are `light`, `lamp`, `lit` (were `light block`, `lamp block`, which doubled the word block).
- Library (`questions.ts`): the dimension terrain choice Floating islands loses `void`, so "skyblock" no longer answers it.
- Games (`search.ts`): `skyblock` loses the same words `sky island` and `void world` and the near word `empty world` (B557 gave sky islands and the empty sky flows of their own).

Every plugin's `test/search.test.ts` passes (validation, no word in two groups, vanilla ids on both targets), the library's 2,350 tests and the exporters' `library.test.ts` (the `examples/` mirror unchanged).

### The answer reader (`packages/search/src/slots/`)

B663 found "custom ore that drops xp" giving the Custom mob flow the name "Custom Ore": the name rule "a thing in place of the title's sort word" took the vocabulary idea `ore`, whose id named no sort. Now a thing named by a typed id or by an idea takes the sort of the listed thing with that id (`things.ts`), and only a thing known to be of the flow's sort stands in (`name.ts`). Tests in `test/slots/answers.test.ts`: "flying gem" (an idea of an item), "flying bone", "flying base:bone" and "flying ruby" give no name; "flying piggy" still gives "Flying Piggy". Two of them fail without the fix.

### Expectations changed (each with its `reason` in the file)

- Ids respelt as B660's `entryIds`: vanilla sorts `mob`, `biome`, `effect`; guide pages without `.md` and with B656's anchors; project elements as `project:element:<id>`; the settings catalogue's ids (27 queries, the same results).
- B659's note: the Rules behaviours are per sort (`block-drops-xp`, `block-explodes`, `item-teleports`).
- Doors that open the expected flow count as it (`same`): blue sword, netherrite sword, op sword, the two sword behaviours (Sword), netherite pick (Pickaxe), glyder (Elytra), a wand that teleports you (Magic wand), vehical (the vehicle card).
- armor and armour: the door Armour (the Gear set with the four pieces) first; the Make armour tile counts too.
- skyblock: its `needs` is met (B557's Skyblock flow), so the Skyblock flow first and Empty sky in the top three, as SQ16 said.
- mob behavior: the guide page's own entry (B661 indexes page titles, B650's lesson).
- how do I add a recipe: the guide now has a Recipes section, so the guide first, as the plan's draft wanted.
- how to make a portal, how do I test my mod, how do rules work: the guide page counts beside its section; the draft's `getting-started#9-try-it-in-minecraft` and `templates-and-examples#templates` sections no longer exist.

New queries, written before the first run and corrected once before this commit (no later change): `kitty` (the Pet flow with a cat's food read, the Cat door counting), `xp bottle` and `armor stand` (the item and the entity share the id and name), `how do I export my mod as a jar` (a how-to finds the guide's export sections, the command in the top three), `how do I make a potion` and `how do key binds work` (more sections of the expected page), `a wand that strikes lightning` (the flow's own Lightning answer, not a rule), `an item that heals you` (the library's `heals-you`, not the Rules `item-heals`), `a new block` (the Make a block tile counts), `customize a villager` replaced by `a red colored sword` (no American spelling a villager query needs), `enderman` replaced by `endreman` (a misspelling).

## Waiting on later work (`needs`, 8 queries, not counted)

Each is an engine finding outside B666's files (`query.ts`, `text/stop-words.ts`, `text/intent.ts`) or a guide section still to be written. The three engine fixes were tried in the worktree and reverted, not committed: with them every waiting query below passes but "what is a datapack" (and "how do rules work", counted, still misses).

| Query | Class | Now | Waits on |
|---|---|---|---|
| `minecraft:stone`, `minecraft:plains`, `minecraft:speed` | id | first without the names file, missed or third with it | **Exact id:** `query.ts` takes both the whole id and its path as exact surfaces and matches them against every word, so every id with the word (`end_stone`, `snowy_plains`, `soul_speed`) scores as exact; the right one wins only on its title. The whole id alone: first everywhere. |
| `msm:entity` | id | second (`kind:minecraft:tag/entity_type`) | The same. |
| `very easy mode` | command | second (Easy mode first) | **Stop words in titles:** `very` is dropped from the title and the query alike, so "Easy mode" is an exact title too and shorter. |
| `whats new` | command | fourth, no Best match | The same: `whats` is a stop word and reads as the learn intent, so the command's own title has nothing left but "new". |
| `how does try it work` | how-to | fourth | **"how … work":** `work` counts as a word to match, so Try it's sections that say "works" beat the page. |
| `what is a datapack` | how-to | missed | B672's guide section on data packs (SQ16). |

## The other checks

- **Misspellings** (`misspellings.test.ts`): every flow title with a word of four letters or more (67 of the 70 per target; Bed, Pet and Car are left out, SL13) with one seeded wrong letter in that longest word, never the first letter, in Very easy and in Easy, on both targets: 65 of 67 find their flow (or a door, tile or card with its action) in the top three, before and after B666. The two known misses are engine findings: `tnak` shares no trigram with `tank`, so the typo index never offers it (a swap in a four-letter word), and `soin` is one letter from `skin` and `spin` and the tie goes to the more frequent `spin` (Mob skin). The test pins the list so a fix shows.
- **Determinism:** every query asked again on a fresh build of each target gives the same rows in the same order.
- **Availability:** no flow is unavailable on either target today, so the test marks every third flow (with its doors and tiles) unavailable after collecting, as a target that lacked it would: over the whole set and each such flow's title, an unavailable entry is never a Best match and never first while an available one scores within a fifth of it.
- **Nonsense:** no Best match in any configuration (18 queries).
- **Speed:** the whole file (eight builds, 240 queries each, a ninth to twelfth build for the checks) runs in about 20 s here; the test's timeout is 240 s for a busy runner, no retry.

## Follow-ups (not B666's files)

1. `packages/search/src/query.ts`: count an exact id only on whole-id tokens (`[id.text]`, or the path only against the id field's whole tokens), then remove `needs` from the four id queries.
2. `packages/search/src/text/stop-words.ts` / the title fields: keep a stop word that is part of a title for the exact-title check (`very`, `whats`), then remove `needs` from `very easy mode` and `whats new`.
3. `packages/search/src/text/intent.ts`: read "how do … work" / "how does … work" as part of the question, then remove `needs` from `how does try it work`.
4. `packages/search/src/text/typos.ts`: offer a candidate for a swap of neighbours in a four-letter word (`tnak`); prefer the dictionary word nearer the title words on a tie (`soin`).
5. `app/src/renderer/src/search/sources/flows.ts`: give the Creator group `scripts` (or the Scripted behaviour flow) the sort `item`, so item behaviours fit it.
6. B672: the data pack section, then "what is a datapack" expects it first.
