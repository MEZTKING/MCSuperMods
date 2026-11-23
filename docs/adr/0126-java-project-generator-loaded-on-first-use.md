# ADR 0126: The Java project generator loaded on first use (plugin API 1.24.0)

## Context

The app's renderer output was 18.47 MB of its 19 MB budget at ef67c03, with the stop line for app briefs at 18.5 MB ([ADR 0123](0123-gzipped-vendored-target-data.md) D4). Live views 3, search and the game modes plan still have app briefs to come. ADR 0123 D4 named the one large saving left: the 26.3 target's Java project generator (`packages/targets/mc-26.3/src/java-project/`, about 1.14 MB before minification and 976,443 bytes after, mostly Java template strings) sits in the renderer's first-paint bundle. The renderer reaches the target objects through `@msm/targets` at start-up, and `mc-26.3/src/target.ts` imported the generator statically for `Target.javaProject` ([ADR 0034](0034-plugin-api-0.8.md) D2), whose `generate` the plugin API declares synchronous.

Who calls the generator (checked at ef67c03):

- The `java-project` exporter (`packages/exporters/src/java-project/index.ts`), already inside the asynchronous `Exporter.run`. The app's session (`project-session.ts`, the Export Java project dialog and e2e `eject-path`), the exporters' golden tests and `fixtures/sample-mod`'s eject all go through it.
- The 26.3 target's own tests, directly.
- Nothing else. `tools/check-project` and `tools/community-repo` never eject. Third-party exporters run in the sandbox and receive `toTargetFacts(target)`, which has no hooks (functions cannot cross the sandbox), so no plugin can reach the generator. `TargetFacts` never had it.

Two ways out were on record: an asynchronous generator in the plugin API, or the eject running in main over IPC.

## Decision

### D1 `Target.loadJavaProject?(): Promise<JavaProjectGenerator>` (plugin API 1.24.0)

`Target` gains an optional hook that loads the target's generator when an eject needs it. It is purely additive: `JavaProjectGenerator.generate` keeps its synchronous signature, `Target.javaProject` stays (not deprecated), `TargetFacts` has neither hook, and built-in plugins keep declaring `^1.0.0`. `API_VERSION` and the package version become 1.24.0 (1.22.0 and 1.23.0 are taken by ADRs 0113 and 0124). `@msm/plugin-api` keeps no internal dependency.

A host that ejects uses `javaProject` when a target has it and calls `loadJavaProject` otherwise; a target that sets both resolves to the same generator. The `java-project` exporter does exactly that before it reads any definition. A rejected promise (a chunk that does not load) is reported as `export.java-generation-failed`, naming the target and the reason, and nothing is written; a target with neither hook still reports `export.no-java-project-target`.

Widening `generate` to return `MaybePromise<GeneratedFile[]>` was the other shape within option A. It would have meant fewer test edits, but it narrows what a caller of a 1.x member may rely on, which the semver policy of [ADR 0036](0036-plugin-api-1.0-and-compatibility-policy.md) keeps for a major release. A new optional member does not.

### D2 The 26.3 target sets only `loadJavaProject`, through a dynamic `import()`

`packages/targets/mc-26.3/src/target.ts` drops the static import and sets

```ts
loadJavaProject: () => import('./java-project/index').then((module) => module.javaProjectGenerator),
```

so Vite (Rolldown) puts the generator and its templates in a chunk of their own that the renderer fetches on the first eject. Nothing else may import `./java-project/` statically, or the chunk folds back into the start-up bundle; the target's test checks that `javaProject` is absent and the loader resolves to the generator. `mc-26.4` has neither hook, as before ([ADR 0037](0037-second-target-mc-26.4-and-target-upgrade.md) D2). `targetFacts` in `@msm/targets` and the app's `toTargetFacts` strip `loadJavaProject` with the other hooks, so the facts still survive `structuredClone`. The main process bundles the same dynamic import; Node tools resolve it through the workspace module hooks as they do the static imports.

### D3 Option B is not taken

Running the eject in main over IPC would also move the generator out of the renderer's total, but it moves the exporter, the expanded project and every Gradle and asset file across IPC, and changes where an export runs for one exporter only. D1 keeps the generator out of the first-paint bundle with no IPC, so B is not needed for that.

### D4 `tools/check-size` is unchanged (amended 2026-11-23: it budgets the first paint separately)

`tools/check-size` sums every renderer file ([ADR 0091](0091-vehicle-flows-studios-try-it-and-tests.md) D5), so a lazy chunk counts the same as a first-paint one: the budgeted renderer number does not move with this ADR (see the measurements). No budget is loosened. Whether the check should also report, or budget, the first-paint set separately (the entry chunk, its `modulepreload` links and the CSS that `index.html` names) is left to the orchestrator; the measurement method used here is in the findings.

