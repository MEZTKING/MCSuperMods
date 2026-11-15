# ADR 0098: Trader mobs, villager professions and job sites, mount storage and shoulder pets

## Context

The research report ranks trader mobs seventh among missing features ("a merchant menu on custom mobs using `villager_trade` and `trade_set`, custom professions and job-site POI types"; wandering merchants, tavern keepers, bounty rewards) and mount inventories and shoulder pets fifteenth (pack mules, pocket hamsters, parrot-like riders). [ADR 0060](0060-adding-to-vanilla-content.md) D5 made trades data (`minecraft:villager_trade`, `minecraft:trade_set` and their tags); [ADR 0071](0071-tameable-breedable-rideable-mobs-variants-and-boss-bars.md) D10 left out mount inventories; [ADR 0077](0077-custom-portal-blocks.md) found that POI types cannot be registered the same way on both versions.

Facts (plan F20–F26):

- `Merchant` is a public interface (offers, trading player, XP, `openTradingScreen` as a default method), `MerchantMenu(int, Inventory, Merchant)` and `MerchantOffer` (with `CODEC` and `STREAM_CODEC`) are public; `TradeSet.calculateNumberOfTrades(LootContext)` and `VillagerTrade.getOffer(LootContext)` are public, so a project mob can draw offers from data trade sets with vanilla's own rules. Which loot context parameters `getOffer` needs is open (S11). All identical on both versions.
- `VillagerProfession` is a record with a public constructor (name, held and acquirable job site predicates, requested items, secondary POI blocks, work sound, trade sets by level). `PoiType(Set<BlockState>, int, int)` is a public record, but registering one also fills a private state map; Fabric's `PoiHelper.register` exists for 26.3 only, and 26.4 changes `PoiTypes`' constants to holders (F23, ADR 0077).
- `HasCustomInventoryScreen.openCustomInventoryScreen(Player)` is public on both; whether the client sends the inventory key for a ridden mob that is not a horse is open (S13).
- Shoulder riders are stored on the player as `Optional<Parrot.Variant>` (left and right) on both versions, so only parrots can be shown on a shoulder without client code (F26). Any entity can ride another through `startRiding(Entity, boolean, boolean)`, and a passenger's place comes from `getVehicleAttachmentPoint(Entity)` and the vehicle's `getPassengerRidingPosition(Entity)`, both public and identical (F26).

## Decision

- **D1 Component `msm:trader` on `msm:entity`:**

  ```
  struct Trader {
    trade_sets: [TradeLevel] @ 1..5,       // level 1 first; each names a trade set (project or vanilla)
    levels?: boolean,                       // default true: trading gives XP and unlocks the next level, as villagers
    restock?: "twice_a_day" | "never",      // default "twice_a_day", at the mob, no workstation needed
    trade_sound?: #[id="sound_event"] string, // default minecraft:entity.villager.yes (a target fact)
    on_trade?: string,                      // event; self = the mob, other = the player
  }
  struct TradeLevel { trade_set: #[id="trade_set"] string, xp_to_next?: int }   // defaults vanilla's thresholds
  ```

  Using the mob with an empty hand or any item that does not interact first (lead, name tag, saddle, spawn egg and food for breeding keep their meaning) opens vanilla's merchant menu through `Merchant` implemented by the runtime's `registry/mob/MobTrader` module on all three mob bases. Offers are drawn per level from the trade set with `TradeSet` and `VillagerTrade` (S11), saved on the mob with `MerchantOffers`' codec, with XP and level; babies, mobs that are angry or ridden, and monsters at night do not trade (a validator info on `monster` bases). The Mob Studio's Trader section writes the trade sets and their trades as ordinary ADR 0060 elements.
- **D2 Kind `msm:villager_profession`** (frozen), for vanilla villagers taking a project job:

  ```
  struct VillagerProfession {
    job_site: #[id="block"] string,          // a project block; a block that already has a POI type is refused
    trade_sets?: [string] @ 5,              // default <ns>:<path>/level_1 .. level_5, created by lowering with their tags
    work_sound?: #[id="sound_event"] string,
    requested_items?: [#[id="item"] string],
    secondary_job_blocks?: [#[id="block"] string],
  }
  ```

  The runtime registers one POI type for every state of the job site (seam `registry/PoiTypes` in `src/mc/<mc>/java`: Fabric's `PoiHelper` on 26.3; on 26.4 the approach S12 proves, reflection into the private registration in the way `Flammability` does it, or a Mixin if reflection cannot reach it, decided at B469) and the profession record; lowering adds the POI to `#minecraft:acquirable_job_site` (a mod-only tag entry, `required: false`), writes the five trade sets with tags `<ns>:<path>/level_<n>`, the lang name and the villager and zombie villager profession textures from the editor-only `textures` (`assets/<ns>/textures/entity/villager/profession/<path>.png` and the zombie villager's, where S12 shows the client looks).
