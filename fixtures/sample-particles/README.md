# Sample particles project

A kitchen-sink MCSuperMods project for particles (ADRs 0080 and 0081), namespace `msm_sample_particles`: an `msm:mod`, three particle types of its own, two blocks that show particles by themselves (ambient particles), three items that send particles, a status effect whose particle is a project particle, a function and a script. The particle frames and the other pictures are the library's placeholder pictures; nothing in the folder is a Mojang file. It works on **26.3** and on **26.4**. Its siblings are `fixtures/sample-mod/` (blocks and items), `fixtures/sample-script/` (scripts) and `fixtures/sample-portals/` (portals).

`packages/exporters/test/sample-particles.golden.test.ts` checks it on every run: the folder equals the project built in code, every element validates with zero problems, the plugins' validators report nothing, the function passes the offline command checker, the script type-checks, and the content jar exports for both targets with its SHA-256 pinned per target. The jar holds the three particle definitions (`msm/msm_sample_particles/particle/`), their descriptions (`assets/msm_sample_particles/particles/<name>.json`, each listing its four frames) and the twelve frame pictures (`assets/msm_sample_particles/textures/particle/<name>_0..3.png`). `sample-particles.java.golden.test.ts` pins the Java project export of 26.3 (`ModParticles.java`, the client particle classes, `particle/ParticleSpecs.java` and `particle/AmbientParticles.java`); the script is not ejected (`export.scripts-not-ejected`, the eject has no scripts). The vanilla data pack keeps only the `burst` function, with the warning `export.mod-only-function` (it names a mod-only particle, so a vanilla server skips that function), and leaves out the loot tables of the two blocks (`export.mod-only-reference`); the vanilla resource pack keeps the descriptions and frames, which a game without the mod ignores. This README is the one file in the folder that is written by hand; the test leaves it alone.

A headless Fabric server with the content jar starts on 26.3 and on 26.4 and logs `[msm_runtime] registered 3 particle type(s)`, `[msm_runtime] registered 2 block(s) and 5 item(s) from 9 definition file(s); 0 error(s), 0 warning(s)`, `[msm_runtime] registered 0 entity type(s) and 1 mob effect(s)` and `[msm_runtime] loaded 1 script(s); 0 error(s)`, with nothing from `msm_runtime` at warning or error level (so the options objects decoded at server start). The ejected 26.3 project builds with its own `./gradlew build` and starts without `msm_runtime`. A server draws nothing: particles are drawn by each player's game, so how they look and move is left to the in-game check below.

## Contents

| Element | Kind | What it shows |
|---|---|---|
| `msm_sample_particles:mod` | mod metadata | `fabric.mod.json`: id `msm_sample_particles` |
| `msm_sample_particles:spark` | particle | an amber spark drawn from four frames played once over its life (`animation: age`), 16 to 24 ticks, size 0.15, **glows in the dark** (`emissive`), **floats up** slowly (`gravity` -0.02) and **fades out** |
| `msm_sample_particles:petal` | particle | a pink leaf shape; each petal shows **one random frame** of four (`animation: random`), lives 60 ticks, **falls** (`gravity` 0.4), **spins** 6 degrees a tick and **stops on blocks** (`collision`) |
| `msm_sample_particles:bubble` | particle | a pale round bubble looping through four frames (a frame every 5 ticks), lives 40 ticks, size 0.25, rises (`gravity` -0.05), **see-through** (`translucent`), **fades in and out** and is **shown from far away** and with Particles: Minimal (`always_show`) |
| `msm_sample_particles:spark_lamp` | block | glows (light 10); now and then **sparks** appear just above its top by themselves (`msm:ambient_particles`: chance 0.5, 2 at a time). Right-clicking it runs the script below. Functional Blocks tab |
| `msm_sample_particles:ember_vent` | block | **orange vanilla dust** appears just above its top by itself, with a small upward push (`msm:ambient_particles` with a `minecraft:dust` options object and `velocity` [0, 0.08, 0]); needs a pickaxe. Functional Blocks tab |
| `msm_sample_particles:spark_wand` | item | using it (right-click, at most twice a second) sends **20 sparks straight up** from your feet, each starting at 0.2 blocks a tick (`spawn_particle` with `motion`) |
| `msm_sample_particles:dust_wand` | item | using it sends a cloud of **40 large sky-blue dust** particles around your feet (`spawn_particle` with a `minecraft:dust` options object, scale 2) |
| `msm_sample_particles:petal_charm` | item | while you hold it in your main hand, **6 petals** appear around your feet once a second (`msm:while_held` every 20 ticks), sent with `force`, so other players see them up to 512 blocks away and whatever their Particles setting |
| `msm_sample_particles:glimmer` | status effect | Glimmer: no effect but its look; whoever has it gives off **bubbles** (`particle: msm_sample_particles:bubble`) |
| `msm_sample_particles:burst` | function | `particle msm_sample_particles:spark ~ ~1 ~ 0.5 0.5 0.5 0 30` (30 sparks around the head), then the chat line `A burst of 30 sparks.` |
| `msm_sample_particles:particles` | script | when a player right-clicks the Spark Lamp with the main hand: 8 **petals** fall from above the lamp, 16 **pieces of the lamp itself** burst around it (`world.spawnParticle` with a `minecraft:block` options object), and the server log gets `block.interact: <name> used the spark lamp at <x, y, z>` |
| `block/spark_lamp`, `block/ember_vent`, `item/*` | models | cubes over the placeholder pictures; the items are flat |

