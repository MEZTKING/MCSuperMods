# ADR 0124: Search everything, and make it from the words

## Context

The user asked on 2026-11-22: "Make an elite search bar so that whatever a user types it brings up the closest context or accurate search for what the user wants and can make it." The standing rules apply: take the recommended options, **Everything visible live** ([ADR 0119](0119-live-worldgen-preview.md) D1), vanilla parity, document everything, British English, no emojis, clean room, never bundle Mojang assets.

MSM has seven places where a user types to find something, and each has its own small matcher over one list (fact table SF1–SF8 in [`docs/PLAN-search.md`](../PLAN-search.md)): the command palette (a subsequence score over command titles), the Add element dialog (words as substrings of a template's title, description and category), the Examples gallery (substrings of title, kind, category and tags), the sidebar (id, kind and group), the ThingPicker (word starts of a name or id), and nothing at all for Creator flows, Home's tiles, the Showcase, Rules triggers and steps, settings, the guide and Things to fix. None forgives a misspelling, none knows that "armor" is "armour" or that "xp" is experience, none ranks across lists, and none can turn "a blue sword" into the Weapon flow with the colour and the type already answered. A beginner who knows what they want and not what MSM calls it has only the tiles to read, or the AI helper ([ADR 0041](0041-ai-helper.md)), which needs a key and the network.

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

## Status

Proposed (2026-11-22). The working plan is [`docs/PLAN-search.md`](../PLAN-search.md) (B650–B673, reserves B674–B676; fact table SF1–SF26, spike questions SQ1–SQ16, limits SL1–SL17); nothing after its wave 0 starts before the spike B650 has reported. Decided by the orchestrator under the user's rule "take the recommended options" and open to the user's veto: our own engine and no AI by default (D1, D2); a worker, and no index on disk (D3); the typo limits (D4); vocabulary owned by the plugins (D5); the six sections and three Best matches (D6); answers only from typed words, and one behaviour clause making at most one rule or one companion flow (D7); **Make this** opening the Creator with **Add to my mod** as the second action (D9); the bar on every start surface and in the toolbar, Ctrl/Cmd+K, and the palette kept as a second door to the same engine (D10); a local, optional history and no telemetry at all (D11); the AI row last, prefilled and not sent by itself (D12); third-party search data limited to the plugin's own things (D13); the guide read inside the app (D14); the findable rule for every later brief (D15); the 85 % and 95 % bars (D16); the order (D17).
