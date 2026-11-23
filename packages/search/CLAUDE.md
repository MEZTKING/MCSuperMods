# packages/search — the app's search engine

`@msm/search` is the engine of the one search (ADR 0124; plan `docs/PLAN-search.md`, spike evidence `docs/reference/spikes/b650/README.md`). It is language and ranking only: pure, deterministic, no Minecraft word in the code (the plugins own the words, D5, D13). It imports only `@msm/plugin-api` (layer line in `tools/check-deps/layers.json`) and runs in a Web Worker in the app, never on the UI thread by choice (D3).

## Status

Scaffold (B652): `src/types.ts` holds the frozen interfaces (`SearchEntry`, `SearchRequest`, `SearchAnswer`, `SearchHit`, `SearchHitSlim`, `SearchIndex`) and `createSearchIndex` throws "not built yet". The plugin data types (`PluginSearchData` and the rest) live in `@msm/plugin-api`; never redefine them here.

## Layout and owners

- `src/text/` (B653): normalising, tokens, British and American folding, `stem.ts` (dictionary-aware, an exception list), `typos.ts` (trigram candidates, edit limits by length), stop words, intent, numbers and units, phrases.
- `src/index/` and `src/rank/` (B658): layers, dictionary, postings, BM25F, signals, sections, folding, the confidence floor, the `why` list. `src/query.ts` joins them.
- `src/slots/` and `src/compose/` (B659): answers from typed words by question type, the clash rules, the name, behaviours (one clause, one rule or one companion flow). `src/understood.ts`.
- Each later brief fills only its own folder; `src/index.ts` is edited by the brief that adds an export.

## Rules

- Answers only from typed words (D7); a number out of range is dropped and struck through, not clamped.
- A request never throws on any string; ties are broken deterministically.
- Actions and previews are descriptors, never functions: they cross the worker boundary. Across it a hit is `SearchHitSlim`.
- No new dependency without the orchestrator's word. Tests: `pnpm --filter @msm/search test` (`--maxWorkers=2` when other jobs run).
