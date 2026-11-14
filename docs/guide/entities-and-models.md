# Entities and models

MCSuperMods makes new mobs with three element kinds: `msm:entity` (the mob itself, edited in the **Entity Studio**), `msm:geo_model` (its 3D model) and `msm:animation` (its animation set). Models and animations come from [Blockbench](https://www.blockbench.net/), the free model editor; MCSuperMods imports them, shows them animated in its preview and puts them into the game, drawn by the GeckoLib mod or by the runtime's own built-in renderer (see [Export the mod jar and the renderer](#export-the-mod-jar-and-the-renderer)). A resource or data pack cannot add a mob, so entities reach the game only through the **Fabric mod jar** export, like [blocks and items](blocks-and-items.md).

Pets, farm animals, mounts, flying and water mobs, shooters and bosses, with taming, breeding, riding, variants and boss bars, are covered in [Mob behaviours](mob-behaviours.md). The quickest start is the **Custom mob** starter (**New from starter…**): a Ruby Golem with its model, animations, skin, spawn egg, loot table and a death effect. The examples **Wandering creature**, **Hostile mob** and **Natural spawning** in **Help → Examples…** show one idea each (see [Templates, starters and examples](templates-and-examples.md)).

## Import a model from Blockbench

1. In Blockbench, make the model as a **Bedrock Entity** or **GeckoLib Animated Model** project, with the texture painted in Blockbench or loaded into it. Animations made in Blockbench's **Animate** tab come along.
2. Save the project as a `.bbmodel` file. Keep the texture embedded in the project (the default when the texture was painted or loaded in Blockbench and saved with it). Alternatively, use Blockbench's own exports: the geometry as a `.geo.json` file and the animations as a `.animation.json` file.
3. In MCSuperMods, open a project and choose **File → Import Blockbench Model…**, or "Import Blockbench model…" in the command palette (Ctrl+Shift+P).
4. The **Import Blockbench model** dialog lists the one importer, **Blockbench model (.bbmodel, .geo.json, .animation.json)**. Pick the namespace and choose **Choose files…**, then the files. You can pick several at once.

What you get from a file called `ruby_golem.bbmodel`:

- a geo model `<namespace>:entity/ruby_golem`, listed under **Models and animations** in the sidebar (marked "model");
- an animation set `<namespace>:entity/ruby_golem_animations` when the file has animations (marked "animation");
- the texture as `textures/entity/ruby_golem.png` (several textures are numbered: `ruby_golem_0.png`, `ruby_golem_1.png`);
- the original file, kept as `blockbench/ruby_golem.bbmodel` in the project and never exported.

A `.geo.json` gives only the geo model and an `.animation.json` only the animation set; import the texture PNG with **Import assets**, choosing **Other textures folder** and `entity` as the folder under `textures/`. Elements that already exist are skipped, and one undo removes the whole import.

Only `.bbmodel`, `.geo.json` and `.animation.json` files are accepted. Blockbench's **Java Block/Item** projects are refused: they are block or item models, not mobs, and Blockbench exports them as Java models itself. A texture that is not embedded, or not a PNG, is reported in the dialog; import it separately. If a converted model looks wrong in the preview, export the `.geo.json` and `.animation.json` from Blockbench and import those instead: they are used unchanged.

## Create an entity

1. Choose **Add element** on the toolbar (Ctrl+N).
2. Under **Entities**, pick **Creature** (a passive mob that wanders and spawns in forests), **Monster** (chases and hits players, fights back, spawns in the dark), **Ambient critter** (small, runs away from players, no spawn egg), **Pet**, **Farm animal**, **Mount**, **Flying creature**, **Fish**, **Archer** or **Boss** (each with the parts described in [Mob behaviours](mob-behaviours.md)).
3. Type a name, for example `gloom`, and choose **Create**.

The element id (`<namespace>:gloom`) is the entity's id in the game, so `/summon <namespace>:gloom` works once the mod is installed. The templates point at a model `<namespace>:entity/gloom`, an animation set `<namespace>:entity/gloom_animations` and a texture of the same name. Until those exist, **Problems** reports them: import a Blockbench model with that name, or choose the imported ones in the Entity Studio. **Entity models** (**Cube creature model**, **Biped model**) and **Entity animations** (**Idle and walk animations**) in the same dialog give you a model and animations to start from without Blockbench.

## The Entity Studio

Selecting an entity opens the Entity Studio. Empty fields use the defaults. **Advanced (all fields)** at the top shows every field as a plain form, and **Raw JSON** edits the same data as text.

- **Kind of mob**: **Kind of mob** and **Base** set what the mob is built on, its category, movement and spawn rule together (see [Mob behaviours](mob-behaviours.md#kind-of-mob-and-base)).
- **Identity**: **Display name** (the name players see), **Category** (`monster`, `creature`, `ambient`, the water categories or `misc`; it decides which group of mobs it is counted with for spawning), **Width** and **Height** (the hitbox in blocks) and **Eye height** (empty: 0.85 times the height).
- **Appearance**: **Model** (a geo model of the project), **Animation set**, **Texture** (the project's PNGs under `textures/`) and **Scale**. **Go to model** and **Go to animation set** open them. **Idle animation**, **Walk animation** and **Attack animation** choose names from the animation set: idle plays on a loop while the mob stands, walk while it moves, attack once on each melee hit. **(none)** plays nothing. **Sit animation**, **Fly animation**, **Swim animation** and **Shoot animation** are the state animations ([Mob behaviours](mob-behaviours.md#animations-for-states)), and **Renderer** chooses how the mob is drawn.
- **Stats**: **Health** (default 20), **Speed** (default 0.25; a zombie has 0.23, so small changes matter), **Follow range** (how far it notices targets, default 16), **Knockback resistance** (0 to 1), **Swims** (floats up in water instead of sinking; on by default) and **Fire immune**.
- **Attack**: **Attacks in melee** with **Damage** and **Knockback**, and **On attack**, an event that runs after each hit. Without it, a melee goal does nothing.
- **Movement**, **Ranged attack**, **Taming**, **Breeding**, **Riding**, **Variants** and **Boss bar**: see [Mob behaviours](mob-behaviours.md).
- **Behaviour**: the goals (see below).
- **Sounds**: the sounds the mob makes (see [Mob sounds](#mob-sounds)).
- **Spawning**: natural spawning (see [Spawning](#spawning)).
- **Spawn egg**: see [Spawn eggs](#spawn-eggs).
- **Events**: **On hurt**, **On death** and **On interact** choose events, and the events and their actions are edited below them as for blocks (see [Events and play_animation](#events-and-play_animation)).

## Goals

Goals are what the mob decides to do. They are listed in priority order: the first goal in the list that can run right now wins, and the others wait. Move a goal up with its arrow button (**Move Goal 2 up**, for example) to make it more important, and remove it with the cross. To add one, choose its type in **New goal type** (for example **Flee**) and choose **Add goal**; it goes to the end of the list. Each goal's fields are labelled with its number, for example **Goal 2 speed**.

| Goal | Type | What it does |
|---|---|---|
| **Wander** | `wander` | Walks to random nearby spots at its speed. **Avoid water** keeps it on land. |
| **Look at player** | `look_at_player` | Turns its head towards a player within its distance in blocks. |
| **Look around** | `look_around` | Looks about idly when it has nothing else to do. |
| **Melee attack** | `melee_attack` | Chases and hits the entity types in **Targets** (for example `minecraft:player`). **Target must be in sight** stops it hunting through walls; **Fights back when hurt** makes it attack whoever hurt it, even with no targets. Needs **Attacks in melee**. |
| **Flee** | `flee` | Runs from the entity types in **Runs from** when they come within its distance, at its speed, and at its sprint speed when they are close. |
| **Follow** | `follow` | Follows the entity types in **Follows** within its range and stops its stop distance away. |
| **Ranged attack** | `ranged_attack` | Shoots the projectile of the **Ranged attack** section at its **Targets** from a distance (**Circles its target** to strafe). |
| **Tempted by items** | `tempt` | Follows a player holding one of its **Items**; **Scared by quick players** makes it back off from fast ones. |
| **Panic when hurt** | `panic` | Runs about when hurt. |
| **Leap at target** | `leap_at_target` | Jumps at its target from a short distance (**Leap height**). |

A typical monster lists **Melee attack** first, then **Wander**, **Look at player** and **Look around**; a timid critter lists **Flee** first. A melee goal with neither targets nor **Fights back when hurt** never attacks, and neither does a melee goal without **Attacks in melee**; **Problems** warns about both.

## Mob sounds

The **Sounds** section has four pickers and a number: **Ambient sound** (made now and then while the mob lives), **Hurt sound**, **Death sound**, **Step sound** (each footstep) and **Ambient interval (ticks)** (how often the ambient sound may play; empty: the vanilla interval of mobs). Leave a picker empty and the mob keeps the vanilla sound of its base type. Each picker lists your project's own sounds first (see [Your own sounds](blocks-and-items.md#your-own-sounds)) and then the vanilla ones, so a mob can purr with `minecraft:entity.cat.purr` or growl with a file you imported. A sound id the game does not know is a warning in the game log and the default sound stays. Sounds need the runtime that ships with this release; the [Java project export](eject.md) writes the same overrides.

## Spawning

Tick **Spawns naturally** to make the mob appear in the world on its own. It starts with all overworld biomes (`#minecraft:is_overworld`), **Weight** 10 and groups of 1 to 3.

- **Biomes** lists biome tags and biome ids. An entry starting with `#` is a tag, a group of biomes such as `#minecraft:is_forest` (every forest, including forests from other mods that join the tag); an entry without `#` is one biome, such as `minecraft:plains`. The mob spawns in all of them together.
- **Weight** is how often it is picked compared with the other mobs of its category in the same biome; vanilla zombies have 100. **Min group** and **Max group** are how many spawn together.
- **Placement** (on the ground, in water, in lava or anywhere), **Heightmap** and **Rule** decide where exactly it may appear. **Rule** `monster` means only in the dark, like zombies; the default `mob` uses the ordinary rules for mobs.

Creatures mostly spawn when chunks are first generated, so look in a new world or new chunks; monsters spawn around players in the dark all the time.

## Spawn eggs

With **Has a spawn egg** (on by default) the mod adds the item `<namespace>:<name>_spawn_egg`, in the **Spawn Eggs** creative tab unless you choose another **Creative tab**. **Egg texture** is a PNG of the project (a 16x16 item texture works best); without one the egg has no item model and shows as a purple and black cube. **Egg display name** defaults to "<display name> Spawn Egg". Untick **Has a spawn egg** for a mob that only commands or other mobs bring into the world.

## Events and play_animation

Events work as for blocks and items ([Events and actions](blocks-and-items.md#events-and-actions)): a named list of actions run in order on the server. Entities have six triggers: **On hurt** (after the mob takes damage and survives it), **On death**, **On interact** (a player right-clicks it) and **On attack** in the **Attack** section (after each melee hit), and two more in the **Triggers** part of **Events**:

- **On tick** runs again and again while the mob is alive, every **Every (ticks)** ticks (default 20, one second; at least 5). A mob with `NoAI` set never runs it. Mobs with the same interval are spread over the ticks, and all repeating triggers together run at most 2,000 times in one server tick (see [Triggers](blocks-and-items.md#triggers)).
- **On spawn** runs once when the mob spawns naturally, from a spawn egg or from a spawner, just before it enters the world. It does not run again when its chunk is loaded or the world is reopened, so it suits setting a mob up once.

In a mob's events a `run_function` action runs as the player involved (the one who interacts with, hurts or kills it, or whom it hits) and, when no player is involved, as the mob itself, so `@s` in the function is the mob; this is always the case for **On tick** and **On spawn**.

Like every trigger, both need the runtime that ships with this release; the [Java project export](eject.md) writes them too.

Entities also have an eighth action, `play_animation` (after the seven that blocks and items share, `run_script` among them): it plays one animation of the animation set once, chosen in the action's animation field (a list of the names in the chosen **Animation set**). The controller field is optional; leave it empty unless two animations should play at the same time, each in its own controller. Example: an **On interact** event with `play_sound` and `play_animation` `wave` makes the mob wave and chime when right-clicked. Blocks and items cannot use `play_animation`.

## The preview

Select an entity, a geo model or an animation set and open the **Preview** tab on the right. An entity shows its model with its texture at its scale, playing its idle animation; a geo model shows the model alone; an animation set plays on the model it belongs to. Drag (or use the arrow keys) to turn the model, use the wheel (or plus and minus) to zoom, and **Reset view** to go back.

Below the model, the animation list starts with **No animation (rest pose)** and lists every animation of the set. **Play animation** and **Pause animation** start and stop it, **Animation time** scrubs through it, and the line under it shows the time and whether the animation loops, plays once or holds its last frame.

The preview is a guide, not the game:

- Molang expressions (such as `math.sin(query.anim_time * 90)`) play as 0; a note under the preview and an info line in **Problems** say which bone uses one. The game evaluates them.
- Smooth (`catmullrom`) keyframes play as straight lines between keyframes; bezier keyframes are imported as straight lines too.
- Sound, particle and timeline keyframes are not played.

When the preview and the game differ, the game is right; please report it.

## Export the mod jar and the renderer

Export as for blocks and items: open the arrow next to **Export .zip** and choose **Fabric mod (.jar)…**, or **File → Export Fabric Mod Jar…**, or "Export Fabric mod jar…" in the command palette. Every error in **Problems** blocks the export (for example a model that no longer exists); warnings do not.

A mob is drawn by **GeckoLib**, a free mod (MIT licence) for animated models, or by the runtime's own **built-in renderer**, which reads the same model and animation files. The mob's **Renderer** setting chooses: **Automatic (GeckoLib when present)** uses GeckoLib on 26.3 and the built-in renderer on a target without GeckoLib, **GeckoLib only** insists on GeckoLib and **Built-in renderer** never uses it (see [Mob behaviours](mob-behaviours.md#choose-how-the-mob-is-drawn)). When the project has mobs drawn by GeckoLib the dialog says so: "This project has entities, so the jar also nests GeckoLib, which draws their models and animations. MCSuperMods downloads GeckoLib once from Modrinth and keeps it for later exports." The jar then holds:

- your entities as definitions under `msm/<namespace>/entity/`, and the models and animations under `assets/<namespace>/geckolib/`;
- the textures, names (`entity.<namespace>.<name>`), spawn egg models and everything else of the project, as for blocks and items;
- `fabric.mod.json`, which depends on `msm_runtime` and `geckolib` as well as Fabric Loader, Fabric API and Minecraft;
- by default, both `msm_runtime` and GeckoLib nested inside it (`META-INF/jars/`), so one file plus Fabric API is all a player needs.

When every mob is drawn by the built-in renderer, as on the 26.4 snapshot or with **Built-in renderer**, the dialog says: "This project’s entities are drawn by the runtime’s built-in renderer on this target, so the jar needs no GeckoLib." The jar then carries no GeckoLib, depends only on `msm_runtime`, and needs no download. The built-in renderer plays fewer animation features than GeckoLib (Molang, easings and sound or particle keyframes are left out), so a mob can look slightly different between the two.

The first export of a GeckoLib mob downloads GeckoLib, checks it and keeps it in the app's download cache. Without an internet connection the export stops with: "GeckoLib could not be downloaded. A mod with entities needs a one-off download of GeckoLib: connect to the internet and try again, or choose "Separate runtime and GeckoLib (for modpacks)"." After one successful download it works offline.

**Separate runtime and GeckoLib (for modpacks)** leaves both `msm_runtime` and GeckoLib out of the jar. The jar still depends on them, so the modpack must provide them: GeckoLib for Fabric from Modrinth or CurseForge, and `msm_runtime` from another MCSuperMods mod exported with the runtime nested ([Separate runtime](blocks-and-items.md#separate-runtime-and-geckolib-for-modpacks)). This option needs no download.

**Test in Minecraft…** exports the same jar with both nested, so it needs the one-off download too.

## The in-game check

Install the jar with Fabric API as described in [Install the mod in a Fabric game](blocks-and-items.md#install-the-mod-in-a-fabric-game), or use **Test in Minecraft…**. Then, in a creative world:

1. The mod list shows your mod, with `MSM Runtime` nested (and `GeckoLib`, when the mobs use it).
2. Your spawn egg is in the **Spawn Eggs** tab (or the tab you chose); use it, or `/summon <namespace>:<name>`.
3. The mob looks like the preview and plays its idle animation; its walk animation plays as it moves.
4. Its goals, events and drops behave as set, and it spawns in its biomes in new chunks.

The sample mob project has a full checklist: [`fixtures/sample-mob/README.md`](https://github.com/MEZTKING/MCSuperMods/blob/main/fixtures/sample-mob/README.md#in-game-check-windows-minecraft-java-263).

## Troubleshooting

When the game starts, the runtime writes two summary lines to the game log (Prism: the instance's **Minecraft Log**; official launcher: `logs\latest.log`), for example:

```
[msm_runtime] registered 0 block(s) and 1 item(s) from 1 definition file(s); 0 error(s), 0 warning(s)
[msm_runtime] registered 1 entity type(s)
```

Spawn eggs count as items in the first line; the second counts your entities. Any other line with `[msm_runtime]` names the file and the problem.

| Problem | What to do |
|---|---|
| The game refuses to start and asks for `geckolib` | The jar was exported with **Separate runtime and GeckoLib (for modpacks)**. Export it again without that option, or add GeckoLib for Fabric and the same Minecraft version to `mods`. |
| `registered 0 entity type(s)` and an error "needs the mod 'geckolib', which is not loaded" | GeckoLib is missing from this game (the runtime was installed on its own). Use a jar exported with GeckoLib nested, or add GeckoLib. |
| The export says GeckoLib could not be downloaded | Connect to the internet once and export again; or choose **Separate runtime and GeckoLib (for modpacks)** and provide GeckoLib yourself. |
| The mob is invisible on a target that uses the built-in renderer | The game log says once which model or animation file could not be read; fix or re-import it. |
| The mob is invisible or a GeckoLib error mentions the model | Check **Model** in the Entity Studio and that the geo model exists; **Problems** reports a missing model. |
| The mob is purple and black | Its **Texture** is missing or named wrongly. |
| The mob does not animate | Check **Idle animation** and **Walk animation**: the names must exist in the animation set (**Problems** warns otherwise). |
| The model looks right in the preview but wrong in the game, or the other way round | Export the `.geo.json` and `.animation.json` from Blockbench and import those instead of the `.bbmodel`, and report the difference. |
| The mob never attacks | Tick **Attacks in melee** and give **Melee attack** some **Targets** or **Fights back when hurt**. |
| The mob never spawns on its own | Tick **Spawns naturally**, check **Biomes**, and look in new chunks; raise **Weight**. Monsters with rule `monster` need darkness. |
| The egg is a purple and black cube | Choose an **Egg texture**. |