All content is original work written for MCSuperMods; the project contains no Mojang files.

## In-game check (Windows, Minecraft Java 26.3 and 26.4)

Do the whole list twice, once per version.

- **26.3:** the 26.3 content jar, Fabric Loader 0.20.1 or newer and Fabric API 0.165.2+26.3 (or newer for 26.3). The jar contains `msm_runtime`; do not install it separately.
- **26.4:** the 26.4 jar (the app exports it when the project target is 26.4), with Fabric Loader 0.20.1 and Fabric API 0.165.4+26.4 (the 26.4 target's facts). The jar contains `msm_runtime` only.

**Get the jar**, either way:

- from the latest CI run: Actions, CI, the run, Artifacts, then unzip the sample particles jar; or
- from the app: copy this folder outside the repository, open it in MCSuperMods, choose the target and export the Fabric mod jar (runtime nested, the default).

**Install it** with Prism Launcher as described in `fixtures/sample-mod/README.md`, with `msm_sample_particles.jar` in place of `msm_sample_mod.jar`. Create a new **Creative** world with cheats on (a superflat world is easiest). Give yourself the things: `/give @s msm_sample_particles:spark_lamp`, `/give @s msm_sample_particles:ember_vent`, `/give @s msm_sample_particles:spark_wand`, `/give @s msm_sample_particles:dust_wand`, `/give @s msm_sample_particles:petal_charm`. **Options, Video Settings, Particles** should be **All** unless a check says otherwise.

Things you meet here that are limits of this feature, not faults, are marked "known limit" with their number from the limits table of the particles plan (K1 to K16; they move into ADR 0080's findings, `docs/adr/0080-custom-particle-types.md`, when the batch closes). Report them only if they look different from what is written.

### Loading

| Check | Expected |
|---|---|
| Title screen, **Mods** | `MSM Sample Particles` and `MSM Runtime` |
| `logs/latest.log` (Prism: the instance's **Minecraft Log**) | The lines `[msm_runtime] registered 3 particle type(s)`, `registered 3 particle provider(s)`, `registered 2 block(s) and 5 item(s) from 9 definition file(s); 0 error(s), 0 warning(s)` and `registered 0 entity type(s) and 1 mob effect(s)`; after the world opens `loaded 1 script(s); 0 error(s)`; nothing at warning or error level from `msm_runtime` (in particular no `has no sprites` and no vanilla `Missing particle sprites` line) |
| Creative tabs | Spark Lamp and Ember Vent in **Functional Blocks**; Spark Wand, Dust Wand and Petal Charm in **Tools and Utilities** |
| Type `/particle msm_sample_particles:` and look at the suggestions | `bubble`, `petal` and `spark` are offered |

### The three particles, one by one

Stand on open ground, look at the space in front of you and run each command a few times. Then do it again at night (`/time set midnight`) or under a roof.

| Check | Expected |
|---|---|
| `/particle msm_sample_particles:spark ~ ~1 ~2 0.3 0.3 0.3 0 20` | 20 small amber sparks; each changes shape through its four frames as it ages, drifts slowly upwards and fades away within about a second |
| The same at night or in a dark room | The sparks stay bright (glow in the dark); they light up nothing around them (known limit K8: particles are flat pictures that cast no light) |
| `/particle msm_sample_particles:petal ~ ~2 ~2 0.5 0.2 0.5 0 15` | 15 pink petals, each showing one of four shapes chosen at random, falling and turning as they fall; they come to rest on the ground (they stop on blocks) and vanish after 3 seconds |
| The petal command over leaves | The petals stop on the leaves, as on the ground |
| `/particle msm_sample_particles:bubble ~ ~1 ~2 0.3 0.3 0.3 0 10` | 10 pale bubbles that you can see through, rising slowly, cycling through four shapes, fading in at the start and out at the end of their 2 seconds |
| Walk around a cloud of petals or bubbles (F5 for the third-person view too) | Each particle always faces the camera (known limit K8: camera-facing flat pictures only; no trails, no 3D shapes) |
| `/particle msm_sample_particles:spark ~ ~1 ~2 0 0 0 0 1` with a different colour in mind | There is no way to colour a project particle per command: a spark is always amber (known limit K2: the look is fixed per particle type; vanilla dust, block and item particles take options, as below) |

### Blocks that show particles by themselves

| Check | Expected |
|---|---|
| Place the **Spark Lamp** and wait | Now and then a pair of glowing sparks appears just above its top and floats off; the lamp gives light |
| Place the **Ember Vent** and wait | Now and then small orange dust appears just above its top with a small upward push |
| Walk more than about 32 blocks away from both | They stop showing particles (the game draws block particles near the player only) |
| Right-click the Spark Lamp with an empty hand | 8 petals fall from above the lamp and pieces of the lamp (its own picture) burst around it; the game log shows `block.interact: <your name> used the spark lamp at ...` from `msm_sample_particles:particles` |

### Items

| Check | Expected |
|---|---|
| Hold the **Spark Wand** and right-click into the air | 20 sparks shoot straight up from your feet, spread a little, and slow down as they rise; using it again within half a second does nothing (cooldown) |
| Hold the **Dust Wand** and right-click | A cloud of large sky-blue dust appears around your feet |
| Hold the **Petal Charm** in your main hand | Once a second 6 petals appear around your feet and settle on the ground; move it to the off hand and they stop |
| Run the **`burst`** function: `/function msm_sample_particles:burst` | 30 sparks around your head, and the chat line `[<your name>] A burst of 30 sparks.` |

### Effect

| Check | Expected |
|---|---|
| `/effect give @s msm_sample_particles:glimmer 30` | The inventory screen lists Glimmer; bubbles rise around you (F5 to see them from outside) |
| Summon a cow, give it Glimmer (`/effect give @e[type=cow,limit=1,sort=nearest] msm_sample_particles:glimmer 600`) and walk 40 blocks away | The cow still gives off bubbles: the bubble is shown from far away (`always_show`) |

### Distance and the Particles setting

Known limit K6: the game draws a particle only within 32 blocks and leaves most out with Particles: Minimal, unless the particle type is `always_show` or the spawn uses `force`.

| Check | Expected |
|---|---|
| Stand 40 blocks from the Spark Lamp and run `/execute positioned <lamp x> <lamp y> <lamp z> run function msm_sample_particles:burst` | No sparks are drawn at the lamp: a spark sent without `force` reaches players within 32 blocks only |
| The same with `/particle msm_sample_particles:spark <lamp x> <lamp y+1> <lamp z> 0.5 0.5 0.5 0 30 force` | The sparks are drawn, 40 blocks away |
| Set **Particles: Minimal**, then use the Spark Wand, the Dust Wand, the `burst` function and watch the Spark Lamp | The sparks and the dust are not drawn, or only a few |
| With Minimal still on: hold the Petal Charm, and give yourself Glimmer | The petals (sent with `force`) and the bubbles (`always_show`) are still drawn |
| Set Particles back to **All** | Everything shows again |

### Two players

Particles are drawn by each player's game from its own copy of the jar, so the client and the server need the same jar (known limits K1 and K3).

| Check | Expected |
|---|---|
| A dedicated Fabric server on the same version with the jar in `mods`, your client with the same jar, joined | Joins without errors; the server log has the `msm_runtime` lines above. Everything above works as in single player |
| A second player 100 blocks away while you hold the Petal Charm | They see your petals (`force`: up to 512 blocks) |
| A second player 100 blocks away while you use the Spark Wand | They see nothing (no `force`; 32 blocks) |
| A vanilla client (no mods) joins the server | Report what you see. Expected: it cannot join, as with any server that has the mod's blocks and items (known limit K1) |

### Vanilla packs, resource packs and missing pictures

| Check | Expected |
|---|---|
| In the app, export the vanilla data pack, put it in a world of an unmodded game | The world loads; `/function msm_sample_particles:burst` is unknown (the function names a mod-only particle, so the game leaves it out; the export warned about it) (known limits K1 and K12) |
| The vanilla resource pack of the project in an unmodded game | Loads without errors; nothing changes (its particle descriptions are for types the game does not have) |
| A resource pack holding only `assets/msm_sample_particles/particles/bubble.json` with `{ "textures": [] }`, on top, with the mod; then `/particle msm_sample_particles:bubble ~ ~1 ~2 0 0 0 0 5` | Report what you see. Expected (known limit K10): no bubbles are drawn, the game does not crash, and the log gets one `[msm_runtime] particle msm_sample_particles:bubble has no sprites ...` warning |
| In the app, open the library example **Blue flame**, export its resource pack and use it in a game with or without the mod; look at a torch | The torch flames use the example's blue picture: a resource pack can change a vanilla particle's pictures, never how it moves |

### On 26.4 specifically

| Check | Expected |
|---|---|
| Title screen, **Mods** | `MSM Sample Particles` and `MSM Runtime` |
| Everything above | Looks and behaves like 26.3 |
| `logs/latest.log` | The same `msm_runtime` lines, and nothing at warning or error level from `msm_runtime` |
| Java eject | Particles in an ejected Java project are for 26.3 only (known limit K15) |

Other limits a player meets here: block particles are drawn by the client only, so no test on a server can see them (K5); items and mobs show particles only through their triggers (`on_use`, `while_held`), never as a trail drawn by the client (K9); each `spawn_particle` with `motion` sends one network packet per particle per player (K13; the Spark Wand sends 20); scripts send particles from the server and cannot draw or move them on the client (K16); new particle types and changes to how a type behaves need a game restart, while its pictures reload with the resource packs (F3+T) (K7).

Things only the game client can confirm, and worth reporting if they look wrong: the frame pictures and how the four frames follow each other, the colours, the glow at night, the fades, the spin and fall of the petals, how see-through the bubbles are, the lamp's and the vent's ambient particles, the wand burst and the dust cloud, `force` from far away, Particles: Minimal, and anything that differs between 26.3 and 26.4. The runtime's own client GameTest draws its test particles headlessly on both versions (B356), but not this sample's.

## Changing the sample

Do not edit the generated files by hand. Change the elements in `packages/exporters/test/sample-particles.golden.test.ts`, then regenerate this folder and the pinned hashes, and commit the changes on purpose:

```sh
UPDATE_GOLDENS=1 pnpm --filter @msm/exporters test
```

To build the jar with the real runtime locally and run the headless server check as CI does (JDK 25 on `JAVA_HOME` and first on `PATH`; the paths must be absolute because the test runs in `packages/exporters`; add `-Pmc=26.4` and `MSM_TARGET_ID=mc-26.4` for 26.4):

```sh
cd engine-mod && ./gradlew build && cd ..
MSM_RUNTIME_JAR="$(ls "$PWD"/engine-mod/build/libs/msm_runtime-*.jar | grep -v sources)" \
  MSM_SAMPLE_PARTICLES_OUT="$PWD/build/sample-particles" \
  pnpm --filter @msm/exporters exec vitest run test/sample-particles.golden.test.ts
node tools/run-fabric-server/index.ts --jar build/sample-particles/msm_sample_particles.jar \
  --facts build/sample-particles/fabric-facts.json \
  --expect-line '[msm_runtime] registered 3 particle type(s)'
```

`MSM_SAMPLE_PARTICLES_JAVA_OUT` (an absolute folder) writes the ejected 26.3 Java project with `sample-particles.java.golden.test.ts`; it builds with its own `./gradlew build`, and its jar starts with `node tools/run-fabric-server/index.ts --jar <jar> --facts build/sample-particles/fabric-facts.json --no-runtime --forbid-line NoClassDefFoundError` (the dedicated server must load none of the client particle classes).

This README is not generated and is kept as it is.
