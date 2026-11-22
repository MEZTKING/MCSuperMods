# ADR 0107: Traders 2, villager homes and villager types

## Context

[ADR 0098](0098-traders-professions-mount-storage-and-shoulder-pets.md) gave any project mob vanilla's merchant screen (`msm:trader`: levels, restock twice a day, `on_trade`) and vanilla villagers project jobs (`msm:villager_profession`, a job site POI through the `PoiTypes` seam). It left out gossip, reputation, demand prices, discounts and workstation restocking for project traders ([ADR 0101](0101-vanilla-parity-2-flows-studios-try-it-and-tests.md) limit Q21), villagers sleeping in project beds (no home POI; ADR 0098 findings) and villager types of our own (fact H12: no registration anywhere). Vanilla has all of these: prices that rise when a player hurts a villager and fall after curing, prices that rise with demand and reset at restock, villagers restocking at their workstation, beds as homes, and seven biome types with their own look.

Vanilla's gossip is brain code that spreads between villagers; MSM's traders are not villagers and have no brain (ADR 0070). What a player sees from gossip is the price change.

## Decision

- **D1 Reputation on project traders.** `msm:trader` gains `reputation?: { hurt?: int, trade?: int, gift_item?: string, gift?: int, decay_per_day?: int, price_step?: int }` (defaults chosen by observation of vanilla's price changes in the spike, X15; verify at implementation): a per-trader, per-player value of our own, saved with the mob, raised by trades and gifts and lowered by hurting it, turned into each offer's special price so the vanilla screen shows the changed price. It does not spread to other mobs (limit N10).
- **D2 Demand.** `msm:trader` gains `demand?: boolean` (default true, as vanilla villagers): vanilla's demand rule on each offer (the price rises after heavy trading and settles at restock), through `MerchantOffer`'s own demand fields (X16).
- **D3 Restocking at a work site.** `msm:trader` gains `work_site?: string` (a block id or tag): when given, the trader walks to the nearest such block within 16 blocks and restocks there (twice a day, as vanilla), instead of restocking in place (X17).
- **D4 Project beds as homes.** Villagers claim and sleep in project beds. If vanilla's home POI matches every block in `#minecraft:beds` (X18), the bed type already joining that tag is enough; else the bed's states are registered as a home POI through the `PoiTypes` seam (26.3 Fabric helper, 26.4 reflection, ADR 0098 D2).
- **D5 Villager types.** A new kind `msm:villager_type` (frozen): `biomes` (biome ids or tags where villagers of this type spawn and are born), editor-only pictures for the villager and zombie villager type layers (lowered to vanilla's resource paths), lang. The runtime registers the type at start and maps its biomes; vanilla's renderers draw it from the resource pack with no client code (X19). No trades per type (limit N11, as vanilla).
- **D6 Target facts.** Plugin API 1.20.0: `EntityFacts.villagerTypes` (vanilla's seven, so a project type's id cannot clash and the Studio lists them).

## Consequences

- Project traders behave like villagers in price; vanilla villagers gain project homes and looks.
- Two new saved values on trader mobs (reputation per player, demand per offer); removing `msm:trader` drops them (as ADR 0098's levels).
- One more frozen registry (villager types; limit N1).

## Amendment after the spike (B524, 2026-11-22)

Measured on both versions (evidence in `docs/reference/spikes/b524/`); these win over D1 to D5 where they differ.

- **D1 reputation: go.** A special price set on a project offer reaches the menu, the offers packet and the client's screen. Cost = clamp(base + demand part + special, 1, stack size). Vanilla's measured numbers are the defaults: a hit -25, a trade +2 (cap 25), a gift +25 (cap 25); daily decay 20 for negative and 2 for trading; special price = -floor(reputation x price multiplier). The store is a persistent Fabric attachment per mob, `Map<UUID, Integer>`. The runtime recomputes special prices per player at every menu open and resets them at close (vanilla resets; the runtime does not today).
- **D2 demand: go.** `updateDemand()` before `resetUses()` at each restock gives vanilla's rule (demand may go negative); price rise = max(0, floor(base x demand x multiplier)); demand is saved and synced.
- **D3 work site: go.** A goal searching 16 blocks, walking to the site and restocking within 2 blocks.
- **D4 changed: joining `#minecraft:beds` is not enough.** A project bed becomes a home only when its head states map to vanilla's `home` POI type in `PoiTypes.TYPE_BY_STATE` (a mutable map, set by reflection through the `PoiTypes` seam on both versions, before any world loads; the holder taken from vanilla's red bed head). A villager then claims it and sleeps in it.
- **D5 villager types: go.** Registered in `BuiltInRegistries.VILLAGER_TYPE`, biomes added to the mutable `VillagerType.BY_BIOME` by reflection (warn once if the field is missing); vanilla draws `<ns>:textures/entity/villager/type/<path>.png` and `zombie_villager/type/<path>.png` with no client code.

## Status

Proposed (2026-11-22). Vetoable defaults: our own reputation rather than vanilla's gossip; demand on by default; restocking at a work site only when one is named; the villager type's pictures lowered to vanilla's paths.
