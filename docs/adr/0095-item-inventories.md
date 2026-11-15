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

## Findings at close (B468)

Recorded 2026-11-15 at the close of vanilla parity 2 batch 1 (B468) from the code on main at 78adc90 and the plan's notes: B440 (a4b55be), B443 (2271921), B450 (3912392), B451 (4f33cee), B453 (fa23a2e), B455 (55acc98), B457 (ff97f22), B459 (1f8ad45), B462 (35e8e18), B463 (948f945), B464 (9aa0efc), B465 (bf6a75b). Unreleased; awaiting the user's in-game checks.

- **S10** (B440). The D3 guard closed all ten duplication routes (number keys, off-hand swap, drop, death, creative pick, a second player, closing by disconnect and the rest); naive versions duplicated on seven. The shape the spike proved: a `ShulkerBoxMenu` subclass over a `SimpleContainer` subclass whose `setChanged` writes `DataComponents.CONTAINER`; `clicked` refuses the bag's own slot and a SWAP onto it or the off hand; `stillValid` checks the identity of the stack in the slot; the contents are written on `removed`; `canFitInsideContainerItems()` is false.
- **D1 as built** (B443, B450, B451). Fields and defaults as decided (`chest`, 3 rows, `use`). `loader/ItemInventoryParser` runs after `parseItem`: a bag and a bundle on one item is an error, a conflicting component drops the bag or bundle, and `rows` on hopper or dispenser warns and is dropped. Lowering always writes `max_stack_size: 1`. The conflict list (`INVENTORY_CONFLICT_COMPONENTS` in the plugin, the same list in the Item Studio) is `msm:tool`, `msm:ranged_weapon`, `msm:armor`, `msm:shield`, `msm:throwable`, `msm:food` and `msm:consumable`; durability only forces a stack of 1. **Decision (orchestrator, B453):** this list stands; D1's "weapon" covers ranged weapons and shields. Default sounds `BARREL_OPEN` and `BARREL_CLOSE`; `on_open` and `on_close` run with self and other the player. Bag events stay out of the generic `EVENT_FIELDS` (they are checked by `container-event-unknown`) to avoid double reports.
- **D2 amendment** (B450). The 27-slot menu is **`MsmItemShulkerMenu extends ShulkerBoxMenu`**, not vanilla's class itself, because the guard needs `clicked`, `stillValid` and `removed` on it as well; `MsmItemChestMenu`, `MsmItemHopperMenu` and `MsmItemDispenserMenu` as decided. Each menu overrides `clicked`, `quickMoveStack`, `stillValid` and `removed` and delegates to `BagGuard`; no `Slot` is constructed (no seam). The contents are written on every change while the menu is open, not only on `removed`.
- **D3 amendments** (B450). Beyond the spike: `stillValid` also needs a non-empty stack (vanilla's drop leaves an emptied original), clicks on a menu that is no longer valid are refused, and an `AFTER_DEATH` hook closes the bag. Bags never go into bags, shulker boxes or bundles; shulker boxes and bags never go into a bag (bundles do). The bag's own slot is locked while open and the bag closes if it leaves the hand's slot. A creative pick copies the last saved contents (Q14). GameTests `MsmItemInventoryGameTest` (15), JUnit `ItemInventoryParserTest`.
- **D4 as built** (B450, B451). `MsmBundleItem extends BundleItem`; lowering writes vanilla's bundle item model shape (`minecraft:bundle/has_selected_item` and `selected_item`, which answers D4's "verify at implementation") with models `<ns>:item/<path>`, `_open_back` and `_open_front` on `minecraft:item/template_bundle_open_back` and `_front`; `bundle_textures` is editor-only, and `blocks-items.missing-model` accepts `bundle_textures.closed` (B462a). The app's registry view counts the generated bundle models (`bundleModelIds`).
- **D5 as built** (B455). `ItemRef.contents` (read-only) gives a bag's container contents, then a bundle's contents; `Player.openItemInventory` is not offered.
- **D6 as built** (B457). No seam. The 26.3 generator emits `item/BagItem` and `BagMenus`, whose guard **puts container items back after the click** instead of refusing it as the runtime does; parity compares the outcome (no item moves in) over ten click routes, not the mechanism (B464). The eject writes the stack only on close, so parity reads an open bag's menu slots (a gap).
- **D7 as built** (B457). Mod-only; vanilla pack exports leave bags and bundles out.
- **The app** (B453, B459, B465). Item Studio section "Inventory" ("This item is": Nothing, A bag that holds things, Works like a bundle; "Both" is not allowed), also in Very easy; the Backpack Creator flow (3 rows, an optional dyed copy through `crafting_transmute`); e2e `backpack-path`. Try it opens a mock-up bag screen of the right size from the hand (B463).
- **Tests.** `fixtures/sample-vanilla-blocks`: `satchel` (chest, 2 rows, sneak-use), `seed_pouch` (hopper), `tool_kit` (dispenser), the bundle `charm_bundle`; parity on both content jars and the 26.3 ejected jar (B464); the client GameTest checks the bundle's `BundleTooltip`.
- **Open follow-ups.** The eject's write-on-close against the runtime's write-on-change (parity reads menu slots); hopper access and an "open in the inventory" click stay out (Q13).

## Status

Accepted with findings at close B468 (2026-11-15; unreleased, awaiting the user's in-game checks), with the defaults below; the user may still veto them. Vetoable defaults as built: a component on `msm:item` with the conflict list above (D1); 27 slots and right-click to open by default (D1); a shulker box menu subclass for 27 slots and our own menu subclasses for other sizes (D2); bags never fit in bags, shulker boxes or bundles (D3); bundles with vanilla's capacity only (D4); no hopper access (D5).
