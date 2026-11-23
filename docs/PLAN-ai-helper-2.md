# Plan: AI helper 2, clarity (draft)

Draft of 2026-11-22, by the orchestrator, for the user's request of the same day: "fix the ai helper so its not confusing and is absolutely perfect ask fable for help". Decisions are in [ADR 0125](adr/0125-ai-helper-clarity.md) (Proposed, vetoable defaults in its Status). Briefs B680–B693, reserves B694–B696. Nothing here is built yet. This plan is deleted at its close; its findings and decisions move into the ADR.

## In plain words

Today the helper works, but a new user cannot tell what it is doing, what it is waiting for, what it will make or what it has made. This plan changes five things a user sees:

1. **One line always says what is happening and whose turn it is** ("Thinking…", "Your turn: choose what to do with the plan", "2 things are ready. Nothing is in your mod yet."), and the newest answer is always in view.
2. **You see what will be made before you add it**: pictures and names of the things, not a list of files. The files stay one click away in Easy and are shown as today in Advanced.
3. **No Chat or Build switch.** You say what you want; the helper plans first when the ask is big.
4. **Setting up the key takes three steps in one place**, with what it costs in plain numbers, and a wrong key is found at once.
5. **The helper knows the app as it is today and who it is talking to**: its instructions are checked against the code by tests, so they cannot go stale again, and in Very easy it answers without ids, file kinds or JSON.

## How this was examined

