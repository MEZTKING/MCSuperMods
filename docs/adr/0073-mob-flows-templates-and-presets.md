# ADR 0073: Mob Creator flows, templates and preset models

## Context

[ADR 0070](0070-mob-bodies-movement-and-ranged-attacks.md), [ADR 0071](0071-tameable-breedable-rideable-mobs-variants-and-boss-bars.md) and [ADR 0072](0072-vanilla-model-renderer.md) add mob bases, movement modes, ranged attacks, taming, breeding, riding, variants, boss bars and a renderer without GeckoLib. Beginners reach content through Creator flows ([ADR 0043](0043-creator-guided-flows.md)): parameterised starters with `creator`, previewed live and reopened through `meta.creator`. The Creator group `mobs` has "Custom mob" (an animated golem with a biped or player skin, ADR 0048) and "Mob skin" (vanilla variants, ADR 0064). The library shares geometry in `packages/plugins/library/src/content/entities.ts` (a cube creature and a biped, original Bedrock geometry 1.12.0 over 64x64 textures) and colours placeholder textures from one colour through `src/assets/png.ts`. The entities plugin has three templates (Creature, Monster, Ambient critter). The block families batch found that every flow must be run with its untouched defaults in e2e (ADR 0069 findings).

## Decision

- **D1 Preset models.** The library gains original preset geometries and animation sets, each with `idle`, `walk` and the state animations that fit (`sit`, `fly`, `swim`, `attack`, `shoot`), plain numbers only so both renderers play them fully: **quadruped** (pig- or wolf-like: body, head, four legs, optional tail), **bird** (body, head, two wings, two legs), **fish** (body, tail fin, side fins), **flyer** (a round body with four wings, bee- or allay-like), and the existing **biped** and **cube creature**; each with a matching placeholder skin pattern in `png.ts` coloured from one colour (and an `image` parameter, as Custom mob). Geometry is written from scratch for MSM; never a vanilla model.
- **D2 Creator flows** (group `mobs`; names default, vetoable). Every flow writes ordinary `msm:entity`, `msm:geo_model`, `msm:animation`, texture, loot table and language elements with `renderer: "auto"`, so it works on 26.3 (GeckoLib) and 26.4 (vanilla renderer):
  - **Pet**: name, preset (quadruped, bird, flyer, biped), colour or picture, taming food (choice of vanilla foods or a project item), "sits when told" (on), "defends you" (on), "can have babies" (on: breeding food the same), health, speed. Base `animal`, `msm:tameable`, optional `msm:breedable`, `follow` goals, spawns in a chosen biome group.
  - **Farm animal**: name, quadruped or bird, colour, breeding food, baby size, drops (an item and amount, cooked when on fire as vanilla's), "can be ridden" (off), spawns in a biome group. Base `animal`, `msm:breedable`, `panic` and `tempt` goals, an animal spawn rule.
  - **Mount**: name, quadruped (or flyer for a flying mount), colour, "needs a saddle" (on), speed, jump strength, "only its owner can ride" (off; on adds taming), flying (off). Base `animal`, `msm:rideable` with `saddle_bone` on the preset, optional `msm:tameable`.
  - **Flying mob**: name, flyer or bird, colour, behaviour (peaceful, neutral, hostile: melee or shoots a projectile), spawns in. Movement `fly`.
  - **Water mob**: name, fish or quadruped (an axolotl-like amphibian), colour, kind (fish: `swim`, `water_ambient`, schools; dolphin-like: `swim` with `breathes_air`, `water_creature`; amphibian: `amphibious`, `axolotls`), behaviour, spawns in oceans, rivers or swamps.
  - **Boss**: name, preset (biped scaled up, quadruped), colour, health, attacks (melee, ranged with a chosen projectile, or both), boss bar colour and style, "darkens the sky", drops, summoned by a spawn egg only (no natural spawns). Base `monster`, `msm:boss_bar`, size and scale presets.
  - **Custom mob** gains a fourth behaviour, "Hostile archer: shoots arrows from a distance" (`msm:ranged_attack` with `minecraft:arrow`), and the base and renderer fields.
  - **Variants** are an "Add a variant" list in every flow except Boss (texture colour or picture, biomes), writing `msm:variants`.
- **D3 Templates.** `@msm/plugin-entities` adds "Pet", "Farm animal", "Mount", "Flying creature", "Fish", "Archer" and "Boss", each with vanilla-free placeholder references and validated on both targets (template count 3 to 10).
- **D4 Examples** (mirrored in `examples/`): a tameable fox-like pet, a rideable flying mount, a skeleton-like archer that throws a project throwable, a fish school with biome variants, a boss with a boss bar, a mob drawn by the vanilla renderer on 26.4.
- **D5 App.** The Entity Studio gains a "Kind of mob" picker (D6 of ADR 0070), and sections Movement (mode and its fields), Ranged attack, Taming, Breeding, Riding, Variants (a list with a texture picker and biome picker) and Boss bar, plus the renderer picker with a note on the target (26.4: "drawn by the built-in renderer: no Molang"). The entity preview gains a variant switcher and a baby toggle (scale) and plays the state animations by name. Creator previews reuse the entity preview. Studio registration goes through `studios/entities/studios.tsx` as today.
- **D6 AI helper.** The system prompt and kinds summary describe `base`, movement modes, the five components, the new goals and the flows; `add_starter` drives the flows as any flow.
- **D7 Vanilla pack safety.** Mobs are mod-only; flows add nothing a vanilla data pack would keep except loot tables, functions and the optional saddle tag entry, which ADR 0066 makes optional. The CI library server check covers the new starters and examples on both targets.

## Consequences

- Six new Creator flows and seven templates make every B7 feature reachable without code; each stays editable in the Entity Studio and Raw JSON.
- The library grows by preset models, animations and patterns; the asar budget (audit L15) is measured in each library and app brief with `tools/check-size`.
- The guide gains a page "Mob behaviours" and the Entities and models page learns the renderer choice.

## Status

Proposed (2026-11-14). Defaults the user may veto: the flow names "Pet", "Farm animal", "Mount", "Flying mob", "Water mob" and "Boss" (D2); flows using `renderer: "auto"` (D2); a Boss spawning only from its egg (D2); the preset shapes (D1).
