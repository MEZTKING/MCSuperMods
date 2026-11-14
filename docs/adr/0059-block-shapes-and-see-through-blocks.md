# ADR 0059: Block shapes and see-through blocks

## Context

`msm:block` blocks are plain full cubes (coverage audit L5), yet the kind accepts any model id (audit S5): a slab, plant or glass-like model collides as a full cube and hides neighbouring faces. Facts read on 2026-11-13 with `javap` over the Loom-cached merged jars (26.3 and 26.4-snapshot-7) and from this repository (the full fact table lived in the working plan, deleted at close; see the DEVLOG entry of 2026-11-14):

- `BlockBehaviour.getShape` and `getCollisionShape`, `propagatesSkylightDown`, `getShadeBrightness` and `skipRendering` are overridable. `Properties` has `noOcclusion()`, `noCollision()`, `isSuffocating`, `isViewBlocking` and `isRedstoneConductor`. `Block.box` takes pixels; `Shapes.or` and `Shapes.block()` exist. Vanilla glass is `TransparentBlock extends HalfTransparentBlock`, which overrides exactly those three methods plus `getVisualShape`. Same on 26.4. Which predicates glass sets in `Blocks`: (verify at implementation).
- **No render-layer registration exists in 26.x.** The baked quad's material info picks a chunk layer (`SOLID`, `CUTOUT`, `TRANSLUCENT`) from the sprite's computed transparency. The jars hold no `ItemBlockRenderTypes`, and Fabric API 0.165.2+26.3 has no block render layer module. A texture with fully transparent pixels draws as cutout, one with partial alpha as translucent, per quad, with no client code. What is missing for see-through blocks is therefore only server-shared block behaviour (`noOcclusion`, light, face culling), and audit L3 does not block S5.
- `msm:block` lowers a model to one `""` variant, and `lower(element, target)` sees one element, so a shape cannot be read from another element's model while lowering. Plugin validators do see all elements. Editor-only fields inside a component have a precedent (`BREAKABLE_EDITOR_FIELDS`).

## Decision

- **D1 Component `msm:shape`** in `BlockComponents` (definition): `boxes?: [[float @ 0..16] @ 6] @ 1..16` (pixel boxes `x1 y1 z1 x2 y2 z2`, as model elements), `collision?: boolean` (true; false is walk-through, as plants), `see_through?: boolean` (default: true when `boxes` is present and is not the single full cube, else false). An absent component is today's full solid cube, with byte-identical behaviour.
- **D2 Presets are editor-only.** The element field `preset?: ("full" | "slab_bottom" | "slab_top" | "carpet" | "pillar" | "cross" | "custom")` sits inside the component and is stripped in lowering, which writes the preset's `boxes` (`cross`: a 12 by 12 by 16 outline with `collision: false`). `custom` keeps the user's `boxes`. "From the model" is an app action in the Block Studio: it reads the block's model element (following project parents; vanilla parents only for the known `cube*`, `slab`, `cross` and `carpet` families) and writes `custom` boxes in one undoable change. The runtime never reads models.
- **D3 Runtime.** `MsmBlock` precomputes one `VoxelShape` (`Shapes.or` of `Block.box`) and returns it from `getShape`; collision follows it unless `collision` is false (`Properties.noCollision()`). `see_through` sets `noOcclusion()`, lets light pass (`propagatesSkylightDown` true, shade brightness 1), skips faces between two blocks of the same definition (the glass rule) and the block never suffocates, blocks view or conducts redstone. The shape is the same for every state (`POWERED` does not change it).
- **D4 Render layer: no code.** Cutout and translucent come from the texture's pixels on both targets. The guide says so; the Studio shows which layer the block's textures give ("solid", "cut-out", "see-through"). A new validator warning `blocks-items.transparent-texture-on-solid-block` fires when a block's model textures have transparent pixels and `see_through` is off (holes into the world), and `blocks-items.model-not-cube` fires when a non-`cube*` project model has no `msm:shape`. Texture pixels are app-side knowledge, so the first warning is produced by the app session (as the effect icon warning is), the second by the plugin.
- **D5 Deferred to a later batch (audit B2), stated here so nobody expects them:** rotation and any new state property (facing, axis, half), connecting shapes (fences, walls, panes), stairs, slab stacking (double slabs, waterlogging), doors and trapdoors, crops, per-state shapes and models, block families from one texture. A `slab_bottom` preset here is a fixed half block, not a vanilla slab. Default, vetoable: fixed shapes and see-through only.
- **D6 Eject and versions.** The 26.3 generator writes the same overrides into the block class. Runtime code is shared; the overridden methods are identical on 26.4.

## Consequences

- Format 1 grows additively: one block component. The corpus (prefix `block-shape-`), the Codecs, the plugin and the eject generator move together.
- Slabs, plants and glass-like blocks work as fixed shapes; real families (stairs, doors, fences, crops) remain gaps recorded in the ROADMAP.
- A block without `msm:shape` generates byte-identical Java and behaves exactly as before.
- A project that uses shapes needs the runtime release that ships this.
- This is the separable Part B of the runtime fixes batch: it may ship one release after Part A (default, vetoable).

## Status

Accepted (2026-11-14). The decisions above stand as written.

### Implementation findings

- **See-through blocks follow vanilla glass:** `noOcclusion`, never suffocating, view-blocking, a redstone conductor or a valid spawn, an empty visual shape, skylight passes, shade brightness 1, and `skipRendering` against itself.
- **Walk-through.** `noCollision` also disables occlusion.
- **Boxes** are ordered per axis, so equal shapes lower and eject identically.
- **Render layer.** It comes from the texture's pixels; no client code was needed.
- **Seam.** None: no 26.4 difference.