- Read at the branch tip 828fec8: ADR 0041 whole; the lines about the helper in the 34 later ADRs that name it (found by search; ADRs 0047, 0053, 0083, 0086, 0092, 0119, 0120 and 0124 at those lines); ADR 0093 (AI pictures, in progress in another worktree: not planned here); `docs/guide/ai-helper.md`; `packages/ai/src/` (the rendered system prompt of both modes, 89,650 and 90,470 characters: its first third read whole, the rest by each paragraph's opening, every "not available" and "missing" sentence, and the worlds, live map, Try it and mode parts whole), `app/src/main/ai/`, `app/src/renderer/src/ai/`, `store/ai-store.ts`, `components/ai/`, the entry points in `App.tsx`, `Toolbar.tsx`, `home/tiles.ts`, `AiStartDialog.tsx`, `ThingsToFix.tsx`, the tests and e2e `ai-path`.
- The built app was walked under `xvfb-run -a` in a scratch worktree (deleted afterwards) with a scripted model (`MSM_E2E_AI_SCRIPT`), as a new install in Very easy (`MSM_E2E_NEW_INSTALL=1`): the Welcome's AI line with no key, Open Settings, the panel with no key, a new mod, "make a ruby sword", a vague ask, an ask it cannot do, a plan, Build all, the review, Apply, Home afterwards, Undo, a refusal, a cut-off answer, a failing run, New conversation. 30 screenshots (not committed) and the panel's text at each step are the evidence quoted below as "walk".
- **Not checked, and why:** a real key and a real model (the key stays on the user's PC; no automated test has ever run the real model: ADR 0041's findings); saving a key (Linux has no encrypted storage, so Save key is disabled here); how long the first words take (the scripted model answers at once). The reserve B694 is the way to check the real model.

## Findings, ranked by how much they confuse a user

Each finding names the file and line at 828fec8, or the walk's screen and words.

### Tier 1: a beginner is stuck or sees nothing

- **F1 The newest answer is hidden.** `AiPanel.tsx` draws the transcript, then the plan, then the proposed changes in one scrolling column (lines 174–205) and scrolls to the column's end on every new message (lines 71–73). With changes waiting, a new answer lands above them and out of view. Walk: after "make something cool" the answer "What kind of thing would you like?" sat at −44 to 40 px of a 773 px window; after Build all the closing summary sat at −324 px. The user sees an old list and a token count that moved.
- **F2 A plan waits silently, off-screen.** Walk: a plan that arrives while changes wait is above the view; the screen shows the old list with **Apply** greyed out, a **Stop** button and "The helper is still working; more changes may follow." (`AiChangesetReview.tsx` 163–165), although the helper is waiting for the user. "Waiting for your decision." is small grey text under the plan (`AiPlanView.tsx` 12, 130). Typing "go" does nothing: Send is off while a run is open (`AiPanel.tsx` 112), though ADR 0041 D6 promised that writing "go" builds.
- **F3 No sign of work.** Between Send and the first word nothing moves: `turn_start` changes nothing (`ai-store.ts`, `applyEvent`), there is no busy line or timer anywhere in `components/ai/` (only the Stop button appears). With the default model thinking at high effort this can be a long silence (length not measured here).
- **F4 The review shows files, not things, and nothing is seen before Apply.** Walk: "make a ruby sword" gives six rows, `gem_mod:mod` `msm:mod`, `gem_mod:ruby_sword` `msm:item`, `gem_mod:item/ruby_sword` `minecraft:model`, `gem_mod:en_us` `minecraft:lang`, a recipe and a texture, each with **Before and after** (a JSON diff). The sword's picture is behind a closed **Preview** under the heading "PLACEHOLDER TEXTURES". The Creator shows the same starter as one card with a live picture. This is the gap `docs/LIVE-VIEW-AUDIT.md` line 192 records ("Needs one"). It is the same in all three modes: nothing in `components/ai/` or `ai/` reads the mode (no match for the mode preference in either folder).
- **F5 The first open with no key is a dead end.** The panel says "Add your Anthropic API key to use the AI helper." and **Open Settings** (`AiKeyMissing.tsx`). Settings opens at its top; the AI helper section starts at y = 951 in an 800 px window (walk), under Game locations, Vanilla assets, Updates, Showcase and World backups. Nothing in the app says where a key comes from; the only link is "AI helper guide" at the very bottom of the section (`AiSettingsSection.tsx` 301–308). **Save key** answers "Key saved." for any text (lines 108–115: no test), so a wrong key fails only at the first Send. From **New project with the AI helper** the text is "Save it in Settings → AI helper, then come back here." (`AiStartDialog.tsx` 62–67); the dialog closes and what was typed is lost.
- **F6 After Apply nothing shows what was made.** The only sign is a small notice "Applied 9 changes. Undo reverts them in one step." (`ai-controller.ts`, `applyNotice`); in Very easy the middle of the window still shows Home's tiles, and the made things are in My things further down. There is no Undo beside the notice, and after Undo the notice still says "Applied 9 changes." (walk). The plan stays as the last block, reading "Building all items." with ticks, after Apply and after Undo (`AiPlanView.tsx` 17–21; the store never clears a decided plan). A plan line is ticked on the model's word alone: in the walk `gem_mod:ruby` was ticked although nothing made it (`reachCheckpoint` in `ai-store.ts`).
- **F7 Chat or Build is a choice the user cannot make well.** Both take "make a ruby sword". In Chat a big ask is answered with "suggest build mode" (`system-prompt.ts` 758), so the user switches and types again. In Build every ask, even a one-line change after a build, must start with a plan ("Call propose_plan before any proposal", lines 760–765). The switch explains itself only in a tooltip (`AiPanel.tsx` 18–21), is greyed while a plan waits, and changes the system prompt and the effort in the middle of a conversation (`loop.ts` 89, 94), which throws away the cached conversation: the next request re-reads everything at the full price.

### Tier 2: the helper's own answers are wrong or confusing

- **F8 The system prompt contradicts the app.** (a) "Boats of vanilla's kind … are not available" (`system-prompt.ts` 743) against "Boats: the `msm:boat` component … makes the item a boat of vanilla's behaviour" (line 545). (b) "Still missing: block.place" (line 738) against the Script API's `block.place` event (`script-api-v1.json` 2902, since runtime 1.5.2); Script API 1.6 has no paragraph at all (1.1 to 1.5 and 1.7 have). (c) "Effects are not brewable" (line 732) against the Potions paragraph, which brews an effect with `msm:potion`. (d) Try it: "commands are checked and logged but not carried out in the world" (line 573) against B606: Try it's chat box now runs `give`, `setblock`, `fill`, `summon`, `tp`, `effect`, `scoreboard`, `execute` and functions, with the load and tick tags.
- **F9 The helper does not know who it is talking to or what the app looks like.** The context sent with a message has the target, namespaces, counts per kind, the mod element and the waiting changes (`system-prompt.ts` 773–798): no mode, no mod name, nothing about what is open. The prompt never says Home, My things, Things to fix, Share my mod, Showcase, Surprise me, Roll it, Easy or Advanced, and says "Very easy" once. It tells the model to speak in ids and to send the user to "the changeset" (line 724), a word the app never shows (the heading is "Proposed changes"). So "where is my sword?" or "how do I give this to a friend?" gets a guess, and a Very easy user gets `gem_mod:ruby_sword`, `kind msm:item` and model paths (walk).
- **F10 Jargon in every mode.** **Run limits** with "Tool turns", "Output tokens" and "Tell the model its output budget"; the line "0 in / 0 out, 0 requests, about $0.00, Opus 5.5" before anything is sent, then "48,500 in / 420 out, 4 requests, about $0.11, Opus 5.5"; tool lines "Listed starters", "Proposed the starter `custom-sword`", "Checkpoint" and "Used note_missing_feature" (the last has no wording: `AiTranscript.tsx` 91–92); each tool line opens raw JSON; "The model declined to continue: …"; "The run stopped at its limit (24 tool turns / 100000 output tokens). Raise the limit under Run limits and send 'continue' to carry on." (`loop.ts` 69–71).
- **F11 The limit message and the limits' home are wrong.** Limits count from zero in every run (`loop.ts` 143–144), so sending "continue" already carries on; "Raise the limit" is not needed. The popover says "The defaults are set per mode in Settings, AI helper." (`AiLimitsPopover.tsx` 111–113); Settings says "Run limits per mode are changed in the panel for one run." (`AiSettingsSection.tsx` 299–300) and has no limit fields, against ADR 0041 D7.
- **F12 Cost is silent or misleading.** The fixed part of every request is 89,650 characters of prompt and 22,334 of tool definitions, about 28,000 tokens (an estimate at four characters a token; count at implementation). A first message, or any message after five idle minutes, writes that to Anthropic's cache: about 14 US cents on Opus 5.5 before a word of answer (28,000 × $4 × 1.25 per million). The guide says "a chat question costs a few cents with Opus" (`docs/guide/ai-helper.md` 114) and the start dialog "It costs a little". The cache lasts five minutes (`loop.ts` 89: no longer lifetime), which is shorter than most pauses between chat messages. `models.ts` prices Sonnet 5.5's cache reads at $0.20 per million; Anthropic's table says $0.10; Haiku 5.5's higher price above 100,000 prompt tokens is not modelled.
- **F13 Failures are raw and offer nothing to do.** `errors.ts` 33–42 has no words for a billing error (402: no credit, the likeliest failure of a new account) or an overloaded service (529), which show as "<class>: <raw text>". No failure offers **Try again**; the user retypes. The `done` event carries only a text, so the panel cannot offer the right next step (check the key, wait, add credit).
- **F14 Very easy has no Explain.** The Problems tab is hidden there (`RightDock` `hideProblems`), and Things to fix offers Show, Fix and Details only (`ThingsToFix.tsx` 62–102).
- **F15 The review's problems are raw.** Rows print `error: <message> <path>` (`AiChangesetReview.tsx` 108–119) although `session/plain-problems.ts` has the plain words Very easy uses everywhere else.

### Tier 3: smaller, but each one costs trust

- **F16 New project with the AI helper asks for a folder in Very easy** ("Choose folder and build…", `AiStartDialog.tsx` 57; `App.tsx` `startWithAi`), where Very easy's own New asks only a name.
- **F17 Stale words.** "Placeholder textures" as the review's heading and the plan's line (`AiChangesetReview.tsx` 15, `AiPlanView.tsx` 92; `tools/decide.ts` "Placeholder textures the plan needs"), against ADR 0092 D15 and the prompt's own rule never to call them placeholders; the guide still says so too (`ai-helper.md` 77, 91); the e2e script ends "The textures are placeholders to replace later."
- **F18 The privacy text is one long sentence of jargon** ("element JSON, ids, problems, template and version data, script typings", `AiKeyMissing.tsx` 4–5).
- **F19 New conversation is an icon without a word** (`AiPanel.tsx` 160–172), and nothing in the app says that a conversation and its waiting changes are forgotten when MCSuperMods closes.
- **F20 The context chip of Explain reads "Problem blocks-items.unknown-event on msm_sample_mod:ruby_wand"** with the sent text as raw Markdown and JSON (`ai-controller.ts` `explainProblem`, `context-blocks.ts`). Right for Advanced; Easy and Very easy need the thing's name and the plain problem, with the exact text one click away.
- **F21 Nothing keeps the prompt true.** The paragraphs since Rules are pinned to the code by `app/test/ai-rules.test.ts`; the older ones (effects, potions, block types, mobs, containers, portals, particles, Script API 1.1 to 1.4) are only checked against the prompt's own words in `packages/ai/test/system-prompt.test.ts`. That is how F8 (a) to (c) lasted. Every batch appends to one 798-line file, which also makes every plan's "AI words" brief touch the same file.

## Decisions in short

Full text in [ADR 0125](adr/0125-ai-helper-clarity.md).

- **D1 One state line, and the newest thing in view.** A line above the message box always says what is happening and whose turn it is, with seconds while the helper works and at most one button. The plan sits in the conversation where it was made; the waiting changes sit in a tray fixed between the conversation and the message box, not at the end of the scroll.
- **D2 No Chat or Build switch.** One system prompt. The helper answers or proposes directly for a small ask and plans first for a big one. The run's size (`chat` or `build` in the protocol) is chosen by the app from where the user started, and a run's limits rise to the build limits when the user accepts a plan. Typing while a plan waits answers the plan.
- **D3 See it before it is added.** The review opens on what will be made: B615's **See it** pane, then one card per thing with its picture and name. Files are hidden in Very easy, folded in Easy, listed as today in Advanced.
- **D4 After adding: Show me and Undo, and the notice stays true.**
- **D5 Set-up in one place.** One three-step card (get a key, paste it, **Save and check**) in the panel, the start dialog and Settings. The key still goes only to main through the existing `ai:setKey` and `ai:testKey`; no new channel.
- **D6 The helper knows its audience and the app.** The context gains the mode, the mod's name and what is open; the prompt gains how to speak in each mode and a map of the app whose labels are pinned to the code.
- **D7 The prompt is kept true by tests.** The prompt moves into topic files; every count, id, kind, flow, parameter, template, label and "not available" claim is a named constant checked against the code; the prompt has a size budget.
- **D8 Cost in plain numbers.** A typical cost worked out from the measured prompt and the price table, shown before the first message; the running cost as one sentence; the fixed part cached for an hour; the price table corrected.
- **D9 Every failure is a sentence with one thing to do.**
- **D10 Run limits leave the beginner's panel.** Defaults in Settings (Advanced); the popover only in Advanced; a stopped run offers **Keep going**.
- **D11 Explain everywhere**, in plain words in Very easy and Easy.
- **D12 The scripted model can wait and fail**, so every state has a test without a key.
- **D13 One wording table per mode**, as data, with a test.
- **D14 Not in this plan:** saved conversations, a base URL, a picture tool (ADR 0093 D9), the `search_library` tool (ADR 0124 D12, the search plan's B669), compaction, the prompt's topics behind a read tool (reserve B695).

B615 keeps its files and is not folded in (see "Coordination").

## Wording

One vocabulary. The modes differ in how much detail is shown, and only in the few words below. Every string lives in `components/ai/ai-words.ts` (B684) so the test of D13 can read them all.

| Where | Very easy | Easy | Advanced |
|---|---|---|---|
| Empty panel | "What would you like to make?" and "Say it in your own words. I show you what I would make first. Nothing is added to your mod until you say so." with four example asks that fill the box | the same | the same, plus "Ask about a problem or an element." |
| Message box | "Type what you want, then press Send" | the same | "Ask or describe what to make (Enter sends, Shift+Enter for a new line)" |
| New conversation | **New chat** (a word, not only an icon) | the same | the same |
| State: working | "Thinking… (12 s)", "Looking at your mod…", "Making it… 3 things so far", "Checking it works…" | the same | the same |
| State: plan waits | "Your turn: choose what to do with the plan." **Show the plan** | the same | the same |
| State: step waits | "Your turn: keep going or stop?" | the same | the same |
| State: ready | "2 things are ready. Nothing is in your mod yet." **Look** | the same | "9 proposed changes are ready. Nothing is applied yet." |
| Plan | "Here is my plan", lines "Ruby Pickaxe, a tool", **Make all of it**, **One at a time**, **Change the plan** (opens "What should be different?") | the same | the same, each line with its kind and id |
| Review heading | "Ready to add: 2 things" | "Ready to add: 2 things, 6 files behind them" | "Proposed changes (9 of 9 kept)" |
| Review rows | cards: picture, name, what it is, **Keep** | cards, and **Files behind this** | cards, then the file list with **Before and after** as today |
| Do it | **Add to my mod**; **Make these changes** when something is changed or removed | the same | **Apply** |
| Drop it | **Throw away** | the same | **Discard** |
| Texture group | "Pictures" | "Pictures" | "Textures" |
| After adding | "Added 2 things to your mod: Ruby Sword, Ruby Pickaxe." **Show me** **Undo** | the same | "Applied 9 changes." **Show** **Undo** |
| After Undo | "Taken out again." **Put back** | the same | "Undone." **Redo** |
| Tool lines | only "Made Ruby Sword", "Checked: no problems", "Wrote down a wish: …", "Finished: …" | the same | every tool line with its details, with words for `checkpoint` and `note_missing_feature` |
| Thinking | not shown | **Thinking** (closed) | **Thinking** (closed) |
| Cost | "This chat has cost about $0.11 so far." | the same | the same, with tokens, requests and the model on the line |
| Limit reached | "It paused so the cost stays small." **Keep going** | the same | the same, with the numbers |
| Refused | "The helper would not do that. Try asking another way." | the same | the same, with Anthropic's reason |
| No credit | "Your Anthropic account has no credit left. Add credit on Anthropic's site." **Try again** | the same | the same |
| Key not accepted | "Your key was not accepted." **Check my key** | the same | the same, with the error class |
| Busy or offline | "Anthropic is busy just now." or "No connection to Anthropic. Check the internet." **Try again** | the same | the same |
| Explain | **Ask the helper** on a Things to fix row; the chip reads "About: Ruby Sword, a picture is missing" | **Explain**; the same chip | **Explain**; the chip with the code and id as today |

The set-up card (all modes): heading "Set up the AI helper"; "The helper is Anthropic's Claude. It needs a key, like a password, from an Anthropic account, and using it costs money on that account: <typical cost sentence from D8>. If the account is not yours, ask its owner first."; "1. Get a key" **Open Anthropic's site**; "2. Paste it here"; "3." **Save and check**, answering "The key works. You can start." or the failure sentence. Under it, "What is sent" as two short lists: sent when you press Send (your message and this chat; the parts of your mod the helper looks at: names, settings and problems; pictures you add to a message yourself), never sent (your pictures and sounds; where files are on your computer; your key to anyone but Anthropic).

Words never shown in Very easy (the test of D13): an id (`name:path`), `msm:` or `minecraft:`, "JSON", "API", "token", "tool turn", "element", "changeset", "schema", "starter", "request", "placeholder". ("Tool" alone stays allowed: a pickaxe is one.)

## Coordination

- **B615 (Live views 2, wave 4, in flight) keeps its five files**: `liveviews/BundleLiveView.tsx`, `liveviews/existing/`, `components/creator/CreatorPreview.tsx`, `creator-model.ts` and `components/ai/AiChangesetReview.tsx`. It is the piece that delivers "seen before Apply"; this plan does not fold it in and edits `AiChangesetReview.tsx` only after B615 has merged (B688). What B615's **See it** pane should include, so B688 builds on it without rework:
  1. It is open, not behind a disclosure, and is the first thing in the review.
  2. It draws the project as it would be: the open project with every kept, fitting change applied (the state `planChangeItems` already builds), so a changed element shows its new look, not only new ones.
  3. It follows the ticks: unticking a change takes it out of the picture within the 150 ms debounce. Deleted and renamed elements are named in a line, not drawn.
  4. It follows a run: things appear as they are proposed, with one line "More may follow" while the run is open.
  5. One live view at a time; the others are stills in a strip, picked by display name (`displayName` of `preview/bundle-source.ts`).
  6. Looking changes nothing: no session write, no preference write without a project folder, no call to the AI service. Without the Minecraft folder, project-only data draws and the rest shows the set-up banner.
  7. A proposal with nothing to picture says so in one line ("Nothing to picture: 3 files without a view"), never an empty box.
  8. The seam for B688: the pane as its own exported component taking `{ project, items }`, a pure exported function that builds the preview project from the items, and the test ids `ai-see-it`, `ai-see-it-thing-<n>` and `ai-see-it-empty`.
  9. It leaves the review's labels and the row list as they are (B688 changes them), to keep the two diffs apart.
- **B617 (Live views 2, wave 5) and the search plan's B669 and B672** edit the helper's prompt. After B681 the prompt is one file per topic under `packages/ai/src/prompt/`: B617 owns a new `prompt/live-views.ts`, B672 a new `prompt/search.ts`, and both follow D7 (each fact a constant with a check beside `app/test/ai-prompt-truth.test.ts`, which B683 creates; later briefs add their own `ai-prompt-truth.<topic>.test.ts`). B617's own text should correct nothing in `prompt/try-it.ts` that B682 has already corrected (F8 d); it adds Roll it, Try it on, Everything in a tag, the advancement tree and the dialogs with the labels of the merged code.
- **ADR 0093 (AI pictures) is another worker's** (`app/src/main/ai-pictures/`, `app/src/main/ipc.ts`, `app/src/preload/`, `app/src/shared/`). No brief here edits `app/src/shared/`, the preload or `main/ipc.ts`; a brief that finds it needs to stops and reports. The protocol types live in `@msm/ai` and reach the IPC contract by import.
- **`App.tsx` and `SettingsDialog.tsx`** have one owner per wave in this plan (B687 in wave 1, B689 in wave 2) and none in another plan's running wave: check before each wave starts.
- **Size.** The renderer was 17.6 of 19 MB at B587 and has grown with Live views 2; every app brief here runs `node tools/check-size/index.ts` from an empty `app/out` and stops above 18.5 MB. This plan adds no dependency and little code (an estimate of 40 kB).

## Waves

| Wave | Briefs | Runs beside | Starts when |
|---|---|---|---|
| 0 | B680 the run's engine; B681 the prompt in topic files (no change of a byte) | Live views 2 wave 4 (B614, B615) | now |
| 1 | B682 the prompt made true, then B683 the prompt's truth test; B684 the conversation's state and words; B687 set-up and Settings | Live views 2 wave 4 | B680 and B681 merged |
| 2 | B685 the panel; B686 the plan, the cost line and the limits; B688 the review as things; B689 after adding, Explain and the start dialog | Live views 2 wave 5 | wave 1 merged, and B615 merged (B688) |
| 3 | B690 e2e; B691 guide, changelog and the scoped guides | | wave 2 merged |
| 4 | B692 the user's own check list; B693 close (main session) | | wave 3 merged |

## Rules for every brief

The rules of `docs/HANDOFF.md` ("Rules for every brief") apply: read first, own worktree, the listed owner files only, no new dependency, no `git config`, commits as the user with no trailers and ` [skip ci]` mid-wave, `df -h` before building, a DEVLOG entry in the commit, "Notes for the plan" at the end of the report. In addition:

- The key never leaves main; the renderer still passes a pasted key to `ai:setKey` and never reads one back. No brief adds an IPC channel.
- No real request to Anthropic in any test. Tests use `ScriptedModelClient`.
- Every string a user reads comes from a words file (`ai-words.ts` after B684; B687's set-up card and Settings strings in its own `ai-setup-words.ts`, with the same test over them) and is British English without emojis.
- No version fact outside `packages/targets`; model ids and prices stay in `packages/ai/src/models.ts`.
- Exit criteria always include `pnpm lint`, `pnpm typecheck`, the touched packages' tests, and for app briefs `pnpm build` and `node tools/check-size/index.ts`.
- Models: Opus (`claude-opus-5-5`) at medium effort unless the brief says otherwise.

## Briefs

### B680 The run's engine: waits, failures, limits and prices (wave 0; Opus)

- **Owner files:** `packages/ai/src/scripted-client.ts`, `errors.ts`, `protocol.ts`, `loop.ts`, `models.ts`, `index.ts`; `packages/ai/test/scripted-client.test.ts`, `loop.test.ts`, `models.test.ts`, new `errors.test.ts`.
- **Scope:** (1) The script format gains `delayMs` on a turn (the client waits before its first event, honouring the abort signal) and a turn of the form `{ "error": { "errorClass", "message", "status" } }` that throws a `ModelClientError` (D12). (2) `describeModelClientError` gains billing (status 402 or type `billing_error`), overloaded (529), a time-out and a request too large, and no longer puts the class name in the sentence; the `done` event gains an optional `errorClass` (D9). (3) The limit stop's text becomes one plain sentence without numbers; the numbers travel as fields on `done` (`limit: { toolTurns, outputTokens }`) for Advanced (D10). (4) When a `propose_plan` result of the run carries the decision `build_all` or `step`, the run's limits become the larger of its own and the settings' build limits (D2). (5) The system block is cached with the one-hour lifetime while the conversation's own breakpoint keeps five minutes (D8; verify at implementation that the pinned SDK's types take `ttl: '1h'` and that the longer entry comes first; if not, stop and report). (6) `models.ts`: Sonnet 5.5's cache-read price to $0.10 per million, a one-hour cache-write multiplier of 2, Haiku 5.5's price above 100,000 prompt tokens, each with `checkedOn` and "(verify at implementation)" against Anthropic's pricing page; new `typicalCost(model, prefixTokens)` giving the cost of a first question and of a follow-up, and `PROMPT_PREFIX_CHARS` measured from `systemPrompt` and `toolParams` in a test.
- **Out of scope:** the system prompt's text, the SDK version, the renderer.
- **Exit criteria:** `@msm/ai` tests green, with new cases: a delayed turn emits nothing before its delay and is cancellable; each error turn ends the run with its class and sentence; a chat run that accepts a plan is not stopped at the chat limits; the request carries the one-hour marker on the system block only; `estimateCost` of a fixed usage is unchanged for Opus and lower for Sonnet's cache reads; `main-ai-service.test.ts` green unchanged.

### B681 The prompt in topic files, not a byte changed (wave 0; Sonnet)

- **Owner files:** `packages/ai/src/system-prompt.ts`, new `packages/ai/src/prompt/` (`index.ts`, `core.ts`, `textures.ts`, `effects.ts`, `vanilla-additions.ts`, `scripts.ts`, `blocks.ts`, `containers.ts`, `portals.ts`, `particles.ts`, `mobs.ts`, `vehicles.ts`, `vanilla-parity.ts`, `villagers-fluids.ts`, `plants-storage.ts`, `mobs-commands.ts`, `rules.ts`, `worlds.ts`, `try-it.ts`, `modes.ts`); `packages/ai/test/system-prompt.test.ts` (one new case).
- **Scope:** move each paragraph and its constants into its topic file; `system-prompt.ts` re-exports every name it exports today and assembles the same text in the same order. A new test pins the SHA-256 of `systemPrompt('chat')` and `systemPrompt('build')` taken before the move. One addition for wave 1's parallel briefs: `AiProjectContext` gains the optional fields `view` (`'very-easy' | 'easy' | 'advanced'`), `modName` and `open` (`{ id, kind, name }`), and `projectContextBlock` writes a line for each only when it is given (D6).
- **Out of scope:** any change of wording.
- **Exit criteria:** both hashes equal before and after; the context block without the new fields is byte for byte today's, and with them has three more lines; `@msm/ai` and app tests green with no other test edited; `packages/ai/README.md` names the folder.

### B682 The prompt made true (wave 1; Opus, high effort)

- **Owner files:** `packages/ai/src/prompt/*`, `packages/ai/src/system-prompt.ts`, `packages/ai/src/tools/decide.ts` and `propose.ts` (descriptions only), `packages/ai/test/system-prompt.test.ts`, `tools.test.ts` (the catalogue's pinned hash moves once), `app/test/ai-rules.test.ts` and `app/test/ai-patterns.test.ts` (only where a changed sentence is asserted), `app/test/fixtures/ai/*.script.json` (wording only).
- **Scope:** (1) One prompt for both run sizes (D2): `systemPrompt()` returns the same text whatever its argument; `prompt/modes.ts` becomes "small asks: answer or propose directly; a whole mod or more than three main things: call `propose_plan` first; after a plan is accepted follow the build procedure"; nothing tells the user to switch anything. (2) Fix F8 (a) to (d): boats, `block.place` with a Script API 1.6 paragraph written from `script-api-v1.json`, brewing, Try it's commands and functions as B606 built them. (3) New `prompt/speaking.ts` (D6): say "proposed", never "the changeset" (the app says "Ready to add" or "Proposed changes"); by the `View:` line of the context, answers in Very easy and Easy use display names, no ids, no kind ids and no JSON, name buttons by their labels and keep to short steps; Advanced answers may use ids. (4) New `prompt/app-map.ts` (D6): Home and its tiles, My things, Things to fix, Try it, Play and Reload, Share my mod, the Showcase, Surprise me, the Creator and Edit in Creator, Draw…, the Wishlist, the Preview tab and the live world map, each label an exported constant (`APP_MAP_LABELS`). (5) The prompt says what the context's `View:`, `Mod:` and `Open:` lines (B681) mean and that "this" or "it" in a message means the open thing. (6) "Placeholder" leaves the tool descriptions. (7) Every "not available" claim of the prompt becomes an entry of an exported list `PROMPT_NOT_AVAILABLE` (`{ id, sentence }`), and every count, id list, flow, parameter and label the text names comes from an exported constant, ready for B683.
- **Out of scope:** the batch 2 live views (B617 adds `prompt/live-views.ts`), search (B672), the truth test (B683), moving topics behind a tool (reserve B695).
- **Exit criteria:** `@msm/ai` tests green, with cases for each fix of F8, for one text in both sizes and for the absence list covering every "not available" in the text (a scan finds none outside the list); `ai-scenario`, `ai-art-scenario`, `ai-rules` and `ai-patterns` green; the prompt is at most 96,000 characters (today 90,470).

### B683 The prompt's truth test (wave 1, after B682; Opus)

- **Owner files:** new `app/test/ai-prompt-truth.test.ts` and, if it needs helpers, new `app/test/ai-prompt-truth-sources.ts`.
- **Scope:** (D7) written by another executor than B682's, against the code and not against the prompt's author. Every exported prompt constant is checked against its source: kinds against the plugin registry's kinds; templates against the session library; flows, their parameters and choices against the library's starters; Script API members and events against `script-api-v1.json` (and the reverse for events: an event of the API that no paragraph names fails, which is how a missing Script API 1.6 paragraph would have been caught); target-dependent lists against both targets' facts; `APP_MAP_LABELS` against the app (the constants the components export, such as the tiles of `home/tiles.ts`, `SHOWCASES` and the command titles, and for labels written in a component's markup a scan of that component's source for the exact label). Each `PROMPT_NOT_AVAILABLE` entry gets a probe that fails when the thing exists (boats: `msm:boat` in the MSM mcdoc forbids the claim; `block.place`: the event in the Script API forbids it). A scan fails on any number followed by "kinds", "flows", "templates", "recipes", "triggers", "steps" or "conditions" in the rendered prompt that no constant produced. The size budget of 96,000 characters, with the sentence "raise it only with a line in ADR 0125". Later plans add their cases in their own `describe` blocks of this file's siblings (`ai-prompt-truth.<topic>.test.ts`), never by editing this one.
- **Out of scope:** changing the prompt: a fact the test finds wrong is reported to the orchestrator, who sends it back to B682's owner.
- **Exit criteria:** green on both targets; mutation cases prove it bites: with one template id, one flow parameter, one Script API event and one app label altered in a copy of each source, and with a restored "Boats … are not available" sentence, the matching case fails.

### B684 The conversation's state and its words (wave 1; Opus)

- **Owner files:** `app/src/renderer/src/store/ai-store.ts`, `components/ai/ai-controller.ts`, `ai/project-context.ts`, new `components/ai/ai-status.ts`, new `components/ai/ai-words.ts`; `app/test/ai-store.test.ts`, new `app/test/ai-status.test.ts`, new `app/test/ai-words.test.ts`, `app/test/components/ai-fixtures.ts`.
- **Scope:** (1) `conversationStatus(conversation)` (D1): one of `idle`, `thinking`, `reading`, `making`, `checking`, `your-turn-plan`, `your-turn-step`, `ready`, `stopped`, `failed`, with the count of things, the seconds since the turn started (from `turn_start`, which the store now records) and the one action. (2) The plan is a transcript entry at the place it was proposed; a decided plan closes to one line once its run has ended; a line is ticked only when the changes hold an item for its element or the project has it (F6). (3) No user mode (D2): `setMode` goes; `send` takes the run size from its caller (`'chat'` by default, `'build'` from the start dialog and from the example "Make a whole mod"); text sent while a plan waits answers it (a message that is only "go", "yes" or "ok" is `build_all`, anything else is `revise` with the text as comments); the same for a waiting step (`continue`, or `stop` for "stop"). (4) `tryAgain()` resends the last user message of a failed, refused or cancelled run; `keepGoing()` sends "continue" (D9, D10). (5) Apply returns what was made as things (display names from `preview/bundle-source.ts` `displayName`) and remembers the undo label; the notice follows the command stack: added, taken out again, put back (D4). (6) `projectContextOf` adds `view` (from the mode preference), `modName` and `open` (D6). (7) `ai-words.ts`: every string of the table above keyed by state and mode, with `wordsFor(mode)`; `toolLine(message, mode)` replaces `toolSummary`, with words for `checkpoint` and `note_missing_feature` and `null` for the lines Very easy and Easy hide. (8) The notice of a failure maps `errorClass` to its sentence and action.
- **Keeps the app building:** this brief adds beside what the components use today. `setMode`, `conversation.mode`, `conversation.plan` and `conversation.checkpoint` stay (marked as going) so the untouched panel still compiles and passes after this merge; wave 2 removes their last uses (B685 the panel's, B689 `App.tsx`'s) and B693 deletes them.
- **Out of scope:** JSX; the review; `App.tsx`.
- **Exit criteria:** `pnpm build` and the existing component tests green with no component edited; `ai-status.test.ts` runs every combination of run state, plan, step, waiting changes and last notice and gets exactly one non-empty line and at most one action, never "working" while the user's answer is awaited; `ai-words.test.ts` finds none of the forbidden words or an id in any Very easy string and a string for every state in every mode; the store tests cover typed answers to a plan, Try again, Keep going, the apply notice through undo and redo, and honest ticks.

### B685 The panel (wave 2; Opus)

- **Owner files:** `components/ai/AiPanel.tsx`, `AiTranscript.tsx`, new `components/ai/AiStatusLine.tsx`; `app/test/components/ai-panel.test.tsx`, new `app/test/components/ai-plain-words.test.tsx`.
- **Scope:** (D1, D2, D13) no mode switch; the empty state with four example asks that fill the box without sending; the state line above the box with its seconds and action; the conversation scrolls to the newest entry (a new answer, a plan, a notice) unless the user has scrolled up, and then shows "New below"; the tray of waiting changes is fixed between the conversation and the box, closed to its heading and two buttons, opened by **Look**; **New chat** with a word; tool lines and Thinking by mode; notices with their action buttons; the box stays usable while a plan or step waits. The panel reads its mode from the preferences store.
- **Out of scope:** the plan's own drawing (B686), the tray's content (B688).
- **Exit criteria:** component tests for every state of `ai-fixtures.ts` in the three modes; `ai-plain-words.test.tsx` renders the Very easy panel through a whole scripted conversation (ask, plan, build, ready, added, undone, each failure) and finds no forbidden word, no id and no button without a text or label; exactly one primary button at a time; app tests, build and check-size.

### B686 The plan, the cost line and the limits (wave 2; Opus)

- **Owner files:** `components/ai/AiPlanView.tsx`, `AiUsageLine.tsx`, `AiLimitsPopover.tsx`; `app/test/components/ai-plan.test.tsx` (new or the existing plan cases moved out of `ai-panel.test.tsx` by agreement with B685: B685 deletes them, this brief adds them here).
- **Scope:** the plan as in the wording table: display names with what each is (the kind's title from the registry; the id beside it in Advanced), **Make all of it** as the one primary button, **One at a time**, **Change the plan** opening the comments box, "Leave this out" on a line, "Pictures" instead of "Placeholder textures"; the cost line as a sentence (Advanced adds tokens, requests and the model; nothing is shown before the first message); the limits popover only in Advanced, saying that Settings holds the defaults and that a stopped run can simply be continued.
- **Exit criteria:** component tests in the three modes; no id in the Very easy plan; the cost sentence for a zero, a tiny and a normal usage.

### B687 Set-up and Settings in one place (wave 1; Opus)

- **Owner files:** new `components/ai/AiKeySetup.tsx`, new `components/ai/ai-setup-words.ts`, new `components/ai/ai-limits-model.ts`, `components/ai/AiKeyMissing.tsx`, `components/ai/AiSettingsSection.tsx`, `components/SettingsDialog.tsx`, `components/AiStartDialog.tsx`, `App.tsx` (the settings dialog's `focus` and the start dialog's wiring only); `app/test/components/ai-settings.test.tsx`, `AiStartDialog.test.tsx`, `ai-entry-points.test.tsx`, new `app/test/ai-limits-model.test.ts`.
- **Scope:** (D5, D8, D10) `AiKeySetup`: the three steps, **Open Anthropic's site** (the Console's key page as an `https:` link opened outside the app; the exact address verified at implementation), the key field, **Save and check** (saves, then runs the key test and says the result; a failed check keeps the key and says what to do), the typical cost sentence from `typicalCost`, "What is sent" as the two lists. The panel without a key and the start dialog show it in place; the start dialog keeps what was typed and goes on by itself when the check passes. Settings' section uses the same card, then Model, the two efforts ("Effort for questions and small changes", "Effort for whole builds"), the fallback switch and, in Advanced, the default limits from `ai-limits-model.ts`: a pure model with plain labels ("Stop a small ask after … steps", "Stop a whole build after … steps", "and after about … tokens written"), the protocol's bounds, and the most a stopped run can have cost by the price table. `SettingsDialog` takes `focus: 'ai'` and opens scrolled to the section with the key field focused; every **Open Settings** of the helper passes it. In Very easy the start dialog asks the mod's name as Very easy's New does (the same `defaultParent`), not a folder.
- **Out of scope:** the IPC contract (none needed); AI pictures' section.
- **Exit criteria:** component tests: the card in its three hosts; a wrong key reads as not accepted right after saving (fake service); the typed description survives set-up; the section is in view after `focus: 'ai'` (the test checks `scrollIntoView` on the section); Very easy's start asks only a name; no key value is ever in a rendered text; the limits model's bounds, labels and worst-case cost on each model; app tests, build, check-size.

### B688 The review as things (wave 2; Opus; after B615 has merged)

- **Owner files:** `components/ai/AiChangesetReview.tsx` (from B615's merged state), new `components/ai/proposal-things.ts`, new `components/ai/AiProposalCards.tsx`; `app/test/ai-changeset.test.ts` (new cases only), new `app/test/components/ai-review.test.tsx`.
- **Scope:** (D3, F15, F17) `proposal-things.ts`: the items grouped into things: one per Creator set (`meta.creator`), else one per main element (the kinds My things shows, by `home/things.ts`), with the supporting files (models, item looks, language, recipes, loot, the mod settings, pictures) counted behind the thing that names them and a last group "Other files"; each thing has a display name, what it is, its picture (`elementTextureBytes`) and whether it is new, changed or removed. `AiProposalCards`: a card per thing with **Keep** (ticking a thing ticks its files), its problems in the plain words of `session/plain-problems.ts`, and "Not added: …" for a conflict. The review: B615's See it pane first, then the cards; Very easy shows nothing else; Easy adds **Files behind this**; Advanced adds today's list. The buttons and headings of the wording table. The LIVE-VIEW-AUDIT row of the AI helper's proposals is changed to *Has one* by the close, not here.
- **Out of scope:** `liveviews/`, the Creator.
- **Exit criteria:** the grouping test over the ruby tools scenario gives the ore, the block, the gem, the three tools and the mob as things with every other item behind one of them; unticking a thing unticks its files and the See it pane loses it; a proposal that changes and removes shows **Make these changes**; no id in Very easy; Advanced still passes the existing review assertions; app tests, build, check-size.

### B689 After adding, Explain and Show me (wave 2; Opus)

- **Owner files:** `App.tsx` (the helper's wiring only), `components/ThingsToFix.tsx`, `ai/context-blocks.ts`; `app/test/components/polish-explains.test.tsx`, `ai-entry-points.test.tsx` (new cases), the Things to fix component test.
- **Scope:** (D4, D11) **Show me** after adding: one thing opens it (its Studio, or the Creator set in Very easy); several open Home's My things in Very easy and select the first in the sidebar otherwise. **Undo** and **Put back** call the session's undo and redo and are offered only while the helper's step is the top of the stack. Things to fix rows gain **Ask the helper** (Very easy; the Problems tab keeps **Explain**), which opens the panel with the problem attached. The chip's label by mode ("About: Ruby Sword, a picture is missing" from `plainProblem`; the code and id in Advanced), with "See exactly what is sent" opening the block as today. Home's AI tile and the toolbar open the panel on its empty state; with no mod open they open the start dialog. `App.tsx` stops calling `setMode` and passes the run's size to `send` instead.
- **Out of scope:** the panel's own files (B685), Settings.
- **Exit criteria:** tests: Show me for one and for several things in each mode; Undo offered, then not offered after another edit; Ask the helper on a Things to fix row attaches the problem and sends nothing; the chip's label has no id in Very easy and Easy.

### B690 e2e: the walks (wave 3; Opus)

- **Owner files:** new `app/e2e/ai-clarity-path.spec.ts`, new `app/test/fixtures/ai/clarity-*.script.json`, `app/e2e/ai-path.spec.ts` (labels only).
- **Scope:** the walks of "Tests" below, with the scripted model's delays and failures.
- **Exit criteria:** green three runs in a row and in the full e2e run; `ai-path` and `ai-pictures-path` green.

### B691 Guide, changelog and the scoped guides (wave 3; Sonnet)

- **Owner files:** `docs/guide/ai-helper.md`, `docs/guide/very-easy.md` (the helper's lines), `CHANGELOG.md` `[Unreleased]`, `app/CLAUDE.md` (the helper's lines), `packages/ai/README.md`.
- **Scope:** the guide rewritten around the new screens with the labels of the merged code (set-up, asking, the plan, the review, adding and undoing, cost with the generated typical cost, failures by sentence, limits in Settings); the troubleshooting table by the new sentences.
- **Exit criteria:** the docs site builds; every bold label in the page exists in `ai-words.ts` or the components (checked by hand and listed in the report); no "placeholder".

### B692 The user's own check list (wave 4; Sonnet)

- **Owner files:** new `docs/guide/ai-helper-check.md` (linked from the guide's index), `docs/HANDOFF.md` "Waiting on the user" (one item).
- **Scope:** twelve steps the user does on Windows with a real key, each with what should be seen: set-up with a wrong and a right key, the typical cost against the real line after one question, "make a ruby sword" in Very easy, a vague ask, an ask MSM cannot do, a whole mod with a plan, One at a time, Change the plan, the review's pictures, Add, Show me, Undo, Ask the helper on a thing to fix, pulling the network cable mid-run, the time to the first words (to be written down: the state line's seconds).
- **Exit criteria:** the page builds in the site; each step names labels that exist.

### B693 Close (wave 4; main session)

- ADR 0125 reviewed against the merged code and accepted with findings; ADR 0041 marked as amended (D6 modes, D7 limits, D8 the panel) with a link; DESIGN section 8's AI helper paragraph; ROADMAP ticks and a Milestone Log row; HANDOFF; `docs/LIVE-VIEW-AUDIT.md` line for the helper's proposals (with B615); this plan deleted, its findings F1–F21 with their outcome moved into the ADR.

### Reserves, only on the user's word

- **B694 A self-check with the user's key.** A palette command in Advanced, "Check the AI helper", that asks first ("This sends six test asks to Anthropic and costs about …"), runs six fixed asks against a scratch project held in memory with the real model, and writes a report (what was asked, what was proposed, the checks' result, seconds to the first words, cost) to a file the user can send. It is the only way this project gets to see the real model's behaviour; recommended.
- **B695 Topics on demand.** Move the topic paragraphs behind a read tool so the fixed part of a request falls from about 28,000 tokens to under 8,000. Only after B694 has measured what a question really costs and whether the model reads topics reliably.
- **B696 Waiting changes kept over a restart** (F19): the changes, not the conversation, saved under `.msm/` and offered again on open. Needs its own decision on retention.

## Tests that prove "not confusing"

1. **e2e `ai-clarity-path`** (B690), each as a new install in Very easy unless said:
   - *No key.* Home's AI tile: the set-up card, three steps, the typical cost sentence; **Open Settings** from the toolbar's helper lands with the section in view (its top inside the window). The Welcome's AI line with a typed description: the description is still there after the card.
   - *Waiting.* A turn delayed by two seconds: the state line reads "Thinking…" with a rising number within 300 ms of Send; Stop is offered; nothing else claims to be working.
   - *A small ask.* "make a ruby sword": the state line ends at "1 thing is ready. Nothing is in your mod yet."; the tray shows one card named "Ruby Sword" with a picture (the image's pixels are not all one colour); the panel's whole text holds no id and none of the forbidden words.
   - *The newest answer is in view.* With changes waiting, a second ask whose answer is a question: the answer's box lies inside the conversation's visible box.
   - *A plan.* The plan's box lies inside the visible box when it arrives; the state line says it is the user's turn; typing "go" and Enter builds; nothing says "working" while it waits.
   - *Adding.* **Add to my mod**: the notice names the things; **Show me** shows one; the toolbar's Undo, then the notice says "Taken out again."; **Put back**.
   - *It cannot do it.* The line "Wrote down a wish: …" and Help's Wishlist holds it.
   - *Failures.* Script errors for a rejected key, no credit, a busy service and a lost connection: each shows its sentence and its one button; **Try again** after a busy service succeeds on the next scripted turn; a limit stop offers **Keep going** and goes on.
   - *Easy and Advanced.* Easy: cards and **Files behind this**. Advanced: ids, kinds, **Before and after**, **Apply**, the limits popover; **Explain** on a Problems row and **Ask AI** as in `ai-path`.
2. **Plain words** (B684, B685): the wording table's test; the rendered Very easy panel swept for ids and forbidden words through every state.
3. **One line, one turn** (B684): the state function is total and never says "working" while the user's answer is awaited.
4. **The prompt cannot go stale** (B683): the truth test pins every count, id, kind, flow, parameter, template, label and absence claim to the code, and a mutation case proves it fails.
5. **Cost is derived** (B680, B687): the typical cost sentence comes from the measured prefix and the price table; no test or component holds a typed cost.
6. **The real model** (B692, and B694 if the user wants it): the check list on Windows.

## Order

This plan runs now. Waves 0 and 1 touch none of Live views 2's wave 4 files and run beside B614 and B615; wave 2 starts when wave 1 and B615 have merged; Live views 2's wave 5 (B616 e2e, B617 words) runs after B682 and B683 and may run beside wave 2 (B616 should assert See it through B615's test ids, which B688 keeps). The search plan's B669 and B672 come after this plan's close.

## Risks

- **The real model is still unseen.** Every test here is scripted. D2 (one prompt, no switch) changes what the model is told; B692's check list, or B694, is the safeguard, and D2 keeps a fallback (the switch back, renamed).
- **B615 slips.** Then B688 waits; everything else in wave 2 does not depend on it, and the tray shows today's list under the new headings until B688 lands.
- **The one-hour cache.** It costs twice a normal write once an hour and saves a write after every pause; for one question in a session it costs more (about 22 cents instead of 14 on Opus 5.5, by the estimate above). The setting stays in `loop.ts` as one constant so the user's veto is a one-line change.
- **Size.** If the renderer's first paint passes 5.5 MB or its total 20.5 MB, a brief stops and reports (ADR 0126 D4 as amended; the old 18.5 MB line is superseded).

## Notes from implementation

(Empty; the main session appends each executor's "Notes for the plan" here.)
