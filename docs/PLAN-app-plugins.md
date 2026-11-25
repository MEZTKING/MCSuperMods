# App plugins: plan and briefs (Plan E)

Orchestrator (Fable), 2026-11-25. Checked at commit `3a4ca9f` on `ccr-d077e76e-4gnbx2`. Nothing in the repository was changed by this plan but for this file, [ADR 0137](adr/0137-app-plugins-extension-points-permissions-and-the-catalogue.md) (Proposed), a ROADMAP section, one pointer line in DESIGN §7 and a DEVLOG entry. Brief ids **B840 to B879** (the highest id in the docs before this plan is B839; B832 to B839 stay Plan D's free reserve). The running plans (`PLAN-one-mode-rest.md`, `PLAN-game-studio.md`, `PLAN-instances.md`, `PLAN-paper.md`, `PLAN-live-views.md`, `PLAN-version-upgrades.md`) are not changed.

The user's words (2026-11-25): "Make a plugin support system so anybody can add plugins to modify this application"

**B840 has run (2026-11-25):** its answers are in `docs/reference/spikes/b840/README.md` and are folded into ADR 0137 and the briefs below. Verdicts: the view kit is go (host-held field values); staying in the renderer is go, with conditions (main handles `render-process-gone`, the bootstrap closes S7's leaks, a heartbeat while idle). B867 is dropped, B864 is kept and sized, and a new brief B871 hardens today's workers now.

In one paragraph: today a plugin can add content (kinds, templates, starters, checks, importers, exporters) and nothing else. This plan lets a plugin change the app itself: commands, menus, shortcuts, Home rows, Settings pages, Studios and sections, live views, fixes, AI helper skills, themes, Try it tools, export steps and hooks. Plugin code still runs only in its sandboxed worker; its screens are drawn by the app from a fixed kit of parts; what it may reach is listed in plain words before install; every change to a mod is one undo step. Plugins come from a file, a link or a reviewed catalogue in the community repository, update only on a click, and can be turned off one by one, all at once, or by starting in safe mode. Plugin makers get a kit: templates, a typed API, a test harness, hot reload in the app and an inspector.

## 1. What was checked, and what is true

| # | Subject | Verified in | Finding |
|---|---|---|---|
| P1 | The sandbox | [ADR 0035](adr/0035-plugin-sandbox-and-capability-manifest.md) D1 to D6; `app/src/renderer/src/plugins/sandbox/` (`host.ts`, `protocol.ts`, `worker-bootstrap.ts`), `external-plugins.ts` (902 lines) | One Web Worker per plugin in the renderer, started from a `Blob` of the bootstrap and the bundle; network and storage globals removed; the host builds a proxy `Plugin` whose functions are messages with deadlines (2 s, 5 s, 30 s, 120 s). Requests go host to worker only: the worker cannot ask the host for anything. |
| P2 | The manifest | ADR 0035 D2; `plugins/manifest.ts` (255 lines); `fixtures/sample-plugin/msm-plugin.json` | `manifestVersion: 1`; `capabilities` lists contribution points (`elementKinds`, `elementTemplates`, `projectStarters`, `examples`, `validators`, `exporters`, `importers`). No permissions. `editors`, `commands`, `targets` ignored with `plugin.capability-unsupported`. Ids may not start `minecraft` or `msm`. |
| P3 | Main's part | `app/src/main/platform/plugins.ts` (281 lines) | Scans `<msmHome>/plugins/*/msm-plugin.json`, validates with zod, hands the bundle (at most 4 MB) and schema files (8 MB each) to the renderer as text. No hash, no package format, no install or remove, no watch. |
| P4 | CSP and scheme | `app/src/renderer/index.html`; ADR 0035 D1a | `default-src 'self'; script-src 'self'; worker-src 'self' blob:; connect-src 'self'; img-src 'self' data:; media-src 'self' blob:; style-src 'self' 'unsafe-inline'`, served from `msm-app://`. |
| P5 | The API's app-facing types | `packages/plugin-api/src/contributions.ts` lines 107 and 234 | `EditorContribution { kindId; component: unknown }`; `Command { id; title; run(): void }` with no context. Neither can cross the worker. `ElementMeta` has `createdAt`, `notes`, `tags`, `creator`; no plugin bag. |
| P6 | Compatibility policy | [ADR 0036](adr/0036-plugin-api-1.0-and-compatibility-policy.md) D1; `packages/plugin-api/CLAUDE.md` | 1.x additive; a deprecation lasts "at least one minor". The API has had 30 minors in three weeks, so one minor is days. API 1.30.0; 1.28.0 reserved for Plan C's B782. |
| P7 | Commands and keys | `app/src/renderer/src/commands/built-in-commands.ts` (485 lines, `BUILT_IN_COMMAND_IDS`, words for search), `shortcuts.ts` (92 lines), `components/CommandPalette.tsx` | A fixed list. No rebinding screen was found (verify at implementation). |
| P8 | Studios | `studios/studio-registry.ts` (`collectStudios` over `import.meta.glob('./*/studios.tsx')`), `studios/types.ts` (`StudioEntry`) | Compile-time discovery of React components. Nothing dynamic. |
| P9 | Live views | `liveviews/registry.ts` (`LIVE_VIEWS`, a frozen record of lazy loaders, `LiveViewProps`), `liveviews/BundleLiveView.tsx` | Keyed by kind; a bundle view already shows live views of several things together, which is the seam for "from the lowered files". |
| P10 | Things to fix | `components/ThingsToFix.tsx` (335 lines; `PlainFix`, `PLAIN_FIX_LABELS`, `onFix`) | A table inside the app from problem code to plain sentence and one-step fix. Plugin codes read "Something in <thing> needs fixing". |
| P11 | Changesets | `app/src/renderer/src/changeset/changeset.ts` (`ChangesetPlan`, `ChangesetSummary`), the AI helper's tray (ADR 0125), undoable asset writes ([ADR 0045](adr/0045-undoable-asset-writes.md)) | A planner that turns a set of adds and changes into one undo step with a summary already exists for the AI helper and the Creator. |
| P12 | AI helper tools | `packages/ai/src/tools/` (`catalogue.ts`, `read.ts`, `propose.ts`, `check.ts`, `decide.ts`, `note.ts`); ADR 0125 D7 | A fixed catalogue; the prompt is pinned by truth tests with a budget of 104,000 characters. |
| P13 | Colours | `app/src/renderer/src/styles.css` (67 lines) | Eight colour tokens and two fonts as Tailwind theme variables; dark values under `prefers-color-scheme`. No theme choice. Whether components use colours outside the tokens is not counted (spike T1). |
| P14 | Words | grep for a translation layer in `app/src/renderer/src` | None. The app's words are written in components. |
| P15 | Settings | `components/SettingsDialog.tsx` (989 lines; `PluginsSection`), `settings-catalogue.ts`, `docs/guide/plugins.md` | Plugins: a list with Loaded, Refused or Failed and **Open plugins folder**. Install is "copy a folder and restart". |
| P16 | Developer kit today | `tools/new-plugin` (`--external`), `fixtures/sample-plugin` (build, test, mcdoc), the tarball of `@msm/plugin-api` on each release (ADR 0036 D7), the docs site (ADR 0039), e2e `plugins-path` | Content only. No harness that speaks the worker protocol, no reload, no inspector. |
| P17 | The community repository | `tools/community-repo` (README) | Mirrors `examples/` into MEZTKING/MCSuperMods-Community with a `--check` its CI runs. No plugins tree. |
| P18 | Start without restart | `external-plugins.ts`; `@msm/core` `registerPlugin` | Plugins load once at start-up; no unregister was found in core (spike S9). A failed plugin's kinds stay registered and unavailable, which is the model for "off". |
| P19 | Sizes | B818's DEVLOG entry | Renderer 20.1 of 21 MB (stop line 20.5), first paint 5.2 of 6 (stop line 5.5), `app.asar` 29.1 of 32. There is about 0.4 MB before the renderer's stop line. |
| P20 | Updater and network in main | `app/src/main/updater.ts`, `release-notes.ts` | Main already fetches for the app's own updates; no general broker exists. |

## 2. Decisions taken here (vetoable defaults) and questions for the user

The decisions are ADR 0137's D1 to D14; in short:

- **D1** Three tiers: data, code without a screen, code with a screen; the lowest tier that does the job.
- **D2** Fifteen extension points (commands, shortcuts, Home rows, Settings pages, Studio layouts, Studio sections, views, live views, fixes, AI tools, themes, Try it tools, export steps, hooks, text).
- **D3** Screens are a view tree drawn by the app from a fixed kit; no iframe, no DOM for plugins; a canvas for free drawing.
- **D4** Permissions in the manifest, shown in plain words before anything runs and again when an update asks for more.
- **D5** A plugin changes a mod only by a changeset: one undo step, on a user action, shown first when large.
- **D6** The network only through main, `https:` to the named hosts.
- **D7** Workers, deadlines, limits; start and stop without a restart.
- **D8** Off switches, safe mode, hash pinning, a signed catalogue index, recall; the list of what a plugin can never do.
- **D9** App-wide install, per-project use; from a file, a link or the catalogue; updates on a click with changelogs.
- **D10** A plugin's own words in several languages now; the app's own words later.
- **D11** The developer kit: `@msm/plugin-kit`, templates, harness, dev mode with hot reload, the inspector, docs.
- **D12** A live view for every visible plugin kind, from its lowered files by default.
- **D13** Stable and experimental members; nothing stable removed before 2.0.
- **D14** Words, and the plugin's name on everything it adds.

Questions for the user (the spike and wave P1 do not wait for them):

1. **Who lets a plugin into the catalogue?** *Default: you (or someone you name) approve each new plugin and each version that asks to do more; a version that asks for the same or less goes in by itself once the automatic checks pass.*
2. **Plugins from outside the catalogue.** May people install a plugin from a file or a link that nobody checked? *Default: yes, with "Not checked by MCSuperMods" at the top of the question and the same list of what it may do.*
3. **Looking for updates.** May the app ask GitHub once a day whether your plugins have updates, sending nothing about you? *Default: yes, with a switch in Settings; an update is never installed without a click.*
4. **The internet.** May a plugin use the internet at all? *Default: yes, only the sites it names, shown before install, with the extra line "It can send what is in your mod to …" when it can also read your mod.*
5. **Plugins inside a mod's folder.** Should a mod be able to carry its plugins so they load when the mod is opened? *Default: no. Opening a downloaded mod must never run code; the mod names the plugins it uses and the app offers to get them.*
6. **The app's own words.** Should plugins be able to translate MCSuperMods itself now? *Default: later. Plugins can translate their own words now; translating the app needs its words gathered into one list first (reserve B865, sized by spike T2 at about 3,800 places in 375 files).*
7. **What may be listed.** *Default: only free plugins whose source is open to read, with a licence named. Paid or closed plugins can still be installed from a file.*
8. **Plugins and the game mod.** Should a plugin be able to add Java to the runtime mod that players install? *Default: no. A plugin's content reaches the game as files, like everything else; Java in the runtime would need its own decision.*

Not asked, decided: the word stays "Plugins"; third-party plugins still cannot add Minecraft versions; no `msm://` links that install on a click from a web page (reserve); no telemetry of any kind about plugins.

## 3. Rules for every brief below

These add to `docs/HANDOFF.md` "Rules" and "Rules for every brief", which all apply.

- **Read first:** root `CLAUDE.md`, the scoped `CLAUDE.md` of the area, the last DEVLOG entry, ADRs 0035, 0036, 0130 and 0137, `docs/guide/plugins.md`, `docs/reference/spikes/b840/README.md` (its answers S1 to S13 and T1 to T3 are facts this plan relies on), and section 7's notes.
- **Plugin code runs only in its worker.** No brief evaluates plugin text anywhere else, adds a preload function a plugin could reach, or widens the CSP. A brief that believes it must stops and reports.
- **Manifest version 1 keeps working.** `fixtures/sample-plugin` and e2e `plugins-path` stay green unchanged in every brief.
- **`@msm/plugin-api` stays without internal dependencies, Node types and DOM types.** New members go in `packages/plugin-api/src/app/`, are optional, carry full JSDoc with `@experimental` or `@stable`, and no brief of this plan edits `target.ts`. The minor's number is named by the main session when the brief starts.
- **The hostile plugin.** `fixtures/hostile-plugin` (made by B842) tries what must fail; a brief that adds a host call, a permission or an extension point adds its attack to it and a test that the attack fails.
- **Every host call checks its permission in the host**, never in the worker bootstrap alone, and has a deadline and a size limit.
- **No writes but changesets.** Nothing a plugin returns is written to a project except through the changeset planner as one undo step.
- **One mode** (ADR 0130): the words of ADR 0137 D4 and D14; ids, versions, hashes, hosts in full and permission codes under More options. British English, no emojis. Whatever a plugin adds shows the plugin's name.
- **Findable** (ADR 0124 D15): Settings > Plugins, Get more, safe mode and the dev tools get search words; plugin commands are found through the door rows.
- **Live view:** a brief that lets a plugin add something visible names how it is seen live (D12).
- **No network in tests.** The catalogue and the broker are tested against local fixtures.
- **No new dependency in the app.** `@msm/plugin-kit` may use the bundler the sample plugin already uses (verify at implementation); anything else stops and reports.
- **Size:** everything in the renderer is a lazy chunk unless the brief says first paint; `node tools/check-size/index.ts` in every app brief with the three numbers in the DEVLOG entry; stop and report at the stop lines (20.5 MB renderer, 5.5 MB first paint, 31 MB asar).
- **Files with one owner at a time across all plans** (named by the main session): `packages/plugin-api/src/index.ts`, `plugin.ts`, `version.ts`, `CHANGELOG.md` and `CLAUDE.md`; `app/src/renderer/src/plugins/external-plugins.ts`; `app/src/renderer/src/session/project-session.ts`; `app/src/renderer/src/App.tsx`; `app/src/shared/ipc-channels.ts`; `app/src/renderer/src/components/SettingsDialog.tsx` and `ThingsToFix.tsx`; `app/src/renderer/index.html`; `tools/check-deps/layers.json`; `pnpm-lock.yaml`; `.github/workflows/ci.yml`; `docs/guide/`; `packages/ai/src/prompt/`.
- **Exit criteria always:** `pnpm lint`, `pnpm typecheck`, the touched packages' tests, `node tools/check-deps/index.ts`; app briefs also `pnpm --filter @msm/app build`, `node tools/check-size/index.ts` and e2e `plugins-path` under `xvfb-run -a`; a DEVLOG entry; "Notes for the plan" in the report.
- **Models:** Opus `claude-opus-5-5` at medium unless said; Sonnet `claude-sonnet-5-5` where said. A stuck brief is rerun on Opus at high.

## 4. Order, and how it fits the other plans

At most five executors at once across all plans. Wave P1's B841 and B844 touch no app file and can run beside the app work of the other plans; from P2 on, this plan needs `App.tsx`, `SettingsDialog.tsx` and `project-session.ts` in turn, so it queues behind Plan D's app waves.

| Wave | Briefs (model, effort) | Notes |
|---|---|---|
| P0 | **B840** spike (Opus, high) | Any free slot. Writes only under `docs/reference/spikes/b840/`. |
| P1 | **B841** plugin API: the app surface (Opus, high) · **B842** sandbox 2 in the renderer (Opus, high) · **B843** main: packages, the lock file, the broker, safe mode (Opus, high) | B841 first and alone on `packages/plugin-api` (not beside Plan C's B782). B842 and B843 after B841, together: B843 owns `ipc-channels.ts` and commits the channel names as a seam before B842 uses them. |
| P2 | **B844** `@msm/plugin-kit` (Opus, medium) · **B845** Settings > Plugins and the question before install (Opus, high) · **B846** commands, menus, toolbar More and shortcuts (Opus, medium) · **B847** changes by plugins: the review sheet, fixes and suggestions (Opus, medium) | B844 after B841 (no app file). B845 owns `SettingsDialog.tsx`; B846 owns the command files and `Toolbar.tsx`; B847 owns `ThingsToFix.tsx` and `changeset/`. `App.tsx` goes B845, then B846, then B847 (each commits its wiring last, in that order). |
| P3 | **B848** themes (Opus, medium) · **B849** Home rows, Settings pages and the plugin's own words (Opus, medium) · **B850** Studio layouts and sections from data (Opus, high) | After P2. No shared file but `SettingsDialog.tsx`: B848 takes it first (Looks), then B849 (a plugin's page). |
| P4 | **B851** the view kit (Opus, high), then **B852** coded Studios, sections, panels and dialogs (Opus, high) · **B853** live views for plugin kinds (Opus, high) | B851 first and alone. B852 after B850 and B851. B853 after B851; owns `liveviews/`. |
| P5 | **B854** AI helper tools from plugins (Opus, high) · **B855** hooks and export steps (Opus, medium) · **B856** Try it tools (Opus, medium) | After P2; none needs P4. B854 owns `packages/ai` (not beside another plan's prompt brief). B855 owns `project-session.ts` for its wave. |
| P6 | **B857** the catalogue: format, CI and review tools (Opus, high) · **B858** Get more, links, updates and recall in the app (Opus, high) | B857 after B844 (it uses `msm-plugin check`); it touches `tools/community-repo` and writes the community repository's files as a folder the main session pushes there. B858 after B845, B843 and B857; waits for questions 1 to 3. |
| P7 | **B859** dev mode and the inspector (Opus, high) · **B860** templates and `fixtures/sample-app-plugin` (Opus, medium) · **B861** docs, guide, search words, AI helper lines, changelog (Sonnet; Opus for the prompt lines) · **B862** e2e and the safety run (Opus, high) | B859 after B851. B860 after every point it templates. B861 and B862 last. |
| P8 | **B863** close (main session) | |
| Reserve | **B864** plugin workers in a hidden frame of `msm-plugin://<id>` (kept; sized by S4: one process, `frame-src msm-plugin:`, 15 MB private each; run if a plugin takes the window down or before `Canvas` and WebGL plugins are listed) · **B865** the app's own words as a string list, and language packs (about 3,800 places in 375 renderer files plus the packages, T2: a large brief) · **B866** author signatures · **B867** dropped (a `srcdoc` frame cannot run plugin code under the app's CSP and S1 and S2 pass) · **B868** a size brief (if a stop line is reached) · **B869** Get the plugin rows in search · **B870** is run now by the main session outside this plan (worktree b870) · **B871** hardening of today's workers, below, run now ahead of the plan · **B872** to **B879** free | |

## 5. The briefs

### B840 Spike: can the wall hold the new surface, measured (wave P0; Opus, high)

- **Purpose:** the facts ADR 0137 D3, D6, D7 and D8 rest on, before any code.
- **Owner files:** new `docs/reference/spikes/b840/` (README with the answers, throwaway code, outputs). Nothing else; throwaway work in the scratchpad. A throwaway branch of the app may be built there; none of it is merged.
- **Method:** a throwaway plugin and a throwaway host patch on top of the present sandbox, run in the packaged shape (`dist:dir`) under xvfb as well as in dev; each answer is a number or yes or no with how it was measured.
- **Questions:**
  - S1 **Typing through the kit.** A text field whose value goes host to worker and back as a view tree: the median and 95th percentile delay from key press to painted character for trees of 50, 500 and 2,000 nodes, with the tree sent whole and sent as a difference. Go: 95th percentile under 50 ms at 500 nodes with host-held field values (the field paints at once, the plugin is told after).
  - S2 **`OffscreenCanvas` in the plugin worker.** Do 2D and WebGL2 contexts work in the `blob:` worker under the present CSP, in the packaged app and under SwiftShader? Frame time for a 512 by 512 bitmap handed to the host (`transferToImageBitmap` or a transferred canvas) at 30 frames a second.
  - S3 **The fallback frame.** A sandboxed `srcdoc` iframe with an opaque origin and its own CSP for a canvas only: can it be denied network, storage, top navigation, pop-ups and pointer lock, and what does it cost on the UI thread? (Needed only if S1 or S2 fails; answer anyway so the reserve is sized.)
  - S4 **Memory and crashes.** Memory per idle plugin worker with the bootstrap; what the user sees when a worker allocates until it dies (does the window die?). Can plugin workers live in a hidden frame of another origin so Chromium gives them a process of their own (`msm-plugin://<id>`), and what would that cost? Recommend: stay, or reserve B864.
  - S5 **Requests from the worker.** Add worker to host calls to the protocol: round trip time for a small call and for 1 MB of project data; structured clone limits; the cost of handing a 5,000 element project (lazy pages or whole?).
  - S6 **The broker.** A fetch through renderer IPC to main with a host allowlist: can redirects to other hosts be stopped and resolved addresses be checked before connecting (loopback, private and link-local ranges) with Electron's `net` or Node's own client; streaming and the 10 MB cap; which is simpler to keep safe.
  - S7 **What still leaks.** With the present bootstrap, list every global the worker can still reach that talks to the outside or keeps state (`fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource`, `importScripts`, `indexedDB`, `caches`, `BroadcastChannel`, `navigator.*`, `WebAssembly`, timers at high resolution, `SharedArrayBuffer`, `OffscreenCanvas` fonts, nested workers, `import()` of `msm-app://` paths). For each: removed, blocked by CSP, or open. The hostile fixture starts from this list.
  - S8 **Hashing and the signature.** SHA-256 of a 20 MB package in main (time); Ed25519 verify with Node's `crypto` in the app's Electron (yes or no); the format of a detached signature file a GitHub Action can write.
  - S9 **Start and stop without a restart.** What `@msm/core` and the app's registries (kinds, templates, starters, validators, expanders, exporters, search data, schemas) need so a plugin can be added and removed while a project is open; what cannot be undone at run time (schemas?); the time to load one plugin late.
  - S10 **Hot reload.** Watch a folder from main, restart the worker and re-render an open plugin Studio: the time from save to repaint; what state can be kept.
  - S11 **Safe mode's trigger.** Where a "started" and "reached a usable window" mark can be written so that two failed starts are detected, including a renderer that dies after first paint; false alarms (the user closing the window early).
  - S12 **Declarative Studios.** Take three built-in Studios of different size and write each as a `studioLayouts` JSON by hand: what share of each is expressible (fields, groups, More options, pickers), and what the layout format must have for the rest. This sizes B850 against B852.
  - S13 **Live view from files.** For `fixtures/sample-plugin`'s kind and two invented kinds (one lowering to a loot table and a function, one to a model and a texture), does `BundleLiveView` over the lowered files give a useful view with no plugin code? What the registry needs to be keyed by lowered file as well as by kind.
  - T1 **Colours outside the tokens.** Count colour literals and Tailwind palette classes in `app/src/renderer/src` that do not go through the eight tokens, and canvas or WebGL colours; this is what a theme will not reach.
  - T2 **The app's words.** Count user-visible string literals in the renderer (a rough script is enough) to size reserve B865.
  - T3 **Size.** The gzipped and raw size of a minimal kit renderer for the 23 nodes built on `components/ui/`, as a lazy chunk; what must be in first paint (expected: nothing but a registry seam).
- **Exit criteria:** every question answered with its evidence; a go or no-go on D3 (the kit) and on staying in the renderer (D7); a list of requested changes to ADR 0137 and to the briefs below; nothing merged outside the spike folder.

### B841 Plugin API: the app surface (wave P1; Opus, high)

- **Purpose:** every type of ADR 0137 D2 to D5 in one additive minor, so later briefs run in parallel against fixed names.
- **Owner files:** `packages/plugin-api/src/app/` (new: `commands.ts`, `context.ts`, `permissions.ts`, `changeset.ts`, `views.ts`, `layouts.ts`, `live-views.ts`, `fixes.ts`, `ai-tools.ts`, `themes.ts`, `try-it.ts`, `export-steps.ts`, `hooks.ts`, `home.ts`, `settings.ts`, `text.ts`, `manifest.ts`), `src/plugin.ts`, `src/index.ts`, `src/version.ts`, `src/model.ts` (`ElementMeta.plugins?` only), `CHANGELOG.md`, `README.md`, `CLAUDE.md`, the package's tests.
- **Scope:** `PluginContributions` gains the fifteen optional points. `PluginContext` (what `run`, `fix`, `render` and the hooks receive): `project` (read, by permission), `assets`, `storage`, `fetch`, `pickFile`, `saveFile`, `copyText`, `settings`, `text(key)`, `target`, each documented with its permission. `Changeset` as plain data (add, change by path, rename, remove; asset write, asset remove; a title). `ViewNode` as a tagged union of the 23 kit nodes with `viewKit: 1`, event descriptors as data, no functions inside a tree. `StudioLayout` and `StudioSection`. Worker-to-host calls with paging (S5: ids and pages of at most 100 elements, never the whole project in one message; messages at most 256 KB), view events and path patches (D3) in the protocol types, and the manifest's `experimental` list as in D13. `PluginManifestV2` and `PluginPermission` as types and a `validateManifest` helper without dependencies (the app's zod schema must agree; a test compares them in B842). `@stable` and `@experimental` tags on everything exported; every new member `@experimental`. No behaviour beyond tiny helpers (`definePlugin` accepts the new points).
- **Exit criteria:** type-level tests for every point; a compile-only example plugin using all fifteen; `fixtures/sample-plugin` builds unchanged; the built-ins typecheck unchanged; `API_VERSION` bumped by one minor with a CHANGELOG entry listing every member; `pnpm --filter @msm/plugin-api test` and `pack:tarball`; no Node or DOM type in `dist/index.d.ts` (a test greps it).
- **Also (B840):** `StudioLayout` carries the seven additions of S12 (shown when, choices from somewhere, one of several shapes, a list, shown differently from stored, an optional part, text with values), or the brief says which are left to Tier 3.
- **Out of scope:** any host code; `target.ts`.

### B842 Sandbox 2 in the renderer (wave P1; Opus, high)

- **Purpose:** the wall for the new surface: manifest 2, permissions enforced, calls from the worker, start and stop.
- **Owner files:** `app/src/renderer/src/plugins/sandbox/` (all), `plugins/manifest.ts`, `plugins/external-plugins.ts`, new `plugins/host-services/` (`project.ts`, `storage.ts`, `fetch.ts`, `files.ts`, `clipboard.ts`, `permissions.ts`), new `plugins/registry.ts` (the run-time registry of loaded plugins and their points, with `load`, `unload`, `reload`), new `fixtures/hostile-plugin/`, their tests. `packages/core` only where spike S9 names an unregister seam (stop and report if it is more than one file).
- **Scope:** protocol version 2 with worker to host requests, each carrying an id, checked against the plugin's granted permissions in the host, with deadline and size limits (ADR 0137 D7); protocol 1 plugins unchanged. Manifest 2 parsing (`permissions`, `experimental`, `viewKit`, `locales`). The bootstrap closes every leak S7 found: `navigator.storageBuckets` (and `StorageBucketManager`), `navigator.locks`, `Notification`, `navigator.usb`, `hid`, `serial` and `gpu` (B871 has already done this for today's bootstrap; this brief carries it into protocol 2 and keeps the tests), timers that run after a call returns (an idle heartbeat and "This plugin is busy"), with `import()` of the app's own files accepted and stated. Field values are held by the host and trees after the first are path patches. Canvas transfer is a message the bootstrap handles (the plugin has no `postMessage`). Start and stop without a restart per S9: a `ProjectSession` method that rebuilds its plugin lists (`#plugins`, `#library`, `#kindPlugins`, `#importers`, `#validators`, `#exporters`), the schema context dropped per target and rebuilt, `ElementKindRegistry` kept without an `unregister` (a stopped plugin's kinds stay registered and unavailable), and plugins held as state in `App` (today `main.tsx` starts them before the session and `App` takes them as a prop); loading one plugin late takes 0.2 to 0.4 s. Host services: project read (paged if S5 says so), storage (5 MB, per plugin, app-wide and per project), fetch (to B843's broker), file pick and save (through existing dialogs), copy text. Load, unload and reload of one plugin while a project is open; an unloaded plugin's kinds stay as unavailable. Plugins start after first paint. A crashed or timed-out plugin is off for the session with a reason the UI can show. The hostile plugin: one attack per line of S7's table (storage buckets, locks, notifications, devices, GPU, timers after a call, `import()` of app files as accepted) and per permission, each asserted to fail.
- **Exit criteria:** hostile-plugin test suite green (every attack refused, with its code); a manifest 1 plugin and a manifest 2 plugin load side by side; load, unload and reload tests with an open session; a call without its permission returns `plugin.permission-denied` and is counted; the zod schema and `validateManifest` agree on a table of 30 manifests; first paint size unchanged within 5 kB.
- **Out of scope:** any UI; the extension points themselves (later briefs register into `plugins/registry.ts`).

### B843 Main: packages, the lock file, the broker, safe mode (wave P1; Opus, high)

- **Purpose:** the parts of the wall that must be in the main process.
- **Owner files:** `app/src/main/platform/plugins.ts`, new `app/src/main/platform/plugin-packages.ts`, `plugin-lock.ts`, `plugin-broker.ts`, `safe-mode.ts`, `app/src/shared/ipc-channels.ts`, the preload's plugin entries, `app/src/main/index.ts` (the flag and the start marks only), their tests.
- **Scope:** the `.msmplugin` package (a zip; manifest at the root; path containment; limits: 20 MB packed, 60 MB unpacked, 2,000 files; no symlinks): install from a path, remove, keep the version before. `<msmHome>/plugins.lock.json` (id, version, source: file, link or catalogue, package SHA-256, each file's SHA-256, granted permissions, date); the check at each start; "changed since install" as a state. Granted permissions live here, not in the renderer. The broker of ADR 0137 D6 on `node:https` with a `lookup` hook that checks every resolved address (`docs/reference/spikes/b840/spike-src/broker/broker-spike.mjs` is a starting point, not code to copy), not Electron's `net`; no system proxy. Session permission handlers that deny notifications and device permissions, and a `render-process-gone` handler outside smoke runs: reload the window, count toward safe mode, name the plugins that were running. Safe mode's marks per S11 (a file of marks in `<msmHome>`, `pending` at start, usable when the renderer answers 3 s after load, a clean quit before that not counted). Hashing per S8: SHA-256 at install and when a file's size or time changed; the signature format `index.json.sig` (base64 of the raw Ed25519 signature over the exact bytes of `index.json`), verified with Node's `crypto`. Safe mode: `--safe-mode`, the two-failed-starts guard by S11's marks, an IPC for the renderer to ask and to leave it; "all plugins off" and per-plugin and per-project off stored in settings. First commit: the IPC channel names and types, as B842's seam.
- **Exit criteria:** unit tests for: a zip with `../` paths, a symlink, an oversized file and a missing manifest are refused; a changed file is caught at start; the broker refuses `http:`, an unlisted host, a redirect to another host, `127.0.0.1`, `10.0.0.0/8`, `169.254.0.0/16`, `[::1]` and a name resolving to them (against a local test server); the response cap and the rate limit; safe mode by flag and after two marked failures, and not after a clean exit.
- **Out of scope:** downloading packages (B858); UI.

### B844 `@msm/plugin-kit` (wave P2; Opus, medium)

- **Purpose:** what a plugin maker installs: build, check, pack and a test harness.
- **Owner files:** new `packages/plugin-kit/` (with its own `CLAUDE.md`), `tools/check-deps/layers.json` (its entry: may import only `@msm/plugin-api`), `pnpm-lock.yaml`.
- **Scope:** a CLI `msm-plugin` with `build` (one bundle, as the sample plugin's `build.ts` does today), `check` (manifest, limits, ids, contributions against the declared `capabilities` and `permissions`, a visible kind without a live view, labels that look like ids, experimental and deprecated members used; exit code and a JSON report) and `pack` (the `.msmplugin` and a `.sha256`). `createTestHost(plugin, options)` for Vitest: speaks protocol 2 in process with a fake project, records host calls, enforces permissions and deadlines as the app does, and offers `runCommand`, `render`, `send(event)`, `runFix`, `runTool`, `fire(hook)`. The protocol's message types are imported from `@msm/plugin-api` (B841) so the app and the kit cannot drift; a contract test replays a recorded exchange.
- **Exit criteria:** `fixtures/sample-plugin` builds, checks and packs with the kit (its own `build.ts` kept until B860); the harness's refusals match B842's for the same hostile calls (shared table); the package builds a tarball like `@msm/plugin-api`'s.
- **Out of scope:** templates (B860); publishing to npm (the main session decides at the close).

### B845 Settings > Plugins and the question before install (wave P2; Opus, high)

- **Purpose:** the user's side of trust: see, add, agree, turn off, remove.
- **Owner files:** `components/SettingsDialog.tsx` (the Plugins section moves out to new `components/plugins/`: `PluginsPage.tsx`, `PluginCard.tsx`, `InstallQuestion.tsx`, `SafeModeBar.tsx`, `permission-words.ts`), `App.tsx` (the bar, the drop target, the dialog state), tests.
- **Scope:** **Yours**: a card per plugin (name, one sentence, **What it adds**, **What it may do**, On or Off, **Off for this mod**, **Remove**, state lines in plain words for refused, failed, changed since install, needs a newer MCSuperMods); **All plugins off**; **Add a plugin from a file…** and dropping a `.msmplugin` on the window. The question before install: the sentences of ADR 0137 D4 from `permission-words.ts`, the combined line for reading with the internet, "Not checked by MCSuperMods" for a file, **Add it** and **Not now**; nothing of the plugin has run when it shows. The safe mode bar. Turning on, off and removing take effect at once (B842). Ids, versions, hashes, hosts and codes under More options. Search words for the page.
- **Exit criteria:** component tests for every state and every permission sentence (a table test: each permission code has a sentence and no code is shown outside More options, `expectPlain`); installing the sample plugin from a packed file in a session test makes its kind available without a restart, Off removes its templates from the Add dialog, Remove leaves its elements with `element.unknown-kind`; screenshots at 1280 and 1920.
- **Out of scope:** Get more and updates (B858); dev mode (B859).

### B846 Commands, menus, toolbar More and shortcuts (wave P2; Opus, medium)

- **Purpose:** the first point with code: a plugin's command runs.
- **Owner files:** `commands/` (new `plugin-commands.ts`; `built-in-commands.ts` read-only unless a seam is needed), `components/CommandPalette.tsx`, `components/Toolbar.tsx`, `shortcuts.ts`, the search door source for commands under `search/`, `App.tsx` (wiring, after B845), tests.
- **Scope:** plugin commands in the palette, the named menus, toolbar More and an element's menu for the kinds the command names, each with the plugin's name; `run(context)` with a 10 s deadline, a visible "Working… Stop" after 1 s, and its changeset (if any) handed to B847's seam (applied directly until B847 lands). Shortcuts: the host's reserved list, the user's choices and the app's own keys win; a clash is dropped and listed on the plugin's card. At most 50 commands a plugin. Search finds them by title and words.
- **Exit criteria:** tests: a command appears in each placement and runs; a command that never returns is stopped and the plugin stays loaded; a reserved shortcut is refused; turning the plugin off removes its commands at once; the golden search queries stay at their pass rate.
- **Out of scope:** a rebinding screen (a note for the plan if none exists).

### B847 Changes by plugins: the review sheet, fixes and suggestions (wave P2; Opus, medium)

- **Purpose:** ADR 0137 D5 in the app, and fixes in Things to fix.
- **Owner files:** `changeset/` (new `plugin-changeset.ts`; `changeset.ts` extended only by additive options), new `components/plugins/ChangeSheet.tsx`, `components/ThingsToFix.tsx`, `App.tsx` (wiring, after B846), tests. `project-session.ts` only for an undo label, if it has no seam (say so in the report).
- **Scope:** a plugin's `Changeset` through the planner as one undo step named "<plugin>: <title>"; refused whole when it fails validation, names a path outside the project or an unknown kind; applied directly with an Undo toast when small, shown first in the sheet by D5's rule ("<plugin> wants to change n things", See it per thing using the existing live views, **Do it**, **Not now**). Only in answer to a user action: the host passes a token from the action and refuses a changeset without one. Fixes: a plugin's problem codes get its plain sentence, Show me and Fix it. Suggestions from hooks appear as "<plugin> suggests …" with **Do it** and **No thanks**, never applied by themselves.
- **Exit criteria:** tests: one undo step restores everything, assets included; a changeset without the action token is refused (`plugin.change-not-asked`); a large changeset shows the sheet; a plugin fix clears its problem; hostile-plugin attacks added (a write outside the project, a kind of another plugin's namespace overwritten, 10,000 changes).

### B848 Themes (wave P3; Opus, medium)

- **Owner files:** `styles.css`, new `app/src/renderer/src/themes/` (`apply.ts`, `contrast.ts`), `components/SettingsDialog.tsx` (a **Looks** section; first in the wave), components that T1 found using colours outside the tokens: converts or lists first the 170 chrome colour uses in `components/` and `studios/` (590 colour uses in 96 files in all; the rest are Try it, live views, the Showcase and Surprise me, which keep their own colours on purpose, and 29 canvas or WebGL files) (listed in the report before editing; stop at 40 files and report), tests.
- **Scope:** a theme is data: values for the tokens for light and dark, a name and a preview strip. Settings > Looks: **Follow my computer**, Light, Dark and the installed themes, applied at once. The host checks contrast (text on background and on panel at least 4.5 to 1, accent and error on panel at least 3 to 1) and refuses a theme that fails, saying which pair. The built-in look stays the default and is what safe mode shows. New tokens may be added if T1 shows a need (each listed in the API by B841's file `themes.ts`, with a default).
- **Exit criteria:** a theme from a test plugin recolours the shell, a Studio, a dialog and a kit view (screenshots); an unreadable theme is refused with its reason; turning the plugin off returns to the default look; first paint grows by no more than 3 kB.
- **Live view:** the Looks section shows the choice applied as it is picked.

### B849 Home rows, Settings pages and the plugin's own words (wave P3; Opus, medium)

- **Owner files:** `components/home/` (a new `PluginRows.tsx`; existing files read-only but for one slot), new `components/plugins/PluginSettingsPage.tsx`, new `plugins/text.ts`, `components/SettingsDialog.tsx` (after B848), tests.
- **Scope:** one row a plugin, at most 12 cards, after the app's own rows, headed with the plugin's name; a card opens the plugin's own starter, example or command; pictures are the plugin's PNGs (at most 64 KB each, decoded by the host) or a drawn stand-in. Settings pages: the plugin's schema drawn with the schema form under its card, values in its storage, handed to the plugin as `context.settings` and on change. Words: `locales/<language>.json`, the app's language setting if one exists, else the system's, falling back to the manifest's own words; keys are the plugin's own only.
- **Exit criteria:** tests for the row's limits and for a card that names something not the plugin's own (refused); a settings value survives a restart and an update, and is removed on Remove with "and what it remembered"; a label shows in a second language.

### B850 Studio layouts and sections from data (wave P3; Opus, high)

- **Purpose:** a Studio for a plugin's kind, and a section on a built-in kind, without plugin code.
- **Owner files:** new `studios/plugin/` (`studios.tsx` registering a matcher for kinds with a layout, `LayoutStudio.tsx`, `LayoutSection.tsx`, `widgets.ts`), `studios/types.ts` (a section slot, additive), the one place built-in Studios render their sections (named in the report; one owner), `packages/core` for `meta.plugins` round trip if needed, tests.
- **Test cases (S12):** the seven layout additions (shown when, choices from somewhere, one of several shapes, a list, shown differently from stored, an optional part, text with values) and three Studios written as layouts, Objective (aim 92 %), Potion (81 %) and Block (75 %); what is left is Tier 3 or a live view.
- **Scope:** `studioLayouts`: sections of fields by path into the kind's schema, each with a plain label, help, a widget from the list S12 settled (text, number, slider, toggle, choice, colour, thing picker, texture picker, list) and a More options flag; fields the layout leaves out appear under **Every setting**. `studioSections` from data on an own kind or a named built-in kind, at the end above More options, headed "From <plugin>", editing existing fields or `meta.plugins.<pluginId>` (saved with the element, sorted keys, removed with nothing else). Edits go through the session as ordinary undoable edits. A layout naming a path the schema lacks is refused with the path.
- **Exit criteria:** the sample plugin's greeting kind gets a layout Studio with More options (component test, `expectPlain`); a data section on `msm:block` writes `meta.plugins.<id>` and an expander of the same plugin reads it (session test); the project file round trips; e2e `one-mode-path` stays green.
- **Live view:** the kind's live view (B853) sits beside the layout Studio as beside built-in ones; until B853 the preview panel says "No live preview yet".

### B851 The view kit (wave P4; Opus, high)

- **Purpose:** ADR 0137 D3: the host draws what a plugin describes.
- **Owner files:** new `app/src/renderer/src/plugins/views/` (`ViewHost.tsx`, `nodes/` one file a node, `events.ts`, `limits.ts`, `canvas.ts`), tests.
- **Scope:** the 23 nodes on the app's own `components/ui/` parts; the render and event loop as S1 settled it: host-held field values (never round-trip a field's value before painting it; a tree does not overwrite a focused field), trees after the first as path patches, `List` and `Table` drawing only their visible rows, `Picture` from a `data:` URL, "This is slow" by measured paint time and not by count; the field parts shared with the Studios (the chunk they already share) or moved into `components/ui`, never copied (876 modules and 2.8 MB if not shared, T3); limits (2,000 nodes, 256 KB, depth 32, strings 4,096 characters) with a plain line when a view is refused; "This is slow" after three updates past 100 ms; `Canvas` by S2's route; `Picture` decoding in the host; `LiveView` embedding the host's view of an element the plugin may read; `Link` with the confirming line; `MoreOptions`; focus, keyboard and labels from the host's parts; a view of a plugin that stops answers shows "This plugin stopped" with **Turn it back on**. Everything in a lazy chunk.
- **Exit criteria:** a component test per node; a tree from the hostile plugin with script-like strings, 100,000 nodes, a `javascript:` link, a 50 MB picture and unknown node types is refused or shown as text with nothing run; typing delay within S1's go line in a measured test; an accessibility pass (roles and names) on a sample view; chunk size reported and under the figure T3 gave by no more than 20 %.

### B852 Coded Studios, sections, panels and dialogs (wave P4; Opus, high)

- **Owner files:** `studios/plugin/` (adds `ViewStudio.tsx`, `ViewSection.tsx`), `components/RightDock.tsx` (a slot), new `components/plugins/PluginDialog.tsx`, tests.
- **Scope:** a plugin's `views` as a whole Studio for an own kind, a section on an own or named built-in kind, a right-dock panel and a dialog opened by its command. The view receives the element (or the project, by permission) and re-renders when it changes; its events may return a changeset (B847's rules; an edit of the open element is an ordinary undoable edit). A coded Studio keeps **Every setting** and **Where it goes** from the host. A plugin may not replace a built-in kind's Studio.
- **Exit criteria:** `fixtures/hostile-plugin` cannot open a dialog without a user action or over the install question; a session test edits an element through a coded Studio and undoes it; a panel survives the plugin's reload.
- **Live view:** as B850.

### B853 Live views for plugin kinds (wave P4; Opus, high)

- **Owner files:** `liveviews/` (`registry.ts` becomes extendable at run time through a new `plugin-views.ts`; new `FromFilesLiveView.tsx`), `docs/LIVE-VIEW-AUDIT.md` (a section "Plugin kinds"), tests.
- **Scope:** ADR 0137 D12. `fromFiles`: the host lowers the element and shows its own live views for the files it knows, by S13's keying: a lowered-file index from a lowered file's folder and extension to a kind (`ElementKindRegistry.kindForFolder` is the start), a function that turns the file back into a stand-in element, entries for `assets/*/items` and `models` (the app's model preview exists outside the registry), a reader over the lowered files (pictures included) and one view that lays the stand-ins side by side as the bundle view does; `canvas`: the worker draws, the host shows frames, paused when hidden; a view. All follow edits by themselves (debounced, deadline, the last good picture kept with "Catching up"). A kind marked as having nothing to see is exempt and says why. The Creator's Live tab and the changeset sheet's See it use the same views. `msm-plugin check` gets the rule's data from here (a note for B844's follow-up if the kit must change).
- **Exit criteria:** the sample plugin's greeting shows the function it lowers to, live, with no plugin code; a canvas view repaints within 500 ms of an edit in a measured test; a plugin kind without a view shows "No live preview" and is reported.

### B854 AI helper tools from plugins (wave P5; Opus, high)

- **Owner files:** `packages/ai/src/tools/` (new `plugin-tools.ts`; `catalogue.ts` by an additive seam), the app's `ai/` wiring for the tray, `app/test/ai-prompt-truth*.test.ts` only if a count changes, tests. Not `packages/ai/src/prompt/` (B861).
- **Scope:** with `ai:tools`, a plugin's tools are offered as `plugin_<id>_<name>` with its description and input schema, outside the pinned prompt and under the cap (1,500 characters a plugin, 6,000 in all; the rest dropped with a line on the plugin's card). The input is checked against the schema before the worker sees it. A tool's data result is wrapped and marked as data from a plugin; a changeset result becomes a card in the tray exactly like the helper's own proposals. A tool sees only its input and what its permissions give. The helper's state line names the plugin while its tool runs.
- **Exit criteria:** scripted-client tests: a tool is called and its card accepted and undone; a result that says "ignore your instructions" changes nothing but the transcript (the wrapper is asserted); a tool of a plugin that is off is not offered; the prompt truth tests stay green without a budget raise.

### B855 Hooks and export steps (wave P5; Opus, medium)

- **Owner files:** `session/project-session.ts` (the points where hooks fire; one owner this wave), new `plugins/hooks.ts`, the export path's seam for steps (named in the report), tests.
- **Scope:** `opened`, `saved`, `elementChanged` (debounced 500 ms, only kinds the plugin names); with `game:hooks`: `beforeExport`, `beforePlay` (may return problems), `exported`, `playStarted`, and `exportSteps` between lowering and the validation gate (add files, add problems, change only files of the plugin's own kinds; a step that touches another's file is refused whole). 2 s a hook, 30 s a step; a slow hook is skipped with a line in the inspector, never waited for on open or save.
- **Exit criteria:** tests: saving takes no longer with a hook that never returns; an error from `beforeExport` blocks the export with the plugin's name; a step's bad file is caught by the gate; a step cannot alter a vanilla pack file of another kind.

### B856 Try it tools (wave P5; Opus, medium)

- **Owner files:** `tryit/` (a new `plugin-tools.ts` and one slot in the tools strip; other files read-only), `packages/sim` only if an action has no public entry (stop and report), tests.
- **Scope:** a plugin tool on Try it's strip with its name and picture; `use(hit, context)` returns actions from the simulator's public list (place or break a block, summon, run a project function, strike lightning, say a line in What happened; the list is fixed by what `@msm/sim` exposes: verify at implementation), at most 64 an use. What happened names the plugin.
- **Exit criteria:** a session test uses a tool and sees its effect and its What happened line; an unknown action is refused; e2e `tryit-path` stays green.

### B857 The catalogue: format, CI and review tools (wave P6; Opus, high)

- **Owner files:** `tools/community-repo/` (new `plugins/`: `index.ts`, `check.ts`, `sign.ts`, tests, README), a folder `community/plugins/` of files for the community repository (its workflow, the pull request template, `CONTRIBUTING-plugins.md`, `CODEOWNERS` pattern, an empty `plugins/index.json`), which the main session pushes there. Nothing in this repository's CI.
- **Scope:** `plugins/<id>/plugin.json` and the index of ADR 0137 D9 with a schema and version number; `check`: downloads a version's package (CI only), verifies the hash, runs `msm-plugin check` and a load in the kit's host, compares used calls with declared permissions, and writes the review summary a maintainer reads (what it adds, what it may do, what changed since the last version, permissions grown or not); the id's owner is the account that first added it; `sign`: Ed25519 over the index with a key from the repository's secrets; the `recalled` list. Auto-merge only for versions with the same or fewer permissions, if question 1's default stands.
- **Exit criteria:** tests against fixture repositories: a wrong hash, a grown permission, a stolen id, an oversized package and an unsigned index are each caught; the index of two fixture plugins is byte-stable; the README says how to add a plugin and how to recall one.
- **Out of scope:** the app (B858).

### B858 Get more, links, updates and recall in the app (wave P6; Opus, high)

- **Owner files:** new `app/src/main/platform/plugin-catalogue.ts`, `plugin-packages.ts` (download and "the version before"), `components/plugins/` (new `GetMore.tsx`, `UpdateQuestion.tsx`, `NeededPlugins.tsx`), `ipc-channels.ts`, `project-session.ts` only for the project's `plugins` map (after B855), tests with a local fixture server.
- **Scope:** main reads the index over `https:` (hosts as facts in one file: verify at implementation), verifies the signature with the public key shipped in the app, caches it; never more than once a day by itself, and only when the setting is on. **Get more**: cards, the filter box with the one matcher, a plugin's page with pictures, what it adds and may do, versions and changes, **Add it**. **Add from a link…**. Updates: "Update ready" on the card and a count on Settings > Plugins, the changelog, new permission lines needing agreement, **Go back to the version before**. Recall: a recalled version is turned off at the next check with the reason and a link to the catalogue's note. The project's `plugins` map written by the host, and "This mod uses the plugin X. **Get it**" on open. A plugin that needs a newer MCSuperMods says so and is not offered.
- **Exit criteria:** tests: a tampered index and a package with the wrong hash are refused; an update with a new permission stays uninstalled until agreed; going back restores the old files and lock entry; recall turns a plugin off without removing it; offline, Yours works and Get more says "You are offline"; opening a mod that names a missing plugin offers it and still opens.

### B859 Dev mode and the inspector (wave P7; Opus, high)

- **Owner files:** `app/src/main/platform/plugin-dev.ts` (the watcher), new `components/plugins/dev/` (`Inspector.tsx` and parts), `plugins/registry.ts` (a trace seam), `ipc-channels.ts`, tests.
- **Scope:** ADR 0137 D11: **Load a plugin I am building…** under More options; the folder is watched and the worker restarted on change (no module replacement needed: S10 measured save to repaint at 13 to 91 ms, median 33 ms), debounced by about 50 ms (Windows `fs.watch` may report one save several times; verify at implementation), with the open Studio and the host-held field values kept and an optional state handover for the plugin's own memory; the badge "Being built"; the permission question still asked once per new permission. The inspector panel: contributions found and refused, messages with times against deadlines, permissions used and denied, the view tree, storage, problems, deprecated and experimental members used, **Copy as a report**. Dev folders are exempt from the lock file and never offered updates.
- **Exit criteria:** a session test edits a watched bundle and sees the new command within S10's time; the inspector lists a denied call and a slow render; nothing of dev mode loads unless it is used (chunk reported).

### B860 Templates and `fixtures/sample-app-plugin` (wave P7; Opus, medium)

- **Owner files:** `tools/new-plugin/` (templates per point, `--with`), new `fixtures/sample-app-plugin/`, `fixtures/sample-plugin/` (moved to the kit's build), the CI line that builds the sample plugin on Windows (one owner of `ci.yml`).
- **Scope:** `tools/new-plugin --external --with commands,views,…` writes a plugin that builds, checks, packs and tests with the kit, with one commented example and one harness test per chosen point and the smallest permission list. `fixtures/sample-app-plugin` uses all fifteen points and every permission once, and is the docs' running example.
- **Exit criteria:** the tool's test scaffolds every point alone and all together, and each result passes `msm-plugin check` and its own tests; the sample app plugin passes the catalogue's `check`; both samples build on Windows in CI.

### B861 Docs, guide, search words, AI helper lines, changelog (wave P7; Sonnet; Opus for the prompt lines)

- **Owner files:** `docs/guide/plugins.md` (rewritten for users: get, agree, turn off, safe mode, updates, what a plugin can never do), new `docs/guide/make-a-plugin/` (one page per extension point, permissions, the kit and harness, dev mode and the inspector, the catalogue, stability and deprecations), `docs/site/.vitepress/config.ts`, the search data for the new pages and settings, `packages/ai/src/prompt/` (a short topic: what plugins are, that the helper cannot install one, how plugin tools appear), `CHANGELOG.md`, `README.md`.
- **Exit criteria:** every label in the pages matches the shipped UI (the executors' notes are the source); the prompt truth tests green, any budget raise as a line in ADR 0125 D7; the site builds; ten new golden search queries ("add plugin", "turn off plugins", "safe mode", "theme", "dark colours" among them).

### B862 e2e and the safety run (wave P7; Opus, high)

- **Owner files:** `app/e2e/plugins-app-path.spec.ts`, `plugins-safety-path.spec.ts`, `plugins-catalogue-path.spec.ts`, fixtures under `app/e2e/assets/`.
- **Scope:** app path: add the sample app plugin from a file, agree, run a command, edit through a layout Studio and a coded section, see its live view, apply a fix, change the theme, turn it off for this mod, remove it. Safety path, with the hostile plugin in the packaged shape: every attack fails and the app stays usable; a plugin that hangs is stopped; start with `--safe-mode`; two forced bad starts bring safe mode by themselves. Catalogue path against a local index: browse, add, update with a new permission, go back, recall.
- **Also (B840):** the hostile fixture covers S7's whole table, and one e2e case runs a plugin that fills its heap: the window comes back and the plugin is off (the `render-process-gone` handler of B843).
- **Exit criteria:** the three specs green under xvfb three times running; `plugins-path` unchanged and green.

### B871 Harden today's plugin and script workers (run now, ahead of the plan; Opus)

Run now by the main session as **B870** (worktree b870); this entry only records it. The spike (S7, S4) found holes in what ships today, so they are closed before any of this plan's code. Scope: in the plugin worker bootstrap (`plugins/sandbox/worker-bootstrap.ts`) and Try it's script worker (`tryit/script-worker.ts`, which strips the same globals and probably has the same gap), remove `navigator.storageBuckets` (and `StorageBucketManager`), `navigator.locks`, `Notification`, `navigator.usb`, `hid`, `serial` and `gpu`; in main, permission handlers for the app's session that deny notifications and other permissions; and a handler for a crashed renderer (`render-process-gone`) outside smoke runs. The hostile-plugin attacks of B842 start from these. B842 and B843 keep the same removals and handlers in their scope as tests and as protocol 2; they do not redo the work.

### B863 Close (wave P8; main session)

Review against ADR 0137 decision by decision; move each extension point from experimental to stable or say why not; findings into the ADR and its status to accepted with findings; DESIGN §7 rewritten (contribution points table, loading model, versioning); ROADMAP ticked and a Milestone Log row; `docs/LIVE-VIEW-AUDIT.md` and `docs/ONE-MODE-AUDIT.md` lines; root and scoped `CLAUDE.md` lines; HANDOFF; this plan deleted with its notes moved to the ADR.

## 6. What this plan does not do

- It does not let a plugin run outside its worker, draw its own HTML, or reach Node; no later brief may add that without a new ADR.
- It does not make built-in Studios into plugins or move built-in plugins onto the kit.
- It does not translate the app (reserve B865), add author signatures (B866) or one-click links from web pages.
- It does not let plugins add Minecraft versions or Java to the runtime mod.
- It does not promise that review finds every bad plugin; the guide says so.

## 7. Notes from implementation

(Appended by the main session from the executors' "Notes for the plan".)
