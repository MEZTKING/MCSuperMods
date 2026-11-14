# Sample mod project

A kitchen-sink MCSuperMods project for the Fabric content jar (ADR 0026 D6), namespace `msm_sample_mod`: an `msm:mod`, eleven custom blocks and seventeen custom items that between them use the block and item components and ten actions (armour and a custom tool material since ADR 0042; a bow, a drink, a charm with `apply_effect` and horse armour since ADR 0044; two custom status effects, a drink that gives one, a throwing dart and a boomerang since ADRs 0055 and 0056; a brewable potion of one of them with longer and stronger versions since ADR 0063; two project sound events and a jump-pad block that works on mobs since ADRs 0057 and 0058; a half block, a plant and a glass-like block with `msm:shape` since ADR 0059; since ADRs 0060 and 0061 ruby ore that generates in overworld biomes through a world addition, an extra zombie drop, a fuel and compost item, and one item or block per item and block trigger), plus an equipment asset, a `sounds.json`, an ore feature and its placed feature, three functions and one loot table. Block and item models are vanilla ones; the only textures are the three placeholder armour layers of the ruby equipment asset (`assets/msm_sample_mod/textures/entity/equipment/humanoid/ruby.png` and `humanoid_leggings/ruby.png`, plain tinted 64x32 sheets, and `horse_body/ruby.png`, 64x64, drawn by the test) and the two 18x18 effect icons (`textures/mob_effect/ruby_rush.png` and `ruby_sting.png`, the library's `effect_icon` placeholder in each effect's colour).

`packages/exporters/test/sample-mod.golden.test.ts` checks it on every run:

- the folder equals the elements listed in the test saved as a project (it fails when the list changes and this folder is not regenerated);
- every element validates with zero problems, the project validators report nothing, and the function passes the offline mcfunction checker;
- the content jar exports with zero problems (with a stub runtime jar), and its SHA-256 is pinned per target, built in two time zones;
- the jar holds the thirty-five expected `msm/` definitions (11 blocks, 17 items, 2 effects, 3 potions, 1 biome addition, 1 loot addition), the fifteen brewing recipes under `data/msm_sample_mod/recipe/brewing/` (the base potion from a ruby uses the project's own item), the four potion name keys, the feature and placed feature under `data/msm_sample_mod/worldgen/`, `assets/msm_sample_mod/sounds.json`, the equipment asset and its three layer textures, the two effect icons and the effects' `effect.msm_sample_mod.<id>` names, and each definition validates against the MSM definition schema.

CI's `engine-mod` job then builds `msm_runtime` with Gradle, exports this project with the real runtime nested, and starts a headless Fabric dedicated server with it (`tools/run-fabric-server`). The server must log `[msm_runtime] registered 2 sound event(s)`, `[msm_runtime] registered 3 potion(s)` (CI's `--expect-line`), `[msm_runtime] registered 1 biome addition(s) and 1 loot addition(s)`, `[msm_runtime] registered 11 block(s) and 27 item(s) from 35 definition file(s); 0 error(s), 0 warning(s)` (then `registered 0 entity type(s) and 2 mob effect(s)`) and nothing else from the runtime at warning or error level. The jar is kept as the workflow artefact `msm-sample-mod`.

