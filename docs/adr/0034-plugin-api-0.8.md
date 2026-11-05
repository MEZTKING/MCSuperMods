# ADR 0034: Plugin API 0.8.0: Gradle fact, Java project generator and the `typescript` output language

## Context

Phase 6 needs three things from the public API. The `java-project` exporter ([ADR 0033](0033-java-project-eject-v1.md)) writes a Gradle wrapper properties file and a `build.gradle.kts` whose versions are target facts; `Target.fabric` has `loom`, `loader`, `api` and `minecraftDependency` but no Gradle version. The generated Java names one Minecraft version's classes, so the generator is a target fact too, and the exporter needs an interface to call it through. Script elements ([ADR 0032](0032-script-api-v1-and-typings.md)) lower to text files the gate checks with an injected validator, which the existing `OutputFile.language` field already allows; the value `typescript` is new. Under 0.x a minor bump is breaking for caret ranges ([ADR 0027](0027-plugin-api-0.6.md) D4).

## Decision

**D1. `FabricFacts.gradle: string`.** The Gradle version the ejected project's wrapper uses (26.3 target: `9.8.2`, the engine-mod wrapper). Required on the type from 0.8.0 (every target with `fabric` sets it).

**D2. `Target.javaProject?: JavaProjectGenerator`** with

```ts
interface JavaProjectGenerator {
  /** Generates the Java sources and resources of the ejected project; pure and deterministic. */
  generate(input: JavaProjectInput): GeneratedFile[];
}
interface JavaProjectInput {
  modId: string;                 // from fabric.mod.json
  javaPackage: string;           // derived by the exporter (ADR 0033 D2)
  modClassName: string;          // for example RubyMod
  blocks: DefinitionInput[];     // msm/<ns>/block/*.json, parsed JSON objects (format 1)
  items: DefinitionInput[];
  entities: DefinitionInput[];
  geckolib: boolean;             // entities present and Target.geckolib set
}
interface DefinitionInput { id: string; path: string; definition: JsonObject }
interface GeneratedFile { path: string; contents: string }   // relative to the project root, UTF-8 text
```

The generator may throw an `Error` whose message names the definition; the exporter reports it as `export.java-generation-failed` and writes nothing.

**D3. `OutputFile.language` value `typescript`.** Documented alongside `mcfunction` as a language the host may check and transform; files carry UTF-8 source bytes. No type change.

**D4. Version.** `API_VERSION` `0.8.0`; every built-in plugin and `tools/new-plugin` declare `^0.8.0`; `CHANGELOG.md` notes that 0.7 plugins need only the range change unless they build targets.

## Consequences

- The eject's version-specific code has a typed home in the target; the exporter stays version-free.
- Plugins declaring `^0.7.0` stop loading; there are no third-party plugins yet.
- `ExporterOption` stays boolean-only; the Java project export needs no option in v0.6.

## Status

Proposed (2026-11-05). Implemented by B132; accepted at Phase 6 close.
