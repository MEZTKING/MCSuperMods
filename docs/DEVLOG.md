# MCSuperMods Devlog

Append-only record of every working session. Newest entry at the bottom. Format:
`## YYYY-MM-DD — <agent> — <topic>` followed by What / Decisions / Next. Never edit past entries.

---

## 2026-11-03 — main session — Project scoping question

**What**
- The repository contained only a placeholder README.
- The user asked for the scope and feasibility of a full-customisability mod maker for Minecraft Java Edition (resource packs through data-driven content, structures, biomes, mob animations).
- The main session answered with a six-layer breakdown:
  1. resource packs
  2. data packs
  3. structures
  4. worldgen
  5. custom blocks, items and entities with behaviour
  6. models and animations
- It also covered three things:
  - the code-generation vs runtime-engine trade-off, with a hybrid recommended
  - modularity principles: a version-agnostic IR, schema-driven editors, per-version targets and a plugin API
  - a rough phased roadmap
- It named the competitors: MCreator, Blockbench and the Misode generators.

**Decisions (user)**
- Fabric first, with vanilla-only pack export as an option.
- Desktop application.
- For both beginners and power users.
- Solo developer; tech stack left to the agents.
- Workflow: Fable as orchestrator, Opus at medium effort as executor.
- Keep a devlog, and split CLAUDE.md into multiple scoped files to save tokens.

**Next**
- Produce the design document, roadmap, scoped CLAUDE.md files and agent definitions.

---

## 2026-11-03 — orchestrator (Fable) — Architecture and writing briefs

**What**
- Verified the external facts by web search:
  - Minecraft Java uses year-based versions since 26.1. The current release is 26.3 (15 Sep 2026).
  - 26.1+ is unobfuscated and needs JDK 25.
  - Fabric uses a non-remapping Loom variant for 26.1+.
  - GeckoLib 5.5+ supports 26.1.
  - SpyglassMC `vanilla-mcdoc` tracks 26.3.
- Produced the architecture decisions and literal briefs for 17 files, split into 4 parallel executor batches with no file overlap.
- Froze the 19 DESIGN.md H2 headings and their anchors so every cross-link stays stable.

**Decisions**
- **Names:** MSM (`@msm/*`, mod id `msm_runtime`, Java package `dev.mcsupermods.runtime`).
- **Minecraft target:** 26.3 primary. Support the current release and the previous one (N and N-1). No pre-26.1 support in v1.
- **App:** Electron rather than Tauri. One language, reliable WebGL, and the Node ecosystem: Spyglass, deepslate, prismarine-nbt.
- **Monorepo:** React 19, TypeScript strict, Zustand, Immer command stack with JSON patches, Radix + Tailwind, Monaco, three.js + deepslate, pnpm + Turborepo, Vitest, Biome.
- **Engine mod:** Java 25, Fabric with Mojang names. Definitions in `msm/` are scanned at init because registries freeze. The runtime jar is nested inside each exported content jar.
- **Behaviour model:** Bedrock-style components and events defined once in MSM mcdoc schemas, consumed by both the app and the runtime.
- **Escape hatches:**
  - Tier 0: no-code components.
  - Tier 1: TypeScript scripts transpiled with esbuild and run by Rhino in-game.
  - Tier 2: one-way eject to a Fabric Java project.
- **Project format:** a git-friendly directory with one JSON file per element and sorted keys.
- **Roadmap:** 8 phases, about 43–58 focused solo weeks. The MVP (Phase 1) is Resource Pack Studio only. Phase 4 opens with a registry-freeze spike.

**Next**
- Dispatch the executor batches.

---

## 2026-11-03 — executors (Opus, medium effort) x4 — Documentation batches

**What**
- **Batch A:** `docs/DESIGN.md`, 5,488 words, 19 sections exactly as frozen.
- **Batch B:** `docs/ROADMAP.md`, `README.md`, `docs/CLAUDE.md`.
- **Batch C:** root `CLAUDE.md`, `.claude/agents/orchestrator.md`, `.claude/agents/executor.md`, `app/CLAUDE.md`, `engine-mod/CLAUDE.md`.
- **Batch D:** seven scoped guides under `packages/` (core, schemas, plugin-api, plugins, exporters, targets, interop).
- Reported deviations were minor:
  - multi-phase status lines
  - placeholder component ids (`msm:redstone`, `msm:tool`, ...)
  - the ROADMAP raw word count slightly over target because of table and checkbox markup
  - a few extra conventions added, such as no reuse of ADR numbers

