# ADR 0071: Tameable, breedable and rideable mobs, variants and boss bars

## Context

[ADR 0070](0070-mob-bodies-movement-and-ranged-attacks.md) gives `msm:entity` a vanilla base class (`mob`, `animal`, `monster`), movement modes and ranged attacks. The rest of coverage audit backlog B7 is pets, farm animals with babies, mounts, texture variants and boss bars. The audit's section 2.3 names the class of limit to design for: anything the client simulates or draws must reach it explicitly (the "velocity problem" of ADR 0052).

Facts read on 2026-11-14 with `javap` over the 26.3 and 26.4-snapshot-7 merged jars (fact table F1, F2, F3, F9, F10, F11, F17 in the Findings of [ADR 0070](0070-mob-bodies-movement-and-ranged-attacks.md)):

- **Taming** is `TamableAnimal`: `tame(Player)`, `isTame`, `setOwner`, `isOwnedBy`, `isOrderedToSit`/`setOrderedToSit`, `isInSittingPose`, `tryToTeleportToOwner`, `canFlyToOwner()` (protected), synched `DATA_FLAGS_ID` and `DATA_OWNERUUID_ID`, taming particles through entity events; goals `FollowOwnerGoal(TamableAnimal, double, float, float)`, `SitWhenOrderedToGoal`, `OwnerHurtByTargetGoal`, `OwnerHurtTargetGoal`. Identical on both versions.
- **Breeding and babies** are `Animal` and `AgeableMob`: `isFood(ItemStack)` and `getBreedOffspring(ServerLevel, AgeableMob)` abstract, `Animal.mobInteract` feeds (love mode for adults, growth for babies), `BreedGoal(Animal, double)`, `FollowParentGoal(Animal, double)`, `getAge`/`setAge`, `ageUp`, `isBaby` and `setBaby` (synched), `getAgeScale()` public, `BABY_START_AGE`; spawn eggs used on an adult of the same type spawn a baby. `canBeABaby` is protected on 26.3 and public on 26.4; `setAgeLocked` is protected on 26.3 and public on 26.4.
- **Riding.** `getControllingPassenger()`, `tickRidden(Player, Vec3)`, `getRiddenInput(Player, Vec3)`, `getRiddenSpeed(Player)`, `positionRider`, `getPassengerAttachmentPoint` and `PlayerRideableJumping` (`onPlayerJump`, `canJump`, `handleStartJump`, `handleStopJump`) are identical on both versions. A player-controlled vehicle is moved by the controlling player's client, which sends its position to the server. The saddle is an equipment slot (`EquipmentSlot.SADDLE`, `Mob.isSaddled`, `LivingEntity.canUseSlot`), and the vanilla saddle item equips only entities in `#minecraft:can_equip_saddle` (present in both jars). The happy ghast steers from the rider's `xxa`, `zza`, pitch and `isJumping`. On 26.4 `ItemSteerable` extends a new `Saddleable` interface (absent on 26.3), and `Equippable`'s constructor changed its sound parameters.
- **Synched data.** `SynchedEntityData.defineId(Class, EntityDataSerializer)` and the 44 serializers are the same on both versions; `Mob.isAggressive` is already synched.
- **Boss bars.** `ServerBossEvent(UUID, Component, BossBarColor, BossBarOverlay)` with `addPlayer`, `removePlayer`, `setProgress`, `setName`, `setVisible`, `setDarkenScreen`, `setPlayBossMusic`, `setCreateWorldFog`; colours `PINK, BLUE, RED, GREEN, YELLOW, PURPLE, WHITE`; overlays `PROGRESS, NOTCHED_6, NOTCHED_10, NOTCHED_12, NOTCHED_20`. Identical on both versions. The wither adds players in `startSeenByPlayer` and removes them in `stopSeenByPlayer`.

## Decision

