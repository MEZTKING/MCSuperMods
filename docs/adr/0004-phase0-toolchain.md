# ADR 0004: Phase 0 toolchain

## Context

Phase 0 stands up the monorepo ([ROADMAP Phase 0](../ROADMAP.md)). [Tech Stack](../DESIGN.md#14-tech-stack) named the tools but left versions as "(verify at implementation)", and assumed tsup builds for every library package. Several current releases change defaults or have ecosystem gaps: TypeScript 7 is the native (Go) port and is not yet consumed by Vitest typecheck or electron-vite; Vitest 5 needs Vite as an explicit peer; Biome 2.6 formats Markdown. DESIGN [Open Question 8](../DESIGN.md#18-open-questions) also needed an answer. All versions below were read from the npm registry on 2026-11-04.

## Decision

**Pins.** Every shared version is pinned once in the pnpm catalog (`pnpm-workspace.yaml`):

| Concern | Pin |
|---|---|
| Node | `engines.node` `>=22.18.0 <27`; `.nvmrc` `22` (maintenance LTS); CI reads `.nvmrc` |
| Package manager | pnpm 10.28.0 via `packageManager` (corepack) |
| TypeScript | 6.0.3 (not 7.x) |
| Orchestration | Turborepo 2.11.10 for `lint`, `test`, `build`; `typecheck` is one root `tsc -b` |
| Lint and format | Biome 2.6.4 |
| Tests | Vitest 5.1.0 with Vite 8.3.5 installed explicitly |
| App | Electron 45.2.2, electron-vite 6.0.0, `@vitejs/plugin-react` 6.2.1, React and react-dom 19.3.1, zustand 5.0.16 |
| Command stack | Immer 11.2.9 |
| Misc | semver 7.8.6, zod 4.6.7 (app IPC only), `@types/node` 22.20.5 |
| Spyglass | `@spyglassmc/mcdoc-cli` 0.1.63, tools only (ADR 0005) |

**Source-first internal packages.** Each `@msm/*` package's `exports` points at `./src/index.ts`. Vite, Vitest and electron-vite transpile from source. `tsc -b` over composite project references (declarations into git-ignored `dist-types/`) typechecks and enforces references. tsup is used only when `@msm/plugin-api` is published (Phase 7).

**Dependency direction.** `tools/check-deps` reads every workspace `package.json`, checks internal dependencies against `tools/check-deps/layers.json`, and flags Minecraft version literals (including in JSDoc and comments) in `.ts` files outside `packages/targets`. It runs in `pnpm lint` and therefore in CI, alongside TypeScript project references and a Biome `noRestrictedImports` rule on `@msm/plugin-api`. See [Dependency direction](../DESIGN.md#15-repository-layout).

**Conventions that follow from the tools.**

- Biome excludes `**/*.md`, because Biome 2.6 would otherwise reformat Markdown.
- Packages with golden JSON fixtures add a nested `biome.json` that excludes `test/fixtures` so Biome never reformats them (`packages/core` does this).
- `tools/` scripts run with plain `node` through Node's type stripping, so they use only erasable syntax, `node:` imports and explicit `.ts` relative imports (`allowImportingTsExtensions`). Every other package uses extensionless imports (`moduleResolution: bundler`).
- Code and JSDoc outside `packages/targets` write version-neutral examples (`mc-<version>`, not a literal version), because check-deps flags literals.
- Styling is plain CSS in Phase 0; Radix and Tailwind arrive with the Phase 1 form generator.

## Consequences

- No build step for internal packages; changes are visible to the app and tests immediately.
- TypeScript 6 is a bridge release; moving to 7.x is revisited in Phase 1 once tools consume it.
- Node 22 is in maintenance LTS until 2027-04-30; `.nvmrc` moves to the active LTS (24 or 26) in Phase 1, together with a pnpm upgrade (DESIGN [Open Questions](../DESIGN.md#18-open-questions)).
- Publishing `@msm/plugin-api` needs a tsup build added in Phase 7.

## Status

Accepted (2026-11-04). Together with ADR 0001, resolves DESIGN Open Question 8.