**Decisions**
- None beyond the orchestrator plan. The placeholder component ids are provisional until the MSM mcdoc schemas are written in Phase 4.

---

## 2026-11-03 — main session — Review and commit

**What**
- Ran the orchestrator's acceptance checks. All passed:
  - DESIGN.md has 19 H2 headings matching the frozen list.
  - Every `DESIGN.md#anchor` link in every Markdown file resolves.
  - Root CLAUDE.md is 67 lines (limit 70). Every scoped CLAUDE.md is 55 lines or fewer.
  - No emojis.
- Wrote this devlog and committed everything to branch `ccr-d077e76e-4gnbx2`.

**Next (Phase 0 — Foundations; see docs/ROADMAP.md)**
- The orchestrator writes Phase 0 briefs:
  - the monorepo skeleton (pnpm, Turborepo, Biome, tsconfig, CI)
  - `@msm/plugin-api` interfaces
  - `@msm/core` IR with project load/save and the command stack
  - `@msm/schemas` loading vanilla-mcdoc for 26.3
  - the Electron shell opening and saving a project
- Resolve the open questions due in Phase 0: the exact Electron, Node and Loom versions, and the mcmeta branch naming.
- Choose a licence (open question in DESIGN.md section 18).

---

## 2026-11-04 — orchestrator (Fable) — Phase 0 plan

**What**
- Read the root CLAUDE.md, ROADMAP Phase 0, DESIGN sections 3–7, 9 and 14–19, and the scoped guides.
- Wrote 8 implementation briefs (B01, B02, B04–B09; B03 was merged into B07) in 4 dependency-ordered waves, with no file shared within a wave. Each brief listed exact APIs, tests, acceptance commands and what was out of scope.

**Decisions** (pinned and checked against npm and the upstream repos)
- **Toolchain:** Node ≥22.18, pnpm 10.28 with a catalog, TypeScript 6.0.3 (7.x is the Go port and the tooling is not ready), Vite 8, electron-vite 6, Vitest 5, Biome 2.6, Turborepo 2.11, React 19.3, Electron 45.2.2.
- **Internal packages:** source-first, typechecked with `tsc -b` project references.
- **vanilla-mcdoc:** it has no tags, so we pin a commit sha. Phase 0 consumes the vendored Spyglass symbol export; the Spyglass Service is deferred to Phase 1.
- **mcmeta:** refs are the tags `26.3-summary` and `26.3-registries`.
- **26.3 pack formats:** resource 97.1, data 121.0 (verified).
- **App:** core runs in the renderer. The main process implements `PlatformAdapter` over zod-validated, versioned IPC.
- **IR types** live in `@msm/plugin-api`; their behaviour lives in `@msm/core`.
- **Licence:** left for the user (MIT proposed).

---

## 2026-11-04 — executors (Opus, medium effort) — Phase 0 implementation

**What** (main session verified and committed each wave in turn)
- **Wave 1, B01:** the monorepo skeleton:
  - pnpm workspace and catalog, Turborepo, Biome, `tsconfig` project references
  - CI workflow
  - `tools/check-deps`: enforces the layer map and rejects any `26.<n>` literal outside `packages/targets`
  - stub packages
- **Wave 2:**
  - **B02:** `@msm/plugin-api` 0.1.0, with the full public surface and `definePlugin`.
  - **B04:** `tools/sync-mcdoc` and `tools/sync-mcmeta`, plus vendored 26.3 data (4.4 MB). mcdoc-cli 0.1.63 build mode produced an empty export. The fix is an `env.dependencies` entry in the temporary checkout, and the output is now byte-identical to upstream.
  - **B05:** `@msm/schemas`: the `SchemaNode` model, `since`/`until` version gating, a lazy memoised schema index, and a fixture subset.
