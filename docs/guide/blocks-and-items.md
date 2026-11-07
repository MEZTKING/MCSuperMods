# Blocks and items

MCSuperMods makes new blocks and items with the `msm:block` and `msm:item` element kinds, edited in the **Block Studio** and the **Item Studio**, and the mod's name and version with one `msm:mod` element. A resource or data pack cannot add blocks or items, so this content reaches the game only through the **Fabric mod jar** export. The [Custom ore](getting-started.md#3-create-a-project-from-the-custom-ore-starter) starter and the blocks and items examples ([Templates, starters and examples](templates-and-examples.md#new-blocks-and-items-need-the-mod-jar)) are good places to start.

## Create a block or an item

1. Open or create a project. Any project works, including a blank one (**New** on the toolbar).
2. Choose **Add element** on the toolbar (Ctrl+N). The **New element** dialog groups the templates by category.
3. Under **Blocks**, pick **Simple block**, **Glowing ore** or **Interactive block**; under **Items**, pick **Food item**, **Tool item** or **Magic wand**. Type in the filter box (for example "ore") to narrow the list.
4. Type a name, for example `sun_stone`, and choose **Create**.

The element id (`<namespace>:sun_stone`) is also the id the block or item has in the game, so `/give @s <namespace>:sun_stone` works once the mod is installed. A block and its block item share the id; you do not make the block item separately.

To set the mod's name, version, authors and licence, add **Mod metadata** from the **Mod** category (one per project). Without it, the export makes a mod id from the project name.

## The Block Studio

Selecting a block opens the Block Studio. Empty fields use the game's defaults. **Advanced (all fields)** at the top shows every field of the element as a plain form, and **Raw JSON** edits the same data as text.

- **Appearance**: **Model** is the block model shown in the world and in the hand, for example `minecraft:block/stone` or a model of your own project (the arrow button next to it opens your model). **Display name** is the name players see.
- **Mining**: **Hardness** (how long the block takes to mine; default 1.5) and **Resistance** (against explosions; default 6). **Tool** makes the block mine fast with that tool (pickaxe, axe, shovel or hoe). **Minimum tier** is the weakest tool tier that still gets drops, for example `iron` for an iron pickaxe or better. A tool or a minimum tier also means the block drops nothing when mined by hand. **Requires the right tool for drops** sets that on its own, without a tool or tier.
- **Light and sound**: **Light level** from 0 to 15 (empty: no light) and **Sound type**, the sounds for placing, breaking and walking (default stone).
- **Drops**: **Drops itself** makes a loot table that drops the block's own item; **Loot table** points at a loot table of your own or a vanilla one; **None** makes no loot table.
- **Block item**: **Has a block item** lets players hold and place the block, with **Stack size**, **Rarity** (the colour of its name) and **Creative tab**. Untick it for a block that only commands or events place; such a block cannot drop itself. Ticking it again brings back the stack size, rarity and creative tab you had before, as long as you have not left the block since; otherwise it gives the default block item (stack of 64, common, no creative tab).
- **Behaviour**: what starts the block's events. **On interact** runs an event when a player right-clicks the block. **On step** runs one when something walks onto it, at most once per **Step cooldown (ticks)** (20 ticks are one second). **Redstone signal emitted** makes the block a constant redstone source (0 to 15), and **On powered** and **On unpowered** run events when a redstone signal next to it switches on or off.
- **Events**: the block's events and their actions (see [Events and actions](#events-and-actions)).

## The Item Studio

Selecting an item opens the Item Studio, with **Advanced (all fields)** and **Raw JSON** as for blocks.

- **Item**: **Model**, **Display name**, **Stack size** (1 to 99), **Rarity** and **Creative tab**. Items with durability always stack to 1.
- **Food**: tick **Edible** to make the item food, with **Nutrition** (hunger points restored), **Saturation** and **Can always eat** (eat even when not hungry).
- **Tool and durability**: tick **Tool** and choose a **Tool type** (pickaxe, axe, shovel, hoe, sword, spear or mace) and **Tool tier**. Tick **Durability** and set **Uses** for an item that wears out.
- **Behaviour**: **On use** runs an event when a player uses the item (right-click), at most once per **Use cooldown (ticks)**.
- **Events**: as for blocks.

