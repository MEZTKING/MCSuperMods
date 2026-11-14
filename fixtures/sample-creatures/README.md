# Sample creatures project

A kitchen-sink MCSuperMods project for the mob expansion (ADR 0073), namespace `msm_sample_creatures`: an `msm:mod`, six entities that between them use every new mob feature, one throwable item, six placeholder skins and models, six spawn eggs and eight small functions. It works on **26.3** (drawn by GeckoLib) and on **26.4** (drawn by the built-in vanilla renderer, no GeckoLib). Its sibling `fixtures/sample-mob/` shows the older single animated golem.

`packages/exporters/test/sample-creatures.golden.test.ts` checks it on every run: the folder equals the project built in code, every element validates with zero problems, the content jar exports for both targets with its SHA-256 pinned per target, and the Java project export (`sample-creatures.java.golden.test.ts`) matches its golden. This README is the one file in the folder that is written by hand; the test leaves it alone.

CI's `engine-mod` job exports the project with the real runtime, starts a headless Fabric server on 26.3 and on 26.4 (`tools/run-fabric-server`) and requires zero errors; the server facts are 0 blocks, 7 items (six eggs and `spark`) and 6 entities. The server draws nothing, so how the creatures look and feel is left to the in-game check below.

## Contents

| Element | Kind | What it shows |
|---|---|---|
| `msm_sample_creatures:mod` | mod metadata | `fabric.mod.json`: id `msm_sample_creatures` |
| `msm_sample_creatures:pet` | entity | an animal (base `animal`), scale 0.8; tameable with a bone (always succeeds, 20 health once tamed); breedable with cooked beef, babies at half size; two variants chosen by biome: `default` and `snow` (snowy taiga and snowy plains); a short melee attack and `leap_at_target`; spawns in forests and snowy taiga. Events: `tamed` and `bred` |
| `msm_sample_creatures:mount` | entity | an animal, scale 1.4; rideable with a saddle (jump strength 0.7, a bone called `saddle` that is only drawn while saddled); `panic` goal; spawns in plains and meadows. Event: `mounted` |
| `msm_sample_creatures:glider` | entity | a flyer (mode `fly`, hovers); throws the project item `spark` at zombies; not rideable, so its `saddle` bone is always drawn. Event: `shot` |
| `msm_sample_creatures:fish` | entity | a swimmer (category `water_ambient`, mode `swim`, dries out after 300 ticks on land); flees from players; random variants `blue` and `orange`; spawns in oceans in groups of 2 to 4 |
| `msm_sample_creatures:archer` | entity | a monster that shoots arrows (range 15, strafes, targets players); spawns in plains. Event: `shot` |
| `msm_sample_creatures:boss` | entity | a monster with 200 health, scale 1.5, renderer set to `vanilla` on purpose (so it is drawn by the vanilla renderer on 26.3 too); melee 10 damage and snowballs; a red `notched_10` boss bar that darkens the sky. Events: `shot` and `defeated`. No natural spawn |
| `msm_sample_creatures:spark` | item | a throwable (damage 2, speed 1.2, light gravity) in the Combat tab; `spark_hit` event when it hits an entity |
| `msm_sample_creatures:entity/<name>` and `<name>_animations` | geo model, animation | one of each per entity, with the states each needs (`idle`, `walk`, `attack`, `shoot`, and `sit`, `fly` or `swim` where used) |
| `textures/entity/*.png`, `textures/item/*.png` | textures | placeholder skins (`pet_snow` and `fish_orange` are the variants), six spawn egg pictures and the `spark` icon |
| `msm_sample_creatures:say/*` | functions | `tamed`, `bred`, `mounted`, `glider_shot`, `spark_hit`, `archer_shot`, `boss_shot`, `boss_defeated`: each is one `say` line that tells you its event ran |
| `msm_sample_creatures:entities/*` | loot tables | one small table per entity |

All content is original work written for MCSuperMods; the project contains no Mojang files.

## In-game check (Windows, Minecraft Java 26.3 and 26.4)

Do the whole list twice, once per version.

