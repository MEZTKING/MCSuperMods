# ADR 0109: Mobs 2: fish buckets, both shoulders, hovering and phasing flight, and five habits

## Context

The mob expansion ([ADR 0070](0070-mob-bodies-movement-and-ranged-attacks.md) D9, [ADR 0071](0071-tameable-breedable-rideable-mobs-variants-and-boss-bars.md) D10) and [ADR 0098](0098-traders-professions-mount-storage-and-shoulder-pets.md) left out vanilla mob abilities that are server-side: fish caught in a bucket (cod, salmon, axolotl, tadpole), a pet on each shoulder (vanilla parrots use both), special flight (the ghast and blaze hovering, the vex flying through walls while charging, the phantom swooping, the bat roosting), and brain-driven behaviours. At f6a8adc mobs have four movement modes and ten goal types, no bucket component and one shoulder (fact H14). Held weapons, the bow pose and variants that change the model are client rendering and stay for the client batch.

Brain behaviours are many; five are visible, common in mods and reachable with goals over vanilla's own entity calls: the allay collecting items for its owner, the sniffer digging up items, the axolotl playing dead, the camel's ridden dash and the piglin's bartering. The warden's sonic boom and sniffing, the frog's tongue and the piglin's whole brain (hunting, admiring, alliances) are not (limit N15).

## Decision

- **D1 Fish buckets.** Component `msm:bucketable { item_name?, water?: boolean }` on `swim` mobs (limit N12): a water bucket used on the mob takes it into a bucket item `<path>_bucket` (generated id), which keeps its custom name, health and variant and releases it with the water, as vanilla's bucketable contract does (X20).
- **D2 Both shoulders.** `msm:shoulder_riding` gains `sides?: "left" | "right" | "either"` (default `either`); a player carries at most two pets, one per side, beside vanilla's parrots on the sides they leave free (X21; limit N13).
- **D3 Flight modes.** `MovementMode` gains `hover` (floats at `hover_height` above the ground, default 4 blocks; ghast-like and blaze-like) and `phase` (flies, and passes through blocks while its attack goal charges; vex-like). Goal types gain `swoop` (circles high, then dives at its target; phantom-like) and `roost` (hangs under a block in daylight or when idle; bat-like), `roost` only if the runtime's renderer can draw the pose (X22; else the client batch, limit N14).
- **D4 Five habits** as goal types: `collect_items` (picks up items matching the one it was given and brings them to its owner or a note block it heard; allay-like), `dig_items` (digs on its `dig_blocks`, drops a roll of `loot_table`; sniffer-like), `play_dead` (lies still and regenerates when hurt below a share of its health; axolotl-like), `barter` (takes `item` from a player or the ground and drops a roll of `loot_table`; piglin-like), and on `msm:rideable` the field `dash` (a charged forward leap from vanilla's ridden jump bar; camel-like). Each is vanilla behaviour over our numbers, learned by observation (X23).
- **D5 Format and sync.** New synced flags only where the renderer needs them (playing dead, roosting, dashing), as section 2.3 of the coverage audit asks.

## Consequences

- The most-asked vanilla mob abilities without brains are possible; Water mob, Pet, Flying mob and Mount flows gain answers.
- More goals to keep on both versions; each has a GameTest and a parity case.
- The brain-only behaviours stay a stated limit.

## Amendment after the spike (B524, 2026-11-22)

Measured on both versions (evidence in `docs/reference/spikes/b524/`).

- **D1 buckets: go.** `Bucketable` on the swim body with a `MobBucketItem` (`stacksTo(1)`, `BUCKET_ENTITY_DATA`); name, health, variant and persistence come back on release.
- **D2 both shoulders: go, with a correction.** The runtime's shoulder pet today sits on the player's right (seen from behind, the side of vanilla's right parrot), though its documentation says left. Sides are named by the player's view, and a second pet takes the mirrored side; each tick a pet takes the side vanilla's parrots leave free (parrots take left first).
- **D3 flight: go.** Hover by scanning down for a collision shape (not the heightmap) with a damped controller; phasing by `noPhysics` around the tick while charging; roosting under a block with no gravity. **Limit N14 is lifted:** the roosting pose is vanilla's upside-down flip, drawn by the runtime's own renderer from one synced flag, no client batch needed.
- **D4 habits: go for all five.** Collect (thrown items carry a thrower and are skipped), dig (`GIFT` loot context), play dead (one synced flag for the pose), barter (`PIGLIN_BARTER` with the mob only, never an origin), dash (vanilla's jump bar, applied in `tickRidden`, about 7 blocks at a full bar).

## Status

Proposed (2026-11-22). Vetoable defaults: five habits (and which five); the hover height of 4; buckets for `swim` mobs only; two shoulder pets at most; `roost` dropped to the client batch if the pose cannot be drawn.
