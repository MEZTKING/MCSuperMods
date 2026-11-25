# check-project

Checks that MSM project folders open, validate and export with no errors, the way the app does it. The [MCSuperMods community repository](https://github.com/MEZTKING/MCSuperMods-Community) runs it on every example and every shared mod.

```sh
node tools/check-project/index.ts <project folder>... [--target <target id>|all] [--json] [--upgrade-report]
```

- `--target` picks the targets (`mc-26.3`, `mc-26.4`, a comma-separated list, or `all`, the default); it may be given more than once.
- `--json` prints one JSON report (`passed`, `failed`, and each project's result) instead of the plain-words report.
- `--upgrade-report` checks nothing else: it prints the report the app's **See what changes** dialog would show (ADR 0136 D4) for each project and each target newer than the project's own (`--target` narrows them). It runs the app's own dry run (`ProjectSession.upgradeReport`) over an in-memory copy and applies nothing. The plain-words form uses the app's `components/upgrade/sentences.ts` (pure, no React), so the words are the app's; `--json` adds the full `UpgradeReport` of each move (`report`), its plain lines (`plain`) and `needsYou`, the number of things the user must change. The exit code is 0 when no project needs anything from the user on any newer target, 1 when one does or a project could not be read, 2 for bad arguments.
- The exit code is 0 when every project passed on every target, 1 when one failed, and 2 for bad arguments.

## What it does

For each folder and each target:

1. Reads the folder and applies the file rules below.
2. Opens a copy of the project in memory with the app's own `ProjectSession` (`app/src/renderer/src/session/project-session.ts`), the built-in plugins and the built-in targets; nothing is written back. The app's mcfunction broker and scripting service (`app/src/main/platform/`) check functions and scripts, as in the app.
3. When the target is not the project's own (the first one its `msm.project.json` lists), upgrades it exactly as **Upgrade project target** does: `upgradeTargetPreview` and then `upgradeTarget`. The examples are projects of the default target, so on the other target they are checked after an upgrade.
4. Runs every validator (`flushValidation`): schema, references, the plugins' project validators, functions and scripts.
5. Exports the resource pack and the data pack as the app's zip export does, and builds the Fabric mod jar with the runtime and GeckoLib left beside it (`separateRuntime`; the checker has neither jar).
6. Says plainly which exports the content needs: the layers its lowered files belong to (resource pack files or any asset: the resource pack; data pack files: the data pack; `msm` files: the Fabric mod jar). Every export runs anyway, and an error in any of them fails the check.

Error problems fail the project; warnings are printed and do not. When a target's warnings are the same as the target before it, they are printed once.

## The file rules

There is no Mojang-asset rule in the exporters to reuse (they only ever write what the project holds), so the checker has its own, kept deliberately simple and conservative. A folder fails when:

- it has no `msm.project.json` at the top;
- a file at the top is neither part of the project (`msm.project.json`, `content/`, `assets/`) nor one of the sharing files `README.md`, `LICENSE`, `LICENSE.md`, `LICENSE.txt` and `picture.png`;
- `content/` holds anything but `.json` element files, or `assets/<namespace>/` anything MSM does not read (`.png`, `.ogg`, `.json`, `.mcmeta`, `.nbt`, `.bbmodel`);
- **any file is under `assets/minecraft/`**: MSM projects keep their pictures and sounds in their own namespace and point the vanilla model, particle or sound at them (as the Blue flame example does), so a file under Minecraft's own name is most likely copied from the game;
- **an export would ship a picture or sound under `assets/minecraft/textures/` or `assets/minecraft/sounds/`** (for example from an element that embeds a picture under a vanilla id);
- **a picture or sound under `assets/` is mentioned nowhere**: its file name without the ending appears in no element file and no text file the exports wrote. A file nothing uses is not part of the project's content and may be a file copied from the game. This rule runs only when every export finished;
- a `.png` is not a PNG or an `.ogg` is not an Ogg file;
- a file is over 2 MiB (a sound over 8 MiB, enough for a music disc song of a few minutes), or the whole folder is over 25 MiB.

Hidden files and folders (names starting with `.`, such as the app's `.msm/`) are skipped as the app's loader skips them, but count towards the size caps.

## Running it under Node

The workspace packages import each other's files without endings, which bundlers allow and Node does not, and the app's script engine imports TypeScript's lib files with Vite's `?raw`. `index.ts` therefore first imports `tools/shared/workspace-hooks.ts`, which registers module hooks (`module.registerHooks`) for both, and then loads the checker with `import()`. Run `pnpm install` first.

## Files

| File | What it holds |
|---|---|
| `index.ts` | The entry: registers the hooks and runs `cli.ts`. |
| `cli.ts` | Arguments, the plain-words report and the exit code. |
| `upgrade-report.ts` | `--upgrade-report`: the dry run per newer target and its plain-words form. |
| `check.ts` | `checkProject`: the session, the upgrade, validation, the three exports and the asset use rule. |
| `files.ts` | The file rules and the size caps. |
| `platform.ts` | The headless platform adapter the session runs on. |
| `check-project.test.ts` | Tests (`pnpm --filter @msm/tools test`). |
