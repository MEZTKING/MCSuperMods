# Sample portals project

A kitchen-sink MCSuperMods project for custom portal blocks (ADRs 0077 and 0078), namespace `msm_sample_portals`: an `msm:mod`, a flat project dimension, three portal blocks that differ in every way a portal can (frame, igniter, destination, arrival, who may travel, looks and sounds), a frame block, a key item, a beacon block that lights a portal, a block tag, a project sound event and two one-line `say` functions. The textures are the library's placeholder pictures. It works on **26.3** and on **26.4**. Its siblings are `fixtures/sample-mod/` (blocks and items) and `fixtures/sample-machines/` (containers and machines).

`packages/exporters/test/sample-portals.golden.test.ts` checks it on every run: the folder equals the project built in code, every element validates with zero problems, the plugins' validators report nothing, and the content jar exports for both targets with its SHA-256 pinned per target. `sample-portals.java.golden.test.ts` pins the Java project export of 26.3 (the eight `portal/*.java` classes and one block class per portal). The vanilla data pack keeps the dimension, the frame tag and the `say` functions, writes the three `#minecraft:portals` entries as optional, and leaves out the loot tables of Sky Stone and the Drift Beacon (they name mod-only items). This README is the one file in the folder that is written by hand; the test leaves it alone.

CI exports the project with the real runtime and starts a headless Fabric server on 26.3 and on 26.4 (`tools/run-fabric-server`). The server must log `[msm_runtime] registered 3 portal block(s)`, `[msm_runtime] registered blocks by type: block 2, portal 3`, `registered 5 block(s) and 3 item(s) from 6 definition file(s); 0 error(s), 0 warning(s)` and `registered 1 sound event(s)`, with no warning such as `portal ...: dimension ... is not a level of this world` (the dimension is in the jar, so `msm_sample_portals:sky_realm` loads). The ejected 26.3 project builds with its own `./gradlew build` and starts without `msm_runtime`. The server draws nothing and has no player, so how the portals look, sound and feel is left to the in-game check below.

## Contents

| Element | Kind | What it shows |
|---|---|---|
| `msm_sample_portals:mod` | mod metadata | `fabric.mod.json`: id `msm_sample_portals` |
| `msm_sample_portals:sky_realm` | dimension | Sky Realm: flat land of bedrock, three dirt and grass, plains everywhere, no trees or lakes; the overworld's sky, day and night (dimension type `minecraft:overworld`). The ground is low, at about y -60, as in a superflat world |
| `msm_sample_portals:sky_stone` | block | the Sky Stone frame block: glows faintly (light 5), needs a pickaxe, drops itself; Building Blocks tab |
| `msm_sample_portals:sky_portal` | portal block | frame of Sky Stone, lit with **flint and steel** (the default), to Sky Realm and back to the overworld, one block there is one block here (`travel.scale` 1); a blue surface picture; purple portal sparkles, the Nether portal's hum and travel sound, the overlay and wobble (all defaults); `on_travel` says `I came through the Sky Portal.` as the traveller |
| `msm_sample_portals:ember_frame` | block tag | the ember portal's frame: blocks of gold, copper and waxed copper |
| `msm_sample_portals:ember_key` | item | the Ember Key, which lights the ember portal; 64 uses (`msm:durability`); Tools and Utilities tab |
| `msm_sample_portals:ember_portal` | portal block | frame of any mix of the tag's blocks, lit with the **Ember Key**, to **the Nether** and back; no `travel.scale`, so the dimension types decide: one block in the Nether is eight in the overworld, as with the Nether portal; exits it builds are of **gold blocks** (`frame_block`); an amber surface picture; **amber dust** particles (6 a tick) instead of the purple sparkles; its ambient sound is the project sound event `msm_sample_portals:ember.hum` (the beacon's hum) |
| `msm_sample_portals:drift_portal` | portal block | frame of **crying obsidian**, **no igniter** (`igniter: false`: only the Drift Beacon lights it); to Sky Realm and back; `arrival: surface` (you land on the ground of the column you are in, and no exit portal is built); **players only** (mobs and items are not taken); `overlay: false` (no wobble, no overlay, no entry whoosh); the default Nether portal picture and sparkles |
| `msm_sample_portals:drift_beacon` | block | right-clicking it lights an empty crying obsidian frame next to it as a Drift Portal (`msm:on_interact` runs `light_portal`), then says `The drift beacon is used.`; Functional Blocks tab |
| `msm_sample_portals:sounds` | sounds file | one project sound event, `ember.hum`, which plays the vanilla beacon ambient sound file from your own game |
| `msm_sample_portals:say/*` | functions | `sky_portal_travelled` and `drift_beacon_used`: each is one `say` line that tells you its event ran |
| `block/sky_stone`, `block/drift_beacon`, `item/ember_key` | models | cubes over the placeholder pictures; the key is a flat item |