- **D1 `msm:tameable`** (needs `base: "animal"`):

  ```
  struct Tameable {
    items: [#[id(registry="item", tags="allowed")] string],  // taming food
    chance?: float @ 0..1,            // per item; default 0.33 (a wolf's bone)
    sit?: boolean,                    // the owner's right click toggles sitting; default true
    follows_owner?: boolean,          // FollowOwnerGoal; default true
    follow?: struct { speed?: float, start_distance?: float, stop_distance?: float },  // default 1.0, 10, 2 (a wolf's)
    defends_owner?: boolean,          // OwnerHurtByTarget and OwnerHurtTarget goals; default true
    tamed_health?: float @ 1..,       // max health once tamed; absent keeps msm:health
    on_tame?: string,                 // event; player = the new owner
  }
  ```

  Taming is vanilla's: the item is used up (not in creative), success shows hearts, failure smoke; tamed mobs teleport to an owner who is far away (flying mobs when `mode` is `fly`, through `canFlyToOwner`), do not despawn, and drop nothing extra. A tamed mob's `mobInteract` order: breeding food (vanilla), then the owner's sit toggle, then mounting (D3), then `msm:on_interact`.
- **D2 `msm:breedable`** (needs `base: "animal"`):

  ```
  struct Breedable {
    items: [#[id(registry="item", tags="allowed")] string],  // breeding food; feeding a baby grows it (vanilla)
    baby_scale?: float @ 0.1..1,      // default 0.5
    grow_up_ticks?: int @ 1..,        // default 24000 (a vanilla baby's 20 minutes)
    tempted?: boolean,                // adds TemptGoal with the items; default true
    follow_parents?: boolean,         // adds FollowParentGoal; default true
    on_breed?: string,                // event on the baby's birth; self = the baby, player = who bred them
  }
  ```

  `isFood` reads `items`; `getBreedOffspring` creates the same type (breeding with other types is not offered); `BreedGoal` and `FollowParentGoal` are added; `getAgeScale` returns `baby_scale` for babies, which scales the hitbox and the vanilla renderer. A baby takes a random parent's variant (D4). Natural spawns and spawn eggs make adults; a spawn egg on an adult makes a baby (vanilla).
- **D3 `msm:rideable`** (any base):

  ```
  struct Rideable {
    saddle?: boolean,                 // needs a vanilla saddle; default true
    controlled_by?: ("anyone" | "owner"),  // owner needs msm:tameable; default anyone
    speed?: float @ 0..,              // ridden speed as a factor of movement speed; default 1
    jump?: float @ 0..,               // jump strength (the jump_strength attribute); 0 = no jump; default 0
    passengers?: int @ 1..4,          // default 1
    rider_offset?: [float] @ 3,       // seat position in blocks from the mob's feet; default on top of the hitbox
    saddle_bone?: string,             // a model bone shown only while saddled
    on_mount?: string,                // event; player = the rider
  }
  ```

  The first passenger controls the mob when it is saddled (or `saddle` is false) and allowed by `controlled_by`. Input: forward and strafe from the rider, the mob faces the rider's view; `walk` and `amphibious` mobs jump with a jump bar through `PlayerRideableJumping` when `jump` is above 0; `fly` mobs fly along the rider's view and rise while jump is held (as the happy ghast); `swim` mobs follow the rider's view under water. With `saddle` true, lowering adds the entity to `#minecraft:can_equip_saddle` (D7), so the vanilla saddle equips it, shears take it off and it drops on death as for pigs (confirmed at implementation). We never implement `ItemSteerable` (26.4 changed it) and never construct `Equippable`. Empty-hand right click mounts; sneaking dismounts (vanilla).
