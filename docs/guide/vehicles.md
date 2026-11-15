# Vehicles

You can make vehicles of your own: cars, tanks, planes, helicopters, hovercraft and boats. Players put one down from its item, get in, drive with W, A, S and D and pick it up again. A vehicle can need fuel, carry ammunition, fire a cannon from a turret that follows the look, take damage and be repaired, hold a chest's worth of items and be painted. A small dashboard shows fuel, health and ammunition.

A vehicle is a real entity of the game (`msm:vehicle`), not a mob. It has no health bar of a mob, does not drown, burn or despawn, and has no spawn egg.

Vehicles need the **Fabric mod jar**. A vanilla pack leaves them out, and a resource or data pack export says so ([Limits](#limits)). Keys and the on-screen dashboard are explained in [Keys and the screen](keys-and-hud.md).

There are three ways to make one:

- the Creator's **Car**, **Tank**, **Plane** and **Boat** flows (group **Vehicles**), or **Make a vehicle** on Home in Very easy mode;
- **Add element** (Ctrl+N) and a template under **Vehicles**: Go-kart, Car, Tank, Biplane, Helicopter, Motorboat, Raft and Hovercraft;
- the AI helper, which uses the same flows ([The AI helper](ai-helper.md)).

## Make a vehicle in the Creator

Open the Creator and choose a flow under **Vehicles**. The defaults make a working vehicle and its item, its model, its texture and an item picture. The answers:

| Flow | Default | Questions |
|---|---|---|
| **Car** | Racing Car, `racing_car`, 9 blocks a second | **Colour**, **Extra paints** (off), **How fast**, **How many seats**, **Needs fuel**, **What fuel?**, **Has a horn**, **Has a boot**, **Crafting recipe** |
| **Tank** | Battle Tank, `battle_tank`, 5 blocks a second | the same, plus **Has a cannon** and **Needs shells** |
| **Plane** | Biplane, `biplane`, 20 blocks a second, with fuel | the same questions as the Car |
| **Boat** | Motorboat, `motorboat`, 8 blocks a second | **Sounds like** (**An engine** or **A paddle**) and **Has a horn**, with the common questions |

**What fuel?** offers **Coal or charcoal**, **Blaze rods** and **Dried kelp blocks**. With **Has a cannon**, the tank fires a shell called `<id>_shell` that explodes with power 1.5 and does not break blocks; with **Needs shells**, the cannon holds 16 and players load more by using shells on the tank. **Crafting recipe** adds a recipe called `<id>_crafting`.

**Create** makes the vehicle, its model, its texture painted from boxes the app draws itself, the paints, the item picture and the recipe. It creates with its untouched defaults and zero problems. Reopen the flow with **Edit in Creator** ([The Creator](creator.md)).

In Very easy mode, **Make a vehicle** (heading **Vehicles**: "Cars, tanks, planes and boats you can drive.") asks **What kind?** (Car, Tank, Plane, Boat) and **What is it called?**, then opens the made vehicle with **Try it** and **Play** offered. Its page is a short form: **How fast**, **Needs fuel** (with **What fuel?**), **Has a cannon** (for a Tank), **How many seats** and **Colour**.

## The Vehicle Studio

A vehicle in the sidebar (heading **Vehicles**) opens the Vehicle Studio. Its sections, in order:

- **Preview**: the vehicle drawn by the Studio, with **Drive** and **Steer** to try the wheels, rotors and turret. It is the vanilla subset of the renderer ([Limits](#limits)).
- **Name and size**: the name, the hitbox and the scale.
- **Model and paint**: the geometry (a Blockbench model, see [Entities and models](entities-and-models.md)) and the texture. **Make a starter model** (**Replace with a starter model** when one exists) builds a simple model and a painted texture for you: choose a **Starter shape** and a **Colour**, and **Paint the texture** repaints it. Models face the negative z direction (towards the front of the picture). **Add a paint** adds another texture; a dye item in the paint switches the vehicle to it when used.
- **Movement**: the mode (**On the ground**, **On water**, **Land and water**, **In the air** or **Hovering**), the top speed (at most 3 blocks a tick), acceleration, braking, turn rate, step height and, per mode, grip, lift and take-off speed. Every number has a default that suits its mode.
- **Seats**: a draggable seat plan with **Add a seat** and **Use the default seat**. The first seat drives. Each seat can list which weapons it may fire (default: every weapon for the driver's seat).
- **Engine and fuel**: **Add a fuel** (an item and how many ticks it burns), the tank's capacity, and the engine, start and horn sounds. Without fuel items the vehicle never runs out. The engine burns fuel only while the driver gives throttle.
- **Health and repair**: the health (default 40), **Add a repair item** with how much damage it takes away, an explosion when it is destroyed and the damage types it ignores. Damage does not heal by itself.
- **Weapons**: **Add a weapon**: the projectile (arrows, a vanilla projectile item or a throwable item of your project), which key fires it, speed, inaccuracy, damage, cooldown, ammunition (item, rounds a shot, capacity), the muzzle, sound, recoil and an on-fire event. A weapon can be **automatic**: it fires again each time the cooldown ends while the key is held.
- **Turret**: the bone that turns with the gunner's look, an optional pitch bone, the limits and the turn rate. The hull turning does not turn the aim.
- **Parts**: **Find parts by name** fills the bones that the renderer turns: wheels (rolling with the distance driven), steering, rotors and propellers.
- **Storage**: a chest menu of 1 to 6 rows. The inventory key opens it from a seat, and sneak-using the vehicle opens it from outside.
- **Item**: the name and picture of the vehicle's item and where it can be placed (on the ground, on water or anywhere).
- **Camera**: the third-person distance while seated.
- **Exhaust**: a particle that comes out of the back while the engine works.
- **Rules, events**: **When placed**, **When someone gets in**, **When someone gets out**, **When destroyed** and **While driven, every so often**, plus each weapon's on-fire event; the Rules section is described in [Rules](rules.md#vehicles-keys-and-the-screen).

## In the game

- **Place** a vehicle by using its item on the ground (or on water, for a boat). It faces your look. The item is used up outside creative.
- **Get in** by using it. The first seat drives; later riders take the next free seat. Only players ride vehicles.
- **Drive** with W, A, S and D. A car must be moving to turn; a tank turns on the spot. A plane adds throttle with W and takes it away with S, follows your look and sinks below its take-off speed. A helicopter or hovercraft moves with W, A, S and D relative to its facing, climbs with Space and sinks with the descend key. A boat floats on the water.
- **Fuel, repair, paint, ammunition.** Use a fuel item to fill the tank, a repair item to take damage away, a paint's dye to repaint it and an ammunition item to load a weapon. The order used when you click is: fuel, repair, paint, load, get in.
- **Fire** with **R** (the first weapon key) or **V** (the second weapon key). A tap fires once; an automatic weapon keeps firing while the key is held. The turret follows where you look, within its limits.
- **Horn**: **H**. It sounds for everyone within about 16 blocks; only the driver can use it, there is half a second between blasts and holding the key sounds it once.
- **Descend** (hovering vehicles): **Left Alt**.
- **Pick up** by hitting an empty vehicle while sneaking. You get the item back with its fuel, damage, ammunition, paint and name kept. Storage must be empty (otherwise its contents drop).
- **Break** it by hitting it: each hit adds damage, and at full damage it is destroyed (events first, then passengers get out, the explosion, then drops). Creative players break it at once.

These four keys are listed in Minecraft's **Controls** screen under **MSM Vehicles**, and only when the world has a vehicle. The tank's cannon is on R and its machine gun on V in the sample. See [Keys and the screen](keys-and-hud.md#the-vehicle-keys).

## Moving and multiplayer

Vehicles move as vanilla boats do: the driver's game moves the vehicle and the server checks the result. Everything else (fuel, damage, shots, storage, seats, paint and events) is decided by the server. Test a vehicle with two players on a dedicated server before you share it.

## Limits

| What | In plain words |
|---|---|
| **The driver's game moves the vehicle** | A modified game can drive faster than the definition says, up to vanilla's own check of 10 blocks a tick (the same as ice boats). The top speed is capped at 3 blocks a tick so that honest vehicles are never pulled back. |
| **Definitions are read on each side** | A server and a player with different versions of a vehicle disagree about how it drives. Update both. |
| **No rail vehicles** | There are no trains or mine carts of your own. |
| **Fire and the horn have a round trip** | Shots happen on the server. On a slow server a shot leaves after the ping. The sound plays at once for the shooter. |
| **New vehicles need a restart** | A new vehicle is read when Minecraft starts, so **Play** says **Restart needed**; values and events reload ([Playing and testing](playing-and-testing.md#restart-needed)). |
| **Fast vehicles can outrun chunk loading** | A plane at full speed reaches land that is not generated yet, as a player flying does. Keep the speed modest. |
| **No custom camera** | Players see vanilla first and third person. Only the third-person distance can change. |
| **Hoppers do not reach vehicle storage** | Items go in and out by hand only. |
| **Paint is the only customisation** | No engines, boosters, extra seats to craft or wind. |
| **Not in a Java project** | The [Java eject](eject.md) leaves vehicles out and warns once for each vehicle. |
| **Not in vanilla packs** | A vanilla pack export leaves vehicles out and lists them as information. Export the Fabric mod jar. |
| **Looks and feel are in-game checks** | Tests show something is drawn, not that it looks or drives well. Check handling, the turret and the sound in Minecraft with **Play**. |
| **The vehicle renderer is the vanilla subset** | Molang counts as 0 and animation easings are straight lines, as for mobs. GeckoLib is not used for vehicles. |
| **Vehicles carry players only** | Mobs do not get in. |
| **Try it drives roughly** | Try it uses the app's own simulation. Firing is written in the log, not shown ([Try it](try-it.md#vehicles)). |
| **Weapons have no direction of their own** | A weapon fires along the turret's aim, or along the hull when it has no turret. A gun that fires backwards needs a turret that points backwards. |
| **Shots do not add the vehicle's speed** | A shell leaves at its own speed whether the vehicle is moving or not. |
| **A tank's own shell can hurt it** | A shell that explodes close to the tank damages the tank. |
| **The horn plays for others after the ping** | The horn is played by the server, so the driver hears it after the round trip. |

## Scripts, Rules and the in-game check

Scripts get vehicle members and events from Script API 1.5 ([Scripting](scripting.md#vehicles-keys-and-the-screen-from-scripts)), and Rules has triggers such as **Someone gets in the vehicle** ([Rules](rules.md#vehicles-keys-and-the-screen)).

`fixtures/sample-vehicles` in the repository is a project with seven vehicles (a car, a motorboat, an amphibious buggy, a biplane, a hovercraft, a helicopter and a tank with a cannon and a machine gun), two keys and four on-screen elements. Its README is the in-game checklist: each vehicle's handling, the turret, firing, fuel, repair, storage, paint, picking up, the dashboard, the keys in **Controls** and a bar on screen.
