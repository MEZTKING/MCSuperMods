# Particles

MCSuperMods makes particles of your own with the `msm:particle` element kind: a spark, a petal, a puff of smoke or anything you can draw in a few small pictures, with its size, how long it lives, how it moves, its colour, whether it glows and whether it fades. A particle is a real particle type of the game, so it works anywhere a particle can be named: the **Spawn particle** action of a block, item, effect or mob, a block's **Ambient particles**, a status effect's particle, a portal's particles, a script's `world.spawnParticle` and the `/particle` command.

Particles need the **Fabric mod jar**, because a particle type is a registry entry with drawing code and a vanilla data pack or resource pack can add neither ([Blocks and items](blocks-and-items.md#export-a-fabric-mod-jar), [Limits](#limits)). A resource pack alone can still give a vanilla particle a new picture (see [Retexture a vanilla particle](#retexture-a-vanilla-particle)).

There are three ways to make one:

- the Creator's **Particle** flow (group **Magic**), which makes the particle and a block or an item that shows it;
- **Add element** (Ctrl+N) and a template under **Particles**, then the **Particle Studio**;
- the AI helper, which uses the same flow ([The AI helper](ai-helper.md)).

## Make a particle in the Creator

Open the Creator and choose **Particle** under **Magic**. The defaults make a working particle called `golden_spark`, shown around a new block called `golden_spark_block`. The answers:

- **Particle**: **Particle name** (ids derive from it: Golden Spark gives `golden_spark`).
- **Look**: **Look** (**Spark**, **Orb**, **Puff**, **Leaf** or **My own picture (below)**), **My own picture** (one PNG, 8 by 8 like vanilla's particles and at most 64 by 64 pixels; leave it empty for a placeholder spark), **Colour**, **Size** (**Small**, **Medium** or **Large**) and **Glows** (the particle is drawn at full brightness in the dark).
- **Life and movement**: **How long** (**Short (half a second)**, **Medium (one second)** or **Long (two seconds)**), **Movement** (**Floats up**, **Drifts** or **Falls**) and **Fades out** (see-through towards the end of its life).
- **Show it**: **Around a new block** (the block shows the particle by itself), **When an item is used** (a new item sends a burst of it) or **Only the particle (use it with /particle)**.

**Create** adds the particle, its four frame pictures (`textures/particle/golden_spark_0.png` to `_3.png`, drawn in your colour, or your own picture as the only frame) and the block `golden_spark_block` for **Around a new block** or the item `golden_spark_wand` for **When an item is used**. It creates with its untouched defaults and zero problems. Open the particle afterwards in the Particle Studio for everything else. Reopen the flow with **Edit in Creator** ([The Creator](creator.md#make-a-particle)).

## The Particle Studio

Selecting a particle in the sidebar (heading **Particles**) opens the Particle Studio. The live **Preview** beside the form draws the particle on a dark or a light background: **Burst** sends a handful at once, **Stream** keeps them coming, and **Pause** stops the clock. The preview follows the same rules as the game, so size, colour, fade, spin, gravity and drag look as they will in the game.

### Pictures

A particle has one to 64 frames, each a picture under `textures/particle/`. Each frame row has **Paint this picture** (the texture editor), move up, move down and remove. Under the list:

- **Add a frame** adds a frame and opens the painter on a new 8 by 8 picture (**New picture**).
- **Split a strip into frames**: pick **Picture to split into frames** (a strip or a grid of frames, such as a sprite sheet), then **Frames (empty: square frames)** and **Columns** if needed. One undoable step writes one picture per frame and adds them to the list.
- **Animation**: **Once over its life** (the frames run from first to last across the particle's lifetime), **Loop** (with **Ticks per frame**) or **A random frame** (each particle picks one and keeps it). It matters only with more than one frame.

A frame whose picture is missing shows the problem `blocks-items.particle-texture-missing` at once, before you export.

### Life and size

- **Lifetime (ticks)**: a fixed time, or **Between** with **Lifetime from (ticks)** and **Lifetime to (ticks)** for a random time in that range. 20 ticks are a second. 1 to 6000.
- **Size** and **Size at the end**: half-width of the square in blocks (0.2 is vanilla's usual particle). Different values grow or shrink the particle over its life.

### Movement

- **Gravity** with the shortcuts **Floats up**, **None** and **Falls**: positive values fall, negative values rise (-0.05 floats gently).
- **Drag (speed kept per tick, 0 to 1)**: 0.98 is vanilla's; lower stops the particle sooner.
- **Spin (degrees per tick)**.
- **Stops on blocks**: whether the particle collides with the world.

### Colour and light

- **Tint** and **Tint at the end** multiply the pictures' colours (white shows them as drawn).
- **Opacity (0 to 1)** and **Fade** (**None**, **Out** or **In and out**).
- **Glows in the dark**: full brightness, as the glow and end rod particles.
- **See-through**: whether the particle draws translucent. It is on by itself when the opacity is below 1 or the particle fades.
- **Show from far away**: draws the particle beyond 32 blocks and under the **Particles: Minimal** setting (`always_show`).

## Use a particle

A particle type is an id, `<namespace>:<name>`, and the pickers list the project's particles before the vanilla ones.

### Spawn particle

The **Spawn particle** action in the Events editor ([Blocks and items](blocks-and-items.md#events-and-actions)) has a **Kind**:

| Kind | What it sends |
|---|---|
| **A particle** | A particle type without options: one of your own or a vanilla one such as `minecraft:glow` or `minecraft:flame`. |
| **Coloured dust** | Vanilla's dust in a **Colour** and **Size**. |
| **Block pieces** | Pieces of a block, as breaking it makes, for the block you pick. |
| **Item pieces** | Pieces of an item, as a broken tool or thrown egg makes. |

Then **Count** (1 to 1000, one packet per player per action), **Spread** (a random offset from the position, in blocks, as a standard deviation on each axis; 0 by default), **Speed** (a random velocity spread, unused when **Motion** is set), **Motion X**, **Motion Y** and **Motion Z** and **Show from far away**.

- **Motion** gives every particle exactly this starting velocity in blocks per tick (`[0, 0.2, 0]` rises gently). **Spread** still offsets where they start. The game sends one packet per particle and player with motion, so prefer **Spread** for big bursts ([Limits](#limits)).
- **Show from far away** (`force`) sends the particle to players up to 512 blocks away and draws it whatever their **Particles** option. It is a property of the single spawn; a particle type can also have **Show from far away** set in the Particle Studio for every spawn.

In the JSON, `particle` is an id (`"msm_example:spark"`) or an options object (`{ "type": "minecraft:dust", "color": [1, 0.45, 0.1], "scale": 1.2 }`). The options the app writes: dust `{ type, color, scale }`, block `{ type: "minecraft:block", block_state: "minecraft:stone" }` and item `{ type: "minecraft:item", item: { id: "minecraft:apple" } }`. Only the 22 vanilla types that take options accept an options object; a project particle never does. A block state must be a plain block id: the form `{ "Name": ..., "Properties": ... }` is not accepted by vanilla and is refused.

### Ambient particles

The Block Studio's **Ambient particles** section (every block type except portals, which have their own **Particles** in the [Portal section](portals.md#looks)) lets a block show particles by itself, as a torch shows its flame. Turn on **Show particles around the block**, then:

- **Particle**: a project particle or a vanilla one, with the same options objects as above.
- **Chance per tick** (0 to 1) and **Count** (1 to 16 per tick that passes the chance).
- **Where**: **Centre**, **Top**, **Whole block** or **Custom (offset and spread below)** with **Offset** (from the block's corner) and **Spread** (uniform within the offset plus or minus the spread; the default is the centre and 0.5 on each axis, so the whole block).
- **Velocity**: the exact starting velocity.
- **Only when property** and **Only when value**: show the particles only in some states, such as `lit` true on a machine.

Ambient particles are drawn on each player's own game, about once per game tick near the player, so a very low chance is cheap. They send no packets and the server never sees them. They are in the game only with the mod jar on the client.

### Elsewhere

- **Status effects**: the Effect Studio's **Particle (instead of the swirl)** and the Behaviour **Shows particles** take a project particle ([Status effects and throwables](effects-and-throwables.md)).
- **Portals**: **Particle type** in the Portal section takes a project particle that has no options. A **Colour** still makes coloured dust ([Portals](portals.md)).
- **Leaves**: a leaves block's falling particle takes a project particle.
- **Scripts**: `world.spawnParticle` takes the same ids and options objects ([Scripting](scripting.md#particles-from-scripts)).
- **Commands and functions**: `/particle <namespace>:<name> ~ ~1 ~` works in game with the mod jar. In a function it makes a vanilla data pack show a warning ([Vanilla packs](#vanilla-packs)).

## Retexture a vanilla particle

A resource pack can give a vanilla particle a new picture without the mod jar. Add the template **Retexture a vanilla particle** (under **Particles**): it makes `assets/minecraft/particles/flame.json` pointing at your own picture, which you add as `textures/particle/<name>.png`. Change the name of the element to retexture another particle. The sidebar lists these as **Particle pictures**.

## Vanilla packs

Project particles do not exist in the vanilla packs, and the app says so where it matters:

- The **resource pack** keeps the particle's description and its pictures. A client without the mod ignores a description for a type it does not know, so nothing breaks, and a retexture of a vanilla particle works.
- The **data pack** leaves out a biome, a dimension type, a timeline or an enchantment that names a project particle, with the warning `export.mod-only-reference` naming the file and the id. Vanilla refuses a whole data pack that names an unknown particle there, so these are left out.
- A **function** that runs `particle <namespace>:<name>` is kept with the warning `export.mod-only-function`: a vanilla server skips only that function.
- The particle's own definition, the **Spawn particle** action, **Ambient particles** and scripts never reach a vanilla pack.

## Problems it reports

| Code | Meaning |
|---|---|
| `particle-lifetime-range` | The longest lifetime is shorter than the shortest. |
| `particle-description-clash` | Two particles of the same namespace and name, or a particle and a retexture, would write the same description. |
| `particle-needs-options` | A vanilla type that needs options (dust, block, item and others) is named as a plain id: use **Coloured dust**, **Block pieces** or **Item pieces**, or an options object. Checked in **Spawn particle**, ambient particles, an effect's particle, falling particles and a portal's particles. |
| `particle-options-unknown-type` | An options object names a type that does not exist. |
| `particle-options-invalid` | An options object has fields its type does not take. The check is structural: it does not look at every vanilla field. |
| `particle-frame-ticks-unused` | **Ticks per frame** is set but the animation is not **Loop** (a warning). |
| `component-not-for-type` | **Ambient particles** on a portal. |

**Problems** does not yet check the **Spawn particle** actions in a mob's events for options; the game reports a wrong object there as an error when it starts.

## Limits

- **The Fabric mod jar on the client and the server.** A particle type is registered by the mod and drawn by the client's own code. A client without the mod cannot join a server that has particles, and vanilla packs cannot carry them.
- **Update the client and the server together.** Each side reads the particle's pictures and look from its own jar, so jars from different builds can disagree about how a particle looks.
- **The behaviour of a particle is fixed.** A project particle has no per-spawn options, only position, velocity and count. For a different colour or size each time, use vanilla's dust, block or item particles, or make another particle element.
- **Distance and the Particles setting apply.** The game does not draw particles beyond 32 blocks, and draws fewer under **Particles: Minimal**. Use **Show from far away** on the particle, or on a single spawn, when that matters.
- **Changes need a restart.** New particles and changed lifetime or size settings load when the game starts (the registry freezes). Pictures and the description reload with the resource packs (F3+T).
- **Single flat quads that face the camera.** No trails, ribbons, models, shading or light cast on blocks.
- **Items and mobs show particles through triggers.** There is no held-item shimmer or thrown trail drawn on the client. Use `while_held`, `on_use` or `msm:on_tick` with **Spawn particle**.
- **A particle without pictures shows nothing.** The game logs one warning, `particle <id> has no sprites`; the app warns earlier about a frame without its picture.
- **Many particles with motion cost bandwidth.** Each one sends its own packet to each player in range. The count is capped at 1000 per action; use **Spread** for big bursts.
- **Ejected projects are 26.3 only.** The Java project export writes particles for the 26.3 target ([Eject to a Java project](eject.md)).
- **Scripts run on the server.** They send particles; they cannot draw or move them on the client.
- **Vanilla data packs leave out or warn** (see [Vanilla packs](#vanilla-packs)).

## Test it in the game

1. Export the **Fabric mod jar** or use **Test in Minecraft** ([Blocks and items](blocks-and-items.md#test-in-minecraft)). **Problems** must show no errors.
2. In a creative world, run `/particle <namespace>:<name> ~ ~1 ~ 0.3 0.3 0.3 0 30` and look at the picture, the size, the colour, the motion, the fade and whether it glows when you stand in a dark place.
3. Place a block with **Ambient particles**; step away and come back. Check that it shows only in the states you chose.
4. Use a wand item and check the burst and its **Motion**.
5. Walk 40 blocks away and spawn one: it should vanish unless it has **Show from far away**.
6. Set **Particles** to **Minimal** in the video settings and check again.

The project `fixtures/sample-particles` in the repository has three particles, two blocks, three wands, an effect, a function and a script, with a checklist of what only eyes can check.

## Troubleshooting

| What you see | What to do |
|---|---|
| Nothing appears | The particle has no pictures (check the log for `has no sprites`), the lifetime is very short, the tint is too dark against the sky, or the player is more than 32 blocks away or on **Minimal**. |
| `Unknown particle` from `/particle` | The particle is not registered: export again and restart the game. |
| The world will not load, naming a particle | A vanilla data pack names a project particle. Remove it from the biome, the dimension, the timeline or the enchantment, or use the mod jar. |
| Dust or block pieces do not appear | The options object is wrong; check **Problems**. |
