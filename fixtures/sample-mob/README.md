# Sample mob project

A kitchen-sink MCSuperMods project for an animated entity in the Fabric content jar (ADRs 0028 and 0029), namespace `msm_sample_mob`: an `msm:mod`, one entity `glow_golem` that uses every entity component, all six AI goal types, the trigger events and the `play_animation` action, with a natural spawn and a spawn egg; one GeckoLib geo model, one animation set (`idle`, `walk`, `attack`, `wave`), two placeholder textures (the 64x64 skin and the 16x16 egg), two functions and one loot table; since ADR 0057 a `sounds.json` with the golem's four project sound events (ambient, hurt, death, step); since ADR 0061 the triggers `msm:on_tick` (a heal of 2 every 20 ticks) and `msm:on_spawn` (Glowing for 10 seconds and the function `golem/arrive`).

`packages/exporters/test/sample-mob.golden.test.ts` checks it on every run:

- the folder equals the elements and textures listed in the test saved as a project (it fails when the list changes and this folder is not regenerated);
- every element validates with zero problems, the project validators report nothing, and the function passes the offline mcfunction checker;
- the content jar exports with zero problems (with stub runtime and GeckoLib jars nested), and its SHA-256 is pinned per target, built in two time zones;
- the jar holds `msm/msm_sample_mob/entity/glow_golem.json` and the GeckoLib model and animations under `assets/msm_sample_mob/geckolib/`, each valid against its MSM schema, and `fabric.mod.json` depends on `geckolib` and nests both jars.

CI's `engine-mod` job then builds `msm_runtime` with Gradle, exports this project with the real runtime and the real GeckoLib jar nested (GeckoLib is downloaded from the target's facts and checked against its SHA-512), and starts a headless Fabric dedicated server with it (`tools/run-fabric-server`). The server must log

```
[msm_runtime] registered 4 sound event(s)
[msm_runtime] registered 0 block(s) and 1 item(s) from 1 definition file(s); 0 error(s), 0 warning(s)
[msm_runtime] registered 1 entity type(s)
```

(the spawn egg is the one item) and nothing from the runtime or GeckoLib at warning or error level. The jar is kept as the workflow artefact `msm-sample-mob`. The server has no renderer, so how the mob looks and animates is left to the in-game check below.

The same job also exports this project as a Java project (ADR 0033; `sample-mob.java.golden.test.ts` with `MSM_SAMPLE_MOB_JAVA_OUT`, GeckoLib nested by Loom), builds it with its own `./gradlew build`, and runs the behaviour-parity GameTests of `engine-mod/parity/` (`SampleMobParityTest`: the entity type's category, size, eye height and fire immunity, its attributes and loot table, the spawn egg and `SpawnEggItem.getType`, the natural spawn in forests and plains (weight 5, groups of 1 to 2) and not in deserts, walking to a target, the first melee hit on a pig taking exactly 5 health, and on death the function's `say` line and the glowstone dust drop; since ADR 0057 the ambient interval of 200 ticks and the ambient, step, hurt and death sounds being the four project sound events, read as the sound packets a listening player receives (`ParityEars`); since ADR 0061 a hurt golem with its AI heals 4 to 6 health in 45 ticks while one with `NoAI` heals none (`msm:on_tick`), and an egg spawn makes the golem glow, says `The glow golem arrives.` and tags the golem `msm_sample_arrived` (the function runs as the golem) while a copy loaded from the saved golem (its Glowing taken off first) does not glow again (`msm:on_spawn`)) twice: on the content jar with `msm_runtime` and on the ejected jar without it (`--gametest-filter 'msm_parity_tests:sample_mob_*'`, `--no-runtime` for the ejected jar). The same tests passing on both is the parity check; the reports are kept as the artefact `parity-gametest-reports`.

## Contents

