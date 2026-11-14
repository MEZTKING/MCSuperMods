/**
 * Golden over the committed scripting sample (`fixtures/sample-script`, ADRs 0031 and 0032):
 * an `msm:mod`, one block and one item copied from the sample mod and renamed, one script per
 * event of ADR 0032 D2 (each logging with `msm.log.info`), an action handler script called by
 * the block's `run_script` action, and a `util` module that two scripts load with
 * `require("./util")`; since ADR 0055 an `msm:effect` whose `msm:on_tick` runs a second
 * action handler script (the script tick hook); since ADR 0058 the `warded_stone` block, whose
 * use `on_block_interact` cancels, `World.runCommand` with `at` on the spark ore and
 * `Entity.runCommand` on a used entity; since ADR 0062 a kill counter in `player.data` and
 * `msm.storage` and a start counter in `msm.storage`; since ADR 0065 (B255) chat commands
 * starting with `!` for the Script API 1.1 (inventory and components, experience, food and game
 * mode, titles, a boss bar, a raycast, typed damage, a cross-dimension teleport), mob equipment
 * and one script per new event; namespace `msm_sample_script`.
 *
 * - The fixture equals the project built from {@link SAMPLE_ELEMENTS} now; `UPDATE_GOLDENS=1`
 *   rewrites it (the README is hand-written).
 * - Every element validates with zero problems, the plugins' project validators report
 *   nothing, and every script parses and type-checks against the generated typings.
 * - The content jar exports with zero problems, a stub runtime jar and the real `typescript`
 *   transpiler (ADR 0031 D2 options); its SHA-256 is pinned per target in two time zones
 *   (`test/fixtures/<target id>/sample-script-jar.sha256`).
 * - Every `msm/<ns>/script/*.js` is present (no `.ts`), parses as ES5, and holds no `class`,
 *   `async`, `let`, `const`, arrow or `for...of` tokens (TypeScript's scanner).
 * - With `MSM_RUNTIME_JAR` and `MSM_SAMPLE_SCRIPT_OUT`, the jar is also exported with the real
 *   runtime nested and written to that folder as `msm_sample_script.jar`, next to
 *   `fabric-facts.json` for `tools/run-fabric-server` (`expectScripts` included; CI's
 *   `engine-mod` job). Without them that test is skipped.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createElement,
  createEmptyProject,
  createMemoryFileSystem,
  type DirEntry,
  ElementKindRegistry,
  loadProject,
  type MemoryFileSystem,
  type ProjectFileSystem,
  registerPlugin,
  saveProject,
  utf8,
} from '@msm/core';
import type { Element, Json, Plugin, Project, Target } from '@msm/plugin-api';
import blocksItemsPlugin from '@msm/plugin-blocks-items';
import dataPackPlugin from '@msm/plugin-datapack';
import resourcePackPlugin from '@msm/plugin-resourcepack';
import scriptingPlugin, { MSM_RUNTIME_TYPINGS } from '@msm/plugin-scripting';
import {
  createRegistryIndex,
  createSchemaIndex,
  MSM_SCHEMA_REFS,
  parseVanillaMcdocSymbols,
  type RegistryIndex,
  type SchemaIndex,
  validateJson,
} from '@msm/schemas';
import { builtInTargets, readVendoredJson, type TargetBundle } from '@msm/targets';
import { unzipSync } from 'fflate';
import ts from 'typescript';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createFabricContentJarExporter,
  createZipSink,
  type FabricContentJarOptions,
  runExport,
  SCRIPT_RUNTIME_MINIMUM,
  type ScriptTranspileResult,
} from '../src/index';
import { defaultTarget, selectedTarget } from './selected-target';

const update = process.env.UPDATE_GOLDENS === '1';

const here = dirname(fileURLToPath(import.meta.url));
const fixturesRoot = join(here, 'fixtures');
const sampleRoot = join(here, '..', '..', '..', 'fixtures', 'sample-script');
const NAMESPACE = 'msm_sample_script';
const PROJECT_NAME = 'MSM Sample Script';
const NOW = '2026-11-05T00:00:00.000Z';
/** Files of the fixture that the test does not generate. */
const HAND_WRITTEN = new Set(['README.md']);

/** Two zones on opposite sides of the date line, so a local-time leak changes the bytes. */
const TIME_ZONES = ['Pacific/Kiritimati', 'America/Los_Angeles'] as const;

/** The plugins the sample needs, in the app's registration order. */
const PLUGINS: readonly Plugin[] = [
  resourcePackPlugin,
  dataPackPlugin,
  blocksItemsPlugin,
  scriptingPlugin,
];
const VALIDATORS = PLUGINS.flatMap((plugin) => plugin.contributes.validators ?? []);

const registry = new ElementKindRegistry();
for (const plugin of PLUGINS) registerPlugin(registry, plugin);

// 0.6.0: the first runtime that runs scripts (ADR 0032 D4), so `depends` and the nested
// runtime's file name agree.
const meta = {
  msmVersion: '0.6.0',
  plugins: ['msm.blocks-items', 'msm.datapack', 'msm.scripting'],
};
const stubRuntimeJar = utf8.encode('PK stub msm_runtime jar for the sample-script golden');

