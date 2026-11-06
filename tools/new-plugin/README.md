# new-plugin

Scaffolds a built-in plugin package, or (with `--external`) a standalone third-party plugin project.

## Built-in plugins

It creates `packages/plugins/<name>/` as `@msm/plugin-<name>` with the layout from `packages/plugins/CLAUDE.md`: `src/index.ts` (`definePlugin({ id: 'msm.<name>', apiVersion: '^1.0.0', contributes: {} })`), `src/kinds/`, `src/lowering/`, `test/plugin.test.ts`, `package.json`, `tsconfig.json` and `vitest.config.ts`. It validates the name against `/^[a-z][a-z0-9-]*$/`, refuses to overwrite an existing folder, adds the package to the root `tsconfig.json` references (sorted by path) and prints the next steps.

```sh
node tools/new-plugin/index.ts <name> [--root <repo-root>]
```

`--root` defaults to this repository; tests pass a temporary directory. Afterwards run `pnpm install` so the new workspace package is linked and recorded in the lockfile.

The generated package depends on `@msm/plugin-api` and `@msm/schemas`, with `@msm/targets` as a devDependency for golden tests. Shipped `src/` may not import `@msm/targets`, `@msm/target-*` or `@msm/core` (Biome override in the root `biome.json`).

## External plugins (`--external`)

```sh
node tools/new-plugin/index.ts <name> --external <dir>
```

Writes a standalone plugin project into `<dir>`, which must not exist (ADR 0035, ADR 0036). `<name>` follows the same pattern and must not be `minecraft` or `msm`; it becomes the plugin id and the namespace of every id the plugin contributes. `--external` and `--root` cannot be combined. Files:

| File | Contents |
|---|---|
| `package.json` | `msm-plugin-<name>`, `private: false`, `type: module`; scripts `build` (`node scripts/build.mjs`), `test` (`vitest run`), `check` (`tsc --noEmit`); devDependencies `@msm/plugin-api` (`^1.0.0`), `esbuild`, `@spyglassmc/mcdoc-cli` (pinned exactly), `typescript`, `vitest` at the versions of the repository catalog (a test compares them) |
| `pnpm-workspace.yaml` | `allowBuilds: esbuild: false`, so `pnpm add` does not stop on esbuild's install script (its platform package already holds the binary) |
| `tsconfig.json` | strict, `moduleResolution: bundler`, `lib: ["ES2022"]`, `types: []`: no DOM and no Node types, because the plugin runs in a sandboxed worker |
| `msm-plugin.json` | the manifest of ADR 0035 D2: id `<name>`, version `0.1.0`, `apiVersion` `^1.0.0`, `main` `main.js`, `schemas` `["symbols.json"]`, capabilities `elementKinds` and `elementTemplates`. `main` and `schemas` are relative to the installed folder, which is the contents of `dist/` |
| `src/index.ts` | `definePlugin` with one kind `<name>:example` (folder `<name>_example`, schema `::<name>::<name>::Example`, `{ text }` lowered to one key in `assets/<ns>/lang/en_us.json` with `merge: 'object'`) and one template `<name>-example` |
| `mcdoc/<name>.mcdoc` | the `Example` struct |
| `scripts/build.mjs` | esbuild (`bundle`, `format: 'iife'`, `target: 'es2022'`, `platform: 'neutral'`) to `dist/main.js`, whose last statement is `defineMsmPlugin(plugin)` for the worker bootstrap; mcdoc-cli `export` over `mcdoc/` (copied under a module folder named after the id up to its first dot, with the `spyglass.json` workaround of `tools/sync-mcdoc` and `tools/build-msm-mcdoc`) to `dist/symbols.json`, stamped with a `ref` of `<id>@<version>:sha256:<sources>` and refused if a type lies outside `::<namespace>`; `msm-plugin.json` copied to `dist/` |
| `test/plugin.test.ts` | loads the plugin, lowers one element against a hand-written `TargetFacts` stub and parses the output |
| `README.md`, `.gitignore` | set-up (the tarball), build, install into `~/.msm/plugins/<name>/` by copying `dist/`, restart, the Settings Plugins section |

Until `@msm/plugin-api` is on npm, point the dependency at the release tarball, which `pnpm --filter @msm/plugin-api pack:tarball` writes to `packages/plugin-api/dist/msm-plugin-api-<version>.tgz` and every release attaches:

```sh
cd <dir>
pnpm add -D ../msm-plugin-api-1.2.0.tgz
pnpm test && pnpm check && pnpm build
```

The build steps below the marker line in `scripts/build.mjs` equal those of `fixtures/sample-plugin/build.ts` (the sample plugin, made with this command), and a test keeps them so: change both together. The tests also check the generated manifest against the rules of the app's manifest schema, copied here as `validateManifest` because `tools/` cannot import the app.
