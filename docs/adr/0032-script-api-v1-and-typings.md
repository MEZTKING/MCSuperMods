# ADR 0032: Runtime script API v1, `msm:script` elements and generated typings

## Context

[ADR 0031](0031-rhino-runtime-and-typescript-es5-scripts.md) fixes the engine and the transpiler. Scripts need a curated API over game objects (DESIGN §12: "a façade, not raw Minecraft classes"), the app needs `.d.ts` typings for Monaco "generated from the runtime API description, versioned with `msm_runtime`, and written into `.msm/`", and the two must not drift. The runtime has no dependency on the app and must work with hand-written content jars; the app's plugins use only the public plugin API.

## Decision

**D1. One source of truth: `script-api-v1.json`.** The API is described once, in `packages/plugins/scripting/api/script-api-v1.json`: `version` (1), `globals` (the `msm` object tree: namespaces, functions with typed parameters and return types, properties), `types` (object types such as `World`, `Entity`, `Player`, `Pos` with their members) and `events` (event name, the event object's type, whether `cancel()` exists). Parameter and return types are TypeScript type strings restricted to primitives, the declared types, arrays, unions with `undefined`, and object literals. From it:

- `@msm/plugin-scripting` generates `msm-runtime.d.ts` (checked in next to the JSON as a golden; a test fails when it is stale, `UPDATE_GOLDENS=1` rewrites it). The file declares `declare const msm: Msm` as a global and `declare module "msm:runtime" { export const msm: Msm; export type ... }`, so scripts work with or without the import.
- the runtime's JUnit test `ScriptApiContractTest` reads the same JSON in place (`../packages/plugins/scripting/api/`, as the conformance corpus is read) and checks that the Java host exposes exactly the declared members on each type (`ScriptApi.describe()` returns the member tree the host installs), so the Codecs-and-corpus pattern of ADR 0025 is repeated for the API.

**D2. API v1 surface.** All calls run on the server thread; positions are block or exact coordinates in the event's dimension.

| Member | Meaning |
|---|---|
| `msm.version: string` | The runtime version |
| `msm.log.info(message)`, `.warn(message)`, `.error(message)` | Logs `[msm_runtime] <script id>: <message>` at that level |
| `msm.events.on(name, handler)` | Registers a handler for a game event (table below); several handlers per name run in registration order |
| `msm.actions.define(id, handler)` | Defines a named handler a definition event calls through the `run_script` action (D4); `id` is a resource location |
| `msm.schedule(ticks, fn)` | Runs `fn` after `ticks` server ticks (1 or more); cleared on reload |
| `Pos { x, y, z, offset(dx, dy, dz): Pos, toString() }` | Immutable position; block positions are integers |
| `World { dimension: string; time: number; getBlock(pos): string; setBlock(pos, state): boolean; spawnParticle(id, pos, options?: { count?, spread?, speed? }); playSound(id, pos, options?: { volume?, pitch? }); runCommand(command): number; runFunction(id): boolean; spawnEntity(id, pos): Entity \| undefined; entitiesNear(pos, radius): Entity[] }` | `getBlock` returns the block state string (`ns:id[prop=value]`); `setBlock` parses one; `runCommand` runs as the server with permission level 2 and suppressed output and returns the result count; `runFunction` runs a data pack function the same way |
| `Entity { type: string; uuid: string; pos: Pos; world: World; health: number; maxHealth: number; isAlive: boolean; isPlayer: boolean; name: string; damage(amount): void; heal(amount): void; kill(): void; teleport(pos): void; addEffect(id, ticks, amplifier?): void; playAnimation(name, controller?): void; asPlayer(): Player \| undefined }` | `playAnimation` triggers a GeckoLib animation on an MSM entity and does nothing on others |
| `Player extends Entity { isSneaking: boolean; isCreative: boolean; heldItem: string \| undefined; give(item, count?): void; hasItem(item): boolean; sendMessage(text): void }` | `give` drops what does not fit, as the `give_item` action does |

Events (`msm.events.on(name, e => ...)`), each `e` has `world` and the members listed; `cancel()` exists where Fabric API allows cancelling:

| Name | Fabric API source | Event members |
|---|---|---|
| `block.interact` | `UseBlockCallback` (server side) | `block: { id, state, pos }`, `player`, `hand: 'main' \| 'off'`, `cancel()` |
| `block.break` | `PlayerBlockBreakEvents.BEFORE` | `block`, `player`, `cancel()` |
| `item.use` | `UseItemCallback` (server side) | `item: { id, count }`, `player`, `hand`, `cancel()` |
| `entity.interact` | `UseEntityCallback` (server side) | `entity`, `player`, `hand`, `cancel()` |
| `entity.hurt` | `ServerLivingEntityEvents.ALLOW_DAMAGE` | `entity`, `amount`, `attacker?`, `cancel()` |
| `entity.death` | `ServerLivingEntityEvents.AFTER_DEATH` | `entity`, `attacker?` |
| `player.join` | `ServerPlayConnectionEvents.JOIN` | `player` |
| `server.started` | `ServerLifecycleEvents.SERVER_STARTED` | (`world` is the overworld) |
| `server.tick` | `ServerTickEvents.END_SERVER_TICK` | `tick: number` (`world` is the overworld); documented as costly |
| action handlers (D4) | the runtime's `EventRunner` | `owner: string`, `event: string`, `pos: Pos`, `block?`, `entity?`, `player?` |

Names not in the table are a load-time error for that `on` call (logged, the rest of the script loads). Objects are wrappers created per event; holding one across ticks is allowed but `isAlive` must be checked.

**D3. The `msm:script` element.** Kind `msm:script` (plugin `msm.scripting`, kind folder `script`, schema `msm:script`, a TypeScript `SchemaNode` extension like `msm:function`), data `{ "lines": string[] }` (one entry per source line, as functions are stored; diff-friendly, JSON only). Ids are resource locations (`mymod:ore_glow`). Lowering writes `msm/<ns>/script/<path>.ts` as a `msm`-layer `OutputFile` with `language: 'typescript'` and no schema; the content-jar exporter transpiles it to `msm/<ns>/script/<path>.js` (ADR 0031 D5). The vanilla pack exporters skip the `msm` layer as before. Scripts carry `meta.notes` like every element.

**D4. Action `run_script`** (a format 1 addition, ADR 0025 D4 table): `{ "type": "run_script", "handler": "<ns>:<name>" }` calls the handler defined by `msm.actions.define` with the event context (owner definition id, event id, position, block, entity and player when present). An undefined handler is logged once per handler id when the event runs; a `run_script` action in a jar loaded by a runtime older than 0.6.0 is an unknown action type, which drops that event with an error (content jars with scripts depend on `msm_runtime >=0.6.0` through the exporter's version rule). The mcdoc, the Codecs, the Events editor and the plugin validators learn the action; the `scripting.unknown-handler` validator warns when no script in the project contains `msm.actions.define("<handler>"` (a textual check, since scripts are not executed in the app).

**D5. Typings in the app and in `.msm/`.** The Script Studio edits scripts in Monaco with the TypeScript language: the generated `.d.ts` is added as an extra lib, compiler options `target: ES2018` for checking, `strict`, `noLib` with the curated lib set (`lib.es5`, `lib.es2015.*`, `lib.es2016.array.include`, `lib.es2017.object`, `lib.es2017.string`, `lib.es2018.regexp`: what Rhino 1.9.2 implements, re-probed when Rhino moves), no DOM. The session writes `msm-runtime.d.ts` to `<project>/.msm/msm-runtime.d.ts` when a project is opened or created and the file differs, so the typings version a project was last edited with is visible to the author; the folder is already the app's and is ignored by load. The runtime jar version and the typings version are the same number (`mod_version`, equal to the app version).

## Consequences

- The API grows only by editing one JSON file, regenerating the typings and implementing the member in Java; the JUnit contract test fails until both sides agree.
- Scripts are stored and exported like functions; no project file holds generated JavaScript.
- Components and scripts meet in `run_script`, so a beginner's event can call a power user's handler.
- The event list is deliberately small; new events are JSON additions (older runtimes log an error for an unknown name and keep the rest of the script).

## Status

Proposed (2026-11-05). Implemented by B132 (JSON, generator, typings), B133 (runtime), B134 (plugin) and B137 (app); accepted at Phase 6 close.
