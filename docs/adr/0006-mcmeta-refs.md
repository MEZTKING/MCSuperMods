# ADR 0006: misode/mcmeta refs and vendored summary data

## Context

`misode/mcmeta` publishes per-version registries, block states and summaries used for autocomplete and reference validation ([Registries and autocomplete](../DESIGN.md#6-schema-system-mcdoc)). DESIGN [Open Question 7](../DESIGN.md#18-open-questions) asked which refs to pin. On 2026-11-04 the repository publishes tags per game version and per content flavour, for example `26.3-summary` and `26.3-registries`.

## Decision

- Each target declares `mcmetaRef`, the version prefix (for the 26.3 target, `26.3`). Consumers resolve the tags `<mcmetaRef>-summary` and `<mcmetaRef>-registries`.
- `tools/sync-mcmeta` fetches `version.json` and `registries/data.min.json` from the `<mcmetaRef>-summary` tag and vendors them as `version.json` and `registries.json`, with `SOURCE.json`, under `packages/targets/mc-<version>/vendor/mcmeta/`. The vendored files are never edited by hand; re-running the script changes only the `fetchedAt` field in `SOURCE.json`.
- Registry ids are stored as upstream ships them, without a namespace; consumers add `minecraft:`.
- Schema dispatcher keys in the vanilla-mcdoc export are unprefixed as well; `SchemaIndex.dispatch()` accepts both prefixed and unprefixed keys.
- The `~/.msm/cache/` runtime cache from [Caching](../DESIGN.md#6-schema-system-mcdoc) arrives in Phase 2 with autocomplete.

## Consequences

- Registry data for a target is reproducible and works offline from the first commit.
- Every consumer must handle the missing namespace consistently; the target tests assert the stored form.
- If mcmeta changes its tag scheme, only the target's `mcmetaRef` handling and the sync script change.

## Status

Accepted (2026-11-04). Resolves DESIGN Open Question 7.
