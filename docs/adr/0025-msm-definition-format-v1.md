# ADR 0025: MSM definition format v1, MSM mcdoc and the blocks and items plugin

## Context

Phase 4 ([ROADMAP](../ROADMAP.md)) adds custom blocks and items that vanilla packs cannot express. The `msm_runtime` Fabric mod reads definitions from `msm/` in every mod jar at initialisation and registers driver classes ([Engine Mod](../DESIGN.md#10-engine-mod-runtime)); behaviour is a bag of components plus events that chain actions ([Behaviour Model](../DESIGN.md#11-behaviour-model-components-and-events)). The registry-freeze spike ([ADR 0024](0024-runtime-registration-spike.md)) decides whether that registration works on 26.3; this ADR fixes the file format both sides share, so the app, the mcdoc schemas and the runtime can be built in parallel.

Facts that shape the format:

- Mining a block with the right tool, and the tier needed for drops, are vanilla block tags (`minecraft:mineable/<tool>`, `minecraft:needs_<tier>_tool`; verify at implementation), which are reloadable data, not registry properties. Display names are language keys (`block.<ns>.<path>`, `item.<ns>.<path>`). Both are files that several elements contribute to, so they need merging ([ADR 0027](0027-plugin-api-0.6.md)).
- Drops are a vanilla loot table (`data/<ns>/loot_table/blocks/<path>.json` by default), reloadable, so they never become a runtime component (DESIGN §10).
- Until now MSM schemas were TypeScript `SchemaNode` extensions (`msm:function`, `msm:structure_template`); DESIGN §6 and the ROADMAP promise MSM mcdoc in `packages/schemas/mcdoc/msm/`, shared by the app and the runtime.

## Decision

**D1. Two documents per element: the element data and the runtime definition.** The app edits element data; lowering writes the runtime definition to `msm/<ns>/block/<path>.json` or `msm/<ns>/item/<path>.json` (layer `msm`). The definition holds only what the runtime registers; everything reloadable lowers to ordinary pack files. Every definition carries `"format": 1`; the runtime rejects a higher major format with an error naming the file and the mod, and ignores unknown top-level keys with a warning.

**D2. Block definition v1** (`::msm::definition::Block`):

```jsonc
{
  "format": 1,
  "sound_type": "stone",                // vanilla SoundType constant, lower-case (verify the list at implementation)
  "loot_table": "mymod:blocks/ruby_ore", // optional; omitted means the vanilla default for the block id
  "item": { "creative_tab": "minecraft:building_blocks", "max_stack_size": 64, "rarity": "common" }, // optional; false = no block item
  "components": {
    "msm:breakable": { "hardness": 3.0, "resistance": 3.0, "requires_tool": true },
    "msm:light_emitter": { "level": 4 },
    "msm:on_interact": { "event": "mymod:shimmer" },
    "msm:on_step": { "event": "mymod:hum", "cooldown_ticks": 20 },
    "msm:redstone": { "emit": 0, "on_powered": "mymod:wake", "on_unpowered": "mymod:sleep" }
  },
  "events": {
    "mymod:shimmer": { "actions": [ { "type": "play_sound", "sound": "minecraft:block.amethyst_block.chime" } ] }
  }
}
```

Defaults: `msm:breakable` absent means hardness 1.5, resistance 6.0, no tool needed; `item` absent means a block item with stack size 64 in no creative tab; `"item": false` means no block item (mcdoc has no null type, so `false` replaces the `null` of the first draft; the schema change lands with B93). `msm:redstone.emit` (0–15) makes the block a constant signal source; `on_powered` and `on_unpowered` fire on neighbour-update transitions of `hasNeighborSignal`.

**D3. Item definition v1** (`::msm::definition::Item`):

```jsonc
{
  "format": 1,
  "max_stack_size": 64,                  // 1–99; forced to 1 by msm:durability
  "rarity": "common",                    // common | uncommon | rare | epic
  "creative_tab": "minecraft:ingredients", // optional
  "components": {
    "msm:food": { "nutrition": 4, "saturation": 0.3, "can_always_eat": false },
    "msm:tool": { "type": "pickaxe", "tier": "iron" }, // pickaxe | axe | shovel | hoe | sword; tier wood | stone | copper | iron | diamond | gold | netherite (verify at implementation)
    "msm:durability": { "max": 250 },
    "msm:on_use": { "event": "mymod:zap", "cooldown_ticks": 0 }
  },
  "events": { }
}
```

**D4. Actions v1.** Each action is `{ "type": <name>, ... }`:

| Type | Fields | Notes |
|---|---|---|
| `run_function` | `function` (id) | Runs the data pack function at the event position, as the player when there is one, with permission level 2 |
| `spawn_particle` | `particle` (simple particle type id), `count` = 1, `spread` = 0.0, `speed` = 0.0 | Server-side `sendParticles` at the block centre or the player's position |
| `set_block_state` | `state` (block state string, `ns:id[prop=value]`), `offset` = `[0, 0, 0]` | Relative to the event block, or to the block below the player for item events |
| `give_item` | `item` (id), `count` = 1 | No-op without a player |
| `play_sound` | `sound` (sound event id), `volume` = 1.0, `pitch` = 1.0 | |
| `trigger_event` | `event` (event id in the same definition) | Chains nest at most 16 deep; deeper chains stop with a logged error |

Events run on the logical server only. An unknown action type is a load-time error for that definition (the block or item is still registered without the event).

Runtime rules, as implemented by `msm_runtime` v1 (B93):

- **Dropped events.** Any event that fails to decode (an unknown action type, a missing or mistyped field, an invalid id) is dropped with an error naming the file and the event; the definition itself still registers. A component or `trigger_event` reference to an event the definition does not declare is an error too, and that reference does nothing.
- **Chain depth.** The depth counts the fired event as 1, so a chain of `trigger_event` actions runs at most 16 events; the 17th is not run and an error is logged.
- **Strict JSON types.** Definitions are decoded with `StrictJsonOps`: a boolean is never read as a number and a number with a fraction is never read as an integer (Mojang's `JsonOps` reads `true` as 1 and `1.5` as an int). The JUnit conformance tests over the shared corpus check this.
- **No block item.** `"item": false` registers the block without a `BlockItem`; `"item": true` is invalid (`schema.no-union-match` in the corpus).
- **Checks at load and after start.** Parsing needs no registry access; sound events and particle types are checked at load, items, block states, functions and creative tabs once the server has started (warnings).

**D5. Element data adds editor-only fields.** `msm:block` element data is the definition plus `model` (block model id, lowered to a single-variant blockstate and the block item definition), `display_name` (lowered to language keys), `loot` (`"self"` generates the "drops itself" loot table; an id points at a loot table element; absent means no generated table), and `msm:breakable` gains `tool` and `min_tier`, which lower to the mineable and needs-tier tags and to `requires_tool: true`. `msm:item` element data is the definition plus `model` (item model id, lowered to the item definition) and `display_name`. Element ids are the registry ids: `mymod:ruby_ore` registers `mymod:ruby_ore`; a block and its item share the id, which is legal because the item is not a separate element.

**D6. Mod metadata.** A singleton kind `msm:mod` (kind folder `mod`, conventional id `<ns>:mod`) holds `mod_id` (Fabric rule `^[a-z][a-z0-9_-]{1,63}$`), `version`, `name`, `description`, `authors`, `licence` (written as Fabric's `license`). It lowers to `fabric.mod.json` in layer `msm` with the target's Fabric dependencies; the content-jar exporter adds `jars` ([ADR 0026](0026-fabric-content-jar.md)) and synthesises a default from the project name when the project has no `msm:mod`.

**D7. MSM mcdoc.** The types live as mcdoc source in `packages/schemas/mcdoc/msm/` (`definition.mcdoc`, `element.mcdoc`, `action.mcdoc`, `mod.mcdoc`), using vanilla id attributes (`#[id="sound_event"]`, `#[id="particle_type"]`, `#[id="block"]`, `#[id="item"]`, `#[id="function"]`, `#[id="loot_table"]`, `#[id="model"]`). `tools/build-msm-mcdoc` runs `@spyglassmc/mcdoc-cli export` over that folder (as `tools/sync-mcdoc` does for vanilla) into a checked-in `symbols.json`; a test fails when the source and the export disagree. `createSchemaIndex` merges the MSM symbols with the target's vanilla symbols; the MSM types are version-independent and live in `@msm/schemas`, not in a target. The mod metadata type is `::msm::Mod`, because `mod.mcdoc` is its folder's own module in mcdoc. `mod_id`'s pattern cannot be written in mcdoc, so the schema checks length only and the plugin validator checks the pattern. A shared conformance corpus, `packages/schemas/mcdoc/msm/conformance/{definition,element}/{valid,invalid}/*.json` (expected errors in one `expected-errors.json` per group), is checked by `validateJson` in TypeScript and by the runtime's JUnit tests, which keeps the Java Codecs aligned with the mcdoc. If `mcdoc-cli` cannot export a local folder, the types fall back to `BUILT_IN_EXTENSIONS` and the corpus still binds both sides (record the fallback in this ADR).

**D8. The plugin.** `@msm/plugin-blocks-items` (plugin id `msm.blocks-items`, created with `tools/new-plugin`) contributes `msm:block` (kind folder `block`), `msm:item` (`item`) and `msm:mod` (`mod`), their lowering, validators (`blocks-items.*`: missing model, unknown event in an `event` field or `trigger_event`, an event cycle, a bad `mod_id`, a tool tier the target does not know, an `msm:item` id that collides with a block's item) and templates. Lowered vanilla files take folder names from the target. The vanilla pack exporters skip layer `msm`, and the export dialog says that blocks and items need the Fabric content jar.

## Consequences

- One spec serves four briefs in parallel: MSM mcdoc, the runtime Codecs, the plugin's lowering and the Studios.
- The runtime works with hand-written `msm/` files; the app is one producer among many.
- A definition format change is a `format` bump with a migration note; minor additions stay at format 1 and are ignored by older runtimes with a warning.
- Display names, tool tags and drops live in mergeable or reloadable pack files, so `/reload` changes them without restarting the game.

## Status

Accepted (2026-11-05). The spike ([ADR 0024](0024-runtime-registration-spike.md)) confirmed the registration model; `mcdoc-cli` exported the local folder, so the D7 fallback was not needed.