- **D3 Component `msm:storage` on `msm:entity`** (mount inventories):

  ```
  struct Storage { rows?: int @ 1..6, needs_chest?: boolean, open_sound?: string, close_sound?: string }   // rows default 3; needs_chest default false
  ```

  The mob implements `HasCustomInventoryScreen` and opens vanilla's chest menu (rows) on the server when its rider presses the inventory key (S13) or when its owner (tameable) or anyone (not tameable) uses it while sneaking. With `needs_chest`, a chest used on the mob adds the storage and shows the vanilla chest-equip sound; the chest drops back with the contents when the mob dies. Contents are saved on the mob and dropped on death. Shared code with vehicles' storage (ADR 0090 D9) where both exist: `registry/mob/MobStorage` owns the menu; the vehicle batch reuses it.
- **D4 Component `msm:shoulder_riding` on tameable `animal` mobs** no wider than 0.7 blocks: a sitting-capable pet that, when its owner stands near and is not riding, jumps onto the owner and rides as a passenger at a shoulder offset (its own `getVehicleAttachmentPoint`), drawn by the mob's normal renderer (no client code, because vanilla's shoulder store holds parrots only). It leaves when the owner takes damage, sneaks, sleeps, rides, swims or flies with an elytra, and does not return for a cooldown (100 ticks). One shoulder pet per player (vetoable); a parrot keeps vanilla's own shoulder. If the spike (S13) finds a passenger on a player misplaced, shaking or lost on a dedicated server, the component is dropped from the batch before Wave 10 and recorded as a limit.
- **D5 Versions and eject.** Shared code except `registry/PoiTypes` (D2). Plugin API 1.18.0 (additive): `EntityFacts.tradeSounds?`, `EntityFacts.vanillaJobSites?` (blocks that already have POI types, for the D2 refusal), `EntityFacts.vanillaTradeSets?`. The 26.3 generator warns `export.not-in-eject` for the four components and the kind in this batch (vetoable; a follow-up).
- **D6 Not in this batch (limits).** Gossip, reputation, price changes by reputation or Hero of the Village for project traders (vanilla brain code); custom villager types (biome looks); trader mobs restocking at a workstation; wandering-trader-style despawning and llamas; project professions for zombie villagers being cured into them beyond the texture; hopper access to mount storage; more than one shoulder pet; shoulder pets that are not `animal` base; storage on vehicles is ADR 0090's.

## Consequences

- Trades stay data: a trader's offers change with `/reload` for offers drawn after it (already drawn offers are saved on the mob, as vanilla villagers').
- One more seam (`PoiTypes`) and the risk the 26.4 route carries; B469 settles it before any runtime brief.
- Mob Studio sections grow by three; the Pet, Mount and new Wandering merchant and Village job flows use them ([ADR 0101](0101-vanilla-parity-2-flows-studios-try-it-and-tests.md)).

## Status

Proposed (2026-11-14). Nothing after B469 starts before its notes settle S11–S13. Defaults the user may veto: a component on any mob base with vanilla's merchant menu (D1); levels on and restocking twice a day without a workstation (D1); a profession kind with a project job site only, and textures by convention (D2); storage opened by the inventory key and by sneak-use, 3 rows by default (D3); shoulder pets as passengers, one per player, and dropping them if the spike fails (D4); no eject for this ADR's features yet (D5).

## Amendment after the spike (B469, 2026-11-15)

- **D2 on 26.4:** settled. `registry/PoiTypes` uses Fabric's `PoiHelper` on 26.3 and reflection on the private `PoiTypes.register(ResourceKey, Set, int, int)` on 26.4; no Mixin, so reserve B487 and Q22 are closed. The runtime also refuses a job site when `PoiTypes.hasPoi(state)` is already true for any of its states, because vanilla's own duplicate check fires only after it has replaced the mapping. Lowering writes the `#minecraft:acquirable_job_site` entry (without it vanilla villagers never take the job) and all five level trade sets (missing ones fail silently). The name key is `entity.<ns>.villager.<path>`.
- **D1:** vanilla trade sets whose trades carry a `merchant_predicate` on villager variants give a project mob no offers (armourer level 5: none; librarian books and cartographer maps drop out). A validator warns about them (`EntityFacts.vanillaTradeSets` carries a villager-only flag). The runtime resends offers to an open screen after a level-up or restock.
- **D3:** confirmed as written.
- **D4 changed:** a shoulder pet is not a passenger. A player cannot be a vehicle on the server without reflection into `Entity.vehicle`, the owner's client must be sent the passengers by hand, and a riding pet is not saved. Instead the pet is **perched**: a synched and saved flag, and both sides place it at the owner's position plus the shoulder offset (`(-0.4, 1.35, 0)` turned by the body yaw; lower while sneaking) every tick, with no gravity, physics or pushing. It unperches (clearing `NoGravity` and no-physics) on the D4 events and also on a dimension change, a disconnect and the owner's death. Measured exact on the client on both versions; up to 0.063 blocks off on the server while turning.