Armour, custom tool materials, weapons, consumables and totems have no section of their own in the Item Studio yet: edit them in **Advanced (all fields)** or **Raw JSON**, or let the [Creator](creator.md) make them (see [Armour](#armour) and the sections after it).

## Events and actions

An event is a named list of actions that run in order on the server. A block or item can have several events; the triggers in **Behaviour** pick one from the list.

1. In **Events**, type a **New event id** (for example `<namespace>:chime`) and choose **Add event**.
2. Choose an action type in the list next to **Add action** and choose **Add action**. Fill in the action's fields; empty optional fields use their defaults.
3. In **Behaviour**, choose the event for **On interact** (blocks) or **On use** (items).

The arrow buttons reorder the actions and the cross removes one. Renaming an event updates every trigger and action that uses it.

The actions:

| Action | What it does |
|---|---|
| `play_sound` | Plays a sound, for example `minecraft:block.amethyst_block.chime`, with an optional volume and pitch (default 1). |
| `spawn_particle` | Shows particles, for example `minecraft:glow`, at the block or the player: how many (**Count**), how far they spread and how fast they move. |
| `run_function` | Runs a function of your data pack at that spot, as the player when there is one. This is the way to do anything the other actions cannot. |
| `set_block_state` | Places a block, for example `minecraft:glowstone` or `minecraft:oak_log[axis=x]`, at an **Offset** from the block (for items: from the block under the player). |
| `give_item` | Gives the player an item, optionally several. Nothing happens when no player is involved, for example for redstone. |
| `trigger_event` | Runs another event of the same block or item. Chains stop after 16 steps. |
| `apply_effect` | Gives a vanilla mob effect, for example `minecraft:speed`, for a number of **seconds** at an **amplifier** (0 is level I). **Target** `self` (the default) is the player of the event; `other` is the other entity of the event, such as the mob an entity hits. Needs the runtime of MCSuperMods 0.8.0 or later. |
| `run_script` | Calls a handler that one of the project's scripts defines with `msm.actions.define`; pick it in the handler list or type its id. See [Scripting](scripting.md#run_script-from-the-events-editor). Scripts are not part of the Java project export. |

**Problems** reports an event a trigger or `trigger_event` names but the element does not have (removing an event leaves its uses in place, so this is how you find them), and events that trigger each other in a loop. Both are errors.

## Drops

Drops are an ordinary loot table, so they work like vanilla drops and change with `/reload`. **Drops itself** covers the common case. For anything else (several items, a chance, Fortune, Silk Touch), add a loot table element, for example from the **Block loot table** template, and choose **Loot table** in **Drops** with its id. The Custom ore starter shows this: its ruby ore drops rubies from `blocks/ruby_ore`.

A block with a **Minimum tier** drops nothing when mined with a weaker tool, whatever its loot table says.

## Display names

**Display name** becomes the English name in the game (the language key `block.<namespace>.<name>` or `item.<namespace>.<name>`). Without a display name the game shows that key itself. To translate the names, add a **Language file** element (category **Text**) for each other language with the same keys.

## Armour

An item with the `msm:armor` component is an armour piece. Its **slot** is `helmet`, `chestplate`, `leggings`, `boots`, `horse` (horse armour) or `wolf` (wolf armour), and its **material** is either a vanilla material by name or a material of your own:

- the vanilla names are `leather`, `copper`, `chainmail`, `iron`, `gold`, `diamond`, `netherite`, `turtle_scute` and `armadillo_scute`. The piece then has that material's armour points, durability, sounds and worn look;
- a material of your own has `durability` (each slot multiplies it as vanilla does: helmet 11, chestplate 16, leggings 15, boots 13), armour points per slot in `defense` (horse and wolf armour use the `chestplate` value), `enchantment_value` (0 means it cannot be enchanted), `toughness`, `knockback_resistance` (0 to 1), an optional `equip_sound` and `repair_items` (an item tag such as `#<namespace>:sapphire_repair_materials`), and `equipment_asset`, the equipment element that draws the piece when worn.

The quickest start is the **Armour piece (helmet)** template (an iron helmet) in **Add element** under **Items**, or a [Gear set](creator.md#the-flows) from the Creator, which writes everything below for you.

**The equipment element and its textures.** How worn armour looks is an `equipment` element in the resource pack (**Equipment (humanoid armour)** under **Models**), exported as `assets/<namespace>/equipment/<name>.json`. Its `layers` point at textures by id: `humanoid` for the helmet, chestplate and boots, `humanoid_leggings` for the leggings, and `horse_body` or `wolf_body` for horse and wolf armour. A texture id `<namespace>:sapphire` in the `humanoid` layer is the file `textures/entity/equipment/humanoid/sapphire.png`; import it with **Import assets**. The humanoid layers are 64 by 32 pixels in the vanilla armour layout. A Gear set names its equipment element `<material>_armor`, for example `sapphire_armor`.

An armour piece also needs the vanilla item tag of its slot (`minecraft:head_armor`, `chest_armor`, `leg_armor` or `foot_armor`) for enchantments and armour trims to apply; the Gear set adds these.

**Problems** reports as errors a vanilla material name the project's Minecraft version does not know (`blocks-items.unknown-armor-material`) and an item that is armour and a tool, ranged weapon or shield at once (`blocks-items.component-conflict`). An `equipment_asset` that is neither an equipment element of the project nor a vanilla one, or horse or wolf armour whose equipment element lacks the `horse_body` or `wolf_body` layer, is a warning (`blocks-items.unknown-equipment-asset`): the piece works but is invisible when worn.

**In the game**: put the piece on in a creative world. The armour bar shows its points, the worn look comes from the equipment element, and an anvil with an item of `repair_items` repairs it.

## Custom tool materials

The `msm:tool` component's **tier** is either a vanilla tier by name (`wood`, `stone`, `copper`, `iron`, `gold`, `diamond`, `netherite`) or a tool material of your own, with:

- `durability`, `speed` (mining speed; iron is 6), `attack_damage_bonus` (added to the tool type's base damage; iron is 2) and `enchantment_value` (iron is 14; 0 means it cannot be enchanted);
- `incorrect_blocks_for_drops`, the block tag the material cannot mine for drops. This is what "mines like" means: `#minecraft:incorrect_for_iron_tool` mines what an iron tool mines, `#minecraft:incorrect_for_diamond_tool` what a diamond tool mines, and so on for `wooden`, `stone`, `copper` and `netherite`. The Creator's **Mines like** field picks this tag;
- optionally `repair_items`, an item tag whose items repair the tool on an anvil.

`attack_damage` and `attack_speed` on the tool override the tool type's base values (sword 3 and -2.4, axe 6 and -3.1, pickaxe 1 and -2.8, shovel 1.5 and -3.0, hoe -2 and -1.0) for any tier. The **Tool with a custom material** template is a pickaxe that mines what iron mines, a little faster.

**In the game**: mine a block of the next tier up (for example diamond ore with a material that mines like iron): it breaks without drops. Mine one the material allows: it drops as usual.

## Weapons

- **Swords, spears and maces** are tools: `msm:tool` with type `sword`, `spear` or `mace` and a tier or custom material. A spear has vanilla's spear attacks and joins the `minecraft:spears` tag, so spear enchantments apply; a mace has vanilla's smash attack. Template **Spear**.
- **Bows and crossbows** use `msm:ranged_weapon` with `type` `bow` or `crossbow` and the factors `draw_speed` (how fast it draws or charges), `velocity` (arrow speed), `damage_multiplier` and `inaccuracy`, all 1 for vanilla. They shoot vanilla arrows. Give them `msm:durability` too (a vanilla bow has 384 uses, a crossbow 465). Template **Bow**.
  While a bow is drawn it shows `<model>_pulling_0`, `_1` and `_2`, and a crossbow being charged `<model>_pulling_0`…`_2` and, once loaded, `<model>_arrow` or `<model>_firework`, as vanilla's do; the frames switch faster when `draw_speed` is higher. With a vanilla model (`minecraft:item/bow`) the game's own frames are used. With your own model, add those models too: the Creator's **Weapon** and **Gear set** make them with placeholder frames to paint over, and **Problems** warns (`blocks-items.missing-pull-model`) when one is missing.
- **Shields** use `msm:shield`: `block_delay_seconds` (raised for this long before blocking; vanilla 0.25), `damage_reduction` (0 to 1; 1 blocks everything), `disable_cooldown_scale` (how long an axe hit disables it) and `bypassed_by` (a damage type tag that goes through). Template **Shield**; its model is a placeholder until you add your own.

An item can be only one of armour, tool, ranged weapon and shield. The Creator's **Weapon** flow makes any of them with a texture, model and recipe.

**In the game**: compare the weapon with its vanilla counterpart: the bow's draw time and arrow speed, the shield blocking a hit, the spear's charge attack.

## Consumables and totems

- **Food with effects and drinks**: `msm:consumable` sets how long using the item takes (`seconds`; vanilla food and potions 1.6), the `animation` (`eat`, `drink` or `none`), `effects` (each a mob effect with `seconds`, an optional `amplifier` and `chance`), an optional `sound`, `particles`, `converts_to` (the item left over, such as `minecraft:glass_bottle`) and `cooldown_seconds`. With `msm:food` too it is food that also gives effects; alone it is a drink that restores no hunger. Template **Drink**.
- **Charms**: an item that gives effects each time it is used and is not used up is an `msm:on_use` trigger whose event has `apply_effect` actions, with a cooldown. The Creator's **Consumable** flow makes one when **Kind** is **Charm**.
- **Totems**: `msm:death_protection` saves its holder from death when held in either hand, like a totem of undying, gives its `effects` and, with `clear_effects`, first removes the holder's other effects. Template **Totem**.

**In the game**: eat or drink the item and watch the effects appear; for a totem, hold it in survival and take fatal damage (`/damage @s 100`).

## Vanilla components

For anything the components above do not cover, `msm:components` passes vanilla item data components through by id, in their vanilla JSON form, for example `"minecraft:glider": {}` or `"minecraft:use_cooldown": { "seconds": 2 }`. **Problems** checks each one against the project's Minecraft version. MCSuperMods' own components win: setting the same thing twice (for example `msm:food` and `minecraft:food`) is an error. Components that point into a data pack registry work only for `minecraft:jukebox_playable`, `minecraft:provides_trim_material`, `minecraft:trim`, `minecraft:damage_resistant`, `minecraft:blocks_attacks` and `minecraft:damage_type` (the Music disc flow and the Gear set's trim material use some of them); others, such as `minecraft:enchantments` or a painting or mob variant, are refused when the game loads, and **Problems** warns about them as you write them.

## Export a Fabric mod jar

1. Open the arrow next to **Export .zip** on the toolbar and choose **Fabric mod (.jar)…**, or use **File → Export Fabric Mod Jar…**, or "Export Fabric mod jar…" in the command palette (Ctrl+Shift+P).
2. The **Export Fabric mod jar** dialog shows the export's options (see below). Choose **Export…**.
3. Save the file. Its name is the mod id, for example `ruby_ore.jar`.

Every error in **Problems** blocks the export and nothing is written; warnings do not. While there are errors, the menu entry is greyed out with the number of errors to fix, and the command palette leaves the command out. The jar holds:

- your blocks and items, as definitions under `msm/<namespace>/` that the runtime reads when the game starts;
- everything the resource and data pack exports would hold (models, textures, names, block states, loot tables, recipes, tags, advancements, functions), under `assets/` and `data/`, so players do not need the packs as well;
- `fabric.mod.json`, written from the `msm:mod` element (or with a mod id made from the project name when there is none). It depends on Fabric Loader, Fabric API, the Minecraft version you target and `msm_runtime`.

The resource and data pack exports still work for a project with blocks and items, but they leave the blocks and items out and say so after the export.

The mod id must be unique among the mods you install, and the ids `minecraft`, `java`, `fabricloader`, `fabric-api` and `msm_runtime` are reserved: **Problems** reports them, and a mod id made from the project name gets a `mod_` prefix instead.

## Separate runtime and GeckoLib (for modpacks)

Every exported jar needs the small `msm_runtime` mod, which registers the blocks and items and runs their behaviour. By default it is nested inside the jar (`META-INF/jars/`), so one file is all a player needs, and Fabric Loader uses the newest copy when several MCSuperMods mods carry one. A project with entities also nests GeckoLib (see [Entities and models](entities-and-models.md#export-the-mod-jar-and-geckolib)); for blocks and items alone it plays no part.

Tick **Separate runtime and GeckoLib (for modpacks)** in the export dialog to leave the runtime (and GeckoLib, when there are entities) out. The jar still depends on `msm_runtime`, so the game refuses to start unless something else provides it: for example another MCSuperMods mod in the same modpack exported with the runtime nested. Use it when you put several MCSuperMods mods into one modpack and want only one copy of the runtime. MCSuperMods does not publish `msm_runtime` as a download of its own yet.

## Install the mod in a Fabric game

You need three things in the game's `mods` folder, all for the Minecraft version your project targets:

1. **Fabric Loader**: make an instance with the Fabric mod loader, for example in Prism Launcher (**Add Instance**, choose the version, mod loader **Fabric**), or run the Fabric installer from fabricmc.net for the official launcher. Start it once.
2. **Fabric API**: download it from Modrinth or CurseForge (Prism: the instance's **Mods** page, **Download mods**) and put it into `mods`.
3. **Your jar**: put it into the same `mods` folder (Prism: **Add file**; official launcher: `%APPDATA%\.minecraft\mods`).

Start the game with the Fabric profile and open a creative world. Your blocks and items are in the creative tabs you chose, or reachable with `/give`. To remove the mod, take the jar out of `mods`; blocks of the mod already placed in a world are lost, so try it in a test world first.

## Test in Minecraft

**Test in Minecraft** exports the mod jar, installs it and starts the game for you. Open it with **File → Test in Minecraft…**, the toolbar **Export** menu (**Test in Minecraft…**, next to **Fabric mod (.jar)…**) or the command palette. Like the jar export, it is disabled while the project has errors.

The **Test in Minecraft** dialog shows the game location it will use (the one chosen in **Settings → Game locations** or the toolbar install target), with its Minecraft and Fabric Loader versions, and what the mod needs: your project's Minecraft version, at least the Fabric Loader version MCSuperMods targets, and Fabric API.

- **Prism Launcher or MultiMC instance with Fabric** on the right Minecraft version: the button is **Install and launch**. MCSuperMods copies the jar into the instance's `mods` folder as `<mod id>.jar`, adds Fabric API when it is missing, and starts the instance in the launcher. If MCSuperMods cannot find the launcher program, use **Choose launcher program…** to point at it (for Prism Launcher on Windows, usually `prismlauncher.exe` under `%LOCALAPPDATA%\Programs\PrismLauncher`).
- **Official launcher or CurseForge location with Fabric**: the button is **Install**. MCSuperMods installs the jar (and Fabric API) only, with a note; start the game from that launcher yourself.
- **No suitable location** (vanilla, another loader, another Minecraft version or an older Fabric Loader): the dialog says why and nothing can be installed. Choose another location with **Open Settings**, or use **Create test instance**: it creates the Prism Launcher instance **MCSuperMods Test (<version>)** with Minecraft and Fabric Loader for your project and selects it. Prism Launcher must be installed and started once first; Prism downloads the game the first time the instance starts.

Only files MCSuperMods installed are replaced; other mods in the `mods` folder are never touched. MCSuperMods records what it installed in `mods/.msm-installed.json`. Fabric API is downloaded from the Fabric Maven, checked against its published SHA-512 and kept in the app's download cache, so later tests do not download it again. If the `mods` folder already has a Fabric API you put there, that copy is used.

After a run the status bar says where the jar went, whether Fabric API was added and whether the launcher is starting.

## Troubleshooting

When the game starts, the runtime writes one summary line to the game log (Prism: the instance's **Minecraft Log**; official launcher: `logs\latest.log` in the game folder), for example:

```
[msm_runtime] registered 3 block(s) and 6 item(s) from 7 definition file(s); 0 error(s), 0 warning(s)
```

Any other line with `[msm_runtime]` names the file and the problem.

| Problem | What to do |
|---|---|
| The game refuses to start and asks for `fabric-api` | Put Fabric API for the same Minecraft version into `mods`. |
| The game refuses to start and asks for `msm_runtime` | The jar was exported with **Separate runtime and GeckoLib (for modpacks)**. Export it again without that option, or add another MCSuperMods mod that carries the runtime. |
| The game refuses to start because of the Minecraft version | The jar targets another Minecraft version than the instance. Use an instance of the version shown in the toolbar's target. |
| No `[msm_runtime]` line at all | The game did not start with Fabric, or the jar is not in this game's `mods` folder. |
| A purple and black cube | The block or item has no model, or its model id is wrong. **Problems** reports a missing model. |
| A name such as `block.my_mod.sun_stone` | The block or item has no **Display name**. |
| The block drops nothing | Check **Drops**, and mine it with the **Tool** and **Minimum tier** you set; by hand it drops nothing when a tool is required. |
| The block mines slowly with the right tool | Set **Tool**; **Hardness** sets how slow it is. |
| An event does nothing | Check that the trigger in **Behaviour** names the event, and the action's ids (sound, particle, function, item). |
| Two mods with the same id | Give one of them another mod id in its **Mod metadata**. |
