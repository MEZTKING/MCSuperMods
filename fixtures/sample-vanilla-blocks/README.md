# Sample vanilla blocks project

A kitchen-sink MCSuperMods project for the vanilla-like blocks of batch 1 of the vanilla parity plan (ADRs 0094 to 0096 and 0101), namespace `msm_sample_vanilla_blocks`: an `msm:mod`, one block of each of the twenty new block types with the companion blocks they make, a lamp that holds water, tin that ages like copper in four stages with a waxed copy of each, a conveyor, three bags (one of each layout), a bundle, two commands, two creative tabs (one that lists every item but the tin in registration order, and one that lists the tin by name), a script that uses every Script API 1.6 member (B455) and a rule book with the Rules cards for placing, explosions, commands and facing (B458). The pictures are MCSuperMods' own placeholder pictures (and a writing-screen board drawn by the golden test); nothing in the folder is a Mojang file. It works on **26.3** and on **26.4**. Its siblings are `fixtures/sample-mod/` (blocks and items), `fixtures/sample-machines/` (containers and machines) and `fixtures/sample-particles/` (particles).

`packages/exporters/test/sample-vanilla-blocks.golden.test.ts` checks it on every run: the folder equals the project built in code, every element validates with zero problems, the project expands (the rule book compiles) with no problems and the plugins' validators report nothing on either target, both scripts (the hand-written one and the one Rules generates) type-check, the `/kit` function passes the offline command checker, and the content jar exports for both targets with its SHA-256 pinned per target. The jar holds 31 block, 4 item, 2 command and 2 creative tab definitions under `msm/msm_sample_vanilla_blocks/`, the two scripts as JavaScript (`script/script_api_1_6.js` and `script/rules/vanilla_blocks_rules.js`), block states and loot tables for the 31 blocks and the four companions (`ember_torch_wall`, `cedar_sign_wall`, `cedar_hanging_sign_wall`, `gourd_stem_attached`), and the sign writing-screen pictures at `textures/gui/signs/cedar_sign.png` (24 by 26) and `textures/gui/hanging_signs/cedar_hanging_sign.png` (16 by 16). `sample-vanilla-blocks.java.golden.test.ts` pins the Java project export of 26.3 (`ModBlocks.java` with the companions, the shared `block/type/Mod*Block` drivers, `BlockWaxing.java`, the bags in `item/`, `ModCommands.java`, `ModCreativeTabs.java`) from the expanded project, as the app ejects it: the plain rule on `/greet` is part of the command's event there, while both scripts are left out (`export.scripts-not-ejected`, and `export.not-in-eject` for their placing and explosion events, which need the runtime's Mixins), and with them the conveyor's rule and every other rule that needs a script. The vanilla data pack keeps the vanilla tags the types join (with the project's entries optional), the `/kit` function with the warning `export.mod-only-function` (it gives a mod-only item), and the potted grass's loot table (a pot and vanilla grass); every other loot table is left out (`export.mod-only-reference`). This README is the one file in the folder that is written by hand; the test leaves it alone.

To get a jar for the headless server check, run the golden test with `MSM_RUNTIME_JAR=<a built msm_runtime jar>` and `MSM_SAMPLE_VANILLA_BLOCKS_OUT=<folder>`: it writes `msm_sample_vanilla_blocks.jar` and `fabric-facts.json` (31 blocks, 34 items, 0 entities, 2 scripts) there. With `MSM_SAMPLE_VANILLA_BLOCKS_JAVA_OUT=<folder>` the Java golden writes the ejected project, which builds with its own `./gradlew build` (JDK 25).

## Contents

| Element | Kind | What it shows |
|---|---|---|
| `mod` | mod metadata | `fabric.mod.json`: id `msm_sample_vanilla_blocks` |
| `vanilla_blocks` | creative tab | the tab **Vanilla Blocks** with the Paper Lantern as its icon (`as_listed`); every item below but the tin joins it, block items first, then items, each by id |
| `tin_blocks` | creative tab | the tab **Tin Blocks** with the Block of Tin as its icon (`by_name`): the eight tin blocks sorted by name, Block of Tin first and Weathered Tin last |
| `honey_cake` | block, cake | eaten a slice at a time (seven slices), 3 food points a slice; each slice plays a burp (`on_eat`); does not take a candle; stacks to 1 |
| `blue_berry_bush` | block, berry bush | grows through four stages; ripe or full, using it picks 1 to 2 or 2 to 3 **blue berries**, which are also its item and plant it; scratches you as you walk through it |
| `tall_bluebell` | block, tall plant | two blocks high; bone meal drops a copy |
| `potted_grass_tuft` | block, potted plant | vanilla grass in a flower pot, with its own picture; no item of its own (`item: false`) |
| `ivy` | block, vine | hangs on any side of a block, climbable, spreads like vanilla vines |
| `glow_pod` | block, sea pickle | one to four in a block; in water they give light 6, 9, 12 or 15, dry nothing |
| `moss_rug` | block, carpet | a thin rug on top of a block |
| `ash_layer` | block, layers | one to eight layers in a block; never melts |
| `coffee_pod` | block, cocoa | grows in three stages on the side of jungle logs; its item is the **coffee beans** |
| `tallow_candle` | block, candle | one to four in a block, lit with flint and steel (light 3 each), put out by water |
| `cosy_bed` | block, bed | a light blue bed two blocks long; sleep in it at night and it sets your spawn; stacks to 1 |
| `rope_ladder` | block, ladder | climbable, on the side of a block |
| `ember_torch` | block, torch | light 14 with a **blue flame** (`soul_fire_flame`); on a wall it becomes `ember_torch_wall` |
| `paper_lantern` | block, lantern | light 15; stands on a block or hangs under one |
| `brass_chain` | block, chain | runs along any axis |
| `crystal_rod` | block, rod | light 14, faces any of six ways |
| `cedar_sign` | block, sign | written on both faces; on a wall it becomes `cedar_sign_wall`; sounds like spruce; stacks to 16 |
| `cedar_hanging_sign` | block, hanging sign | hangs under a block or on a wall (`cedar_hanging_sign_wall`); sounds like spruce; stacks to 16 |
| `gourd_stem` | block, stem | planted on farmland from **gourd seeds**; grows through eight stages, then grows a **gourd** beside it and bends towards it (`gourd_stem_attached`) |
| `gourd` | block | the stem's fruit |
| `bamboo_frame` | block, scaffolding | climbable; builds sideways up to six blocks from a supported column, falls when too far out |
| `sea_lamp` | block | light 12; **holds water** (place it in water or use a water bucket on it); the script tidies the items lying around it when you use it with an empty hand |
| `conveyor` | block, horizontal | faces you when placed, as a furnace does; the rule book moves a player who steps on it one block on while it faces **east** |
| `tin`, `exposed_tin`, `weathered_tin`, `oxidized_tin` | blocks | **tin that ages** like copper, stage by stage, over in-game days; honeycomb waxes each stage, an axe scrapes a stage back |
| `waxed_tin`, `waxed_exposed_tin`, `waxed_weathered_tin`, `waxed_oxidized_tin` | blocks | the waxed copies, which never age; an axe takes the wax off |
| `satchel` | item, bag | a **chest-style bag of two rows** (18 slots); opened with **sneak and right-click**; leather sounds; a bell when opened, a low note when closed |
| `seed_pouch` | item, bag | a **hopper-style bag** of five slots, opened with right-click |
| `tool_kit` | item, bag | a **dispenser-style bag** of three by three slots |
| `charm_bundle` | item, bundle | works like vanilla's bundle, with its own pictures |
| `greet` | command | `/greet` (or `/hiya`), for everyone: a chime, five seconds of glowing and the answer "Hello from the vanilla blocks sample!" |
| `kit` | command | `/kit <who> <count>` (1 to 16), operators only: runs the function `give_kit`, which gives that many tallow candles, and answers "A kit of candles is on its way." |
| `give_kit` | function | the macro line `$give $(who) msm_sample_vanilla_blocks:tallow_candle $(count)` |
| `script_api_1_6` | script | every Script API 1.6 member: placing **bedrock** is cancelled ("Bedrock stays where the world put it."); a **creeper's** blast keeps the blocks and tells the players within 8 blocks; `/greet` (and `/hiya`) also answers "The script heard /greet." and gets a rider off first; using a **cow** with an empty hand rides it; using the sea lamp with an empty hand removes rotten flesh and turns cobblestone into stone within 4 blocks; a plain right-click of the satchel says what it holds; at server start, one small explosion high above the world centre that breaks nothing (so the runtime's explosion Mixin is applied at start) |
| `vanilla_blocks_rules` | rule book | "The conveyor carries you east" (stepped on, only if the block faces east, teleport in front of it); "A cookie for a greeting" (`/greet` gives a cookie: a plain rule in the command's event); "Kits are noted" (`/kit` answers "Kit handed out."); "Creepers break no blocks" (caused by a creeper, keep the blocks safe); "No cobwebs" (placing a cobweb is stopped with "Cobwebs are not welcome here.") |
| `block/gourd`, `block/sea_lamp`, `block/*tin`, `item/*` | models | cubes over the placeholder pictures; the items are flat (the conveyor's models are generated from its front, side and top pictures) |

All content is original work written for MCSuperMods; the project contains no Mojang files.

## In-game check (Windows, Minecraft Java 26.3 and 26.4)

Do the whole list four times: on **26.3** and on **26.4**, each in **singleplayer** and on a **dedicated server** (join it from the same game). Use the Fabric Loader and Fabric API versions the app shows for each target. The jar contains `msm_runtime`; do not install it separately.

**Get the jar**, either way:

- from the latest CI run: Actions, CI, the run, Artifacts, then unzip the sample vanilla blocks jar (once CI builds it); or
- from the app: copy this folder outside the repository, open it in MCSuperMods, choose the target and export the Fabric mod jar (runtime nested, the default).

**Install it** with Prism Launcher as described in `fixtures/sample-mod/README.md`, with `msm_sample_vanilla_blocks.jar` in place of `msm_sample_mod.jar`. For the server, put the same jar and Fabric API in the server's `mods` folder (see `fixtures/sample-mod/README.md`). Create a new **Creative** world with cheats on; a superflat world is easiest. Switch to Survival (`/gamemode survival`) where a check says so.

### Loading

| Check | Expected |
|---|---|
| Title screen, **Mods** | `MSM Sample Vanilla Blocks` and `MSM Runtime` |
| `logs/latest.log` (Prism: the instance's **Minecraft Log**; on the server its console) | `[msm_runtime] registered 31 block(s) and 34 item(s)`, `registered 2 command(s)`, `registered 2 creative tab(s)` and `loaded 2 script(s); 0 error(s)`; nothing at warning or error level from `msm_runtime`, and no `NoClassDefFoundError` or `Mixin apply failed` anywhere |
| Creative inventory: the tab arrows to the second page | A tab **Vanilla Blocks** with the Paper Lantern icon, holding every block and item of this list but the tin, block items first and then the bags and bundle, each in the order of their ids (the potted grass and the companions have no item, so they are not there) |
| The tab **Tin Blocks** next to it | The Block of Tin icon; Block of Tin, Exposed Tin, Oxidised Tin, Waxed Block of Tin, Waxed Exposed Tin, Waxed Oxidised Tin, Waxed Weathered Tin, Weathered Tin, in that order |
| Hover over each item | The names in the table above, no `block.msm_sample...` keys |

### Each block's look and use

Place each block from the tab and try it. Every block shows its own picture (no purple and black cube), drops itself when broken in Survival (the cake only when whole, the bed once, the sea pickles and candles one per piece), and makes the sounds of its sound type.

| Check | Expected |
|---|---|
| Honey Cake, in Survival when hungry | Each right-click eats a slice (seven in all) and plays a burp; the last slice removes the cake; right-clicking it with a candle does not put the candle on it |
| Blue Berry Bush: plant blue berries on grass, then bone meal it | It grows through four stages; at the third and fourth, right-clicking picks berries (1 to 2, then 2 to 3) and takes it back a stage; walking through it slows you and scratches you |
| Tall Bluebell | Takes two blocks; breaking either half breaks both; bone meal drops a copy |
| Potted Grass Tuft (`/setblock ~1 ~ ~ msm_sample_vanilla_blocks:potted_grass_tuft`) | A flower pot with the grass tuft picture; breaking it drops a flower pot and grass |
| Ivy | Sticks to the side of a block, climbable; it spreads slowly onto nearby sides |
| Glow Pod: place up to four in water, then on land | In water they glow brighter with each pod (light 6, 9, 12, 15); on land they give no light |
| Moss Rug, Ash | The rug is a thin layer; ash builds up to eight layers by placing more on top, and never melts |
| Coffee Pod on the side of a jungle log | Grows in three stages; broken when ripe, it drops coffee beans |
| Tallow Candle | Up to four in a block; flint and steel lights them (light 3 each); a water bucket puts them out |
| Cosy Bed, at night (`/time set night`) | The bed shows its own picture; sleeping skips the night and sets your spawn; in the Nether the bed explodes as vanilla's does |
| Rope Ladder, Bamboo Frame | Both are climbable; the frame builds out sideways up to six blocks from a column and the far end falls when unsupported |
| Ember Torch, on the floor and on a wall | Light 14 with a blue flame; on a wall it leans against the wall; it pops off when the block under or behind it goes |
| Paper Lantern, on a block and under one | Light 15; standing and hanging look different |
| Brass Chain, Crystal Rod | The chain lines up with the face you place it against; the rod faces any of six ways and gives light 14 |
| Gourd Stem: plant gourd seeds on farmland, bone meal it | It grows through eight stages, then a gourd appears beside it and the stem bends towards it |

### Signs

| Check | Expected |
|---|---|
| Place the Cedar Sign on the floor | The writing screen opens with the cedar board picture; type four lines and press Done |
| Place it on a wall, and the Cedar Hanging Sign under a block and on a wall | Each opens its writing screen (the hanging sign with its own picture); the text shows on the board |
| Right-click a written sign | You can edit the text again; the back face can be written too |
| Dye and glow ink sac on a sign, then honeycomb | The text changes colour, then glows; after waxing the sign can no longer be edited |
| On the dedicated server, write a sign, leave and join again | The text is still there for you and for a second player |
| Breaking and walking on a sign | Sounds like spruce wood |

### Water

| Check | Expected |
|---|---|
| Place the Sea Lamp in water, or use a water bucket on it | It fills with water and keeps glowing (light 12); water flows out of it as from a vanilla block that holds water |
| Break it while it holds water | The water stays behind |
| The Paper Lantern, Brass Chain, Rope Ladder, Tallow Candle and Glow Pod | Each holds water as its vanilla counterpart does |

### Tin that ages, waxing and scraping

| Check | Expected |
|---|---|
| Place a few Blocks of Tin apart from each other and wait a few in-game days (`/gamerule randomTickSpeed 300` speeds this up; set it back to 3 after) | They turn into Exposed, Weathered and finally Oxidised Tin, one stage at a time; a tin block next to a tin or copper block of a lower stage stays as it is until that one catches up |
| Right-click a tin block with honeycomb | It becomes the waxed copy of that stage, with the wax-on sound and sparkles that you see yourself (on a server too); the honeycomb is used up |
| Wait again with the waxed blocks | Waxed tin never ages |
| Right-click a waxed block with an axe | The wax comes off (wax-off sound); the axe loses durability |
| Right-click an Exposed, Weathered or Oxidised Tin block with an axe | It goes back one stage (scrape sound) |

### Bags and the bundle

| Check | Expected |
|---|---|
| Satchel: right-click it | Nothing opens; the chat says "The satchel is empty.", or what it holds ("The satchel holds 5 minecraft:diamond, ...") |
| Satchel: sneak and right-click | A two-row chest screen opens with a leather sound and a bell; closing it plays a low note and the leather sound |
| Seed Pouch and Tool Kit: right-click | A five-slot hopper screen, and a three-by-three dispenser screen |
| Put things in a bag, close it, drop it, pick it up again, log out and back in | The contents are still there |
| Try to put a bag in a bag, or a shulker box in a bag | It does not go in |
| While a bag is open, try to move the bag itself (click its slot, press the number key of its slot, press F to swap it to the off hand) | The bag does not move |
| While a bag is open, drop it with Q, or die | The bag closes and nothing is copied: count the items before and after |
| On the dedicated server, two players: one opens a bag, the other tries to take it | No items are duplicated |
| Charm Bundle | Works like vanilla's bundle: right-click items into it, scroll to pick one, its tooltip shows the contents with its own open pictures |

### Commands from chat

| Check | Expected |
|---|---|
| Type `/gr` and look at the suggestions | `/greet` is offered |
| `/greet`, and `/hiya` | A chime, five seconds of glowing, a cookie, and the chat lines "Hello from the vanilla blocks sample!" and "The script heard /greet." |
| `/kit @s 5` as an operator | Five Tallow Candles in your inventory, "A kit of candles is on its way." and "Kit handed out." |
| `/kit @s 20` | Refused: the count must be from 1 to 16 |
| On the dedicated server, `/kit` as a player who is not an operator | The command is not offered and does not run |
| `/reload`, then `/greet` again | Still works; the suggestions still offer both commands |

### Scripts and rules (Script API 1.6, B455; Rules cards, B458)

| Check | Expected |
|---|---|
| Place TNT next to tin blocks and the sea lamp and light it | They break and each drops itself (no rule keeps a TNT blast's blocks) |
| `/summon minecraft:creeper` next to tin blocks and glass, and let it explode near you (in Survival) | You and mobs nearby are hurt and pushed, but no block breaks; the chat says "The creeper's blast left the blocks alone." |
| In Survival, try to place bedrock (take it from the creative inventory first), then a cobweb | Neither is placed and the item stays in your hand; the chat says "Bedrock stays where the world put it." and "Cobwebs are not welcome here." |
| Place a Conveyor while looking west (its front then faces you, east, as a furnace's does), with air east of it, and walk onto it | You are moved one block east; a Conveyor facing any other way does nothing |
| Right-click a cow with an empty hand | You ride it and the chat says "Moo. Say /greet to get off."; `/greet` gets you off ("You hop off to say hello.") |
| Drop rotten flesh, cobblestone and dirt next to the Sea Lamp, then right-click the lamp with an empty hand | The rotten flesh is gone, the cobblestone is stone, the dirt stays; the chat counts them ("The sea lamp tidied 1 and polished 1 stack(s).") |
| `logs/latest.log` at the start (singleplayer and server) | No `Mixin apply failed`; the script's small explosion at start breaks nothing and makes no warning |
| Export the Java project and build it | The build has no script or rule that needs one: placing, the creeper, the conveyor, `/kit`'s line, the cow, the sea lamp and the satchel lines do nothing there; `/greet` still gives the cookie |
