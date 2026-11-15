# Sample vehicles project

A kitchen-sink MCSuperMods project for vehicles, key binds and the HUD (ADRs 0088 to 0091), namespace `msm_sample_vehicles`: an `msm:mod`, one vehicle for every way of moving (on the ground, on water, on land and water, in the air, hovering) plus a helicopter, a tank with a turret, a cannon and a machine gun, the tank's own shell, a repair kit, two keys of its own with events, four HUD elements and a script. It works on **26.3** and on **26.4**. Its siblings are `fixtures/sample-mod/` (blocks and items), `fixtures/sample-script/` (scripts) and `fixtures/vehicle-physics/` (the driving golden).

Every model and picture is made by MSM: the car, the tank, the biplane and the motorboat are the library's Creator flow models and pictures (B422), and the swamp buggy, the hovercraft and the helicopter are the entities plugin's starter models (B414) painted with the library's box painter. All models face north (-z). Engine, horn and weapon sounds are vanilla sound events. Nothing in the folder is a Mojang file.

`packages/exporters/test/sample-vehicles.golden.test.ts` checks it on every run: the folder equals the project built in code, every element validates with zero problems, the plugins' validators report nothing on either target, the script type-checks, and the content jar exports for both targets with its SHA-256 pinned per target (`packages/exporters/test/fixtures/<target>/sample-vehicles-jar.sha256`). The jar holds the seven vehicle definitions (`msm/msm_sample_vehicles/vehicle/`), the two key binds (`key_bind/`), the four HUD elements (`hud/`), the two items, the script as JavaScript, the models (`assets/msm_sample_vehicles/geckolib/models/entity/<name>.geo.json`), the textures, the item models and the language keys. The vanilla packs carry nothing of the vehicles, keys or HUD (they need the Fabric mod jar); the vanilla data pack leaves out the two recipes, which make mod items (`export.mod-only-reference`). This README is the one file in the folder that is written by hand; the test leaves it alone.

