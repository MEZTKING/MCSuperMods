# ADR 0124: Search everything, and make it from the words

## Context

The user asked on 2026-11-22: "Make an elite search bar so that whatever a user types it brings up the closest context or accurate search for what the user wants and can make it." The standing rules apply: take the recommended options, **Everything visible live** ([ADR 0119](0119-live-worldgen-preview.md) D1), vanilla parity, document everything, British English, no emojis, clean room, never bundle Mojang assets.

MSM has seven places where a user types to find something, and each has its own small matcher over one list (facts SF1–SF8 in the fact table below): the command palette (a subsequence score over command titles), the Add element dialog (words as substrings of a template's title, description and category), the Examples gallery (substrings of title, kind, category and tags), the sidebar (id, kind and group), the ThingPicker (word starts of a name or id), and nothing at all for Creator flows, Home's tiles, the Showcase, Rules triggers and steps, settings, the guide and Things to fix. None forgives a misspelling, none knows that "armor" is "armour" or that "xp" is experience, none ranks across lists, and none can turn "a blue sword" into the Weapon flow with the colour and the type already answered. A beginner who knows what they want and not what MSM calls it has only the tiles to read, or the AI helper ([ADR 0041](0041-ai-helper.md)), which needs a key and the network.

What exists to build on: Creator flows are library starters with typed questions ([ADR 0040](0040-wizards-as-parameterised-starters.md), [ADR 0043](0043-creator-guided-flows.md): 62 flows, their questions typed as text, number, yes or no, colour, choice and set); Surprise me ([ADR 0086](0086-surprise-me-random-mod.md)) already answers those questions by program, adds a rule book beside a flow and applies everything as one undo step; the Creator previews a bundle from memory before anything is written (`preview/bundle-source.ts`); the Showcase draws stills and clips ([ADR 0118](0118-showcase-with-live-clips.md)); the user's jar already yields Minecraft's English names (extracted, unread, SF7); the Rules catalogue has a plain sentence for every trigger and step; the Wishlist ([ADR 0053](0053-missing-features-and-the-wishlist.md)) records what MSM could not do.

Options for the engine: (a) the AI helper as the search, which breaks "works offline, no key" and is neither instant nor repeatable; (b) a search library as a dependency, which the no-new-dependency rule forbids and which would know nothing of flows and their answers; (c) our own small engine over data the plugins own. We take (c), with the AI helper as an optional last row.

## Decision

### D1 One search, offline, the same answer every time

One search finds everything a user can make, open, change, learn or fix, from plain or misspelt words in British or American English and Minecraft slang. It runs fully offline and without a key by default, is deterministic (the same words, mod, target and mode give the same list), and sends nothing anywhere. It is matching, not thinking: it always shows what it understood (D8), and what it did not.

### D2 The engine is a package, `@msm/search`

A new workspace package `packages/search/` (`@msm/search`, layer `["@msm/plugin-api"]`, types only), pure TypeScript with no dependency: text handling, the index, the query reader, the ranker, the answer reader. It runs in Node tests and in a Web Worker. It knows nothing of Minecraft: every Minecraft word reaches it as data (D5). The app owns the collectors that turn plugin contributions, the session and the app's own lists into entries (`app/src/renderer/src/search/`).

### D3 The index: three layers, built in a worker, never stored

- **Entries.** Every findable thing is one `SearchEntry`: a stable id, a source, a title, one sentence, extra words, a low-weight body, where it is available (target, mode), an action descriptor (D9) and, for flows, the questions that can be answered from words (D7).
- **Sources (fourteen):** Creator flows and starters; element templates; examples; Showcase cards; kinds and their Studios; the project's own things (elements, Creator sets, pictures and sounds, rule sentences); vanilla ids (blocks, items, mobs, biomes, effects, enchantments, potions, particles, sounds); Rules triggers, steps and conditions; settings; palette commands; guide sections; Things to fix; Home's tiles (folded into their flows); the AI helper row (D12).
- **Layers.** *Static*: plugin contributions and the app's own lists, built once per target after the first paint. *Vanilla*: the ids of the target's registries, named from the `en_us.json` of the user's own jar when the cache is set up, else by words made from the id; built on first need. *Project*: the session's things and problems, kept current by deltas 300 ms after an edit.
- **Where it runs.** A Web Worker in the renderer (`search/worker.ts`, a Vite module worker as the terrain worker is), with a client in which a newer request cancels an older one. The same module runs on the main thread in tests and as the fallback when a worker cannot start.
- **Never stored.** The index is rebuilt at each start and lives in memory only: nothing to migrate, nothing of the jar's names on disk beyond the existing asset cache, nothing in the project.
- **Draft budgets, set by the spike B650:** static and project layers built within 150 ms and the vanilla layer within 250 ms in the worker; at most 12 MB of worker memory with a 5,000-thing mod; first results within 30 ms (60 ms with the vanilla layer) at the 95th centile; a key press to painted results within 100 ms; renderer output at most 0.2 MB in lazy chunks; `app.asar` at most 0.3 MB.

### D4 Matching

In order: lower-case and strip accents; split on anything that is not a letter or digit, and split ids at `:`, `/` and `_` while keeping the whole id as one exact token; fold British and American spellings to one form by rule with an exception list (-our/-or, -ise/-ize, -re/-er, -ll-/-l-, grey/gray, armour/armor, defence/defense); a light stemmer (plurals, -ing, -ed) that never touches a protected word (every vanilla id word and vocabulary headword, so "creeper" stays "creeper"); stop words dropped after the intent words are read; phrases and synonyms from the vocabulary (D5); joined and split words ("sky block", "pick axe"); and typo tolerance for a word the index does not know: one edit for words of four to seven letters, two for eight or more, none for three or fewer, a swap of neighbours counted as one, with a penalty per edit and prefix matching for the word being typed. A corrected word is always shown ("Showing results for creeper").

**Intent words** change what ranks first, never what is found: make, create, add, new, build, want (make: flows, starters, templates, cards); how, why, what is, help, tutorial, can I (learn: guide sections, then the flow that does it); open, find, where, show, edit, rename, delete (open: the mod's own things, Studios, settings); fix, broken, error, not working (fix: Things to fix); play, test, export, install, undo (commands); a bare `namespace:path` (ids). With no intent word, Very easy and Home lean to make, the palette door to commands, everything else is balanced.

### D5 The Minecraft vocabulary is data, owned by the plugins

Each plugin contributes the words of its own area as data (D13): groups of words that mean the same ("sword: blade, katana"), nearer and weaker ones, slang and short forms ("xp, exp: experience", "pick: pickaxe", "tp: teleport", "mobs", "skyblock"), phrases ("sets on fire", "catches fire", "burns": the idea *fire*), colour names with their colours (dye names and gem names, British and American), and extra words on templates, starters, kinds and questions. The library plugin owns the words of flows, starters and examples; each content plugin the words of its kinds and templates; the rules plugin the words of triggers and steps; the app the words of its settings and commands; `@msm/search` owns language only (stop words, spellings, number words and units). A vocabulary line that names a vanilla id is dropped at index time when the target's registries lack the id, and a test checks every such line against both targets, so no version fact lives outside `packages/targets`.

### D6 Ranking

A score is text relevance times a source weight for the query's intent times context. Text relevance is BM25F over fields (title, extra words, ideas reached through the vocabulary, sentence, id, body, in falling weight), with bonuses for an exact title, every word matched, words in order and close together, and penalties per corrected letter and for a prefix-only match. Context: available on the open project's target (an unavailable entry is shown last and greyed with its reason, never hidden); the mode (Very easy leaves out ids, technical kinds and raw templates, which sit under **More**); things of the open mod and kinds it already uses; words absorbed into a flow's answers count as matched (D7); a small boost for results chosen before on this computer (D11). Ties break by source order, title, then id. Duplicates fold: a Home tile, its Creator flow and the same starter are one result; a Showcase card folds into its flow as that result's moving picture.

The list shows up to three **Best matches** across all sources, then sections in the order of their best score (Things you can make, In your mod, From Minecraft, How to, Settings and commands, Things to fix), three rows each with **Show more**. Below a confidence floor the heading reads **Closest things**; with nothing close it offers the Wishlist and, with a key, the AI helper.

*Amended 2026-11-23 (after B671):* a section cut at the 50-row cap that **Show more** cannot lift still lists, after its 50 rows, up to five of the unavailable matches that would fall off (best first, greyed, never a Best match), so the cap is exceeded by at most five rows and only further unavailable ones are counted in its rest (`UNAVAILABLE_BEYOND_CAP` in `packages/search/src/rank/sections.ts`).

### D7 Answers from the words

A flow's questions are answered from the query where the words allow, by type: a colour from a colour name or a hex code (the first colour to the first colour question, as Surprise me does); a choice or set from words that match a choice's label, value or extra words; a number only when a unit or a word of the question's label stands beside it ("5 hearts", "drops 3 to 5"), clamped to the question's range; yes or no from the question's words, with "no" and "without" read as no; the name from quoted text or "called X", else from the describing words and the thing's noun in title case ("Blue Sword"); a vanilla mob, block, item, biome or effect named in the words fills a question that takes one. Every answer must pass the wizard's own check or is dropped; nothing is invented: an answer comes only from a word the user typed, everything else is the flow's default. Understood answers are chips on the result, each removable.

**One thing and what it does.** A clause after "that", "which" or "when" is matched against **behaviour phrases**, data contributed by the plugins: a phrase names flow answers ("glows": the light answer), or one rule from the Rules catalogue with the made thing as its subject ("drops xp": when a player breaks the block, give experience), or one companion flow with its answers ("sets mobs on fire" for a sword: the Enchantment flow for swords with "Set the target on fire", since the Rules catalogue has no such step, fact SF14). The result shows both lines, and making it applies everything as one undo step, as Surprise me does. At most one clause, and one rule or one companion flow from it; a clause that matches nothing is shown as not understood, with the Rule book and the AI helper offered. A behaviour MSM cannot make is a gap for [`docs/COVERAGE-AUDIT.md`](../COVERAGE-AUDIT.md), not something search hides.

### D8 Honest about what it understood

Every query shows a line of chips: what was understood (a colour, a thing, a behaviour), the corrected spelling, and the words it could not place, struck through. The main noun is never dropped silently.

### D9 Every result has one action, and a live picture first

One click or Enter runs the result's main action:

| Result | Main action | Others |
|---|---|---|
| Creator flow | **Make this**: the Creator opens on the flow with the answers filled in and its live preview | **Add to my mod**: made at once with the answers shown, one undo step |
| Starter that is not a flow, example | **Add to my mod** (one undo step); with no mod open, **Start a mod with this** | See the example |
| Template | **Add to my mod**, with a name field in the result | |
| Kind or Studio | **Make a new one** | Show mine |
| A thing of the mod | **Open** | Rename, Find usages, Edit in Creator |
| A vanilla id | **Make something with it**: the flows that take it, already answered | Copy id (Advanced) |
| Rules trigger or step | **Add this rule**: the Rule book opens on a new rule that starts with it | |
| Setting | **Open**: Settings at that line | |
| Command | **Run** | |
| Guide section | **Show me how**: the guide page inside the app | |
| Thing to fix | **Fix it** when there is a one-step fix, else **Show me** | |

**The live rule.** The selected result shows what it will make before it is made: a flow, starter, example or template is built in memory with the understood answers and drawn by the Creator's own preview over `bundlePreviewProject`, 150 ms after the selection or the words change and with a first picture within 250 ms of that, one preview at a time; a Showcase-backed result shows the card's still and plays its clip on request; a thing of the mod shows its own live view; a vanilla id its picture from the user's jar; a rule its sentence as a rule card; a guide section its first paragraph. Settings and commands have nothing to see and are listed as exempt in `docs/LIVE-VIEW-AUDIT.md`. Nothing is written before the action.

### D10 Where the bar lives, and the palette

- **The start surface of every mode:** a large bar at the top of Home in Very easy ("What do you want to make?"), and on the empty editor area and the no-mod screen in Easy and Advanced.
- **The toolbar, in every mode:** a compact field that opens the same panel.
- **Ctrl/Cmd+K** opens it from anywhere; Edit > **Search…** in the menu.
- **One engine, two doors.** The command palette keeps its key (Ctrl/Cmd+Shift+P), its look and its test ids, and becomes the same search opened with the commands scope (`>`). Scopes are chips in every mode (Make, My mod, Minecraft, Help) and prefixes in Advanced (`>` commands, `@` my things, `#` Minecraft ids, `?` how to). The `CommandPalette` component stays for quick picks.
- **One matcher everywhere.** The sidebar filter, the Add element filter, the Examples search and the ThingPicker keep their places and looks and take `@msm/search`'s text matching, so a misspelling or "armor" works in each; the ThingPicker shows Minecraft's own names from the jar.

### D11 Accessibility, wording and no telemetry

- **Accessibility.** The combobox pattern with a grouped listbox and `aria-activedescendant`; every action by keyboard (arrows, Enter, Ctrl/Cmd+Enter for the second action, Tab into the preview's buttons, Escape back to where focus was); a polite live region that says the count and the best match; nothing told by colour alone; reduced motion stops clips and list animation; usable at 200 % zoom and 800 px width (the preview moves below); results never take focus or drop typed letters.
- **Very easy wording.** No ids, no "template", "element", "starter" or "kind". Results read as sentences ("A sword. Blue."); buttons are Make this, Change it first, Add to my mod, Open, Show me how, Fix it.
- **Telemetry: none.** No query, result or click leaves the computer. A short history (the last 50 chosen results and 20 searches) is kept in the app's local preferences behind **Remember my searches**, with **Clear**; it is never in the project, never exported and never sent to the AI helper.

### D12 The AI helper, only when asked

With a key set, the last row is always **Ask the AI helper** with the words (first when nothing is close; never a Best match). It opens the helper in Build mode, or New project with the AI helper when no mod is open, with the words as the message, not sent until the user presses Send. With it go at most five lines of hints: the library ids of the top results and the answers understood, nothing of the project beyond what the helper's tools may already read. The helper gains one read-only tool, `search_library`, over the static layer and vanilla ids (ids only, never the jar's names). Without a key nothing about the helper is shown, but for one quiet line when nothing is close.

### D13 Plugins contribute search data (plugin API 1.23.0)

After the game modes plan's 1.22.0: `PluginContributions.searchVocabulary` (D5), `searchBehaviours` (D7) and `searchEntries` (extra doors to the plugin's own starters, templates, examples, kinds and commands, with answers), and optional `keywords` on `ElementTemplate`, `ProjectStarter` and `ElementKind` and `search` hints on starter questions and choices. All of it is data: no code of a plugin runs in the search. Third-party contributions pass through the sandbox as data, are size-bounded and checked, can point only at the plugin's own things, cannot add stop or intent words, and their results carry the plugin's name.

**Amended at B651 (2026-11-23), after the spike B650 (SQ11, SQ13):** the shape is one lazy `PluginContributions.searchData?(): MaybePromise<PluginSearchData>` holding `vocabulary`, `behaviours`, `entries`, `keywords` (by id) and `questions` (by starter id, then question id), in place of the eager arrays and the `keywords`/`search`/`words` fields on templates, starters, kinds and questions: the built-in plugins are imported eagerly, so only lazy search data keeps the size budgets, and it stays plain data so it passes the sandbox. An entry has no `supports?(target)`; it is available when the thing it opens is. `validateSearchContributions` checks it, with `BUILT_IN_SEARCH_LIMITS` and `THIRD_PARTY_SEARCH_LIMITS`.

### D14 The guide inside the app

Guide sections are found and read without a browser: the guide's Markdown is packaged beside the app (not in the renderer bundle), main builds an index of headings and first sentences on first need and serves a page on request, and a reader dialog shows it with the app's safe Markdown renderer, extended for tables, numbered lists and links between pages.

### D15 A rule that stays: findable

Every later brief that adds a flow, starter, template, example, kind, Studio, Rules trigger or step, setting, command or guide page gives it search words where its title does not carry them, and one query in the fixed set (D16). Review refuses otherwise, as with the live view rule.

### D16 Ranking is tested against a fixed set

A hand-written set of at least 200 queries (the spike drafts the first 80), each with the expected best result or top three and, for flows, the expected answers, in classes: plain, misspelt, American, slang, how to, ids, the mod's own things, settings, commands, one thing and what it does, nonsense. It runs on both targets, with and without jar names, on an empty mod and on `fixtures/sample-mod`. Draft bars, set by the spike: the expected result first for 85 % and in the top three for 95 %, per class and per target; nonsense finds no Best match. Also tested: every flow title with one seeded wrong letter still finds its flow in the top three; the same query gives the same order; an entry unavailable on a target is never first there while an available one scores within a fifth of it; the time budgets on a 5,000-thing mod. Expectations are never regenerated: changing one is a reviewed edit with its reason.

### D17 Order

After Live views 2 closes (B618). The spike and the engine may start earlier, once the game modes plan's plugin API brief (B550, 1.22.0) has merged; the app waves run beside the game modes plan's waves 2 and 3 with one owner per shared file, and end before its flows wave, so those flows arrive with their search words. Detail in the plan's "Order".

## Alternatives considered

- **The AI helper as the search.** Needs a key and the network, costs the user money per search, is not instant and not repeatable. Kept as the optional last row.
- **A search library (Fuse, MiniSearch, FlexSearch, Lunr).** A new dependency, and none reads answers out of a query or knows a flow from a guide page; the matching itself is a few hundred lines.
- **Replacing the palette outright.** Its key, look and test ids are used by 44 e2e specs and by habit; one engine behind two doors gives the gain without the loss.
- **A separate search per surface, improved one by one.** Seven matchers to keep in step, and still no ranking across lists.
- **Storing the index on disk.** Saves a few hundred milliseconds off the main thread at the price of a cache to invalidate and the jar's names in a second place.
- **Vocabulary in the app.** The app would know plugin content, and third-party plugins could not be found by their own words.
- **Embeddings or a local language model.** Tens of megabytes against a 32 MB budget, and not deterministic enough to test against a fixed set.

## Consequences

- One new package, one worker, one plugin API minor (1.23.0), one new guide reader, about 24 briefs (B650–B673, reserves B674–B676); no runtime change, no Script API change, no new dependency, no in-game check.
- The plugins gain search data files that every content brief must keep up (D15).
- `CreatorDialog` gains starting answers for a new set; the Creator's planning gains a make-at-once route shared with Surprise me.
- The palette, the sidebar, the Add element dialog, the Examples gallery and the ThingPicker change matcher, not look; their tests are updated where a misspelling now matches.
- The renderer budget is tight (17.6 of 19 MB, stop line 18.5, shared with Live views 2 to 4): the guide stays out of the renderer, and the lazy loading of the 26.3 Java project generator ([ADR 0123](0123-gzipped-vendored-target-data.md) D4's follow-up) may be needed first.
- Search will show content gaps plainly (a behaviour MSM cannot make); they go to the coverage audit and the plan that owns the area.

## Findings at the close (B673, 2026-11-23)

Reviewed against the merged code of B650–B672 and the two follow-ups "Ask the helper from search" and "Unavailable flows never hidden" (D6's amendment): `packages/search/` (`text/`, `index/`, `rank/`, `slots/`, `compose/`, `query.ts`), `packages/plugin-api/src/search.ts`, each built-in plugin's `src/search.ts` and `src/search/`, `app/src/renderer/src/search/` (sources, `plugin-data.ts`, `vanilla-names.ts`, `worker.ts`, `client.ts`, `host.ts`, `history.ts`, `local-match.ts`, `actions.ts`, `run-action.ts`, `ask-ai.ts`, `SearchPanel.tsx`, `ResultRow.tsx`, `ResultPreview.tsx`, `preview-bundle.ts`, `wording.ts`), `changeset/make-flow.ts`, `studios/rules/add-rule.ts`, `components/settings-catalogue.ts`, `components/GuideDialog.tsx`, `Markdown.tsx`, `app/src/main/guide.ts`, `main/platform/vanilla-names.ts`, the sandbox's `searchData` method, `packages/ai`'s `search_library`, `app/test/search/` (the fixed query set and its runner), `app/e2e/search-path.spec.ts` and `search-keyboard-path.spec.ts`, `docs/guide/search.md` and the evidence in [`docs/reference/spikes/b650/README.md`](../reference/spikes/b650/README.md) and [`docs/reference/search-golden-report.md`](../reference/search-golden-report.md). D1 to D17 hold, with the outcomes below. The close changed only docs and ran no suite: every number here is a brief's own, from its DEVLOG entry of 2026-11-22 or 2026-11-23. **The clean-worktree run of the whole repository was skipped at this close for want of disk**, as at the closes of B618 and B633; the full e2e run of B671 (103 tests, twice) is the last whole app run. Reserves B674 (a sound-alike key; SQ3 said no), B675 (a split index build; SQ1 met its budget) and B676 (no worker; SQ2 said go) did not run.

### Each decision's outcome

| Decision | Outcome |
|---|---|
| D1 Offline and repeatable | Met. No query, result or click leaves the computer: both e2e specs watch the renderer's and main's requests (`watchNetwork` in `app/e2e/search-helpers.ts`) and fail on any; the same words give the same rows in the same order on a fresh build of each target (`golden.test.ts`). |
| D2 The package | Built as decided: `@msm/search` imports only `@msm/plugin-api`. One addition: a `./text` export (B668), so the filter boxes take the text half without the index and ranking. |
| D3 The index | Built: fifteen sources (B650 added `tile`; Showcase cards are `showcases.ts`), three layers plus the guide layer, a Vite module worker with a main-thread host when no worker starts, project deltas 300 ms after an edit, nothing stored. Per target at B660: 62 flows, 12 other starters, 309 templates, 200 examples, 124 kinds, 51 commands, 66 triggers, 61 steps, 25 conditions, 17 numbers, 27 tiles, 15 picks, 13 cards, 81 extra doors (1,063 static entries before the settings and guide layers), vanilla 4,291 on 26.3 and 4,382 on 26.4. Changed in the build: stemming and the vocabulary are applied at query time, never stored in the index, so a vocabulary change never rebuilds a layer (B658). Budgets: see "Measured budgets and bars". |
| D4 Matching | Built (B653): trigram typo candidates, the dictionary-aware stemmer with an exception list, the intent words of D4 plus their -ing forms, `whats`, `guide`, `explain`, `remove`, `crash`, `redo` and the pairs `what is`, `can i`, `not working` (the spike's `pink`, `my`, `turn`, `switch` and `save` were not taken). `no`, `not`, `without`, `on`, `off` and `all` are not stop words. A protected word that is a plain plural of a dictionary word is not protected, so `block` and `blocks` meet (B658). |
| D5 Vocabulary as data | Built: the library's 198 word groups (154 vanilla ids), 67 colour lines and its behaviours, answers and doors (B654); the eleven content plugins' 183 word groups, `keywords` for every kind and template (433 lists), 8 doors and 91 behaviours (B655); B666's additions. Every vanilla id in the data is checked against both targets' registries by each plugin's `test/search.test.ts`. |
| D6 Ranking | Built (B658) with these refinements: an unavailable entry is never a Best match and comes last in its section (stricter than "never first while an available one scores within a fifth"), and since D6's amendment up to five unavailable matches are listed after a section cut at 50 rows, so a flow a target cannot make is never hidden; duplicates fold by action descriptor (a tile, a card and the flow they open); the Custom sword starter cannot fold under the Weapon flow by data, so under the make lean a starter weighs 0.9 against a flow's 1.15, and a flow whose answers took the thing's noun 1.3; the confidence floor is B650's (a score of 3 and half the words read without a correction, one corrected word, or a whole id). B666 tuned seven numbers in `rank/weights.ts`, each with its reason beside it. |
| D7 Answers | Built (B659) with the spike's amendment: answers read the corrected and vocabulary words, a number out of range is dropped and struck through, never clamped; the clash rules of SQ6 (from-questions only after "from" or "of", "like X" only after "like", numbered repeats in order, `sameAs`, `appliesWhen`, then declaration order); a melee damage number implies `custom_damage`. B666: a thing named by an idea or a typed id takes its listed sort, so "custom ore that drops xp" no longer names a mob "Custom Ore". A behaviour fits by `flows`, `answers`, `appliesTo` and the flow's sort; one clause, one rule or one companion flow, made as one undo step (B657's `makeFlow`, which Surprise me now shares). |
| D8 Honest chips | Built (B663): **I understood:**, **Showing results for …**, **Not understood:** with the struck words; removing a chip asks again. |
| D9 Actions and the live picture | Built (B664, B665): every action of the table through `SearchActionHost`, each write one undo step with a label; **Add this rule** through the new `studios/rules/add-rule.ts`; with no mod open the mod's name is asked first. The preview shows a plain tile at once and the picture 150 ms after the selection or answers last changed; building and planning a flow took a median 0.9 ms (slowest the Tank, 84 ms on 26.3), so every flow's first picture starts within 250 ms in tests; the drawn WebGL time per flow was left to the e2e and not reported per flow. "In Build mode" no longer applies (ADR 0125 removed the switch). |
| D10 The doors | Built (B667): Home's **What do you want to make?**, the same bar on the empty editor area and the no-mod screen, the toolbar's **Search or make anything** in every mode, Ctrl/Cmd+K (Monaco keeps its own Ctrl+K chords), Edit > **Search…** showing `CmdOrCtrl+K` with `registerAccelerator: false`, and the palette command **Search everything…**. Changed: the palette door is `CommandPalette` itself ranked by the engine through a `rank` prop (commands scope), not the panel opened with `>`: the palette's test ids and empty order stay exactly as they were. One matcher (B668, `search/local-match.ts`) in the sidebar, Add element, Examples and the ThingPicker, the old exact matches kept first; the ThingPicker shows and matches Minecraft's own names when the jar is set up. |
| D11 Accessibility and privacy | Built: the combobox, grouped listbox, `aria-activedescendant` and a polite status ("N results. Best match: …"), visible group headings hidden from the tree (SQ15), every key of D11 and the focus back where it was (both e2e specs); reduced motion plays no clip. The history is the last 20 searches and 50 chosen results, behind **Remember my searches** and **Clear my searches** in a new Settings section **Search** (B662). A real screen reader on Windows is the user's check. |
| D12 The AI helper | Built (B669 and "Ask the helper from search"): the read-only tool `search_library` (the catalogue now 23 tools; ids only for vanilla, never a jar name; the prompt 103,775 of 104,000 characters, no raise); **Ask the AI helper** opens the helper with the words as an unsent draft and at most five lines of hints (library ids and understood answers, never the project or a jar name), or New project with the AI helper when no mod is open. Changed: without a key the one quiet line shows as soon as words are typed (the row is hidden without a key), not only when nothing is close. |
| D13 Plugin search data | Amended at B651 to one lazy `searchData()` (plugin API 1.23.0). Third-party data (B670) crosses the sandbox as data, is checked whole by `validateSearchContributions` with `THIRD_PARTY_SEARCH_LIMITS` and is kept or left out whole (built-in data is checked per line); fields the API does not define, stop and intent words among them, are left out with a warning; Settings > Plugins says which; a door's sentence ends "From <plugin name>." and a third-party row shows the name. |
| D14 The guide inside the app | Built (B656, B661): the guide's Markdown in `resources/guide/` by `extraResources` (never in `app.asar`), `guide:index` and `guide:page` in main (39 pages and 569 sections at B656, a 124 kB index built in about 45 ms; 40 pages with `search.md`), `GuideDialog` with contents, Back and **Open on the web**; `Markdown.tsx` learned tables, numbered and nested lists, block quotes and links between pages. |
| D15 The findable rule | Kept: in `docs/HANDOFF.md` "Rules for every brief" from this close. Adding it to the root `CLAUDE.md` golden rules waits for the user's word (HANDOFF "Waiting on the user"). |
| D16 The fixed query set | Met: 241 hand-written queries in eleven classes (B666's 240 and B672's "how does search work"), the bars met in all eight configurations; see below. Expectations are changed only with a `reason`; seven queries wait on engine findings (`needs`, run and reported, not counted). |
| D17 Order | Ran beside the game modes plan's waves 2 to 6 and Live views 3; B557's flows landed before B666, so `skyblock` expects the Skyblock flow. The four gaps the spike found were closed during the plan by [ADR 0127](0127-vanilla-gaps-fire-enchanted-unbreakable-frost.md). |

### Measured budgets and bars

| Budget or bar (D3, D16, the plan's "Size") | Draft | Measured |
|---|---|---|
| Static layer built | 150 ms | B650 in an Electron worker 90 to 110 ms; B658 in Node 50 to 104 ms; B660 with the app's collectors 43 to 57 ms |
| Vanilla layer built | 250 ms | B650 49 to 73 ms; B658 61 to 95 ms; B660 62 to 74 ms |
| A 5,000-thing mod | within the budgets | built 40 to 45 ms (B650), 63 to 98 ms (B658); a patch of 10 things 8 to 15 ms; a delta of one thing in the app 25 to 29 ms |
| Worker memory, 5,000 things | 12 MB | 9.4 MB (B650), 10.0 to 10.3 MB with the entries (B658) |
| First results, 95th centile | 30 ms, 60 ms with vanilla | 4 to 9 ms static, 4 to 16 ms with vanilla, 9 to 16 ms with 5,000 things (B658); the worker round trip adds about 0.9 ms median and 4 to 5 ms at the 95th centile (B650, slim hits) |
| Key press to painted results | 100 ms | Not measured as one number; the parts above sum to well under it |
| Renderer output | 0.2 MB, lazy | The named chunks at B667: `SearchPanel` 14.1 kB, `run-action` 16.4 kB, `ResultPreview` 17.9 kB, `GuideDialog` 6.5 kB, `client` 4.4 kB, `sources` 17.5 kB, the main-thread `host` 64.2 kB (0.14 MB); the worker chunk and the plugins' lazy search data were not reported apart. The renderer total went from 18.5 MB (B657) to 19.2 MB (B668) of 21 (stop line 20.5) with Live views 3 landing in the same window, so search's own share is not isolated |
| First paint | nothing but the bar and the client stub | +18.2 kB at B668 (the text half for the four filter boxes, 65 to 68 files), 4.8 MB of the 5.5 MB stop line: accepted at this close |
| `app.asar` | 0.3 MB | The guide is outside it (B656: no `.md` in `app.asar`); 27.2 MB of 32 at B656, not measured since (no `dist:dir` for want of disk) |
| First result right, overall | 85 % | Sample mod 225 of 232 (97.0 %), empty mod 202 of 209 (96.7 %), the same on both targets and with or without the made-up names file |
| Top three, overall | 95 % | 230 (99.1 %) and 207 (99.0 %) |
| Per class | 75 % first, 85 % top three | Every class met; how-to the closest (20 of 26, 76.9 % first); ids, commands and nonsense at 100 % |
| Nonsense | no Best match | None in any configuration (18 queries) |
| Flow titles with one wrong letter | top three | 65 of 67 per target (`tnak` and `soin` the known misses) |
| B650's 82 draft queries | 87.8 % first (the spike's engine) | 78 of 82 (95.1 %) first and 79 top three on the sample mod; today's old matchers 17 and 18 |
| The 302 misspellings | 277 right first | 278 (92.1 %), 4 wrong first (B653) |

### What moved

- **Interfaces:** `PluginContributions.searchData?(): MaybePromise<PluginSearchData>` in place of the eager arrays and fields (D13's amendment); `SearchWordGroup.misspellings`, `SearchBehaviour.flows`, `SearchQuestionHint { role, words, after, never, sameAs, appliesWhen, choiceWords }`; `SearchSource` gained `tile`; across the worker a hit is `SearchHitSlim`; `CreatorDialog` gained `start`; `SettingsDialog` `focusSetting`; `AiController.prefillMessage`; `AiStartDialog` `initialText` and `contextLabel`.
- **The palette** kept its component and gained the engine's order through `rank`; the recent picker uses it without.
- **Surprise me** builds through the shared `changeset/make-flow.ts`; its 200 seeds per target give the same mods.
- **The Settings dialog** has a ninth section, **Search**, and a catalogue of 21 lines checked against its controls.
- **The plan's "Very easy wording"** (the bar, headings, chips, buttons and lines) lives as built in `app/src/renderer/src/search/wording.ts`, tested per mode; two of its lines were not built ("Minecraft's own pig stays as it is" and "I could only use the first part").
- **The guide** gained `search.md`, a data pack section in `getting-started.md`, a how-to under Recipes and a **Search words** section in `plugins.md`.

### Rules that stay

**Findable** (D15): every brief that adds a flow, starter, template, example, kind, Studio, Rules trigger or step, setting, command or guide page gives it search words in its plugin's `src/search.ts` (or the app's settings catalogue or command sentences) where its title does not carry them, and adds at least one query to `app/test/search/golden-queries.json`; review refuses otherwise, as with the live view rule. Also: the fixed query set is written by hand and never regenerated, an expectation changes only with a `reason`; no Minecraft word in `@msm/search` and no version literal outside `packages/targets`; the engine is imported at run time only by `search/host.ts` (and the text half by `local-match.ts`); nothing of a search leaves the computer.

### Open items

Kept in `docs/ROADMAP.md` "Search everything" and `docs/HANDOFF.md` "Open follow-ups":

- **Done after the close (2026-11-23, "Search follow-ups after the close" in the DEVLOG):** the seven `needs` queries left of B666's eight pass on both targets, with and without the names file, and carry no `needs`: an exact id counts on whole ids only (the typed id, and its path only where the path is itself a whole id; `query.ts`), a query that is a title word for word, stop and intent words included, gets the whole-title bonus (`BONUS.wholeTitle` 1.25, the exact title bonus where nothing else was left to compare, and a neutral source weight where the intent was read from a stop word of the title; `rank/signals.ts`), and "how … work" is read as the question, its last `work` never matched (`text/intent.ts`). The misspellings `tnak` (a swap of neighbours looked up directly, still one edit within SL13) and `soin` (every candidate tied with the best on edits and first letter offered, and the correction shown is the one the first result was found by; SQ3's 278 of 302 unchanged) find their flows: 67 of 67 flow titles per target. The Scripted behaviour flow has the sort `item` (`sources/flows.ts`, per flow, as the `scripts` group mixes sorts), and a phrase's behaviour is picked by the closest fit (the flow, its answers, a rule, a companion), so "a wand that teleports you" gets its rule and "a wand that strikes lightning" the flow's Lightning answer. The name answer is made from the words as corrected ("a blue swrod" names "Blue Sword" on the Sword door too). ADR 0127's four have words: the Rules step Set on fire and its behaviours for an item, a block and a mob ("sets mobs on fire" is now one rule, the Enchantment flow keeping "fire aspect"), Never wears out and Starts with an enchantment (the Weapon and Gear set answers, a behaviour, the item kind's words), and the Enchantment flow's boots and Freeze water choice with Frost Walker's words. The seven header comments point at this ADR or their brief. A guide page carries its subject as words, which also fixed "how do I make a fluid".
- **Still open:** "how do rules work" (a how-to, counted) still finds the Triggers section of Blocks and items and the Templates page's level-4 list "Rules" above the Rules page: `trigger` is a same word of the Rules plugin's `rule` idea, and nothing in an entry tells a page from a deep section; the fix needs a heading-depth signal in the guide entries or a vocabulary decision. A pet fox mapping to fish food could not be reproduced on the current engine ("pet fox", "a pet fox", "tame fox" and the rest leave `taming_food` unanswered on the Pet flow; B666's thing-sort fix may have closed it); a test pins it.
- **The panel:** an opened section at the 50-row cap counts a rest that nothing can open; a line such as "Type more words to see the rest" should say so.
- **Plugins:** `session.externalPlugins` returns the plugin objects rather than the facades, so `main.tsx` hands the facades to `App` itself (B667); a third-party vocabulary word that is a stop or intent word is matched as such, though the plugin cannot add one (B670's check leaves out only fields the API does not define).
- **Not run at this close:** the clean-worktree run of the whole repository, `app.asar` (`dist:dir`), and a real screen reader on Windows.

### The spike's answers (SQ1 to SQ16)

The full answers are in [`docs/reference/spikes/b650/README.md`](../reference/spikes/b650/README.md).

| # | Question | Answer |
|---|---|---|
| SQ1 | The corpus and build times | 1,661 static entries per target (1,644 after folding), 5,420 and 5,536 vanilla ids (4,291 and 4,382 entries); built in a worker in 139 to 177 ms all at once; 9.4 MB with 5,000 things. B675 not needed. |
| SQ2 | Query time and the worker | 95th centile 2.4 to 7.3 ms in the worker; the round trip about 0.9 ms median. Worker: go; B676 not needed. |
| SQ3 | Typo methods | Trigrams, deletion neighbourhoods and a BK-tree find the same candidates (277 of 302 right first); trigrams use 0.9 MB against 7.4. A sound-alike key rescues 7 to 8 and breaks 6 to 8: no; B674 not needed. |
| SQ4 | The stemmer | Dictionary-aware with 18 exceptions: 1 harmless merge of 20 known bad ones. |
| SQ5 | Baseline | 82 draft queries; today's matchers 17 first (20.7 %), the spike 72 (87.8 %) after one tuning pass. |
| SQ6 | Answers from label words | Names 53 of 55, colours 50 of 82, choices 166 of 215, numbers 108 of 142, yes or no 84 of 88; 156 clashing words in 26 flows, settled by eight rules. |
| SQ7 | Preview cost | Bundle, plan and overlay under 30 ms for every flow at the spike; the first picture left to B665. |
| SQ8 | The jar's names | `en_us.json` 547 and 562 kB, the wanted keys 228 and 231 kB, read in 14 to 22 ms; no cache schema change. |
| SQ9 | Ctrl/Cmd+K | Monaco stops it in the capture phase and keeps its chords; `shortcutFor` returns `search`; the menu item with `registerAccelerator: false`. The menu path on Windows is the user's check. |
| SQ10 | The guide | 791 kB, 474 sections, a 105 kB index; staged like the runtime jars and packaged with `extraResources`; the Markdown renderer's gaps listed. D14: go. |
| SQ11 | Size | Engine and worker 19.4 kB, 2,000 vocabulary lines 111 kB; the budgets hold only with lazy plugin search data (D13's amendment). |
| SQ12 | Behaviours | 34 clauses: 4 flow answers, 6 the flow itself, 16 one rule, 5 a companion flow, 3 gaps (closed by ADR 0127). |
| SQ13 | The sandbox | 200 lines are 23 kB, cloned in 0.8 ms and checked in 0.2 ms; another plugin's starter refused. |
| SQ14 | Starting answers | `CreatorDialog` `start` (about eight lines); the build, plan and fold loop moved out of Surprise me for both callers. |
| SQ15 | Accessibility tree | The roles read as intended in Playwright; the visible group headings hidden from the tree. A Narrator or NVDA check is the user's. |
| SQ16 | Order effects | `skyblock` waited for B557 (met); the recipes and data pack how-tos for B672 (met); a later Set on fire step changes the fire behaviour (the step came with ADR 0127; the behaviour still points at the Enchantment flow). |

## Fact table (SF1 to SF26)

Moved here from the plan at its close. The facts were read at de72850 on 2026-11-22, when the plan was written; "Since" says what changed by the close.

| # | Fact at de72850 | Source | Since |
|---|---|---|---|
| SF1 | The command palette: a Radix dialog with `fuzzyScore` over a command's title, then its id; Ctrl/Cmd+Shift+P; 51 built-in commands plus the plugins'; reused for quick picks; test ids `command-palette`, `command-palette-input`, `command-<id>` | `components/CommandPalette.tsx`, `commands/built-in-commands.ts`, `shortcuts.ts` | B667: typed words ranked by the engine (`rank`, commands scope), the fuzzy matches after; **Search everything…** last of the built-in commands; test ids unchanged |
| SF2 | Ctrl/Cmd+K bound to nothing; Monaco uses it as a chord prefix | `shortcuts.ts`, `app/src/main/menu.ts` | B667: Ctrl/Cmd+K opens the search outside the editors; Edit > **Search…** |
| SF3 | Add element: every filter word a substring of a template's title, description or category; 297 templates | `components/NewElementDialog.tsx` | B668: the one matcher, exact matches first; 309 templates |
| SF4 | Examples: substrings of title, kind, category or a tag; 200 examples; tags the only keyword field in the API | `components/ExamplesDialog.tsx`, `packages/plugin-api/src/library.ts` | B668: the one matcher; B651: `keywords` by id in `searchData`; 215 examples |
| SF5 | The sidebar: `matchesSearch` on id, kind or group | `components/ElementSidebar.tsx` | B668: the one matcher |
| SF6 | The ThingPicker: word starts of a name or id; vanilla names made from ids | `components/thing-picker/thing-sources.ts` | B668: the one matcher and Minecraft's own names from the jar |
| SF7 | `en_us.json` extracted and unread | `packages/interop/src/minecraft-install/extract.ts` | B656: read by `msm:v1:minecraft:names` |
| SF8 | 26.3's registries: 190 registries, 33,217 ids; about 5,400 of the sorts search shows | `packages/targets/mc-26.3/vendor/mcmeta/registries.json` | Unchanged; 4,291 vanilla entries on 26.3 and 4,382 on 26.4 (B660) |
| SF9 | 74 starters, 62 Creator flows; questions typed `string`, `number`, `boolean`, `colour`, `choice`, `set`, `image`, `audio` | `packages/plugins/library/src/starters/` | 82 starters, 70 flows (the game flows of B557 and later); question hints in `searchData` (B654) |
| SF10 | `CreatorDialog` has no starting answers for a new set; the preview rebuilds 150 ms after an answer | `components/creator/CreatorDialog.tsx`, `preview/bundle-source.ts` | B657: `start: { flowId, values, note? }` |
| SF11 | Surprise me answers flows by program and applies all as one undo step | `surprise/surprise.ts` | B657: through the shared `changeset/make-flow.ts` |
| SF12 | Home: 27 tiles under eight headings; the empty editor area says "Select an element to edit it, or add one with Add element." | `App.tsx`, `components/EditorArea.tsx`, `components/home/tiles.ts` | B667: the bar on Home and on the empty editor area and no-mod screen; tiles fold into their flows in search (B660) |
| SF13 | The Showcase: 13 cards, stills and one live clip | `showcase/` | B660: cards fold into their flows; B665: a card's still and Play in the preview |
| SF14 | The Rules catalogue: a label and sentence per entry; no step sets a mob on fire; the Enchantment flow's "Set the target on fire" for swords | `packages/plugins/rules/src/catalogue/`, `starters/enchantment.ts` | ADR 0127: the step **Set on fire** (`set_on_fire`); 66 triggers, 62 steps, 25 conditions, 17 values |
| SF15 | Things to fix: plain words for about 250 codes, two one-step fixes | `session/plain-problems.ts` | B660: found by search; **Fix it** for `paint-picture` (B667) |
| SF16 | The guide: 38 pages, 474 headings, not in the app; `Markdown.tsx` without tables, numbered lists or links between pages | `docs/guide/`, `components/Markdown.tsx` | B656, B661: read in the app; 40 pages with `search.md` (B672) |
| SF17 | Settings: eight sections, no search, no way to open at a line | `components/SettingsDialog.tsx` | B662: the section **Search**, `focusSetting`, `settings-catalogue.ts` (21 lines) |
| SF18 | The AI helper: no search tool | `packages/ai/src/tools/` | B669: `search_library` (23 tools) |
| SF19 | The Wishlist in `msm.wishlist.json` | `wishlist/wishlist.ts` | Offered by **Nothing close** (B663) |
| SF20 | The terrain worker and its client of lanes | `terrain/worker.ts`, `terrain/client.ts` | The search worker and client follow the pattern (B660) |
| SF21 | `app.asar` 26.2 of 32 MB, renderer 17.6 of 19 MB | root `CLAUDE.md` | `app.asar` 27.2 MB (B656); renderer budget 21 MB with first paint apart (ADR 0126 D4 amended): 19.2 MB and 4.8 MB at B668 |
| SF22 | Plugin API 1.21.0 | `packages/plugin-api/src/version.ts` | 1.23.0 at B651 (search data); 1.26.0 at the close |
| SF23 | No search or fuzzy matching dependency | `app/package.json` | Still none |
| SF24 | Package layers in `tools/check-deps/layers.json` | `tools/check-deps/layers.json` | B652: `"@msm/search": ["@msm/plugin-api"]` |
| SF25 | Third-party contributions cross `plugins/sandbox/protocol.ts` | `app/src/renderer/src/plugins/sandbox/` | B670: the `searchData` method (2 s deadline) |
| SF26 | View preferences in local storage through `store/preferences.ts` | `store/preferences.ts` | B660, B662: the history and **Remember my searches** |

## Limits (SL1 to SL17) and their outcome

Moved here from the plan at its close; `docs/guide/search.md` says them in plain words.

| # | Limit | What users see | Outcome at the close |
|---|---|---|---|
| SL1 | It matches words, it does not think. | The chips say what was understood; unknown words are struck through. | Stands. |
| SL2 | English only, British and American. | Other languages find little. | Stands; an idea in ROADMAP. |
| SL3 | One "that…" clause, at most one rule or one companion flow from it. | The rest of the words shown as not understood. | Stands; the line "I could only use the first part" was not built (the chips say it). |
| SL4 | A rule made by search needs the Fabric mod jar. | The existing note on vanilla pack exports. | Stands. |
| SL5 | Minecraft's own names and pictures need the Minecraft folder. | Names made from ids, the set-up line. | Stands; the ThingPicker follows it too (B668). |
| SL6 | It cannot make what MSM cannot make. | A struck-through chip. | Stands; the line "Minecraft's own pig stays as it is" was not built. The spike's three gaps were closed by ADR 0127. |
| SL7 | Answers come only from typed words. | Defaults for the rest, in the preview. | Stands; a number out of range is dropped and struck (D7's amendment). |
| SL8 | Only the selected result is drawn live; some flows are slow. | A plain tile first, then the picture. | Stands: the plain tile shows for every result first (B665). |
| SL9 | Things of later plans are found when they land. | The closest thing that exists. | Met for the Skyblock flow, sounds' Play and the Creator's Live tab; the findable rule carries it on. |
| SL10 | Third-party words point only at the plugin's own things and carry its name. | "From <name>" on the row. | Stands; all or nothing (B670). |
| SL11 | The history stays on this computer and can be switched off. | **Remember my searches**, **Clear my searches**. | Stands. |
| SL12 | The guide in the app is text; web links open the browser. | As said. | Stands, with **Open on the web**. |
| SL13 | Typos by word length; a misspelling that is itself a word is not corrected. | "Showing results for…" | Stands; `tnak` and `soin` were fixed after the close (a swap looked up directly, still one edit; tied candidates decided by the results). |
| SL14 | The mod is searched by names, ids, kinds and rule sentences, not inside functions and scripts. | Found by what a thing is called. | Stands; find in files is an idea. |
| SL15 | On a very large mod the first search may be late. | A short wait. | Not seen: a 5,000-thing mod builds in under 0.1 s (B658). |
| SL16 | Settings and commands have no live picture. | One sentence on what they do. | Stands; exempt in `docs/LIVE-VIEW-AUDIT.md`. |
| SL17 | Inside the code editors Ctrl+K belongs to the editor. | The toolbar field, or Escape first. | Stands as decided by B667 from SQ9. |

## Status

Accepted with findings (B673, 2026-11-23; briefs B650–B672 and the follow-ups "Ask the helper from search" and "Unavailable flows never hidden"; reserves B674–B676 not run, as SQ1, SQ2 and SQ3 said). D6 amended after B671, D13 at B651, D7 by the spike. The plan `docs/PLAN-search.md` is deleted; its fact table SF1–SF26, limits SL1–SL17 and the spike's answers SQ1–SQ16 are above. Decided by the orchestrator under the user's rule "take the recommended options" and open to the user's veto, as vetoable defaults:

- our own engine in a package, with no AI and no network by default (D1, D2), in a worker with a main-thread fallback and no index on disk (D3);
- trigram typo matching with one wrong letter at four to seven letters, two from eight, none at three or fewer, and no sound-alike key (D4);
- the vocabulary owned by the plugins as lazy data, and third-party data kept or left out whole (D5, D13);
- up to three Best matches, then the six sections in the order of their best score; an unavailable result greyed, last and never a Best match, with up to five listed past a section's 50-row cap (D6);
- answers only from typed words, a number out of range dropped rather than clamped, one "that…" clause making at most one rule or one companion flow (D7);
- **Make this** opening the Creator with the answers, and **Add to my mod** as the second action (D9);
- the bar on every start surface and in the toolbar, Ctrl/Cmd+K and Edit > Search…, and the palette kept as its own component ranked by the same engine (D10);
- a local history of 20 searches and 50 chosen results, on by default behind **Remember my searches**, and no telemetry (D11);
- **Ask the AI helper** only with a key, prefilled and never sent by itself, with the quiet line shown without a key once words are typed (D12);
- the guide read inside the app from files beside it (D14);
- the findable rule for every later brief in `docs/HANDOFF.md`, and in the root `CLAUDE.md` golden rules only if the user agrees (D15);
- the bars: 85 % first and 95 % in the top three overall, 75 % and 85 % per class, 100 % for ids, commands and nonsense (D16);
- the 18.2 kB the filter boxes added to the first paint (the plan said nothing but the bar and the client's stub).

**Open item decided (2026-11-23):** "how do rules work" is closed by a heading-depth signal on guide entries, so a page's own title outranks a deep sub-heading (brief B704 of `docs/PLAN-one-mode-rest.md`).
