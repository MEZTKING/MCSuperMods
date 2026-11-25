# ADR 0125: The AI helper, made clear

## Context

The user asked on 2026-11-22: "fix the ai helper so its not confusing and is absolutely perfect". The helper ([ADR 0041](0041-ai-helper.md), shipped in 0.7.0) has grown by a paragraph of instructions with every batch since, while its panel is still the one of 0.7.0, built before Very easy mode ([ADR 0083](0083-very-easy-mode.md)), before the drawn art ([ADR 0092](0092-minecraft-style-art.md)) and before the rule "Everything visible live" ([ADR 0119](0119-live-worldgen-preview.md) D1).

The helper was read whole and walked in the built app as a new install in Very easy with a scripted model (the working plan `docs/PLAN-ai-helper-2.md`, deleted at the close B693; its findings F1–F21 and their outcome are [below](#the-plans-findings-f1-to-f21-and-their-outcome)). In short:

- The panel never says what is happening or whose turn it is. Nothing moves between Send and the first word; a plan that needs the user's answer can sit above the visible part of the panel while the screen says "The helper is still working"; the newest answer lands above the list of waiting changes and out of view.
- The review lists files with ids, kinds and JSON differences, in every mode. One sword is six rows; its picture is behind a closed disclosure headed "Placeholder textures". Nothing is seen before Apply, and nothing shows what was made after it.
- Chat and Build are a choice the user cannot make well: both take the same ask, Chat sends big asks away, Build forces a plan before a one-line change, and switching in the middle of a conversation changes the system prompt and so discards the cached conversation.
- Without a key the user is sent to the top of a long Settings dialog whose AI section is below the fold, with no word on where a key comes from; a wrong key is accepted silently.
- The system prompt, 90,470 characters, contradicts the app in four places (boats, the `block.place` script event, brewing, commands in Try it), knows nothing of the mode the user works in or of the app's own places (Home, My things, Things to fix, Share my mod), and is pinned to the code by tests only for the paragraphs written since Rules.
- Cost is said wrongly or not at all: the fixed part of every request is about 28,000 tokens (estimated), which costs about 14 US cents to cache on the default model before any answer and again after every pause of five minutes; the guide says "a few cents".
- Failures show raw text and offer nothing to do; the commonest failure of a new account, no credit, has no words at all.

Facts used (the claude-api reference of the session, read 2026-11-22; each to be verified at implementation): a request's cached prefix is tools, then system, then messages, so a change of the system text or of the top-level effort invalidates the cached conversation; cache writes cost 1.25 times the input price for five minutes and 2 times for one hour, and a pause of five to sixty minutes between messages is where the one-hour lifetime pays; Claude Opus 5.5 costs $4 and $20 per million tokens with cache reads at $0.20, Claude Sonnet 5.5 $2 and $10 with cache reads at $0.10, Claude Haiku 5.5 $0.10 and $0.50 up to 100,000 prompt tokens; the API's error types include `billing_error` (402) and `overloaded_error` (529).

## Decision

**D1. One state line, and the newest thing in view.** A line above the message box always says in a few words what is happening and whose turn it is: thinking (with seconds), looking at the mod, making (with a count), checking, the user's turn for a plan or a step, ready, stopped or failed, with at most one button. The plan is drawn in the conversation where it was proposed. The waiting changes sit in a tray fixed between the conversation and the message box. The conversation scrolls to its newest entry unless the user has scrolled up. The panel never says the helper is working while it waits for the user.

**D2. No Chat or Build switch.** There is one system prompt. It tells the model to answer or propose directly for a small ask and to call `propose_plan` first for a whole mod or more than three main things. The protocol keeps `mode` as the size of a run (`chat` small, `build` big), which now chooses only the effort and the starting limits; the app sets it from where the user started (New project with the AI helper and "Make a whole mod" start big), never the user. When the user accepts a plan in a small run, the run's limits rise to the build limits. A message typed while a plan or a step waits answers it. This amends ADR 0041 D6.

**D3. See it before it is added.** The review opens on what will be made: the **See it** pane of [ADR 0120](0120-live-views-data.md) D7 (brief B615, which keeps its files), then one card per thing with its picture, its name and what it is. Supporting files (models, language, recipes, loot, the mod settings, pictures) are counted behind their thing. Very easy shows only the things, Easy folds the files under **Files behind this**, Advanced lists them with **Before and after** as today. Problems on a card use the plain words of Very easy's Things to fix.

**D4. After adding.** The notice names what was added and offers **Show me** and **Undo**. It follows the command stack: after Undo it says so and offers **Put back**. A plan line is ticked only when the changes or the project hold its element. A decided plan closes to one line when its run ends.

**D5. Set-up in one place.** One card with three steps (get a key, with a button that opens Anthropic's site; paste it; **Save and check**, which tests the key at once) is shown in the panel, in New project with the AI helper (which keeps what was typed) and as the head of Settings' section. Every **Open Settings** of the helper lands on that section. The key still travels only from the field to main through `ai:setKey`, and main alone uses it (ADR 0041 D1); there is no new channel and no new credential source.

**D6. The helper knows its audience and the app.** The context sent with each message gains the mode, the mod's name and the open thing. The prompt gains a part on how to speak (display names, no ids, no kind ids and no JSON in Very easy and Easy; buttons by their labels; "proposed", never "the changeset") and a map of the app's places and buttons.

**D7. The prompt is kept true by tests.** The prompt is one file per topic under `packages/ai/src/prompt/`, so each plan's "AI words" brief owns one file. Every count, id, kind, flow, parameter, template and label the prompt names is an exported constant, and a test in the app checks each against the code on both targets (the plugin registry, the library, the Script API's JSON, the target facts, the components' labels); the Script API check also runs the other way, so an event no paragraph names fails. Every "not available" sentence is an entry of a list with a probe that fails when the thing exists. The prompt has a size budget of 96,000 characters, raised only with a line in this ADR. Raised to 98,000 by B617 (2026-11-23): the data live views topic (`live-views.ts`, 2,081 characters) took the prompt from 95,918 to 98,000, confirmed by the main session, 2026-11-25 at review. Confirmed by the orchestrator. Raised to 99,000 at the B553 merge (2026-11-23): Rules 3's 25 catalogue ids for games (the prompt names every catalogue id) took it to 98,324; the search plan's AI words (B669, B672) need their own line. Raised to 102,000 by B561 (2026-11-23): the games topic (`games.ts`, 3,463 characters: the games kinds, the game flows, Play my game, maps, builds from the game, Try it's games grounds and the limits M1 to M16 in plain words) took the prompt from 98,531 to 101,994, confirmed by the main session, 2026-11-25 at review. Confirmed by the orchestrator at the game modes close (B562). Raised to 103,000 at the merge of the Try it commands (2026-11-23): naming `advancement`, `spawnpoint` and `team` in the Try it commands list took the prompt to 102,025. Confirmed at B562. Raised to 104,000 by B632 (2026-11-23): the looks and sounds topic (`looks.ts`, 1,630 characters with its line break: the kinds with a look or a Play button, the labels and the limits 3L1 to 3L12 in plain words) took the prompt from 102,025 to 103,655, confirmed by the main session, 2026-11-25 at review. Confirmed by the orchestrator at merge. The budget stood at 104,000 at the close (B693); raised to 105,000 by B825 (2026-11-25): the topic of moving to a newer Minecraft (`upgrade.ts`, 906 characters with its line break: the notice, the report's five main parts, the move, After moving, moving back and the rule that the helper reads a move through the read-only tool `upgrade_report` and never states a change in Minecraft the report does not list, ADR 0136 D15) took the prompt from 103,995 to 104,901, confirmed by the main session, 2026-11-25 at review; how later plans add words is under [The prompt's budget](#the-prompts-budget-96000-to-104000).

**D8. Cost in plain numbers.** A typical cost (a first question, a follow-up) is worked out from the measured size of the prompt and tools and the price table, and shown in the set-up card and the guide; no cost is typed by hand. The running cost is one sentence; tokens and requests are for Advanced. The system block is cached for an hour, the conversation for five minutes. The price table is corrected (Sonnet 5.5's cache reads, Haiku 5.5's higher tier, the one-hour write).

**D9. Every failure is a sentence with one thing to do.** The `done` event carries the error class. A rejected key, a key without access, no credit, too many requests, a busy service, no connection, a refusal, a cut-off answer, a conversation too long and a limit each have a plain sentence and one button (**Check my key**, **Try again**, **Keep going**, **New chat**).

**D10. Run limits leave the beginner's panel.** The default limits per run size are edited in Settings, in Advanced (as ADR 0041 D7 said and the app never did); the **Run limits** popover is shown only in Advanced. A run that stops at a limit says "It paused so the cost stays small." and **Keep going** starts the next run, since limits count from zero in every run.

**D11. Explain everywhere.** Things to fix rows in Very easy get **Ask the helper**. In Very easy and Easy the attached context is labelled with the thing's name and the plain problem; the exact text sent stays one click away, so the user still sees everything that leaves the machine.

**D12. The scripted model can wait and fail.** A scripted turn may have a delay or be an error of a given class, so the waiting and failing states have component and e2e tests with no key and no network.

**D13. One wording table.** Every string of the helper is data in one file, keyed by state and mode. The modes share one vocabulary and differ in detail shown; the few words that differ are in the plan's table (**Add to my mod** against **Apply**, **Throw away** against **Discard**). A test finds no id and none of a list of forbidden words in any Very easy string, and the rendered Very easy panel is swept the same way through every state. "Placeholder" is no longer said of the drawn pictures anywhere.

**D14. Not decided here.** Saved conversations, a base URL, a picture tool (ADR 0093 D9), the `search_library` tool ([ADR 0124](0124-search-everything.md) D12), compaction, and moving the prompt's topics behind a read tool (reserve B695, only after the real model has been measured).

## Alternatives considered

- **Keep the two modes and rename them** ("Ask or change", "Make a lot"). Less change, but the user still has to choose before asking, Build still forces a plan for small changes, and switching still discards the cache. Kept as the fallback of D2.
- **Put the helper's topics behind a read tool now**, cutting the fixed part to under 8,000 tokens. It would cut the cost of a first question by about two thirds, but nothing in this project can test whether the real model then reads the right topic before it writes; the one-hour cache gets most of the saving with no change of behaviour.
- **A separate "beginner helper" for Very easy.** Two front ends to keep true. One panel that shows less in Very easy is the same code with one preference read.
- **Fold B615 into this plan.** B615 is in flight and its registry work belongs to Live views 2; this plan states what its pane must offer and builds on it.
- **Open Settings for the key, as now, only scrolled to the section.** Better than today, but the user still leaves the place they were in and loses what they typed; the card in place costs one component used three times.

## Consequences

- ADR 0041 is amended: D6 (modes), D7 (where the default limits are edited, the limit message) and D8 (the panel's layout). Its D1 to D5 and D9 stand; the key rule is untouched.
- The system prompt's bytes and the tool catalogue's pinned hash change (B682), once.
- The guide page `ai-helper.md` is rewritten to the new screens; e2e `ai-path` keeps its assertions through Advanced and gains a sibling `ai-clarity-path`.
- Every later brief that tells the helper about a feature adds a topic file and a truth test of its own; it no longer appends to one file.
- A first question in a session costs more with the one-hour cache (an estimated 22 cents instead of 14 on Opus 5.5) and every later one in the hour far less; the cost sentence says the real figure.
- The real model's behaviour under the single prompt is unseen until the user runs the check list (B692) or the self-check (reserve B694).


## Findings at the close (B693, 2026-11-23)

Reviewed against the merged code of B680–B692 and the later topic briefs (B617, the B553 merge, B561, the Try it commands, B632): `packages/ai/src/prompt/` (26 topic files and `index.ts`), `models.ts`, `loop.ts`, `errors.ts`, `scripted-client.ts`; `app/src/renderer/src/components/ai/` (`ai-status.ts`, `ai-words.ts`, `ai-setup-words.ts`, `proposal-things.ts`, `ai-limits-model.ts`, `AiPanel.tsx`, `AiStatusLine.tsx`, `AiTranscript.tsx`, `AiPlanView.tsx`, `AiChangesetReview.tsx`, `AiProposalCards.tsx`, `AiSeeIt.tsx`, `AiKeySetup.tsx`, `AiKeyMissing.tsx`, `AiSettingsSection.tsx`, `AiUsageLine.tsx`, `AiLimitsPopover.tsx`, `ai-controller.ts`), `app/src/renderer/src/ai/` (`schema-summary.ts`, `context-blocks.ts`, `project-context.ts`, `tool-executor.ts`), the truth tests `app/test/ai-prompt-truth.test.ts` with its siblings `.live-views`, `.games` and `.looks`, and the e2e `ai-clarity-path` (five walks) beside `ai-path`. The real model has still not been run by any test (Risks below; B692's check list is with the user).

### Each decision's outcome

- **D1 Done** (B684, B685, B690). `conversationStatus` is total over 2,160 combinations and never says working while a plan or step waits; the state line ticks every 250 ms (`STATUS_TICK_MS`, found by the e2e walk: a once-a-second tick left "Thinking… (0 s)" for almost two seconds); the e2e measured "Thinking…" 10 to 28 ms after Send. The conversation follows its newest entry until the user scrolls up (**New below**); the tray sits between the conversation and the box. The primary buttons first drew white words on the panel colour (Button's `bg-panel` later in the built CSS); fixed after B690 with Tailwind's important modifier in `PRIMARY_BUTTON_CLASS` and `PRIMARY_CLASS`.
- **D2 Done** (B680, B682, B684, B689). One prompt (`systemPrompt()` ignores its argument); the run size comes from the caller (`send(…, { size })`), Home's tile, the example "whole mod" ask and New project with the AI helper start big; an accepted plan raises the limits (`raisedLimits`) and keeps the effort, so the cache holds. `PLAN_FIRST_ABOVE` is 3. Left over: the deprecated `setMode` and `conversation.plan` mirror in `ai-store.ts` and `ai-controller.ts`, and `explainProblem` still calls `setMode('chat')` (harmless: it sets the default size of the next run).
- **D3 Done** (B615, B688). See it first, then one card per thing (a Creator set is one card with its parts named, as on My things: the ruby tools mod reads as five things, not seven), **Keep** per thing, **Files behind this** in Easy, the file list with **Before and after** only in Advanced; problems through `plainProblem`.
- **D4 Done** (B684, B686, B689). The notice names the things; **Show me** opens the thing's Studio (in Very easy the Creator for a Creator set; several things open My things); **Undo** and **Put back** go through the session's stack and are refused unless the helper's Apply is on top; ticks only when the changes or the project hold the element; a decided plan closes to one line.
- **D5 Done** (B687). One card (`AiKeySetup.tsx`) in the panel, the start dialog and Settings, **Open Anthropic's site** to `https://platform.claude.com/settings/keys` (checked 2026-11-22), **Save and check** through the existing `ai:setKey` and `ai:testKey`; `SettingsDialog` `focus: 'ai'` lands on the section. No new channel. Under xvfb the key field is disabled (no encryption on Linux), so Save and check is proved by component tests and the user's check list only.
- **D6 Done** (B681, B682, B683, B684). The context's `View:`, `Mod:` and `Open:` lines; topic files `speaking.ts` and `app-map.ts` with `APP_MAP_LABELS` and `APP_MAP_TILES` pinned to the components.
- **D7 Done** (B681, B683, then each topic brief). 26 topic files; the truth test pins every constant to the code with mutation cases, and three sibling truth tests (live views, games, looks) follow the rule. B683 found three more false sentences (Try it's `run_function`, the particle count, a mob flow preset). The budget grew from 96,000 to 104,000 (below).
- **D8 Done, with an estimate** (B680, B686, B687, B691). `typicalCost` from `PROMPT_PREFIX_CHARS` (126,090 at the close: the prompt and the tool definitions, held within 5 % by `models.test.ts`) and the price table read on 2026-11-22; at the close it computes, on Opus 5.5, about **$0.29** for a first question and **$0.05** for a follow-up within the hour (Sonnet 5.5 $0.15 and $0.02; Haiku 5.5 under a cent). The figure grows with the prompt and is never typed: the set-up card and Settings' Model list print it, and the guide now says so. `CHARS_PER_TOKEN` is still the assumed 4; the pricing page says the newer tokenizer makes about 30 % more tokens, so the real first question may cost about a third more (B692 step 2 or B694 measures it). `SYSTEM_CACHE_TTL = '1h'` in `loop.ts`; the price table corrected (Sonnet 5.5 cache reads $0.10, Haiku 5.5's tier over 100,000 prompt tokens, one-hour writes at twice the input price).
- **D9 Done** (B680, B684, B685). `classifyModelClientError` finds billing and overloaded from the status and the error type (the SDK has no class for 402 and calls 529 `InternalServerError`); `done` carries `errorClass` and `limit`; each failure has a sentence and one button, and failure notices in the transcript carry none (the state line does).
- **D10 Done** (B680, B686, B687). Default limits in Settings under Advanced with main's bounds and the worst-case cost of a stopped run (about $3.86 for a small ask and $37.20 for a whole build on Opus 5.5 at the defaults, an estimate); the popover only in Advanced; "It paused so the cost stays small." with **Keep going**.
- **D11 Done** (B689, B690). **Ask the helper** on every Things to fix row in Very easy; the chip "About: …" in Very easy and Easy, the block folded under **See exactly what is sent** (and **See exactly what was sent** in the transcript); Advanced keeps the code and id with the block shown.
- **D12 Done** (B680). Scripted turns take `delayMs` and `error`; e2e scripts `clarity-sword`, `clarity-plan` and `clarity-failures`.
- **D13 Done, in four files rather than one.** `ai-words.ts` holds the panel's table; B687's `ai-setup-words.ts`, B688's `CARD_WORDS` in `proposal-things.ts` and B686's `PLAN_VIEW_WORDS` and `LIMITS_WORDS` in their components hold the rest, because each brief owned only its files. Every one is swept for ids and `VERY_EASY_FORBIDDEN` by a test, and the rendered Very easy panel is swept through every state in `ai-plain-words.test.tsx` and the e2e. Moving them into one file is a tidy-up, not a fix.
- **D14 Unchanged.** Saved conversations, a base URL, a picture tool, `search_library` (the search plan's B669), compaction and topics behind a read tool (B695) remain undecided.

### Open items

- See it names things by the element's own name, not the proposal's language file ("Ruby sword" where the cards say "Ruby Sword"), and its removed line shows a rename's two ids in every mode, Very easy included (`AiSeeIt.tsx`, from B688; also an ADR 0120 follow-up).
- Show me in Very easy lands on the Item Studio, whose Notes, Model and Creative tab show ids (the Studio's Very easy view, not the helper's; from B690).
- The deprecated `setMode` and `conversation.plan` (D2 above); the D13 words in four files.
- Nothing in the panel says that a chat and its waiting changes are gone when MCSuperMods closes; the guide says so (F19; reserve B696 would keep the changes).
- `CHARS_PER_TOKEN` unverified (D8); the worst-case limits' `TOOL_ANSWER_TOKENS_PER_OUTPUT` is an assumption (B687).
- Two scripted texts in `app/test/ai-scenario.test.ts` still say "placeholders" (test data, never shown); internal names (`PLACEHOLDER_PATTERN_NAMES`) keep the word.
- The real model under the single prompt: B692's check list on Windows, or the reserve B694.

### The prompt's budget (96,000 to 104,000)

Set at 96,000 characters by B682 and B683 (the prompt then 95,918). Each raise has its line in D7:

| Step | By | Reason | Prompt after |
|---|---|---|---|
| 96,000 to 98,000 | B617 (confirmed at B618) | the data live views topic `live-views.ts`, 2,081 characters | 98,000 |
| to 99,000 | the B553 merge | Rules 3's 25 catalogue ids for games (the prompt names every catalogue id) | 98,324 |
| to 102,000 | B561 (confirmed at B562) | the games topic `games.ts`, 3,463 characters | 101,994 |
| to 103,000 | Try it's `team`, `spawnpoint`, `advancement` (confirmed at B562) | three command names in the Try it commands list | 102,025 |
| to 104,000 | B632 (confirmed at merge) | the looks and sounds topic `looks.ts`, 1,630 characters | 103,655 |
| to 105,000 | B825 (confirmed by the main session, 2026-11-25) | the moving-to-a-newer-Minecraft topic `upgrade.ts`, 906 characters (ADR 0136 D15) | 104,901 |

Eight thousand characters (8 %) in one day, all of it true words pinned by tests; the fixed part of a request rose from 118,324 to 126,090 characters (`PROMPT_PREFIX_CHARS`), about 2,000 tokens, which moved the typical first question on Opus 5.5 from about $0.27 to $0.29. 345 characters of room are left.

**Recommendation for later plans (a vetoable default).** Keep the rule that each topic brings its own raise line, with the topic's size, the prompt before and after, and the orchestrator's confirmation at review, so a raise is never silent. Add a ceiling: the next raise that would take the budget past **108,000** is preceded by a **trim pass** (one Sonnet or Opus brief over `packages/ai/src/prompt/`: lists said twice across topics, examples the truth tests no longer need, long "not available" wording), which brings the prompt back under 100,000 with every truth test green and the hashes moved once. The search plan's AI words (B669's tool description, B672's `search.ts`) take the next raise line under this rule. The lasting answer to the size is topics behind a read tool (reserve B695), only after the real model has been measured (B694).

## The plan's findings (F1 to F21) and their outcome

Each finding named the file and line at 828fec8, or the walk's screen and words; the fuller text was in the deleted plan (git history before B693).

| Finding | Outcome |
|---|---|
| **F1** The newest answer is hidden (it landed above the waiting changes, out of view). | Fixed (D1; B685): the conversation follows its newest entry, the tray is fixed below it; e2e walk 2 asserts the answer's box inside the conversation's. |
| **F2** A plan waits silently, off-screen, while the screen says the helper is still working; typing "go" did nothing. | Fixed (D1, D2; B684, B685, B686): the plan in the conversation, "Your turn: choose what to do with the plan.", the box usable and "go" building it; e2e walk 3. |
| **F3** No sign of work between Send and the first word. | Fixed (D1; B684, B685, B690): "Thinking… (n s)" within 28 ms in the e2e. |
| **F4** The review shows files, not things, and nothing is seen before Apply. | Fixed (D3; B615, B688): See it, then cards with pictures; files by mode. Open: See it's names and the rename line (above). |
| **F5** The first open with no key is a dead end; a wrong key is accepted silently; the start dialog loses what was typed. | Fixed (D5; B687): the three-step card in three hosts, Save and check, Settings landing on the section, the typed description kept. |
| **F6** After Apply nothing shows what was made; the notice outlives Undo; the plan is ticked on the model's word. | Fixed (D4; B684, B686, B689): Show me, Undo, Put back, honest ticks, the closed plan. Open: Show me's Studio in Very easy shows ids. |
| **F7** Chat or Build is a choice the user cannot make well, and switching discards the cache. | Fixed (D2; B680, B682, B685, B689). Open: the deprecated `setMode`. |
| **F8** The prompt contradicts the app (boats, `block.place`, brewing, commands in Try it). | Fixed (B682); B683 found and fixed three more. |
| **F9** The helper does not know who it is talking to or what the app looks like. | Fixed (D6; B681, B682, B683, B684). |
| **F10** Jargon in every mode (limits, token lines, tool lines, raw refusals). | Fixed (D13; B684, B685, B686). |
| **F11** The limit message and the limits' home are wrong. | Fixed (D10; B680, B686, B687). |
| **F12** Cost is silent or misleading; a five-minute cache; Sonnet's cache price wrong; Haiku's tier missing. | Fixed (D8; B680, B686, B687, B691): derived figures, the one-hour cache, the price table. Open: `CHARS_PER_TOKEN`. |
| **F13** Failures are raw and offer nothing to do; no words for no credit or a busy service. | Fixed (D9; B680, B684, B685); e2e walk 4 through 401, 402, 529, a lost connection and a limit. |
| **F14** Very easy has no Explain. | Fixed (D11; B689): **Ask the helper** on Things to fix. |
| **F15** The review's problems are raw. | Fixed (D3; B688): Things to fix's plain words. |
| **F16** New project with the AI helper asks for a folder in Very easy. | Fixed (B687): the mod's name only. |
| **F17** Stale "placeholder" words in the review, the plan, the tools and the guide. | Fixed where a user reads them (B682, B686, B688, B691); test data and internal names keep the word. |
| **F18** The privacy text is one long sentence of jargon. | Fixed (D5; B687): "What is sent" as two short lists. |
| **F19** New conversation is an icon without a word, and nothing says a chat is forgotten on close. | Partly: **New chat** has its word (B685) and the guide says chats are not saved (B691); the panel does not (open; B696). |
| **F20** Explain's chip reads a problem code and an id with raw Markdown and JSON. | Fixed (D11; B689, B690). |
| **F21** Nothing keeps the prompt true; every batch appends to one 798-line file. | Fixed (D7; B681, B683): topic files and truth tests, followed by B617, B561 and B632. |

## Status

**Accepted with findings (2026-11-23, close B693; briefs B680–B692 with the later topic briefs B617, B561, B632, the B553 merge and the Try it commands; reserves B694–B696 not run, only on the user's word).** The working plan `docs/PLAN-ai-helper-2.md` is deleted; its findings and their outcome are above. Amends [ADR 0041](0041-ai-helper.md) D6, D7 and D8. Decided by the orchestrator under the user's rule "take the recommended options" and open to the user's veto, as vetoable defaults:

- no Chat or Build switch, with limits that rise when a plan is accepted (D2; fallback: the switch kept and renamed);
- a typed "go", "yes" or "ok" building the whole plan, any other text while a plan waits being a change to it (D2), and asks of more than three main things planned first (`PLAN_FIRST_ABOVE`);
- the review as things, with files hidden in Very easy and folded in Easy, and a Creator set as one card (D3);
- **Add to my mod** and **Throw away** in Very easy and Easy, **Apply** and **Discard** in Advanced (D13);
- Show me in Very easy reopening a Creator set in the Creator (D4);
- **Save and check** spending one tiny request on every saved key, and a key that fails the check kept (D5);
- the one-hour cache for the system block (D8; one constant, `SYSTEM_CACHE_TTL` in `loop.ts`);
- the typical question assumed at 2,000 tokens in and 1,500 out at four characters a token (D8);
- **Run limits** only in Advanced, the defaults in Settings (D10);
- Thinking not shown in Very easy (closed in Easy and Advanced), the read-only tool lines not shown in Very easy and Easy, and the exact context block folded there (D11, D13);
- the prompt's budget at 104,000 characters, each later topic with its own raise line and a trim pass before the budget passes 108,000 (D7; [above](#the-prompts-budget-96000-to-104000)).