| Element | Kind | What it shows |
|---|---|---|
| `msm_sample_mob:mod` | mod metadata | `fabric.mod.json`: id `msm_sample_mob`, version 1.0.0, MIT |
| `msm_sample_mob:glow_golem` | entity | creature, 0.8 x 1.9 hitbox, eye height 1.6; `msm:health` 40; `msm:movement` (speed 0.25, follow range 24, knockback resistance 0.4, swims, fire immune); `msm:attack` 5 damage, knockback 0.5, `on_attack` plays the iron golem attack sound; goals `melee_attack` (priority 1, zombies, retaliates), `flee` (creepers), `follow` (players, stops at 3 blocks, range 12), `wander`, `look_at_player`, `look_around`; `msm:animated_model` with `idle`, `walk`, `attack` and 4 transition ticks; `msm:on_hurt` (glow particles), `msm:on_interact` (`play_animation` `wave` and a chime), `msm:on_death` (end rod particles and `run_function`), `msm:on_tick` every 20 ticks (`heal` 2), `msm:on_spawn` (`apply_effect` Glowing for 10 seconds and `run_function` `golem/arrive`); `sounds`: the project sound events `golem.ambient` (every 200 ticks on average), `golem.hurt`, `golem.death` and `golem.step`; natural spawn in `#minecraft:is_forest` and `minecraft:plains`, weight 5, groups of 1 to 2; spawn egg in the Spawn Eggs tab with its own texture; drops from its own loot table |
| `msm_sample_mob:entity/glow_golem` | geo model | biped (body, head, two arms, two legs) over a 64x64 texture, Bedrock geometry 1.12.0 |
| `msm_sample_mob:entity/glow_golem_animations` | animation | `idle` (a slow bob), `walk` (arm and leg swing), `attack` (both arms swing down), `wave` (the right arm waves) |
| `textures/entity/glow_golem.png` | texture | 64x64 two-tone yellow checker skin |
| `textures/item/glow_golem_spawn_egg.png` | texture | 16x16 speckled yellow egg |
| `msm_sample_mob:sounds` | sounds | `assets/msm_sample_mob/sounds.json`: `golem.ambient`, `golem.hurt`, `golem.death` and `golem.step`, each playing a vanilla iron golem sound file (walk, hit, death, walk); the runtime registers them as sound events (ADR 0057) |
| `msm_sample_mob:golem/glow_burst` | function | `particle` and `say`, run when the golem dies |
| `msm_sample_mob:golem/arrive` | function | `say The glow golem arrives.` and `tag @s add msm_sample_arrived`, run when a golem spawns (as the golem, at the golem: without a player, an entity's own events run functions as the mob) |
| `msm_sample_mob:entities/glow_golem` | loot table | 1 to 3 glowstone dust |

All content is original work written for MCSuperMods; the project contains no Mojang files.

## In-game check (Windows, Minecraft Java 26.3)

You need the content jar, Fabric Loader 0.20.1 or newer for 26.3, and Fabric API 0.165.2+26.3 (or newer for 26.3). The jar contains `msm_runtime` and GeckoLib; do not install either separately.

**Get the jar**, either way:

- from the latest CI run: Actions → CI → the run → Artifacts → `msm-sample-mob`, unzip to get `msm_sample_mob.jar`; or
- from the app: copy this folder outside the repository, open it in MCSuperMods and export the Fabric mod jar (runtime and GeckoLib nested, the default).

**Install it** as described in `fixtures/sample-mod/README.md` (Prism Launcher or the official launcher), with `msm_sample_mob.jar` in place of `msm_sample_mod.jar`.

Create a new **Creative** world with cheats on, then check:

| Check | Expected |
|---|---|
| Title screen → **Mods** | `MSM Sample Mob 1.0.0`, with `MSM Runtime` and `GeckoLib 5` listed |
| Creative tab **Spawn Eggs** | **Glow Golem Spawn Egg**, a speckled yellow egg |
| Use the egg on the ground | A Glow Golem appears: a two-legged figure with a yellow checker skin, about as tall as a player |
| Watch it stand still | It idles: a slow up-and-down bob, the head nodding slightly |
| Watch it walk about | Its arms and legs swing while it moves |
| Walk away from it (within 12 blocks) | It follows you and stops about 3 blocks away; it looks at you when you are near |
| Right-click it | It waves its right arm once, and an amethyst chime plays |
| `/summon msm_sample_mob:glow_golem ~ ~ ~2` | Another Glow Golem appears |
| `/summon minecraft:zombie ~ ~ ~5` | The golem attacks the zombie: both arms swing down on each hit and the iron golem attack sound plays |
| `/summon minecraft:creeper ~ ~ ~4 {Fuse:32767}` (a fuse that never runs out) | The golem moves away from the creeper |
| Put it in lava or set it on fire | It takes no fire damage |
| Put it in deep water | It floats up and swims |

Then switch to **Survival** (`/gamemode survival`):

| Check | Expected |
|---|---|
| Hit the golem | Glow particles appear; it fights back and plays its attack animation as it hits you |
| Kill it | End rod particles, the chat line `The glow golem fades.`, glow particles from the function, and 1 to 3 glowstone dust drop (the hurt event does not fire on the killing blow) |
| Listen to a golem standing still for half a minute (**Hostile** and **Friendly Creatures** volume up) | Now and then (about every 10 seconds) a heavy iron golem step plays as its idle sound (`golem.ambient`) |
| Watch a golem walk | Iron golem steps with each stride (`golem.step`), not the generic step sound |
| Hit it, then kill it | The iron golem hurt sound on each hit (`golem.hurt`) and the iron golem death sound when it dies (`golem.death`); not the generic player-like hurt sound and not silence |
| Use the spawn egg | The chat line `The glow golem arrives.` once, sent by the golem (its name in the brackets, not `Server`), and the new golem glows (an outline through walls) for 10 seconds; `/tag @e[type=msm_sample_mob:glow_golem,limit=1,sort=nearest] list` shows `msm_sample_arrived` |
| Quit to the title screen and open the world again | No `The glow golem arrives.` and no new glow for the golems already there |
| Hurt a golem a little (one hit) and step back out of its reach | Its health comes back by one heart a second (F3 + B is no help: use `/data get entity @e[type=msm_sample_mob:glow_golem,limit=1,sort=nearest] Health`) |
| Explore a forest or plains biome in a new world | Glow Golems spawn naturally, alone or in pairs (they are creatures, so mostly at world generation and on grass) |

Finally open the game log (Prism: the instance's **Minecraft Log**; official launcher: `%APPDATA%\.minecraft\logs\latest.log`) and check that it has the lines

```
[msm_runtime] registered 4 sound event(s)
[msm_runtime] registered 0 block(s) and 1 item(s) from 1 definition file(s); 0 error(s), 0 warning(s)
[msm_runtime] registered 1 entity type(s)
```

and no other line containing `[msm_runtime]` at WARN or ERROR, no GeckoLib warning or error (such as "Unknown geo model format version" or "Unsupported geo model format version"), no `Failed to load` and no missing-texture warning mentioning `msm_sample_mob`. Report any such line.

Things only the game client can confirm, and worth reporting if they look wrong: the model's shape and texture mapping (compare with the app's preview), the animations' direction and speed, the egg's texture and name, the entity's name (`Glow Golem`) on hover in the F3 crosshair info, and the particle positions.

## On 26.4 and the two renderers

Mobs work on 26.4 as well as 26.3 (ADR 0073). The difference is only how the golem is drawn:

- On **26.3** the golem is drawn by GeckoLib (`renderer` `auto` means GeckoLib there). The jar nests `msm_runtime` and GeckoLib, and the check above is the one to follow.
- On **26.4** there is no GeckoLib. Export the project with the target set to 26.4: the jar nests only `msm_runtime` and `fabric.mod.json` does not depend on `geckolib`. `auto` then means the built-in vanilla renderer, which reads the same geo model, animation and texture files. The export reports one information note that the golem uses the vanilla renderer; it is not a problem.
- Fabric Loader and Fabric API for 26.4: use the versions the 26.4 target lists (verify at implementation).

To check on 26.4, install the 26.4 jar as described above and run the same tables. What should look the same as on 26.3: the figure's shape and skin, the idle bob, the walk swing, the `attack` swing on each hit and the `wave` on a right-click. What the vanilla renderer does differently and is fine: the head does not turn to follow you (neither renderer turns the head), and the golem has no `sit`, `fly` or `swim` pose, so it keeps its idle or walk while in water. If the golem is invisible or the log says a model file could not be read, report it with the line from `logs/latest.log`; a broken file is logged once and the mob is simply not drawn.

The vanilla renderer is only confirmed in the game. Compare the golem on 26.4 with the app's preview for orientation, texture mapping and mirrored limbs, and press F3 + T after editing a model file to reload it.

## Changing the sample

Do not edit these files by hand. Change `SAMPLE_ELEMENTS` or `SAMPLE_ASSETS` in `packages/exporters/test/sample-mob.golden.test.ts`, then regenerate this folder and the pinned hash, and commit the changes on purpose:

```sh
UPDATE_GOLDENS=1 pnpm --filter @msm/exporters test
```

To build the jar with the real runtime and GeckoLib locally and run the headless server check (as CI does; JDK 25 on `JAVA_HOME`; the paths must be absolute because the test runs in `packages/exporters`; GeckoLib is downloaded to `MSM_GECKOLIB_JAR` when that file is missing or does not match the target's SHA-512, and Node needs `NODE_USE_ENV_PROXY=1` behind a proxy):

```sh
cd engine-mod && ./gradlew build && cd ..
MSM_RUNTIME_JAR="$(ls "$PWD"/engine-mod/build/libs/msm_runtime-*.jar | grep -v sources)" \
  MSM_GECKOLIB_JAR="$HOME/.cache/msm-fabric-server/geckolib.jar" MSM_SAMPLE_MOB_OUT="$PWD/build/sample-mob" \
  pnpm --filter @msm/exporters exec vitest run test/sample-mob.golden.test.ts
node tools/run-fabric-server/index.ts --jar build/sample-mob/msm_sample_mob.jar --facts build/sample-mob/fabric-facts.json
```

This README is not generated and is kept as it is.