The same job also exports this project as a Java project (ADR 0033; `sample-mod.java.golden.test.ts` with `MSM_SAMPLE_MOD_JAVA_OUT`), builds it with its own `./gradlew build`, and runs the behaviour-parity GameTests of `engine-mod/parity/` (`SampleModParityTest`: every block's light, hardness, resistance, tool requirement, sound type, loot table and block item; the items' food, tool, durability, rarity and stack size; the ruby helmet's slot, equipment asset, defence, toughness, knockback resistance, durability, repair item and enchantability; the ruby pickaxe's custom material (durability, attack values, mining speed, not enchantable, and obsidian broken by a survival player drops obsidian while a stone pickaxe's does not); the ruby ore's and ruby apple's function (its `say` line), the chime block's glowstone from stepping (with the per-entity cooldown) and from redstone, its zero signal, the wand's rubies and cooldown; the ruby bow's durability and its faster, harder-hitting arrows after a short draw against the vanilla bow's; the ruby tonic's drink animation, effects, glass bottle and cooldown; the ruby charm's two effects (on the user, `self` and `other`), cooldown and that it is not used up; the ruby horse armour's body slot, horse-only wearer, equipment asset, defence and toughness; since ADRs 0055 and 0056: both effects registered with their category, colour and name key; Ruby Rush's movement speed at levels I and II and gone after removal; its start (the `ruby/rush` chat line, once, not again on a refresh), its end (glowing, on removal and when it runs out) and its tick heal; Ruby Sting's tick damage; the Ruby Elixir giving Ruby Rush II with a glass bottle back; a thrown dart as a projectile carrying the dart, owned by the thrower, at speed 2 with the default gravity; a dart hit dealing 3 damage, giving the mob hit Ruby Sting and dropping the dart; a dart landing on a block dropping where it lands; the boomerang thrown only after 10 ticks of holding and back in the inventory with one durability used; a dispenser throwing one dart and having no behaviour for the boomerang; since ADRs 0057 and 0058: both project sound events registered as variable-range events and decoded from the bare key by `SoundEvent.CODEC`; the tonic's consumable sound and the helmet's equip sound encoded as the bare key `msm_sample_mod:ruby.clink`; `chime.ring` heard when the chime block loses power, `ruby.clink` heard by another player when the tonic is drunk and when an armour stand is given the helmet (sound packets read from a listening player, `ParityEars`); a pig stepping on the ruby spring gets Jump Boost, the `msm_sample_sprung` tag from `ruby/spring` run as the pig, and rises; a player gets the effect, the tag and an upward velocity; the step cooldown is per dimension; since ADR 0059: the ruby slab's outline and collision are the bottom half, the ruby sprout's outline is the 12 by 12 by 16 cross box with no collision, the ruby glass is a full cube; all three occlude nothing, let sky light down, never suffocate, block the view or conduct redstone, refuse a zombie spawn and have no visual shape, and the glass answers as vanilla glass and hides only faces against itself; an armour stand comes to rest on top of the slab and falls through the sprout to the floor, walks through the sprout and is stopped by the glass; sky light below the ruby glass is 15; since ADRs 0060 and 0061, in `SampleModAdditionsParityTest`: the placed feature `ore_ruby_placed` is in the plains, forest and desert biomes' features at `underground_ores` and not in the nether, and its feature turns stone into ruby ore; the zombie loot table keeps its four vanilla pools and has one more that rolls exactly one ruby, a killed zombie drops a ruby, and after a real `/reload` (in a test environment of its own) the table is loaded again with the pool once; the ruby tinder lights a furnace and smelts and raises a composter on every insert; the ruby sword slows the cow it hits, held by a player and by a vindicator, and an iron sword does not; the ruby trowel puts a gold block on the clicked block and not again during its 20-tick cooldown; the ruby purse gives exactly four rubies over 40 ticks in the main hand and in the off hand and none from a backpack slot; the ruby crown gives Night Vision to a player and a mob wearing it and not to a player holding it; breaking the ruby cache gives three rubies in survival and in creative; placing the ruby beacon, by a player or with no placer, puts a lapis block on top, a plain `setblock` does not; a random tick of the ruby bloom puts red wool on top; a cow in the ruby mist gets Weakness, not again within the 20-tick cooldown, and again after it; since ADR 0063, in `SampleModPotionParityTest`: `ruby_draught`, `long_ruby_draught` and `strong_ruby_draught` are registered with Ruby Rush for 3:00, 8:00 and 1:30 (level II) and share the name `msm_sample_mod.ruby_draught`; the potion, splash, lingering and arrow names translate to "Potion of Ruby Rush" and so on; each of the fifteen brewing steps (a ruby on an awkward potion, redstone, glowstone dust, gunpowder and dragon's breath, in each bottle) is found by the recipe manager and a ruby does nothing to a water bottle; a real brewing stand with three awkward potions, a ruby and blaze powder brews three potions of Ruby Rush; drinking each version gives its time and level and the `ruby/rush` chat line; a strong splash potion gives a cow Ruby Rush II; a lingering potion leaves a cloud that gives a cow Ruby Rush; eight arrows around a lingering long potion craft eight tipped arrows, one of which gives a cow Ruby Rush; the creative tabs list every version as a potion, splash and lingering potion and tipped arrow) three times: on the content jar with `msm_runtime` for 26.3 and for 26.4, and on the ejected jar (26.3) without it on the content jar with `msm_runtime` and on the ejected jar without it (`tools/run-fabric-server --gametest ... --gametest-filter 'msm_parity_tests:sample_mod_*'`, `--no-runtime` for the ejected jar, which registers the potions in `ModPotions`). The same tests passing on all is the parity check (68 tests since B255); the ejected jars and the GameTest reports are kept as the artefacts `msm-ejected-jars` and `parity-gametest-reports`.

The entity counterpart, an animated GeckoLib mob checked the same way, is `fixtures/sample-mob/` (see its README).

## Contents