- **Wave 3:**
  - **B06:** `@msm/core`:
    - a deterministic sorted-key serialiser
    - an injected file system with an in-memory version
    - load, save and migrators
    - the element kind registry
    - an Immer command stack with RFC 6902 patches, undo/redo and dirty tracking
    - golden round-trip fixtures
  - **B07:** `@msm/target-mc-26.3`: the target facts and the "26.3 schemas load" exit-criterion test (2,105 types, loads in about 95 ms).
- **Wave 4:**
  - **B08:** `@msm/app` Electron shell:
    - sandboxed renderer and CommonJS preload
    - project-scoped file system in the main process
    - new, open and save; element list; raw JSON editor; problems panel; undo/redo
    - a headless smoke run under xvfb
  - **B09:** ADRs 0001–0008. DESIGN sections 5, 6, 9, 14, 15 and 18 corrected to match the implementation (including the incorrect "tag exists" claim in §6). Four scoped CLAUDE.md files refreshed.

**Decisions**
- **Data-loss risk found by B06.** Load skips invalid element files, and save deletes `content/*.json` files it did not write. The main session decided that for Phase 0 the app refuses to save while error-severity problems exist; B08 implemented this with a test. The permanent fix is DESIGN Q9, for Phase 1.
- Only one executor per wave may change `pnpm-lock.yaml`, so parallel executors don't produce conflicting lockfiles.

---

## 2026-11-04 — main session — Phase 0 review and close

**What**
- Ran the exit criteria on a clean install, and all passed:
  - `pnpm install --frozen-lockfile`, `pnpm lint` (Biome and check-deps), `pnpm typecheck`, `pnpm test` and `pnpm build`
  - `pnpm --filter @msm/app smoke` exits 0
  - 8 ADRs; DESIGN still has 19 H2 headings
- Tests: 203 in total.

| Package | Tests |
|---|---|
| core | 109 |
| schemas | 27 |
| app | 26 |
| tools | 23 |
| plugin-api | 11 |
| target | 7 |

- Ticked the `@msm/app` box in ROADMAP and added a Phase 0 row to the Milestone Log.
- Updated the status lines in the README, root CLAUDE.md, `docs/CLAUDE.md` and `app/CLAUDE.md`.
- Added the Electron binary download and the xvfb smoke step to CI. The CI workflow has not yet run on GitHub.

**Open / Next**
- **Licence:** awaiting the user (MIT proposed). The Phase 0 release is left untagged until it is decided.
- **Phase 1 carry-overs:**
  - the permanent fix for the save-time data loss
  - symlink containment in the scoped file system
  - a shared path-validation module for core and app
  - live problems and clearing the save block
  - concrete and template mcdoc types (`ItemStack`), which currently normalise to `unsupported`
  - a `keyType` on `'*'` fields
  - `typescript` devDependencies in plugin-api, schemas and target
- **Next:** the orchestrator plans Phase 1, Resource Pack Studio.

---

## 2026-11-04 — orchestrator (Fable) — Phase 1 plan

**What**
- Planned Phase 1 (Resource Pack Studio): 6 waves, 20 briefs (B10–B29), with one lockfile owner per wave.

**Decisions** (ADRs 0009–0013)
- **Validation:** an MSM structural validator over `SchemaNode` serves as both the live check and the export gate; Spyglass is deferred to Phase 2.
- **Preview:** deepslate's own renderer, no three.js. Seven MSM-authored fallback parent models.
- **Asset extraction:** client-jar assets are extracted in the main process into `~/.msm/cache/assets/<version>/`, tested with a synthetic jar.
- **Save:** save deletes only the files it loaded (`SaveManifest`), which resolves DESIGN Q9. Save is never blocked; errors block export only.
- **Toolchain:** plugin-api 0.2.0, a `@msm/targets` aggregator, electron-builder 26.18, and version pins for deepslate, Monaco, Tailwind 4, Radix and fflate.

---

## 2026-11-04 — executors (Opus, medium effort) — Phase 1 implementation

**What** (main session verified and committed each brief separately)
- **Wave 1:**
  - B10 plugin-api 0.2.0
  - B11 schema generics, tuples, `keyType`, tags. Unsupported nodes in Phase 1 kinds dropped from 28 to 3.
  - B13 workspace plumbing and the `tools/new-plugin` scaffold
  - B16 ADRs 0009–0013
