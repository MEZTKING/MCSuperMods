# sim-parity: shared scenarios for Try it

[ADR 0085](../../docs/adr/0085-try-it-in-app-test-area.md) D10: small scripted scenarios over a fixture project, played in the real server by the runtime's GameTests and in Vitest by `@msm/sim`, so the two cannot drift apart unseen. The expectations are what the runtime does on Minecraft 26.3; they are the same on 26.4 (a difference would be split by target in the file and noted here).

## What is here

- `project/`: the fixture project, namespace `sim_parity` (plugins resourcepack, datapack, blocks-items). One block of each placement type that the game decides: `log` (pillar), `cabinet` (horizontal, `msm:shape` box `[0, 0, 0, 16, 16, 8]`), `beacon` (directional), `slab`, `stairs` (base `base`), `wall`, `fence` (wooden), `stone_fence` (not wooden), `gate` (oak), `pane`, doors of the set types `wood`, `iron`, `gold`, `stone` and `copper`, `trapdoor` and `iron_trapdoor`, buttons `button` (wood, 30 ticks), `stone_button` (20 ticks) and `quick_button` (`press_ticks` 5), plates `plate` (wood), `stone_plate` and `weighted_plate` (`weighted_max` 4), `leaves`, two plain blocks `base` and `lamp`, and `signal`, a plain block with four triggers:
  - `msm:on_place` runs `sim_parity:placed`: `set_block_state` (a lamp above), `trigger_event` `sim_parity:chime` (`play_sound`).
  - `msm:on_interact` runs `sim_parity:used`: `set_block_state` (air above), `trigger_event` chime, `run_function` `sim_parity:noted` (a function that changes nothing, so both sides show the same blocks).
  - `msm:on_break` runs `sim_parity:broken`: `play_sound`, `set_block_state` (air above).
  - `msm:on_step` runs `sim_parity:stepped`: `set_block_state` (a lamp east of it).
  Crops, saplings and portals are left out: Try it plants on anything and places portals as plain blocks on purpose (logged as "Only in Minecraft"), and a sapling needs a tree feature.