| Element | Kind | What it shows |
|---|---|---|
| `msm_sample_mod:mod` | mod metadata | `fabric.mod.json`: id `msm_sample_mod`, version 1.0.0, MIT |
| `msm_sample_mod:ruby_ore` | block | `msm:breakable` (pickaxe, iron tier), `msm:light_emitter` 7, `msm:on_interact` (`play_sound`, `spawn_particle`, `run_function`), loot table override, Natural Blocks tab |
| `msm_sample_mod:chime_block` | block | `msm:redstone` (powered and unpowered events), `msm:on_step` with a 20-tick cooldown, `set_block_state`, `trigger_event`, the project sound `chime.ring` when power goes off, axe and copper tier without needing the tool, wood sounds, stack of 16, uncommon, Redstone Blocks tab |
| `msm_sample_mod:ruby_spring` | block | a jump pad: `msm:on_step` with a 10-tick cooldown gives whoever steps on it, player or mob, Jump Boost for 5 seconds (`apply_effect`), launches it up at strength 1 (`launch`) and runs `ruby/spring` as it; slime block look, stone sounds, pickaxe |
| `msm_sample_mod:glow_stone` | block | no block item (`"item": false`), light 15, shovel, netherite tier, glass sounds |
| `msm_sample_mod:ruby_slab` | block | `msm:shape` preset `slab_bottom`: a fixed bottom half block (outline and collision 16 by 8 by 16, see-through by default), smooth stone slab look, pickaxe, Building Blocks tab |
| `msm_sample_mod:ruby_sprout` | block | `msm:shape` preset `cross`: a walk-through plant (outline 12 by 12 by 16, no collision), poppy look (a cut-out texture), breaks instantly, grass sounds, Natural Blocks tab |
| `msm_sample_mod:ruby_glass` | block | `msm:shape` preset `full` with `see_through`: a glass-like cube (light passes, faces against itself hidden, no mob spawns), red stained glass look (a translucent texture), glass sounds, Building Blocks tab |
| `msm_sample_mod:ruby` | item | plain item, uncommon, Ingredients tab |
| `msm_sample_mod:ruby_wand` | item | `msm:tool` (gold sword), `msm:durability` 32, `msm:on_use` with a 10-tick cooldown (`give_item`, `spawn_particle`, `trigger_event`), epic |
| `msm_sample_mod:ruby_pickaxe` | item | `msm:tool` pickaxe with a custom material (durability 1200, speed 9, attack bonus 3, mines like diamond through `#minecraft:incorrect_for_diamond_tool`, repaired by diamonds, `enchantment_value` 0 so not enchantable) and `attack_speed` -2.6, rare |
| `msm_sample_mod:ruby_helmet` | item | `msm:armor` helmet with a custom material (base durability 25, defence 3/7/5/2, toughness 1, knockback resistance 0.05, enchantment value 12, the project sound `msm_sample_mod:ruby.clink` as its equip sound, repaired by diamonds), equipment asset `msm_sample_mod:ruby_armor`, rare, Combat tab |
| `msm_sample_mod:ruby_armor` | equipment | the horse body, humanoid and humanoid leggings layers, all `msm_sample_mod:ruby` (the element is not called `ruby` because the item has that id) |
| `msm_sample_mod:ruby_horse_armor` | item | `msm:armor` slot `horse` with a custom material (base durability 25, the chestplate defence 9 on the horse, toughness 1, repaired by diamonds), equipment asset `msm_sample_mod:ruby_armor`, rare, Combat tab |
| `msm_sample_mod:ruby_bow` | item | `msm:ranged_weapon` bow: draw speed 2, velocity 1.5, damage multiplier 1.5, rare, Combat tab |
| `msm_sample_mod:ruby_tonic` | item | `msm:consumable` drink (1 second): speed II for 30 seconds and regeneration for 5, leaves a glass bottle, 3 second cooldown, drinking sound `msm_sample_mod:ruby.clink`, stack of 16, Food & Drinks tab |
| `msm_sample_mod:ruby_charm` | item | `msm:on_use` with a 100-tick cooldown running two `apply_effect` actions (speed II for 10 seconds on the user, glowing for 2 seconds on the `other` target, the user too in item events), not used up, uncommon, Tools & Utilities tab |
| `msm_sample_mod:ruby_apple` | item | `msm:food` (4 nutrition, can always eat) with `msm:on_use` (`spawn_particle`, `run_function`), stack of 16 |
| `msm_sample_mod:ruby_rush` | effect | beneficial, colour `#E0115F`, chime sound when added; movement speed times 1.2 per level (`add_multiplied_total` 0.2); `msm:on_start` runs `ruby/rush`, `msm:on_tick` heals 1 every 10 ticks, `msm:on_end` gives glowing for 3 seconds; icon `textures/mob_effect/ruby_rush.png` |
| `msm_sample_mod:ruby_sting` | effect | harmful, colour `#8B0000`, crit particles instead of the swirl; `msm:on_tick` `damage` 1 every 20 ticks; icon `textures/mob_effect/ruby_sting.png` |
| `msm_sample_mod:ruby_draught` | potion | Ruby Rush for 3:00 (3600 ticks), brewed from an awkward potion and a **ruby** (the project's own item); `long` 8:00 with redstone (`long_ruby_draught`) and `strong` Ruby Rush II for 1:30 with glowstone dust (`strong_ruby_draught`); splash and lingering bottles (gunpowder, dragon's breath) and tipped arrows; names "Potion of Ruby Rush" and so on; three runtime definitions and fifteen brewing recipes |
| `msm_sample_mod:ruby_elixir` | item | `msm:consumable` drink (1 second) giving Ruby Rush II for 20 seconds, leaves a glass bottle, stack of 16, Food & Drinks tab |
| `msm_sample_mod:ruby_dart` | item | `msm:throwable`: speed 2, damage 3, `after_throw` `drop` (picked up again), `on_hit_entity` gives the mob hit Ruby Sting for 10 seconds; stack of 16, Combat tab, arrow look |
| `msm_sample_mod:ruby_boomerang` | item | `msm:throwable` held to throw (`charge_ticks` 10), `after_throw` `return`, trident throw sound, not dispensable; `msm:durability` 64, uncommon, Combat tab, breeze rod look |
| `msm_sample_mod:ore_ruby` | worldgen feature | an ore vein of up to 6 ruby ore blocks replacing stone and deepslate |
| `msm_sample_mod:ore_ruby_placed` | placed feature | 6 tries per chunk, spread in the chunk, from y -64 to 32, kept to the biomes that list it |
| `msm_sample_mod:ruby_ore_generation` | world addition | adds `ore_ruby_placed` at `underground_ores` to every biome in `#minecraft:is_overworld` (ADR 0060 D2): new chunks only |
| `msm_sample_mod:zombie_drops_ruby` | extra drops | one pool for `minecraft:entities/zombie`: every zombie drops one ruby, besides its vanilla drops (ADR 0060 D3) |
| `msm_sample_mod:ruby_tinder` | item | `fuel` 20 seconds (400 ticks, two smelts) and `compost` "100%", lowered to the vanilla `cooking_fuel` and `compostable` components (ADR 0060 D4); blaze powder look |
| `msm_sample_mod:ruby_sword` | item | `msm:tool` iron sword with `msm:on_hit`: the entity hit (`other`) gets Slowness for 5 seconds, whoever holds the sword, player or mob |
| `msm_sample_mod:ruby_trowel` | item | `msm:on_use_on_block` with a 20-tick cooldown: a gold block on top of the clicked block (`set_block_state`, offset up) |
| `msm_sample_mod:ruby_purse` | item | `msm:while_held` in either hand every 10 ticks: one ruby (`give_item`) |
| `msm_sample_mod:ruby_crown` | item | `msm:armor` gold helmet with `msm:while_worn` every 10 ticks: Night Vision for 15 seconds |
| `msm_sample_mod:ruby_cache` | block | `msm:on_break`: whoever breaks it, in any game mode, gets three rubies; barrel look, axe |
| `msm_sample_mod:ruby_beacon` | block | `msm:on_place`: a lapis block on top when it is placed; lodestone look, pickaxe |
| `msm_sample_mod:ruby_bloom` | block | `msm:on_random_tick` (chance 1): red wool on top; it gets random ticks only because of the trigger |
| `msm_sample_mod:ruby_mist` | block | a walk-through cross (`msm:shape` preset `cross`) with `msm:on_entity_inside` (cooldown 20): Weakness for 5 seconds for the entity inside; cobweb look |
| `msm_sample_mod:ruby/shimmer` | function | `particle` and `say`, run by the ruby ore and the ruby apple |
| `msm_sample_mod:ruby/spring` | function | `tag @s add msm_sample_sprung`, run by the ruby spring as whoever stepped on it |
| `msm_sample_mod:sounds` | sounds | `assets/msm_sample_mod/sounds.json` with two project sound events: `chime.ring` (the vanilla amethyst resonance file) and `ruby.clink` (the vanilla glass file); the runtime registers both, so the `msm:` elements name them as plain ids (ADR 0057) |
| `msm_sample_mod:ruby/rush` | function | `say The ruby rush begins.`, run when Ruby Rush starts |
| `msm_sample_mod:blocks/ruby_ore_rich` | loot table | 1 to 3 rubies, survives explosions |

