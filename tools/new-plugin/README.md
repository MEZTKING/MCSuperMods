# new-plugin

Scaffolds a built-in plugin package. It creates `packages/plugins/<name>/` as `@msm/plugin-<name>` with the layout from `packages/plugins/CLAUDE.md`: `src/index.ts` (`definePlugin({ id: 'msm.<name>', apiVersion: '^0.2.0', contributes: {} })`), `src/kinds/`, `src/lowering/`, `test/plugin.test.ts`, `package.json`, `tsconfig.json` and `vitest.config.ts`. It validates the name against `/^[a-z][a-z0-9-]*$/`, refuses to overwrite an existing folder, adds the package to the root `tsconfig.json` references (sorted by path) and prints the next steps.

```sh
node tools/new-plugin/index.ts <name> [--root <repo-root>]
```

`--root` defaults to this repository; tests pass a temporary directory. Afterwards run `pnpm install` so the new workspace package is linked and recorded in the lockfile.

The generated package depends on `@msm/plugin-api` and `@msm/schemas`, with `@msm/targets` as a devDependency for golden tests. Shipped `src/` may not import `@msm/targets`, `@msm/target-*` or `@msm/core` (Biome override in the root `biome.json`).
