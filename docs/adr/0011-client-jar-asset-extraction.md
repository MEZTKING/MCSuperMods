# ADR 0011: Client-jar asset extraction in the main process, cached under `~/.msm/cache/assets/<version>/`

## Context

Previews need vanilla models, blockstates, item definitions, textures and lang strings. MSM must never bundle Mojang assets ([risk 5](../DESIGN.md#17-risks-and-mitigations)), so they are read from the user's installed client jar ([Minecraft installation](../DESIGN.md#13-interop-blockbench-nbt-minecraft-installation)). The client jar is 25 MB or more, the renderer is sandboxed ([ADR 0007](0007-renderer-hosted-core-and-platform-adapter.md)), and CI has no Minecraft installation.

## Decision

- `@msm/interop` `minecraft-install/` is pure TypeScript over an injected `InstallFileSystem`. It locates `.minecraft` (default per OS, user override), lists installed versions and extracts preview assets.
- Extraction uses fflate 0.8.3 `unzipSync` with a `filter`, so only `assets/minecraft/{models,blockstates,items,textures/block,textures/item}/**` and `assets/minecraft/lang/en_us.json` are inflated.
- `@msm/interop/node` provides the Node adapter for `InstallFileSystem`.
- The Electron main process runs extraction, writes the cache to `~/.msm/cache/assets/<version>/` and serves cached files to the renderer over versioned IPC. The renderer never reads the jar.
- Problem codes for discovery and extraction use the `assets.*` prefix.
- Tests use a synthetic jar built at test time with fflate: made-up model, blockstate, texture and lang entries plus `.class` noise. No Mojang bytes exist in the repository.
- Nothing from the cache is ever written to an export, and the cache is never packaged with the app.

## Consequences

- The renderer stays sandboxed and the main process does the heavy I/O once per version; later loads read the cache.
- The cache can be deleted at any time and is rebuilt on demand.
- `@msm/interop` is testable headless on Linux CI without a game installation.
- The exact layout of `versions/<v>/<v>.jar` in future releases is assumed stable (verify at implementation for each new target).
- DESIGN [Caching](../DESIGN.md#6-schema-system-mcdoc) and [Minecraft installation](../DESIGN.md#13-interop-blockbench-nbt-minecraft-installation) name the `assets/` cache path.

## Status

Accepted (2026-11-04).
