# Vendored packages

Third-party code kept in this repository unchanged, each under its own licence. Biome does not check this folder (`!**/vendor` in `biome.json`).

- `blockloom-core/`: `@blockloom/core` 1.1.0 (engine version 1.0.0), the texture engine of [Blockloom](https://github.com/MEZTKING/blockloom), copied unchanged from the tag `core-v1.1.0` (commit 31abd2538d0f0e3fb45969227f7e206e1cd635d2), MIT Licence, Copyright (c) 2026 Lelouch (`blockloom-core/LICENSE`). Used by `@msm/plugin-library` for block pictures (ADR 0135). To update, copy the `core/` folder of a newer `core-v*` tag over it, name the tag and commit here, and update the golden test (`packages/plugins/library/test/art-blockloom.test.ts`).
