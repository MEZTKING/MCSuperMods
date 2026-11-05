# Contributing to MCSuperMods

Thank you for helping. MCSuperMods is a desktop mod maker for Minecraft Java; this file explains how to build it from source, the rules a change must follow and how to send it.

## Running from source

Follow [Try it](README.md#try-it) in the README: Git, Node.js 24 or newer and pnpm 12, then `pnpm install` and `pnpm dev`. The runtime mod in `engine-mod/` needs JDK 25 (`cd engine-mod && ./gradlew build`).

The commands you will use most:

| Command | What it does |
|---|---|
| `pnpm dev` | Starts the app in development mode |
| `pnpm lint` | Biome plus the dependency and layer check (`tools/check-deps`) |
| `pnpm typecheck` | TypeScript in strict mode across the workspace |
| `pnpm test` | Every package's Vitest suite |
| `pnpm build` | Builds every package, the app and the documentation site |
| `pnpm --filter @msm/app smoke` / `e2e` | Starts the built app headless (`xvfb-run -a` on Linux) |
| `pnpm --filter @msm/site dev` | Serves the user guide site locally |

## Repository layout

The folders and what lives where are described in [DESIGN.md section 15](docs/DESIGN.md#15-repository-layout); [DESIGN.md](docs/DESIGN.md) is the authoritative design. The user guide is in [`docs/guide/`](docs/guide/README.md).

## Rules that matter to a contributor

- British English in code comments, docs and UI text; no emojis.
- Version-specific Minecraft facts (folders, formats, data versions, Fabric and GeckoLib versions) live only in `packages/targets`; `pnpm lint` rejects version literals elsewhere.
- New built-in plugins start from `node tools/new-plugin/index.ts <name>`, never by copying a folder by hand.
- Built-in plugins import only the public plugin API (`@msm/plugin-api`, plus `@msm/schemas`).
- Every architecture change needs an ADR in [`docs/adr/`](docs/adr/) (Context / Decision / Consequences / Status) and an update to `DESIGN.md`.
- Tests sit next to the code they cover (each package's `test/` folder); a change comes with its tests.
- Write "(verify at implementation)" rather than guessing a version number.
- Run `pnpm lint && pnpm typecheck && pnpm test` before opening a pull request; CI (`.github/workflows/ci.yml`) must be green before it is merged.

## How the work is organised

Larger work is planned by an orchestrator session that reads the design and roadmap and writes numbered briefs (files, paths, exit criteria); executor sessions implement one brief each, run the tests and report; decisions that change the architecture are recorded as ADRs first. You do not need to follow this process for a small fix, but a change that moves a boundary between packages needs an ADR. Every session appends an entry to [`docs/DEVLOG.md`](docs/DEVLOG.md).

## Branches and pull requests

- Keep a pull request small and about one topic; split unrelated changes.
- Branch from `main`; `main` only moves forward when CI is green.
- Fill in the [pull request template](.github/PULL_REQUEST_TEMPLATE.md): what, why, the tests you ran, the docs you updated and the ADR if one is needed.
- Update the user guide when a UI label, menu entry or template list changes.

## Commit messages

One line that says what changed and where, in the present tense, optionally prefixed with the area or the brief (`Guide: link CHANGELOG.md by its GitHub URL`, `Release workflow: strip CR from jq output`); details in the body when the subject cannot carry them.

## Adding a Minecraft target

Each supported Minecraft version is one package in `packages/targets/`; see [`packages/targets/CLAUDE.md`](packages/targets/CLAUDE.md) for the facts a target holds, the vendored schemas and the migration hook.

## Writing a plugin

Start with the [user guide](docs/guide/README.md), the [`@msm/plugin-api` README](packages/plugin-api/README.md) (the public interfaces and the versioning policy) and the sample plugin in [`fixtures/sample-plugin/`](fixtures/sample-plugin/).

## Reporting bugs

Open an issue with:

- the MCSuperMods version (the installer's file name, or the version at the top of **Help → What's New…**);
- the Minecraft version the project targets and the launcher you use;
- what you did, what you expected and what happened;
- the relevant log line: for problems in the game, the `[msm_runtime]` lines from the Minecraft log.

## Licence

MCSuperMods is released under the [MIT Licence](LICENSE). By contributing you agree that your contribution is licensed under it. The licence requires the copyright notice ("Copyright (c) 2026 MEZTKING and MCSuperMods contributors") to stay with every copy or substantial portion of the software, so keep it when you redistribute or fork.
