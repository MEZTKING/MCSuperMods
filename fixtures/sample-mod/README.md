# Sample mod project

A kitchen-sink MCSuperMods project for the Fabric content jar (ADR 0026 D6), namespace `msm_sample_mod`: an `msm:mod`, three custom blocks and five custom items that between them use every block and item component and all six actions (armour and a custom tool material since ADR 0042), plus an equipment asset, one function and one loot table. Block and item models are vanilla ones; the only textures are the two placeholder armour layers of the ruby equipment asset (`assets/msm_sample_mod/textures/entity/equipment/humanoid/ruby.png` and `humanoid_leggings/ruby.png`, plain tinted 64x32 sheets drawn by the test).

`packages/exporters/test/sample-mod.golden.test.ts` checks it on every run:

- the folder equals the elements listed in the test saved as a project (it fails when the list changes and this folder is not regenerated);
- every element validates with zero problems, the project validators report nothing, and the function passes the offline mcfunction checker;
- the content jar exports with zero problems (with a stub runtime jar), and its SHA-256 is pinned per target, built in two time zones;
- the jar holds the eight expected `msm/` definitions, the equipment asset and its two layer textures, and each definition validates against the MSM definition schema.

CI's `engine-mod` job then builds `msm_runtime` with Gradle, exports this project with the real runtime nested, and starts a headless Fabric dedicated server with it (`tools/run-fabric-server`). The server must log `[msm_runtime] registered 3 block(s) and 7 item(s) from 8 definition file(s); 0 error(s), 0 warning(s)` and nothing else from the runtime at warning or error level. The jar is kept as the workflow artefact `msm-sample-mod`.

The same job also exports this project as a Java project (ADR 0033; `sample-mod.java.golden.test.ts` with `MSM_SAMPLE_MOD_JAVA_OUT`), builds it with its own `./gradlew build`, and runs the behaviour-parity GameTests of `engine-mod/parity/` (`SampleModParityTest`: every block's light, hardness, resistance, tool requirement, sound type, loot table and block item; the items' food, tool, durability, rarity and stack size; the ruby helmet's slot, equipment asset, defence, toughness, knockback resistance, durability, repair item and enchantability; the ruby pickaxe's custom material (durability, attack values, mining speed, not enchantable, and obsidian broken by a survival player drops obsidian while a stone pickaxe's does not); the ruby ore's and ruby apple's function (its `say` line), the chime block's glowstone from stepping (with the per-entity cooldown) and from redstone, its zero signal, and the wand's rubies and cooldown) twice: on the content jar with `msm_runtime` and on the ejected jar without it (`tools/run-fabric-server --gametest ... --gametest-filter 'msm_parity_tests:sample_mod_*'`, `--no-runtime` for the ejected jar). The same tests passing on both is the parity check; the ejected jars and the GameTest reports are kept as the artefacts `msm-ejected-jars` and `parity-gametest-reports`.

The entity counterpart, an animated GeckoLib mob checked the same way, is `fixtures/sample-mob/` (see its README).

## Contents

| Element | Kind | What it shows |
|---|---|---|
| `msm_sample_mod:mod` | mod metadata | `fabric.mod.json`: id `msm_sample_mod`, version 1.0.0, MIT |
| `msm_sample_mod:ruby_ore` | block | `msm:breakable` (pickaxe, iron tier), `msm:light_emitter` 7, `msm:on_interact` (`play_sound`, `spawn_particle`, `run_function`), loot table override, Natural Blocks tab |
| `msm_sample_mod:chime_block` | block | `msm:redstone` (powered and unpowered events), `msm:on_step` with a 20-tick cooldown, `set_block_state`, `trigger_event`, axe and copper tier without needing the tool, wood sounds, stack of 16, uncommon, Redstone Blocks tab |
| `msm_sample_mod:glow_stone` | block | no block item (`"item": false`), light 15, shovel, netherite tier, glass sounds |
| `msm_sample_mod:ruby` | item | plain item, uncommon, Ingredients tab |
| `msm_sample_mod:ruby_wand` | item | `msm:tool` (gold sword), `msm:durability` 32, `msm:on_use` with a 10-tick cooldown (`give_item`, `spawn_particle`, `trigger_event`), epic |
| `msm_sample_mod:ruby_pickaxe` | item | `msm:tool` pickaxe with a custom material (durability 1200, speed 9, attack bonus 3, mines like diamond through `#minecraft:incorrect_for_diamond_tool`, repaired by diamonds, `enchantment_value` 0 so not enchantable) and `attack_speed` -2.6, rare |
| `msm_sample_mod:ruby_helmet` | item | `msm:armor` helmet with a custom material (base durability 25, defence 3/7/5/2, toughness 1, knockback resistance 0.05, enchantment value 12, diamond equip sound, repaired by diamonds), equipment asset `msm_sample_mod:ruby_armor`, rare, Combat tab |
| `msm_sample_mod:ruby_armor` | equipment | the humanoid and humanoid leggings layers, both `msm_sample_mod:ruby` (the element is not called `ruby` because the item has that id) |
| `msm_sample_mod:ruby_apple` | item | `msm:food` (4 nutrition, can always eat) with `msm:on_use` (`spawn_particle`, `run_function`), stack of 16 |
| `msm_sample_mod:ruby/shimmer` | function | `particle` and `say`, run by the ruby ore and the ruby apple |
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
| Creative tab **Tools & Utilities** | **Ruby Wand** (light purple name, blaze rod look) and **Ruby Pickaxe** (aqua name, diamond pickaxe look) |
| Creative tab **Combat** | **Ruby Helmet** (aqua name, diamond helmet look) |
| Put on the Ruby Helmet (F5 for the third-person view) | The helmet drawn on your head is the flat ruby-red placeholder layer, not diamond; the armour bar shows one and a half armour icons (3 points); a diamond armour equip sound plays |
| Hover over the Ruby Pickaxe and the Ruby Helmet in the inventory | The pickaxe shows 5 attack damage and 1.4 attack speed; the helmet +3 armour, +1 armour toughness and +0.5 knockback resistance |
| Put the Ruby Pickaxe into an enchanting table | It cannot be enchanted (no offers); the Ruby Helmet can |
| Creative tab **Food & Drinks** | **Ruby Apple**, looking like an apple; it stacks to 16 |
| Search for "Glow Stone" | Nothing: it has no item. `/setblock ~2 ~ ~ msm_sample_mod:glow_stone` places a glowstone-looking block with light level 15 (F3 shows block light 15 beside it) |
| Place Ruby Ore at night or underground | It glows (light level 7) |
| Right-click Ruby Ore | An amethyst chime, glow particles, end rod particles and the chat line `The ruby shimmers.` |
| Step onto a Chime Block | A bell note and a glowstone block appears on top; again at most once a second while you walk on it |
| Put a lever on a Chime Block and switch it on, then off | On: a bell note and glowstone on top. Off: the block on top disappears and a lower chime plays |
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
[msm_runtime] registered 3 block(s) and 7 item(s) from 8 definition file(s); 0 error(s), 0 warning(s)
```

and no other line containing `[msm_runtime]` at WARN or ERROR, no `Failed to load` and no missing-model or missing-texture warning mentioning `msm_sample_mod`. Report any such line.

Things only the game client can confirm, and worth reporting if they look wrong: the block and item models and names (the client loads `assets/` from a mod jar without a `pack.mcmeta`), the creative tab placement and name colours, the particle positions, the tool speeds, and the worn helmet's look (the equipment asset and its layer texture).

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
