# Changelog

What changed in each MCSuperMods release, for people who use the app. The app shows the section for its version under **Help > What's New…**, and each GitHub release carries the same text.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versions follow [Semantic Versioning](https://semver.org/); before 1.0, a minor version can change how projects behave.

## [Unreleased]

### Added

- The AI helper knows the block types, their textures and loot presets, seeds with their own item id, and the Wood set, Stone set, Crop and Tree flows.
- **Your own sounds work in the game**: every key of a project's `sounds.json` is now a registered sound event, so in MCSuperMods' own fields (the **Play sound** action, an effect's or throwable's sound, mob sounds, `world.playSound` in scripts) you write the plain key, and the pickers list the project's sounds before the vanilla ones. In vanilla fields keep writing `{ "sound_id": "..." }`. A new sound key needs a game restart.
- **Mob sounds**: the Mob Studio's new **Sounds** section sets the **Ambient sound**, **Hurt sound**, **Death sound** and **Step sound** of a mob, and the **Ambient interval (ticks)**.
- **Blocks that react to mobs**: the actions of an **On step** event now apply to whatever stepped on the block, mob or player (`self` is the stepper, `run_function` runs as it), so a jump pad launches pigs too. The step cooldown is counted per dimension.
- **Script commands**: `world.runCommand` and `world.runFunction` accept a position and run there (without one, at the world spawn point), and `entity.runCommand` and `entity.runFunction` run as and at the entity.
- The Java project export writes `ModSounds.java` for the project's sounds and the mob sound overrides.
- Plugin API 1.7.0: `JavaProjectInput.soundEvents`, the project's sound event keys for Java project generators.
- **Block shapes**: the Block Studio's new **Shape** section gives a block an outline and collision other than a full cube. Pick a preset (**Bottom half**, **Top half**, carpet, pillar, **Plant (cross)**) or **Custom boxes** (up to 16 boxes in pixels), or use **From model** to read the boxes from the block's model in one undoable step; the picture beside the section draws them. **Walk-through** lets players and mobs pass through (like plants) and **See-through** lets light and the view through like glass: no suffocation, no hidden neighbour faces, no mob spawns on top. How a texture draws (solid, cut-out or see-through) still comes from its pixels. Templates **Half block**, **Plant (cross)** and **Glass-like block**, and the sample mod's `ruby_slab`, `ruby_sprout` and `ruby_glass`. Two new warnings in **Problems**: `blocks-items.model-not-cube` (a block with a non-cube model of your own but no shape) and `blocks-items.transparent-texture-on-solid-block` (a see-through texture on a block that is not see-through). The Java project export writes the shapes too. Rotation, stairs, real slabs, doors, fences and crops are not part of this yet; the guide's **Block shapes** section lists them.
- **Villager trades**: new data kinds `villager_trade`, `trade_set` and the villager trade tag, and the Creator's **Villager trade** flow (group **Worlds**) add a trade to a profession of the vanilla villagers, with four trade templates, an example for each of the three kinds and a fletcher trade in the sample data pack. A new trade is a candidate that villagers can offer, not a guarantee.
- **Ore that generates**: the Custom ore flow and starter have a new **World** step. With **Generate in the world** (on by default) the ore generates underground in every overworld biome of newly generated chunks, with your **Vein size**, **Veins per chunk**, **Lowest height** and **Highest height**; the Scripted ore starter's ruby ore generates too. Projects made before are unchanged until you reopen them with **Edit in Creator**. The ore replaces stone and deepslate.
- **World additions**: a new element kind (sidebar **World additions**, template **Ore in the overworld**) adds placed features and natural mob spawns to vanilla biomes and biome tags without replacing any vanilla file, edited in the **World addition** Studio (**Biomes**, **Features** with their step, **Spawns**). Only newly generated chunks get the features.
- **Extra drops**: a new element kind (sidebar **Extra drops**, template **Extra mob drop**) adds drops to vanilla mob, block and chest loot tables on top of their usual drops, edited in the **Extra drops** Studio (tables suggested by **Mobs**, **Blocks** or **Chests**, simple drop rows with a count, a chance and **Only when a player kills it**), and the Creator's new **Extra drop** flow (group **Worlds**). Extra drops come back after `/reload`; a world data pack that replaces the whole table wins.
- **Fuel and compost**: the Item Studio's new **Fuel and compost** section (and the Block Studio's **Block item** section) makes your items burn in a furnace (**Burns in a furnace**, **Burn time (seconds)**) and go in a composter (**Compost chance**, 30% to 100%).
- **Ten new triggers** in a **Triggers** part of the Events editor: for items **On hit**, **On use on a block**, **While held** and **While worn**; for blocks **On break**, **On place**, **On random tick** and **On entity inside**; for mobs **On tick** and **On spawn**. Repeating triggers run at most every 5 ticks, and together at most 2,000 times per server tick. Scripts reach every trigger through `run_script`.
- **Saved data for scripts**: `entity.data` (so `player.data`) and `msm.storage` keep values across `/reload`, closing the world, death and travel between dimensions, separately for each namespace (keys up to 64 characters, 16 KiB per entity and 1 MiB per world for each namespace).
- Templates **Fuel item**, **Life-steal sword (item triggers)**, **Bounce pad (block triggers)**, **Ore in the overworld** and **Extra mob drop**, and the examples **Ore that generates**, **Zombie drops a ruby**, **Fuel log**, **Life-steal sword**, **Night-vision helmet** and **Script: kill counter**.
- **Problems** checks the new content: a spawn whose largest group is below its smallest, a placed feature that would generate twice in a biome, an extra drop's item that does not exist, a pool that is not a valid loot pool (every pool is checked against the vanilla loot pool of the project's Minecraft version), **While worn** on an item that is not armour, **On entity inside** on a full solid block, and a note when a fast repeating trigger runs a function or a script.
- The Java project export writes world additions (`ModWorldgen.java`), extra drops (`ModLoot.java`), components on block items and the ten triggers.
- Plugin API 1.8.0: the data folders `villager_trade` and `trade_set`, biome and loot additions and compost providers for plugins.
- **Potions and brewing**: a new element kind (sidebar **Potions**) adds real potions to the game, of your own status effects or vanilla ones, with a brewing ingredient and base potion, a longer version (redstone dust, id `long_<name>`) and a stronger one (glowstone dust, id `strong_<name>`), and splash and lingering bottles; tipped arrows come with the lingering potion. Your potions are in the creative inventory and work with `/give`, loot tables and potion tags. The export writes up to 15 brewing recipes and the four item names. Potions need the Fabric mod jar: the vanilla packs leave them and their brewing recipes out (a brewing recipe naming a potion the game does not know would stop the whole data pack loading) and warn once (`blocks-items.potion-needs-jar`). New guide chapter **Potions and brewing**.
- **Potion Studio**: the potion's names and ids, its effects (time, level, faint, particles, icon), the brewing ingredient, the longer and stronger versions, splash and lingering, and the brewing chain as steps. The Effect Studio's new **Potion** section lists the potions of the effect and has **Make a potion**, one undoable step. **Problems** reports a potion naming an effect that does not exist, two potions brewed from the same ingredient and base, and a version id that another potion already has.
- **Creator flows**: **Potion** (group **Magic**), with a new effect of its own or a vanilla one, its brewing ingredient and its versions; the **Status effect** flow's **How players get it** gains **A brewed potion**; **Mob skin** (group **Mobs**) gives a wolf, cat, pig, cow, chicken or frog a new skin with placeholder textures of the right size, in a biome you pick or everywhere; **Goat horn** (group **Gear**) adds a goat horn call with a vanilla sound or your own `.ogg`, its length and range, a recipe and, if you like, goats dropping it. Mob skins and goat horns work in vanilla packs.
- **New data kinds**: skins for wolves, cats, pigs, cows, chickens, frogs and zombie nautiluses; sound variants for cats, pigs, cows and chickens; goat horn instruments; enchantment providers; timelines and world clocks; fonts and texture atlases in the resource pack; and tags for banner patterns, dialogs, instruments, points of interest, potions, timelines, features and superflat presets. Each has a sidebar heading of its own and an example in the gallery. Wolf sound variants and trial spawners are left out until the schema data they are checked against is updated.
- **Script API 1.1** (runtime 1.5.0 or later): `player.inventory` (read, set, count, find and remove items, change item components), `entity.equipment` and `setEquipment`, item names, durability and components, experience, hunger and game mode, titles and the action bar, boss bars (`msm.bossBars`, 32 per namespace), damage of a type with an attacker, raycasts up to 128 blocks, teleports to other dimensions, `msm.players()` and `msm.getWorld()`, and six events: `player.tick` (with an interval of at least 5 ticks), `player.respawn`, `player.leave`, `player.changeDimension`, `player.chat` (cancellable) and `entity.damaged` (the health actually lost, after armour; it fires once for a killing blow too, before `entity.death`); `entity.hurt` gains `source` and `direct`. A block placed event, changing damage amounts, commands and creative tabs of your own are not possible yet.
- Templates **Potion of a custom effect**, **Potion with longer and stronger versions**, **Brewing recipe**, **Brewing recipe: splash potion**, **Wolf variant**, **Cat variant**, **Goat horn instrument**, **Icon font**, **Full set bonus** and **Boss bar countdown**, and 30 new examples, among them **Potion of the custom effect**, **Brewed with your own item**, **Snowy wolf skin**, **Custom goat horn**, **Script: full set bonus**, **Script: teleport staff** and **Script: boss fight bar**.
- The Java project export writes potions (`ModPotions.java`).
- Plugin API 1.9.0: `JavaProjectInput.potions` and the data folders of the new data kinds.
- **Block types**: the Block Studio's new **Type** section turns a block into a log or pillar, a block that faces the player (four or six ways), a slab, stairs, wall, fence, fence gate, door, trapdoor, button, pressure plate or pane, each a real vanilla block class that connects, turns, opens and stacks like vanilla's. **Textures** name each face in words and the Studio draws the generated models; **Own models (instead of the made ones)** replaces them. Doors, trapdoors, buttons and plates take a **Set type** (wood, cherry, bamboo, crimson, warped, iron, copper, gold, stone, polished blackstone) and fence gates a **Wood type**; a block can burn (`msm:flammable`) and an axe can strip it (`msm:strippable`).
- **Crops, saplings and leaves**: crops with 1 to 15 growth stages, seeds of their own, produce and villager farming; saplings that grow a tree of your project through bone meal, a two-by-two tree and a tree near flowers; leaves that decay, drop saplings, sticks and an extra item, and take a biome foliage, grass, dry foliage or one-colour tint (shown in the game only). A block's item can have its own id (a crop's seeds).
- **Tree Studio**: the worldgen feature of type `minecraft:tree` opens in a Studio with **Trunk**, **Leaves**, **Below the trunk** and **Decorators** sections, and a new template **Tree for a sapling**.
- **Creator flows** **Wood set**, **Stone set**, **Crop** and **Tree** (group **Blocks**) make whole families with recipes, tags, stripping, burning, composting and, if you choose, trees and wild crops that generate in newly generated chunks; the Simple block flow has **When placed**. The Creator previews a set as a row of blocks.
- 18 templates (a block of each type, plus **Tree for a sapling**), 4 starters, 6 examples (a wood set, a stone set, a crop, a tree, a machine-like block and a vault door) and 15 new placeholder patterns; **Problems** checks the new types (18 `blocks-items` codes).
- The Java project export writes the block types, crops, saplings and leaves, stripping, a client entrypoint for tinted leaves and block item ids of their own.
- Plugin API 1.10.0: `TargetFacts.blocks` (`BlockFacts`: the set type and wood type names).

