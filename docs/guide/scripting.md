# Scripting

Components and events (see [Blocks and items](blocks-and-items.md#events-and-actions)) cover the common cases without code. When you need more, such as a check before something happens, a reaction to any block or mob in the game, or an effect that plays out over time, write a **script**: a small TypeScript file (`msm:script`) that the `msm_runtime` mod runs inside the game. Scripts call a small MCSuperMods API (`msm`), never Minecraft's own code.

Like blocks and items, scripts reach the game only through the **Fabric mod jar** export. The vanilla pack exports leave them out, and so does the [Java project export](eject.md).

The quickest start is the **Scripted ore** starter (**New from starter…**): the Custom ore content plus three scripts. Sneak-using ruby ore gives a bonus ruby, standing on a block of ruby heals you through a `run_script` action, and joining players are greeted. The examples **Script: block interaction**, **Script: scheduled effects** and **Script: action handler** in **Help → Examples…** show one idea each (see [Templates, starters and examples](templates-and-examples.md)).

## What a script can do

A script registers **handlers**: functions the runtime calls when something happens in the game. A handler can read what happened (the block, the item, the player, the damage), stop it (`e.cancel()`), and change the world: place blocks, spawn particles and mobs, play sounds, give items, heal or hurt entities, send chat messages, run commands and data pack functions. A script can also define a named handler that a block, item or entity event calls through the `run_script` action, so a block made in the Block Studio can run your code.

A script cannot reach Java, files, the network or other mods. See [Limits](#limits).

## Create a script

1. Choose **Add element** on the toolbar (Ctrl+N).
2. Under **Scripts**, pick one of the four templates:
   - **Block interaction script**: right-clicking a composter gives bone meal instead of composting;
   - **Entity hurt script**: an iron golem heals half of every hit back and shows heart particles;
   - **Scheduled effect script**: using a clock plays five rising chimes, half a second apart, with `msm.schedule`;
   - **Action handler script**: a named handler for the `run_script` action, using the new script's id as the handler id.
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

Every event object `e` has `e.world`, the dimension it happened in. Through it a script can read and place blocks (`getBlock`, `setBlock`), spawn particles and entities (`spawnParticle`, `spawnEntity`), play sounds (`playSound`), find entities nearby (`entitiesNear`) and run commands and functions (`runCommand`, `runFunction`). Entities have a type, a position, health, `damage`, `heal`, `kill`, `teleport`, `addEffect`, `velocity` and `look` (where it faces) with `setVelocity(x, y, z)` and `addVelocity(x, y, z)` for a real push (for example `p.addVelocity(p.look.x * 1.5, 0.4, p.look.z * 1.5)` for a dash) and, for MSM mobs, `playAnimation`; players also have `isSneaking`, `heldItem`, `give`, `hasItem` and `sendMessage`. Positions (`pos`) have `x`, `y`, `z` and `offset(dx, dy, dz)`. The editor's completions list every member with a sentence on what it does.

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

`e.cancel()` stops the game's own reaction: a cancelled `block.interact` does not open the chest, a cancelled `entity.hurt` does no damage. Keep `server.tick` handlers short, since they run 20 times a second; use `msm.schedule` for things that happen later.

An event name that is not in the table is reported in the game log when the script loads; the rest of the script still runs.

## run_script from the Events editor

The `run_script` action lets a block, item or entity event call a script, so people who build with the Studios and people who write code can work on the same mod.

1. In a script, define a handler: `msm.actions.define("<namespace>:guard", (e) => { ... });`. The **Action handler script** template does this with the script's own id. The handler receives `e.owner` (the block, item or entity id), `e.event` (the event id), `e.pos`, and `e.block`, `e.entity` and `e.player` when they apply.
2. In the Block, Item or Entity Studio, open the event under **Events**, choose `run_script` in the list next to **Add action** and choose **Add action**.
3. Pick the handler in the action's handler list (it shows "(choose a handler)" until you do), or type its id in the handler id field below it. The list holds every handler the project's scripts define. When no script defines one yet, the Studio says: "No script defines a handler yet: add msm.actions.define("<id>", (e) => { ... }) to a script."

**Problems** warns when a `run_script` action names a handler that no script in the project defines.

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
- **No saved data yet.** Variables live while the server runs and are reset by `/reload` and by restarting the world. Store lasting state in the world itself (blocks, scoreboards through `runCommand`).
- **Fabric mod jar only.** The Java project export leaves scripts and `run_script` actions out (see [Eject to a Java project](eject.md)).

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