- **D4 `msm:variants`**:

  ```
  struct Variants {
    choose?: ("random" | "biome"),    // default random
    variants: [struct Variant {
      id: string,                     // saved in the mob's data as Variant
      texture: #[id="texture"] string,
      weight?: int @ 1..,             // default 1
      biomes?: [#[id(registry="worldgen/biome", tags="allowed")] string],  // biome: where it is picked
    }] @ 1..32,
  }
  ```

  The variant is an index in synched data (`DATA_VARIANT`, an int defined once per driver class), saved as the variant's `id` string under `Variant` (so `/summon <id> ~ ~ ~ {Variant:"red"}` and `/data` work, and reordering the list does not repaint saved mobs; an unknown saved id falls back to the first). Picked in `finalizeSpawn`: `biome` filters by the spawn position's biome (variants without `biomes` are the fallback pool), then a weighted random pick. Both renderers draw the variant's texture in place of `msm:animated_model.texture`. Only textures vary in this version.
- **D5 `msm:boss_bar`**:

  ```
  struct BossBar {
    colour?: ("pink" | "blue" | "red" | "green" | "yellow" | "purple" | "white"),  // default purple
    overlay?: ("progress" | "notched_6" | "notched_10" | "notched_12" | "notched_20"),  // default progress
    darken_sky?: boolean, fog?: boolean, music?: boolean,  // default false
    range?: float @ 8..256,           // blocks; absent: every player tracking the mob
  }
  ```

  One `ServerBossEvent` per mob, named by the mob's custom name or display name, progress = health / max health; players are added in `startSeenByPlayer` and removed in `stopSeenByPlayer` and on death and removal; with `range`, players are added and removed by distance every 10 ticks. A boss mob does not despawn, and the entity type's client tracking range becomes 10 chunks (the wither's). These bars are separate from the scripts' boss bars of ADR 0065 (no per-namespace limit).
- **D6 Animations for states.** `msm:animated_model` gains optional animation names `sit` (sitting pose), `fly` (moving in the air), `swim` (moving in water) and `shoot` (played once per shot of D4 of ADR 0070, on the triggered controller). The main loop picks `sit`, then `fly` or `swim` when moving in that medium, then `walk` or `idle`. Babies play the adult's animations at their scale. Both renderers follow the same rule ([ADR 0072](0072-vanilla-model-renderer.md)).
- **D7 Lowering and vanilla pack safety.** Lowering writes `data/minecraft/tags/entity_type/can_equip_saddle.json` (`merge: 'tag'`, the tag name from `TargetFacts.entities.saddleTag`) for rideable mobs with a saddle, and nothing else new: the components pass through to `msm/`, variant textures are ordinary assets. The entity id is mod-only, so [ADR 0066](0066-vanilla-pack-safety.md) turns that tag entry into `required: false` in vanilla data packs, which then load on vanilla servers; no new rule is needed. CI's library vanilla server check covers the new starters and examples automatically.
- **D8 Versions.** Shared code. We avoid every signature that differs (D1 to D3 above). If 26.4 renames the saddle tag, only the target fact changes.
- **D9 Java eject (26.3 generator).** The generated entity classes carry the same overrides and goals, the variant synched data and `Variant` save field, the boss event, the saddle tag file (copied as data) and, for GeckoLib, the variant texture in the generated model class.
- **D10 Not in this batch (limits).** Horse-style taming by riding, chests on mounts and mount inventories (needs a menu), mount armour slots on custom mobs, item-on-a-stick steering (`ItemSteerable` changed on 26.4), several riders steering, breeding between two types and hybrid babies, variants that change the model or size, script API members for owners, ages and variants (a follow-up of the script API), boss phases (use `msm:on_hurt` events with `run_function`), and boss music other than vanilla's (`music` sets vanilla's boss music flag, which plays only in the End).

## Consequences

- Format 1 grows additively by five components and four animation names; the corpus (prefix `entity-mx-`), Codecs, plugin, generator and app move together.
- Every value the client needs to draw or steer a mob reaches it through vanilla's own synched data (age, tame flags, saddle slot, aggressive flag) or the two runtime accessors (`DATA_VARIANT`, `DATA_ANIM` of ADR 0072); the limits in ADR 0070's Findings list the cases where client and server can still disagree.
- Rideable mobs are moved by the rider's client. Server-side actions that move a ridden mob (`launch`, teleports) are an in-game check; ADR 0070's Findings record this as limit M2.
- A project using any of these needs the runtime release that ships this.