### Changed

- Mob events run `run_function` as the mob when no player is involved (**On tick**, **On spawn**, and **On hurt** and **On death** without a player), so `@s` in those functions is the mob; before, they ran as the server and had no `@s`.
- The AI helper writes plain sound keys inside MCSuperMods' own data, `{ "sound_id" }` in vanilla data, and uses `entity.runCommand` to run something "as" a creature.
- The guide chapters on blocks and items, entities, scripting and the Java project export describe the above, including the new **Block shapes** and **Triggers** sections, and a new chapter, **Adding to vanilla**, covers world additions, extra drops, fuel and compost and villager trades with their limits.
- The AI helper knows world additions, extra drops, fuel and compost, the new triggers and saved script data.
- The guide chapters on status effects, the Creator, adding to vanilla, scripting, the Java project export and templates and examples describe potions, the new flows, the new data kinds and Script API 1.1.
- A new guide chapter, **Block types, families and plants**, and updated chapters on blocks and items, the Creator and templates and examples describe the types, the four flows, burning and stripping, what the vanilla packs leave out and the limits (no signs or boats, sounds of door sets are vanilla's, stripping only by players, leaf tint only in the game, villagers farm only on farmland, tree shapes are vanilla's).

### Fixed

- **Vanilla data packs of mixed projects load**: a vanilla server refuses a whole data pack when one of its recipes, loot tables, advancements, tags, worldgen or other files names a block, item, effect, potion or mob that only the Fabric mod jar adds (a block's own loot table was enough). The vanilla data pack and the data half of **Both packs into a folder…** now leave such files out and say which in **Problems** (`export.mod-only-reference`), make tag entries naming them optional, and keep functions with a warning (`export.mod-only-function`); the Fabric mod jar keeps everything. Work in progress (ADR 0066).
- In the Studios, clearing a value inside a row of a list (for example turning a potion effect's **Particles** switch back on) now removes it; before, the old value stayed.
- The Java project export of a walk-through block (**Block shapes**) wrote a block properties line that did not compile.
- After a script cancels an interaction, the game sends the player's inventory, the six neighbours of a placement and a broken block's block entity again, and clears an item cooldown, so the client no longer shows results the server refused.

## [1.4.0] - 2026-11-13

### Added

- **Status effects of your own**: the Creator's **Status effect** flow (new **Magic** group) makes an effect with its name, colour, icon, stat changes and what it does every few seconds (heal, hurt, particles or a function), plus a drink or a throwable flask that gives it. The new **Effect Studio** edits effects by hand: category, colour, particle, sound, stat changes per level and events when the effect starts, while it is active and when it ends. Three effect templates; paint the 18 by 18 icon with **Paint icon** or **New texture…** and the kind **Effect icon**. Custom effects work in drinks, food, totems, **Apply effect** and `/effect`; they cannot be brewed.
- **Throwables**: the Creator's **Throwable** flow (under **Gear**) makes a ball, a knife you pick up again, a boomerang that comes back to your inventory or a bomb, with its damage, speed, weight and what happens on a hit. Any item can be thrown through the Item Studio's new **Throwable** section (damage, speed, gravity, hold to throw, what happens after the throw, hit events); dispensers throw them too. A **Throwable item** template and the **Frost bomb** and **Script: scripted effect** examples.
- **Hurt** and **Heal** actions for every event, and scripts can check and remove effects (`hasEffect`, `effectLevel`, `removeEffect`) and see the entity a thrown item hit (`e.other`).
- The Creator's **Card** tab previews a status effect (icon, name in its colour, a table per level) and a throwable (its picture, a sketch of the throw, damage and what happens after).
- The Java project export writes status effects (`ModEffects.java`) and throwables (`ThrownItemEntity.java`).
- The AI helper knows status effects and throwables and the new placeholder pictures (ball, knife, boomerang, flask, effect icon).
- **Dimensions** in the Creator (new **Worlds** group): pick the terrain, the biome and the sky, and travel there and back with a key item or a command.
- **Drag and drop textures**: drag a texture from the assets onto an item, block or model in the sidebar or onto the live preview to use it (one Undo puts the old one back); drop pictures from your computer on the window to open Picture to texture with them.
- **Picture to texture** has more options: turn and mirror, fit the whole picture instead of cropping, brightness, contrast, colourfulness and hue, and a dark or coloured outline; several pictures go in a tray where one click switches between them.
- **Wishlist** (Help menu): when the AI helper cannot build something exactly, it builds the closest version, says what is missing and adds it to the project's Wishlist; add your own wishes and copy the open ones to ask for them.
- **Real pushes**: scripts can read an entity's `velocity` and `look` and call `setVelocity` and `addVelocity`, and events have a **Launch (push)** action, so launchers, jump pads and dashes move you smoothly instead of in small teleports.
- Functions can name the project's own dimensions (`execute in`) without a warning.
- **Problems** reports a sound of your project's `sounds` element written as a plain string in a vanilla sound field (such as a jukebox song's sound), which the game cannot load, and says to write it as `{ "sound_id": "..." }`.
- Exporters from plugins are also under **File → More Exports**, as in the toolbar's **More exports**.
- Plugin API 1.5.0: the Creator group `worlds`. Plugin API 1.6.0: the Creator group `magic` and the status effects of a project for Java project generators.

### Changed

- Worldgen: a placed feature used in different steps of a biome is now a warning, not a feature order cycle error; only a real cycle inside one step is an error, as in the game.

### Fixed

- **Test in Minecraft** loaded the mods of every project tested before in the same instance; now only the project you test (and Fabric API) runs. Mods you added yourself stay.
- The Music disc flows' discs with your own song failed to load in the game: the song now names its sound in the form the game accepts.
- The Java project export left out `Actions.java` for a project whose only events were on items or blocks; it is now written whenever a definition declares events.

## [1.3.0] - 2026-11-07

### Added

- **Your own song on a music disc**: the Music disc flow's **Song file** takes an `.ogg`; the disc plays it and the jukebox's playing time comes from the file.
- Custom armour materials take an optional `body` armour value for horse and wolf armour (it was always the chestplate value).
- The Creator's **Stats** tab shows the real numbers of a vanilla-tier tool: attack damage, attacks per second, durability, mining speed and enchantability.
- **Problems** warns about an `msm:components` entry (such as `minecraft:enchantments`) that names a data pack entry the game cannot apply when it loads items.
- Plugin API 1.4.0: `audio` starter parameters (`AudioStarterParameter`), `ItemFacts.dataPackComponents` and `ItemFacts.vanillaTools`.

## [1.2.0] - 2026-11-07

### Added

- **New texture…**: paint a texture from a blank picture, sized for an item, a block, an armour layer or a painting. Undo removes it again.
- **Picture to texture** (File menu, palette, and the picture button by a namespace's assets): paste a screenshot, drop or choose any picture (PNG, JPEG, GIF, BMP, WebP), crop it, scale it smooth or sharp, make the background transparent and reduce the colours, then add it as an item, block, armour, mob skin or painting texture, or touch it up in the painter first. Old 64 by 32 player skins become the 64 by 64 layout.
- **Player skins on mobs**: the Custom mob's new **Skin** field wears a player skin (64 by 64 with its hat and sleeves layer, or an old 64 by 32 one), and **Arms** offers slim 3-pixel arms.
- **Screenshots for the AI helper**: paste, drop or attach up to four pictures to a message, or to **New project with the AI helper…**, and the helper builds what it sees.

### Changed

- Better placeholder art: thicker pickaxe, axe, shovel and hoe heads with two-tone wooden handles, a panelled storage block, a shaded ingot and grain on the worn armour layers.

## [1.1.0] - 2026-11-06

Easier to use, a live preview beside the form, painting, and modpacks. Projects from 1.0.0 open unchanged; your current view stays as it was until you switch to Easy mode.

### Added

- **Easy and Advanced mode**: Easy mode (the default for new installs) lists what you made first, sets from the Creator under their own names, and folds the technical files away; Advanced mode shows everything and Raw JSON. Switch on the toolbar or under **View**.
- **Easier navigation**: search the element list, fold groups, and read plain group names such as Items, Recipes and Armour looks.
- **Live preview beside the form** for items, blocks, armour (on a figure, with parts you can show, hide and jump to), recipes, models, structures and mobs, redrawn as you edit.
- **New project with the AI helper…**: describe your mod and the AI helper builds it in a new project.
- **Paint textures** inside MCSuperMods: the brush on a texture's row opens a pixel editor with pencil, eraser, fill, colour picker, zoom and undo; saving is one undoable step.
- Custom bows and crossbows show the pull while drawn or charged, as vanilla ones do, and the Creator draws the frames. A warning names any pulling model a bow or crossbow of your own is missing.
- **Modpacks** (**File → Modpacks…**): group your projects into modpacks, add mods from Modrinth by name or link, export a modpack as a Modrinth `.mrpack` for Prism Launcher or the Modrinth app, and test all its mods together in Minecraft. Projects stay in their own folders; one project can be in several modpacks. **Update mods** fetches the right version of each Modrinth mod after you change the modpack's Minecraft version.
- Plugins can say which Minecraft versions their templates, starters and examples work on, and MCSuperMods hides them on the others.

## [1.0.0] - 2026-11-06

MCSuperMods 1.0: everything from 0.7.0, with the plugin platform and the second Minecraft version finished and documented. Projects from 0.7.0 open unchanged.

### Added

- **Your first mod**: a welcome on the first start that walks you through making a ruby tools and armour mod and testing it in Minecraft, with a matching guide page. Open it again with **Help → Your First Mod…**.
- Guide pages for plugins and for Minecraft versions (including Upgrade Project Target), and automated tests that load a sample plugin and upgrade a project to the snapshot target.
- Exporters from third-party plugins are offered under **More exports** in the menu next to **Export .zip** and in the command palette; one with options asks for them first.

### Fixed

- Copying an example now says when it merged entries into language files or tags the project already had.
- Building a plugin made with `tools/new-plugin --external` on Windows failed with "the mcdoc export has no types"; the build steps now work on any drive.

## [0.7.0] - 2026-11-06

### Added

- **AI helper.** An optional assistant in a third tab next to **Preview** and **Problems** (toolbar **AI helper**, **View → AI Helper** or Ctrl+Shift+A). It uses your own Anthropic API key, which you add under **Settings → AI helper**; MCSuperMods keeps it encrypted and usage is billed to your Anthropic account. In **Chat** it answers questions about your project and proposes small edits; in **Build** it makes whole content from one prompt, showing a plan first (**Build all**, **Step through** or **Revise**). Nothing changes until you review the proposed changes, keep or drop each one, and press **Apply**; one Undo takes everything back. Each run has limits you can change under **Run limits**, a **Stop** button and a line with the tokens used and the approximate cost. **Explain** on a problem and **Ask AI** in the editor start a question with the context filled in. The app works as before without a key. See the new guide page "AI helper".
- **The Creator.** **Create…** on the toolbar (also **File → Create…**) makes a finished piece of content from a few questions, with a live preview of the items, blocks, recipes, worn armour and stats as you type: a **Gear set** of tools and armour from one material, a **Weapon**, a **Consumable**, a **Totem**, an **Enchantment**, a **Painting** (with your own picture), a **Music disc**, a **Simple block**, a **Food**, **Custom ore**, a **Custom mob** or a **Scripted behaviour** item. **Create** adds everything in one undoable step. **Edit in Creator** reopens a set with the same answers and keeps the pieces you changed by hand unless you choose **Overwrite**.
- **Armour.** Helmets, chestplates, leggings and boots with a vanilla or your own armour material, and the new **equipment** element for how armour looks when worn.
- **Custom tool materials.** Tools with your own durability, mining speed, attack bonus and enchantability, mining like a chosen vanilla tier, and optional attack damage and speed.
- **Weapons, consumables and totems.** Spears, maces, bows, crossbows and shields; food and drinks with effects, items with a cooldown, and totems that save their holder from death; horse and wolf armour. The Events editor has a new **Apply effect** action. These, and other vanilla item components, are set in the Item Studio's **Advanced (all fields)** or **Raw JSON**, or made by the Creator.
- **Starter wizards.** **Custom ore**, **Custom mob** and the new **Custom sword** starter ask a few questions (name, colour, tier and more) in a step-by-step **New project** dialog before they create the project.
- **A second Minecraft version.** New projects can target Minecraft 26.4 (a snapshot) as well as 26.3: choose it under **Minecraft version** in the **New project** dialog. **File → Upgrade Project Target…** moves a project to another version and shows what changes first; the status bar shows the project's version. Mobs cannot be exported for 26.4 yet, because GeckoLib has no build for it.
- **Plugins made by other people.** MCSuperMods loads plugins from `.msm/plugins` in your home folder, in a sandbox without network or file access. **Settings → Plugins** lists them as loaded, refused or failed, with **Open plugins folder**; changes take effect after restarting MCSuperMods. Each release now carries the plugin API package (`msm-plugin-api-1.2.0.tgz` for this one) for plugin authors.
- More content: 125 element templates (armour, weapons, drinks, totems, equipment and painting variant tags among them), 24 project starters and 71 examples.

### Changed

- **Help → Examples…** and starters copied into a project now add missing lines to language files and tags that already exist, instead of skipping them, and never add a second `pack.mcmeta` or mod element.
- The toolbar buttons Undo, Redo, Add namespace, Import assets, AI helper and Settings show icons only (their names appear as tooltips), so the toolbar fits on one line.

### Fixed

- A project whose only data pack content comes from a plugin's element (for example the sample **Greeting**) can now export its data pack; before, **Export** said the project had no data pack content.

## [0.6.1] - 2026-11-05

### Added

- **What's new.** After an update, MCSuperMods shows what changed in the new version once. You can open it again at any time from **Help > What's New…** or the command palette ("What's new…"), and from the update banner before you restart.
- **Update notifications.** With **Check for updates automatically** on (Settings > Updates), MCSuperMods checks a few seconds after it starts and then every six hours. A new version shows the banner "Version X is available, downloading…" on its own, then "Version X is ready" with **Restart to update**, plus a Windows notification once the download has finished.

### Changed

- **New project**, **New from starter**, **Open project** and **Open as new project** in the Examples gallery now open their folder picker where you last chose a project folder, instead of the default folder every time.

### Fixed

- A new version published while MCSuperMods was already open was only found by **Help > Check for Updates…**; the app now looks again every six hours and tells you without a click. Copies of 0.6.0 and older still check only once at start-up, so restart the app (or use **Help > Check for Updates…**) to get this version.

## [0.6.0] - 2026-11-05

### Added

- **Scripting with TypeScript.** Add a script from a template under **Scripts** (or start from the **Scripted ore** starter) and edit it in the **Script Studio**, a TypeScript editor that completes the `msm` API as you type and checks each script as you go. Scripts react to block, item and mob events, schedule work and define new actions.
- A block, item or mob event can call a script with the new `run_script` action.
- Scripts travel in the Fabric mod jar and run on the server in a sandbox: no access to Java, files or the network, and at most two seconds per call.
- **Export Java project (eject).** **File > Export Java Project…** writes your blocks, items and mobs as a standalone Fabric Gradle project with generated Java, which builds with `./gradlew build` and JDK 25. It is one-way, and scripts are not included.
- The ejected projects are tested to behave the same as the Fabric mod jar (parity tests).
- More content: 116 element templates, 13 starters and 69 examples.

## [0.5.0] - 2026-11-05

### Added

- **Custom mobs.** A new entity kind with health, speed, goals (wander, melee attack, flee, follow and more), natural spawning in chosen biomes, a spawn egg and events, including `play_animation`.
- **Blockbench import.** **File > Import Blockbench Model…** reads a `.bbmodel` project (Blockbench 4 and 5) or Blockbench's `.geo.json` and `.animation.json` exports; the model, its animations and texture appear under **Models and animations**.
- **Entity Studio** to set up a mob: model, texture, animations, stats, goals, spawning and events.
- **Animated preview.** The **Preview** tab plays the model's animations.
- Mobs export in the same Fabric mod jar, which carries GeckoLib (downloaded once on the first export with mobs).
- **Separate runtime and GeckoLib (for modpacks)** leaves both out of the jar for modpacks that already have them.
- The **Custom mob** starter (an animated Ruby Golem).

## [0.4.0] - 2026-11-05

### Added

- **Custom blocks and items.** New blocks and items with behaviour (components and events such as dropping items, playing sounds or giving effects), edited in the **Block Studio** and **Item Studio**.
- **Export Fabric mod jar.** **File > Export Fabric Mod Jar…** (or **Fabric mod (.jar)…** in the Export menu) makes one jar with your blocks, items, resources and data, plus the small `msm_runtime` mod that runs them.
- **Test in Minecraft.** **File > Test in Minecraft…** copies the jar into a Prism Launcher or MultiMC instance with Fabric, adds Fabric API when missing and starts the game. **Create test instance** makes a ready instance when you have none.

### Changed

- The **Custom ore** starter now adds a real Ruby Ore block, a Ruby item and a Block of Ruby, instead of reusing vanilla blocks.

## [0.3.0] - 2026-11-05

### Added

- **Structures.** **File > Import Structure…** reads `.nbt` structure files and Sponge `.schem` schematics; **More Exports** writes them back out. The **Structure Studio** shows a 3D preview and edits size, palette and jigsaws; the **Template Pool Studio** edits jigsaw pools.
- **Worldgen.** Custom biomes (with colour pickers in the **Biome Studio**), configured and placed features, structure sets, dimensions, World Types, noise settings and the other worldgen kinds, plus a climate map.
- Project checks that find broken references between elements before you export.
- Worldgen starters: **Custom biome**, **Jigsaw village-style structure** and **Custom biome with a jigsaw structure**.
- **Install Data Pack…** shows each world's real name.
- **File > Open Recent** and a recent projects list on the start screen.

### Fixed

- **Help > Check for Updates…** says when no release has been published yet, instead of claiming the app is up to date.

## [0.2.2] - 2026-11-04

### Added

- **Templates and examples.** A template for every element kind in **Add element**, grouped by category with a filter box.
- Project starters under **New from starter…**, such as **Custom ore**, **Recipe pack**, **Custom music disc** and **Functions**.
- An examples gallery under **Help > Examples…** that opens an example as a new project or copies it into yours in one undoable step.

## [0.2.1] - 2026-11-04

### Fixed

- The **Game locations** list in Settings no longer hides rows or scrolls sideways with long paths.
- A hint now appears when the official launcher folder is really a launcher instance, with a button to select that instance.

## [0.2.0] - 2026-11-04

### Added

- **Data Pack Studio.** Recipes (with the **Recipe Studio**), loot tables, advancements, predicates, item modifiers and tags (with the tag editor), and more data kinds as forms.
- A **function editor** for `.mcfunction` files that shows problems and completes commands as you type.
- Export a data pack, or both packs together, and install a data pack into a world.
- **References and renaming.** Go to definition, find usages and rename an element everywhere in one step (F2).
- A command palette (Ctrl+Shift+P).
- Animated texture preview.
- **Prism Launcher, MultiMC and CurseForge support.** Install packs into a launcher instance and read preview textures from any launcher's copy of the game.
- **In-app updates.** The installed Windows app downloads new versions in the background and installs them when you choose **Restart to update**.

### Fixed

- **Help > Check for Updates…** gives a short, friendly message instead of a long technical error.

## [0.1.0] - 2026-11-04

### Added

- First release: the **Resource Pack Studio**. Import textures, edit block and item models, blockstates, language files, sounds and `pack.mcmeta` in guided forms or as Raw JSON, with a live 3D preview.
- Export a resource pack as a `.zip`, or install it straight into your Minecraft `resourcepacks` folder.
- Windows installer (unsigned, so Windows SmartScreen warns on the first run).

[Unreleased]: https://github.com/MEZTKING/MCSuperMods/compare/v0.7.0...HEAD
[0.7.0]: https://github.com/MEZTKING/MCSuperMods/releases/tag/v0.7.0
[0.6.1]: https://github.com/MEZTKING/MCSuperMods/releases/tag/v0.6.1
[0.6.0]: https://github.com/MEZTKING/MCSuperMods/releases/tag/v0.6.0
[0.5.0]: https://github.com/MEZTKING/MCSuperMods/releases/tag/v0.5.0
[0.4.0]: https://github.com/MEZTKING/MCSuperMods/releases/tag/v0.4.0
[0.3.0]: https://github.com/MEZTKING/MCSuperMods/releases/tag/v0.3.0
[0.2.2]: https://github.com/MEZTKING/MCSuperMods/releases/tag/v0.2.2
[0.2.1]: https://github.com/MEZTKING/MCSuperMods/releases/tag/v0.2.1
[0.2.0]: https://github.com/MEZTKING/MCSuperMods/releases/tag/v0.2.0
[0.1.0]: https://github.com/MEZTKING/MCSuperMods/releases/tag/v0.1.0