All content is original work written for MCSuperMods; the project contains no Mojang files.

## In-game check (Windows, Minecraft Java 26.3)

You need the content jar, Fabric Loader 0.20.1 or newer for 26.3, and Fabric API 0.165.2+26.3 (or newer for 26.3). The jar contains `msm_runtime`; do not install the runtime separately.

**Get the jar**, either way:

- from the latest CI run: Actions → CI → the run → Artifacts → `msm-sample-mod`, unzip to get `msm_sample_mod.jar`; or
- from the app: copy this folder outside the repository, open it in MCSuperMods and export the Fabric mod jar (runtime nested, the default).

**Install it**, with one of:

- **Prism Launcher**: Add Instance → Minecraft 26.3 → Mod loader **Fabric** (0.20.1 or newer) → OK. Open the instance's **Mods** page, **Download mods**, pick **Fabric API** for 26.3, then **Add file** and choose `msm_sample_mod.jar`. Launch.
- **Official launcher**: run the Fabric installer from fabricmc.net (Client, Minecraft 26.3, loader 0.20.1 or newer). Put the Fabric API jar for 26.3 (from Modrinth or CurseForge) and `msm_sample_mod.jar` into `%APPDATA%\.minecraft\mods`. Start the `fabric-loader-…-26.3` profile.

