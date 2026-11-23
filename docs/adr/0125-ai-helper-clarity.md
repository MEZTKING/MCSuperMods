# ADR 0125: The AI helper, made clear

## Context

The user asked on 2026-11-22: "fix the ai helper so its not confusing and is absolutely perfect". The helper ([ADR 0041](0041-ai-helper.md), shipped in 0.7.0) has grown by a paragraph of instructions with every batch since, while its panel is still the one of 0.7.0, built before Very easy mode ([ADR 0083](0083-very-easy-mode.md)), before the drawn art ([ADR 0092](0092-minecraft-style-art.md)) and before the rule "Everything visible live" ([ADR 0119](0119-live-worldgen-preview.md) D1).

The helper was read whole and walked in the built app as a new install in Very easy with a scripted model ([`docs/PLAN-ai-helper-2.md`](../PLAN-ai-helper-2.md), findings F1–F21). In short:

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

**D7. The prompt is kept true by tests.** The prompt is one file per topic under `packages/ai/src/prompt/`, so each plan's "AI words" brief owns one file. Every count, id, kind, flow, parameter, template and label the prompt names is an exported constant, and a test in the app checks each against the code on both targets (the plugin registry, the library, the Script API's JSON, the target facts, the components' labels); the Script API check also runs the other way, so an event no paragraph names fails. Every "not available" sentence is an entry of a list with a probe that fails when the thing exists. The prompt has a size budget of 96,000 characters, raised only with a line in this ADR. Raised to 98,000 by B617 (2026-11-23): the data live views topic (`live-views.ts`, 2,081 characters) took the prompt from 95,918 to 98,000, for the orchestrator to confirm at review. Confirmed by the orchestrator. Raised to 99,000 at the B553 merge (2026-11-23): Rules 3's 25 catalogue ids for games (the prompt names every catalogue id) took it to 98,324; the search plan's AI words (B669, B672) need their own line. Raised to 102,000 by B561 (2026-11-23): the games topic (`games.ts`, 3,463 characters: the games kinds, the game flows, Play my game, maps, builds from the game, Try it's games grounds and the limits M1 to M16 in plain words) took the prompt from 98,531 to 101,994, for the orchestrator to confirm at review. Raised to 103,000 at the merge of the Try it commands (2026-11-23): naming `advancement`, `spawnpoint` and `team` in the Try it commands list took the prompt to 102,025.

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

## Status

Proposed (2026-11-22). The working plan is [`docs/PLAN-ai-helper-2.md`](../PLAN-ai-helper-2.md) (B680–B693, reserves B694–B696). Decided by the orchestrator under the user's rule "take the recommended options" and open to the user's veto:

- no Chat or Build switch, with limits that rise when a plan is accepted (D2; fallback: the switch kept and renamed);
- the review as things, with files hidden in Very easy and folded in Easy (D3);
- **Add to my mod** and **Throw away** in Very easy and Easy, **Apply** and **Discard** in Advanced (D13);
- **Save and check** spending one tiny request on every saved key (D5);
- the one-hour cache for the system block (D8);
- **Run limits** only in Advanced, the defaults in Settings (D10);
- Thinking and the read-only tool lines not shown in Very easy (D13);
- a typed "go", "yes" or "ok" building the whole plan, any other text while a plan waits being a change to it (D2);
- the prompt's budget of 96,000 characters (D7).