/** The transpiler of ADR 0031 D2: TypeScript to ES5 CommonJS; syntax errors as problems. */
function typescriptTranspile(source: string, name: string): ScriptTranspileResult {
  const output = ts.transpileModule(source, {
    fileName: name,
    reportDiagnostics: true,
    compilerOptions: {
      target: ts.ScriptTarget.ES5,
      module: ts.ModuleKind.CommonJS,
      downlevelIteration: true,
      ignoreDeprecations: '6.0',
    },
  });
  const diagnostics = (output.diagnostics ?? []).filter(
    (diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error,
  );
  if (diagnostics.length > 0) {
    return {
      problems: diagnostics.map((diagnostic) => ({
        severity: 'error',
        code: 'scripting.syntax',
        message: ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
        file: name,
      })),
    };
  }
  return { js: output.outputText };
}

// The project -----------------------------------------------------------------------------

interface SampleElement {
  id: string;
  kind: string;
  data: Json;
}

const ns = (path: string): string => `${NAMESPACE}:${path}`;
const IMPORT = 'import { msm } from "msm:runtime";';

/** A script element from its source lines. */
const script = (path: string, lines: string[]): SampleElement => ({
  id: ns(path),
  kind: 'msm:script',
  data: { lines },
});

/**
 * One script per game event of ADR 0032 D2, each logging with `msm.log.info`; the action
 * handler `spark` that the block's `run_script` action calls; and `util`, which
 * `on_server_started` and `spark_handler` load with `require("./util")` (TypeScript's
 * CommonJS output of their `import ... from "./util"`).
 */
const SCRIPTS: readonly SampleElement[] = [
  script('util', [
    '// Shared helpers. Scripts that import this file load it with require("./util"); the',
    '// runtime evaluates it once, so this line is logged once.',
    IMPORT,
    '',
    `export const MOD = "${NAMESPACE}";`,
    '',
    'export function id(path: string): string {',
    '  return MOD + ":" + path;',
    '}',
    '',
    'msm.log.info("util loaded");',
  ]),
  script('on_block_interact', [
    IMPORT,
    '',
    '// block.interact: a player uses the spark ore or the warded stone with the main hand.',
    'msm.events.on("block.interact", (e) => {',
    '  if (e.hand !== "main") return;',
    `  if (e.block.id === "${ns('warded_stone')}") {`,
    '    // A cancel refuses the use: nothing is placed against the warded stone, the held',
    '    // stack is kept, and the runtime sends the player its inventory and the blocks around.',
    '    msm.log.info("block.interact: " + e.player.name + " was refused at warded stone " + e.block.pos);',
    '    e.cancel();',
    '    return;',
    '  }',
    `  if (e.block.id !== "${ns('spark_ore')}") return;`,
    '  msm.log.info("block.interact: " + e.player.name + " used spark ore at " + e.block.pos);',
    '  // With `at`, ~ ~ ~ is the spark ore, so the sea lantern goes on top of it.',
    '  e.world.runCommand("setblock ~ ~1 ~ minecraft:sea_lantern", e.block.pos);',
    '});',
  ]),
  script('on_block_break', [
    IMPORT,
    '',
    '// block.break: a player breaks the spark ore.',
    'msm.events.on("block.break", (e) => {',
    `  if (e.block.id !== "${ns('spark_ore')}") return;`,
    '  msm.log.info("block.break: " + e.player.name + " broke spark ore at " + e.block.pos);',
    '});',
  ]),
  script('on_item_use', [
    IMPORT,
    '',
    '// item.use: a player uses a spark gem.',
    'msm.events.on("item.use", (e) => {',
    `  if (e.item.id !== "${ns('spark_gem')}") return;`,
    '  msm.log.info("item.use: " + e.player.name + " used " + e.item.count + " spark gem(s)");',
    '});',
  ]),
  script('on_entity_interact', [
    IMPORT,
    '',
    '// entity.interact: a player uses an entity (fires once per hand).',
    'msm.events.on("entity.interact", (e) => {',
    '  if (e.hand !== "main") return;',
    '  msm.log.info("entity.interact: " + e.player.name + " used " + e.entity.type);',
    '  // Entity.runCommand runs as and at the entity: @s is the entity that was used.',
    '  e.entity.runCommand("tag @s add msm_sample_touched");',
    '});',
  ]),
  script('on_entity_hurt', [
    IMPORT,
    '',
    '// entity.hurt: an entity other than a player is hurt by a player.',
    'msm.events.on("entity.hurt", (e) => {',
    '  if (e.entity.isPlayer || e.attacker === undefined || !e.attacker.isPlayer) return;',
    '  msm.log.info("entity.hurt: " + e.entity.type + " took " + e.amount + " from " + e.attacker.name);',
    '});',
  ]),
  script('on_entity_death', [
    IMPORT,
    '',
    '// entity.death: an entity other than a player is killed by a player.',
    'msm.events.on("entity.death", (e) => {',
    '  if (e.entity.isPlayer || e.attacker === undefined || !e.attacker.isPlayer) return;',
    '  msm.log.info("entity.death: " + e.attacker.name + " killed " + e.entity.type);',
    '});',
  ]),
  script('on_player_join', [
    IMPORT,
    '',
    '// player.join: greets the player and logs the join.',
    'msm.events.on("player.join", (e) => {',
    '  e.player.sendMessage("MSM Sample Script is loaded. Use the spark ore.");',
    '  msm.log.info("player.join: " + e.player.name);',
    '});',
  ]),
  script('on_server_started', [
    IMPORT,
    'import { id } from "./util";',
    '',
    '// server.started: logs once the server has started; uses the util module.',
    'msm.events.on("server.started", (e) => {',
    '  msm.log.info("server.started: runtime " + msm.version + " in " + e.world.dimension + ", handler " + id("spark"));',
    '});',
  ]),
  script('on_server_tick', [
    IMPORT,
    '',
    '// server.tick: runs every tick (costly), so this script logs only the first one.',
    'var logged = false;',
    'msm.events.on("server.tick", (e) => {',
    '  if (logged) return;',
    '  logged = true;',
    '  msm.log.info("server.tick: first tick " + e.tick);',
    '});',
  ]),
  // Saved data (ADR 0062): a kill counter on each player and a start counter with the world.
  script('kill_counter', [
    IMPORT,
    '',
    '// Reads a saved number, or 0 when nothing is stored yet.',
    'function count(value: unknown): number {',
    '  return typeof value === "number" ? value : 0;',
    '}',
    '',
    "// entity.death: each kill by a player adds one to that player's count (player.data) and to",
    '// the world total (msm.storage), and tells the player both.',
    'msm.events.on("entity.death", (e) => {',
    '  const killer = e.attacker?.asPlayer();',
    '  if (killer === undefined) return;',
    '  const kills = count(killer.data.get("kills")) + 1;',
    '  killer.data.set("kills", kills);',
    '  const total = count(msm.storage.get("total_kills")) + 1;',
    '  msm.storage.set("total_kills", total);',
    '  killer.sendMessage("Your kills: " + kills + ". Everyone\'s: " + total + ".");',
    '});',
  ]),
  script('start_counter', [
    IMPORT,
    '',
    '// server.started: counts the starts of this world in msm.storage, which is saved with the',
    '// world, so the count goes up by one on each start (the headless server check starts twice).',
    'msm.events.on("server.started", () => {',
    '  const before = msm.storage.get("starts");',
    '  const starts = (typeof before === "number" ? before : 0) + 1;',
    '  msm.storage.set("starts", starts);',
    '  msm.log.info("start counter: " + starts);',
    '});',
  ]),
  script('spark_handler', [
    IMPORT,
    'import { id } from "./util";',
    '',
    `// The action handler that the spark ore's run_script action calls (event ${ns('spark')}).`,
    `msm.actions.define("${ns('spark')}", (e) => {`,
    '  msm.log.info("action " + id("spark") + ": " + e.owner + " " + e.event + " at " + e.pos);',
    '  if (e.player !== undefined) {',
    '    e.player.give(id("spark_gem"), 1);',
    '  }',
    '});',
  ]),
  script('surge_handler', [
    IMPORT,
    '',
    `// The per-tick script of the ${ns('spark_surge')} effect: its msm:on_tick event runs this`,
    '// handler (run_script) every 40 ticks; self and other are the holder (ADR 0055 D5).',
    `msm.actions.define("${ns('surge')}", (e) => {`,
    '  if (e.other === undefined) return;',
    `  var level = e.other.effectLevel("${ns('spark_surge')}");`,
    '  msm.log.info("action surge: " + e.other.type + " at level " + level + ", health " + e.other.health);',
    '  if (e.other.health < e.other.maxHealth) {',
    '    e.other.heal(level);',
    '  }',
    '});',
  ]),
  // Script API 1.1 (ADR 0065): chat commands that start with "!" (each script handles its
  // own word; on_player_chat cancels them so nobody else sees them), a zombie that shows and
  // takes equipment, and one script per new event.
  script('on_player_chat', [
    IMPORT,
    '',
    '// player.chat: a message starting with "!" is a sample command. It is cancelled, so it is',
    '// not broadcast; the command scripts answer the sender only. "!help" lists them.',
    'const COMMANDS = ["!help", "!kit", "!train", "!title", "!clear", "!bar", "!bar who", "!bar off", "!look", "!smite", "!nether"];',
    'msm.events.on("player.chat", (e) => {',
    '  if (e.message.charAt(0) !== "!") return;',
    '  e.cancel();',
    '  msm.log.info("player.chat: " + e.player.name + " ran " + e.message);',
    '  if (e.message === "!help" || COMMANDS.indexOf(e.message) < 0) {',
    '    e.player.sendMessage("Sample commands: " + COMMANDS.join(", "));',
    '  }',
    '});',
  ]),
  script('kit_command', [
    IMPORT,
    '',
    '// "!kit": pays two diamonds for a named, worn diamond sword in slot 0, a golden helmet',
    '// and a shield (Player.inventory, item components), then reads them back.',
    'msm.events.on("player.chat", (e) => {',
    '  if (e.message !== "!kit") return;',
    '  const inv = e.player.inventory;',
    '  if (inv.count("minecraft:diamond") < 2) {',
    '    e.player.sendMessage("A kit costs two diamonds.");',
    '    return;',
    '  }',
    '  const paid = inv.remove("minecraft:diamond", 2);',
    '  inv.set(0, { id: "minecraft:diamond_sword", components: { "minecraft:custom_name": "Spark Blade" } });',
    '  inv.setComponent(0, "minecraft:damage", 7);',
    '  inv.set("head", "minecraft:golden_helmet");',
    '  inv.set("offhand", "minecraft:shield");',
    '  const blade = inv.get(0);',
    '  if (blade === undefined) return;',
    '  e.player.sendMessage("Kit: " + blade.name + " (" + (blade.maxDamage - blade.damage) + "/" + blade.maxDamage',
    '    + "), named " + JSON.stringify(blade.getComponent("minecraft:custom_name")) + "; paid " + paid',
    '    + " diamonds, " + inv.count("minecraft:diamond") + " left, the first in slot " + inv.find("minecraft:diamond") + ".");',
    '});',
  ]),
  script('train_command', [
    IMPORT,
    '',
    '// "!train": three levels and five points of experience, food 10 with saturation 2, and',
    '// adventure mode (the client is told each change; /gamemode survival switches back).',
    'msm.events.on("player.chat", (e) => {',
    '  if (e.message !== "!train") return;',
    '  const p = e.player;',
    '  p.addXpLevels(3);',
    '  p.addXp(5);',
    '  p.setFood(10, 2);',
    '  const changed = p.setGameMode("adventure");',
    '  p.sendMessage("Trained: level " + p.xpLevel + ", " + p.xpPoints + " points, food " + p.food + ", saturation "',
    '    + p.saturation + ", " + p.gameMode + (changed ? "" : " (unchanged)") + ".");',
    '});',
  ]),
  script('title_command', [
    IMPORT,
    '',
    '// "!title": a title with a subtitle and the action bar; "!clear" clears the title.',
    'msm.events.on("player.chat", (e) => {',
    '  if (e.message === "!title") {',
    '    e.player.showTitle("Spark!", { subtitle: "Sample script", fadeIn: 5, stay: 40, fadeOut: 10 });',
    '    e.player.showActionBar("Sparks: ready");',
    '  } else if (e.message === "!clear") {',
    '    e.player.clearTitle();',
    '  }',
    '});',
  ]),
  script('spark_bar', [
    IMPORT,
    '',
    '// "!bar": shows the spark charge boss bar and fills it by a quarter; "!bar who" names the',
    '// players who see it; "!bar off" hides it, and removes it when nobody sees it any more.',
    '// The runtime moves a respawned player onto the bars of the old one and takes a player',
    '// who leaves off every bar.',
    'var charge = 0;',
    'msm.events.on("player.chat", (e) => {',
    '  if (e.message === "!bar") {',
    '    let bar = msm.bossBars.get("spark_charge");',
    '    if (bar === undefined) {',
    '      bar = msm.bossBars.create("spark_charge", { title: "Spark charge", color: "yellow", style: "notched_10", progress: 0 });',
    '      charge = 0;',
    '    }',
    '    bar.addPlayer(e.player);',
    '    charge = Math.min(1, charge + 0.25);',
    '    bar.setProgress(charge);',
    '  } else if (e.message === "!bar who") {',
    '    const bar = msm.bossBars.get("spark_charge");',
    '    const names = bar === undefined ? [] : bar.players().map((p) => p.name).sort();',
    '    e.player.sendMessage("Spark charge: " + names.length + " player(s)" + (names.length > 0 ? ": " + names.join(", ") : "") + ".");',
    '  } else if (e.message === "!bar off") {',
    '    const bar = msm.bossBars.get("spark_charge");',
    '    if (bar === undefined) return;',
    '    bar.removePlayer(e.player);',
    '    if (bar.players().length === 0) {',
    '      bar.remove();',
    '      e.player.sendMessage("Spark charge removed.");',
    '    }',
    '  }',
    '});',
  ]),
  script('look_command', [
    IMPORT,
    '',
    '// "!look": what the player looks at within 16 blocks (Entity.raycast from the eyes).',
    'function round1(n: number): number {',
    '  return Math.round(n * 10) / 10;',
    '}',
    'msm.events.on("player.chat", (e) => {',
    '  if (e.message !== "!look") return;',
    '  const hit = e.player.raycast(16);',
    '  if (hit === undefined) {',
    '    e.player.sendMessage("You look at nothing within 16 blocks.");',
    '  } else if (hit.entity !== undefined) {',
    '    e.player.sendMessage("You look at " + hit.entity.type + ", " + round1(hit.distance) + " blocks away.");',
    '  } else if (hit.block !== undefined) {',
    '    e.player.sendMessage("You look at " + hit.block.id + " (" + hit.face + " face), " + round1(hit.distance) + " blocks away.");',
    '  }',
    '});',
  ]),
  script('smite_command', [
    IMPORT,
    '',
    '// "!smite": magic damage with the player as the attacker to the mob the player looks at,',
    "// so the kill counts as the player's (drops that need a player kill, the kill counter).",
    'msm.events.on("player.chat", (e) => {',
    '  if (e.message !== "!smite") return;',
    '  const hit = e.player.raycast(16);',
    '  if (hit === undefined || hit.entity === undefined) {',
    '    e.player.sendMessage("Nothing to smite.");',
    '    return;',
    '  }',
    '  const target = hit.entity;',
    '  const type = target.type;',
    '  target.damage(1000, { type: "minecraft:magic", attacker: e.player });',
    '  e.player.sendMessage("Smitten: " + type + (target.isAlive ? " survived." : " fell."));',
    '});',
  ]),
  script('nether_command', [
    IMPORT,
    '',
    '// "!nether": builds a small obsidian room in the Nether at the matching coordinates and',
    '// teleports the player there with every cow within 4 blocks. The wrappers stay usable',
    '// after the move.',
    'msm.events.on("player.chat", (e) => {',
    '  if (e.message !== "!nether") return;',
    '  const p = e.player;',
    '  const nether = msm.getWorld("minecraft:the_nether");',
    '  if (nether === undefined || p.world.dimension === "minecraft:the_nether") return;',
    '  const cows = e.world.entitiesNear(p.pos, 4).filter((n) => n.type === "minecraft:cow");',
    '  const origin = p.pos.offset(-p.pos.x, -p.pos.y, -p.pos.z);',
    '  const x = Math.floor(p.pos.x / 8);',
    '  const z = Math.floor(p.pos.z / 8);',
    '  for (let dx = -1; dx <= 1; dx++) {',
    '    for (let dz = -1; dz <= 1; dz++) {',
    '      nether.setBlock(origin.offset(x + dx, 63, z + dz), "minecraft:obsidian");',
    '      for (let dy = 0; dy < 3; dy++) nether.setBlock(origin.offset(x + dx, 64 + dy, z + dz), "minecraft:air");',
    '    }',
    '  }',
    '  p.teleport(origin.offset(x + 0.5, 64, z + 0.5), { dimension: "minecraft:the_nether" });',
    '  for (const cow of cows) cow.teleport(origin.offset(x + 1.5, 64, z + 0.5), { dimension: "minecraft:the_nether" });',
    '  p.sendMessage("Now in " + p.world.dimension + (cows.length > 0 ? " with " + cows.length',
    '    + " cow(s), the first now in " + cows[0].world.dimension : "") + ".");',
    '});',
  ]),
  script('crown_zombie', [
    IMPORT,
    '',
    '// entity.interact on a zombie: tells the player what it holds and puts a golden helmet on',
    '// it when its head is bare (Entity.equipment and setEquipment).',
    'msm.events.on("entity.interact", (e) => {',
    '  if (e.hand !== "main" || e.entity.type !== "minecraft:zombie") return;',
    '  const held = e.entity.equipment("mainhand");',
    '  const head = e.entity.equipment("head");',
    '  if (head === undefined) e.entity.setEquipment("head", "minecraft:golden_helmet");',
    '  e.player.sendMessage("This zombie holds " + (held === undefined ? "nothing" : held.id) + " and wears "',
    '    + (head === undefined ? "a new golden helmet" : head.id) + ".");',
    '});',
  ]),
  script('on_player_tick', [
    IMPORT,
    '',
    '// player.tick every 20 ticks: a player who wears a golden helmet gets Luck for 5 seconds',
    '// (a full set bonus without a server.tick loop).',
    'msm.events.on("player.tick", (e) => {',
    '  const head = e.player.inventory.get("head");',
    '  if (head === undefined || head.id !== "minecraft:golden_helmet" || e.player.hasEffect("minecraft:luck")) return;',
    '  e.player.addEffect("minecraft:luck", 100);',
    '  msm.log.info("player.tick: " + e.player.name + " wears a golden helmet: luck for 5 seconds");',
    '}, { interval: 20 });',
  ]),
  script('on_player_respawn', [
    IMPORT,
    '',
    '// player.respawn: greets the player after a respawn.',
    'msm.events.on("player.respawn", (e) => {',
    '  e.player.sendMessage("Welcome back, " + e.player.name + ".");',
    '  msm.log.info("player.respawn: " + e.player.name + " in " + e.world.dimension);',
    '});',
  ]),
  script('on_player_leave', [
    IMPORT,
    '',
    '// player.leave: tells everyone else.',
    'msm.events.on("player.leave", (e) => {',
    '  msm.log.info("player.leave: " + e.player.name);',
    '  for (const other of msm.players()) {',
    '    if (other.uuid !== e.player.uuid) other.sendMessage(e.player.name + " has left.");',
    '  }',
    '});',
  ]),
  script('on_player_change_dimension', [
    IMPORT,
    '',
    '// player.changeDimension: tells the player where they came from and went to.',
    'msm.events.on("player.changeDimension", (e) => {',
    '  e.player.sendMessage("You went from " + e.from + " to " + e.to + ".");',
    '  msm.log.info("player.changeDimension: " + e.player.name + " " + e.from + " -> " + e.to);',
    '});',
  ]),
  script('on_entity_damaged', [
    IMPORT,
    '',
    '// entity.damaged: after armour and other reductions; tells the attacking player the',
    '// damage actually taken.',
    'function round2(n: number): number {',
    '  return Math.round(n * 100) / 100;',
    '}',
    'msm.events.on("entity.damaged", (e) => {',
    '  const attacker = e.attacker?.asPlayer();',
    '  if (attacker === undefined || e.entity.isPlayer) return;',
    '  attacker.sendMessage(e.entity.type + " took " + round2(e.amount) + " damage (" + e.source + "), "',
    '    + round2(e.entity.health) + " health left.");',
    '  msm.log.info("entity.damaged: " + e.entity.type + " took " + e.amount + " from " + attacker.name);',
    '});',
  ]),
];

/** The mod, a block and an item from the sample mod (renamed), and the scripts. */
const SAMPLE_ELEMENTS: readonly SampleElement[] = [
  {
    id: ns('mod'),
    kind: 'msm:mod',
    data: {
      mod_id: NAMESPACE,
      version: '1.0.0',
      name: PROJECT_NAME,
      description: 'Scripting sample: one script per game event, an action handler and require.',
      authors: ['MCSuperMods'],
      licence: 'MIT',
    },
  },
  {
    id: ns('spark_ore'),
    kind: 'msm:block',
    data: {
      format: 1,
      model: 'minecraft:block/redstone_ore',
      display_name: 'Spark Ore',
      loot: 'self',
      sound_type: 'stone',
      item: { creative_tab: 'minecraft:natural_blocks', max_stack_size: 64, rarity: 'common' },
      components: {
        'msm:breakable': { hardness: 3, resistance: 3, tool: 'pickaxe', min_tier: 'iron' },
        'msm:light_emitter': { level: 7 },
        'msm:on_interact': { event: ns('spark') },
      },
      events: {
        [ns('spark')]: {
          actions: [
            { type: 'play_sound', sound: 'minecraft:block.amethyst_block.chime', volume: 1 },
            { type: 'run_script', handler: ns('spark') },
          ],
        },
      },
    },
  },
  {
    // A plain block whose use the on_block_interact script cancels (ADR 0058 D3).
    id: ns('warded_stone'),
    kind: 'msm:block',
    data: {
      format: 1,
      model: 'minecraft:block/obsidian',
      display_name: 'Warded Stone',
      loot: 'self',
      sound_type: 'stone',
      item: { creative_tab: 'minecraft:building_blocks', max_stack_size: 64, rarity: 'common' },
      components: {
        'msm:breakable': { hardness: 2, resistance: 6, tool: 'pickaxe', min_tier: 'wood' },
      },
    },
  },
  {
    id: ns('spark_gem'),
    kind: 'msm:item',
    data: {
      format: 1,
      model: 'minecraft:item/emerald',
      display_name: 'Spark Gem',
      max_stack_size: 64,
      rarity: 'uncommon',
      creative_tab: 'minecraft:ingredients',
    },
  },
  {
    id: ns('spark_surge'),
    kind: 'msm:effect',
    data: {
      format: 1,
      display_name: 'Spark Surge',
      category: 'beneficial',
      color: 0x55ffff,
      components: { 'msm:on_tick': { event: ns('surge'), interval_ticks: 40 } },
      events: { [ns('surge')]: { actions: [{ type: 'run_script', handler: ns('surge') }] } },
    },
  },
  ...SCRIPTS,
];

const EXPECTED_BLOCKS = SAMPLE_ELEMENTS.filter((entry) => entry.kind === 'msm:block');
const EXPECTED_ITEM_COUNT =
  EXPECTED_BLOCKS.filter((entry) => (entry.data as { item?: Json }).item !== false).length +
  SAMPLE_ELEMENTS.filter((entry) => entry.kind === 'msm:item').length;
const scriptPathOf = (entry: SampleElement): string =>
  `msm/${NAMESPACE}/script/${entry.id.split(':')[1]}.js`;

/** Builds the sample into a project the way the app's `newProject` does, then saves it. */
async function buildSample(): Promise<MemoryFileSystem> {
  const project = createEmptyProject(PROJECT_NAME, {
    targets: [defaultTarget().target.id],
    plugins: PLUGINS.filter((plugin) => (plugin.contributes.elementKinds ?? []).length > 0).map(
      (plugin) => plugin.id,
    ),
  });
  const namespace = { name: NAMESPACE, elements: [] as Element[], assets: [] };
  for (const entry of SAMPLE_ELEMENTS) {
    namespace.elements.push(
      createElement({
        id: entry.id as Element['id'],
        kind: entry.kind,
        data: structuredClone(entry.data),
        now: () => NOW,
      }),
    );
  }
  project.namespaces.push(namespace);
  const fs = createMemoryFileSystem();
  await saveProject(fs, project, registry);
  return fs;
}

const resolvePath = (path: string): string => join(sampleRoot, ...path.split('/'));
const readOnly = async (): Promise<never> => {
  throw new Error('The sample project is read-only in tests.');
};

/** A read-only file system over the fixture directory. */
const sampleFs: ProjectFileSystem = {
  readFile: async (path) => new Uint8Array(await readFile(resolvePath(path))),
  async readDir(path) {
    const entries = await readdir(resolvePath(path), { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() || entry.isDirectory())
      .map(
        (entry): DirEntry => ({
          name: entry.name,
          kind: entry.isDirectory() ? 'directory' : 'file',
        }),
      );
  },
  async exists(path) {
    try {
      await stat(resolvePath(path));
      return true;
    } catch {
      return false;
    }
  },
  writeFile: readOnly,
  mkdirp: readOnly,
  remove: readOnly,
};

async function listFiles(root: string, prefix = ''): Promise<string[]> {
  let entries: import('node:fs').Dirent[];
  try {
    entries = await readdir(join(root, prefix), { withFileTypes: true });
  } catch {
    return [];
  }
  const out: string[] = [];
  for (const entry of entries) {
    const path = prefix === '' ? entry.name : `${prefix}/${entry.name}`;
    if (entry.isDirectory()) out.push(...(await listFiles(root, path)));
    else if (entry.isFile()) out.push(path);
  }
  return out.sort();
}

async function loadSample(): Promise<Project> {
  const { project, problems } = await loadProject(sampleFs, registry);
  expect(problems).toEqual([]);
  return project;
}

const elementsOf = (project: Project): Element[] =>
  project.namespaces.flatMap((namespace) => namespace.elements);

// Registries and checkers -------------------------------------------------------------------

/** The project's own ids per registry; a block with an item is an item id too. */
function projectIds(project: Project): Record<string, string[]> {
  const ids: Record<string, string[]> = {};
  const add = (name: string, id: string): void => {
    ids[name] = [...(ids[name] ?? []), id];
  };
  for (const element of elementsOf(project)) {
    const name = registry.get(element.kind)?.registry;
    if (name === undefined) continue;
    add(name, element.id);
    if (element.kind === 'msm:block' && (element.data as { item?: Json }).item !== false) {
      add('item', element.id);
    }
  }
  for (const [name, list] of Object.entries(ids)) ids[name] = [...new Set(list)].sort();
  return ids;
}

const nodeReadFile = async (url: URL): Promise<Uint8Array> => readFile(url);

interface TargetContext {
  schemaIndex: SchemaIndex;
  registries: RegistryIndex;
}

async function contextFor(bundle: TargetBundle, project: Project): Promise<TargetContext> {
  const read = (key: Parameters<typeof readVendoredJson>[1]) =>
    readVendoredJson(bundle, key, nodeReadFile);
  const [symbols, vanilla] = await Promise.all([
    read('vanillaMcdocSymbols'),
    read('mcmetaRegistries'),
  ]);
  return {
    schemaIndex: createSchemaIndex(parseVanillaMcdocSymbols(symbols), {
      mcVersion: bundle.target.mcVersion,
    }),
    registries: createRegistryIndex({
      vanilla: vanilla as Record<string, string[]>,
      project: projectIds(project),
    }),
  };
}

const sha256 = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');

/** Runs `body` with `process.env.TZ` set to `zone`, restoring the previous value after. */
async function inTimeZone<T>(zone: string, body: () => Promise<T>): Promise<T> {
  const previous = process.env.TZ;
  process.env.TZ = zone;
  try {
    return await body();
  } finally {
    if (previous === undefined) delete process.env.TZ;
    else process.env.TZ = previous;
  }
}

/** The `version` of the `fabric.mod.json` inside a mod jar. */
function jarModVersion(jar: Uint8Array): string {
  const files = unzipSync(jar, { filter: (file) => file.name === 'fabric.mod.json' });
  const modJson = files['fabric.mod.json'];
  if (modJson === undefined) throw new Error('The runtime jar has no fabric.mod.json');
  const version = (JSON.parse(utf8.decode(modJson)) as { version?: unknown }).version;
  if (typeof version !== 'string') throw new Error('The runtime fabric.mod.json has no version');
  return version;
}

/**
 * Type-checks every script together (so `./util` resolves) against the generated typings
 * with `lib.es5` only, as `library.test.ts` checks the library's scripts.
 */
function typeCheckScripts(scripts: readonly SampleElement[]): string[] {
  const libDir = dirname(createRequire(import.meta.url).resolve('typescript/lib/lib.es5.d.ts'));
  const files = new Map<string, string>([['/msm-runtime.d.ts', MSM_RUNTIME_TYPINGS]]);
  for (const entry of scripts) {
    files.set(
      `/script/${entry.id.split(':')[1]}.ts`,
      `${(entry.data as { lines: string[] }).lines.join('\n')}\n`,
    );
  }
  const options: ts.CompilerOptions = {
    strict: true,
    noEmit: true,
    target: ts.ScriptTarget.ES2018,
    module: ts.ModuleKind.CommonJS,
    lib: ['lib.es5.d.ts'],
    types: [],
  };
  const host = ts.createCompilerHost(options);
  host.getDefaultLibLocation = () => libDir;
  host.getSourceFile = (fileName, languageVersion) => {
    const text =
      files.get(fileName) ?? readFileSync(join(libDir, fileName.split('/').pop() ?? ''), 'utf8');
    return ts.createSourceFile(fileName, text, languageVersion);
  };
  host.fileExists = (fileName) => files.has(fileName) || fileName.startsWith(libDir);
  host.directoryExists = (name) => name === '/' || name === '/script' || name.startsWith(libDir);
  host.readFile = (fileName) => files.get(fileName);
  const program = ts.createProgram([...files.keys()], options, host);
  return ts.getPreEmitDiagnostics(program).map((d) => {
    const where = d.file === undefined ? '' : `${d.file.fileName}: `;
    return `${where}${ts.flattenDiagnosticMessageText(d.messageText, '\n')}`;
  });
}

/** Tokens TypeScript's ES5 output never contains; Rhino 1.9.2 does not parse some of them. */
const NOT_ES5 = new Map<ts.SyntaxKind, string>([
  [ts.SyntaxKind.ClassKeyword, 'class'],
  [ts.SyntaxKind.AsyncKeyword, 'async'],
  [ts.SyntaxKind.AwaitKeyword, 'await'],
  [ts.SyntaxKind.LetKeyword, 'let'],
  [ts.SyntaxKind.ConstKeyword, 'const'],
  [ts.SyntaxKind.EqualsGreaterThanToken, '=>'],
  [ts.SyntaxKind.NoSubstitutionTemplateLiteral, 'template literal'],
  [ts.SyntaxKind.TemplateHead, 'template literal'],
]);

/** Tokens that end a `for...of` binding (`x`, `[a, b]`, `{ a }`). */
const AFTER_BINDING = new Set([
  ts.SyntaxKind.Identifier,
  ts.SyntaxKind.CloseBracketToken,
  ts.SyntaxKind.CloseBraceToken,
]);

/**
 * The ES5 problems of a transpiled script: parse errors as ES5, the tokens of {@link NOT_ES5},
 * and `for (... of ...)` (an `of` keyword inside a `for` header), found with the scanner.
 */
function es5Problems(js: string): string[] {
  const problems: string[] = [];
  const file = ts.createSourceFile('script.js', js, ts.ScriptTarget.ES5, true, ts.ScriptKind.JS);
  for (const diagnostic of (file as unknown as { parseDiagnostics: ts.Diagnostic[] })
    .parseDiagnostics) {
    problems.push(`parse: ${ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')}`);
  }
  const scanner = ts.createScanner(ts.ScriptTarget.ES5, true, ts.LanguageVariant.Standard, js);
  let forDepth = -1;
  let depth = 0;
  let previous = ts.SyntaxKind.Unknown;
  for (let token = scanner.scan(); token !== ts.SyntaxKind.EndOfFileToken; token = scanner.scan()) {
    const name = NOT_ES5.get(token);
    if (name !== undefined) problems.push(`${name} at ${scanner.getTokenStart()}`);
    if (token === ts.SyntaxKind.OpenParenToken) {
      if (previous === ts.SyntaxKind.ForKeyword && forDepth < 0) forDepth = depth;
      depth++;
    } else if (token === ts.SyntaxKind.CloseParenToken) {
      depth--;
      if (depth === forDepth) forDepth = -1;
    } else if (
      token === ts.SyntaxKind.OfKeyword &&
      forDepth >= 0 &&
      depth === forDepth + 1 &&
      AFTER_BINDING.has(previous)
    ) {
      problems.push(`for...of at ${scanner.getTokenStart()}`);
    }
    previous = token;
  }
  return problems;
}

// Tests -------------------------------------------------------------------------------------

describe('sample script project', () => {
  it('equals SAMPLE_ELEMENTS saved as a project', async () => {
    const generated = (await buildSample()).snapshot();
    if (update) {
      for (const path of await listFiles(sampleRoot)) {
        if (!HAND_WRITTEN.has(path)) await rm(join(sampleRoot, ...path.split('/')));
      }
      await rm(join(sampleRoot, 'content'), { recursive: true, force: true });
      for (const [path, bytes] of Object.entries(generated)) {
        const file = join(sampleRoot, ...path.split('/'));
        await mkdir(dirname(file), { recursive: true });
        await writeFile(file, bytes);
      }
    }
    const onDisk = (await listFiles(sampleRoot)).filter((path) => !HAND_WRITTEN.has(path));
    expect(onDisk).toEqual(Object.keys(generated).sort());
    for (const [path, bytes] of Object.entries(generated)) {
      const file = new Uint8Array(await readFile(join(sampleRoot, ...path.split('/'))));
      expect(Buffer.from(file).equals(Buffer.from(bytes)), path).toBe(true);
    }
  });

  it('has one script per game event, an action handler and a require between scripts', async () => {
    const project = await loadSample();
    expect(project.name).toBe(PROJECT_NAME);
    const scripts = elementsOf(project).filter((element) => element.kind === 'msm:script');
    expect(scripts.length).toBe(SCRIPTS.length);
    const sourceOf = (element: Element): string =>
      (element.data as { lines: string[] }).lines.join('\n');
    const text = scripts.map(sourceOf);
    // One `on_<event>` script per event; the saved data scripts handle two events again.
    const perEvent = scripts.filter((element) => element.id.startsWith(ns('on_'))).map(sourceOf);
    for (const event of [
      'block.interact',
      'block.break',
      'item.use',
      'entity.interact',
      'entity.hurt',
      'entity.death',
      'player.join',
      'server.started',
      'server.tick',
      // Script API 1.1 (ADR 0065 D8).
      'player.tick',
      'player.respawn',
      'player.leave',
      'player.changeDimension',
      'player.chat',
      'entity.damaged',
    ]) {
      const handlers = perEvent.filter((source) => source.includes(`msm.events.on("${event}"`));
      expect(handlers.length, event).toBe(1);
      expect(handlers[0]?.includes('msm.log.info('), event).toBe(true);
    }
    const saved = (path: string): string =>
      sourceOf(scripts.find((element) => element.id === ns(path)) as Element);
    expect(saved('kill_counter')).toContain('killer.data.set("kills"');
    expect(saved('kill_counter')).toContain('msm.storage.set("total_kills"');
    expect(saved('start_counter')).toContain('msm.storage.set("starts"');
    expect(text.filter((source) => source.includes('msm.actions.define(')).length).toBe(2);
    expect(text.filter((source) => source.includes('from "./util"')).length).toBe(2);
    const blockData = JSON.stringify(
      elementsOf(project).find((element) => element.kind === 'msm:block')?.data,
    );
    expect(blockData).toContain(`{"handler":"${ns('spark')}","type":"run_script"}`);
    const effectData = JSON.stringify(
      elementsOf(project).find((element) => element.kind === 'msm:effect')?.data,
    );
    expect(effectData).toContain(`"msm:on_tick":{"event":"${ns('surge')}"`);
    expect(effectData).toContain(`{"handler":"${ns('surge')}","type":"run_script"}`);
  });

  it('parses and type-checks every script against the typings', () => {
    expect(typeCheckScripts(SCRIPTS)).toEqual([]);
  });
});

describe.each(builtInTargets.map((bundle) => [bundle.target.id, bundle] as const))(
  'sample script export (%s)',
  (_id, bundle) => {
    const { target } = bundle;
    let context: TargetContext;

    beforeAll(async () => {
      context = await contextFor(bundle, await loadSample());
    }, 120_000);

    async function exportJar(
      factory: FabricContentJarOptions = { loadRuntimeJar: async () => stubRuntimeJar },
      exportTarget: Target = target,
    ): Promise<Uint8Array> {
      const sink = createZipSink();
      const report = await runExport({
        project: await loadSample(),
        registry,
        target: exportTarget,
        schemaIndex: context.schemaIndex,
        registries: context.registries,
        exporter: createFabricContentJarExporter({
          ...factory,
          transpileScript: async (source, name) => typescriptTranspile(source, name),
        }),
        sink,
        readAsset: (namespace, path) => sampleFs.readFile(`assets/${namespace}/${path}`),
        meta,
        validateText: async () => [],
      });
      expect(report.problems.filter((problem) => problem.severity !== 'info')).toEqual([]);
      expect(report.ok).toBe(true);
      return sink.finish();
    }

    it('validates every element with zero problems', async () => {
      const problems: string[] = [];
      for (const element of elementsOf(await loadSample())) {
        const kind = registry.get(element.kind);
        if (kind === undefined) throw new Error(`unknown kind ${element.kind}`);
        const hidden = kind.hiddenPaths ?? [];
        const node = context.schemaIndex.resolveSchemaRef(kind.schema);
        for (const problem of validateJson(element.data, node, {
          registries: context.registries,
        })) {
          if (hidden.some((path) => problem.path === path || problem.path.startsWith(`${path}/`))) {
            continue;
          }
          problems.push(`${element.id} ${problem.path} ${problem.code}: ${problem.message}`);
        }
      }
      expect(problems).toEqual([]);
    });

    it('passes every project validator with no problems at all', async () => {
      const elements = elementsOf(await loadSample());
      const found = (
        await Promise.all(
          VALIDATORS.map((validator) =>
            validator.validate({ elements, target, registry: context.registries }),
          ),
        )
      ).flat();
      expect(found).toEqual([]);
    });

    it('holds the definitions and every script as ES5 JavaScript', async () => {
      const files = unzipSync(await exportJar());
      const paths = Object.keys(files).sort();
      expect(paths.filter((path) => path.startsWith('msm/'))).toEqual(
        [
          `msm/${NAMESPACE}/block/spark_ore.json`,
          `msm/${NAMESPACE}/block/warded_stone.json`,
          `msm/${NAMESPACE}/item/spark_gem.json`,
          `msm/${NAMESPACE}/effect/spark_surge.json`,
          ...SCRIPTS.map(scriptPathOf),
        ].sort(),
      );
      expect(paths.filter((path) => path.endsWith('.ts'))).toEqual([]);
      expect(paths.filter((path) => path.startsWith('META-INF/jars/'))).toEqual([
        `META-INF/jars/msm_runtime-${meta.msmVersion}.jar`,
      ]);
      for (const entry of SCRIPTS) {
        const js = utf8.decode(files[scriptPathOf(entry)] as Uint8Array);
        expect(es5Problems(js), scriptPathOf(entry)).toEqual([]);
        expect(js, scriptPathOf(entry)).toContain('require("msm:runtime")');
      }
      for (const name of ['on_server_started', 'spark_handler']) {
        const js = utf8.decode(files[`msm/${NAMESPACE}/script/${name}.js`] as Uint8Array);
        expect(js, name).toContain('require("./util")');
      }

      const problems: string[] = [];
      for (const [path, ref] of [
        [`msm/${NAMESPACE}/block/spark_ore.json`, MSM_SCHEMA_REFS.blockDefinition],
        [`msm/${NAMESPACE}/block/warded_stone.json`, MSM_SCHEMA_REFS.blockDefinition],
        [`msm/${NAMESPACE}/item/spark_gem.json`, MSM_SCHEMA_REFS.itemDefinition],
        [`msm/${NAMESPACE}/effect/spark_surge.json`, MSM_SCHEMA_REFS.effectDefinition],
      ] as const) {
        const value = JSON.parse(utf8.decode(files[path] as Uint8Array)) as Json;
        for (const problem of validateJson(value, context.schemaIndex.resolveSchemaRef(ref), {
          registries: context.registries,
        })) {
          problems.push(`${path} ${problem.path} ${problem.code}: ${problem.message}`);
        }
      }
      expect(problems).toEqual([]);

      const modJson = JSON.parse(utf8.decode(files['fabric.mod.json'] as Uint8Array)) as {
        id: string;
        depends: Record<string, string>;
      };
      expect(modJson.id).toBe(NAMESPACE);
      expect(modJson.depends.msm_runtime).toBe(`>=${meta.msmVersion}`);
      expect(modJson.depends.msm_runtime).toBe(`>=${SCRIPT_RUNTIME_MINIMUM}`);
    });

    it('rejects an ES5 problem in the scanner check (self-test)', () => {
      expect(es5Problems('for (var x of y) {}\nclass A {}\nvar f = () => 1;')).toEqual([
        'for...of at 11',
        'class at 20',
        '=> at 42',
      ]);
      expect(es5Problems('for (var i = 0; i < of.length; i++) {}')).toEqual([]);
    });

    describe('content jar', () => {
      const hashFile = join(fixturesRoot, target.id, 'sample-script-jar.sha256');
      const savedZone = process.env.TZ;
      afterAll(() => {
        expect(process.env.TZ).toBe(savedZone);
      });

      it('has the recorded SHA-256 in two time zones', async () => {
        const offsets: number[] = [];
        const hashes: string[] = [];
        for (const zone of TIME_ZONES) {
          await inTimeZone(zone, async () => {
            offsets.push(new Date(2000, 0, 1).getTimezoneOffset());
            hashes.push(sha256(await exportJar()));
          });
        }
        expect(new Set(offsets).size).toBe(TIME_ZONES.length);
        expect(new Set(hashes).size).toBe(1);
        const actual = hashes[0] as string;
        if (update) {
          await mkdir(dirname(hashFile), { recursive: true });
          await writeFile(hashFile, `${actual}\n`);
        }
        const expected = (await readFile(hashFile, 'utf8')).trim();
        expect(actual).toBe(expected);
      });
    });

    const runtimeJarPath = process.env.MSM_RUNTIME_JAR;
    const outDir = process.env.MSM_SAMPLE_SCRIPT_OUT;
    const isSelectedTarget = bundle === selectedTarget();
    it.runIf(runtimeJarPath !== undefined && outDir !== undefined && isSelectedTarget)(
      'writes the jar with the real runtime for the headless server check',
      async () => {
        const runtimeJar = new Uint8Array(await readFile(runtimeJarPath as string));
        const runtimeVersion = jarModVersion(runtimeJar);
        const jar = await exportJar({ loadRuntimeJar: async () => runtimeJar, runtimeVersion });
        const fabric = target.fabric;
        if (fabric === undefined) throw new Error(`${target.id} has no Fabric facts`);
        await mkdir(outDir as string, { recursive: true });
        await writeFile(join(outDir as string, `${NAMESPACE}.jar`), jar);
        const facts = {
          expectBlocks: EXPECTED_BLOCKS.length,
          expectEntities: 0,
          expectItems: EXPECTED_ITEM_COUNT,
          expectScripts: SCRIPTS.length,
          fabricApi: fabric.api,
          java: target.java,
          loader: fabric.loader,
          minecraft: target.mcVersion,
          runtimeVersion,
        };
        await writeFile(
          join(outDir as string, 'fabric-facts.json'),
          `${JSON.stringify(facts, null, 2)}\n`,
        );
        expect(unzipSync(jar)[`META-INF/jars/msm_runtime-${runtimeVersion}.jar`]).toEqual(
          runtimeJar,
        );
      },
    );
  },
);