Create a new **Creative** world with cheats on, then check:

| Check | Expected |
|---|---|
| Title screen → **Mods** (Prism shows the list too) | `MSM Sample Mod 1.0.0`, and `MSM Runtime` listed with it |
| Creative tab **Natural Blocks** | **Ruby Ore**, looking like redstone ore |
| Creative tab **Redstone Blocks** | **Chime Block** (yellow name), looking like a note block; it stacks to 16 |
| Creative tab **Ingredients** | **Ruby** (yellow name), looking like an emerald |
| Creative tab **Tools & Utilities** | **Ruby Wand** (light purple name, blaze rod look), **Ruby Pickaxe** (aqua name, diamond pickaxe look) and **Ruby Charm** (yellow name, heart of the sea look) |
| Creative tab **Combat** | **Ruby Helmet** (aqua name, diamond helmet look), **Ruby Horse Armour** (aqua name, diamond horse armour look) and **Ruby Bow** (aqua name, bow look) |
| Put on the Ruby Helmet (F5 for the third-person view) | The helmet drawn on your head is the flat ruby-red placeholder layer, not diamond; the armour bar shows one and a half armour icons (3 points); a glass clink plays (the project sound `ruby.clink`, not the diamond equip sound) |
| Hover over the Ruby Pickaxe and the Ruby Helmet in the inventory | The pickaxe shows 5 attack damage and 1.4 attack speed; the helmet +3 armour, +1 armour toughness and +0.5 knockback resistance |
| Put the Ruby Pickaxe into an enchanting table | It cannot be enchanted (no offers); the Ruby Helmet can |
| Creative tab **Food & Drinks** | **Ruby Apple**, looking like an apple, and **Ruby Tonic**, looking like a honey bottle; both stack to 16 |
| Drink the Ruby Tonic (Survival, any hunger) | A short drinking animation (1 second); Speed II for 30 seconds and Regeneration for 5; a glass bottle is left; the tonic cannot be drunk again for 3 seconds (the slot greys out) |
| Right-click with the Ruby Charm | Speed II for 10 seconds and a 2-second glow outline; the charm stays in your hand; it does nothing again for 5 seconds |
| Shoot the Ruby Bow (arrows in your inventory, Survival) | It reaches full draw in about half a second (the vanilla bow takes one; the pull animation still follows vanilla timing); arrows fly further and hit harder than the vanilla bow's |
| Summon a tamed horse (`/summon horse ~ ~ ~ {Tame:1b}`), open its inventory (sneak and right-click) and put the Ruby Horse Armour in the armour slot | The horse shows the flat ruby-red placeholder layer; it cannot be put on a wolf |
| Search for "Glow Stone" | Nothing: it has no item. `/setblock ~2 ~ ~ msm_sample_mod:glow_stone` places a glowstone-looking block with light level 15 (F3 shows block light 15 beside it) |
| Place Ruby Ore at night or underground | It glows (light level 7) |
| Right-click Ruby Ore | An amethyst chime, glow particles, end rod particles and the chat line `The ruby shimmers.` |
| Step onto a Chime Block | A bell note and a glowstone block appears on top; again at most once a second while you walk on it |
| Put a lever on a Chime Block and switch it on, then off | On: a bell note and glowstone on top. Off: the block on top disappears and the amethyst resonance plays (the project sound `chime.ring`) |
| Right-click with the Ruby Wand | Two Rubies in your inventory, electric sparks and a thunder impact sound; it cannot be spammed faster than twice a second |
| Hit a mob with the Ruby Wand (switch to Survival: `/gamemode survival`) | A durability bar appears; the wand breaks after 32 uses |
| Eat the Ruby Apple with a full hunger bar (Survival) | You can eat it anyway; green sparkles and `The ruby shimmers.` appear when you use it; two hunger points come back |