## Consequences

- The renderer's first-paint bundle loses the generator (measured below); an eject loads it once per session, a one-off fetch from the asar.
- The renderer's total, the number `tools/check-size` budgets, is unchanged within a few hundred bytes, so this ADR does not by itself give app briefs more room under the 18.5 MB stop line. It makes a first-paint budget possible without another architecture change.
- The eject writes byte-identical projects: the exporters' eject goldens, `fixtures/sample-mod`'s eject and e2e `eject-path` are unchanged.
- Code or tests that looked for a generator with `target.javaProject !== undefined` read `target.loadJavaProject` too (the exporters' tests, the 26.3 target's tests); tests that strip a target's hooks before handing its facts to templates strip `loadJavaProject` as well.
- ADR 0123 D4's follow-up is done by this ADR.

## Alternatives considered

- **`generate` returning `MaybePromise<GeneratedFile[]>`** (D1): a narrowing of a 1.x member for callers.
- **A lazy object in `javaProject`** (an object whose `generate` throws until loaded): a synchronous call that can fail for a reason unrelated to the input.
- **The eject in main** (D3).
- **Moving the template strings to vendored files read over IPC**: moves bytes into the asar and splits one generator across two processes.

## Status

Accepted (2026-11-23) as the recommended option of the orchestrator's brief, a vetoable default (the user's standing "take the recommended option").

## Findings from implementation

- 2026-11-23 (branch `lazy-eject` from ef67c03; Linux `pnpm build` from an empty `app/out`, then `dist:dir` and `check-size`):

| | Before | After | Change |
|---|---:|---:|---:|
| Renderer output (`app/out/renderer`, what `check-size` budgets) | 19,370,570 B (18.47 MB) | 19,371,628 B (18.47 MB) | +1,058 B |
| Renderer first paint (`index.html`, its entry script, the chunks it names with `modulepreload` and its CSS) | 5,721,711 B (5.46 MB) | 4,746,064 B (4.53 MB) | -975,647 B |
| The generator's renderer chunk | inside the first-paint `src-*.js` chunk with the target objects (1,125,919 B) | `assets/java-project-*.js`, 976,443 B, loaded on the first eject | |
| Main `index.js` (not minified) | 2.5 MB | 1.3 MB, the generator in `java-project-*.js` (1,228,398 B) | |
| `app.asar` | 27.2 MB | 27.2 MB (28,494,248 B) | none within the rounding |

  (1 MB = 1024 × 1024 bytes.) First paint was measured with a one-off script that sums `index.html` and every file its `src` and `href` attributes name; the generator was found by searching the chunks for `final class TickLimiter`, one of its Java templates.
- `check-size` counts the lazy chunk in the renderer total like any other file, so the budgeted number is the same before and after (the 1 kB is the dynamic import's loader code). The plans that counted on this ADR for about 1 MB of room under the 18.5 MB stop line (`docs/PLAN-search.md`, `docs/PLAN-ai-helper-2.md`) get no room from it as the check stands; a first-paint report or budget in `tools/check-size` is the orchestrator's decision (D4).
- Checks: `pnpm lint`, `pnpm typecheck`, the tests of `@msm/plugin-api`, `@msm/core`, `@msm/targets`, both targets, `@msm/exporters` (the eject goldens unchanged, one new test for the loader), the ten touched plugins and the app (`--maxWorkers=2`), e2e `eject-path` (three cases) on the built app.

**Amendment (2026-11-23, the orchestrator's recommended option; a vetoable default).** `tools/check-size` now also reports and budgets the renderer's **first-paint set** (`index.html` plus every file its `src` and `href` attributes name: the entry script, its `modulepreload` chunks and CSS; lazy chunks named only by dynamic imports are left out) at **6 MB**, with a stop line of **5.5 MB** for app briefs. The renderer **total** budget becomes **21 MB**, stop line **20.5 MB**, because lazy chunks cost disk only, which the `app.asar` budget (32 MB, stop line 31 MB, unchanged) covers, and only first paint affects start-up. Measured after the change: first paint 4,750,839 B (4.53 MB, 48 files); renderer total 19,375,524 B (18.48 MB); `app.asar` 28,496,544 B (27.2 MB). The plans that counted on ADR 0126 for room (`docs/PLAN-search.md`, `docs/PLAN-ai-helper-2.md`) now have 2.0 MB under the 20.5 MB stop line. Tested in `tools/check-size/check-size.test.ts` over a made-up `out/renderer` tree.