## Findings

Recorded at close (2026-11-14) from B286, B292–B294, B296, B301, B306 and the tame-before-breed fix (7d9cbbe):

- **Tame before breed.** A tameable animal breeds only once tamed, as vanilla wolves and cats do: a wild one gets no love mode (`isFood` is false and breeding food is not used up), its taming food is handled first (a food that both tames and breeds tames), a wild baby still grows on breeding food, a pair with a wild tameable parent is refused, and bred babies of tamed parents take the owner and `tamed_health` (`MobTaming.adoptFrom`). The `mobInteract` order is breeding, taming, riding, `msm:on_interact`, then vanilla (D1 amended). An override of `canMate` in the bodies, so `BreedGoal` never walks two wild pets together, is a follow-up.
- **Breeding.** `Animal.canMate` compares only `getClass()`, so the runtime refuses different mob types itself; `FollowParentGoal` finds parents by class, so a baby may follow another runtime animal type (limit). Babies scale by `baby_scale`, hitbox included; bred and spawn-egg babies start at `-grow_up_ticks` (`getBabyStartAge`); `inheritFrom` passes a parent's variant.
- **Pets.** Sit toggles on the owner's empty main hand; `FollowOwnerGoal` is added only for ground or flying navigation, so swim pets do not follow (limit); `wantsToAttack` is the wolf's. On a pet that is also rideable an empty-hand owner click mounts and sitting toggles only while sneaking.
- **Riding.** Seats sit at `rider_offset` times the mob's scale, extra seats 0.7 blocks behind; ridden speed is `movement_speed` times `speed`; walking mounts steer as a horse, fliers as the happy ghast, swimmers along the view; the jump bar is offered for `walk` and `amphibious` only. Saddles drop on death and shear off as for pigs (D3 confirmed). `on_mount` fires only on a right-click mount: `/ride` does not fire it (an `addPassenger` hook in the bodies is a follow-up). Mount fall damage is not reduced as a horse's (follow-up). The vehicle check is in ADR 0070's Findings (M1).
- **Variants.** Picked in `finalizeSpawn` (weighted random, or by biome with the fallback pool), saved as the id under `Variant`, an unknown id falls back to the first; renderers read `driver().variants().texture()` before `msm:animated_model.texture`.
- **Boss bars.** One `ServerBossEvent` per mob with health progress, players added by tracking or by `range` every 10 ticks; boss mobs never despawn. `setPlayBossMusic` plays boss music only in the End (vanilla's rule), so `music` does nothing elsewhere. A boss with `NoAI` does not tick its bar: forwarding `onSyncedDataUpdated` to `MobBossBar` is a follow-up. The parity test follows the bar by its add packet (`ParityBossBars`).
- **Eject (D9).** The 26.3 generator covers taming, breeding (with the tame-before-breed rules; the wild-parent check sits in `spawnChildFromBreeding` as in the runtime), riding (`PlayerRideableJumping`, seats, ridden input per mode), variants and boss bars; `mobInteract` runs `breedingInteract`, `tamingInteract`, `ridingInteract`, then `on_interact`. It is stricter than the runtime: taming or breeding on a non-animal base, unknown keys, out-of-range values and undeclared events fail generation. The sample creatures' 12 parity tests pass on the 26.3 content jar, the 26.3 ejected jar and the 26.4 content jar.

## Status

Accepted (2026-11-14). Defaults the user may veto: the component names `msm:tameable`, `msm:breedable`, `msm:rideable`, `msm:variants`, `msm:boss_bar`; a wolf's taming chance and follow distances (D1); baby scale 0.5 and 24000 ticks to grow up (D2); a saddle needed by default and anyone may ride (D3); variants saved by id under `Variant` (D4); purple progress bars seen by every player tracking the boss (D5).
