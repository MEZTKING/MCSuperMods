/**
 * The generated typings: `api/msm-runtime.d.ts` equals `generateTypings(SCRIPT_API)` (set
 * `UPDATE_GOLDENS=1` to rewrite it), parses, declares every event, and type-checks scripts
 * that use the global and the `msm:runtime` module.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
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

const UPDATE = process.env.UPDATE_GOLDENS === '1';
const GOLDEN = new URL('../api/msm-runtime.d.ts', import.meta.url);

/** Type-checks `script` against the typings with `lib.es5` only (no DOM, no Node). */
function typeCheck(script: string): string[] {
  const libDir = dirname(createRequire(import.meta.url).resolve('typescript/lib/lib.es5.d.ts'));
  const files = new Map<string, string>([
    ['/msm-runtime.d.ts', MSM_RUNTIME_TYPINGS],
    ['/script.ts', script],
  ]);
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
  host.readFile = (fileName) => files.get(fileName);
  const program = ts.createProgram(['/msm-runtime.d.ts', '/script.ts'], options, host);
  return ts
    .getPreEmitDiagnostics(program)
    .map((d) => ts.flattenDiagnosticMessageText(d.messageText, '\n'));
}

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

  it('rejects unknown events and wrong handlers', () => {
    expect(typeCheck('msm.events.on("block.fly", () => {});')).not.toEqual([]);
    expect(typeCheck('msm.events.on("server.tick", (e) => e.cancel());')).not.toEqual([]);
    expect(typeCheck('msm.events.on("block.break", (e) => { e.block.pos.x = 1; });')).not.toEqual(
      [],
    );
  });
});
