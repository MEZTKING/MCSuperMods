# ADR 0099: Custom fluids

## Context

The research report ranks fluids eleventh ("a project fluid with a bucket, flowing rules and a texture": fuel and oil for vehicles, magic water, honey-like liquids); the coverage audit rates them L ("runtime + client rendering, probably a mixin"). Vanilla has them (water, lava), so the user's rule of 2026-11-14 applies.

Facts (plan F27–F30): the fluid API differs between the two targets more than anything the runtime has met.

- **26.3:** `Fluid()` has a no-argument protected constructor; `getBucket()` returns an `Item`; `FlowingFluid` has the `FALLING` and `LEVEL` properties and abstract `getFlowing()` and `getSource()`; a liquid is two registered fluids (the registry lists `water`, `flowing_water`, `lava`, `flowing_lava`, `empty`).
- **26.4-snapshot-7:** `Fluid(Fluid.Properties)` with `Properties.of()`, `bucketItem(ResourceKey<Item>)`, `soundEvent`, `dripParticle`, `explosionResistance`, `randomTicking`, `drag`, `fogType`, `fallDistanceMultiplier`; `getBucket()` returns a `ResourceKey<Item>`; `FlowingFluid` has `SOURCE` instead of `FALLING`, `getFlowing(int)`, `getSource()`, `isSource`, `isFalling`; a liquid is one registered fluid (`water`, `lava`, `empty`).
- **Both:** `LiquidBlock(FlowingFluid, Properties)` (protected), `BucketItem(Fluid, Item.Properties)`, Fabric's client `FluidRenderingRegistry.register(Fluid still, Fluid flowing, FluidModel.Unbaked)` and `FluidModel.Unbaked(Material still, Material flowing, Material overlay, BlockTintSource)` (rendering-fluids 6.0.6 and 6.0.10).
- **Entity behaviour:** Fabric's `EntityFluidInteractionRegistry` and `FluidBehavior` (swimming, drowning, boats) are in `fabric-content-registries-v0`, present for 26.3 only. Vanilla treats fluids in `#minecraft:water` and `#minecraft:lava` as water and lava for most entity rules (to be confirmed per version, S14).

## Decision

- **D1 Kind `msm:fluid`** (frozen):

  ```
  struct Fluid {
    behaves_like?: "water" | "lava" | "none",   // default "water": joins the fluid tag, so entities swim, drown and are put out
    flow?: { tick_delay?: int @ 1..100, slope_distance?: int @ 1..8, drop_off?: int @ 1..4, infinite?: boolean },
                                               // defaults water's 5, 4, 1, true; "lava" defaults 30, 2, 2, false
    light?: int @ 0..15,                       // default 0 (lava-like 15)
    tint?: int,                                // an RGB colour multiplied over the textures; default none
    explosion_resistance?: float,              // default 100, as water
    on_entity_inside?: string,                 // event while an entity is in it (cooldown 10 ticks, ADR 0061)
  }
  ```

  One element registers the fluid (one or two registry entries by target), its `LiquidBlock` under the element id and its bucket `<path>_bucket` (a `BucketItem`; a generated id, `blocks-items.generated-item-clash` on conflict). Editor-only `textures` (`still`, `flowing`, optional `overlay`; animated with `.png.mcmeta` as water's) and the bucket picture lower to assets; lang for the block, fluid and bucket; the fluid tag of `behaves_like`.
- **D2 The runtime behind a seam.** `registry/fluid/` holds the shared registration and the definition reader; the fluid classes live in `src/mc/26.3/java/.../fluid/MsmFluid.java` (a source and a flowing subclass) and `src/mc/26.4/java/.../fluid/MsmFluid.java` (one class over `Fluid.Properties`), both reading the same `FluidDefinition`. Flow numbers, infinite sources and the bucket are vanilla's `FlowingFluid` and `BucketItem` behaviour over our numbers; nothing is transcribed from `WaterFluid` or `LavaFluid`. The client registers one `FluidModel.Unbaked` per fluid in `MsmRuntimeClient` (shared; F29).
- **D3 Spike first.** B470 proves on both versions: registration and sync to a client on a dedicated server; flowing, sources and draining; bucket fill and empty (and dispensers); drawing through `FluidRenderingRegistry` (a client GameTest screenshot); swimming and drowning through the tag; fog. If 26.4 is a no-go, the reserve B486 makes fluids a 26.3-only feature (`export.not-on-target` on 26.4, the pattern of `renderer: geckolib`), vetoable.
- **D4 Versions and eject.** Plugin API 1.18.0 adds `BlockFacts.fluidModel?: "two_fluids" | "one_fluid"` (informational, for the Studio's wording) and `fluidTags`. The 26.3 generator warns `export.not-in-eject` (a follow-up).
- **D5 Not in this batch (limits).** Mixing rules (a fluid meeting water or lava making a block), cauldrons, bottles and potions of a fluid, fluids in pipes or tanks (Fabric transfer API), custom fog colours on 26.3, buoyancy and swim speed other than water's, boats on project fluids, fluid-specific drowning or burning damage, waterlogging by a project fluid (`SimpleWaterloggedBlock` is water only), and world generation of lakes of a project fluid beyond the existing lake feature with its block.

## Consequences

- The largest version seam the runtime has; both implementations are tested by the same GameTests on both versions.
- Vehicles' fuel and magic liquids gain a vanilla-looking source; Try it shows still and flowing pictures without simulating flow (ADR 0101 D5).

## Status

Proposed (2026-11-14). Nothing after B470 starts before its go. Defaults the user may veto: `behaves_like: water` by default through the vanilla fluid tag (D1); water's flow numbers by default (D1); a 26.3-only fallback if 26.4 fails the spike (D3); no eject for fluids yet (D4).

## Amendment after the spike (B470, 2026-11-15)

- **D3 answered: go on both versions.** 26.3 registers two fluids per liquid (`<id>` and `<ns>:flowing_<path>`); 26.4 one `FlowingFluid(Fluid.Properties)`. Flow, falling, draining, infinite sources, buckets, dispensers (vanilla's water bucket behaviour object, registered after vanilla's bootstrap), drawing through `FluidRenderingRegistry` with our textures and a plain RGB tint, and dedicated-server sync behave the same on both. Reserve B486 is not needed.
- **26.4 needs one Mixin** (accepted under ADR 0096's Mixin rules): `EntityFluidMixin` injects at the head of `Entity.isInWater` and `isInLava` and returns true when the entity's fluid height for that tag is above 0. Without it a water-like project fluid drowns entities but nobody swims or floats in it. The server's `isUnderWater` may need its own injection (verify at implementation). 26.4 copies `drag`, `fallDistanceMultiplier` and `fogType` from vanilla water or lava by `behaves_like`; fog on 26.4 comes from `fogType`, on 26.3 from the tag.
- **D1 corrected:** putting out fire and lava burning come from the fluid's own `entityInside` effects (`EXTINGUISH`; `LAVA_IGNITE` and `Entity::lavaHurt`), not from the tag; with them the damage numbers match vanilla. Swimming needs `#minecraft:swimmable` on 26.4. `behaves_like: none` is air-like on 26.3 and slow with no fall damage on 26.4 (a limit).
- **D4:** `fluidModel` is `two_fluids` on 26.3 and `one_fluid` on 26.4; `fluidTags` adds `swimmable` on 26.4; lowering writes the `flowing_` id into tags on 26.3 only.
- **D5 corrected:** on 26.3 a lava-like project fluid mixes with water by vanilla's rule (obsidian or cobblestone); on 26.4 only vanilla lava does. Recorded as a limit that differs per version.
