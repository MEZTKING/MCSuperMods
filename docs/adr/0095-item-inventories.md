# ADR 0095: Item inventories (backpacks and bundles)

## Context

The research report ranks "item inventories" fourth among missing features (`popular-mods.md` section 3: backpacks, pouches and quivers; the two backpack mods it surveyed have 43 million downloads together). Vanilla has the pieces: shulker box items and bundles carry their contents in item components (`minecraft:container`, `minecraft:bundle_contents`). [ADR 0074](0074-containers-and-block-entities.md) opened vanilla menus from blocks with no client code and kept a shulker crate's contents in the `container` component; it found that only vanilla's shulker box slot refuses items that cannot go inside container items, and that a slot class of our own needs a version seam (ADR 0074 F7: `Slot`'s constructor gains a `Slot.Section` on 26.4).

Facts (plan F19, both versions identical): `ItemContainerContents` (`MAX_SIZE`, `fromItems`, `copyInto`), `ChestMenu(MenuType, int, Inventory, Container, int)` public, `ShulkerBoxMenu(int, Inventory, Container)` public, `AbstractContainerMenu.clicked(int, int, ContainerInput, Player)`, `stillValid`, `removed` and `quickMoveStack` overridable, `BundleItem(Item.Properties)` public. A menu opened from a held item has a duplication risk vanilla blocks do not have: the item that holds the contents can move while the menu is open (number-key swap, off-hand swap, drop, death, creative pick), which open fact S10 measures.

## Decision

- **D1 An item component `msm:item_inventory`** on `msm:item`:

  ```
  struct ItemInventory {
    layout?: "chest" | "hopper" | "dispenser",   // default "chest"
    rows?: int @ 1..6,                          // chest only; default 3 (27 slots)
    open?: "use" | "sneak_use",                 // default "use": right-click in the air or on a block
    open_sound?: #[id="sound_event"] string,    // default the target's container sounds (ADR 0074 D7)
    close_sound?: #[id="sound_event"] string,
    on_open?: string,                           // event; self = other = the player
    on_close?: string,
  }
  ```

  The contents live in the stack's `minecraft:container` component, so they survive dropping, chests, the player's death drop and server restarts as vanilla stacks do, and vanilla tooltips list them. `max_stack_size` is forced to 1 (a validator error if the item sets more). The item is not allowed with `msm:on_use` `cancel`-style uses that conflict (`on_use` still fires after the menu opens) or with tool, weapon, food or consumable components (`blocks-items.component-conflict`).
- **D2 Menus.** 27 slots (`chest`, 3 rows) open vanilla's `ShulkerBoxMenu`, whose slots already refuse items that cannot go inside container items. Other sizes open `MsmItemChestMenu extends ChestMenu`, `MsmItemHopperMenu extends HopperMenu` and `MsmItemDispenserMenu extends DispenserMenu`, which override `clicked` and `quickMoveStack` only (never construct a `Slot`, F7 of ADR 0074) to refuse container items and the open bag itself.
- **D3 No nesting and no duplication.** A bag's own item reports `canFitInsideContainerItems() == false` (`MsmInventoryItem`), so shulker boxes, bundles, other bags and our 27-slot menu refuse it. While a bag's menu is open: its slot in the player's inventory is locked (clicks, number-key swaps and off-hand swaps that touch it are refused by `clicked`), `stillValid` closes the menu when the stack in the opening hand is no longer the same stack (dropped, moved by a command, the player died), and `removed` writes the contents back to that stack once. A player in creative who picks the bag again gets a copy with the contents as of the last write, as vanilla shulker boxes do (limit Q14). The spike (S10) tries every route; each found hole becomes a GameTest in B450.
- **D4 Bundles.** A component `msm:bundle {}` makes the item a `BundleItem` (`MsmBundleItem extends BundleItem`): vanilla's capacity, insert and take-out clicks, the fullness bar, the tooltip and the selected-item display. Lowering writes the item model definition in vanilla's bundle shape (open and closed pictures, the selected item drawn by vanilla's own `bundle/selected_item` model type: verify at implementation) from the editor-only textures `closed`, `open_back` and `open_front`. A different capacity is not offered (vanilla's is fixed per bundle, limit Q15).
- **D5 Hoppers, scripts and Rules.** Hoppers do not reach items. Script API 1.6 ([ADR 0096](0096-commands-creative-tabs-and-script-and-rules-gaps.md) D4) gains `ItemRef.contents` (read-only) and `Player.openItemInventory(slot)` is not offered (the server opens the menu only from a use, so the guard of D3 holds). Rules gain no card; "When a player opens it" is the `on_open` event, which Rules reach as a trigger on the item (ADR 0082's item triggers).
- **D6 Versions and eject.** No seam: every member is identical on both versions. Plugin API 1.17.0 adds nothing for this ADR beyond the container sounds already in `BlockFacts`. The 26.3 generator emits `MsmInventoryItem`-like classes and the three menu subclasses.
- **D7 Vanilla packs.** Mod-only, as every `msm:item` is.

## Consequences

- The first menus opened from an item; the D3 guard and its GameTests are the core of the work, not the menus.
- Contents in a vanilla component keep the item portable: a bag moved to a vanilla server through a world shows its contents as a tooltip, though it will not open there.
- The Item Studio gains an Inventory section ([ADR 0101](0101-vanilla-parity-2-flows-studios-try-it-and-tests.md)); the Backpack flow makes a bag with a recipe.

## Status

Proposed (2026-11-14). Defaults the user may veto: a component on `msm:item` (D1); 27 slots and right-click to open by default (D1); the shulker box menu for 27 slots and our own menu subclasses for other sizes (D2); bags never fit in bags (D3); bundles with vanilla's capacity only (D4); no hopper access (D5).
