/**
 * The generated typings: `api/msm-runtime.d.ts` equals `generateTypings(SCRIPT_API)` (set
 * `UPDATE_GOLDENS=1` to rewrite it), parses, declares every event, and type-checks scripts
 * that use the global and the `msm:runtime` module.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import raw from '../api/script-api-v1.json' with { type: 'json' };
import {
  checkScriptApi,
  generateTypings,
  MSM_RUNTIME_TYPINGS,
  parseScriptApi,
  SCRIPT_API,
  ScriptApiError,
} from '../src/index';
import { typeCheck } from './support';

const UPDATE = process.env.UPDATE_GOLDENS === '1';
const GOLDEN = new URL('../api/msm-runtime.d.ts', import.meta.url);

describe('script API v1', () => {
  it('parses the JSON and is consistent', () => {
    expect(SCRIPT_API.version).toBe(1);
    expect(checkScriptApi(SCRIPT_API)).toEqual([]);
    expect(Object.keys(SCRIPT_API.events)).toEqual([
      'block.interact',
      'block.break',
      'item.use',
      'entity.interact',
      'entity.hurt',
      'entity.death',
      'player.join',
      'server.started',
      'server.tick',
    ]);
  });

  it('documents every member', () => {
    const text = JSON.stringify(raw);
    expect(text).not.toContain('"doc":""');
    // parseScriptApi requires a doc on every type, member, global, event and overload.
    expect(() => parseScriptApi(raw)).not.toThrow();
  });

  it('rejects malformed descriptions', () => {
    expect(() => parseScriptApi({ ...raw, extra: 1 })).toThrow(ScriptApiError);
    expect(() =>
      parseScriptApi({ ...raw, types: { Pos: { doc: 'x', members: { x: { kind: 'field' } } } } }),
    ).toThrow(/api\.types\.Pos\.members\.x/);
    expect(() =>
      parseScriptApi({
        ...raw,
        functions: { require: { kind: 'property', type: 'any', doc: 'x' } },
      }),
    ).toThrow(/api\.functions\.require\.kind/);
  });

  it('declares require as a global free function', () => {
    expect(Object.keys(SCRIPT_API.functions ?? {})).toEqual(['require']);
    expect(MSM_RUNTIME_TYPINGS).toContain('declare function require(id: string): any;');
    const { functions: _omitted, ...withoutFunctions } = SCRIPT_API;
    expect(generateTypings(withoutFunctions)).not.toContain('declare function');
  });

  it('reports inconsistencies', () => {
    const broken = structuredClone(SCRIPT_API);
    broken.events['block.fly'] = {
      type: 'Nowhere',
      cancellable: true,
      source: 'none',
      doc: 'Never runs.',
    };
    expect(checkScriptApi(broken)).toEqual([
      'Event block.fly has unknown type Nowhere.',
      'Event block.fly has no on overload.',
      'Event block.fly: cancellable is true but Nowhere disagrees.',
    ]);
  });
});

describe('msm-runtime.d.ts', () => {
  it('equals the generated typings', () => {
    const generated = generateTypings(SCRIPT_API);
    expect(generated).toBe(MSM_RUNTIME_TYPINGS);
    expect(generateTypings(SCRIPT_API)).toBe(generated);
    if (UPDATE) writeFileSync(GOLDEN, generated);
    expect(readFileSync(GOLDEN, 'utf8')).toBe(generated);
    expect(generated.endsWith('\n')).toBe(true);
    expect(generated).not.toContain('\r');
  });

  it('parses without diagnostics and declares every event', () => {
    const source = ts.createSourceFile(
      'msm-runtime.d.ts',
      MSM_RUNTIME_TYPINGS,
      ts.ScriptTarget.Latest,
      true,
    );
    const diagnostics = (source as unknown as { parseDiagnostics: ts.Diagnostic[] })
      .parseDiagnostics;
    expect(diagnostics).toEqual([]);
    for (const [name, event] of Object.entries(SCRIPT_API.events)) {
      expect(MSM_RUNTIME_TYPINGS).toContain(
        `on(name: "${name}", handler: (e: ${event.type}) => void): void;`,
      );
    }
    expect(MSM_RUNTIME_TYPINGS).toContain('declare const msm: Msm;');
    expect(MSM_RUNTIME_TYPINGS).toContain('declare module "msm:runtime" {');
  });

  it('type-checks scripts with and without the import', () => {
    const global = [
      'msm.events.on("block.interact", (e) => {',
      '  if (e.block.id !== "mymod:glow_ore") return;',
      '  e.world.setBlock(e.block.pos.offset(0, 1, 0), "minecraft:glowstone");',
      '  e.player.give("minecraft:glowstone_dust", 2);',
      '  e.cancel();',
      '});',
      'msm.events.on("entity.hurt", (e) => { const a = e.attacker; if (a) a.asPlayer()?.sendMessage("Ouch"); });',
      'msm.actions.define("mymod:glow", (e) => { msm.log.info(e.owner + " " + e.pos.toString()); });',
      'msm.schedule(20, () => msm.log.warn(msm.version));',
    ].join('\n');
    expect(typeCheck(global)).toEqual([]);
    const imported = [
      'import { msm, type Player, type Pos } from "msm:runtime";',
      'const greet = (p: Player, at: Pos): void => p.sendMessage(String(at.x));',
      'msm.events.on("player.join", (e) => greet(e.player, e.player.pos));',
      'export {};',
    ].join('\n');
    expect(typeCheck(imported)).toEqual([]);
  });

  it('type-checks the effect members and ActionEvent.other', () => {
    const src = [
      'msm.actions.define("mymod:zap", (e) => {',
      '  const o = e.other;',
      '  if (o && o.hasEffect("mymod:burning")) { const n: number = o.effectLevel("mymod:burning"); const r: boolean = o.removeEffect("mymod:burning"); msm.log.info(String(n) + String(r)); }',
      '});',
    ].join('\n');
    expect(typeCheck(src)).toEqual([]);
    expect(typeCheck('msm.actions.define("a:b", (e) => { e.other.hasEffect("x"); });')).not.toEqual(
      [],
    );
  });

  it('declares persistent script data (ADR 0062 D1)', () => {
    expect(Object.keys(SCRIPT_API.types.DataStore?.members ?? {}).sort()).toEqual([
      'get',
      'has',
      'keys',
      'remove',
      'set',
    ]);
    expect(SCRIPT_API.types.Entity?.members.data).toMatchObject({
      kind: 'property',
      type: 'DataStore',
    });
    expect(SCRIPT_API.globals.msm?.members.storage).toMatchObject({
      kind: 'property',
      type: 'DataStore',
    });
    // The limits of D4 are in the doc strings the editor shows.
    expect(SCRIPT_API.types.Entity?.members.data?.doc).toContain('16 KiB');
    expect(SCRIPT_API.globals.msm?.members.storage?.doc).toContain('1 MiB');
    expect(MSM_RUNTIME_TYPINGS).toContain('get(key: string): unknown;');
    expect(MSM_RUNTIME_TYPINGS).toContain('set(key: string, value: unknown): void;');
    expect(MSM_RUNTIME_TYPINGS).toContain('readonly storage: DataStore;');
    expect(MSM_RUNTIME_TYPINGS).toContain('readonly data: DataStore;');
  });

  it('type-checks entity, player and world data', () => {
    const src = [
      'msm.events.on("player.join", (e) => {',
      '  const visits = e.player.data.get("visits");',
      '  const n = typeof visits === "number" ? visits + 1 : 1;',
      '  e.player.data.set("visits", n);',
      '  e.player.data.set("last", { at: [e.player.pos.x, e.player.pos.z], name: e.player.name, tag: null });',
      '  const total = msm.storage.get("joins");',
      '  msm.storage.set("joins", typeof total === "number" ? total + 1 : 1);',
      '  const had: boolean = msm.storage.remove("old") || msm.storage.has("joins");',
      '  const keys: string[] = msm.storage.keys();',
      '  msm.log.info(String(had) + keys.join(","));',
      '});',
      'msm.events.on("entity.hurt", (e) => { if (e.entity.data.has("boss")) e.cancel(); });',
    ].join('\n');
    expect(typeCheck(src)).toEqual([]);
    // Stored values are unknown: they must be narrowed before use.
    expect(typeCheck('const n: number = msm.storage.get("x");')).not.toEqual([]);
    // Stores are read-only properties; scripts change them through methods.
    expect(
      typeCheck('msm.events.on("player.join", (e) => { e.player.data = msm.storage; });'),
    ).not.toEqual([]);
    expect(typeCheck('msm.storage.set(1, 2);')).not.toEqual([]);
  });

  it('type-checks relative and runtime requires (no TS2591)', () => {
    const required = [
      'const util = require("./util");',
      'const runtime = require("msm:runtime");',
      'msm.events.on("server.started", () => { util.greet(runtime.msm.version); });',
    ].join('\n');
    expect(typeCheck(required)).toEqual([]);
    expect(typeCheck('require(42);')).not.toEqual([]);
  });

  it('rejects unknown events and wrong handlers', () => {
    expect(typeCheck('msm.events.on("block.fly", () => {});')).not.toEqual([]);
    expect(typeCheck('msm.events.on("server.tick", (e) => e.cancel());')).not.toEqual([]);
    expect(typeCheck('msm.events.on("block.break", (e) => { e.block.pos.x = 1; });')).not.toEqual(
      [],
    );
  });
});
