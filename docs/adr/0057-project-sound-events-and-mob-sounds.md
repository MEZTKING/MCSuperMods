# ADR 0057: Project sound events and mob sounds

## Context

A project's own sounds (`assets/<ns>/sounds.json` plus audio files) are accepted by the app but rejected by the runtime (coverage audit S1, backlog B1). Facts read on 2026-11-13 with `javap` over the Loom-cached merged jars (26.3, and 26.4-snapshot-7 where stated), and from this repository (the full fact table lived in the working plan, deleted at close; see the DEVLOG entry of 2026-11-14):

- `SoundEvent` is a record `(Identifier location, Optional<Float> fixedRange)` with `createVariableRangeEvent(Identifier)`. Its `CODEC` is `RegistryCodecs.holder(Registries.SOUND_EVENT, DIRECT_CODEC)`: a string decodes as a reference into the `sound_event` registry, an object as an inline event. Once an id is registered, the bare string is valid wherever vanilla uses `SoundEvent.CODEC`. Same on 26.4.
- The runtime registers no sound events. Every lookup goes to `BuiltInRegistries.SOUND_EVENT`: `play_sound`, script `World.playSound`, and the effect, throwable, consumable and armour `equip_sound` fields. `ComponentPassthrough` decodes vanilla components with static `RegistryOps`, so a bare project key there is a load error today.
- `DefinitionScanner` walks only `msm/` of each mod container. `assets/<ns>/sounds.json` is in every content jar, and a content jar always declares `depends.msm_runtime`.
- In the app, project `sounds.json` keys count only as `weighed_sound_event` ids, so they are not offered for `sound_event` fields, and a bare key in a vanilla kind is the error `schema.unregistered-sound-event`. The Music disc starters use the inline `{ "sound_id" }` form.
- `Mob.getAmbientSound()`, `getAmbientSoundInterval()`, `LivingEntity.getHurtSound(DamageSource)`, `getDeathSound()` and `Entity.playStepSound(BlockPos, BlockState)` are overridable with the same signatures on 26.4. `MsmEntity` overrides none.

## Decision

- **D1 Registration.** At initialisation, before effects, `msm_runtime` registers one `SoundEvent.createVariableRangeEvent(<ns>:<key>)` for every event key of every `assets/<ns>/sounds.json` found in a mod container that has an `msm/` folder or declares a dependency on `msm_runtime` (hand-written mods opt in either way). Keys already registered and the namespace `minecraft` are skipped silently (overrides of vanilla sounds stay resource-pack only); an invalid id or unreadable file is a warning. Mods and keys are visited in sorted order so client and server register alike. `LoadReport` gains `sounds`, and the start-up log line names the count. Every existing lookup and the passthrough components then resolve project sounds. Like every registry entry (audit L1), a new sound key needs a game restart; the audio file and its `sounds.json` entry still reload with the resource pack.
- **D2 No new file format.** The runtime reads the resource pack's own `sounds.json`. There is no `msm/<ns>/sound/` kind and no manifest, so hand-written and exported jars behave the same.
- **D3 App: kind-aware sound ids.** In elements of `msm:*` kinds, project event keys count as `sound_event` ids: offered by completion and the Studios' sound pickers, and valid as plain strings anywhere in the element, including `msm:components` passthrough. In vanilla kinds nothing changes: keys stay `weighed_sound_event`, and a bare key stays the error `schema.unregistered-sound-event` asking for `{ "sound_id" }`.
- **D4 Bare strings in vanilla data stay an error in the app** (default, vetoable), although they are valid in a jar with the runtime. The same project also exports as vanilla packs, where the string breaks data pack loading, and the inline form works everywhere. Hand-written jars may use the bare form. The Music disc starters keep `{ "sound_id" }`.
- **D5 Java eject.** `ModSounds.java` registers the same ids first in the mod initialiser; the exporter passes them as `JavaProjectInput.soundEvents?: string[]` (plugin API 1.7.0, additive, "Since 1.7.0"), read from the `assets/<ns>/sounds.json` files it already copies. A silent project writes no `ModSounds`.
- **D6 Mob sounds.** The entity definition gains `sounds?: struct { ambient?, hurt?, death?, step?: #[id="sound_event"] string, ambient_interval_ticks?: int @ 20.. }` (default interval: vanilla's). `MsmEntity` overrides the four methods above; an unknown id is a warning and the vanilla default stays. Vanilla ids work too. The eject mirrors it. No Creator question in this batch (default, vetoable); the Mob Studio gets four pickers.
- **D7 Versions.** Shared code only; no seam is expected. A content jar already depends on the exporting app's runtime version, so there is no extra version floor. mcdoc doc comments on the five sound fields name the runtime version that ships this.

## Consequences

- Format 1 grows additively: one optional entity struct. The corpus (prefix `entity-sounds-`), the Codecs and the eject generator move together.
- Plugin API goes from 1.6.0 to 1.7.0, additive.
- A project that uses its own sounds in `msm:*` elements needs the runtime release that ships this; an older runtime logs unknown sounds as before.
- New sound keys need a game restart, as every registry entry does.
- The app keeps two views of sound ids (kind-aware); the vanilla-kind error is deliberate.

## Status

Accepted (2026-11-14). The decisions above stand as written.

### Implementation findings

- **Mod selection (SoundScanner).** `loader/SoundScanner` visits the mod containers sorted by id and takes a mod when it has an `msm/` folder or declares a dependency on `msm_runtime`; `msm_runtime` itself is excluded. Hand-written mods opt in by either route.
- **Registration order.** Keys are collected into a sorted `TreeSet` and registered first, before effects, blocks, items and entities, so client and server register alike. Keys already registered and the `minecraft` namespace are skipped silently; an invalid id or unreadable file is a warning. `LoadReport.sounds` counts them and the start-up log line names the count.
- **Mob sounds are resolved when played.** An unknown id keeps the vanilla sound and logs a warning at start-up. The step sound plays at volume 0.15, as vanilla steps do.
- **Export gate.** The exporter validates `msm/` outputs with the msm-aware registry view (project keys count as `sound_event` ids) and blocks vanilla files that use a bare project key, with the error `schema.unregistered-sound-event` asking for `{ "sound_id" }`.
- **Seam.** None: shared code on 26.3 and 26.4.
