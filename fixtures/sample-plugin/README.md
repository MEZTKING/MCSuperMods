# Sample plugin: Greetings

`@msm/sample-plugin` is the sample external MCSuperMods plugin (plugin id `sample.greetings`). It is built exactly as a third-party plugin is: its source imports nothing but `@msm/plugin-api`, esbuild bundles it into one classic script, and the app runs that script in a sandboxed worker ([ADR 0035](../../docs/adr/0035-plugin-sandbox-and-capability-manifest.md)). The end-to-end test `plugins-path` installs it, and the plugins guide walks through it.

## What it shows

| Contribution | Id | What it does |
|---|---|---|
| Element kind | `sample:greeting` (folder `greeting`, schema `::sample::greeting::Greeting`) | Data `{ message: string, colour?: string }`. Lowers to `data/<ns>/function/greet_<path>.mcfunction` holding `tellraw @a {"text": "<message>", "color": "<colour>"}` (no `color` when the colour is empty) and to an entry in the `minecraft:load` function tag (`data/minecraft/tags/function/load.json`, declared `merge: 'tag'` so several greetings share the file). Folder names come from the target. |
| Template | `sample-greeting` | "Greeting" in the "Greetings" group of Add element: a gold "Hello from <name>!". |
| Example | `sample-greeting-example` | "Welcome greeting" in the Examples gallery: `<ns>:welcome` in aqua. |
| Validator | `sample.empty-message` | A warning on `/message` for a greeting whose message is empty or only spaces. |

The kind has no custom editor (external plugins cannot add editors in 1.0): the app draws the schema-driven form from `dist/symbols.json`, which the build exports from `mcdoc/greeting.mcdoc`.

## Files

- `msm-plugin.json`: the manifest (ADR 0035 D2). `main` and `schemas` are relative to the installed folder, which is the contents of `dist/`; `capabilities` names the four contribution points the plugin uses.
- `src/index.ts`: the plugin (`definePlugin`).
- `mcdoc/greeting.mcdoc`: the data type of the kind. The module folder is the plugin's namespace (`sample`, the id up to the first dot) and the file name is the next path segment.
- `build.ts`: the build, the same steps as the scaffold's `scripts/build.mjs` (a test in `tools/new-plugin` keeps them identical).
- `test/plugin.test.ts`: lowers a greeting against a hand-written `TargetFacts` stub and checks the function text, the tag file, the template, the example, the validator and the manifest.

## Build and test

```sh
pnpm --filter @msm/sample-plugin build   # writes dist/main.js, dist/symbols.json, dist/msm-plugin.json
pnpm --filter @msm/sample-plugin test
```

`dist/main.js` is an IIFE with `@msm/plugin-api` inlined: no `import` or `require`, and no Node, DOM or network APIs. Its last statement hands the plugin to the worker bootstrap with `defineMsmPlugin(plugin)`.

## Install it

1. Build it (above).
2. Copy the contents of `dist/` into `~/.msm/plugins/greetings/` (or `$MSM_HOME/plugins/greetings/` when `MSM_HOME` is set), so that the folder holds `msm-plugin.json`, `main.js` and `symbols.json`.
3. Restart MCSuperMods. Settings, Plugins lists "Greetings" with its state; Add element offers "Greeting" under "Greetings".

Plugins are code from third parties: install only plugins you trust.

## How it was made

The project started as `node tools/new-plugin/index.ts greetings --external <dir>` (see [`tools/new-plugin`](../../tools/new-plugin/README.md)), then:

- the files were moved into the workspace: `package.json` became `@msm/sample-plugin` with `@msm/plugin-api` as `workspace:*` and the build at `build.ts` (type-checked with the repository's `tsc -b`), and `tsconfig.json` extends the repository's base configuration;
- the plugin id became `sample.greetings`, so the namespace is `sample` and the kind `sample:greeting`;
- the example kind was replaced by the greeting kind, and the example and validator were added (with `examples` and `validators` in the manifest's `capabilities`).