- Vanilla parity 3, batch 1 (B519): `ribbon` (a `growing_plant` up, `bonemeal_growth` 2), `glow_strand` (one down with berries of `minecraft:glow_berries`), `spike` (a cactus-like `column_plant` on stone or `base`), `reed_bamboo` (a bamboo-like one, the same soil), `lichen` (`multiface`), `big_leaf` and `small_leaf` (`dripleaf`, the small one growing into the big), `clay_pot` (a `flower_pot` taking `minecraft:dandelion` and `minecraft:oak_sapling`) and `crate` (a double chest).
- Vanilla parity 3, batch 2 (B540): two fluids, `goo` (`behaves_like: none`, a three-level cauldron, a bottle, and a mixing rule: a source that meets lava becomes `base`, flowing goo `lamp`) and `magma` (lava-like, a full-only cauldron). Their three scenarios were written by B540 from the runtime's measured notes (B525, B529) and recorded in the game by B541 (`-PupdateSimParity`), and are in `scenarios.json`. There a `place` holding a bucket pours it (in the GameTest the bucket's own use, aimed from one and a half blocks out from the clicked face at the hit point) and a `use` with an `item` uses that item on the block (cauldrons).
- Live views 2 (B614): `tool_rules`, a `msm:vanilla_block_rules` element: an axe strips `minecraft:basalt` into `minecraft:polished_basalt`, a shovel flattens `minecraft:clay` into `minecraft:dirt_path`, a hoe tills `minecraft:packed_mud` into `minecraft:mud_bricks` (dropping a clay ball once) and honeycomb waxes `minecraft:end_stone` into `minecraft:end_stone_bricks` (an axe takes it off). None of these blocks is in the runtime's own GameTest rules (`msm_test`). Its five scenarios (`vanilla_rules_axe_strips`, `vanilla_rules_shovel_flattens_with_air_above`, `vanilla_rules_hoe_tills`, `vanilla_rules_honeycomb_waxes_and_axe_unwaxes` and `vanilla_tools_on_vanilla_blocks`, the last on Minecraft's own pairs: an oak log stripped, dirt flattened, a copper block waxed) were written by B614 from ADR 0105's findings and the runtime's `BlockExtras` and still need their recording in the game (`-PupdateSimParity`). A `use` with an iron axe, shovel, hoe or honeycomb uses that item on the block. No block transformer is in the fixture: an item naming one needs the runtime to apply a passthrough `minecraft:block_transformer` component, which is not yet known to work (B614's report), and a file of a vanilla tool's id would change every GameTest's tools.
- `mod/<target id>/`: the project lowered for each built-in target, only what a server reads (`fabric.mod.json`, `msm/`, `data/`). The engine-mod build hands `mod/mc-<mc>/` to the GameTest server as an extra mod (`fabric.addMods`). Only `fabric.mod.json` differs by target.
- `lower.test.ts`: checks that `mod/` equals the lowering and that the project lowers with no problems; rewrites it with `UPDATE_SIM_PARITY_MOD=1`.
- `scenarios.json`: the scenarios.
- The twelve scenarios of vanilla parity 3, batch 1 (strands, columns, lichen, dripleaves, the pot and the double chest) were written by B519 from the runtime's measured notes and recorded in the game by B520 (`-PupdateSimParity`; the game agreed but for one check, which looked at the floor, so the berry strand now hangs one block higher). Big dripleaves stand on `minecraft:moss_block`, which Try it places as a prop.

## scenarios.json

`format: 1`, `namespace`, and `scenarios`, each with `name` (snake case; the GameTest method is its camel case), `description`, `steps`, `events` and `actions`.

Positions are Try it's: the floor is `y = -1` (in the GameTest a stone floor under an 8 by 8 by 8 area), blocks stand from `y = 0`. Yaw 0 looks south, 90 west, 180 north, 270 east; negative pitch looks up. A step is one of:

- `{"step": "place", "block", "pos", "face", "hit", "yaw", "pitch"}`: right-click `face` of the block at `pos` (the floor at `y = -1`) at `hit` (block units from that block's corner, 0 to 1) holding `block`.
- `{"step": "use", "pos", "yaw"}`: right-click the block with an empty hand, looking at `yaw` (the top face unless `face` is given). It may carry `item`: the item held (`minecraft:bone_meal` is one bone meal).
- `{"step": "step_on", "pos"}`: the player stands on the block for a moment and leaves: in a pressure plate (its press), on top of any other block (`msm:on_step`). It takes no tick in the GameTest.
- `{"step": "wait", "ticks"}`: game ticks pass.
- `{"step": "break", "pos"}`: the player breaks the block at once (creative: no drops).

Any step may have `expect`, checked right after it: `blocks` (`{pos, state}`; a state `namespace:path[a=1,b=2]` compares only the properties it lists; `minecraft:air` is any air) and `shapes` (`{pos, outline, collision}`: the bounds of the outline and collision shapes in pixels, `null` for none). `events` lists every event the runtime ran for a `sim_parity` block in the area, in order (`owner`, `event`, `depth`: 1 for a trigger, 2 for a `trigger_event`, `pos`), and `actions` every action run (`event`, `type`), in order.

Timing checks keep a margin of at least two ticks on each side of a press or release, because the two sides count the tick of a press differently.

## Commands

From `engine-mod/` (JDK 25):

- Check: `./gradlew build` (and `-Pmc=26.4`, `-PwithoutGeckolib`); `MsmSimParityGameTest` plays every scenario.
- Regenerate the expectations from the runtime: `./gradlew runGameTest -PupdateSimParity`. It keeps the positions and the property names listed and rewrites the values, the shapes, `events` and `actions`. Review the diff: every change is a change in the runtime or in Try it's contract.

After editing `project/`, from the repository root:

- `UPDATE_SIM_PARITY_MOD=1 pnpm --filter @msm/sim exec vitest run --root ../../fixtures/sim-parity` rewrites `mod/`; without the variable it checks it.

`@msm/sim` plays the same scenarios in `packages/sim/test/sim-parity.test.ts` (B399).
