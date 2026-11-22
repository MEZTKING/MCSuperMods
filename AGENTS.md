# Agents working on MCSuperMods

This file is for any coding agent or person picking up the work, whatever tool they use. The project's rules live in the `CLAUDE.md` files: they are plain Markdown instructions, not specific to one tool, and they apply to everyone.

## Read in this order

1. `docs/HANDOFF.md`: where things stand, what is in progress, what waits on the user, what to do next. Its section "State at handover" is the most recent snapshot.
2. The root `CLAUDE.md`: what the project is, the directory map and the golden rules.
3. The last few entries at the end of `docs/DEVLOG.md` (append-only; newest last).
4. The open plans, both drafts with Proposed ADRs, in the order HANDOFF "Next" gives: `docs/PLAN-live-views.md` (live views 2 to 4, B600–B648, ADRs 0120–0122; its spike B600 is next) and `docs/PLAN-game-modes.md` (game modes, B547–B564, ADRs 0113–0117). Read a plan's "Notes from implementation" before any of its briefs, and `docs/HANDOFF.md` "Rules for every brief". Earlier batches are closed, with their plans deleted and their facts, limits and findings in the ADRs: live world generation at B591 (ADR 0119), vanilla parity 3 at B523 and B544 (ADRs 0103–0112), the Showcase at B572 (ADR 0118), the art batch at B502 (ADR 0092), Try it at B403 (ADRs 0085–0087) and vanilla parity 2 at B485 (ADRs 0094–0101); their follow-ups are in `docs/ROADMAP.md`.
5. Before touching an area, the scoped `CLAUDE.md` in that folder (`app/`, `packages/core/`, `packages/schemas/`, `packages/plugin-api/`, `packages/plugins/`, `packages/exporters/`, `packages/targets/`, `packages/interop/`, `packages/sim/`, `packages/terrain/`, `engine-mod/`, `docs/`). `docs/DESIGN.md` is authoritative; decisions are in `docs/adr/`.

## Rules you must keep

- **Commits** are authored as `Rakib <rakib1insta@gmail.com>` and carry no `Co-Authored-By`, `Claude-Session` or any other credit or tool line (the user's rule). Never run `git config`; pass the identity per command:
  `GIT_AUTHOR_NAME=Rakib GIT_AUTHOR_EMAIL=rakib1insta@gmail.com GIT_COMMITTER_NAME=Rakib GIT_COMMITTER_EMAIL=rakib1insta@gmail.com git commit -m "..."`.
  Never put a model or tool name in commits, code or docs.
- **Branches:** work on a branch, never commit to `main` directly. `main` is only fast-forwarded to a commit whose GitHub Actions run (`.github/workflows/ci.yml`: jobs `ci`, `engine-mod (26.3)`, `engine-mod (26.4)`, `windows-plugin`) is fully green: `git merge-base --is-ancestor origin/main <sha> && git push origin <sha>:refs/heads/main`.
- No pull requests and no releases unless the user asks. Never publish a release without the user's go.
- Never bundle Mojang assets, code or extracted game data; anything from the game comes from the user's own jar at runtime.
- Version facts only in `packages/targets`. British English, no emojis. Write "(verify at implementation)" instead of guessing a version or fact.
- **Vanilla parity:** anything that can be made in vanilla Minecraft Java must be possible through MSM; a gap is a bug for `docs/COVERAGE-AUDIT.md`.
- Every session appends a `docs/DEVLOG.md` entry at the end: `## YYYY-MM-DD — <agent> — <topic>` with What / Decisions / Next. When a decision changes, update DESIGN.md or ROADMAP.md and add or amend an ADR.

## How the work is run

The plan files hold numbered briefs (`Bnnn`), each naming the files it owns, its scope and exit criteria. Work through them in wave order (the plan's "Waves" table says which depend on which). With one agent, do them one at a time; with several, never let two work on the same file at once (use `git worktree add <dir> -b bnnn HEAD` per brief). For each brief:

1. Read the brief, the ADRs it names and the plan's "Notes from implementation" for the briefs before it (spike answers there change later briefs).
2. Do the work, run the brief's checks plus `pnpm lint`, `pnpm typecheck` and the tests of the packages you touched. Engine-mod changes: `cd engine-mod && JAVA_HOME=<JDK 25> ./gradlew build` (and with `-Pmc=26.4` for the second version); look for "All N required tests passed".
3. Commit with the identity above, add a DEVLOG entry, and append one line for the brief to the plan's "Notes from implementation" (what was merged, decisions taken, follow-ups).
4. When merging a branch whose only conflict is `docs/DEVLOG.md` (both sides appended an entry), keep both entries: `python3 tools/devlog-merge.py docs/DEVLOG.md` does that, then `git add docs/DEVLOG.md`.
5. Push the branch, wait for CI, read failing job logs, fix, and only then fast-forward `main`.

Tests that pass locally can still fail in CI (slower machines); a failure seen in CI is real until shown otherwise. Do not skip, quarantine or loosen a test to get green.

## Commands

- `pnpm i`, `pnpm lint` (Biome and `tools/check-deps`), `pnpm typecheck`, `pnpm test`, `pnpm build`.
- App: `pnpm --filter @msm/app test`, and end-to-end tests `cd app && xvfb-run -a npx playwright test e2e/<spec>.spec.ts` (after `pnpm build`).
- Engine mod: `cd engine-mod && ./gradlew build` (JDK 25), `./gradlew -p parity build`; client GameTests headless are in `docs/HANDOFF.md` "Environment notes". Never run `./gradlew --stop` when others share the machine.
- `node tools/check-size/index.ts` after `pnpm build` and `pnpm --filter @msm/app dist:dir` for app size budgets.

## Where things are written down

- Current state and next steps: `docs/HANDOFF.md` (rewritten at each handover).
- History: `docs/DEVLOG.md`. Plan and milestones: `docs/ROADMAP.md`. Gaps against vanilla: `docs/COVERAGE-AUDIT.md`.
- Spike evidence kept for later briefs: `docs/reference/spikes/` (see its README).
- User guide: `docs/guide/` (labels there must match the app). Changelog for users: `CHANGELOG.md` `[Unreleased]`.
