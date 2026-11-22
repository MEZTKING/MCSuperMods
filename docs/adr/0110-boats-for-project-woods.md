# ADR 0110: Boats and chest boats for project woods

## Context

Every vanilla wood has a boat and a chest boat (bamboo a raft). The Wood set flow ([ADR 0069](0069-block-family-flows.md)) makes logs, planks, slabs, stairs, doors, signs and the rest, but no boat; the coverage audit lists boats under "client, L3" because each boat entity type needs a renderer. The vehicles batch ([ADR 0090](0090-vehicles.md)) has its own vehicle kind with its own renderer, which is not a vanilla boat (no paddles, no vanilla handling). Vanilla draws boats with one renderer class per entity type over a model layer and a texture named after the wood; registering that renderer for a project boat may be a line of client registration rather than rendering work of our own (spike question X24).

## Decision

- **D1 Boats as an item component.** `msm:item` gains `msm:boat { chest?: boolean, raft?: boolean, wood_texture? }`: the runtime registers the entity type `<path>` (and with `chest` the companion item and type `<path>_chest_boat`; limit N2), vanilla's boat or chest boat behaviour (paddling, water and ice handling, two seats, the chest boat's menu), and the item that places it. The Wood set flow's "Has boats" answer adds both items, their recipes as vanilla's, the `#minecraft:boats` and `#minecraft:chest_boats` tags and the entity textures drawn by the art generator.
- **D2 Drawing.** The client registers vanilla's boat renderer for each project boat type through the `EntityRendererRegistration` seam with the project texture. No renderer of our own.
- **D3 Gate.** If the spike (B524) finds that vanilla's renderer cannot draw a project boat with only that registration on either version, boats move to the next client batch (reserve B545): the component stays unoffered and the guide says so (limit N19).
- **D4 Fabric mod jar only**; vanilla packs leave the items out (ADR 0066).

## Consequences

- Wood sets become complete with boats on both versions, if X24 allows.
- The runtime gains its first use of a vanilla entity renderer for a project type.

## Amendment after the spike (B524, 2026-11-22)

**Go on both versions (B524, X24; evidence in `docs/reference/spikes/b524/`).** Vanilla's `Boat` and `ChestBoat` with a `BoatItem`, the oak boat's size (1.375 x 0.5625, eye 0.5625, tracking 10), and on the client a model layer `<ns>:boat/<path>#main` (and `chest_boat/<path>`) registered through Fabric's `ModelLayerRegistry` with vanilla's `BoatRenderer`, draw and ride a project boat exactly as vanilla's; textures `<ns>:textures/entity/boat/<path>.png` (128 x 64) and `chest_boat/<path>.png` (128 x 128), drawn by the art generator. No version seam. B536 runs; reserve B545 is not needed. Dispenser behaviour is to check at implementation.

## Status

Proposed (2026-11-22). Vetoable defaults: a component on items rather than a kind; chest boats by default with the Wood set's "Has boats" answer; rafts only when asked.