- **26.3:** the content jar, Fabric Loader 0.20.1 or newer and Fabric API 0.165.2+26.3 (or newer for 26.3). The jar contains `msm_runtime` and GeckoLib; do not install either separately.
- **26.4:** the 26.4 jar (the app exports it when the project target is 26.4), with Fabric Loader 0.20.1 and Fabric API 0.165.4+26.4 (the 26.4 target's facts). The jar contains `msm_runtime` only; there is no GeckoLib.

**Get the jar**, either way:

- from the latest CI run: Actions, CI, the run, Artifacts, then unzip the sample creatures jar; or
- from the app: copy this folder outside the repository, open it in MCSuperMods, choose the target and export the Fabric mod jar (runtime nested; GeckoLib nested too on 26.3).

**Install it** as described in `fixtures/sample-mod/README.md`, with `msm_sample_creatures.jar` in place of `msm_sample_mod.jar`. Create a new **Creative** world with cheats on. Spawn eggs are in the **Spawn Eggs** tab; or use `/summon msm_sample_creatures:pet ~ ~ ~2` (and the same for the other names). `/give @s msm_sample_creatures:spark 16` gives sparks.

### Seeing each creature

Look from several sides and in daylight. The pictures are plain placeholders; what matters is that the shape, the skin and the movement are right.

| Check | Expected |
|---|---|
| Spawn one of each creature | Each appears with its own skin, about the size its hitbox suggests, with a shadow under it; none is invisible, none is sunk into the ground |
| Compare each with the app's preview | Same orientation, same texture mapping, no mirrored limbs, no stretched faces |
| Watch each stand still | It plays `idle` (a gentle movement) |
| Watch each walk, slowly and then fast | `walk` blends with the speed: small steps when slow, full swing when fast |
| Pet and mount: sit (see below) | The `sit` pose plays |
| Glider: watch it in the air | The `fly` pose plays while it moves through the air; it hovers in place when it is not moving |
| Fish: watch it in water | The `swim` pose plays while it moves; it flees when you come near |
| Fish out of the water (`/summon` it on land) | It flops and takes damage after about 15 seconds (300 ticks) |
| Glider, archer, boss: let each shoot | The `shoot` pose plays once for each shot, not in a loop |
| Hit any creature | The `attack` or hurt movement plays once and then stops; two movements in the same tick show only the second (a known limit) |
| Look at a creature while you walk round it | Neither renderer turns the head to follow you; this is expected |
| Boss: look at it on 26.3 | It is drawn like the others even though its renderer is `vanilla`; a GeckoLib-drawn mob and a vanilla-drawn one look the same |
| F3 + T after editing a model file in a copy of the project | The new model loads; a missing or broken model file logs one line in `logs/latest.log`, the creature is not drawn and the game does not crash |

Animation direction and speed are what the app preview cannot promise. The placeholder models are set up so wrong signs show clearly: a flapping wing should move up and then down, and a leg that folds should fold towards the body. Report any that are the wrong way round.

### The pet

| Check | Expected |
|---|---|
| Use the egg in a forest, or `/summon` it | A pet with the `default` skin |
| `/summon msm_sample_creatures:pet` in a snowy plains or snowy taiga biome (or use the egg there) | The pet has the white `snow` skin |
| Give a **wild** pet cooked beef | Nothing happens: a wild pet ignores its breeding food. **Tame it first, with a bone** |
| Hold a bone and right-click the wild pet | Hearts appear at once, the chat line `The pet is tamed.` appears, and its health becomes 20 (`/data get entity @e[type=msm_sample_creatures:pet,limit=1,sort=nearest] Health`) |
| Walk away from the tamed pet | It follows you and teleports to you when you are far away |
| Plain right-click on the tamed pet with an empty hand | It sits down and plays `sit`; right-click again and it stands and follows |
| Hit a zombie near the tamed pet (`/summon minecraft:zombie ~ ~ ~5`), or let a zombie hit you | The pet attacks it (it defends its owner) |
| Feed two tamed pets cooked beef | Both enter love mode (hearts), walk to each other, and a baby appears with the chat line `A pet baby is born.` |
| Look at the baby | Half the size of its parents with a matching shadow; it keeps a parent's skin (breed a `snow` pet and the baby is `snow` too) |
| Baby grows up | It reaches full size after about 20 minutes (speed it up by feeding it) |

### The mount

| Check | Expected |
|---|---|
| Right-click the mount with an empty hand | Nothing: it needs a saddle |
| Look at the mount before saddling | The `saddle` bone (the saddle shape) is not drawn |
| Right-click with a saddle, then right-click again with an empty hand | The saddle goes on and the saddle shape appears; the second click mounts you and the chat line `The mount is ridden.` appears |
| Ride: W, A, S, D | It walks where you steer; the speed feels like a pig or horse, not faster |
| Ride: hold and release Space | A jump bar fills while you hold it; the jump height grows with the bar (jump strength 0.7); on 26.4 the same |
| Ride up a one-block step | It steps up (step height 1) |
| Ride into deep water | It swims with the `swim` pose; you stay on it |
| Ride, then push the mount with a `launch` action (for example from a command block or a script of your own) | Known limit: the rider's game moves a ridden mount, so a launch may be ignored or the mount snapped back by the server; report what you see |
| Dismount (sneak) and look again | The saddle stays on |
| Kill the saddled mount | It drops its loot; whether it drops the saddle too is one of the things to report |

### The glider

| Check | Expected |
|---|---|
| Spawn a glider | It rises and flies about, hovering when it stops; it never sits on the ground for long |
| The `saddle` bone | It is always drawn on the glider, because the glider is not rideable (expected) |
| `/summon minecraft:zombie ~ ~ ~8` near it | It throws sparks at the zombie; each throw plays `shoot` and says `The glider throws a spark.` |
| Look at a spark | A small projectile with the `spark` icon, falling gently |
| A spark hits the zombie | The zombie takes 2 damage and the line `The spark hits.` appears |
| Throw a spark yourself (`/give @s msm_sample_creatures:spark 16`, then use it) | The same spark flies out and does the same |

### The fish

| Check | Expected |
|---|---|
| Spawn several in the sea (`/summon msm_sample_creatures:fish ~ ~ ~2` over water) | Some are blue and some orange, with blue about twice as common |
| Watch them swim | Smooth swimming, no hopping on the surface; they swim away when you come close |
| Take one out of the water (`/summon` it on land) | It dries out after about 15 seconds and takes damage |

### The archer

| Check | Expected |
|---|---|
| Spawn an archer and stand 10 blocks away | It turns to you, raises its bow (the aim pose, the `shoot` state) and shoots an arrow every 1.5 seconds, with the line `The archer shoots.` |
| Watch its movement while it shoots | It strafes sideways rather than standing still |
| Move beyond 15 blocks | It stops shooting and wanders |
| Aim at long range | The arrows fly in an arc and land near you; report if they fall short or fly too high |
| Switch to Survival and get hit | Each arrow does 2 damage |

### The boss

Use the egg (the boss does not spawn naturally) and switch to **Survival**.

| Check | Expected |
|---|---|
| Spawn the boss | A big figure, one and a half times the size of the normal model; a red boss bar named `Sample Boss` with ten notches appears at the top of the screen |
| The sky | It darkens while the boss is near, and returns to normal when the boss dies or you move away |
| Music | The boss plays no music in the Overworld; boss music belongs to the End only (the same in the End if you summon it there) |
| Fight it | It attacks in melee for 10 damage and throws snowballs from range (the line `The boss throws a snowball.`) |
| Hit it with a sword | It does not fly back far (knockback resistance 1) and the bar shrinks as its health drops |
| Defeat it | The bar disappears, the sky clears, the line `The boss is defeated.` appears and its loot drops |

### On 26.4 specifically

| Check | Expected |
|---|---|
| Title screen, **Mods** | `MSM Sample Creatures` and `MSM Runtime`; no GeckoLib entry |
| Everything above | Looks and behaves like 26.3, apart from the head, which neither renderer turns |
| `logs/latest.log` | The line `[msm_runtime] registered 6 vanilla entity renderer(s)` (on 26.3 with GeckoLib: `registered 1 vanilla entity renderer(s)` for the boss) and nothing at warning or error level from `msm_runtime` |

Things only the game client can confirm, and worth reporting if they look wrong: the shapes and textures, the direction and speed of every animation, the feel of steering and the jump bar on a mount, the aim of the archer at long range, the boss bar and the sky, and anything that differs between 26.3 and 26.4.

## Changing the sample

Do not edit the generated files by hand. Change the elements in `packages/exporters/test/sample-creatures.golden.test.ts`, then regenerate this folder and the pinned hashes, and commit the changes on purpose:

```sh
UPDATE_GOLDENS=1 pnpm --filter @msm/exporters test
```

To build the jar with the real runtime locally and run the headless server check as CI does (JDK 25 on `JAVA_HOME`; the paths must be absolute because the test runs in `packages/exporters`; GeckoLib is only needed for 26.3):

```sh
cd engine-mod && ./gradlew build && cd ..
MSM_RUNTIME_JAR="$(ls "$PWD"/engine-mod/build/libs/msm_runtime-*.jar | grep -v sources)" \
  MSM_GECKOLIB_JAR="$HOME/.cache/msm-fabric-server/geckolib.jar" MSM_SAMPLE_CREATURES_OUT="$PWD/build/sample-creatures" \
  pnpm --filter @msm/exporters exec vitest run test/sample-creatures.golden.test.ts
node tools/run-fabric-server/index.ts --jar build/sample-creatures/msm_sample_creatures.jar --facts build/sample-creatures/fabric-facts.json
```

This README is not generated and is kept as it is.
