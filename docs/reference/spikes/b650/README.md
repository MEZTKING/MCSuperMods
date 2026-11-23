# B650 spike: search everything (the corpus, matching, the first queries, sizes)

Answers SQ1 to SQ16 of the search plan (deleted at its close B673; the questions and the answers in short are in ADR 0124's findings) for [ADR 0124](../../../adr/0124-search-everything.md), measured on 2026-11-22 in a cloud container (4 cores, 15 GB) from main 0cb3abe, for the targets mc-26.3 and mc-26.4 (26.4-snapshot-7). Nothing here is built, linted or shipped. Another spike (B547, engine-mod GameTests) shared the 4 cores during part of the runs (load average 5 to 11); the timings below are from the quiet runs (load average 2.5 to 4.6) unless a line says "busy", and the busy files are kept beside them.

Clean room: no Mojang file is kept. The client jars in the Loom cache (`~/.gradle/caches/fabric-loom/<version>/minecraft-client.jar`) were read only at run time, `en_us.json` straight into memory (`unzip -p`), to time and name the vanilla layer; no name from it is written to any result (the golden results of the jar runs leave out what the matcher understood). Vanilla ids come from the targets' vendored `registries.json`. The 82 queries use names made from ids.

## What was run

- **The corpus** (`spike-src/app-test/collect.test.ts`, a throwaway Vitest file in `app/test/`, deleted): every built-in plugin's kinds, templates, starters (flows when they have `creator`), examples and commands from `builtInPlugins`; the 51 built-in palette commands; the Rules catalogue (triggers, steps, conditions, values); `PLAIN_PROBLEMS`; Home's `MAKE_TILES`; the Showcase's `SHOWCASES`; a hand list of 12 settings from `SettingsDialog`; the guide's `##` and `###` sections with their text (tables included). Per target, `supports(target)` applied. The made-up project layer is `fixtures/sample-mod` (95 things) and a generated mod of 500 or 5,000 things (`layers.ts`).
- **A throwaway engine** (`spike-src/text.ts`, `engine.ts`, `vocab.ts`): normalising, British and American folding by rule and list, a light stemmer with protected words (every vanilla id word of four letters or more and every vocabulary headword), stop and intent words, phrases, joined and split words, three typo methods, BM25F over six fields (title 3, extra words 2, question and choice labels 1.2, ids 1.2, sentence 1, body 0.3), intent times source weights, an exact-title bonus, coverage, answers from words and behaviour clauses. `vocab.ts` is a first draft of the plugins' data (49 word groups, 21 colours, 34 behaviours, 26 keyword lines). Version 0 is the engine as first written; version 1 is one tuning pass after the first run of the queries (the changes are marked `v1` in the code).
- **Node 24** (`golden.ts`, `typos.ts`, `answers.ts`, `bench.ts` with a `worker_threads` round trip, `layers.ts`); **Electron 45.2.2** (Chrome 156): `electron-main.mjs` runs the bench in a Web Worker made from a `blob:` URL under the app's production CSP and on the page's main thread, at normal speed and at a four times CPU slow-down (DevTools `Emulation.setCPUThrottlingRate`). The throttle does not reach a dedicated worker (the worker's times are the same at 1 and 4), so the four times figures are the main thread's.
- **Keys and the accessibility tree** (`spike-src/keys/`): a page bundled by esbuild with the app's Monaco features (the list in `monaco-setup.ts`), a text field and a draft combobox, a menu with `CmdOrCtrl+K` and `CmdOrCtrl+Z` accelerators, driven by Playwright's Electron support under Xvfb.
- **Sizes**: a throwaway lazy chunk set in the renderer (`spike-src/size-*.ts`: the engine in a `?worker`, an empty panel, the client stub, 2,000 vocabulary lines), `pnpm --filter @msm/app build`, the output compared file by file with a build without them; removed afterwards.
- **The sandbox** (`spike-src/app-test/sandbox.test.ts`): the plugin tests' sample bundle with 200 vocabulary lines and three entries through `createPluginWorker` and the `node:vm` stand-in.
- **Preview cost** (`spike-src/app-test/preview.test.ts`): every flow built with its default answers, planned with `planCreate` and laid over an empty project with `bundlePreviewProject`, both targets.
- `results/` holds the numbers; file names start with the question they answer.

Both targets gave the same answer to every question below unless a line says otherwise.

## SQ1 The corpus, and the time and memory to build it

| | mc-26.3 | mc-26.4 |
|---|---|---|
| Static entries collected | 1,661: 62 flows, 12 other starters, 297 templates, 200 examples, 118 kinds, 51 commands, 144 Rules entries (62 triggers, 47 steps, 21 conditions, 14 values), 251 problems, 27 tiles, 13 Showcase cards, 12 settings, 474 guide sections | the same |
| After folding (one-flow tiles and the cards into what they open) | 1,644 | 1,644 |
| Vanilla ids of the sorts search shows | 5,420 (block 1,286, item 1,658, entity type 161, effect 40, enchantment 43, potion 46, particle 128, sound event 1,991, biome 67) | 5,536 |
| Vanilla entries, a block and its item as one | 4,291 | 4,382 |
| Dictionary words (folded, three letters or more) | 3,966 static, 4,119 with vanilla | 4,123 with vanilla |
| Index terms, postings | 2,958 and 51,506 static; 3,357 and 74,191 with vanilla; 100,171 postings with a 5,000-thing mod | 3,361 and 74,701; 100,681 |
| Corpus as JSON | 877 kB (the guide's sections with 600-character bodies are 396 kB of it) | the same |

**Build in an Electron Web Worker (quiet run, ms; `results/sq1-sq2-electron-*.json`):**

| Layer | 26.3 | 26.4 | Main thread at 4 times slower (26.3 / 26.4) |
|---|---|---|---|
| Static, first build (cold JIT) | 110 | 103 | 377 / 385 |
| Static, warm | 90 | 95 | 376 / 441 |
| Vanilla alone | 73 | 51 | 187 / 182 |
| Static and vanilla together | 160 | 146 | 644 / 510 |
| A 500-thing mod alone | 8 | 6 | 22 / 19 |
| A 5,000-thing mod alone | 40 | 45 | 194 / 180 |
| Static, vanilla and 5,000 things in one build | 177 | 139 | 625 / 582 |

Node 24 (quiet, `results/sq1-sq2-node-*.json`): static 109 to 139 ms, static and vanilla 207 to 292 ms, with 5,000 things 247 to 275 ms. The busy runs were up to twice as slow. The spike tokenises with regular expressions and keeps postings in `Map`s while building; most of the time is the dictionary pass (60 to 110 ms) and the postings (100 to 190 ms), not the typo index (10 to 15 ms with trigrams).

**Memory** (Node heap after the build, with `--expose-gc`; `performance.memory` is not available in an Electron worker): static 3.7 MB, with vanilla 6.7 to 6.9 MB, with a 500-thing mod 6.8 to 6.9 MB, with a 5,000-thing mod **9.4 MB**. That is with the trigram typo index and typed-array postings. The first version (postings as arrays of numbers, the build tables kept alive by closures) used 19 to 47 MB; the deletion-neighbourhood typo index alone is 7.4 MB (59,883 keys) against 0.9 MB for trigrams and 1.0 MB for a BK-tree.

## SQ2 Query time, and the worker

Query times over the 82 draft queries plus six longer ones, ten (Node) or five (Electron) repetitions, `easy` mode, 20 results:

| Index | Worker, median / 95th centile / worst (ms) | Main thread at 4 times slower, median / 95th (ms) |
|---|---|---|
| Static | 0.4 to 0.5 / 2.4 to 2.7 / 11 | 2.2 to 2.4 / 13 |
| Static and vanilla | 0.5 / 5.4 to 6.2 / 11 | 2.5 to 2.6 / 23 to 24 |
| With a 500-thing mod | 0.5 / 5.1 to 5.2 / 10 | 2.1 to 2.2 / 19 to 20 |
| With a 5,000-thing mod | 0.6 to 0.8 / 4.7 to 7.3 / 16 | 2.6 to 2.7 / 20 to 21 |

By number of words (Node, static and vanilla, `results/sq1-sq2-node-*.json`): one word p95 is the highest (a typo lookup on a long word), six words 2 ms median. The busy runs had single outliers of 80 to 320 ms (scheduling and garbage collection), none in the quiet runs.

**Worker round trip** (Node `worker_threads`, a 5,000-thing mod): the call on the same thread 1.0 to 1.1 ms median, 8.1 to 8.7 ms p95; through the worker 1.9 to 2.0 ms median, 12.5 to 13.5 ms p95. The difference is the structured clone of 20 whole hits (11.4 kB a query, each hit carrying its entry). Sending the build's 11,000 entries in and building took 419 to 504 ms (290 to 383 ms of it the build).

**Go for the worker (D3).** The build is 90 to 180 ms at normal speed and 380 to 640 ms at four times slower: it must not run on the renderer's main thread. A search through the worker costs under a millisecond more at the median, so the reserve B676 is not needed. Return slim hits (id, score, answers, behaviour, why) and keep the entries by id on the client side.

## SQ3 Typo candidates

302 misspellings (`results/sq3-sq4-typos-*.json`): 59 flow titles with one seeded edit (the longest word of four letters or more; 3 flows have none), 100 vanilla names made from ids with one edit (four to seven letters) or two (eight or more), and 143 misspellings players type (a hand list). The dictionary is the 4,119 folded words of the static and vanilla layers. The three methods find the same candidates, since each is verified by the same edit distance (optimal string alignment, a swap of neighbours counting as one):

| Method | Build | Memory | Per word | Right first | Wrong first | None |
|---|---|---|---|---|---|---|
| Deletion neighbourhoods, frequency ties (first draft) | 37 to 39 ms | 7.4 MB | 0.06 to 0.09 ms | 273 (90.4 %) | 8 | 21 |
| Deletion neighbourhoods, B650 ties | 30 to 37 ms | 7.4 MB | 0.03 ms | 277 (91.7 %) | 4 (1.3 %) | 21 |
| Trigram overlap (at least 30 % shared), B650 ties | 10 to 15 ms | 0.9 MB | 0.13 ms | 277 (26.4: 275) | 4 | 21 (26.4: 23) |
| BK-tree, B650 ties | 43 to 46 ms | 1.0 MB | 0.8 to 0.9 ms | 277 | 4 | 21 |

"B650 ties" breaks a tie of edits by: the same first letter, then a swap for a key beside it (`caje` is `cake`, not `cave`), then a longer word that the typed word begins (`flowe` is `flower`), then frequency. The four left wrong: `gtay` (stay, not grey), `torche` (torches), `biom` (boom), `potatoe` (potatoes). The 21 with none are beyond the edit limits (`vehical`, `poshun`, `dimenshun`, `animashun`, three-letter words such as `tak`) or are themselves words (`ender man`).

**A sound-alike key** (our own Soundex-like key, `soundKey`) on the misspellings with no candidate: right 7 (26.4: 8), wrong 6 (26.4: 8). **Not worth it: the reserve B674 is not taken.** The misspellings beyond the limit that matter go into the vocabulary as `misspellings` lines (the spike added `vehical` and `vehicel` to the vehicle group; with that line, the query `vehical` finds the vehicle tile first).

**The typo method for D4: trigram overlap** (30 % of the query word's trigrams shared, padded with two spaces in front and one behind), verified by the edit distance, with the B650 tie rules: the same recall as the others at an eighth of the deletion index's memory, which the 12 MB budget needs. The edit limits as drafted hold (none for three letters or fewer, one for four to seven, two for eight or more).

**D16's sub-bar "every flow title with one wrong letter finds its flow in the top three":** 55 of 59. The four misses: `tak` (Tank: three letters, never corrected, SL13), `boar` and `plabne` (Boat and Plane: corrected, but the "Make a vehicle" tile and two vehicle examples rank above the flow), `lghts` (Lights: corrected to `light`, and the glow examples win through the synonym group). Write the bar as "every flow title of four letters or more", and see the tile rule in "Corrections to the interface".

## SQ4 The stemmer

Pairs of different dictionary words merged into one stem (`results/sq3-sq4-typos-*.json`, `stemmer` and `knownBad`), over the 4,119 words:

| Stemmer | Groups merged | Words merged into another | Bad merges from a hand-checked list of 20 |
|---|---|---|---|
| Rule stemmer, nothing protected | 828 | 1,870 | 11: coming/com, mined/min, noted/not, named/nam, shaped/shap, scraping/scrap, news/new, leaves/leave, boots/boot, closed/clos, moved/mov |
| Rule stemmer, protected words | 775 | 1,724 | 8 (leaves and boots are vanilla id words, so protected) |
| Dictionary stemmer as first written (an -ing or -ed word becomes a dictionary word, else stays whole) | 759 | 1,748 | 11: the eight above but leaves and boots, plus gives/gif, saves/safe, lives/life, ranged/range |
| **Dictionary stemmer, B650 order and exceptions** | 748 | 1,720 | **1: ranged/range** (harmless) |

The B650 order, for B653: drop a plural -s when the singular is a dictionary word, before trying -ves to -f; for -ing and -ed try the word with an -e first (`noted` is `note`), then the bare stem only if it has four letters or more (`coming` is not `com`), then the undoubled stem; an -ing or -ed word with no dictionary form stays whole. The exception list (`STEM_EXCEPTIONS` in `text.ts`): news, series, species, lens, gas, bus, this, its, was, has, does, lives, yes, always, perhaps, canvas, atlas, lapis. "creeper" never becomes "creep" (protected, and -er is never stripped). The rest of the 748 groups are true inflections (blocks/block, exploded/explode, berries/berry, wolves/wolf).

## SQ5 The first 82 queries, and today's matchers

`queries-draft.json`: 82 hand-written queries in the eleven classes of D16 (plain 10, misspelt 8, American 6, slang 8, how to 8, ids 6, the mod's own things 8, settings 6, commands 8, one thing and what it does 8, nonsense 6), each with the expected first result on today's corpus, the door (`very-easy` for Home's bar, `easy` or `advanced` for the toolbar), the open mod and, for 12, the expected answers or behaviour. The top-three check counts only the expected id among the first three.

| Matcher | First | Top three | Answers right |
|---|---|---|---|
| **Today** (the palette's `fuzzyScore` over commands, `templateMatches`, `exampleMatches`, `filterThings` over vanilla things named from ids, the sidebar's `matchesSearch` over the sample mod; each over its own list) | 17 (20.7 %) | 18 (22.0 %) | none |
| Spike, version 0 (as first written, no keywords) | 58 (70.7 %) | 71 (86.6 %) | 8 of 12 |
| **Spike, version 1** (one tuning pass, the draft keywords) | **72 (87.8 %)** | **78 (95.1 %)** | 10 of 12 |

Version 1 is the same on both targets, with and without the jar's names. Today's matchers found only commands (7 of 8), three ids, `gray wool`, `mod jar` and the nonsense (nothing found); they cannot see flows, the guide, settings, Rules or problems, and the sidebar's filter does not match "ruby sword" against `ruby_sword`.

Version 1 by class (first / top three / queries): plain 9/10/10, misspelt 7/8/8, American 5/5/6, slang 6/8/8, how to **5/5/8**, ids 6/6/6, mine 8/8/8, settings 6/6/6, commands 8/8/8, behaviour 6/8/8, nonsense 6/6/6.

The ten misses of version 1, each a lesson for the briefs:

- `blue sword`, `blue sword that sets mobs on fire`, `a sword that poisons`: the New project starter **Custom sword** (`custom-sword`) ranks above the Weapon flow (second). A non-flow starter that duplicates a flow needs a fold line (B654) or a lower weight under the make intent (B658).
- `netherrite sword`, `netherite pick` (Home's bar): Minecraft's own netherite sword and pickaxe rank first, the flows second or third. A bare thing name under Very easy leans to make, but an exact vanilla title still wins: B658 should weigh "a flow that can make this thing, with the thing as its answer" above the vanilla id under the make lean.
- `mob behavior`: the Custom mob flow above the guide's mob behaviours page (no page-level entry for a guide page: B661 should index the page title as well as its sections).
- `mod jar`: the Firefly jar example above the export command (second).
- `how do I add a recipe`: the guide has **no section on recipes** (only "Machine recipes", which comes first); the plan's draft expectation cannot be met today. `what is a datapack` passed only through the Data pack starter: no section explains data packs. Both are lines for B672.
- `how do I test my mod`: the first mod page's "Change something and test again" above Play's page. `how do rules work`: two Rules problems rank above the Rules page (problem titles are short and full of the word).

Answers: 10 of 12 right; the two wrong were read from the raw words, not the corrected or vocabulary ones (`netherrite` did not fill the tier; `pick` did not fill the pieces). The spike also put 20 into the Weapon flow's `attack_damage` for `20 damage bow`, a question bows ignore (see SQ6).

**Bars for D16:** the draft 85 % first and 95 % top three are reachable overall (87.8 % and 95.1 % after one pass), but not per class on this corpus: how to is 5 of 8. Recommended: 85 % and 95 % overall per target and per jar setting; at least 75 % first and 85 % top three in each class; 100 % for ids, commands and nonsense. Only B666 and B673 tune, and the misses above are theirs to fix by data first.

## SQ6 Answers from words

Over the 62 flows (`results/sq6-answers-*.json`; a question counts as answerable when its label, or each choice's first word of its own, is what a user would type):

| Question type | Questions | From label words alone | Need a `search` hint |
|---|---|---|---|
| Name (the first text question named "…name") | 55 | 53 | 2 (a second name: the crop's seeds) |
| Colour | 82 | 50 (the first colour question of a flow) | 32 (a second colour: leaf, berry, patina, filling, metal; and variants) |
| Choice | 215 | 166 | 49 (generic first words: "Like iron", "My own numbers", "What it does") |
| Set | 10 | 8 | 2 (wood and copper set members) |
| Number | 142 | 108 | 34 (shared words: "Effect 1: seconds", "Attack damage" and "Damage blocked") |
| Yes or no | 88 | 84 | 4 |
| Free text that is not a name | 22 | 0 | 22 (the Fluid flow's "What is it called?" is a name with no "name": a `role: 'name'` hint) |
| Picture, sound file | 65, 3 | never | never |

Of 1,398 choices, 1,250 (89 %) have a first word of their own within their question.

**Clashes:** 156 words fit two or more questions of one flow, in 26 flows. Each falls under one of these rules (the order B659 applies them):

1. A "from" question (`ingredient`, `brew_ingredient`, `base`, `recipe_1` to `recipe_3`, `copy_block`, `template_item`, `icon`, `extra_items`) takes a word only after "from", "of", "made of" or "with" (Weapon: "diamond sword" is the tier; "sword from diamonds" the recipe).
2. A "like X" choice (`mines_like`, `armor_base`, `vein_preset`, `behaves_like`) takes a word only after "like" or "as" (Gear set: "iron" is the tier, not "mines like iron"; Custom ore: "iron" is the pickaxe needed).
3. Numbered repeats (`effect_1` and `effect_2`, `stat_1` and `stat_2`, `recipe_1` to `recipe_3`) fill in order, the first free one first.
4. `variant_<n>_*` questions are never answered from words (**Change it first**).
5. Questions that share one word by design (Tree: `log` and `leaves`; Wood set: `set_type` and `wood_type`) take it together when the flow's hint says so (`sameAs`).
6. A number fills a number question only with its unit or a word of the label beside it; out of range it is **dropped and shown struck through, not clamped** (D7 says clamped: clamping makes a number the user did not type). The Crop's compost percentages need "%" or "compost".
7. A question that applies only to some answers of another (Weapon's `attack_damage` only for melee types with `custom_damage` on; bows have `damage_multiplier`, 0 to 5) needs an `appliesWhen` hint: the plugin API has no visibility rule for questions. Then `20 damage bow` drops the 20, as the plan expects.
8. Otherwise the first question in declaration order wins (`tier` before `mines_like`; `terrain` before `sky`).

## SQ7 Preview cost

Every flow's bundle with default answers, `planCreate` against an empty project and `bundlePreviewProject`, in Node (`results/sq7-preview-cost.json`, warm median of three after one cold run): median 0.8 to 1.1 ms; the slowest are the Tank (26 to 27 ms), the Plane (16 ms), the Copper set (10 to 20 ms), the Car and the Mob skin (8 to 9 ms), the Wood set 4.5 to 5 ms; the first (cold) runs at most 28 to 30 ms. **No flow is over 100 ms before drawing**, on either target. The plan's guess that the Wood set misses 250 ms does not hold for the bundle.

Not measured: the first picture in `CreatorPreview` (it needs the built renderer and a GL context; this container has only Mesa's software GL). The time to a picture is the lazy preview chunk's load plus the first draw; for the world flows it is the terrain worker's start and its coarse map (ADR 0119 measured the coarse map at 39 to 85 ms after the debounce, warm; a cold terrain worker also fills its registries from the jar's files). B665 must measure the first picture per flow in its e2e with a time mark and list any flow over 250 ms; until then SL8's wording stands.

## SQ8 The jar's names

`results/sq8-jar-names.json`. `en_us.json` is 546,577 bytes with 8,559 keys (26.3) and 561,688 bytes with 8,766 keys (26.4); read from the jar in 14 to 22 ms, parsed in 2.8 ms. The keys search wants (`block.minecraft.`, `item.minecraft.`, `entity.minecraft.`, `effect.minecraft.`, `enchantment.minecraft.`, `biome.minecraft.`, `item.minecraft.potion.effect.`, `subtitles.`) are 4,136 and 4,188, **228 and 231 kB as JSON**. They name: blocks 1,270 of 1,286 (26.4: 1,295 of 1,311); every item, by its own key or its block's; every entity type, effect, enchantment and biome; potions 24 of 46 (the long and strong ones share the base's key); **no particle, and no sound event directly** (a sound's subtitle key is in `sounds.json` of the asset index, which is neither in the client jar nor in MSM's asset cache: verify at implementation; until then sounds are named from their ids). Building the vanilla entries with names takes 5 to 9 ms.

**Route for B656:** `minecraft:names` (`{ targetId }`) reads `assets/minecraft/lang/en_us.json` from the existing asset cache (it is already extracted: `PREVIEW_ASSET_PATTERNS`), keeps only those prefixes and answers `{ [id]: name }` by sort (about 230 kB once per target, cached in the client and handed to the worker); **no cache schema change**. Without the cache, names are words made from ids: the 82 queries gave the same results with and without the jar.

## SQ9 Ctrl/Cmd+K

`results/sq9-sq15-keys-and-aria.json`, Playwright key presses in Electron 45 under Xvfb:

- **In a text field and on the page:** the keydown reaches a `window` listener in both the capture and the bubble phase, `defaultPrevented` false: the app's `shortcutFor` (a bubble listener, `App.tsx`) would see it.
- **Inside Monaco with the app's features:** Ctrl+K reached the window only in the capture phase. Monaco stopped it, entered its chord, and Ctrl+K then Ctrl+X ran "Trim trailing whitespace" (the text changed). Monaco's Ctrl+Z also never reached the bubble phase. The function and script editors are Monaco, so the same holds there.
- **The menu accelerators** (Ctrl+K and Ctrl+Z on an Edit menu) never fired for Playwright's synthetic keys, in any focus, so how the menu and the page pair up for a real key press on Windows could not be observed here.

**The binding for B667:** `shortcutFor` returns `search` for Ctrl/Cmd+K without Shift (the bubble listener, so Monaco keeps its chords inside the editors: SL17 as written). The Edit menu shows **Search…** with `CmdOrCtrl+K` and `registerAccelerator: false`, so the menu displays the key but never takes it from Monaco; the deduper is then not involved. Check on Windows (the user's check): Ctrl+K in the JSON editor still starts Monaco's chord, Ctrl+K anywhere else opens search once.

## SQ10 The guide in the app

`results/sq10-guide.json`. 38 files, 791,287 bytes, 474 `##` and `###` sections (and 41 `####`). An index of page, heading, anchor and first sentence is **105 kB as JSON** (396 kB with 600-character bodies for matching), built by main on first need.

- **Packaging:** `electron-builder.yml` already copies `build/runtime` with `extraResources`, filled by `scripts/stage-runtime.mjs`. The guide follows the same pattern: stage `docs/guide/*.md` into `app/build/guide` (the same script or a sibling) and add `- from: build/guide, to: guide`; main reads `join(process.resourcesPath, 'guide')` when `app.isPackaged`, else `<repository>/docs/guide`. Nothing enters `app.asar` or the renderer. `dist:dir` was not run in this spike (disk): verify at implementation that the files land in `resources/guide/`. **Go for D14.**
- **What `Markdown.tsx` must learn:** it renders `#` to `###` headings, `-` lists, paragraphs, code fences, inline code, bold and `https:` links. The guide also has 106 tables (1,464 rows), 184 numbered list items, 65 nested list lines, 41 `####` headings, 491 links to other pages (`name.md#anchor`), 116 links to an anchor on the same page and 1 blockquote; no image and no HTML. Links between pages and to anchors must open inside the reader; `https:` links keep opening the browser.

## SQ11 Size

`results/sq11-size.json`, one build of the renderer with the throwaway chunks:

| Chunk | Bytes (minified) |
|---|---|
| The worker: the engine and the text handling | 19,398 |
| An empty panel (the combobox, a listbox, a live region) | 501 |
| The client stub (the lazy loader) | 579 |
| 2,000 vocabulary lines of the draft shape | 111,317 |
| The first-paint `index.js` (the one `import()` line) | +154 |
| Renderer in all | +131,973 (0.13 MB) |

`app.asar` was not built (disk); it packs `out/**` without compression, and `out/` grew by 132,107 bytes, so its delta is the same 0.13 MB. **The budgets of "Size" hold, split as:** the engine and worker 0.03 MB, the panel and preview pane 0.06 MB, the plugins' search data 0.11 MB (about 2,000 lines); 0.2 MB in all, `app.asar` 0.3 MB. **But only if the plugins' search data is loaded lazily:** the built-in plugins are imported eagerly (`plugins/built-in.ts`), so search data placed on their contribution objects as arrays, or `keywords` on every template, starter and kind (estimated 30 to 40 kB), lands in the first-paint bundle. See "Corrections to the interface", item 1.

## SQ12 Behaviours, and "sets mobs on fire"

`results/sq12-behaviours.json` checks 34 draft clauses against the Rules catalogue and the flows' own questions (every trigger, step, flow, question and choice named exists): **flow answers 4** ("glows": the Simple block's light level 15; "is friendly", "attacks players", "shoots arrows": the Flying mob's behaviour and projectile), **the flow itself 6** ("you can ride": Mount; "flies": Flying mob, or Mount's `flying`; "grows": Crop; "you can eat": Food; "stores items": Storage crate or Backpack; "follows you": Pet), **one rule 16** ("drops xp" for a block: `block_broken` and `give_experience`; for a mob: `mob_died`; "explodes"; "gives speed", "jump higher", "makes you invisible": `item_used` and `give_effect`; "heals you"; "teleports you"; "bounces you": `block_stepped_on` and `launch`; "drops diamonds"; "spawns zombies"; "plays music"; "sends a message"; "makes it rain"; "strikes lightning": `item_hit_mob` and `spawn_mob` with `minecraft:lightning_bolt`, verify at implementation that the mob picker takes it), **a companion flow 5** (the Enchantment flow: "sets mobs on fire", "poisons", "slows mobs", "mines faster", "knocks back") and **a gap 3**.

**"Sets mobs on fire", confirmed:**

- **Rules:** no trigger or step sets an entity on fire (the catalogue's only fire is `explode`'s "with fire", which sets blocks alight). `run_command` exists but is Advanced only and no vanilla command sets an entity alight (an NBT write of a mob's fire ticks may work; verify at implementation, and it is not for Very easy). `place_block` of `minecraft:fire` at the mob is a rough stand-in (it burns the ground, not the hit).
- **Script API:** no member sets fire (`Entity.runCommand` only, as above).
- **The Enchantment flow:** its effect "Set the target on fire" with "Goes on: Swords" works in a data pack. The Weapon flow's sword joins `#minecraft:swords`, so the enchantment applies to it at the enchanting table (when "Offered at the enchanting table" is on) and at an anvil.
- **Can the made sword carry it from the start? Not today.** `msm:components` with `minecraft:enchantments` naming a project enchantment is a load error: the runtime decodes passthrough components against the static registries, and only `jukebox_playable`, `provides_trim_material`, `trim`, `damage_resistant`, `blocks_attacks` and `damage_type` are delayed until data packs load (`ComponentPassthrough.DELAYED`). A crafting recipe's result `components` would carry it in vanilla data (verify in game). So search makes the two together, as two lines of one result, and the sword gets the enchantment in game.
- **It is a vanilla parity gap** (Fire Aspect's effect, `/data` fire ticks, the `minecraft:ignite` enchantment effect exist in vanilla; a behaviour without an enchantment does not exist in MSM). Lines for `docs/COVERAGE-AUDIT.md`:
  1. **No Rules step or Script API member sets an entity on fire** (a "Set on fire for N seconds" step and `Entity.setOnFire(seconds)`); a mob whose attacks set the target on fire, or a block that sets what touches it alight, cannot be made.
  2. **A made item cannot carry a project enchantment from the start:** `minecraft:enchantments` and `minecraft:stored_enchantments` are not in `ComponentPassthrough.DELAYED`.
  3. **No Frost Walker-like effect** in the Enchantment flow, and no Rules step that changes blocks in an area around someone.
  4. **No "unbreakable" answer** on the Weapon or Gear set flows (only Advanced, through `msm:components`).

## SQ13 The sandbox

`results/sq13-sandbox.json`. The sample plugin's bundle with 200 vocabulary lines and three entries went through `createPluginWorker`: the existing describe path already carries any contribution point that is an array of objects, as data (`dataOnly`), so nothing in the protocol had to change. 200 lines are 23 kB; the plugin was ready in 6.4 ms; a structured clone of the description took 0.8 ms; the draft check (limits, and every entry opening only the plugin's own templates, starters, examples, kinds or commands) took 0.2 ms. It refused the entry that opened the library's `weapon` and reported that an entry's `supports` function is ignored (functions arrive only as names). With the lazy shape of item 1 below, a third-party plugin's `searchData` would be one more sandbox method (`searchData`, a 2,000 ms deadline) returning the same data, checked by the same function.

## SQ14 Starting answers, and make at once

- **`CreatorDialog`:** one new prop, `start?: { flowId: string; values: Readonly<Record<string, Json>> }`. In its two initialisers: the start flow is `editFlow ?? (start ? the available flow with start.flowId : undefined) ?? (the one offered flow)`, and `raw` is `{ ...defaultRawValues(parameters), ...rawValuesFromStored(parameters, start.values) }`. About eight lines; the `edit` route is not touched, and the first build runs through `planCreate` as for any new set.
- **Make at once:** `planCreate` is a plain exported function (`changeset/creator-sets.ts`); the spike called it from outside the Creator for all 62 flows on both targets without trouble. The loop of `rollSurprise` (`surprise/surprise.ts`, from the `starter.build` call to `foldItems`: build, `bundleClashes`, `planCreate`, `creatorChanges`, `planChangeItems` on a virtual project, the rule book beside it, `foldItems`) moves into a shared `changeset/make-at-once.ts`, for example `makeAtOnce({ project, namespace, target, flows: [{ starter, values }], ruleBook?, isKnownKind, newSetId }) -> { items, things }`, which both Surprise me and search's **Add to my mod** hand to `applyChangeset` as one undo step. `surprise.test.ts` (200 seeds per target) is the guard.

## SQ15 Accessibility

`results/sq9-sq15-keys-and-aria.json`. Playwright's `ariaSnapshot()` and Chrome's full accessibility tree in Electron see the draft pattern as intended: a `combobox` named by its label with `expanded`, `activedescendant`, `controls` and `autocomplete=list`; one `listbox`; a `group` per section named by its heading; `option`s with `selected` and `disabled`; a `status` with `live=polite`. One fix for B663: the visible heading inside each group also shows as text in the tree (`text: Best match` under `group "Best match"`); mark it `aria-hidden="true"` and keep it only as the group's label. What a cloud session cannot check, and goes into the user's Windows check: what Narrator or NVDA actually says when the active option moves and when the live region changes, and whether typed letters are ever dropped while results update.

## SQ16 Order effects

Expectations that depend on work that has not landed, written into `queries-draft.json` as `needs` or `notes`:

- `skyblock`: the Empty sky flow until the game modes plan's B557 adds its Skyblock flow; then that flow first and Empty sky in the top three.
- `how do I add a recipe`, `what is a datapack`: the guide's recipe and data pack sections that B672 should write (the plan's draft expected a guide section first).
- A sound result's **Play** (Live views 3, B622) and the Creator's Live tab (B615) change the preview, not the ranking: no query depends on them.
- "sets mobs on fire": if a later brief adds a "Set on fire" Rules step (gap 1), the behaviour should become one rule as well as, or instead of, the Enchantment flow; the query's expectation then changes with a reason.
- Every new flow, kind or Rules line after B652 adds its own query (D15).

## Go or no-go

| Decision | Verdict |
|---|---|
| D3 the worker | **Go.** The build must stay off the main thread (380 to 640 ms at four times slower); the round trip adds under 1 ms at the median. Reserve B676 not needed. |
| D3 budgets | **Go, unchanged:** static and project layers within 150 ms (90 to 110 ms static, 40 to 45 ms for 5,000 things, in the worker), vanilla within 250 ms (49 to 73 ms), 12 MB with a 5,000-thing mod (9.4 MB, with trigrams and typed arrays), first results within 30 ms and 60 ms with vanilla at the 95th centile (2.4 to 7.3 ms in the worker, 13 to 24 ms at four times slower on the main thread). Key press to painted results within 100 ms: not measured (no panel yet), likely. Reserve B675 not needed if B658 tokenises once, keys terms by number and keeps postings in typed arrays. |
| D4 typo method | **Go: trigram overlap** with the edit limits as drafted and the B650 tie rules; **no sound-alike key** (B674 not taken); misspellings beyond the limit as vocabulary data. |
| D4 stemmer | **Go:** the dictionary-aware light stemmer with the B650 order, protected words and the exception list (one harmless merge left). |
| D10 the palette door | **Go.** Commands 8 of 8 first (today's `fuzzyScore` 7 of 8), settings 6 of 6; the palette keeps its key, look and test ids. Ctrl/Cmd+K as in SQ9. |
| D14 the guide packaged | **Go**, staged into `build/guide` like the runtime jars; the reader needs the Markdown features of SQ10. |
| D16 the bars | **Go with per-class floors:** 85 % first and 95 % top three overall (the spike reached 87.8 % and 95.1 %), at least 75 % and 85 % per class, 100 % for ids, commands and nonsense. |
| "Size" | **Go,** 0.2 MB renderer and 0.3 MB `app.asar`, split as in SQ11, **if** the plugins' search data is lazy (item 1 below). |

## Corrections to the interface (for B651 and B652 to freeze)

1. **Lazy search data.** In place of the eager `searchVocabulary`, `searchBehaviours`, `searchEntries` arrays and the `keywords` and `search` fields on templates, starters, kinds and questions: `PluginContributions.searchData?(): MaybePromise<PluginSearchData>`, called once by the host when the index is built (data only, like `defaultDataFor`), with `PluginSearchData { vocabulary?: SearchVocabulary; behaviours?: SearchBehaviour[]; entries?: SearchEntryContribution[]; keywords?: Record<string /* template, starter or kind id */, string[]>; questions?: Record<string /* starter id */, Record<string /* question id */, SearchQuestionHint>> }`. A built-in plugin returns `import('./search').then((m) => m.SEARCH)`, so its data is its own lazy chunk; a sandboxed plugin answers a new `searchData` sandbox method. If the orchestrator keeps the plan's eager shape instead, the cost is about 0.1 MB per 2,000 lines in the first-paint bundle.
2. `SearchWordGroup` gains `misspellings?: string[]` (beyond the edit limit; shown as corrected).
3. `SearchBehaviour` gains `flows?: string[]` (the clause names the thing itself: "you can ride" is the Mount flow), beside `answers`, `rule` and `beside`.
4. `SearchQuestionHint { role?: 'name' | 'main-colour' | 'main-number'; words?: string[]; after?: string[] /* only after these words: from, of, like */; never?: boolean /* variants */; sameAs?: string /* a question that takes the same word */; appliesWhen?: Record<string, Json[]> /* another question's values */; choiceWords?: Record<string /* choice value */, string[]> }`.
5. `SearchSource` gains `'tile'`: a tile that opens one flow or starter folds into it; a tile with a chooser ("Make a vehicle", "Make armour") is its own result. Showcase cards fold into their example or flow.
6. Across the worker, `SearchHit` is slim: `{ id, score, answers?, behaviour?, why }`; the client keeps the entries by id.
7. Answers read the corrected and vocabulary words (`netherrite`, `pick`), and a number out of range is dropped, not clamped (D7 to amend).
8. The validation function (`validateSearchContributions`) checks limits and that every entry opens one of the plugin's own things; draft limits: built-in plugins 3,000 vocabulary lines, 300 behaviours, 300 entries; third-party 500 lines, 50 behaviours, 50 entries; words at most 64 characters, sentences 200.

**B652 stubs, beyond the plan's list:** `app/src/renderer/src/search/sources/tiles.ts` and `showcases.ts`; `packages/search/src/text/typos.ts` (trigram) and `stem.ts` with the exception list; `app/test/search/golden-queries.json` from `queries-draft.json` (82 queries, with the `needs` lines); in each built-in plugin, `src/search.ts` exporting `SEARCH` (empty) and the `searchData` line in `src/index.ts` (the lazy `import()`).

## Files

- `queries-draft.json`: the 82 queries.
- `results/`: `sq1-corpus.json`; `sq1-sq2-node-*.json`, `sq1-sq2-electron-*.json` (and `-busy`); `sq3-sq4-typos-*.json`; `sq5-baseline-today.json`, `sq5-golden-v0-*.json`, `sq5-golden-v1-*.json` (and `-jar`); `sq6-answers-*.json`; `sq7-preview-cost.json`; `sq8-jar-names.json`; `sq9-sq15-keys-and-aria.json`; `sq10-guide.json`; `sq11-size.json`; `sq12-behaviours.json`; `sq13-sandbox.json`.
- `spike-src/`: the throwaway engine (`text.ts`, `engine.ts`, `vocab.ts`, `layers.ts`), the runs (`golden.ts`, `typos.ts`, `answers.ts`, `bench*.ts`, `try.ts`), the Electron bench (`electron-*`), the keys page (`keys/`), the size chunks (`size-*`) and the Vitest files that ran in `app/test/` (`app-test/`). Run with `REPO=<worktree> B650_OUT=<scratch> node <file>.ts` after `collect.test.ts` has written the corpus; nothing here is built or linted.