Then, in **Survival** (`/gamemode survival`):

| Check | Expected |
|---|---|
| Mine Ruby Ore with an iron, diamond or Ruby Pickaxe | It drops 1 to 3 Rubies |
| Mine Ruby Ore with a stone pickaxe or by hand | It drops nothing |
| Mine a Chime Block with an axe, and by hand | It drops itself both ways; the axe is faster |
| Mine Glow Stone with a shovel | It breaks and drops nothing (it has no item) |
| Mine obsidian with the Ruby Pickaxe, and with a stone pickaxe | The Ruby Pickaxe breaks it a little faster than a diamond pickaxe (speed 9 against 8) and it drops obsidian; the stone pickaxe takes very long and drops nothing |
| Wear the Ruby Helmet and take damage until it breaks, or repair it with a diamond in an anvil | The durability bar starts at 275; a diamond repairs it |

Finally open the game log (Prism: the instance's **Minecraft Log**; official launcher: `%APPDATA%\.minecraft\logs\latest.log`) and check that it has the line

```
[msm_runtime] registered 2 sound event(s)
[msm_runtime] registered 7 block(s) and 18 item(s) from 21 definition file(s); 0 error(s), 0 warning(s)
[msm_runtime] registered 0 entity type(s) and 2 mob effect(s)
```

and no other line containing `[msm_runtime]` at WARN or ERROR, no `Failed to load` and no missing-model or missing-texture warning mentioning `msm_sample_mod`. Report any such line.

### Effects and throwables (ADRs 0055 and 0056)

Back in **Creative**, then **Survival** where the table says so:

| Check | Expected |
|---|---|
| Creative tab **Food & Drinks** | **Ruby Elixir**, looking like a bottle o' enchanting; it stacks to 16 |
| Creative tab **Combat** | **Ruby Dart** (arrow look, stacks to 16) and **Ruby Boomerang** (yellow name, breeze rod look) |
| Drink the Ruby Elixir (Survival) | A chime and the chat line `The ruby rush begins.`; a glass bottle is left; you walk noticeably faster (FOV widens) |
| Look at the effect while it runs: the top-right HUD corner and the inventory screen (E) | The **Ruby Rush II** icon is the round ruby-pink placeholder badge with a sparkle (not the purple-black missing texture); the inventory shows the name "Ruby Rush II" and the time left; the bar or frame is the "good effect" kind |
| Look at yourself in third person (F5) while Ruby Rush runs | Swirl particles around you tinted ruby pink (`#E0115F`) |
| Take some damage (`/damage @s 6`) while Ruby Rush runs | Health comes back by half a heart every half second |
| Wait until Ruby Rush runs out (20 seconds), or `/effect clear @s msm_sample_mod:ruby_rush` | You glow (outline) for 3 seconds; your speed is back to normal |
| `/effect give @s msm_sample_mod:ruby_sting 10` | A dark red badge icon with the "bad effect" look; crit particles (not swirls) around you; you lose half a heart every second |
| Right-click with Ruby Darts, first and third person (F5) | A dart leaves at once with the snowball throw sound; **in flight it is drawn as the arrow item picture facing the camera** (not invisible, not a snowball); one dart is used per throw |
| Throw a Ruby Dart at a cow or zombie | It takes damage (one and a half hearts) and gets Ruby Sting (dark red particles); the dart drops beside it |
| Walk over a dart that landed | **You pick it up again** like any dropped item |
| Hold right-click with the Ruby Boomerang | **The arm raises like a held trident or spear** while you hold; releasing before half a second does nothing; after it, the boomerang flies with the trident throw sound and disappears from your hand. Report which animation it is (`SPEAR` today) and whether `TRIDENT` would look better |
| Let the boomerang land | It is back in your inventory (or at your feet when the inventory is full), with a little durability gone |
| Put Ruby Darts in a dispenser and power it with a button | **The dispenser shoots a dart** (drawn in flight as above), using one; a Ruby Boomerang in a dispenser is dropped as an item instead of thrown |

### Potions (ADR 0063)

CI proves registration, the brewing recipes, a brewing stand run and the effects on a GameTest server; these need the game. Check in **Survival** on 26.3 and, with the 26.4 jar, on 26.4. Get blaze powder, nether wart, water bottles, rubies (`/give @s msm_sample_mod:ruby 8`), redstone, glowstone dust, gunpowder, dragon's breath and arrows first (`/give` in Creative, then `/gamemode survival`).

| Check | Expected |
|---|---|
| Creative inventory: search "Ruby Rush" (or open the **Food & Drinks** and **Combat** tabs) | Potion, Splash Potion and Lingering Potion of Ruby Rush, each three times (3:00, 8:00, Ruby Rush II 1:30), and Arrows of Ruby Rush; the bottles are tinted ruby pink |
| Brewing stand: three water bottles and nether wart, then a **ruby** (fuel: blaze powder) | Awkward potions, then three **Potions of Ruby Rush** (3:00) |
| Brew one of them with redstone, another with glowstone dust | **Potion of Ruby Rush (8:00)** and **Potion of Ruby Rush II (1:30)** |
| Brew with gunpowder, then with dragon's breath | Splash, then Lingering Potion of Ruby Rush, keeping the time or level |
| Drink a Potion of Ruby Rush | The chat line `The ruby rush begins.`; the Ruby Rush icon; you run faster |
| Throw a Splash Potion of Ruby Rush at a cow | Ruby-pink splash particles; the cow gets Ruby Rush |
| Throw a Lingering Potion of Ruby Rush on the ground and walk into the cloud | A ruby-pink cloud that gives you Ruby Rush |
| Craft eight arrows around a Lingering Potion of Ruby Rush, then shoot one at a cow | Eight **Arrows of Ruby Rush** with ruby-pink tips; the arrow in flight trails ruby-pink particles and the cow gets Ruby Rush |
| Hover over each bottle and arrow | The names above and the effect line with its time; no raw `item.minecraft.potion.effect...` key |

Report any name shown as a raw key, any bottle that is not tinted, and any step of the brewing chain that does not brew.

### Project sounds and jump pads on mobs (ADRs 0057 and 0058)

The container that runs CI has no audio, so these sounds are only confirmed by ear. Turn the **Players** and **Blocks** volume sliders up first.

| Check | Expected |
|---|---|
| Put a lever on a Chime Block and switch it on, then off | Off: **you hear the amethyst resonance** (`chime.ring`), not silence and not the note block chime |
| Drink the Ruby Tonic (Survival) | **A glass clink** (`ruby.clink`) while drinking, not the honey drinking sound and not silence |
| Put on the Ruby Helmet (drag it to the head slot, or right-click it) | **A glass clink**, not the diamond equip sound |
| `/give @s msm_sample_mod:ruby_spring`, place it and walk onto it | You are thrown up several blocks, get Jump Boost for 5 seconds, and again at most twice a second while you stay on it |
| `/summon minecraft:pig` next to the Ruby Spring and push the pig onto it (or lead it on with a carrot) | **The pig is thrown up** and shows Jump Boost particles; `/tag @e[type=pig,limit=1,sort=nearest] list` names `msm_sample_sprung` |
| Open the log | `[msm_runtime] registered 2 sound event(s)` and no warning naming `chime.ring` or `ruby.clink` |

Report any sound that is silent or is the vanilla sound instead.

### Additions to vanilla content and triggers (ADRs 0060 and 0061)

CI proves the registrations and the behaviour above on a GameTest server; these need the game. Check on 26.3 and, with the 26.4 jar, on 26.4.

| Check | Expected |
|---|---|
| Create a **new** world with the jar and look below y 32 in plains or a forest (spectator mode helps; `/locate` does not find features) | Ruby ore (the redstone ore look) appears in stone and deepslate, in small veins; an existing world shows it only in chunks generated after the jar was added |
| Open an old world created before the jar was added and go to already explored ground | No ruby ore there (only new chunks get it) |
| Kill zombies (any way) | Each drops one ruby besides its usual drops (rotten flesh still drops) |
| `/reload`, then kill another zombie | Still exactly one ruby, not two |
| Put `msm_sample_mod:ruby_tinder` in a furnace's fuel slot with two cobblestone | The furnace lights and smelts both (about 20 seconds of burning) |
| Use Ruby Tinder on a composter | The level rises with every one |
| Hit a cow with the Ruby Sword; give a zombie or a vindicator the sword (`/item replace entity @e[type=vindicator,limit=1,sort=nearest] weapon.mainhand with msm_sample_mod:ruby_sword`) and let it hit you | The cow, and you, show Slowness |
| Right-click stone with the Ruby Trowel, twice quickly | A gold block on top of the first; the second click within a second does nothing; no block is placed from the trowel itself |
| Hold the Ruby Purse in the main hand, then in the off hand, then put it in the backpack | Rubies arrive twice a second while it is in either hand, none while it is in the backpack |
| Wear the Ruby Crown, then take it off and hold it | Night Vision while worn; it runs out about 15 seconds after the crown comes off; none while held |
| Break a Ruby Cache in Survival and in Creative | Three rubies each time |
| Place a Ruby Beacon | A lapis block appears on top |
| `/gamerule randomTickSpeed 300` near a Ruby Bloom (set it back to 3 after) | Red wool appears on top within seconds |
| Walk into a Ruby Mist block; lead a cow into it | You and the cow get Weakness, about once a second while inside |

Report any trigger that fires in the wrong slot or hand, twice at once, or not at all.

### Block shapes (ADR 0059)

The container that runs CI draws nothing, so how the shaped blocks look is only confirmed in the game. Check on 26.3 and, with the 26.4 jar, on 26.4. `/give @s msm_sample_mod:ruby_slab 8`, `msm_sample_mod:ruby_sprout 8` and `msm_sample_mod:ruby_glass 16` first.

| Check | Expected |
|---|---|
| Point at a placed Ruby Slab, then at a Ruby Sprout | The slab's black outline is the bottom half of the block; the sprout's is a narrower box (12 by 12 pixels) the full height |
| Walk onto the Ruby Slab, and into the Ruby Sprout | You step up onto the slab and stand half a block up; you walk straight through the sprout |
| Place a Ruby Slab against a stone wall and look at the wall above the slab | The stone face above the slab is drawn (no hole into the world behind it) |
| Look at a Ruby Sprout up close | The poppy is drawn with cut-out edges: the background around the petals is the world behind, not black or white |
| Build a 3 by 3 wall of Ruby Glass and look through it | Red stained glass you can see through, with no faces drawn between two glass blocks and **no holes into the world** (the blocks behind and under it are drawn); the same on 26.4 |
| Put Ruby Glass over a dark cave opening in daylight (F3 shows `Sky` light) | The block below the glass gets full sky light (15) |
| Stand with your head inside a Ruby Glass block (`/tp` into it) | You do not take suffocation damage and the screen is not darkened |
| Lay an 8 by 8 floor of Ruby Glass on open ground in Survival on Normal difficulty and wait for night | No zombie or skeleton spawns on the glass, as on vanilla glass |

Report any outline or collision that does not match the look, any hole into the world and any black or white fringe around the sprout.

And the two Creator flows, in the app (any project with a Fabric target):

| Check | Expected |
|---|---|
| **Creator → Magic → Status effect**: a name, a colour, "heals", a drink to get it; export the Fabric mod jar and load it with the sample mod | The drink gives the effect; its icon is the tinted placeholder badge; the effect heals as chosen; its name shows in the tooltip and the HUD |
| **Creator → Gear → Throwable**: style "knife that can be picked up again", hold to throw, "when it hits: a vanilla effect"; export and load | The knife is thrown after holding, drawn as its own item picture in flight, gives the effect to the mob hit and can be picked up where it lands |

Things only the game client can confirm, and worth reporting if they look wrong: the block and item models and names (the client loads `assets/` from a mod jar without a `pack.mcmeta`), the creative tab placement and name colours, the particle positions, the tool speeds, the worn helmet's look (the equipment asset and its layer texture), the effect icons, names and tinted particles, the thrown items' look in flight and the hold-to-throw animation.

## Changing the sample

Do not edit these files by hand. Change `SAMPLE_ELEMENTS` (and `SAMPLE_ASSETS` for the textures) in `packages/exporters/test/sample-mod.golden.test.ts`, then regenerate this folder and the pinned hash, and commit the changes on purpose:

```sh
UPDATE_GOLDENS=1 pnpm --filter @msm/exporters test
```

To build the jar with a real runtime locally and run the headless server check (as CI does; JDK 25 on `JAVA_HOME`; the paths must be absolute because the test runs in `packages/exporters`):

```sh
cd engine-mod && ./gradlew build && cd ..
MSM_RUNTIME_JAR="$(ls "$PWD"/engine-mod/build/libs/msm_runtime-*.jar | grep -v sources)" MSM_SAMPLE_MOD_OUT="$PWD/build/sample-mod" \
  pnpm --filter @msm/exporters exec vitest run test/sample-mod.golden.test.ts
node tools/run-fabric-server/index.ts --jar build/sample-mod/msm_sample_mod.jar --facts build/sample-mod/fabric-facts.json
```

This README is not generated and is kept as it is.
