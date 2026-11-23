# Fixes after 1.5.8: plan and briefs

Orchestrator (Fable), 2026-11-23. Base: commit `42012ec` on `ccr-d077e76e-4gnbx2` (the 1.5.8 commit). Nothing in the repository was changed by this review; this file is the whole output. Brief ids B700 to B716 (B697 to B699 stay free); the live views briefs keep their ids from `docs/PLAN-live-views.md` (B641 to B645).

## 1. What was checked, and what is true in the code

| # | Problem | Verified in | Finding |
|---|---|---|---|
| 1 | Toolbar is the expert one | `app/src/renderer/src/components/Toolbar.tsx` (968 lines), `components/play/PlayControls.tsx` | True. One `RadixToolbar.Root` with `flex-wrap` and about 24 controls: Home, New + arrow, Open + arrow, Save, Undo, Redo, Create…, Add, Bring in pictures, Export .zip + arrow, Install, Share my mod, Try it, Play + Reload + menu + status chip + seed + progress, search, AI helper, Help, Settings. It wraps to two rows at 1280. Tips still say "project" ("Open a project to try it."). |
| 2 | Element list shows kind words before names | `components/ElementSidebar.tsx` `rowRegistry`, `ElementRow` (`tagRegistry` span) | True for three groups: Tags (registry before the name: "item Maple logs"), Worldgen (`worldgenRegistryOf`: "placed_feature …", "biome …") and Models and animations ("model", "animation"). Also found: headings "Worldgen", "Entities", "Assets", "More (N technical)"; empty states "No project is open. Use New or Open." and "No namespaces yet. Use Add namespace." (that button left the toolbar in 1.5.8). |
| 3 | Studios not split, surfaces not swept | `docs/ONE-MODE-AUDIT.md`, `studios/*/studios.tsx`, `studios/plain.ts`, `studios/ElementForm.tsx`, `forms/StructEditor.tsx` | True as the audit lists. The schema form labels fields with the raw key (`label={field.key}`). Not in the audit but also unswept: `components/StatusBar.tsx` (the mod's folder path, the target id, "No project open", "error(s), warning(s)") and the native menu `app/src/main/menu.ts` ("New Project…", "Import Assets…", "Rename Element…", "Upgrade Project Target…"). |
| 4 | Painter loses work on Set up Minecraft folder | `App.tsx` line 3316 `openSetUp: () => setDialog({ type: 'settings' })`, one `dialog` state | True, and wider than the painter: seven call sites replace the open dialog with Settings (`minecraftTexturesHost.openSetUp`, `soundSources.onSetup`, the live views' `onSetup`, the preview's `onSetup`, Try it's `onSetUpVanilla`, the no-Minecraft confirm). The Creator loses its answers the same way through a sound picker's Set up. |
| 5 | Showcase and gallery | `ideas/idea-seeds.ts` (`IDEA_CARD_WIDTH = 274`), `ideas/IdeaCard.tsx` (`Button className="border-accent"`), `gallery/card-style.ts` (`auto-cols-[15.125rem]`, `primaryButtonClass`), `App.tsx` 2427 and 3676 (`ideaLive`), `showcase/home-live.ts`, `showcase/ClipView.tsx` (`MAX_PIXEL_RATIO`) | True. Vehicle stills are busy because `drawnStillIfPictures` lays out the example's own pictures, and a vehicle's include its model's skin sheet. The frame rate at ratio 2 cannot be measured here (SwiftShader, load 6 to 18); see decision D6. The list pool element limit is in the assembly engine (`AssembledPiece.template` holds one id) and belongs to the live views track (B712). |
| 6 | e2e flakes | `e2e/launchers-path.spec.ts` `openInstallMenu`, `e2e/live-views-data-path.spec.ts` line 235, `e2e/worldgen-live-path.spec.ts` line 323 | As reported; none root-caused. A fourth from the same runs: `creator-path` Gear set (the `blank` listing caught `pack/.pack.json.<hash>.tmp`, a save's atomic write still in flight). |
| 7 | Search misses | `app/test/search/golden-queries.json` (lines 275, 943, 1122, 1676), `search/sources/guide.ts` (levels 1 to 4 indexed, no depth on the entry), ADR 0124 open items | True. Entries carry no heading depth, so a level-4 "Rules" list and a Triggers section outrank the Rules page. |
| 8 | Live views 4 from B641 | `docs/PLAN-live-views.md` lines 448 to 467 | B641 and B642 are written and their order conditions are met. |
| 9 | `app.asar` unmeasured | DEVLOG (last figure 27.2 of 32 MB at B656), `tools/check-size/index.ts` | True; since then the library grew by 43 flow examples and the renderer from 18.8 to 19.6 MB. Disk: 12 GB free, stop line 10 GB. |

## 2. Decisions taken here (vetoable defaults) and questions for the user

Recorded so the main session can write them into ADRs before the first wave. Draft ADR text is in section 7.

- **D1 One toolbar row.** Home, Undo, Redo, **Save**, Try it, Play, Share my mod, the search field, AI helper, Help, and one **More** menu at the right end holding everything else the toolbar had (New mod, Start from a ready-made mod, Examples, Open, Recent mods, Make something, Add from the full list, Bring in pictures or sounds, Export, Install, Test in Minecraft, Settings). The native File, Edit, View and Help menus stay and get plain words. All keyboard shortcuts stay.
- **D2 Save stays in the row.** The caller's list had no Save. There is no autosave (only the close guard and Play save), so a visible Save is kept, accented while there are unsaved changes.
- **D3 Play's status chip** shows only when it needs the user or tells news (no Prism, restart needed, a game running); the quiet states move into Play's tip and menu. Reload shows only while it can be used.
- **D4 Settings opens over the open dialog** and returns to it; Settings has its own state, apart from the single `dialog`.
- **D5 Element list words:** "World generation" for Worldgen, "Mobs" for Entities, "Pictures and sounds" for Assets, "More things (N)" for "More (N technical)"; kind words become small sub-headings inside a group, never a word before a name. Test ids and group keys do not change.
- **D6 Clips choose their own sharpness.** In place of a one-off measurement on a quiet machine, a clip measures its own frame time and steps its pixel ratio down (2, then 1.5, then 1) while it runs under 24 frames a second. This is right on every machine, the user's included (amends ADR 0128 D3).
- **D7 Idea cards use the gallery's card** (same width 242 px, the same picture box, the accent Make this).
- **D8 Guide entries carry heading depth** (already decided): a page's own title outranks a deep sub-heading of another page.
- **D9 Schema form:** plain labels made from the field's key in the main area; the key itself inside More options and Every setting.
- **D10 Script and Function** stay as their editors (ADR 0130 D4); the audit moves them to a "by decision" table after a sweep of their frames.

Questions that need the user (none blocks wave 1):

1. **Save by itself?** D2 keeps a Save button. The alternative is that mods save by themselves after each change (an ADR of its own: undo across saves, the close guard, Play). Default: keep Save.
2. **A Make something button in the row?** With a mod open, new things start from Home or from the search field ("Search or make anything"), as Very easy did. Default: no extra button.
3. **Publishing:** the user's standing word is "keep going and publishing"; this plan proposes a release after wave 1 (toolbar, lists, the painter fix) and one after wave 3. Default: yes.

## 3. Rules for every brief below

These add to `docs/HANDOFF.md` "Rules for every brief", which all apply.

- **Read first:** root `CLAUDE.md`, `app/CLAUDE.md` (or the package's own), the last DEVLOG entry, ADR 0130 (and 0128, 0129 for Home work), `docs/ONE-MODE-AUDIT.md`, and the files named in the brief.
- **Worktree:** `<scratchpad>/wt-B<nnn>` from the commit the orchestrator names (wave 1: `42012ec`; later waves: the merged head). Commit on your own branch with `GIT_AUTHOR_NAME=Rakib GIT_AUTHOR_EMAIL=rakib1insta@gmail.com GIT_COMMITTER_NAME=Rakib GIT_COMMITTER_EMAIL=rakib1insta@gmail.com`; never `git config`; no push, no merge; no `Co-Authored-By`, `Claude-Session` or other credit lines.
- **Owner files are complete.** Anything else is read-only; a brief that needs another file stops and reports the exact change it needs.
- **Files only the orchestrator edits:** root `CLAUDE.md`, `docs/HANDOFF.md`, `docs/ROADMAP.md`, `docs/ONE-MODE-AUDIT.md`, `docs/adr/`, `CHANGELOG.md`, `app/CLAUDE.md`. Put the lines for them in the report's "Notes for the plan". Each executor appends one DEVLOG entry in its commit (the standing exception; the orchestrator resolves the appends at merge).
- **Existing e2e specs have one owner per wave**, named in the wave table. Everyone else may add new spec files and run existing ones, never edit them. `app/test/components/App.test.tsx` likewise.
- **Never loosen a test:** no skip, no raised timeout, no retry added to make a test pass.
- **Test ids stay** unless the brief says otherwise; component tests and e2e start every More options open (`test/more-options-open.ts`, `MSM_E2E_MORE_OPTIONS=open`), and a default-view test closes them.
- **Exit criteria always:** `pnpm lint`, `pnpm typecheck`, the touched packages' tests; for app briefs `pnpm --filter @msm/app build` and `node tools/check-size/index.ts` (report renderer and first paint; stop and report above 20.5 MB renderer or 5.5 MB first paint), and the named e2e specs under `xvfb-run -a` (run `--trace off`). `dist:dir` is run only by B700.
- **Screenshots** for every visible change: device scale 2, at 1280 and 1920 wide (and 900 where said), saved under `<scratchpad>/shots/B<nnn>/` and listed in the report (ADR 0129 D5).
- **Disk:** `df -h` before each build; stop below 10 GB free; delete `app/out`, `app/dist` and `node_modules/.cache` in your worktree before reporting.
- **No new dependency.** Plain words, British English, no emojis. Version facts only in `packages/targets`.
- **Models:** Opus `claude-opus-5-5` at medium unless the brief says high; a stuck brief is rerun at high.
- **Report:** what changed, the checks with their numbers, screenshots, and "Notes for the plan" (labels, test ids, sentences for the guide, lines for the audit and the changelog, what a later brief must know).

## 4. Order and what can run together

At most five at once. A brief can start as soon as its "after" is merged and no running brief shares a file with it.

| Wave | Briefs (model, effort) | Shared-file owners in this wave |
|---|---|---|
| 0 | **B700** measure `app.asar` (Sonnet) | Runs alone (disk). |
| 1 | **B701** toolbar (Opus, high) · **B702** Settings over dialogs (Opus, medium) · **B703** lists and status bar (Opus, medium) · **B641** processor view (Opus, medium) · **B712** list members (Opus, medium) | Existing e2e specs, `fixtures.ts`, `App.test.tsx`, the AI prompt pin: B701. `App.tsx`: B702. `plain-no-ids.test.tsx`: B703. |
| I1 | Integration by the main session after wave 1 (section 6) | `App.tsx` (six wiring lines), the audit, CHANGELOG, CLAUDE.md. Then a release. |
| 2 | **B711** native menus and the guide (Opus, medium) · **B713** Showcase and gallery polish (Opus, medium) · **B714** e2e flakes (Opus, high) · **B705** split: blocks and items Studios (Opus, medium) · **B642** structures in Try it (Opus, medium) | `App.tsx`: B713. Specs `live-views-data-path`, `worldgen-live-path`, `creator-path`: B714. Specs `home-gallery-path`, `home-ideas-path`, `showcase-path`: B713. The guide and the AI prompt pin: B711. |
| 3 | **B706** split: worldgen Studios (Opus, medium) · **B707** split: Recipe, Tag, Names, Pack settings (Opus, medium) · **B710** Add dialog and Problems (Opus, medium) · **B704** search misses (Opus, high) · **B643** live views e2e (Opus, medium) | `ElementForm.tsx`: B707. Spec `live-views-structures-path`: B643. Then a release. |
| 4 | **B708** Rule book, Script and Function sweep (Opus, medium) · **B709** schema form in plain words (Opus, medium) · **B716** export and other dialogs (Opus, medium) · **B715** split: Structure and Template pool (Opus, medium) · **B644** live views words and guide (Opus and Sonnet) | The AI prompt pin and the guide: B644. `forms/`: B709. |
| 5 | **B645** close of live views 4 (main session) · close of this plan (main session) · **B700** again before the release | |

Notes on the order:

- **B704** (search) shares no file with anything; start it in any free slot from wave 1 on.
- **B711** must follow B701 (it describes the new toolbar). **B714** must follow B701 (B701 edits every spec in wave 1). **B642** must follow B712 (it places every member of a list element). **B715** must follow B641 and B643 (they own the two Studio files and the spec). **B705 to B709 and B715** must follow B703 (the shared sweep helper).
- Only one brief per wave touches the AI prompt (`packages/ai/src/prompt/` and the pinned hash in `app/test/ai-prompt-truth*.test.ts`): B701, then B711, then B644.
- Merge order in wave 1: B702, B701, I1, B703, B641, B712. In wave 2: B713 first (App.tsx), then the rest in any order.
- e2e load: five worktrees building and running Electron at once is the load under which the flakes showed. Each executor runs one e2e process at a time; B701's full run and B714's repeat runs are the long ones.

## 5. The briefs

### B700 Measure `app.asar` (wave 0 and again in wave 5; Sonnet, medium)

- **Purpose:** the asar size has not been measured since B656 (27.2 of 32 MB); the library and the renderer have grown.
- **Owner files:** none (a measurement). No commit.
- **Scope:** on a clean checkout of the named commit, with no other worker building: `df -h` (stop below 10 GB free; if `dist:dir` would cross it, say how much is needed and stop), `pnpm i`, `pnpm build`, `pnpm --filter @msm/app dist:dir` (it runs `scripts/stage-runtime.mjs` first; read `app/CLAUDE.md` and the README's "Releasing" for what that needs), `node tools/check-size/index.ts`. Then delete `app/dist`, `app/out`.
- **Exit criteria:** a report with `app.asar` against 32 MB (stop line 31), the renderer against 21 (20.5), first paint against 6 (5.5), the ten largest files in the asar, the disk used at the peak, and one line: within budget, or what to cut first (ADR 0123's follow-up is the orchestrator's step).
- **Out of scope:** any change to budgets or code.

### B701 One toolbar row (wave 1; Opus, high)

- **Purpose:** ADR 0130's one mode with a plain toolbar (D1 to D3 above; ADR 0131 draft in section 7), and the root cause of the `launchers-path` flake, which lives in the same file.
- **Owner files:** `app/src/renderer/src/components/Toolbar.tsx`; `app/src/renderer/src/components/play/` (all files); `app/test/components/Toolbar.test.tsx`, `ExportControls.test.tsx`, the Play controls' tests (find with `grep -rl play-button app/test`); in `app/test/components/App.test.tsx` and `Home.test.tsx` only the lines that use toolbar or Play test ids; every existing `app/e2e/*.spec.ts`, `app/e2e/fixtures.ts`, `app/e2e/search-helpers.ts`; new `app/e2e/toolbar-path.spec.ts`; `packages/ai/src/prompt/app-map.ts` and the pinned hash in `app/test/ai-prompt-truth*.test.ts`.
- **Not yours:** `App.tsx` (B702), `app/src/main/menu.ts` and `docs/guide/` (B711), `shortcuts.ts` (unchanged).
- **Part A, first and as its own commit: the Install menu that does not open.** `launchers-path` once failed with `install-target` not shown within 15 s after a click on `toolbar-install-menu`. Reproduce it on the base under load (`--repeat-each` with six busy loops, as the "Showcase hover flake" DEVLOG entry of 2026-11-23 did; a probe spec is fine and is not committed). Find the cause with evidence (raw events, the trigger's `disabled` and `data-state` at the click). Things to check, not assume: the trigger is disabled while `exporting` is true after the install before it; `ToolMenu` or its trigger is remounted by a new `header` or `installTarget` while the click is in flight; the `Tip` around the trigger or the closing menu's layer takes the pointer event; `modal={false}` toggling on pointer down then closing on a re-render. Fix it in the app, with a component test that fails on the old code. If it cannot be reproduced in 40 runs under load, report the evidence and the most likely cause; do not change the spec's waits.
- **Part B, the row.** One row, left to right:
  1. **Home** (`toolbar-home`).
  2. **Undo**, **Redo** (`toolbar-undo`, `toolbar-redo`).
  3. **Save** (`toolbar-save`): label "Save"; new optional prop `unsaved?: boolean`: `true` shows it accented with the tip "Save your mod (Ctrl+S). You have changes that are not saved."; `false` shows it quiet with "Everything is saved."; absent, as today. Always enabled with a mod open.
  4. **Try it** (`toolbar-try-it`), **Play** (the Play controls, D3): the Play button and its menu arrow; Reload only while `canReload`; `play-chip` only in the states `no-prism`, `restart-needed` and a running game, else its words are the first line of the Play menu (`play-status`) and part of Play's tip; `play-seed` moves into the Play menu; `play-progress` shows while busy, one line, truncated.
  5. **Share my mod** (`toolbar-share`).
  6. The search field (`toolbar-search`), which takes the spare width.
  7. **AI helper** (`toolbar-ai-helper`), **Help** (`toolbar-help`: Your first mod…, Examples…, What's new…, and with the new optional prop `onGuide` "Guide…" `toolbar-help-guide`).
  8. **More** (`toolbar-more`, a menu button with the words "More"): New mod… (`toolbar-new-project`), Start from a ready-made mod… (`toolbar-new-from-starter`), Examples… (`toolbar-examples`), New mod with the AI helper… (`toolbar-new-with-ai`); Open a mod… (`toolbar-open-project`), Recent mods (`toolbar-open-menu`, a submenu with the same rows and ids as today); Make something… (`toolbar-creator`), Add from the full list… (`toolbar-add-element`), Bring in pictures or sounds… (`toolbar-import-assets`); Export (`toolbar-export-menu`, a submenu with today's entries and ids, the "More exports" entries listed after a separator instead of a third level, and with the new optional prop `onExportMap` "Export as a map…" `export-map`); Install (`toolbar-install-menu`, a submenu with the target header and "Change target" as today); Test in Minecraft… (`export-test-in-minecraft`); with the new optional prop `onModpacks` "Modpacks…" (`toolbar-modpacks`); Settings… (`toolbar-settings`). Disabled entries keep their reason line. `toolbar-export-zip`, `toolbar-new-menu` and `toolbar-new-blank` go away (their uses move to the entries).
  - New optional props render nothing while absent; `ToolbarProps` otherwise keeps its names, so `App.tsx` compiles unchanged.
  - The words say "mod", never "project" (tips, aria labels, reasons).
  - **One row at every width:** no wrapping. From 1200 px down, Try it and Share my mod show their icon only (the words stay in the tip and the aria label); from 1000 px down the search field becomes an icon button that opens the search. CSS only, no measuring in script.
  - Keyboard: the Radix toolbar's arrow keys reach every control; every More entry is reachable by keyboard alone; tips still name the shortcuts.
- **Part C, the specs.** Add to `fixtures.ts`: `toolbarMenu(window, ...ids)` (opens `toolbar-more`, walks submenus by keyboard as `launchers-path` `changeTarget` does, clicks the last id), and `saveMod`, `openCreator`, `openAddDialog`, `openExport(id)` over it. Replace the direct clicks in every spec. `launchers-path` `openInstallMenu` goes through the submenu.
- **Part D, the AI prompt.** `app-map.ts`' toolbar list and sentence follow the row and the More menu; re-pin the hash with a comment line; budget 104,000 kept.
- **Exit criteria:**
  - `Toolbar.test.tsx`: the row's controls in order (at most 12 in the row, counting the Play controls as one); every former toolbar action is in the row or the More menu (a table test over the old test ids); reasons shown on disabled entries; the optional props; `unsaved`.
  - `toolbar-path.spec.ts`: at 900, 1280 and 1920 px wide the toolbar is one row (its height at most 48 CSS px, every direct child at the same top); every More entry opens by keyboard alone; Ctrl+S saves, Ctrl+O, Ctrl+Shift+N, Ctrl+N, Ctrl+Z, Ctrl+Shift+Z, F5, F6, Ctrl+K, Ctrl+Shift+P and Ctrl+Shift+A do what they did.
  - The full e2e suite once (every failure reported with its cause); `launchers-path`, `toolbar-path` and `play-path` green five times in a row under load.
  - App tests, `packages/ai` tests, lint, typecheck, build, check-size.
  - Screenshots at 900, 1280 and 1920: no mod open; a mod open; More open; the Export submenu; Play with no Prism and with a game running.
- **Notes for the plan must include:** the exact JSX lines for I1 (`unsaved`, `onExportMap`, `onModpacks`, `onGuide`), every label, and the sentences the guide needs (for B711).
- **Out of scope:** autosave; a Make something button; the native menus; guide pages.

### B702 Settings opens over the open dialog (wave 1; Opus, medium)

- **Purpose:** pressing **Set up Minecraft folder** inside the painter or New texture closes it and loses the painting (D4). The same happens to the Creator's answers.
- **Owner files:** `app/src/renderer/src/App.tsx`; `app/src/renderer/src/components/SettingsDialog.tsx` (only if stacking or focus needs it); new `app/test/components/settings-over-dialog.test.tsx`; new `app/e2e/settings-over-dialog-path.spec.ts`.
- **Not yours:** `app/test/components/App.test.tsx` and existing specs (B701), `Toolbar.tsx`.
- **Scope:**
  - Settings gets its own state (`{ focus?, focusSetting? } | null`), rendered after and above whatever `dialog` shows. `openSettings` and all seven `setDialog({ type: 'settings' })` call sites use it (lines 879, 3316, 3358, 3397, 3556, 3601, 4526 on the base); the `settings` member leaves `DialogState`. Closing Settings leaves the dialog under it mounted and untouched; focus returns to the control that opened it.
  - The no-Minecraft confirm closes itself and opens Settings (nothing to keep there).
  - After the set-up finishes under an open picker or painter, the thing under it follows by itself (the Minecraft texture picker lists; a sound picker's Play works).
  - Audit every `setDialog(` reachable from inside an open dialog (151 calls; most are openers from the main window). List in the report each one that replaces a dialog holding unsaved input, and fix those in the same way (stack, or ask first). Do not restructure the rest.
- **Exit criteria:**
  - A component test that fails on the base: paint three pixels, press Set up Minecraft folder, Settings shows above, close it, the painter is open with the three pixels and its undo history; the same for New texture (name and size kept), the Minecraft texture picker (search text kept) and the Creator (answers kept) through a sound picker's Set up.
  - The new spec does the painter case in the built app (a stand-in jar as `minecraft-textures-path` uses).
  - Escape closes only the top dialog. App tests, lint, typecheck, build, check-size; e2e `minecraft-textures-path`, `picture-path`, `art-path`, `creator-path` green (run, not edited).
  - Screenshot: Settings over the painter.
- **Out of scope:** the toolbar wiring (I1), `ideaLive` (B713), any other change in `App.tsx`.

### B703 Element list, asset list and status bar in plain words (wave 1; Opus, medium)

- **Purpose:** the sidebar shows kind words before names and expert headings (D5); the asset list and the status bar show paths and ids. Also makes the sweep helper the Studio briefs need.
- **Owner files:** `app/src/renderer/src/components/ElementSidebar.tsx`, `AssetList.tsx`, `StatusBar.tsx`; `app/test/components/ElementSidebar.test.tsx`, `sidebar-potions-data-kinds.test.tsx`, `AssetList.test.tsx`, the status bar's test; `app/test/components/studios/plain-no-ids.test.tsx`; new `app/test/components/plain-sweep.ts`; new `app/test/components/lists-plain.test.tsx`.
- **Scope:**
  - **Sweep helper first (its own commit):** move the string walk of `plain-no-ids.test.tsx` into `plain-sweep.ts`: `readableStrings(container)` (text, input values, placeholder, title, aria-label, alt) and `expectPlain(container)` (every string through `forbiddenIn` of `components/ai/ai-words`), plus `exampleProject(folder)` (a project from `examples/<folder>`). `plain-no-ids.test.tsx` imports them and tests the same things.
  - **No word before a name.** `ElementRow` shows the name only. In the Tags, Worldgen and Models and animations groups, rows are grouped under small sub-headings in plain words (not collapsible): tags by registry ("Item tags", "Block tags", "Mob tags", "Fluid tags", "Function tags", "Biome tags", else the registry's words and "tags"); worldgen by registry ("Biomes", "Features", "Where features go" for placed features, "Carvers", "Structures", "Structure sets", "Building pools" for template pools, "Block changers" for processor lists, "Noise settings", "Noise", "Density functions", "World types" for world presets, "Dimensions", else `groupLabel`'s words); "Models", "Animations". One table, exported and tested.
  - **Headings:** "World generation", "Mobs", "More things (N)", "Pictures and sounds", "No pictures or sounds yet.", "No mod is open. Start one or open one from Home.", "Nothing here yet." in place of the namespace line. The constants that are keys (`WORLDGEN_GROUP`, `ENTITIES_GROUP`, …) keep their values: `group-toggle-<namespace>-<group>` test ids and the collapsed keys do not change; labels come from a separate table.
  - `aria-label`s without ids: a group's section is named by its heading (with the mod part's name before it only when the mod has more than one).
  - **Asset rows:** a plain name from the file name ("ruby_ore.png" as "Ruby ore") with a picture or sound mark; the path is shown by a **More options** at the bottom of the list ("Show where the files are"), which also restores the paths in titles. Buttons: "Paint this picture", "Show in folder", "Remove <name>", "Bring in pictures or sounds…", "New picture…", "Turn a photo into a picture…".
  - **Status bar:** the mod's name in place of its folder path (the folder is reached by **Show in folder** on Home's Your mods), "Saved" or "Not saved yet", "For Minecraft <version>" with "snapshot" where it is one (`project-target` test id kept), "N things to fix" in place of "error(s), warning(s)" (zero shows nothing).
  - The sidebar's search still finds by id and by kind word (`searchFieldsOf` unchanged).
- **Exit criteria:** `lists-plain.test.tsx`: the sidebar, asset list and status bar over three examples (`examples/` projects with tags, worldgen and a mob) pass `expectPlain` with More options closed; no row starts with a kind word; sub-headings as the table; the old test ids present. App tests, lint, typecheck, build, check-size. Run (not edit) e2e `one-mode-path`, `worldgen-live-path`, `creator-path`, `golden-path`, `recent-path`; if one asserts a changed word, stop and report the lines (B701 owns the specs). Screenshots of the sidebar for `fixtures/sample-worldgen`, `sample-mod` and `sample-mob`.
- **Out of scope:** `App.tsx`; a Make something button in the sidebar; the Problems tab (B710).

### B641 The processor view, the Studio link and the parity test (wave 1; Opus, medium)

- As written in `docs/PLAN-live-views.md` (B641) with ADR 0122 and the plan's "The spike's answers" and "Notes from implementation" for B638 and B639.
- **Owner files:** `app/src/renderer/src/liveviews/structures/processors/`, `app/src/renderer/src/studios/structures/StructureStudio.tsx` (the link only), `packages/terrain/test/structures-parity.test.ts`, their tests.
- **Scope:** for `minecraft:worldgen/processor_list`: a template the user picks, before and after with a swipe line and a seed, and the count of blocks each rule changed; the 18 exact, 4 about right and 3 named processor types say which they are; the Structure Studio links to it. The parity test runs the engine over `fixtures/structures-parity/expectations.json` (B639): exact for joins, overlaps, depth, distance and priority winners, statistical for weights (|z| at most 4), on both targets.
- **Exit criteria:** app and `@msm/terrain` tests green; the parity test within tolerance on both targets; an edit redraws within 150 ms (reported); check-size; `docs/LIVE-VIEW-AUDIT.md` line in the notes. Screenshot of the view.
- **Out of scope:** `liveviews/structures/assembly/` and `packages/terrain/src/structures/` (B712), the spec (B643), the Structure Studio's sections (B715).

### B712 Every member of a list pool element is drawn (wave 1; Opus, medium)

- **Purpose:** a list element's piece draws only its first template (B640's note; `AssembledPiece.template` holds one id).
- **Owner files:** `packages/terrain/src/structures/api.ts`, `assemble.ts` and the engine file that names a piece; `packages/terrain/test/structures/` (not `structures-parity.test.ts`); `app/src/renderer/src/liveviews/structures/assembly/` and its tests.
- **Scope:** `AssembledPiece.members` (every template of a list element in the element's order, each with its processors; the first still names the piece; absent for single elements, so nothing else changes). The assembly view draws every member at the piece's place and turn; the step list says "N parts". The order in which members overwrite each other: from the spike's evidence in `docs/reference/spikes/b634/` or the B639 fixture if it holds a list element, else "(verify at implementation)" and say so in the view's note. Remove the "first template only" line.
- **Exit criteria:** `@msm/terrain` and app tests green (a list element of three templates yields three drawn members; single elements unchanged; the 841-piece lattice's times reported against B640's); run `live-views-structures-path` (not edited). Notes for B642: the field's shape.
- **Out of scope:** Try it's grounds (B642), processors (B641).

### B711 Native menus and the guide follow the toolbar (wave 2; Opus, medium; after B701)

- **Owner files:** `app/src/main/menu.ts`, `app/test/main-menu.test.ts`; `docs/guide/*.md` (every page); `packages/ai/src/prompt/app-map.ts` and the pinned hash (only if a quoted menu label changes).
- **Scope:**
  - The native menus in plain sentence-case words, the same words as the More menu's entries from B701's notes: "New mod…", "Start from a ready-made mod…", "Make something…", "Open a mod…", "Recent mods", "Move to another Minecraft version…", "Bring in pictures or sounds…", "Bring in a building…", "Bring in a Blockbench model…", "Rename…", and so on; accelerators and `MenuCommand` ids unchanged; the order follows the More menu.
  - The guide: every page that names the toolbar (22 pages; `grep -l toolbar docs/guide/*.md`) says where the thing now is (the row, the More menu, or the menu bar); `more-options.md`'s toolbar paragraph is rewritten from B701's notes; `very-easy.md`'s stub and the More ideas wording noted in the "Varied More ideas" DEVLOG entry are corrected; no mode words anywhere (`grep -n -i "very easy\|easy mode\|advanced mode" docs/guide`, but for the stub's title that search still needs).
- **Exit criteria:** `main-menu.test.ts` (labels, every accelerator as before, no "Project", "Element" or "Assets" in a label); the search's golden test still green (the guide is indexed: `app/test/search/golden.test.ts`); `packages/ai` and prompt truth tests green; lint, typecheck, app tests; the docs site builds if its command is in `docs/CLAUDE.md`.
- **Out of scope:** the toolbar; the CHANGELOG.

### B713 Showcase and gallery polish (wave 2; Opus, medium)

- **Owner files:** `app/src/renderer/src/ideas/` (all), `components/home/MoreIdeas.tsx`, `components/home/gallery/card-picture.ts`, `card-style.ts`, `showcase/drawn-still.ts`, `showcase/ClipView.tsx`, `showcase/clip-player.ts`, `tryit/render/TryItCanvas.tsx` (its pixel ratio only), `App.tsx` (only `ideaLive`); tests under `app/test/components/home/` and `app/test/components/showcase/`; e2e `home-gallery-path`, `home-ideas-path`, `showcase-path`.
- **Scope:**
  1. **Idea cards are gallery cards (D7):** the gallery's card look from `card-style.ts` (242 px wide, the 240 by 150 picture box, title and sentence type, `primaryButtonClass` for Make this). The windowing follows (`IDEA_CARD_WIDTH`, `IDEA_STEP`, `ideasRowWindow`, the Show all grid's columns); pictures still drawn at exact device pixels with one texel size.
  2. **One arbiter:** remove `ideaLive` from `App.tsx` (`homeGallery(homeClipsVisible, homeClipsVisible)`, no `onLiveChange`), after a test shows `showcase/home-live.ts` alone stops Featured when an idea card plays in the row and in Show all's grid. If the grid is outside `HomeLiveContext`, put it inside rather than keep the second check.
  3. **Calm stills for vehicles and mobs:** a drawn still leaves out a model's skin sheet (a picture used as an entity, vehicle or geo model texture, or under `textures/entity/`) and shows at most three pictures; with none left, the card's own `picture` look. Check every card of the Vehicles and Mobs rows.
  4. **Clips choose their sharpness (D6):** a pure `nextPixelRatio(current, medianFrameMs)` (2 to 1.5 to 1 while the median of the last 30 frames is over 1000/24 ms; never up again for that card in the session), used by `ClipView` through `TryItCanvas`' `maxPixelRatio`. Report the frame rates at 1, 1.5 and 2 for the wood set, the pet and the islands card on this machine (comparable with each other only).
- **Exit criteria:** tests for each of the four (the still of Ember kart, the tank, the plane and the boat holds no skin sheet and at most three pictures; `nextPixelRatio`; equal card widths and heights across the gallery and the More ideas row; the arbiter test); app tests, lint, typecheck, build, check-size; the three specs green three times; screenshots at scale 2, 1280 and 1920: the Vehicles and Mobs rows, the More ideas row beside a gallery row, Show all.
- **Out of scope:** new clips; poster frames rendered from the 3D scene; the guide (sentences go in the notes).

### B714 The e2e flakes, by root cause (wave 2; Opus, high; after B701)

- **Owner files:** `app/e2e/live-views-data-path.spec.ts`, `worldgen-live-path.spec.ts`, `creator-path.spec.ts`; in the app, as the cause needs: `liveviews/data/` (the function view and its Run in Try it), `tryit/WhatHappened.tsx`, `tryit/tryit-store.ts`, `tryit/TryItView.tsx`, `terrain/LiveMap.tsx`, `WorldMap.tsx`, `client.ts`, `worker.ts`, `session/project-session.ts` (save only); their tests.
- **Not yours:** `tryit/grounds.ts`, `terrain/markers.ts`, `packages/sim/src/grounds/` (B642); `tryit/render/` (B713); `App.tsx` (B713).
- **Scope, each by the method of the "Showcase hover flake" entry (reproduce under load, evidence, a fix in the app where a user could hit it, a test that fails on the old code):**
  1. `live-views-data-path` "a function": after **Run in Try it**, What happened had not logged "from function <id>." within 30 s. Find whether the run is dropped (asked before Try it's worker or session is ready) or only late; a dropped run is a product bug.
  2. `worldgen-live-path` "the map": the first map took over 30 s under load. Find where the time goes (worker start, the jar-less data, the first pass); the Height map is already over its budget (3.4 to 3.9 s, ADR 0119). If the map is only slow in proportion to the load, show the measurement and propose what the test should wait on (a state attribute, not a longer clock); do not raise the timeout yourself.
  3. `creator-path` Gear set: the `blank` listing caught `pack/.pack.json.<hash>.tmp`. Decide with evidence whether `save` resolves before its rename (a product bug: fix it) or the spec lists the folder before awaiting the save.
- **Exit criteria:** for each, the cause in one paragraph with evidence, the fix, and the spec green ten times in a row with six busy loops; or, if not reproduced in 40 loaded runs, the evidence and the probable cause, with nothing loosened. App tests, lint, typecheck, build.
- **Out of scope:** `launchers-path` (B701).

### B705 Split: the blocks and items area's remaining Studios (wave 2; Opus, medium; after B703)

- **Studios:** Particle (`msm:particle`), Creative tab (`msm:creative_tab`), World addition (`msm:biome_addition`), Extra drops (`msm:loot_addition`), Vanilla block rules (`msm:vanilla_block_rules`).
- **Owner files:** `app/src/renderer/src/studios/blocks-items/ParticleStudio.tsx`, `CreativeTabStudio.tsx`, `AdditionStudios.tsx`, the vanilla block rules Studio's file, `studios/blocks-items/studios.tsx`; new `app/test/components/studios/blocks-items/plain-split.test.tsx`.
- **How to split (the same for B706, B707 and B715):**
  - Give each Studio entry a `common` list of section test ids, declared in the area's own `studios.tsx` (not in `studios/plain.ts`, which other briefs read).
  - Common means what a first-timer must set to get a working thing: its look or pictures, its live view, and the two or three settings that change what a player sees. Everything else goes to that section's **More options** (`InMore`, or the section's `more`): ids, references to files and models, rarely changed numbers, raw values. Nothing is removed.
  - A section's one-line why comes from `studios/section-why.ts`; where one is missing or wrong, pass the section its own `why` (do not edit the shared table) and list it in the notes.
  - A Studio that keeps its own "Every setting" switch moves to the shared More options.
- **Exit criteria:** per Studio, over a real library example of the kind (find it in `examples/`; say which): the default view (every More options closed) passes `expectPlain` from `app/test/components/plain-sweep.ts`; with every More options open, the set of field pointers and test ids is the same as before the change (no field lost; a test that compares against the base's set, recorded in the test); the `common` list is not empty and holds the live view. Area tests, app tests, lint, typecheck, build, check-size; e2e `particles-path`, `blocks-items-path`, `plants-path` green (run, not edited; report any line that needs to change). Screenshots of each Studio's default view and with More options open. Notes: the rows for `docs/ONE-MODE-AUDIT.md`.
- **Out of scope:** new settings; the Studios already split.

### B642 Structures in Try it and on generated land (wave 2; Opus, medium; after B712)

- As written in `docs/PLAN-live-views.md` (B642): **Walk in it** loads the assembly as the ground through the structure ground B558 left, and on "My world generation" places the pieces where B585's markers stand; flatten, crop a window around the start piece and show "N of M pieces shown" beside B558's `cut`.
- **Owner files:** `packages/sim/src/grounds/`, `app/src/renderer/src/tryit/grounds.ts`, `app/src/renderer/src/terrain/markers.ts`, their tests.
- **Addition:** every member of a list element is placed (B712's `members`).
- **Exit criteria:** sim and app tests green; e2e `tryit-path` and `worldgen-live-path` green (run, not edited: B714 owns the second this wave); the frame rate reported; check-size.

### B706 Split: the worldgen Studios (wave 3; Opus, medium)

- **Studios:** Biome, Placed feature, Tree, Dimension type.
- **Owner files:** `app/src/renderer/src/studios/worldgen/BiomeStudio.tsx`, `PlacedFeatureStudio.tsx`, `TreeFeatureStudio.tsx`, `DimensionTypeStudio.tsx`, `dimension-type-sections.tsx`, `studios/worldgen/studios.tsx`; new `app/test/components/studios/worldgen/plain-split.test.tsx`.
- **Not yours:** `studios/worldgen/parts.tsx` (the shared `Section`), `MapLine.tsx`.
- **Scope and exit criteria:** as B705's "How to split" and criteria. The live world map line (**See it on the map**, **Walk in it**) is common in each. e2e `worldgen-path` and `worldgen-live-path` green (run). Screenshots per Studio.

### B707 Split: Recipe, Tag, Names and translations, Pack settings (wave 3; Opus, medium)

- **Owner files:** `app/src/renderer/src/studios/RecipeStudio.tsx`, `TagStudio.tsx`, `LangStudio.tsx`, `PackSettings.tsx`, `studios/ElementForm.tsx` (the built-in entries' `common` lists only), `studios/recipe-grid.ts` if needed; new `app/test/components/studios/plain-split-built-in.test.tsx`.
- **Scope:** as B705's "How to split". Recipe: the grid and the result are common, ids of ingredients as names with the id in More options, its own "Every setting" switch replaced by the shared one. Tag: members by name with pictures (the live view "Everything in a tag") common; ids, `replace` and required flags in More options. Names: the list of names by thing; language codes and keys in More options. Pack settings: the pack's name, description and picture common; formats and filters in More options.
- **Exit criteria:** as B705's; e2e `datapack-path`, `golden-path`, `library-path` green (run). Screenshots per Studio.
- **Out of scope:** the Function editor (B708); the schema form (B709).

### B710 The Add dialog and the Problems tab in plain words (wave 3; Opus, medium)

- **Owner files:** `app/src/renderer/src/components/NewElementDialog.tsx`, `ProblemsPanel.tsx`, `app/test/components/NewElementDialog.test.tsx`, `ProblemsPanel.test.tsx`; new `app/test/components/add-and-problems-plain.test.tsx`.
- **Scope:**
  - **Add:** the default view asks what to add (the 309 templates by their plain titles and groups, the filter box as now) and its name; the id made from the name is shown as a line only in a **More options** that also holds "Which part of the mod" (the namespace, shown only when the mod has more than one) and the id field with its old test ids (`new-element-name`, `new-element-namespace`, `new-element-new-namespace`). Kind ids never show in the default view. The placeholder is a name ("Ruby block"), not an id.
  - **Problems:** each row leads with the plain sentence Things to fix uses for it (`ThingsToFix.tsx` and the plain-problem words are read-only; reuse them), with the code, the id and the file path in the row's More options. The tab's name becomes "Every problem" with a line saying Things to fix is the short list. Jump-to still works.
- **Exit criteria:** the new test: both default views pass `expectPlain` over a project with ten different problems and over the template list on both targets; the id field still works with More options open (the existing tests unchanged in meaning). App tests, lint, typecheck, build, check-size; e2e `golden-path`, `datapack-path`, `one-mode-path` green (run; with More options open in e2e the old ids are reachable). Screenshots of both.
- **Out of scope:** `ThingsToFix.tsx`; the search's templates source.

### B704 Search: the four misses (any free slot; Opus, high)

- **Owner files:** `packages/search/src/` and `packages/search/test/`; `app/src/renderer/src/search/sources/guide.ts`; `app/test/search/` (the golden file, runner and tests).
- **Scope:**
  - **Heading depth (D8):** guide entries carry their heading level (1 for the page's own title to 4); ranking prefers a shallower heading when two guide entries match the same words about as well, so "how do rules work" opens the Rules page (`guide:rules#…` at its top), above the Triggers section of Blocks and items and the Templates page's level-4 "Rules". A signal in `rank/signals.ts` with a weight in `weights.ts`, not a special case for one query.
  - "how do I make a game" (expects `guide:creator#make-a-game` or `guide:game-modes#game-modes`), "how do I make a machine" (expects the Containers and machines page's Make a machine section or its top; it is third now), "tp to spawn" (expects `rule:step:teleport`: "tp" as a same-word of teleport, "spawn" as the place). Find each cause first; say whether depth alone fixes the two how-tos.
  - Read `packages/search/CLAUDE.md` and ADR 0124's open items; the seven `needs` queries are not in scope unless a fix here closes one (then drop its `needs` with the reason).
- **Exit criteria:** the four first on all eight configurations; the golden test's bars all met and the overall first rate not below 97.0 % (report the new figure and every query whose rank changed, with its reason line in the golden file); `packages/search` tests; the search worker's time for the 241 queries not slower than before by more than 5 % (report); lint, typecheck, app search tests; e2e `search-path` and `search-keyboard-path` green (run).
- **Out of scope:** the panel; plugin vocabularies other than the Rules plugin's `tp` word if that is where it belongs (then stop and report: `packages/plugins/rules/src/search*` is not yours).

### B643 Live views 4 e2e (wave 3; Opus, medium; after B641 and B642)

- As written in `docs/PLAN-live-views.md` (B643). **Owner files:** `app/e2e/live-views-structures-path.spec.ts`.
- **Exit criteria:** the fixture's pool assembles, steps, changes with a seed and with an edit; a list element shows all its parts (B712); a processor list changes a template; the Jigsaw structure flow's Live tab shows an assembly; Walk in it opens the ground; green three runs in a row.

### B708 Rule book, Script and Function: the sweep (wave 4; Opus, medium)

- **Owner files:** `app/src/renderer/src/studios/rules/` (all), `studios/scripting/ScriptStudio.tsx`, `studios/FunctionEditor.tsx`; new `app/test/components/studios/rules/plain-book.test.tsx` and `app/test/components/studios/editors-plain.test.tsx`.
- **Scope:** the Rule book's default view (cards in sentences; What this becomes, Copy as my own script and rule keys already in More options) passes the sweep over the library's rules examples, with any id left in a card moved to the card's More options; its entry gets a `common` list if it has sections. Script and Function stay as their editors (D10): only the frame around the editor (titles, help lines, buttons, the summary lines) is swept; the code itself is the user's text and is not.
- **Exit criteria:** the two tests; app tests, lint, typecheck, build; e2e `rules-path`, `scripting-path` green (run). Notes: the audit rows, with Script and Function for the "by decision" table. Screenshots.

### B709 Kinds without a Studio: the schema form in plain words (wave 4; Opus, medium)

- **Owner files:** `app/src/renderer/src/forms/` (all); `app/test/components/forms/`; new `app/test/components/forms/plain-labels.test.tsx`.
- **Scope (D9):** where the view is plain (`usePlain()`: the main area of a kind without a Studio), a field's label is words made from its key ("min_height" as "Min height"), its help line is the schema's own description where the mcdoc has one, enum values show as words, and id fields show names (the `IdField` plain path the Studios use) with the id in the field's More options. Inside an open More options and in **Every setting** the labels stay as the schema writes them (experts search by key). Pointers and test ids do not change.
- **Exit criteria:** the new test over five kinds without a Studio (an advancement, a loot table, a damage type, a font, an enchantment from `examples/`): the main area passes `expectPlain` but for the user's own text values; the same fields are editable; inside More options the keys are as before. The forms tests (meaning unchanged), app tests, lint, typecheck, build, check-size; e2e `datapack-path`, `golden-path` green (run). Screenshots of two kinds.
- **Out of scope:** new Studios; `@msm/schemas`.

### B716 The export, install and other dialogs in plain words (wave 4; Opus, medium)

- **Owner files:** `app/src/renderer/src/components/ExportFabricJarDialog.tsx`, `ExportJavaProjectDialog.tsx`, `ExportMapDialog.tsx`, `PluginExportDialog.tsx`, `ModpacksDialog.tsx`, `TestInMinecraftDialog.tsx`, `UpgradeTargetDialog.tsx`, `RenameElementDialog.tsx`, `UsagesDialog.tsx`, `ImportAssetsDialog.tsx`, `ImportFilesDialog.tsx`, their tests; new `app/test/components/dialogs-plain.test.tsx`.
- **Scope:** each dialog opens with one line saying what it does in the user's terms; the settings most people need are in view; mod ids, versions, loader ranges, paths typed by hand and raw names go to a **More options** in the dialog (same component, remembered per dialog). Change id says what changing an id means and what follows (it is itself an expert action reached from More options: its body may show ids, its title and help may not assume them). Titles say "mod", never "project".
- **Exit criteria:** the new test: each dialog's default view passes `expectPlain` (but Change id and Find usages, which are listed as expert bodies with plain titles); every old field reachable with More options open. App tests, lint, typecheck, build, check-size; e2e `eject-path`, `maps-path`, `modpacks-path`, `plugins-path`, `targets-path`, `launchers-path` green (run). Screenshots of each.

### B715 Split: Structure and Template pool (wave 4; Opus, medium; after B641 and B643)

- **Owner files:** `app/src/renderer/src/studios/structures/StructureStudio.tsx`, `TemplatePoolStudio.tsx`, `ContainersSection.tsx`, `studios/structures/studios.tsx`; new `app/test/components/studios/structures/plain-split.test.tsx`.
- **Scope and exit criteria:** as B705's "How to split". Common: the 3D view, Chests and containers, the link to the processor view and **Assemble from here**; their own "Every setting" switches become the shared More options. e2e `live-views-structures-path`, `maps-path` green (run). Screenshots.

### B644 Live views 4: AI helper words, guide and changelog lines (wave 4; Opus for the prompt, Sonnet for the guide)

- As written in `docs/PLAN-live-views.md` (B644). **Owner files:** the AI helper's prompt files for structures and the pinned hash; `docs/guide/structures.md`, `docs/guide/live-views.md`. The CHANGELOG lines go in the notes (the orchestrator edits it).
- **Addition:** its guide half owns all of `docs/guide/` in wave 4 and also applies the guide sentences from the notes of B713, B705 to B710, B715 and B716 (the orchestrator hands them over), so the pages on the Showcase, More options and the Studios match what was built.
- **Exit criteria:** `packages/ai` and the prompt truth tests green within the 104,000 budget; the search's golden test green (the guide is indexed); lint.

### B645 Close of live views 4 (wave 5; main session)

- As written in the plan (as B618, for ADR 0122).

## 6. The main session's own steps

- **Before wave 1:** write ADR 0131 from section 7 and the amendment lines (ADR 0128 D3 for D6; ADR 0124's open items for D8); add a ROADMAP section "One mode: the rest" with a checkbox per brief; put the three questions of section 2 to the user.
- **I1, after wave 1 merges (a few lines, no executor needed):** in `App.tsx`' `<Toolbar …>` add `unsaved={snapshot.dirty}`, `onExportMap={handlers.exportMap}`, `onModpacks={handlers.modpacks}` and `onGuide` (the handler that opens the guide dialog), exactly as B701's notes give them; change `saveDisabledReason`'s words to "No mod is open."; run app tests, `toolbar-path` and `one-mode-path`. Update `docs/ONE-MODE-AUDIT.md` (the toolbar, the lists, the status bar), CHANGELOG `[Unreleased]`, `app/CLAUDE.md`, root `CLAUDE.md`. Review each diff against its exit criteria and the screenshots; then a release if the user's word still stands.
- **After each later wave:** merge in the order of section 4; update the audit from the notes (a Studio moves to the first table; Script and Function to a new "By decision" table; surfaces struck from "not swept yet"); the full e2e suite once on the merged head; B700's measurement before any release.
- **Close:** ADR 0130 to "accepted with findings" with the audit's last state; ADR 0131 accepted; the HANDOFF rewritten; this plan's leftovers into ROADMAP.

## 7. Draft ADR text

**ADR 0131: One toolbar row, and Settings over the open dialog** (Proposed; the defaults are vetoable)

- *Context.* ADR 0130 kept one toolbar but it is the expert one: about 24 controls in two rows. Settings shares the single open-dialog state, so opening it from inside the painter, New texture or the Creator closes that dialog and loses what was in it.
- *D1.* The toolbar is one row: Home, Undo, Redo, Save, Try it, Play, Share my mod, the search field, AI helper, Help and a More menu. Everything else the toolbar had is in More; the native menus hold the same things in the same words. Every shortcut stays.
- *D2.* Save stays in the row and is accented while there are unsaved changes (there is no autosave).
- *D3.* Play's status shows in the row only when it needs the user or a game is running; Reload only while it can be used.
- *D4.* The row never wraps: below 1200 px Try it and Share my mod show icons, below 1000 px the search field is a button.
- *D5.* Settings has its own state and opens over any open dialog, which stays as it was.
- *Consequences.* The e2e specs reach moved actions through one helper; the guide and the AI prompt's app map follow; ADR 0130 D4's "one toolbar" line now points here.

**Amendment to ADR 0128 D3:** a clip steps its pixel ratio down from 2 to 1.5 to 1 while its own median frame time is over 1000/24 ms, and does not step up again for that card in the session (replaces the open item "measure at ratio 2 on a quiet machine").

**ADR 0124, open items:** "how do rules work" closed by a heading-depth signal on guide entries (B704).

## 8. DEVLOG entry for the main session to append

```
## 2026-11-23 — orchestrator — Plan for the fixes after 1.5.8

**What**
- Reviewed what is left after 1.5.8 against the code at 42012ec and wrote briefs B700 to B716 with the live views briefs B641 to B645 in five waves of at most five (plan: `fable-fixes-plan.md`). No code changed.
- Verified: the toolbar (about 24 controls, wraps to two rows), the sidebar's kind words (`rowRegistry`), the Studios and surfaces of `docs/ONE-MODE-AUDIT.md`, the painter loss (Settings replaces the one open dialog at seven call sites, the Creator included), the idea card's size and button, `ideaLive`, the three e2e flakes and a fourth (`creator-path`), the four search misses, the unmeasured asar.
- Found besides: the status bar and the native menus are not in plain words; the sidebar's empty lines name buttons that left the toolbar; the schema form labels fields with raw keys.

**Decisions** (vetoable defaults)
- One toolbar row with Save kept and a More menu (ADR 0131 to write); Settings opens over the open dialog; clips step their own sharpness down under 24 frames a second (amends ADR 0128 D3); idea cards use the gallery's card; guide entries carry heading depth; the schema form shows words in the main area and keys in More options; Script and Function stay editors.
- One owner per wave for the existing e2e specs, `App.tsx` and the AI prompt pin.

**Next**
- B700 alone, then wave 1: B701, B702, B703, B641, B712; I1 and a release.
- Ask the user: Save by itself or a Save button; a Make something button in the row.
```

## 9. Notes from wave 1 (main session)

- B641's processor view shows the preview's "No blockstate for minecraft:…" list in plain view when the Minecraft folder is not set up (a leak of ids under the 3D view, seen in its screenshot): fold it into a plain line ("N blocks need your Minecraft folder to draw") with the ids under More options. Owner: B643 (it owns the structures views' e2e and can touch `liveviews/structures/processors/`), or the preview's shared message if it comes from `preview/structure.ts` (then B713).
- Engine follow-ups from B641 (B712's folder `packages/terrain/src/structures/processors/`): default properties in block state tests (block defaults from `packages/targets`), `isFullBlock` for air and the sea lantern; remove the matching `KNOWN` entries in `structures-parity.test.ts`.
- From the Try it fix (2026-11-23): the land-still queue (`showcase/land-still.ts`) keeps making clip areas after Home unmounts (cancel it when the gallery goes: B713); Try it's first-run card and the "Choose what to hold" picker still sit inside the picture and squeeze at narrow widths (B713 or a Try it brief).
- From B702 (merged): the Minecraft texture picker's own Set up still closes the picker (`MinecraftTexturePicker.tsx` calls `onClose()` first) — keep it open once `minecraft-textures-path` step 1 closes the picker before Home's tile (B711 or B713); native menu commands still replace an open dialog (make them wait as shortcuts do: the next `App.tsx` owner, B713); the Creator's live views' Set up (`CreatorPreview.tsx` 232, 303) only shows a message and can open Settings now; dialogs at z-[70] (Make with AI, Draw) sit above Settings opened from the menu; ADR 0131 D5 gains the line "a dialog that closes itself before asking for the set-up is not kept; Settings opens over what was under it".
