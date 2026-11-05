# ADR 0030: Plugin API 0.7.0: GeckoLib target facts

## Context

`Target.geckolib?: string` has been a placeholder since Phase 0 ("GeckoLib version. Required when a project uses animated entities"). Phase 5 needs more than a version: the content jar exporter writes a dependency range into `fabric.mod.json` and nests a jar by file name ([ADR 0026](0026-fabric-content-jar.md), [ADR 0029](0029-model-animation-pipeline.md) D4), the app downloads that jar from a URL and checks it against a hash, and CI does the same. All of these are version-specific facts, which live only in `packages/targets` (root `CLAUDE.md` golden rule; `tools/check-deps` forbids `26.<n>` literals elsewhere, and the GeckoLib file name carries the Minecraft version). Changing the field's type is a breaking change under semver, and 0.x minor bumps are breaking for caret ranges ([ADR 0027](0027-plugin-api-0.6.md) D4).

No other API change is needed in Phase 5: entity, geo model and animation kinds use the existing `ElementKind` (string `previewKind`), importers use the existing `Importer`, and host-side importers are an app concern.

## Decision

**D1. `GeckolibFacts`.** `Target.geckolib?: GeckolibFacts` with

```ts
interface GeckolibFacts {
  version: string;            // "5.5.7"
  modId: string;              // "geckolib", the fabric.mod.json id written into depends
  dependency: string;         // ">=5.5.7", the range written into depends
  fileName: string;           // "geckolib-fabric-<mc>-<version>.jar", the nested jar's name
  url: string;                // where the host downloads the jar
  sha512: string;             // lower-case hex, checked after download
  modrinthVersionId?: string; // "kSxHvs99", for the Modrinth Maven and the API
}
```

The field stays optional on the type (a target may lack a GeckoLib build); the exporter reports `export.no-geckolib-target` when a project with entities is exported for such a target. The 26.3 target sets the values verified on 2026-11-05 (the Phase 5 plan's facts table, removed at phase close; the target's `CHANGES.md` records the source).

**D2. Version.** `API_VERSION` `0.7.0`; every built-in plugin and `tools/new-plugin` declare `^0.7.0`; `CHANGELOG.md` notes that 0.6 plugins need only the range change unless they read `Target.geckolib`.

## Consequences

- GeckoLib's version, file name, URL and hash change in one place when GeckoLib or the target moves.
- Plugins declaring `^0.6.0` stop loading; there are no third-party plugins yet.
- Hosts that build exporter inputs are unaffected; only `createFabricContentJarExporter` gains the optional `loadGeckolibJar` factory option, which is exporters-internal.

## Status

Accepted (2026-11-05, Phase 5 close, B122). Implemented by B111: `GeckolibFacts` and `API_VERSION` `0.7.0` in `@msm/plugin-api`, every built-in plugin and `tools/new-plugin` on `^0.7.0`, the 26.3 target's GeckoLib 5.5.7 facts. The app's GeckoLib download (B118) and CI's headless check (B120) read the URL and SHA-512 from the target only, so no source outside `packages/targets` names GeckoLib's version, URL or hash, apart from `engine-mod/gradle.properties` (the runtime's build-time dependency). No further API change was needed in Phase 5.
