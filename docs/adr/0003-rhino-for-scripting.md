# ADR 0003: Mozilla Rhino (ES6 mode) for Tier-1 scripts

## Context

Tier-1 scripts let users write TypeScript that runs in game ([Scripting and Escape Hatches](../DESIGN.md#12-scripting-and-escape-hatches)). The app transpiles them with esbuild; the runtime mod needs an embedded JavaScript engine. Candidates are Mozilla Rhino (pure Java, small, easy to nest in a mod jar) and GraalJS (fuller ECMAScript support, much larger, more involved to embed in a Fabric mod).

## Decision

We embed Mozilla Rhino in ES6 language mode in `msm_runtime` and have esbuild down-level scripts to a target Rhino can run. GraalJS is the fallback if Rhino's coverage proves insufficient.

## Consequences

- The runtime jar stays small and has no native components.
- esbuild output must stay within what Rhino's ES6 mode supports; the transpile target and any required syntax restrictions are fixed in Phase 6 (verify at implementation).
- Revisit trigger: DESIGN [Open Question 2](../DESIGN.md#18-open-questions). If realistic scripts need features Rhino cannot run, we switch to GraalJS with a superseding ADR.

## Status

Accepted (2026-11-03, recorded 2026-11-04). Revisit under Open Question 2 in Phase 6.
