# build-msm-mcdoc

Exports MSM's own mcdoc types (`packages/schemas/mcdoc/msm/*.mcdoc`, ADR 0025 D7) to the checked-in `packages/schemas/mcdoc/msm/symbols.json`, which `@msm/schemas` merges into every schema index.

It copies the `.mcdoc` files into a temporary project (folder `msm`, so type paths start with `::msm`), runs `@spyglassmc/mcdoc-cli export` over it with the same `env.dependencies` workaround as `tools/sync-mcdoc`, and checks what mcdoc-cli does not: every reference resolves inside the export and every path and dispatcher is under `::msm` / `msm:`. The export's `ref` is `msm-mcdoc:sha256:<hex>` over the source names and contents. Output has sorted keys and is formatted by the repository's Biome configuration.

```sh
node tools/build-msm-mcdoc/index.ts          # regenerate symbols.json
node tools/build-msm-mcdoc/index.ts --check  # fail when symbols.json is stale
```

`build-msm-mcdoc.test.ts` fails when the checked-in export and a fresh export disagree.