The portal blocks have no item, no loot table and cannot be mined in Survival. Each portal stands upright: its opening is 2 to 21 blocks wide and 3 to 21 high, and the four corners of the frame may be left out (the frame is checked on its four sides only).

All content is original work written for MCSuperMods; the project contains no Mojang files.

## In-game check (Windows, Minecraft Java 26.3 and 26.4)

Do the whole list twice, once per version.

- **26.3:** the 26.3 content jar, Fabric Loader 0.20.1 or newer and Fabric API 0.165.2+26.3 (or newer for 26.3). The jar contains `msm_runtime`; do not install it separately.
- **26.4:** the 26.4 jar (the app exports it when the project target is 26.4), with Fabric Loader 0.20.1 and Fabric API 0.165.4+26.4 (the 26.4 target's facts). The jar contains `msm_runtime` only.

**Get the jar**, either way:

- from the latest CI run: Actions, CI, the run, Artifacts, then unzip the sample portals jar; or
- from the app: copy this folder outside the repository, open it in MCSuperMods, choose the target and export the Fabric mod jar (runtime nested, the default).

**Install it** with Prism Launcher as described in `fixtures/sample-mod/README.md`, with `msm_sample_portals.jar` in place of `msm_sample_mod.jar`. Create a new world with cheats on. Most checks are quickest in **Creative**; the ones marked **Survival** need Survival (`/gamemode survival`). Give yourself the things: `/give @s msm_sample_portals:sky_stone 64`, `/give @s msm_sample_portals:ember_key`, `/give @s msm_sample_portals:drift_beacon`, `/give @s minecraft:flint_and_steel`, `/give @s minecraft:crying_obsidian 64`, `/give @s minecraft:gold_block 64`, `/give @s minecraft:copper_block 64`.

**Building a frame:** stand on flat ground and build an upright ring around an opening 2 blocks wide and 3 high: 2 blocks under the opening, 3 up each side of it and 2 over it (10 blocks; the four corners may be added or left out). Bigger openings work too, up to 21 by 21. To light it with an item, use the item on the top face of a bottom frame block, inside the opening (as with flint and steel and a Nether frame).

Things you meet here that are limits of this feature, not faults, are marked "known limit" with their number from the plan (P1 to P18). Report them only if they look different from what is written.

### Loading

| Check | Expected |
|---|---|
| Title screen, **Mods** | `MSM Sample Portals` and `MSM Runtime` |
| `logs/latest.log` | The lines `[msm_runtime] registered 3 portal block(s)`, `registered 5 block(s) and 3 item(s) from 6 definition file(s); 0 error(s), 0 warning(s)` and `registered 1 sound event(s)`, and nothing at warning or error level from `msm_runtime` (in particular no `is not a level of this world`) |
| Creative tabs | Sky Stone in **Building Blocks**, Drift Beacon in **Functional Blocks**, Ember Key in **Tools and Utilities**. The three portals are in no tab and `/give @s msm_sample_portals:sky_portal` fails: a portal has no item |
| `/execute in msm_sample_portals:sky_realm run tp @s 0 -59 0` | You stand on grass in a flat, empty land with the overworld's sky. Come back with `/execute in minecraft:overworld run tp @s ~ 100 ~` (then fly down) |

### Sky Portal (Sky Stone, flint and steel, to Sky Realm)

| Check | Expected |
|---|---|
| Build a Sky Stone frame and use flint and steel inside it | The opening fills with the blue portal surface at once, with the flint and steel sound. In Survival the flint and steel loses one durability point; in Creative it does not |
| Build the frame along the other axis (turn 90 degrees) and light it | Works the same; the surface faces the other way |
| A too-small frame (opening 1 wide, or 2 high), or a frame with a gap in a side | Flint and steel places fire as usual; no portal appears |
| Use something that is not the igniter inside a whole frame (a stick, the Ember Key) | No portal |
| Look at the lit portal in the dark | It gives light (level 11), like a Nether portal |
| Stand near it | Purple sparkles drift around it, and now and then the portal hum plays (each block hums about once every 5 seconds) |
| Walk into it | The screen wobbles and the purple swirl overlay of the **Nether** portal grows, with the Nether portal's entry whoosh. Known limit P2: every portal shows the Nether portal's overlay and plays its whoosh; the overlay is not the blue surface picture |
| Stay in it (**Survival**) | After about 4 seconds (vanilla's delay, the gamerule `players_nether_portal_default_delay`) you are in Sky Realm, with the portal travel sound. In Creative it is almost at once |
| Arrival | You stand inside a new exit portal of Sky Stone (opening 2 wide and 3 high, corners filled) built on the grass near the place in Sky Realm with the same x and z as where you entered; the chat line `[<your name>] I came through the Sky Portal.` appears |
| Stand still in the exit | It does not send you straight back; step out and walk in again to travel |
| Walk back through the exit | You come out in the portal you first entered, in the overworld; nothing new is built there |
| Walk 200 blocks away in the overworld, build and light a second Sky Stone portal, and go through | A second exit is built in Sky Realm near the matching place (more than 128 blocks from the first one); walking back through it brings you to the second portal |
| First trip into a part of Sky Realm no one has visited | A short pause is possible while the land is made. Known limit P7 |
| Drop an item (a stack of cobblestone) into a lit Sky Portal | It disappears at once and lies at the exit portal in Sky Realm (go and look) |
| Lead a cow (or push one) into the portal | It goes through at once and appears at the exit in Sky Realm; the chat line `[Cow] I came through the Sky Portal.` appears (the line is said as the traveller) |
| Ride a saddled horse or a pig into the portal | Report what you see. Expected: the mount carries you through (vanilla takes a ridden mount and its rider together) and you are still riding on arrival |
| Break one Sky Stone of a side of a lit frame | The whole portal disappears |
| Break one block of the portal surface in Creative | The whole portal disappears |
| Lightning, a fire spreading, lava beside the frame, or a dispenser with flint and steel pointing into the frame | The frame is not lit. Known limit P6: only the igniter (used by a player) or the `light_portal` action lights a portal |
| Build a whole Sky Stone frame along x, then `/fill` its opening with `msm_sample_portals:sky_portal[axis=x]` and walk through | Report what you see. If the portal stands, it takes you to Sky Realm; a portal placed by a command or a structure joins the links only from its first use (known limit P4) |

### Ember Portal (gold and copper, the Ember Key, to the Nether)

| Check | Expected |
|---|---|
| Build a frame of blocks of gold, blocks of copper and waxed copper in any mix, and use the **Ember Key** inside | The opening fills with the amber surface, with the flint and steel sound. In Survival the key loses one of its 64 uses (its durability bar shrinks); in Creative it does not. After 64 lightings in Survival the key breaks |
| Use flint and steel inside the same frame | Fire, no portal: only the key lights this one |
| Use the Ember Key inside a Sky Stone or crying obsidian frame | Nothing: the key lights only ember frames |
| Stand near it | **Amber dust** particles, not the purple sparkles. The overlay when you stand in it is still the purple Nether swirl. Known limit P3: the colour applies to dust particles only; the vanilla portal sparkle stays purple |
| Its ambient sound | Now and then the **beacon's hum** (the project sound `ember.hum`) instead of the portal hum |
| Note your x and z, then go through (**Survival**: about 4 seconds) | You arrive in the Nether near x and z divided by 8 (from x 800, z 800 you arrive near x 100, z 100), in a new exit portal whose frame is made of **blocks of gold** (`frame_block`), corners included |
| Go back through the gold exit | You come out in the portal you entered in the overworld |
| Build a second ember portal in the Nether 30 blocks from the first exit and go through | You arrive in the overworld near x and z times 8; a new exit of gold is built there if no ember portal is within 128 blocks |
| A frame of unwaxed copper left for a long time | When a copper block weathers to exposed copper it no longer belongs to the tag, and the portal goes out if that block touches the opening's sides, top or bottom. Waxed copper and gold never change |
| `/gamerule allow_entering_nether_using_portals false`, then walk in | You are not taken to the Nether, as with the Nether portal (known limit P14). Set it back to `true` after |

### Drift Portal (crying obsidian, lit by the Drift Beacon, players only, surface arrival)

| Check | Expected |
|---|---|
| Build a crying obsidian frame and use flint and steel inside it | Fire, no portal: this portal has no igniter |
| Place the **Drift Beacon** on the ground just in front of the opening, next to its bottom block of air, and right-click it with an empty hand | The opening fills with the Nether portal picture (the default surface) and the chat line `The drift beacon is used.` appears; no lighting sound plays (the action plays none). With no empty frame next to it, only the chat line appears |
| Stand in it | **No** wobble, **no** overlay and **no** entry whoosh (`overlay: false`); the purple sparkles and the portal hum are still there |
| Stay in it (**Survival**: about 4 seconds) | You arrive in Sky Realm standing on the grass at the same x and z as where you entered, with the portal travel sound. **No** portal is built there (`arrival: surface`) |
| Getting back | There is no Drift Portal in Sky Realm. Take crying obsidian and a Drift Beacon with you and build one there, or use the Sky Portal's exit if you have one, or `/execute in minecraft:overworld run tp @s ~ 100 ~`. Going back through a Drift Portal lands you on the highest standing spot of the overworld at your x and z (a tree top or a roof is possible), and builds nothing |
| Drop an item into it, or push a cow into it | Nothing happens: players only |
| Ride a horse into it | Nothing happens: the horse is not a player and a rider cannot use a portal on their own |
| The Sky Portal and the Drift Portal both go to Sky Realm | They never share exits: each block links only to portals of the same block (known limit P17) |

### Saving, reloading and commands

| Check | Expected |
|---|---|
| Light a Sky Portal, travel, save and quit, load the world, travel again both ways | The links are kept: you come out in the same portals as before |
| `/reload` | Works; frames and igniters keep working. Adding a portal or changing where one leads needs a game restart (known limit P10) |
| `/loot give @s mine <x> <y> <z>` pointed at a portal block | Nothing: a portal drops nothing |
| A world made in a vanilla game (no mods) with the vanilla data pack built from this project | The world loads without errors; Sky Realm is there (reach it with the `execute in` line above), but there are no portals (known limit P1: a portal needs the Fabric mod jar) |

### Modpack and servers

Portals are read from the jar on each side, so the client and the server must have the same jar (known limit P15).

| Check | Expected |
|---|---|
| A dedicated Fabric server on the same version with the jar in `mods`, and your client with the same jar, joined together | Joins without errors; the server log has the three `msm_runtime` lines above. Lighting, travel (both ways), the exit portals, the amber dust, the beacon hum, the overlay on the Sky and Ember Portals and none on the Drift Portal all work as in single player |
| Two players: one goes through the Sky Portal, the other follows | Both arrive in the same exit portal |
| Server jar one build older than the client | Report what you see; this is not supported (update both together) |

### On 26.4 specifically

| Check | Expected |
|---|---|
| Title screen, **Mods** | `MSM Sample Portals` and `MSM Runtime` |
| Everything above | Looks and behaves like 26.3 |
| `logs/latest.log` | The same `msm_runtime` lines, and nothing at warning or error level from `msm_runtime` |

Things only the game client can confirm, and worth reporting if they look wrong (known limit P11: no test drives a real client): the portal surface pictures and how see-through they are, the overlay and wobble (and their absence on the Drift Portal), the entry whoosh, the hums and the travel sound, the particle colours, how long you wait in a portal, whether a mount keeps its rider, and anything that differs between 26.3 and 26.4.

## Changing the sample

Do not edit the generated files by hand. Change the elements in `packages/exporters/test/sample-portals.golden.test.ts`, then regenerate this folder and the pinned hashes, and commit the changes on purpose:

```sh
UPDATE_GOLDENS=1 pnpm --filter @msm/exporters test
```

To build the jar with the real runtime locally and run the headless server check as CI does (JDK 25 on `JAVA_HOME` and first on `PATH`; the paths must be absolute because the test runs in `packages/exporters`; add `-Pmc=26.4` and `MSM_TARGET_ID=mc-26.4` for 26.4):

```sh
cd engine-mod && ./gradlew build && cd ..
MSM_RUNTIME_JAR="$(ls "$PWD"/engine-mod/build/libs/msm_runtime-*.jar | grep -v sources)" \
  MSM_SAMPLE_PORTALS_OUT="$PWD/build/sample-portals" \
  pnpm --filter @msm/exporters exec vitest run test/sample-portals.golden.test.ts
node tools/run-fabric-server/index.ts --jar build/sample-portals/msm_sample_portals.jar --facts build/sample-portals/fabric-facts.json
```

`MSM_SAMPLE_PORTALS_JAVA_OUT` (an absolute folder) writes the ejected 26.3 Java project with `sample-portals.java.golden.test.ts`; it builds with its own `./gradlew build`, and its jar starts with `node tools/run-fabric-server/index.ts --jar <jar> --minecraft 26.3 --loader 0.20.1 --fabric-api 0.165.2+26.3 --no-runtime`.

This README is not generated and is kept as it is.
