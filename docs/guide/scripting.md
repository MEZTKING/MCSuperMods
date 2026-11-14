# Scripting

Components and events (see [Blocks and items](blocks-and-items.md#events-and-actions)) cover the common cases without code. When you need more, such as a check before something happens, a reaction to any block or mob in the game, or an effect that plays out over time, write a **script**: a small TypeScript file (`msm:script`) that the `msm_runtime` mod runs inside the game. Scripts call a small MCSuperMods API (`msm`), never Minecraft's own code.

Like blocks and items, scripts reach the game only through the **Fabric mod jar** export. The vanilla pack exports leave them out, and so does the [Java project export](eject.md).

The quickest start is the **Scripted ore** starter (**New from starter…**): the Custom ore content plus three scripts. Sneak-using ruby ore gives a bonus ruby, standing on a block of ruby heals you through a `run_script` action, and joining players are greeted. The examples **Script: block interaction**, **Script: scheduled effects** and **Script: action handler** in **Help → Examples…** show one idea each (see [Templates, starters and examples](templates-and-examples.md)).

## What a script can do

A script registers **handlers**: functions the runtime calls when something happens in the game. A handler can read what happened (the block, the item, the player, the damage), stop it (`e.cancel()`), and change the world: place blocks, spawn particles and mobs, play sounds, give items, heal or hurt entities, send chat messages, run commands and data pack functions. A script can also define a named handler that a block, item or entity event calls through the `run_script` action, so a block made in the Block Studio can run your code.

A script cannot reach Java, files, the network or other mods. See [Limits](#limits).

## Create a script

1. Choose **Add element** on the toolbar (Ctrl+N).
2. Under **Scripts**, pick one of the six templates:
   - **Block interaction script**: right-clicking a composter gives bone meal instead of composting;
   - **Entity hurt script**: an iron golem heals half of every hit back and shows heart particles;
   - **Scheduled effect script**: using a clock plays five rising chimes, half a second apart, with `msm.schedule`;
   - **Action handler script**: a named handler for the `run_script` action, using the new script's id as the handler id;
   - **Full set bonus**: every second, a player wearing full golden armour gets Speed and Haste, with `player.tick` and `entity.equipment` (runtime 1.5.0 or later);
   - **Boss bar countdown**: using an echo shard shows every player a 30-second boss bar countdown that ends with a title (runtime 1.5.0 or later).
3. Type a name, for example `glow`, and choose **Create**.

The script is listed under **Scripts** in the sidebar. Its id (`<namespace>:glow`) names it in the game log; the file goes into the jar as `msm/<namespace>/script/glow.js`.

## The Script Studio

Selecting a script opens the Script Studio:

- the script's id, and the note "Typings: Completions come from msm-runtime.d.ts, also written to .msm/.";
- the editor (**Script source**), a TypeScript editor: type `msm.` and a list of what comes next appears (Ctrl+Space opens it at any point); hover a name to read what it does; mistakes are underlined as you type;
- under the editor, **Script problems**: each problem as **Line <n>: <message>**; click one to put the caret on that line;
- **Events and handlers**: the game events (**Event block.interact**) and action handlers (**Handler mymod:guard**) the script registers, or "This script registers no events or handlers yet."

The same problems are listed in **Problems** at the bottom, with the script's id and `line <n>`. There are two kinds:

- **Syntax errors** (code `typescript.syntax`, for example "Expression expected. (TS1109)"): the script cannot be read. They are errors and block the Fabric mod jar: **Fabric mod (.jar)…** in the Export menu is greyed out with "Fix 1 error first (see Problems).", and the command palette leaves the command out.
- **Type problems** (code `typescript.semantic`, for example "Property 'nope' does not exist on type 'Msm'. (TS2339)"): a name or value that does not fit the API. They are warnings and do not block the export, because the game is more forgiving than the checker, but each one is very likely a bug.

**Raw JSON** shows the same script as a list of lines, one string per line.

## The API in plain words

Every script can start with `import { msm } from "msm:runtime";` (the templates do), though `msm` works without it too.

| Call | What it does |
|---|---|
| `msm.events.on(name, (e) => { ... })` | Runs the function every time the game event `name` happens (table below). Several handlers for one event run in the order they were registered. |
| `msm.actions.define(id, (e) => { ... })` | Defines a named handler that a `run_script` action calls (see [run_script](#run_script-from-the-events-editor)). |
| `msm.schedule(ticks, () => { ... })` | Runs the function after that many server ticks (20 ticks are one second). |
| `msm.log.info(text)`, `msm.log.warn(text)`, `msm.log.error(text)` | Writes a line to the game log, starting `[msm_runtime] <script id>:`. |
| `msm.version` | The version of the running `msm_runtime`. |
| `msm.storage.get(key)`, `msm.storage.set(key, value)` | Reads and saves data kept with the world (see [Saved data](#saved-data)). `entity.data` does the same for one entity or player. |
| `msm.players()` | The players online (runtime 1.5.0 or later). |
| `msm.getWorld(dimension)` | A loaded dimension by id, for example `msm.getWorld("minecraft:the_nether")`, or `undefined` (runtime 1.5.0 or later). |
| `msm.bossBars.create(id, { title, color?, style?, progress? })`, `msm.bossBars.get(id)` | Creates or finds a boss bar (see [Inventory, player state and the screen](#inventory-player-state-and-the-screen); runtime 1.5.0 or later). |

Every event object `e` has `e.world`, the dimension it happened in. Through it a script can read and place blocks (`getBlock`, `setBlock`), spawn particles and entities (`spawnParticle`, `spawnEntity`), play sounds (`playSound`), find entities nearby (`entitiesNear`) and run commands and functions (`runCommand`, `runFunction`). On the world they run at the world spawn point with no `@s`; pass a position as the second argument (`e.world.runCommand("particle flame ~ ~1 ~", pos)`) to make `~ ~ ~` that position. To run "as" something, call `entity.runCommand("effect give @s speed 5")` or `entity.runFunction("mymod:reward")`: they run as and at the entity, so `@s` and `~ ~ ~` mean it. A sound id in `playSound` can be a vanilla sound or one of the project's own sound keys. Entities have a type, a position, health, `damage`, `heal`, `kill`, `teleport`, `addEffect`, `hasEffect`, `effectLevel` (0 when the entity does not have the effect), `removeEffect`, `velocity` and `look` (where it faces) with `setVelocity(x, y, z)` and `addVelocity(x, y, z)` for a real push (for example `p.addVelocity(p.look.x * 1.5, 0.4, p.look.z * 1.5)` for a dash) and, for MSM mobs, `playAnimation`; players also have `isSneaking`, `heldItem`, `give`, `hasItem` and `sendMessage`. Positions (`pos`) have `x`, `y`, `z` and `offset(dx, dy, dz)`. The editor's completions list every member with a sentence on what it does.

### Events

| Event | When it runs | What `e` holds | Can cancel |
|---|---|---|---|
| `block.interact` | A player uses (right-clicks) a block | `block` (`id`, `state`, `pos`), `player`, `hand` (`"main"` or `"off"`) | Yes |
| `block.break` | Before a player breaks a block | `block`, `player` | Yes |
| `item.use` | A player uses (right-clicks) a held item | `item` (`id`, `count`), `player`, `hand` | Yes |
| `entity.interact` | A player uses (right-clicks) an entity | `entity`, `player`, `hand` | Yes |
| `entity.hurt` | Before a living entity takes damage | `entity`, `amount`, `attacker` (when there is one) | Yes |
| `entity.death` | After a living entity dies | `entity`, `attacker` (when there is one) | No |
| `player.join` | A player joins the server | `player` | No |
| `server.started` | Once, when the server (or the single-player world) has started | (`world` is the overworld) | No |
| `server.tick` | At the end of every server tick, 20 times a second | `tick` (`world` is the overworld) | No |
| `player.tick` | For each online player every `interval` ticks: `msm.events.on("player.tick", (e) => { ... }, { interval: 40 })` (20 by default; under 5 counts as 5) | `player` | No |
| `player.respawn` | After a player respawns (or comes back from the End) | `player` (`world` is the new world) | No |
| `player.leave` | A player leaves the server | `player` | No |
| `player.changeDimension` | After a player moves to another dimension | `player`, `from`, `to` (dimension ids; `world` is the new one) | No |
| `player.chat` | Before a player's chat message is sent | `player`, `message` | Yes |
| `entity.damaged` | After a living entity took damage | `entity`, `amount` (after armour), `attacker`, `direct`, `source` | No |

The last six events need runtime 1.5.0 or later, and `entity.hurt` gains `source` (the damage type id, for example `minecraft:fall`) and `direct` (what hit: an arrow rather than its shooter). `entity.hurt` runs before the damage and can cancel it; `entity.damaged` runs after it with the final amount. Neither can change the amount.

`e.cancel()` stops the game's own reaction: a cancelled `block.interact` does not open the chest, a cancelled `entity.hurt` does no damage. After a cancelled `block.interact`, `item.use`, `entity.interact` or `block.break` the game sends the player's inventory again, so the held stack's count and durability go back to what the server has; a cancelled `block.interact` also refreshes the blocks around the place that was clicked. A client-side guess about a cooldown or about what an entity interaction did (a bucket, shears, a name tag) may still show for a moment. Keep `server.tick` handlers short, since they run 20 times a second; use `msm.schedule` for things that happen later, and `player.tick` with an interval for checks on every player (the players are spread over the interval, so they are not all checked in the same tick). A cancelled `player.chat` message is seen by nobody.

An event name that is not in the table is reported in the game log when the script loads; the rest of the script still runs.

### Inventory, player state and the screen

Runtime 1.5.0 or later. Item stacks you read (`e.item`, `player.inventory.get(0)`, `entity.equipment("head")`) are copies: they have `id`, `count`, `name`, `maxCount`, `damage` and `maxDamage`, and `hasComponent(id)` and `getComponent(id)` read a data component as JSON, in the form `/give` and data packs use. To give or place items, use an id or an object with components:

```ts
player.give({ id: "minecraft:diamond_sword", components: { "minecraft:custom_name": "Edge" } });
```

| Member | What it does |
|---|---|
| `player.inventory` | `size` (36), `selectedSlot`, `get(slot)`, `set(slot, item?)` (no item empties the slot), `count(id)`, `remove(id, count?)` (returns how many it removed), `find(id)` (the first slot or -1) and `setComponent(slot, id, value?)` (no value removes the component). A slot is 0 to 8 (hotbar), 9 to 35, or `"mainhand"`, `"offhand"`, `"head"`, `"chest"`, `"legs"`, `"feet"`. |
| `entity.equipment(slot)`, `entity.setEquipment(slot, item?)` | Read or change what any living entity holds or wears, for example `zombie.setEquipment("head", "minecraft:carved_pumpkin")`. |
| `player.xpLevel`, `xpPoints`, `food`, `saturation`, `gameMode` | Read the player's experience, hunger and game mode. |
| `player.addXp(points)`, `addXpLevels(n)`, `setXpLevels(n)`, `setFood(level, saturation?)`, `setGameMode(mode)` | Change them; the player's screen updates straight away. |
| `player.showTitle(title, { subtitle?, fadeIn?, stay?, fadeOut? })`, `showActionBar(text)`, `clearTitle()` | Show text in the middle of the screen or above the hotbar (times in ticks). |
| `msm.bossBars.create(id, { title, color?, style?, progress? })` | A bar at the top of the screen with `setTitle`, `setProgress` (0 to 1), `setColor`, `setStyle`, `addPlayer`, `removePlayer`, `players()` and `remove()`. At most 32 per namespace; bars are not saved and go away on `/reload`. |
| `entity.damage(amount, { type?, attacker?, direct? })` | Damage of a type (`minecraft:magic`, for example) from an attacker, so kill credit and armour work as in vanilla. Without options the damage stays generic. |
| `entity.raycast(distance, options?)`, `world.raycast(from, direction, distance, options?)` | The first block or entity along a line, or `undefined`: `kind`, `pos`, `distance` and `block` with `face`, or `entity`. At most 128 blocks; `{ fluids: true }` stops at water, `{ entities: false }` sees only blocks. |
| `entity.teleport(pos, { dimension?, yaw?, pitch? })` | Moves an entity, also to another dimension; the script's handle on it keeps working. |

The templates **Full set bonus** (a bonus while a whole armour set is worn, with `player.tick`) and **Boss bar countdown** show these in use.

### Containers and machines from scripts

Script API 1.2, runtime 1.6.0 or later. `world.getContainer(pos)` returns the container at a block position, or `undefined` when the block holds no items. It works on vanilla chests, barrels, hoppers and furnaces as well as on the containers and machines of [Containers and machines](containers-and-machines.md).

| Member | What it does |
|---|---|
| `container.size` | The number of slots. A double chest gives the half at the position. |
| `container.get(slot)` | A copy of the stack in the slot, or `undefined` when it is empty. |
| `container.set(slot, item?)` | Puts a stack in the slot (no item empties it) and returns `false` when the slot refuses it. A machine's output slot refuses items; its input slot takes any. |
| `container.count(id)` | How many of an item the container holds in all. |
| `container.add(item)` | Puts an item in the first slots that take it, as a hopper would, and returns what did not fit, or `undefined` when everything did. It ignores which side of the block a hopper would use. |

Changes update comparators and are saved with the block. A `Container` you keep after the block is removed throws an error when used; fetch it again each time.

```ts
const box = world.getContainer(e.pos);
if (box && box.count("minecraft:diamond") >= 3) box.set(0, { id: "minecraft:emerald", count: 1 });
```

## run_script from the Events editor

The `run_script` action lets a block, item or entity event call a script, so people who build with the Studios and people who write code can work on the same mod.

1. In a script, define a handler: `msm.actions.define("<namespace>:guard", (e) => { ... });`. The **Action handler script** template does this with the script's own id. The handler receives `e.owner` (the block, item or entity id), `e.event` (the event id), `e.pos`, and `e.block`, `e.entity`, `e.player` and `e.other` (the entity a thrown item hit, or the holder of a status effect) when they apply.
2. In the Block, Item, Entity or Effect Studio, open the event under **Events**, choose `run_script` in the list next to **Add action** and choose **Add action**.
3. Pick the handler in the action's handler list (it shows "(choose a handler)" until you do), or type its id in the handler id field below it. The list holds every handler the project's scripts define. When no script defines one yet, the Studio says: "No script defines a handler yet: add msm.actions.define("<id>", (e) => { ... }) to a script."

**Problems** warns when a `run_script` action names a handler that no script in the project defines.

### Scripts on the triggers

Every trigger of a block, item or mob can run a script this way, including the triggers in the **Triggers** part of **Events** ([Triggers](blocks-and-items.md#triggers)). In an **On hit** event `e.player` (or `e.entity` for a mob) is the attacker and `e.other` the mob hit; in **On use on a block**, **On break** and **On place** events `e.block` is the block clicked, broken or placed; in **On entity inside** and **On place** events the entity inside or the placer is `e.player` when it is a player and `e.entity` otherwise (and `e.other` too when it is a living entity). A handler on a trigger that repeats often (**While held**, **While worn**, **On tick**) runs many times a minute: keep it short, and choose an interval of 20 ticks or more unless it must be faster (**Problems** notes a faster one).

### A script for a status effect

A [status effect](effects-and-throwables.md) runs a script every few seconds while it is active: in the Effect Studio, choose **New event** next to **While active**, add a `run_script` action to that event and pick the handler. The handler's `e.entity` and `e.other` are both the holder, so `e.entity.effectLevel("<namespace>:<effect name>")` gives the effect's level (0 when the holder no longer has it) and `e.entity.removeEffect("minecraft:poison")` cures poison. The example **Script: scripted effect** (Help → Examples…) is an antidote that works this way. In a throwable's **On hit entity** event, `e.player` is the thrower and `e.other` the mob or player hit.

## Saved data

Ordinary variables are lost on `/reload` and when the world closes. To keep something, save it: `msm.storage` holds data for the whole world and `entity.data` (so also `player.data`) holds data for one entity. Both have `get(key)`, `set(key, value)`, `remove(key)`, `has(key)` and `keys()`.

```ts
msm.events.on("player.join", (e) => {
  const visits = e.player.data.get("visits");
  const count = typeof visits === "number" ? visits + 1 : 1;
  e.player.data.set("visits", count);
  e.player.sendMessage("Visit number " + count);
});
```

- **What can be saved:** text, finite numbers, `true` and `false`, `null`, and arrays and plain objects made of these. A function, `undefined`, `NaN` or `Infinity` is an error. A value is copied when you save it and again when you read it, so changing an object after `set` changes nothing until you `set` it again.
- **Each namespace has its own data.** A script sees only the keys saved by scripts of its own namespace, so two mods never overwrite each other.
- **How long it lasts:** saved data survive `/reload`, closing and reopening the world, a player's death and respawn, and travel to another dimension. Data on a mob go when the mob is gone.
- **Size limits:** a key is at most 64 characters; one namespace may keep at most 16 KiB on each entity and 1 MiB in `msm.storage`. Saving over a limit is a script error and the old value stays.
- **`get` returns `unknown`:** the editor cannot know what was saved, so check it first (`typeof visits === "number"`).
- **An example:** **Script: kill counter** (Help → Examples…) counts each player's kills in `player.data` and the world's total in `msm.storage`, and tells players their count when they join.
- **Timers are not saved.** `msm.schedule` is cleared by `/reload` and when the world closes. To keep a timer going, save when it should fire and start it again in `server.started`:

```ts
// When the event starts, save its time: msm.storage.set("eventAt", world.time + 6000).
msm.events.on("server.started", (e) => {
  const due = msm.storage.get("eventAt");
  if (typeof due === "number") msm.schedule(Math.max(1, due - e.world.time), startEvent);
});
```

## Commands as an entity

`world.runCommand` and `world.runFunction` run at the world spawn point with no `@s`, unless you pass a position: `e.world.runCommand("setblock ~ ~1 ~ minecraft:glowstone", e.block.pos)` uses `at` as `~ ~ ~`. To run a command "as" something, use the entity itself: `e.player.runCommand("tag @s add rewarded")` and `e.entity.runFunction("mymod:reward")` run as and at that entity, so `@s` means it and `~ ~ ~` is where it stands. The same works for any mob from `entitiesNear`. Use `world.runCommand` for things that belong to a place and `entity.runCommand` for things that belong to a creature.

## What cancelling restores

`e.cancel()` stops the server doing something, but the player's game may already have guessed the result. So after a cancel the runtime sends the truth back:

| Cancelled | Sent again |
|---|---|
| `block.interact`, `item.use`, `entity.interact`, `block.break` | the player's whole inventory, so a held stack's count and durability return to what the server has |
| `block.interact` that would have placed a block | the six neighbours of the place, so a block the client drew is taken away |
| `block.break` | the broken block's block entity (a chest's contents, a sign's text), not only the block |
| `item.use` with an item that has a cooldown | the item's cooldown is cleared, so the item is not shown as used (unless the server itself has it on cooldown) |

What it cannot undo is a client guess about an entity interaction (a bucket, shears, a name tag), which may show for a moment until the next update.

## Typings and the `.msm/` folder

The editor knows the API from a typings file, `msm-runtime.d.ts`, made from the same description the runtime is tested against. MCSuperMods also writes it into the project as `.msm/msm-runtime.d.ts` when you open or create a project, so you can see which API version the project was last edited with, or point another editor (for example Visual Studio Code) at it. You never need to edit it; MCSuperMods rewrites it when it changes.

## How scripts are transpiled

Minecraft runs scripts with Rhino, a JavaScript engine that understands older JavaScript (ES5) and some newer built-ins. You write TypeScript; when you export the Fabric mod jar, MCSuperMods turns each script into ES5 JavaScript (`msm/<namespace>/script/<name>.js`) with the TypeScript compiler. The TypeScript source is not in the jar.

What that means in practice:

- Types are checked in the editor and dropped from the output; they cost nothing in the game.
- Arrow functions, `let` and `const`, template strings, destructuring, `for...of` and classes all work: the compiler rewrites them as ES5 (a `class` becomes a function with a prototype).
- `async` and `await` compile, but the game does not wait for anything: there is no file or network access, and promises settle right after your handler returns. Use `msm.schedule` to wait.
- The checker offers only what Rhino has: the ES2015 built-ins (`Map`, `Set`, `Promise`, `Symbol`), `Array.prototype.includes`, `Object.entries` and `Object.values`, string padding, and no browser or Node.js objects (`document`, `fetch`, `setTimeout`, `process`).
- A script can load another script of the same mod and namespace with `require("./util")`, and that script's `exports` come back; `require("msm:runtime")` returns the `msm` module. The editor knows `require`, but what it returns is untyped (`any`), so completions stop at the required module.

## Limits

- **No Java.** Scripts see only the `msm` API. Java classes, packages and reflection are blocked.
- **2 second budget.** A single handler call (or the script's top level when it loads) that runs for more than 2 seconds is stopped and logged; the game carries on. This protects the server from endless loops, not the frame rate: a handler that takes 50 ms on every `server.tick` still makes the game stutter.
- **Server side only.** Scripts run on the server (in single player, the built-in server). They cannot draw on screen, read keys or change client settings.
- **Saved data is small.** Variables are reset by `/reload` and by restarting the world; keep what must last in `msm.storage` or `entity.data`, within 64-character keys, 16 KiB per entity and 1 MiB per world for each namespace (see [Saved data](#saved-data)).
- **Fabric mod jar only.** The Java project export leaves scripts and `run_script` actions out (see [Eject to a Java project](eject.md)).
- **Script API limits.** At most 32 boss bars per namespace (creating one more is a script error); a ray reaches at most 128 blocks (a longer one is a `RangeError`); `player.tick` runs at most every 5 ticks for each player, and an item component value read or written in one call is at most 64 KiB.

### Not possible yet

These are planned for later, so nobody waits for them in this release:

- **A block placed event** (`block.place`): the game has no place event a script can listen to without changing Minecraft's code. Blocks of your project have the **On place** trigger, which can run a script through `run_script` ([Triggers](blocks-and-items.md#triggers)).
- **Changing the amount of damage**: `entity.hurt` can cancel damage but not make it larger or smaller, and `entity.damaged` only reports the final amount.
- **Commands of your own** (`/mycommand`): use functions, or an item or block that runs a script.
- **Creative tabs of your own**: your items go into the vanilla tabs.
- Dropped items and projectiles in `entitiesNear`, and anything on the player's screen beyond titles, the action bar and boss bars (scripts run on the server).

## The in-game check

Install the jar with Fabric API as described in [Install the mod in a Fabric game](blocks-and-items.md#install-the-mod-in-a-fabric-game), or use **Test in Minecraft…**. Then open the game log and try each script's event in a creative world.

The sample script project has a full checklist, one row per event: [`fixtures/sample-script/README.md`](https://github.com/MEZTKING/MCSuperMods/blob/main/fixtures/sample-script/README.md#in-game-check-windows-minecraft-java-263).

## Troubleshooting

When the world starts, the runtime writes a summary line to the game log (Prism: the instance's **Minecraft Log**; official launcher: `logs\latest.log`), for example:

```
[msm_runtime] loaded 3 script(s); 0 error(s)
```

Lines from your scripts' `msm.log` calls start `[msm_runtime] <script id>:`. A script that fails is reported with `script <id>:`, the message and the file (with the line in the transpiled `.js` file when Rhino knows it). A script that fails while loading:

```
[msm_runtime] script mymod:glow: <message> (msm/mymod/script/glow.js#7)
```

A handler that fails when its event runs names the event (or `action <handler id>`):

```
[msm_runtime] script mymod:glow: block.interact handler: <message> (msm/mymod/script/glow.js#7)
```

| Problem | What to do |
|---|---|
| No `loaded ... script(s)` line | The jar has no scripts, or `msm_runtime` is older than 0.6.0. Export the jar again with the runtime nested (the default). |
| `loaded 3 script(s); 1 error(s)` | One script failed while loading, or used an event name that does not exist (`unknown event '<name>'`); the `script <id>:` line above it says which. The other scripts still run. |
| A `script <id>:` line every few seconds | A handler throws each time it runs (the line repeats at most once every 5 seconds). Fix the line it names; the line number is in the `.js` file, close to the same line in your script. |
| `ran for more than 2000 ms and was stopped` | A handler ran for more than 2 seconds, usually a loop that never ends. |
| Nothing happens and nothing is logged | Check the event name (**Events and handlers** in the Script Studio lists what the script registers) and any `if` that returns early, and add `msm.log.info` lines to see what runs. |
| A `run_script` action does nothing | The handler id in the action must match `msm.actions.define("<id>", ...)` exactly; **Problems** warns when it does not. |
| The export is greyed out with "Fix 1 error first (see Problems)." | A script has a syntax error; **Problems** shows the line. |
