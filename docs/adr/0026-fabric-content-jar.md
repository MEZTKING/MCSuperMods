# ADR 0026: Fabric content jar, runtime distribution and Test in Minecraft

## Context

DESIGN §9 and §10 describe a content jar holding `assets/`, `data/`, `msm/` and `fabric.mod.json`, depending on `msm_runtime`, with the runtime nested by default and a "separate runtime" option. The exporter is pure TypeScript and consumes `OutputFile[]`; the runtime jar is a Gradle build output of `engine-mod/`. The ROADMAP also asks for a managed Fabric test instance launched from the app. ADR 0019 already reads Prism Launcher, MultiMC, CurseForge and official-launcher locations, including `modsDir` and the loader kind.

## Decision

**D1. Jar layout.** The `fabric-content-jar` exporter (in `@msm/exporters`, `src/fabric-content-jar/`) writes a deterministic zip (the same writer and fixed timestamps as the packs, ADR 0013) with: resource-pack-layer files under their `assets/` paths, data-pack-layer files under `data/`, `msm`-layer files at their paths (`msm/...`, `fabric.mod.json`), `msm.export.json`, and, when nesting, `META-INF/jars/msm_runtime-<version>.jar`. No `pack.mcmeta` is needed: Fabric API's resource loader serves mod resources (verify at implementation). Fabric API is a dependency the player installs, never nested (it is large and shared by most mods).

**D2. fabric.mod.json.** A mod id must not be a reserved id (`minecraft`, `java`, `fabricloader`, `fabric-api`, `msm_runtime`); the `msm:mod` validator reports it and the synthesised id gains a `mod_` prefix (code `blocks-items.reserved-mod-id`; implemented in B99a). `schemaVersion` 1; `id`, `version`, `name`, `description`, `authors`, `license` from the `msm:mod` element ([ADR 0025](0025-msm-definition-format-v1.md)); `environment` `*`; no entrypoints; `depends` `{ "fabricloader": ">=<target.fabric.loader>", "minecraft": <target.fabric.minecraftDependency>, "fabric-api": "*", "msm_runtime": ">=<runtime version>" }`; `jars` `[{ "file": "META-INF/jars/msm_runtime-<version>.jar" }]` only when nesting. The Fabric facts come from the target (`Target.fabric`); the exporter reports `export.no-fabric-target` and writes nothing when the target lacks them.

**D3. Options.** The exporter declares a boolean option `separateRuntime` (default `false`), shown as the "Separate runtime (for modpacks)" checkbox, through the exporter options of [ADR 0027](0027-plugin-api-0.6.md). When nesting is asked for and the host has no runtime jar, the export stops with `export.runtime-missing`.

**D4. Runtime jar and version.** `msm_runtime` carries the app's version (`app/package.json`; `engine-mod/gradle.properties` `mod_version` must equal it, checked by `app/test/runtime-version.test.ts`). The jar is built by `engine-mod/` Gradle and shipped with the app as an `extraResources` file `runtime/msm_runtime.jar`; in development the app reads `engine-mod/build/libs/`. The exporter receives the bytes from its factory (`createFabricContentJarExporter({ loadRuntimeJar })`), so `@msm/exporters` stays free of file access. CI and the release workflow build the runtime with JDK 25 before packaging the app.

**D5. Test in Minecraft.** A command "Test in Minecraft" exports the content jar and installs it into a Fabric game location, then starts the launcher:

- the location is the one chosen in Settings, which must be a Prism Launcher or MultiMC instance with the Fabric loader for the project's target (Minecraft equal to the target's, Fabric Loader at least the target's; otherwise blocked with a reason, since the jar's `depends` would fail), or a managed instance the app creates on request: a Prism instance `MCSuperMods Test (<mc version>)` (`instance.cfg` with `InstanceType=OneSix`, `minecraft/mods/`, a `.msm-managed.json` marker; a same-named folder without the marker is never touched) whose `mmc-pack.json` (`formatVersion` 1, `components` entries with `uid` and `version`) names only `net.minecraft` and `net.fabricmc.fabric-loader` at the target's versions. Prism's metadata for Fabric Loader 0.20.1 still requires `net.fabricmc.intermediary` (26.3 is listed), but Prism adds missing requirements itself, so MSM does not write it (verified against Prism's source and metadata, B100);
- the app copies the content jar into `mods/` as `<mod_id>.jar`, first removing only a copy it installed itself, as recorded in `mods/.msm-installed.json` (files it did not install are never touched), and downloads Fabric API for the target from maven.fabricmc.net into `mods/` when it is missing; downloads are cached in the app's user-data folder and checked against the published SHA-512 (the Fabric Maven publishes `.sha1`, `.sha256` and `.sha512`; SHA-512 is used);
- it launches Prism or MultiMC with `--launch <instance id>` (`-l`), adding `--dir <data folder>` (`-d`) unless the root is a default Prism data folder, since a Flatpak build may not see host paths (both flags verified against Prism's source, also in MultiMC). The Windows program is found at the installer path `%LOCALAPPDATA%\Programs\PrismLauncher\prismlauncher.exe`, or chosen by the user and stored in the main-process setting `launcherPrograms`. Official-launcher and CurseForge Fabric locations get install only, with a note to start the game from their launcher.

Still unverified on a real machine: the Scoop and macOS/Linux (Flatpak wrapper) program paths, and whether a running Prism picks up a just-created instance without a restart (verify at implementation).

All file and process work is in `@msm/interop` (`fabric/`: mods-folder install, instance creation, download cache) and `app/main`; the renderer only calls IPC.

**D6. Headless check.** `tools/run-fabric-server` downloads the Fabric server launcher for the target (meta.fabricmc.net), Fabric API and uses the freshly built runtime jar, runs a dedicated server headless with a content jar in `mods/`, and passes when the log reports the expected registrations and no `[msm_runtime]` errors. CI runs it on the kitchen-sink sample (`fixtures/sample-mod/`).

## Consequences

- Players install one jar plus Fabric API; modpack makers can ship one shared runtime.
- Releases need JDK 25 on the Windows runner; the app installer grows by the runtime jar (small: no dependencies are shaded).
- Test in Minecraft depends on a supported launcher; the official launcher is install-only.

## Status

Accepted (2026-11-05). Implemented in Phase 4 (B95 exporter, B96 app wiring, B99 headless check, B100 Test in Minecraft); the in-game checks with a real launcher on Windows are pending (`fixtures/sample-mod/README.md`).
