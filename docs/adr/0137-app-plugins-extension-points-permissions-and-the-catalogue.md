# ADR 0137: App plugins: extension points, permissions and the catalogue

## Context

The user (2026-11-25): "Make a plugin support system so anybody can add plugins to modify this application".

What exists (checked 2026-11-25 at commit `3a4ca9f`; the full table is in [`docs/PLAN-app-plugins.md`](../PLAN-app-plugins.md) section 1):

- Plugin API 1.30.0 ([ADR 0036](0036-plugin-api-1.0-and-compatibility-policy.md)) is a **content** API: element kinds, templates, starters, examples, validators, importers, exporters, project expanders and search data. Third-party plugins load from `<msmHome>/plugins/<folder>/msm-plugin.json` into one Web Worker each, in the renderer served from `msm-app://`, with deadlines per call ([ADR 0035](0035-plugin-sandbox-and-capability-manifest.md)). The manifest's `capabilities` lists contribution points, not permissions: a plugin receives only the elements it is asked about and can reach nothing else.
- A third-party plugin **cannot change the app**. `editors`, `commands` and `targets` from an external plugin are ignored with `plugin.capability-unsupported` (`app/src/renderer/src/plugins/manifest.ts`). `Command.run()` takes no arguments and has no project access; `EditorContribution.component` is a React component typed `unknown`, which cannot cross the worker boundary.
- The app's own extension seams are internal: `commands/built-in-commands.ts`, `studios/studio-registry.ts` (found by `import.meta.glob`), `liveviews/registry.ts` (a frozen record of lazy modules), the `PlainFix` table behind Things to fix, `packages/ai/src/tools/`, eight colour tokens in `styles.css` that follow the system colour scheme, `shortcuts.ts`. None is reachable from a plugin.
- Getting a plugin means copying a folder by hand and restarting. There is no package format, no hash check, no update, no off switch, no catalogue. The community repository (MEZTKING/MCSuperMods-Community) holds examples only (`tools/community-repo`).
- The app has no translation layer: its words are written in its components.
- Size is tight: renderer 20.1 of 21 MB (stop line 20.5), first paint 5.2 of 6 (stop line 5.5), `app.asar` 29.1 of 32 (B818's numbers).

The gap is therefore three things at once: a surface (where a plugin may change the app), a wall (what it may reach while doing so) and a road (how people find, trust, install and build plugins).

## Decision

**D1. Three tiers, and the cheapest tier that does the job.** Every extension point belongs to one tier:

- **Tier 1, data.** JSON in the plugin's package that the host reads and checks; no plugin code runs. Themes, the plugin's own words in other languages, default keyboard shortcuts, where its commands appear (palette, menus, toolbar More), Home rows and cards, Settings pages and Studio layouts drawn from its schema.
- **Tier 2, code without a screen.** Functions in the plugin's sandboxed worker, called by the host with a deadline: commands, fixes, AI helper tools, Try it tools, export steps, event hooks.
- **Tier 3, code with a screen.** The same worker returns a **view tree** that the host draws (D3): coded Studios and sections, panels, dialogs, live views.

A point is offered in the lowest tier that can express it; a higher tier is added only for what the lower one cannot do. The existing content points stay as they are.

**D2. The extension points.** All are additive members of plugin API 1.x, in new files under `packages/plugin-api/src/app/` (nothing in `target.ts`). "Own" means the plugin's own kinds, ids and problem codes.

| Point | Tier | What a plugin gives | What the host does with it |
|---|---|---|---|
| `commands` | 1 + 2 | id, title, words, placement (`palette`, `menu:<name>`, `toolbar-more`, `element-menu` for named kinds), optional default shortcut; `run(context)` | Lists them with the plugin's name; calls `run` on a user action; search finds them through the existing door rows |
| `shortcuts` | 1 | default keys on its commands | The host owns the key map; reserved keys and the user's own choices win; a clash is dropped and said in Settings |
| `homeRows` | 1 | at most one row of at most 12 cards, each opening an own starter, example or command; an own PNG or a drawn picture | Shown after the app's own rows, headed with the plugin's name |
| `settingsPages` | 1 | a schema (mcdoc or JSON schema subset) and plain labels | Drawn with the schema form under Settings > Plugins > the plugin; values kept by the host (`storage`) and handed to the plugin |
| `studioLayouts` | 1 | for an own kind: sections, each a list of fields of the kind's schema with plain labels, a widget from the kit and a More options flag | Drawn as a Studio like the built-in ones; replaces the generic form |
| `studioSections` | 1 or 3 | a section on an own kind or on a named built-in kind; it edits existing fields of the element, or the plugin's own bag `meta.plugins.<pluginId>` | Shown at the end of that Studio, above More options, headed "From <plugin>" |
| `views` | 3 | `render(state) -> ViewNode` and event handlers, for a whole Studio, a section, a right-dock panel or a dialog | Drawn from the kit (D3) |
| `liveViews` | 1 or 3 | for each own kind a player can see or hear: `fromFiles` (the default: the host shows its own live views of the files the element lowers to), a `canvas` the worker draws, or a view | Shown in the preview panel and the Creator's Live tab; follows edits by itself (D12) |
| `fixes` | 2 | for an own problem code: a plain sentence, a button label, `fix(problem, context) -> Changeset` | Things to fix shows Show me and Fix it for the plugin's problems as for the app's own |
| `aiTools` | 2 | name, description, JSON schema of the input, `run(input, context)` returning data or a changeset | Offered to the AI helper as `plugin_<id>_<name>`; a changeset becomes a card in the tray like any proposal (D8) |
| `themes` | 1 | values for the app's colour tokens, light and dark | Chosen in Settings > Looks; contrast checked by the host (D9) |
| `tryItTools` | 2 | name, picture, `use(hit, context)` returning actions from the simulator's fixed list | A tool on Try it's hotbar strip, named with the plugin |
| `exportSteps` | 2 | `step(files, context)` run after lowering and before the validation gate | May add files and problems and change only files its own kinds produced; everything still passes the gate |
| `hooks` | 2 | `opened`, `saved`, `exported`, `playStarted`, `elementChanged` (debounced), `beforeExport`, `beforePlay` | Notifications with a 2 s deadline. They cannot stop or delay opening or saving. `beforeExport` and `beforePlay` may return problems (an error blocks, as a validator's does). A hook may return suggestions, shown in Things to fix as "<plugin> suggests …", never applied by itself |
| `text` | 1 | `locales/<language>.json` for the plugin's own strings | Used where the plugin's names and labels are shown; the app's own words are not replaceable yet (D10) |

Not offered to third-party plugins, as today: `targets` (vendored Minecraft data) and anything that adds Java to the runtime mod.

**D3. Screens are drawn by the host from a component kit; plugins never get a DOM.** A Tier 3 plugin returns a tree of nodes from a fixed kit (`Column`, `Row`, `Section`, `Heading`, `Text`, `Notice`, `Button`, `Toggle`, `TextField`, `NumberField`, `Slider`, `Select`, `ColourField`, `ThingPicker`, `TexturePicker`, `List`, `Table`, `Tabs`, `Picture`, `Canvas`, `LiveView`, `MoreOptions`, `Link`); the host renders it with its own components and sends events (`click`, `change`) back as messages. No HTML, CSS, script, `style` or class names cross; tone is chosen from names (`accent`, `muted`, `error`, `warning`). `Picture` takes the plugin's own PNG bytes within limits; `Canvas` shows bitmaps the worker draws on an `OffscreenCanvas`; `LiveView` embeds the host's live view of an element; `Link` opens only `https:` in the system browser after a line naming the host. The kit has its own version number (`viewKit: 1`).

Why this and not a sandboxed iframe per plugin:

- **One mode and plain words hold by construction.** `MoreOptions` is a kit node, the look is the app's, a theme changes plugin screens too, and keyboard and screen-reader behaviour come from the host's components. An iframe gives each plugin its own look, its own focus handling and its own idea of where ids go.
- **The wall that exists is enough.** The worker of ADR 0035 stays the only place plugin code runs; no new origin, no CSP change, no frame on the UI thread ([ADR 0035](0035-plugin-sandbox-and-capability-manifest.md) D6 rejected the iframe for that reason).
- **A plugin cannot imitate the app's trust screens.** It cannot draw over the permission dialog, the key card of the AI helper or Settings, because it draws nothing itself.
- **It can be tested and searched.** A view tree is data: the test harness snapshots it, the inspector shows it, e2e drives it by test id.

The cost is that a plugin cannot bring an arbitrary UI library or free-form layout. `Canvas` covers custom drawing (previews, editors on a picture). If the spike (B840) measures that typing through the kit is too slow, or that `OffscreenCanvas` cannot be used in the plugin worker under the app's CSP, the fallback is a sandboxed `srcdoc` iframe with an opaque origin **for the `Canvas` node only**, behind the same message protocol; whole-screen iframes stay rejected.

**D4. Permissions, shown before anything runs.** Manifest version 2 keeps `capabilities` (the contribution points) and adds `permissions`. A plugin with none can do what plugins can do today.

| Permission | In the app's words | What it gives |
|---|---|---|
| `project:read` | "See everything in the mod you have open" | Read the open project's elements, asset names and problems (today a plugin sees only the element it is asked about) |
| `assets:read` | "See your mod's pictures, sounds and models" | Read asset bytes of the open project |
| `project:write` | "Change your mod. Every change can be undone" | Return changesets (D5), asset writes included |
| `network` with a list of hosts | "Send and get things from example.com" | `fetch` through the host's broker, to exactly those hosts (D6) |
| `files:pick` | "Read or save a file you choose" | The host's file dialog; the plugin gets only that file's bytes, or hands bytes to be saved |
| `clipboard:write` | "Copy things for you to paste" | Write text to the clipboard on a user action; there is no clipboard read |
| `storage` | "Remember its own settings" | A key-value store of its own (5 MB), per plugin, app-wide or per project |
| `ai:tools` | "Give the AI helper new skills" | Its `aiTools` are offered to the helper |
| `game:hooks` | "Run when you export or press Play" | The `beforeExport`, `beforePlay`, `exported` and `playStarted` hooks and `exportSteps` |

The install dialog lists these sentences before any of the plugin's code runs, with one extra line when `project:read` or `assets:read` comes with `network`: "It can send what is in your mod to example.com." An update that asks for more stays uninstalled until the user agrees to the new lines; an update that asks for the same or less needs no question. Codes and hosts in full are under More options. A call without its permission fails in the plugin with `plugin.permission-denied` and is logged in the inspector.

**D5. Writing to a project is a changeset, never a write.** A plugin cannot mutate anything. With `project:write` it returns a changeset (add, change, rename or remove elements; write or remove assets), built on the app's existing changeset planner (`app/src/renderer/src/changeset/`), and the host applies it as **one undo step** named "<plugin>: <title>". Rules:

- A changeset is applied only as the answer to a user action on that plugin's own command, button, fix or tool. Hooks and background work can only suggest (D2 `hooks`).
- A changeset that touches more than the thing that is open, removes or renames anything, or touches more than ten things is shown first ("<plugin> wants to change 4 things", with See it for each, as the AI helper's tray does); otherwise it is applied with an Undo toast.
- The result must validate as the project's own edits must (unknown kinds, bad ids and paths outside the project are refused whole).
- Asset writes go through the undoable asset writes of ADR 0045.

**D6. The network goes through main, to named hosts only.** The worker keeps no `fetch`. `context.fetch` is a request to the main process, which allows only `https:` to a host on the list the user approved, follows no redirect to another host, refuses loopback, link-local and private addresses after name resolution, sends no cookies or app credentials, caps a response at 10 MB and 30 s and a plugin at 60 requests a minute. The renderer's CSP does not change (`connect-src 'self'`). Wildcard hosts are refused in the manifest.

**D7. Where code runs, limits and failure.** One worker per plugin in the renderer, as ADR 0035, with these additions: plugins start after first paint; a plugin can be started and stopped without restarting the app (an unloaded plugin's kinds stay registered as unavailable, as a failed plugin's do today); every host call and every plugin call has a deadline (commands 10 s with a visible "Stop"; view updates 100 ms soft, with "This is slow" after three misses; hooks 2 s; the rest as ADR 0035 D4); a view tree is at most 2,000 nodes and a message 256 KB; a canvas at most 1024 by 1024 at 30 frames a second. A plugin that crashes or times out is turned off for the session with a plain line and "Turn it back on". Whether plugin workers move into a process of their own (so that a plugin exhausting memory cannot take the window with it, the weakness ADR 0035 D5 records) is a spike question; the default is to stay in the renderer and rely on D8's crash loop guard.

**D8. Off switches, safe mode and pinning.**

- **Each plugin** has On and Off in Settings > Plugins, and "Off for this mod".
- **All plugins off** is one switch at the top of Settings > Plugins.
- **Safe mode** starts the app with every third-party plugin off: the command-line flag `--safe-mode`, a Start menu shortcut "MCSuperMods (plugins off)" on Windows (verify at implementation), and by itself when the app failed to reach a usable window twice running with plugins on. A bar says "Plugins are off" with "Turn them back on".
- **Hash pinning.** A plugin is installed from a package (`.msmplugin`, a zip with the manifest at its root). At install the app records the SHA-256 of the package and of every file in `<msmHome>/plugins.lock.json`; at each start a plugin whose files differ is left off with "This plugin changed since you installed it". Folders loaded in dev mode (D11) are exempt and badged.
- **The catalogue index is signed** (D9), so a plugin from the catalogue is pinned to the hash its review saw. Author signatures are not required (reserve).
- **Recall.** The catalogue index carries a list of recalled plugin versions with a reason; at the next check the app turns such a version off and says why. This is the remote kill switch; it removes nothing from the user's disk.
- **The AI helper** treats what a plugin's tool returns as data, never as instructions; a plugin never sees the key, the conversation or other tools' results; a changeset from a tool is a card the user accepts, as now.

**What a plugin can never do**, whatever its permissions: use Node, Electron, the preload bridge or the app's DOM; load or evaluate code from outside its package; read or write files it was not handed by a file dialog; reach a host the user did not approve; read the clipboard; see another plugin, another project, the AI key, the user's Minecraft folders or launcher accounts; start a program; change a project without an undo step; stop the user opening or saving; replace, hide or redraw the app's own commands, safety screens, Settings > Plugins or the permission dialog; take a reserved shortcut; update itself; run because a project folder contains it.

**D9. Getting plugins: a file, a link, the catalogue.**

- **App-wide install, per-project use.** Plugins live in `<msmHome>/plugins/` and are on for every mod unless turned off for one. A project records the plugins it uses (`plugins: { <id>: <version range> }` in `msm.project.json`, written by the host when a plugin's kind, section data or setting enters the project). Opening a mod that names a plugin the user lacks says "This mod uses the plugin X" with **Get it**; the mod still opens, as today. **A project never carries plugin code**: opening a downloaded mod must not run anything.
- **From a file** (`.msmplugin`, or dropping it on the window) and **from a link** (`https:` only, the same package). Both show the permission dialog with "Not checked by MCSuperMods" at the top.
- **The catalogue** is the community repository: `plugins/<id>/plugin.json` per plugin (name, one sentence, pictures, author, source repository, licence, and for each version: the package's URL, SHA-256, size, plugin API range, permissions, changelog, date). CI builds `plugins/index.json` and signs it (Ed25519; the public key ships in the app; verify at implementation). A plugin enters by pull request. CI checks: the manifest; the package's hash; that it loads in the kit's headless host and its contributions validate; that every call it makes is covered by its declared permissions; limits; licence and source link; a live view for every visible kind (D12); plain-words lint of its labels. A maintainer approves each new plugin and each version that asks for more permissions; a version with the same or fewer permissions merges when CI is green (a question for the user). Only free plugins with their source open are listed.
- **In the app**: Settings > Plugins has **Yours** and **Get more** (cards with the sentence, what it adds, what it may do, who made it, when it changed). The app reads the index over `https:` at most once a day when Settings > Plugins > "Look for plugin updates" is on (a question for the user) and on opening Get more; it sends nothing but the request.
- **Updates** are never installed by themselves. "Update ready" shows the changelog and any new permission lines; the version before is kept for **Go back to the version before**. Uninstall removes the package and, on a second question, what it stored; elements of its kinds stay in projects, as today.

**D10. Words: the plugin's own now, the app's later.** A plugin's names, labels and sentences can come in several languages (`text`). Replacing the app's own words needs a string catalogue the app does not have; that is a reserve brief with its own count of strings, not part of this plan (a question for the user).

**D11. The developer kit.**

- **`@msm/plugin-kit`** (new package, depends only on `@msm/plugin-api` and a bundler): `msm-plugin build`, `check` (the same checks as the catalogue's CI), `pack` (writes the `.msmplugin` and its hashes) and a **test harness** for Vitest, `createTestHost(plugin, { project, permissions })`, which speaks the real protocol: run a command and assert the changeset, render a view and snapshot the tree, send events, assert that a call without its permission is refused.
- **`tools/new-plugin --external --with <points>`** writes a working template for each extension point, with its test.
- **Dev mode in the app**: Settings > Plugins > More options > **Load a plugin I am building…** picks a folder; main watches it and the app reloads that plugin's worker on a change, keeping the open Studio and its state where the plugin's state survives. The plugin is badged "Being built".
- **The plugin inspector** (a panel, dev mode only): contributions found and refused with the reason, every message with its time against its deadline, permissions used and denied, the current view tree, storage, problems, deprecated API used.
- **Docs and examples**: a "Make a plugin" part of the docs site with one page per extension point, the generated API reference, the permission and safety rules, and `fixtures/sample-app-plugin` using every point (the content sample `fixtures/sample-plugin` stays).

**D12. Everything visible live, for plugins too.** A plugin kind that a player can see or hear names its live view: `fromFiles` by default (free: the host already has a live view for most vanilla file types and for bundles), a `canvas`, or a view. The host re-asks on every edit (debounced, with the deadline of D7), so it follows edits by itself. `msm-plugin check` and the catalogue's CI report a visible kind without one; the catalogue shows "No live preview" on such a plugin. A plugin's section on a built-in kind does not replace that kind's live view.

**D13. Stability promises.** Supersedes the "at least one minor" of ADR 0036 D1 for third-party-facing members:

- Every exported member is marked `@stable` or `@experimental`. Experimental points need `"experimental": ["<point>"]` in the manifest, may change in any minor, and the catalogue labels plugins that use them. The new points start experimental and become stable at this plan's close, each by a line in the ADR.
- A stable member is not removed or narrowed before 2.0. A deprecated member keeps working, is marked `@deprecated` with its replacement, is reported by `msm-plugin check` and the inspector (`plugin.deprecated-api`), and is listed in the docs' deprecations page with the date.
- The view kit, the manifest and the catalogue index carry their own version numbers; the host reads every older version it ever shipped.
- A security fix may break a plugin; that is the only exception, and the recall list (D8) and release notes say so.
- The catalogue's CI runs every listed plugin's newest version against each new app release and marks the ones that fail.

**D14. Words and placement in the app (one mode, [ADR 0130](0130-one-mode-more-options.md)).** "Plugins", "Get more", "Yours", "On", "Off", "Off for this mod", "What it adds", "What it may do", "Not checked by MCSuperMods", "Being built". Not "capability", "permission scope", "manifest", "sandbox", "hash" or "extension point" outside More options and the developer docs. Whatever a plugin adds is marked with the plugin's name where it appears (a row's heading, "From <plugin>" on a section, the name beside a command), so a user can tell the app's own things from added ones and find which plugin to turn off.

## Consequences

- Plugin API grows by several additive minors (the numbers are named by the main session at each brief; 1.28.0 stays reserved for Plan C's B782). `packages/plugin-api/src/index.ts`, `plugin.ts`, `version.ts` and `CHANGELOG.md` are single-owner files across all plans while a brief of this plan holds them. `ElementMeta` gains `plugins?`.
- ADR 0035 is amended, not replaced: the worker, `msm-app://` and the proxy stay; manifest version 2, host calls from the worker, permissions, start and stop without a restart and the lock file are new. Manifest version 1 plugins keep loading unchanged.
- The "no private hooks" rule of DESIGN §7 gets an honest edge: built-in Studios remain React components inside the app, which a third-party plugin cannot ship. What third parties get is the kit. Built-in plugins may move to the kit over time but nothing here requires it.
- `msm.project.json` gains an optional `plugins` map; older app versions ignore it (verify at implementation that the project schema tolerates unknown top-level keys; otherwise a project format note).
- Main gains a network broker and a package store: the first place the app fetches on a plugin's behalf. The threat model moves from "a plugin can reach nothing" to "a plugin can reach what the user agreed to"; D4's sentences and D6's broker are the whole defence there, and D5 bounds what a plugin can do to a project.
- The community repository gains a `plugins/` tree, CI and a signing key that somebody must keep; review is real work for the maintainer.
- Size: the plugin host, the kit renderer, Get more and the inspector are lazy chunks; first paint may grow only by the bar of safe mode and registry seams. The renderer is at 20.1 of 21 MB today, so each app brief reports `tools/check-size`, and the plan asks for a size brief first if the stop line is reached.
- The AI helper's prompt budget (ADR 0125 D7) is not touched by plugins: plugin tool descriptions are added outside the pinned prompt under their own cap (1,500 characters a plugin, 6,000 in all; verify at implementation).
- Not solved: a plugin that is allowed a host can send what it may read there; a plugin can still produce harmful content (ADR 0035 D5); review is by people and can miss things. The dialogs say the first; the guide says all three.
- DESIGN §7 is rewritten at acceptance; until then it carries a pointer line. `docs/guide/plugins.md` is rewritten by the plan's docs brief.

## Status

**Proposed (2026-11-25).** Plan and briefs: [`docs/PLAN-app-plugins.md`](../PLAN-app-plugins.md) (B840 to B879; spike B840 first). Eight questions for the user, with defaults, are in the plan's section 2; the spike and wave P1 do not wait for them.