A headless Fabric server with the content jar should log `[msm_runtime] registered 7 vehicle type(s)`, `[msm_runtime] registered 2 key bind(s)` and `[msm_runtime] registered 4 HUD element(s)`, `registered 0 block(s) and 2 item(s) from ... definition file(s); 0 error(s), 0 warning(s)` (the vehicles' own items are registered after that line and are not counted in it) and `loaded 1 script(s); 0 error(s)`, with nothing from `msm_runtime` at warning or error level and no `NoClassDefFoundError` (the server must load none of the client vehicle classes). Pinning these lines in CI is B426's job.

## Contents

| Element | Kind | What it shows |
|---|---|---|
| `msm_sample_vehicles:mod` | mod metadata | `fabric.mod.json`: id `msm_sample_vehicles` |
| `msm_sample_vehicles:racing_car` | vehicle, **on the ground** | Racing Car: up to 9 blocks a second, must move to turn, climbs a full block; **two seats**; runs on **coal or charcoal** (a minute of driving each, holds 20 minutes); start sound and horn; a **boot of one row** (the sample's only storage); **red, blue and yellow paint** with the dye of that colour; **exhaust smoke** behind it; four wheels that roll, the front two steer. Health 40 |
| `msm_sample_vehicles:motorboat` | vehicle, **on water** | Motorboat: up to 8 blocks a second on water, barely moves on land; placed **on water only**; two seats; no fuel; a paddling sound, a horn and a spinning propeller. Health 30 |
| `msm_sample_vehicles:swamp_buggy` | vehicle, **on land and water** | Swamp Buggy: up to 7 blocks a second, drives on land and floats on water, climbs half a block; placed on either; one seat; no fuel; wheels that roll and steer. Health 30 |
| `msm_sample_vehicles:biplane` | vehicle, **in the air** | Biplane: forwards opens the throttle up to 20 blocks a second, back closes it, the nose follows your view; below 10 blocks a second it sinks, so it rolls along the ground until it lifts off; two seats; **coal**; propeller and wheels spin. Health 40 |
| `msm_sample_vehicles:hovercraft` | vehicle, **hovering** | Hovercraft: up to 10 blocks a second, turns to your view, **jump climbs** slowly and **Vehicle: descend** (Left Alt) sinks, otherwise it holds its height; runs on **dried kelp blocks**; a fan spins at the back. Health 40 |
| `msm_sample_vehicles:helicopter` | vehicle, **hovering** | Helicopter: as the hovercraft but climbs faster; **coal**; the main **rotor** spins flat above it and the tail rotor at the back (the sample's only rotor). Health 40 |
| `msm_sample_vehicles:battle_tank` | vehicle, **on the ground** | Battle Tank: up to 5 blocks a second, **turns on the spot**; one seat; runs on **blaze rods**; a **turret** that follows your view (the barrel up to 20 degrees up and 10 down, 4 degrees a tick); the **cannon** (R) fires the tank's own shell every 3 seconds and needs **shells loaded** (up to 16), pushes the tank back a little (recoil) and puffs smoke after each shot; the **machine gun** (V) fires arrows while held, never runs out; hurts mobs it drives into above 3 blocks a second; **fire does not hurt it**; **explodes** when destroyed. Health 120 |
| `msm_sample_vehicles:battle_tank_shell` | item | Battle Tank Shell (Combat tab, stacks to 16): the cannon's ammunition; also thrown by hand. Where it lands it makes a small explosion (power 1.5) that breaks no blocks. Recipe: gunpowder and an iron ingot make four |
| `msm_sample_vehicles:repair_kit` | item | Repair Kit (Tools and Utilities tab): using it on any vehicle takes 10 damage away (20 on the tank). Recipe: four iron ingots around a copper ingot make two |
| `msm_sample_vehicles:flare` | key bind | **Send up a flare**, J by default, group **Sample vehicles** in Controls: works only while you sit in a vehicle, at most once every 2 seconds; it calls the script, which spends 25 flare charge and sends a burst of firework sparks up above you with a launch sound, or says "The flare is not charged yet." |
| `msm_sample_vehicles:status` | key bind | **Show the vehicle keys**, K by default, same group: while held, a line at the top of the screen lists the vehicle keys; it goes away when you let go (`set_hud`, `show_hud` and `hide_hud`) |
| `msm_sample_vehicles:flare_charge` | HUD bar | An orange bar above the hotbar, **from script data** (`flare_charge` of the player, out of 100), shown while you sit in any vehicle |
| `msm_sample_vehicles:speedometer` | HUD text | "Speed: N blocks a second" at the top left, **from the vehicle you ride** (its speed, one decimal), shown while you sit in any vehicle |
| `msm_sample_vehicles:tank_shells` | HUD text | "Shells: N" on the left, the tank's loaded shells, shown only while you **drive the tank** |
| `msm_sample_vehicles:status_line` | HUD text | Hidden until the K key shows it; set by the key's event |
| `msm_sample_vehicles:flares` | script | Keeps each player's flare charge: starts full (100) and refills by 5 a second; defines the handler the J key calls |
| `entity/*`, `item/*` | models | the vehicles' boxed models and flat item models |

Every vehicle also shows the runtime's built-in **dashboard** (bottom right while you ride: health, fuel, and ammunition and reload per weapon). The vehicles' items are in **Tools and Utilities**.

All content is original work written for MCSuperMods; the project contains no Mojang files.

## In-game check (Windows, Minecraft Java 26.3 and 26.4)

Do the whole list twice, once per version.

- **26.3:** the 26.3 content jar, Fabric Loader 0.20.1 or newer and Fabric API 0.165.2+26.3 (or newer for 26.3). The jar contains `msm_runtime`; do not install it separately.
- **26.4:** the 26.4 jar (the app exports it when the project target is 26.4), with Fabric Loader 0.20.1 and Fabric API 0.165.4+26.4. The jar contains `msm_runtime` only.

**Get the jar**, either way:

- from the latest CI run (once B426 adds it): Actions, CI, the run, Artifacts, then unzip the sample vehicles jar; or
- from the app: copy this folder outside the repository, open it in MCSuperMods, choose the target and export the Fabric mod jar (runtime nested, the default).

**Install it** with Prism Launcher as described in `fixtures/sample-mod/README.md`, with `msm_sample_vehicles.jar` in place of `msm_sample_mod.jar`. Create a new **Creative** world with cheats on; a superflat world with a lake dug into it is easiest (`/fill ~ ~-1 ~ ~20 ~-3 ~20 minecraft:water` makes one). For the survival checks switch with `/gamemode survival`. Give yourself the things:

```
/give @s msm_sample_vehicles:racing_car
/give @s msm_sample_vehicles:motorboat
/give @s msm_sample_vehicles:swamp_buggy
/give @s msm_sample_vehicles:biplane
/give @s msm_sample_vehicles:hovercraft
/give @s msm_sample_vehicles:helicopter
/give @s msm_sample_vehicles:battle_tank
/give @s msm_sample_vehicles:battle_tank_shell 32
/give @s msm_sample_vehicles:repair_kit 16
/give @s minecraft:coal 16
/give @s minecraft:blaze_rod 8
/give @s minecraft:dried_kelp_block 8
```

and one each of red, blue and yellow dye. In every vehicle: right-click (use) gets in, the movement keys drive, sneak gets out, and **hitting the empty vehicle while sneaking picks it up**. Look at it from outside too (F5 for third person).

Things that are limits of this batch, not faults, are marked "known limit" with their number from the limits table in [ADR 0090](../../docs/adr/0090-vehicles.md)'s findings (V1 to V17). Report them only if they look different from what is written.

### Loading

| Check | Expected |
|---|---|
| Title screen, **Mods** | `MSM Sample Vehicles` and `MSM Runtime` |
| `logs/latest.log` (Prism: the instance's **Minecraft Log**) | `[msm_runtime] registered 7 vehicle type(s)`, `registered 2 key bind(s)`, `registered 4 HUD element(s)`, `registered 0 block(s) and 2 item(s) from ... definition file(s); 0 error(s), 0 warning(s)`; after the world opens `loaded 1 script(s); 0 error(s)`; nothing at warning or error level from `msm_runtime` |
| Creative tabs | The seven vehicles and the Repair Kit in **Tools and Utilities**; the Battle Tank Shell in **Combat**. Each item shows its own small picture, never the purple and black cube |
| **Options, Controls, Key Binds** | A group **MSM Vehicles** with Vehicle: fire (R), Vehicle: second weapon (V), Vehicle: horn (H) and Vehicle: descend (Left Alt); a group **Sample vehicles** with Send up a flare (J) and Show the vehicle keys (K). None is shown in red (no clash with a vanilla key) |
| Change Send up a flare to another key, leave, restart the game | The new key is kept (it is saved in `options.txt`) and works below; set it back to J afterwards |

### Placing, getting in and picking up

| Check | Expected |
|---|---|
| Use each vehicle's item on the ground | It is placed where you point. The motorboat cannot be placed on the ground |
| Use the motorboat, the swamp buggy and the hovercraft on the lake | All three are placed on the water |
| Each vehicle from outside | Its own model in its own colour, the right way round (the front, where the barrel, the propeller or the cabin is, points the way it drives) |
| Right-click a vehicle | You sit in the first seat and drive; a second right-click from another player (see Two players) takes the next seat |
| Sneak | You get out beside it |
| Sneak and hit an empty vehicle | It disappears and its item is in your inventory; placing it again keeps its fuel, damage, paint, loaded shells and any name from an anvil |
| Put something in the car's boot, then try to pick the car up | The boot's contents drop on the ground and the car comes back as an item |
| Name a vehicle's item in an anvil and place it | The name shows above the vehicle |

### Driving, one by one

| Check | Expected |
|---|---|
| **Racing Car** without fuel | W does nothing; the dashboard shows the fuel empty |
| Use coal on it (outside or seated), then drive | It drives; it speeds up gently to about 9 blocks a second (the speedometer says so), reverses slower with S, and **must move to turn**; it climbs a full block without jumping |
| Watch the car from outside while someone drives it, or in third person | The four **wheels roll** with the distance travelled and roll backwards in reverse; the **front wheels turn** with the steering, smoothly; **smoke** puffs from the back only while the engine works |
| Drive the car into the lake | It sinks (a ground vehicle does not float) |
| **Motorboat** on the lake | It floats at the waterline, drives at about 8 blocks a second and turns; the **propeller** spins with the throttle. Drive onto land: it barely moves there |
| **Swamp Buggy** | It drives on land, then straight into the lake and on across the water, and out again on the other side |
| **Biplane** with coal | W opens the throttle and S closes it; the nose follows where you look; it rolls along the ground until it reaches about 10 blocks a second, then lifts off and climbs when you look up; with the throttle closed it sinks back down. The **propeller** spins and the **wheels** roll on the ground |
| **Hovercraft** with dried kelp blocks | It turns to face where you look; W, A, S and D move it relative to its facing; **jump** lifts it slowly, **Left Alt** (Vehicle: descend) lowers it, otherwise it holds its height, also over the lake. The **fan** at the back spins |
| The hovercraft or the helicopter when the fuel runs out in the air | It sinks slowly to the ground |
| **Helicopter** with coal | As the hovercraft but it climbs faster; the **main rotor spins flat** above it and the **tail rotor** at the back, both faster with more throttle |
| **Battle Tank** with blaze rods | It turns on the spot without moving; it drives at about 5 blocks a second |
| Engine sound of each vehicle (the car, buggy, hovercraft and tank sound like a minecart, the biplane and helicopter like elytra flight, the boat like paddling) | The sound rises in pitch and gets louder with speed and throttle; it fades out beyond about 48 blocks |
| Get into a vehicle with a start sound (car, biplane, helicopter, tank) | A piston sound plays once |
| Third-person view (F5) in each vehicle | The camera is further away than on foot: about 4 blocks in the buggy, 5 in the car and boat, 6 in the hovercraft, 8 in the tank and 10 in the biplane and helicopter (known limit V8: no other camera changes) |
| Drive as fast as you can for a while in the biplane | New land may not have loaded yet ahead of you (known limit V7) |

### The tank's turret and weapons

| Check | Expected |
|---|---|
| In the tank, look around | The **turret turns** to where you look, at its own pace (4 degrees a tick), not at once; turning the hull does not turn the turret's aim |
| Look up and down | The **barrel** follows up to about 20 degrees up and 10 down, no further |
| Press R with no shells loaded | Nothing fires; the dashboard and "Shells: 0" on the left say why |
| Use shells on the tank (seated or from outside) | "Shells:" and the dashboard count up to 16 at most; extra shells stay in your hand |
| Press R | A shell flies from the end of the barrel where the turret points; you hear the cannon at once with a **muzzle flash** at the barrel; the tank is **pushed back** a little; smoke puffs around the tank; where the shell lands there is a small explosion that breaks no blocks; the count goes down by one. A second press within 3 seconds does nothing (the dashboard shows the reload) |
| Hold V | The machine gun fires arrows from the right of the hull, straight ahead of the hull (not the turret), several a second, for as long as you hold it; it never runs out |
| Fire the cannon at a wall right in front of the tank | The explosion also damages the tank (known limit, B467: a tank's own shell bursting close by hurts it) |
| Drive the tank into a mob faster than 3 blocks a second | The mob is hurt (4 damage) |
| Throw a shell by hand (use it while standing) | It flies and explodes where it lands |

### Fuel, damage, repair, storage and paint

| Check | Expected |
|---|---|
| Use coal on the car again and again | The dashboard fuel bar fills; it holds 20 minutes of driving (20 coal) and takes no more once full |
| Drive and watch the fuel | It goes down only while you give throttle; standing still uses none |
| Hit a vehicle a few times (not sneaking) | It **wobbles** each time, more the more damaged it is; the dashboard health goes down |
| Use a Repair Kit on it | Health goes up by 10 (20 on the tank) and one kit is used |
| Keep hitting the car until it breaks | Its riders are put off, the boot's contents and the car's item drop (no item in Creative) |
| Set the tank on fire (`/fill` some fire round it, or lava) | It takes no damage |
| Destroy the tank by hitting it in Survival | It explodes (power 2), hurting things nearby but breaking no blocks, then its item drops |
| Seated in the car, press the inventory key (E) | The **boot** opens as a chest of one row |
| From outside, sneak and use the car | The boot opens too; what you put in stays after leaving and coming back, and after a restart |
| Use red dye, then blue, then yellow on the car | It is **repainted** in that colour each time. Pick it up and place it again: the paint is kept |
| Use a dye on any other vehicle | Nothing happens (only the car has paints) |

### The keys of its own and the HUD

| Check | Expected |
|---|---|
| On foot | No flare bar, no speedometer and no dashboard |
| Sit in any vehicle | The orange **flare charge** bar appears above the hotbar, full; "Speed: 0 blocks a second" at the top left; the **dashboard** at the bottom right |
| Drive the car | The speedometer counts up to about 9 (one decimal) and back down |
| Press J in a vehicle | A burst of firework sparks above you and a launch sound; the bar loses a quarter. Press it four times (2 seconds apart): then "The flare is not charged yet." in the chat; the bar refills by a twentieth a second |
| Press J on foot | Nothing happens |
| Hold K (anywhere) | "J flare, R cannon, V machine gun, H horn, Left Alt down" at the top of the screen; it goes away when you let go |
| Drive the tank | "Shells: N" on the left; it is not shown in the other vehicles or as a passenger |
| Press H in a vehicle with a horn (car, motorboat, buggy, hovercraft) | Nothing yet: the horn does not play (known open item: the horn needs a server listener, assigned to B421). Report it if it does play: then tick it here |
| Open the chat or the inventory and press J or K | Nothing happens (known limit V6) |
| Change F1 (hide the HUD) | All the sample's HUD elements and the dashboard hide with the rest of the HUD |

### Two players on a dedicated server

Start a dedicated Fabric server on the same version with the same jar in `mods` (and Fabric API), and join it with two clients that have the same jar.

| Check | Expected |
|---|---|
| Server start | The server log has the `msm_runtime` lines above and no `NoClassDefFoundError`; both players join without errors |
| Player A drives the car, player B watches | B sees the car move smoothly, the wheels roll and steer, the smoke, and hears the engine get louder and higher with speed |
| B gets into the car's second seat | B rides along beside A; B cannot drive; B's HUD shows the speedometer and the flare bar, and the dashboard |
| A drives the tank and fires; B watches | B sees the turret turn and the barrel move where A looks, the shell fly and explode, and hears the cannon once (not twice) |
| A sends up a flare with J | Both see the sparks; only A's flare bar goes down |
| A puts items in the car's boot; B opens it | B sees the same items |
| B picks up the empty tank | It comes back to B's inventory with its shells and fuel |
| Each player rebinds J differently | Each uses their own key; both work |
| A lags (a slow connection) and fires | The sound and flash are at once for A, the shell leaves a moment later (known limit V4) |

### Restart and reload

| Check | Expected |
|---|---|
| Leave the world with vehicles placed, fuel, paint, shells and boot contents; come back | Everything is where it was, as it was |
| In the app, change a vehicle's speed and use Reload in Play | The new speed needs Restart (known limit V5: new or changed vehicles, keys and HUD elements need a restart); the key's events and the script reload |

## Changing the sample

The project is built in code in `packages/exporters/test/sample-vehicles.golden.test.ts` (`SAMPLE_ELEMENTS` and `SAMPLE_ASSETS`). After changing it, run

```
UPDATE_GOLDENS=1 pnpm --filter @msm/exporters exec vitest run test/sample-vehicles.golden.test.ts
```

which rewrites this folder (except this README) and the jar hashes of both targets, then update the counts and the checklist here.

With `MSM_RUNTIME_JAR` (a built `msm_runtime` jar for the selected target, `MSM_TARGET_ID` or the default target) and `MSM_SAMPLE_VEHICLES_OUT` (an absolute folder), the same test also writes `msm_sample_vehicles.jar` with the real runtime nested, `fabric-facts.json` for `node tools/run-fabric-server/index.ts --jar <jar> --facts <folder>/fabric-facts.json` and `expect-lines.txt` with the three log lines to pin with `--expect-line`. Vehicles, key binds and HUD elements are not ejected (known limit V11), so there is no Java project golden for this sample.
