# engine-mod/ — Fabric runtime mod

No code yet; this directory is planned for Phase 4. This file describes intent and conventions.

## Purpose

`msm_runtime`: the Fabric mod that reads `msm/` definitions from every loaded mod jar and turns them into blocks, items and entities with component-driven behaviour. Java package `dev.mcsupermods.runtime`.

## Contents (planned)

- `build.gradle.kts` — Gradle, Kotlin DSL.
- `src/main/java/dev/mcsupermods/runtime/`
  - `loader/` — scan `msm/` in all mod containers at init.
  - `registry/` — driver classes `MsmBlock`, `MsmItem`, `MsmEntity`.
  - `components/`, `events/` — behaviour model.
  - `scripting/` — Rhino (Tier 1 scripts).
  - `client/` — GeckoLib bridge (optional).
- `src/gametest/` — Fabric GameTest suites.

## Conventions

- Java 25; Mojang names only (no Yarn, no Parchment).
- Fabric Loom 26.1+ non-remapping variant (verify at implementation).
- Fabric API events over Mixins; every Mixin needs a justification comment.
- Definitions parsed via Codecs generated from, or aligned with, MSM mcdoc.
- Registries are touched only during init; reloadable data stays in data packs.
- Log with the mod-id prefix; no reflection on definitions.
- Every session: append an entry to `docs/DEVLOG.md` (`## YYYY-MM-DD — <agent> — <topic>`, then What / Decisions / Next).

## Do / Don't

- Do keep the runtime free of any app dependency; it must work with hand-written `msm/` files.
- Don't hardcode content.
- Don't add Kotlin.

## Commands (planned)

- `./gradlew build`
- `./gradlew runClient`
- `./gradlew runGametest`

## Read next

- [10. Engine Mod (Runtime)](../docs/DESIGN.md#10-engine-mod-runtime)
- [11. Behaviour Model](../docs/DESIGN.md#11-behaviour-model-components-and-events)
- [12. Scripting and Escape Hatches](../docs/DESIGN.md#12-scripting-and-escape-hatches)
- ROADMAP: Phase 4 onwards (`../docs/ROADMAP.md`)
