# sync-mcdoc

Vendors the [SpyglassMC/vanilla-mcdoc](https://github.com/SpyglassMC/vanilla-mcdoc) symbol export for one target. In the default build mode it shallow-fetches vanilla-mcdoc at the pinned commit sha into a temporary directory and runs `@spyglassmc/mcdoc-cli export --ref` over it (the same command that produces the upstream `generated` branch); `--from-generated` instead downloads `symbols.json` from that branch and refuses it unless its `ref` equals `--ref`. It validates the export's shape and writes `symbols.json` (sorted keys, 2-space indent), the upstream `LICENSE` and a `SOURCE.json` provenance record into `--out`, each atomically. Re-running with the same ref changes only `SOURCE.json` `fetchedAt`. Build mode appends the checkout root to the temporary checkout's `spyglass.json` `env.dependencies`, because mcdoc-cli 0.1.63 otherwise lists no source files; see the comment in `index.ts`.

```sh
node tools/sync-mcdoc/index.ts --ref <40-char sha> --out packages/targets/mc-<version>/vendor/vanilla-mcdoc [--from-generated]
```

Never edit vendored files by hand: change the pin in the target package and re-run this script.
