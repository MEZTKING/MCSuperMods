# ADR 0090: Vehicles

## Context

The user asked "would it be possible to make things like tanks" and, on 2026-11-14, "keep going, add the vehicles too", under the rule "anything that can be made in vanilla java should be possible through this app". Vanilla Java has boats, rafts, chest boats, minecarts and steerable animals (horses, pigs, striders, the happy ghast). Vehicle mods add cars, tanks, planes, helicopters and ships (research `popular-mods.md` section 1.8: Immersive Aircraft, Small Ships, Automobility, a battle tank mod for 26.2 and 26.3, MrCrayfish-style cars, Create trains).

What players expect, in order of how often the surveyed mods offer it: W/A/S/D driving with the vehicle facing its own way (a tank's turret following the view), placing from an item and picking up again, seats with the first rider driving, a separate fire key with reload and ammunition, fuel, health or armour with repair, a dashboard, storage, paint, engine sounds and horn, and physics per type (cars climb a block, boats float on the surface, planes need speed for lift, helicopters hover, trains follow rails).

What MSM can do today: an `msm:entity` with the `animal` base, `msm:rideable` (`saddle: false`) and no goals drives like a horse (`walk`) or the happy ghast (`fly`) ([ADR 0071](0071-tameable-breedable-rideable-mobs-variants-and-boss-bars.md) D3). The research lists what that route cannot do: the vehicle is a living mob (fall damage, drowning, burning, leads and name tags, mob caps, possible despawning), there is no fire key, no turret, no gauges, no surface boat, no plane lift, no storage, and no script accessor for vehicles or passengers.

Facts read on 2026-11-14 with `javap` over the Loom-cached merged jars of 26.3 and 26.4-snapshot-7 and the Fabric API jars (plan V12 to V22): `VehicleEntity` (vanilla's base of boats and minecarts: synched hurt time, hurt direction and damage, `hurtServer`, `shouldSourceDestroy`, `destroy(ServerLevel, Item)`, abstract `getDropItem`) is identical on both versions; `Entity` offers `getControllingPassenger`, `isLocalInstanceAuthoritative` (final), `positionRider(Entity, MoveFunction)`, `canAddPassenger`, `getDismountLocationForPassenger`, `onPassengerTurned`, `interact(Player, InteractionHand, Vec3)`, `getPickResult` and an `InterpolationHandler` on both, while `lerpPositionAndRotationStep` exists on 26.3 only; `Attributes.CAMERA_DISTANCE` exists on both; `ServerPlayer.getLastClientInput()` gives the server the driver's movement keys; `EntityType.spawn(ServerLevel, ItemStack, LivingEntity, BlockPos, EntitySpawnReason, boolean, boolean)` exists on both; the server's vehicle check (`handleMoveVehicle`) resets a vehicle moved more than 10 blocks in a tick and logs "moved wrongly" above 0.25 blocks of disagreement (ADR 0070 finding M1).

**What vanilla does for multiplayer.** For boats, minecarts pushed by a player, horses and the happy ghast, the controlling player's client moves the vehicle with its own copy of the physics and sends the result (`ServerboundMoveVehiclePacket`); the server checks it (the 10-block rule above) and forwards positions to other players, whose clients interpolate. The server moves vehicles that have no controlling player. There is no rollback or server-side prediction; a modified client can move a vehicle as fast as the check allows, as with ice boats today.

## Decision

- **D1 A new kind, not a mob, and no mob-route flow first.** Vehicles are a new definition kind `msm:vehicle` (`msm/<ns>/vehicle/<path>.json`), registered as entity types of a runtime class `MsmVehicle extends VehicleEntity`, the base vanilla uses for boats and minecarts. We weighed the research's two-step proposal (ship a "Vehicle" Creator flow on the mob route first, then a real kind) and chose the direct kind: every gap the research found on the mob route (living-mob side effects, no turret, no surface boat, no lift, no storage) is a property of the base class, not of a flow, so a mob-route flow would teach users to build vehicles that later need rebuilding as a different kind, and the key binds and HUD this batch builds first (ranks 1 and 3) remove most of the reason to hurry. Rideable mobs stay what they are for horses, dragons and other living mounts. A vehicle is not living: no health attribute, effects, AI, breathing, despawning, mob caps, leads or spawn egg; its health is `VehicleEntity`'s damage counter (D9).
- **D2 The definition.** Format 1, closed records (an unknown key is an error), every field optional except `model` and `movement.mode`:

  ```
  struct VehicleDefinition {
    format: 1,
    name?: string,                                   // default lang key entity.<ns>.<path>
    model: {
      geometry: #[id="geometry"] string,             // the project's geo file (Blockbench), as mobs
      texture: #[id="texture"] string,
      paints?: [struct { id: string, texture: #[id="texture"] string, dye?: #[id="item"] string }],  // D12
      animations?: #[id="animation"] string,         // idle and moving keyframes (vanilla renderer subset)
      scale?: float @ 0.1..8,
    },
    size?: [float] @ 2,                              // hitbox width, height; default [1.375, 0.5625] (a boat's)
    movement: {
      mode: ("ground" | "water" | "amphibious" | "air" | "hover"),
      max_speed?: float @ 0.01..3,                   // blocks per tick; default by mode (D3)
      reverse_factor?: float @ 0..1,                 // default 0.4
      acceleration?: float @ 0.001..1,               // blocks per tick per tick; default by mode
      braking?: float @ 0.001..1,
      turn_rate?: float @ 0.5..30,                   // degrees per tick; default by mode
      turns_in_place?: boolean,                      // tanks; default false (cars must move to turn)
      step_height?: float @ 0..2,                    // default 1 on ground (a car climbs a block)
      grip?: float @ 0..1,                           // ground: 1 holds the line, low values drift; default 0.8
      lift_speed?: float @ 0..1,                     // air and hover: climbing speed; default 0.15
      takeoff_speed?: float @ 0..3,                  // air: below this the plane sinks; default half of max_speed
      floats?: boolean,                              // ground: floats on water like a boat; default false
    },
    seats?: [struct { offset: [float] @ 3, weapons?: [string] }] @ 1..8,  // the first seat drives; default one seat on top
    engine?: {
      fuel?: { items: [struct { item: #[id(registry="item", tags="allowed")] string, ticks: int @ 1.. }], capacity?: int @ 1.. },  // absent: no fuel needed
      sound?: #[id="sound_event"] string,            // engine loop, pitch rising with speed
      start_sound?: #[id="sound_event"] string,
      horn?: #[id="sound_event"] string,
    },
    health?: { max?: float @ 1..1024, repair?: [struct { item: string, amount: float }], explodes?: float @ 0..8, immune_to?: [#[id="damage_type", tags="required"] string] },
    weapons?: [VehicleWeapon],                       // D6
    turret?: { bone: string, pitch_bone?: string, yaw_limit?: [float] @ 2, pitch_limit?: [float] @ 2, turn_rate?: float @ 1..45, seat?: int },  // D7
    parts?: { wheels?: [string], wheel_radius?: float, steering?: [string], rotors?: [string], propellers?: [string] },  // bones the renderer turns (D10)
    storage?: { rows: int @ 1..6 },                  // D9
    item?: { name?: string, model?: #[id="model"] string, texture?: #[id="texture"] string, places_on?: ("ground" | "water" | "any") },
    pick_up?: boolean,                               // sneak-hit gives the item back with fuel, damage, ammunition and paint; default true
    ram_damage?: { damage: float, min_speed?: float },  // living entities in the way; default none
    camera?: { distance?: float @ 1..32 },           // third-person distance while seated (D8)
    exhaust?: { particle: #[id="particle_type"] string, offset: [float] @ 3, every_ticks?: int @ 1.. },  // client only, while the engine runs
    hud?: boolean,                                   // the built-in dashboard (ADR 0089 D5); default true
    events?: { [string]: [Action] },
    on_place?: string, on_mount?: string, on_dismount?: string, on_destroy?: string, on_tick?: struct { event: string, interval?: int },
  }
  ```

  The element in the app is the same shape plus editor-only fields. It lowers to the definition, the vehicle item's item model definition (`assets/<ns>/items/<path>.json`), lang keys for the entity and its item, and nothing in vanilla data except recipes the user adds.
- **D3 Movement modes, our own physics, written from this ADR.** One pure class `VehiclePhysics` (no Minecraft classes: input, state and constants in, velocity and yaw out), used on whichever side moves the vehicle, with a cross-language golden (`fixtures/vehicle-physics/golden.json`) shared with the Try it simulation (ADR 0091 D6):
  - `ground` (car, tank, kart): W accelerates forwards, S brakes then reverses, A/D turn at `turn_rate` scaled by speed (or in place with `turns_in_place`), `grip` blends the velocity towards the facing; gravity; steps up `step_height`; on water it sinks unless `floats`. Default `max_speed` 0.4 (8 blocks a second), acceleration 0.02, turn rate 5.
  - `water` (motorboat, raft, ship): moves on the water surface only, floating at the waterline as a boat does; on land it barely moves (one tenth of speed). Default `max_speed` 0.35, turn rate 4.
  - `amphibious`: `ground` on land, `water` on water.
  - `air` (plane): W adds throttle, S takes it away; the nose follows the driver's view (yaw and pitch at `turn_rate`); below `takeoff_speed` it sinks with gravity; on the ground it rolls as `ground` without turning in place. Default `max_speed` 1.2, turn rate 3.
  - `hover` (helicopter, drone, hovercraft above ground): W/A/S/D move relative to the vehicle's facing, which follows the driver's view yaw; jump climbs at `lift_speed`; the "Vehicle: descend" key (ADR 0088 D5) sinks; with neither it holds its height; without fuel it sinks slowly. Default `max_speed` 0.5.
  - No `rail` mode in this batch (limit V3): following rails is vanilla minecart behaviour, a large body of game code we do not rebuild; a project minecart type is a follow-up with custom boat types (ADR 0067 D11).
  The constants are named in one file with a comment that they are MSM's own, chosen to feel close to vanilla boats and horses, not copied.
- **D4 Who moves the vehicle (vanilla's model).** With a controlling player, the driver's client moves the vehicle: `MsmVehicle.tick` runs `VehiclePhysics` when `isLocalInstanceAuthoritative()` is true and otherwise interpolates through the `InterpolationHandler`, as vanilla's vehicles do; vanilla's move-vehicle packet carries the result and `handleMoveVehicle` checks it. Without a controlling player (parked, coasting, sinking, falling) the server moves it. The format caps `max_speed` at 3 blocks a tick, a third of vanilla's 10-block check, so legal vehicles are never snapped back (B406 measures the "moved wrongly" behaviour at the cap). Everything that is not position is server-authoritative: fuel, damage, ammunition, cooldowns, weapons, storage, seats, paint and events. The driver's input reaches the server through vanilla's `ServerPlayer.getLastClientInput()` (used for the synched steering and throttle that drive wheel and rotor animation for other players) and the runtime keys of ADR 0088 D5; the server never reads a position from our own payloads. **Fallback (reserve brief B433):** if B406 finds that vanilla does not send or accept move-vehicle packets for a custom `VehicleEntity`, or the feel is unusable, the server moves every vehicle from `getLastClientInput()` and all clients interpolate; that costs one round trip of input delay and is recorded as a limit.
- **D5 Placing, picking up, breaking.** Each vehicle registers an item `MsmVehicleItem` under the same id as its entity type, as vanilla does for `minecraft:oak_boat` (item and entity type registries are separate, so one id names both). Using it on a block (or water for `places_on: water`, raycasting fluids as vanilla's boat item does) spawns the vehicle facing the player's look, fires `on_place` and uses up the item outside creative. **Picking up:** a sneaking player hitting an empty vehicle with `pick_up` gets the item back with the vehicle's fuel, damage, ammunition, paint and custom name in `minecraft:custom_data` under `msm_vehicle` (read only by our item; vanilla's `entity_data` is not used because of its operator rules, verify at implementation); storage must be empty (or its contents drop). **Breaking:** other hits add damage (D9); creative players break it at once (vanilla's rule for vehicles).
- **D6 Weapons.**

  ```
  struct VehicleWeapon {
    id: string,                                      // unique in the vehicle
    key?: ("fire" | "second"),                       // which runtime key fires it; default fire
    projectile: #[id="item"] string,                 // arrows, a vanilla projectile item (target fact), or a project item with msm:throwable
    speed?: float @ 0.1..5, inaccuracy?: float @ 0..20, damage?: float @ 0..,  // as msm:ranged_attack (ADR 0070 D4)
    cooldown_ticks?: int @ 1..1200,                  // default 20
    automatic?: boolean,                             // fires while held at the cooldown; default false
    ammo?: { item: #[id(registry="item", tags="allowed")] string, per_shot?: int @ 1.., capacity?: int @ 1.. },  // absent: endless
    muzzle?: { bone?: string, offset: [float] @ 3 }, // where the projectile starts; with a turret it turns with it
    sound?: #[id="sound_event"] string,
    recoil?: float @ 0..1,                           // pushes the vehicle back a little
    on_fire?: string,                                // event; self = the vehicle, player = the shooter
  }
  ```

  The fire key (ADR 0088 D5) sends a press to the server; the server checks that the sender sits in a seat whose `weapons` list (default: every weapon for the driver's seat) has a weapon on that key, the cooldown and the ammunition, then spawns the projectile from the muzzle along the turret's aim (D7) with the shooter as owner, so kills and advancements credit the player. Projectile creation is shared with mobs: `MobRanged`'s choice between arrows, vanilla `ProjectileItem`s and project throwables moves into a shared `registry/projectile/Projectiles` used by both. Ammunition is loaded by using the ammunition item on the vehicle (seated or not) up to `capacity`. A new format action `explode { power, fire?: boolean, breaks_blocks?: boolean, at?: "self" | "other" }` (default breaks no blocks) lets a shell's `on_hit_block` and a vehicle's `health.explodes` make explosions without scripts; Rules' explosion step becomes a plain step.
- **D7 Turret.** `turret.bone` turns in yaw and `pitch_bone` in pitch to follow the look of the player in `seat` (default the driver), limited by `yaw_limit` relative to the hull and `pitch_limit`, at most `turn_rate` degrees a tick (default 6). The server computes the angles each tick from the player's rotation as it knows it and stores them in two synched floats; the gunner's own client computes the same angles from its local look every frame for a smooth view, and every other client draws the synched values with interpolation. Weapons whose `muzzle.bone` is the turret or barrel aim along it; others aim along the hull. Turning the hull does not turn the turret's aim (the tank-game rule), within the limits.
- **D8 Camera.** Vanilla's first and third person views. `camera.distance` sets the third-person distance while seated through a transient `CAMERA_DISTANCE` modifier on the seated player (added on mount, removed on dismount; whether the camera reads the player's or the vehicle's attribute is measured in B406, and if neither works the field is dropped with a limit). No custom camera modes, shake or zoom in this batch (limit V8).
- **D9 Health, repair, storage, fuel.** Damage counts up in `VehicleEntity`'s synched damage; at `health.max` (default 40) the vehicle is destroyed: `on_destroy` fires, an explosion of `explodes` power happens if set, passengers are dismounted, storage contents and the item (unless destroyed by an explosion or fire, verify vanilla's boat rule at implementation) drop. Damage does not heal by itself; using a `repair` item takes away `amount` damage. `immune_to` lists damage types or tags the vehicle ignores (default: none; drowning and suffocation cannot apply to a non-living vehicle anyway). `storage` gives a vanilla chest menu of `rows` rows (vanilla's chest boat interface `HasCustomInventoryScreen`, so the inventory key opens it from a seat, verify at implementation; a sneak-use opens it from outside), saved with the vehicle and dropped on destroy; hoppers do not reach it (limit V9). Fuel: using a fuel item on the vehicle adds its `ticks` up to `capacity` (default 10 times the largest item); the engine burns one tick of fuel per tick while the driver gives throttle; without fuel there is no thrust (it coasts, floats or sinks).
- **D10 The client renderer: the runtime's own, never GeckoLib.** `client/vehicle/MsmVehicleRenderer extends EntityRenderer` builds the model with ADR 0072's `GeoModelBaker` (the same baked `ModelPart` tree and cross-language golden as mobs), plays `idle` and `moving` keyframes through `GeoAnimationBaker` (Molang as 0, linear easing: ADR 0072 D3's subset), and turns named bones each frame: `turret.bone` and `pitch_bone` from D7, `parts.wheels` by the distance travelled over `wheel_radius`, `parts.steering` by the synched steering, `parts.rotors` and `propellers` by throttle. It draws the hurt wobble of `VehicleEntity` as boats do and the paint (D12) as a texture swap. Vehicles work on 26.4 and without GeckoLib for this reason; ejected projects are out of scope (ADR 0088 D10). The engine sound is a client loop whose pitch and volume follow speed (a tickable sound instance on the client of each nearby player); the horn and weapon sounds are played by the server to everyone but the shooter, whose client plays them at once (vanilla's pattern for predicted sounds); exhaust particles are spawned on each client while the synched throttle is on.
- **D11 Events, scripts and Rules.** Events `on_place`, `on_mount`, `on_dismount`, `on_destroy`, `on_tick` and each weapon's `on_fire` (self = the vehicle; player = who placed, mounted, left, shot or destroyed it). Script API 1.5 (ADR 0089 D8) adds `Entity.vehicle`, `Entity.passengers`, `Entity.isVehicle` and the `Vehicle` members and events. Rules gains the subject kind "vehicle" with triggers "When a player gets in <vehicle>", "gets out", "When <vehicle> fires", "When <vehicle> is destroyed", "Every N seconds while <vehicle> is driven", and the values of ADR 0089 D7.
- **D12 Paint.** `model.paints` lists textures; using a paint's `dye` item on the vehicle switches to it (a synched byte, saved and kept in the item when picked up). Paint is the only customisation in this batch (limit V10: no upgrades or parts).
- **D13 Versions.** Shared code: `VehicleEntity`, the `Entity` members of the Context, `EntityRenderer`, the attributes and `EntityType.spawn` are identical on both versions; `lerpPositionAndRotationStep` is never used. Registration of the renderer goes through the existing `EntityRendererRegistration` seam. Plugin API 1.16.0 (ADR 0088 D9) adds `TargetFacts.vehicles?: VehicleFacts { modes: readonly string[]; maxSpeed: number }` (the cap from D4) beside the projectile items already in `TargetFacts.entities`.
- **D14 Vanilla packs.** Vehicles need the Fabric mod jar. A vanilla pack leaves vehicle definitions out (they are `msm` layer files) and, through [ADR 0066](0066-vanilla-pack-safety.md), every data file naming a vehicle's item or entity id (recipes, loot, tags, advancements); vehicle ids join the host's mod-only ids. Info `vehicles.needs-jar` on vanilla pack exports.
- **D15 Not in this batch (limits).** Rail vehicles; trailers and coupling; several drivers or a gunner steering; upgrades and parts; fluids as fuel (no fluids exist); wind and sails; hopper access to storage; vehicles carrying mobs as passengers by bumping (vanilla boats pick up mobs; ours only take players, verify that this needs no override); damage numbers by part; a vehicle's own collision shapes beyond its box; chunk loading for fast vehicles (they move into unloaded chunks as players do, limit V7); ejecting vehicles (ADR 0088 D10); custom boat and raft types of a wood set (vanilla `Boat` subclasses, follow-up of ADR 0067 D11).

## Consequences

- MSM can make tanks, cars, planes, helicopters and boats as their own kind, with keys, a dashboard and weapons, on both targets and without GeckoLib.
- The runtime gains its first non-living entity class, its first client-moved entity of its own and a shared projectile helper.
- A modified client can drive a vehicle up to vanilla's movement check, as with vanilla boats (limit V1).
- Rideable mobs keep their meaning; a later "Turn this mount into a vehicle" helper is possible but not planned.

## Status

Proposed (2026-11-14). Nothing after B406 starts before its go. Defaults the user may veto: a direct `msm:vehicle` kind on `VehicleEntity` rather than a mob-route Creator flow first (D1); the field names and every default of D2 and D3 (boat-sized hitbox, the speeds and turn rates, `step_height` 1, grip 0.8); five modes and no rail mode (D3); vanilla's client-moved model with a 3-block-a-tick cap, and the server-moved fallback only if B406 fails (D4); one id for the vehicle and its item, sneak-hit to pick up, `custom_data` for the kept state (D5); the runtime keys fire and second, server-side cooldowns, ammunition loaded by using the item, the `explode` action breaking no blocks by default (D6); turret limits and 6 degrees a tick, the hull not turning the aim (D7); camera distance by attribute modifier (D8); health 40, no self-healing, drops on destroy, the chest menu for storage (D9); our own renderer only, no GeckoLib for vehicles (D10); the trigger names (D11); paint by dye items (D12).
