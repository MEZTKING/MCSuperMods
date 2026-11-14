/**
 * Script API 1.3 (ADR 0080 D5): `World.spawnParticle` takes a particle options object and the
 * options `motion` and `force`. The description changes from the one of runtime 1.6.0
 * (`test/fixtures/previous/script-api-v1-1.6.0.json`) only by widening that method (same name,
 * same parameter counts, every previous argument still accepted) and adding the
 * `ParticleOptions` alias; the runtime's `ScriptApi` installs the same counts (B352), and scripts
 * that use the new forms type-check. The 1.3 description as runtime 1.7.0 has it is
 * `test/fixtures/previous/script-api-v1-1.7.0.json`; later additions (1.4, ADR 0082 D5) are pinned
 * in `script-api-1-4.test.ts`.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  MSM_RUNTIME_TYPINGS,
  parseScriptApi,
  SCRIPT_API,
  type ScriptApi,
  type ScriptApiMember,
} from '../src/index';
import { typeCheck } from './support';

const PREVIOUS: ScriptApi = parseScriptApi(
  JSON.parse(
    readFileSync(new URL('./fixtures/previous/script-api-v1-1.6.0.json', import.meta.url), 'utf8'),
  ),
);

/** The 1.3 description as runtime 1.7.0 has it, before the 1.4 additions. */
const API_1_3: ScriptApi = parseScriptApi(
  JSON.parse(
    readFileSync(new URL('./fixtures/previous/script-api-v1-1.7.0.json', import.meta.url), 'utf8'),
  ),
);

const SINCE = 'since runtime 1.7.0.';
const WIDENED = 'World.spawnParticle';

function signatureCounts(member: ScriptApiMember | undefined): string[] {
  if (member?.kind !== 'method') return [];
  const signatures = member.overloads ?? [{ params: member.params ?? [] }];
  return signatures.map(({ params }) => {
    const required = params.filter((param) => param.optional !== true).length;
    return `${required}..${params.length}`;
  });
}

describe('script API 1.3 changes only World.spawnParticle and adds ParticleOptions', () => {
  it('keeps every other type, member, global, function and event of runtime 1.6.0', () => {
    expect(API_1_3.version).toBe(1);
    expect(Object.keys(API_1_3.types)).toEqual(Object.keys(PREVIOUS.types));
    for (const [name, type] of Object.entries(PREVIOUS.types)) {
      const now = API_1_3.types[name];
      expect(now?.extends, name).toBe(type.extends);
      expect(Object.keys(now?.members ?? {}), name).toEqual(Object.keys(type.members));
      for (const [member, old] of Object.entries(type.members)) {
        if (`${name}.${member}` === WIDENED) continue;
        expect(now?.members[member], `${name}.${member}`).toEqual(old);
      }
    }
    expect(API_1_3.globals).toEqual(PREVIOUS.globals);
    expect(API_1_3.events).toEqual(PREVIOUS.events);
    expect(API_1_3.functions).toEqual(PREVIOUS.functions);
    const aliases = { ...API_1_3.aliases };
    delete aliases.ParticleOptions;
    expect(aliases).toEqual(PREVIOUS.aliases);
  });

  it('widens spawnParticle with the same parameter counts the runtime installs', () => {
    const before = PREVIOUS.types.World?.members.spawnParticle;
    const now = SCRIPT_API.types.World?.members.spawnParticle;
    expect(signatureCounts(now)).toEqual(signatureCounts(before));
    expect(signatureCounts(now)).toEqual(['2..3']);
    if (now?.kind !== 'method') throw new Error('spawnParticle is not a method');
    expect(now.params?.map((param) => param.type)).toEqual([
      'string | ParticleOptions',
      'Pos',
      '{ count?: number; spread?: number; speed?: number; motion?: [number, number, number]; force?: boolean }',
    ]);
    expect(now.doc.endsWith(`Options objects, \`motion\` and \`force\`: ${SINCE}`)).toBe(true);
    expect(SCRIPT_API.aliases?.ParticleOptions?.type).toBe(
      '{ type: string; [field: string]: unknown }',
    );
    expect(SCRIPT_API.aliases?.ParticleOptions?.doc.endsWith('\n\nSince runtime 1.7.0.')).toBe(
      true,
    );
  });

  it('types the widened method and the alias in the typings', () => {
    const lines = MSM_RUNTIME_TYPINGS.split('\n');
    for (const line of [
      'type ParticleOptions = { type: string; [field: string]: unknown };',
      '  spawnParticle(particle: string | ParticleOptions, pos: Pos, options?: { count?: number; spread?: number; speed?: number; motion?: [number, number, number]; force?: boolean }): void;',
      '  export type ParticleOptions = globalThis.ParticleOptions;',
    ]) {
      expect(lines, line).toContain(line);
    }
  });
});

describe('scripts using script API 1.3 type-check', () => {
  it('ids, options objects, motion and force', () => {
    const src = [
      'import { msm, type ParticleOptions } from "msm:runtime";',
      'msm.actions.define("demo:burst", (e) => {',
      '  e.world.spawnParticle("minecraft:flame", e.pos);',
      '  e.world.spawnParticle("mymod:spark", e.pos, { count: 20, spread: 0.5, speed: 0.1 });',
      '  const dust: ParticleOptions = { type: "minecraft:dust", color: [1, 0.5, 0], scale: 1.5 };',
      '  e.world.spawnParticle(dust, e.pos.offset(0, 1, 0), { count: 8, force: true });',
      '  e.world.spawnParticle({ type: "minecraft:block", block_state: "minecraft:stone" }, e.pos);',
      '  e.world.spawnParticle("mymod:spark", e.pos, { count: 4, motion: [0, 0.25, 0] });',
      '});',
    ].join('\n');
    expect(typeCheck(src)).toEqual([]);
  });

  it('rejects misuse', () => {
    const bad = [
      'msm.actions.define("a:b", (e) => e.world.spawnParticle({ color: [1, 0, 0] }, e.pos));',
      'msm.actions.define("a:b", (e) => e.world.spawnParticle("minecraft:flame", e.pos, { motion: [0, 1] }));',
      'msm.actions.define("a:b", (e) => e.world.spawnParticle("minecraft:flame", e.pos, { force: "yes" }));',
      'msm.actions.define("a:b", (e) => e.world.spawnParticle(3, e.pos));',
    ];
    for (const line of bad) expect(typeCheck(line), line).not.toEqual([]);
  });
});