- **Wave 2:**
  - B12 `validateJson` and the registry index
  - B14 client-jar extraction, with path-traversal and zip-bomb guards
  - B15 the targets aggregator
  - B17 core save manifest, `setElementValue` with typing coalescing, asset commands, `lowerProject`
- **Wave 3:**
  - B18 exporters: deterministic zip (identical in every timezone), the validation gate, `vanilla-packs`
  - B19 six resource-pack kinds with golden fixtures validated against the real 26.3 schemas
  - B20 main-process IPC domains and symlink containment
  - B21 Tailwind/Radix shell with lazy Monaco
- **Wave 4:**
  - B22 `SchemaForm` generator
  - B23 session integration: live problems, manifest save, assets, export and install
  - B24 deepslate preview with fallback parents
  - B25 Windows installer config, release workflow, Playwright harness
- **Wave 5:**
  - B26 Studio wiring: forms, preview, templates, import with thumbnails, language and pack studios, settings with asset extraction, problem navigation, undoable asset removal through `.msm/trash`
  - B27 sample resource pack (self-made textures, `minecraft:stick` override), exporter SHA-256 golden, README "Try it"
  - B28 golden-path e2e, CI e2e, packaged smoke and size steps, `tools/check-size`
- **Wave 6:**
  - B29 docs sync, ROADMAP ticks, Milestone Log
- **Extra fixes from the main session:**
  - The validator accepts `minecraft:`-prefixed dispatcher keys.
  - Enum discriminators with no dispatcher member (such as item model `empty`) validate.
  - Clipped sidebar row actions fixed.
  - Problem navigation focuses map-entry values.

**Decisions**
- **User: Windows-only releases.** macOS is dropped and not planned. The Linux `dir` build is used only for verification.
- **Main session decisions:**
  - Production CSP keeps `style-src 'unsafe-inline'`, because Monaco and Radix inject runtime styles. Scripts stay `'self'`.
  - The seven fallback parents are self-authored and acceptable (Q12, pending a user veto).
  - Asset removal is undoable through `.msm/trash`, which is emptied on open or create.
  - Exporters may use the resourcepack plugin in tests only.
  - Size budgets replace the unachievable "150 MB unpacked" rule:
    - asar ≤ 25 MB
    - renderer ≤ 8 MB, with no renderer JSON over 100 kB
    - Windows installer ≤ 150 MB
- **Process:** GitHub push returned transient HTTP 500s twice. They were retried with backoff and nothing was lost.

---

## 2026-11-04 — main session — Phase 1 review and close

**What**
- Ran the Phase 1 exit criteria on a clean install, and all passed:
  - `pnpm install --frozen-lockfile`, `lint`, `typecheck`, `test` and `build`
  - xvfb smoke and e2e: 2 tests, golden path about 2.4 s, stable over 3 runs
  - `dist:dir`, then the packaged smoke test
  - `check-size`: asar 10.2 MB, renderer 5.6 MB
  - 13 ADRs; DESIGN still has 19 H2 headings
  - no `26.<n>` literal outside `packages/targets` (only the exempt dev scripts in `tools/`)
  - no Mojang files or jars tracked
- Tests: 629 in total.

| Package | Tests |
|---|---|
| app | 178 |
| core | 139 |
| schemas | 97 |
| tools | 52 |
| exporters | 47 |
| plugin-api | 41 |
| interop | 31 |
| resourcepack | 27 |
| targets aggregator | 9 |
| mc-26.3 | 8 |

- Estimated Windows installer size is about 122 MB. It cannot be built here (no wine), and neither the CI nor the release workflow has run on GitHub yet.

**Open / Next**
- **Needs the user:**
  - Licence (MIT proposed). This blocks the `v0.1.0` tag.
  - Auto-update: make this repo public, or use a separate public releases repo.
  - In-game check on Windows with Minecraft 26.3: install the sample pack and hold a stick.
  - The Q12 fallback-parent policy (veto or accept).
- **Next:** the orchestrator plans Phase 2, Data Pack Studio, including the Phase 2 carry-overs listed in ROADMAP.
