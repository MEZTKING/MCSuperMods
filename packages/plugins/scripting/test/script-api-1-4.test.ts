/**
 * Script API 1.4 (ADR 0082 D5, plan B370): weather, time of day, explosions, dropped items,
 * breaking blocks with drops and removing entities. The description changes only by additions to
 * the one of the previous Script API version (`test/fixtures/previous/script-api-v1-1.7.0.json`): exactly the members
 * below, with the parameter counts the runtime's `ScriptApi` installs (B370), each documented with
 * the Since line; scripts that use them type-check.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  generateTypings,
  MSM_RUNTIME_TYPINGS,
  parseScriptApi,
  SCRIPT_API,
  type ScriptApi,
  type ScriptApiMember,
} from '../src/index';
import { typeCheck } from './support';

const PREVIOUS: ScriptApi = parseScriptApi(
  JSON.parse(
    readFileSync(new URL('./fixtures/previous/script-api-v1-1.7.0.json', import.meta.url), 'utf8'),
  ),
);

const SINCE = 'Since runtime 1.5.1.';

const ADDED = [
  'World.dayTime',
  'World.isRaining',
  'World.isThundering',
  'World.breakBlock',
  'World.dropItem',
  'World.explode',
  'World.setWeather',
  'Entity.remove',
];

function signatureCounts(member: ScriptApiMember | undefined): string[] {
  if (member?.kind !== 'method') return [];
  const signatures = member.overloads ?? [{ params: member.params ?? [] }];
  return signatures.map(({ params }) => {
    const required = params.filter((param) => param.optional !== true).length;
    return `${required}..${params.length}`;
  });
}

function member(path: string): ScriptApiMember | undefined {
  const [type, name] = path.split('.');
  return SCRIPT_API.types[type ?? '']?.members[name ?? ''];
}

describe('script API 1.4 is additive', () => {
  it('keeps every type, member, global, event, function and alias of the previous Script API version', () => {
    expect(SCRIPT_API.version).toBe(1);
    expect(Object.keys(SCRIPT_API.types)).toEqual(Object.keys(PREVIOUS.types));
    for (const [name, type] of Object.entries(PREVIOUS.types)) {
      const now = SCRIPT_API.types[name];
      expect(now?.extends, name).toBe(type.extends);
      expect(now?.doc, name).toBe(type.doc);
      for (const [key, old] of Object.entries(type.members)) {
        expect(now?.members[key], `${name}.${key}`).toEqual(old);
      }
    }
    expect(SCRIPT_API.globals).toEqual(PREVIOUS.globals);
    expect(SCRIPT_API.events).toEqual(PREVIOUS.events);
    expect(SCRIPT_API.functions).toEqual(PREVIOUS.functions);
    expect(SCRIPT_API.aliases).toEqual(PREVIOUS.aliases);
  });

  it('keeps every previous line of the typings', () => {
    const lines = new Set(MSM_RUNTIME_TYPINGS.split('\n'));
    const previous = generateTypings(PREVIOUS).split('\n');
    expect(previous.filter((line) => !lines.has(line))).toEqual([]);
  });
});

describe('script API 1.4 members (the list B370 installs)', () => {
  it('adds exactly these members', () => {
    const added = Object.entries(SCRIPT_API.types).flatMap(([name, type]) =>
      Object.keys(type.members)
        .filter((key) => PREVIOUS.types[name]?.members[key] === undefined)
        .map((key) => `${name}.${key}`),
    );
    expect([...added].sort()).toEqual([...ADDED].sort());
  });

  it('gives the runtime the kinds and parameter counts it must match', () => {
    expect(member('World.dayTime')).toMatchObject({ kind: 'property', type: 'number' });
    expect(member('World.isRaining')).toMatchObject({ kind: 'property', type: 'boolean' });
    expect(member('World.isThundering')).toMatchObject({ kind: 'property', type: 'boolean' });
    expect(signatureCounts(member('World.breakBlock'))).toEqual(['1..2']);
    expect(signatureCounts(member('World.dropItem'))).toEqual(['2..2']);
    expect(signatureCounts(member('World.explode'))).toEqual(['2..3']);
    expect(signatureCounts(member('World.setWeather'))).toEqual(['1..2']);
    expect(signatureCounts(member('Entity.remove'))).toEqual(['0..0']);
  });

  it('documents every new member with the Since line', () => {
    for (const path of ADDED) {
      expect(member(path)?.doc.endsWith(`\n\n${SINCE}`), path).toBe(true);
    }
  });

  it('types the new members in the typings', () => {
    const lines = MSM_RUNTIME_TYPINGS.split('\n');
    for (const line of [
      '  readonly dayTime: number;',
      '  readonly isRaining: boolean;',
      '  readonly isThundering: boolean;',
      '  breakBlock(pos: Pos, options?: { drops?: boolean }): boolean;',
      '  dropItem(pos: Pos, item: ItemSpec): void;',
      '  explode(pos: Pos, power: number, options?: { fire?: boolean; breaksBlocks?: boolean }): void;',
      '  setWeather(kind: "clear" | "rain" | "thunder", seconds?: number): void;',
      '  remove(): void;',
    ]) {
      expect(lines, line).toContain(line);
    }
  });
});

describe('scripts using script API 1.4 type-check', () => {
  it('weather, time, explosions, drops, breaking and removing', () => {
    const src = [
      'import { msm } from "msm:runtime";',
      'msm.actions.define("demo:storm", (e) => {',
      '  const night: boolean = e.world.dayTime >= 13000 && e.world.dayTime < 23000;',
      '  if (!e.world.isRaining && !e.world.isThundering) e.world.setWeather("rain", 60);',
      '  if (night) e.world.setWeather("thunder");',
      '  e.world.setWeather("clear");',
      '  e.world.explode(e.pos.offset(0.5, 0.5, 0.5), 4, { fire: true, breaksBlocks: false });',
      '  e.world.explode(e.pos, 2);',
      '  e.world.dropItem(e.pos, "minecraft:diamond");',
      '  e.world.dropItem(e.pos, { id: "minecraft:emerald", count: 3 });',
      '  const broke: boolean = e.world.breakBlock(e.pos, { drops: false });',
      '  e.world.breakBlock(e.pos.offset(0, 1, 0));',
      '  if (broke && e.entity && !e.entity.isPlayer) e.entity.remove();',
      '});',
    ].join('\n');
    expect(typeCheck(src)).toEqual([]);
  });

  it('rejects misuse', () => {
    const bad = [
      'msm.actions.define("a:b", (e) => e.world.setWeather("snow"));',
      'msm.actions.define("a:b", (e) => { e.world.isRaining = true; });',
      'msm.actions.define("a:b", (e) => { e.world.dayTime = 0; });',
      'msm.actions.define("a:b", (e) => e.world.explode(e.pos));',
      'msm.actions.define("a:b", (e) => e.world.explode(e.pos, 2, { breakBlocks: false }));',
      'msm.actions.define("a:b", (e) => e.world.dropItem(e.pos, 3));',
      'msm.actions.define("a:b", (e) => e.world.breakBlock(e.pos, { drops: "yes" }));',
      'msm.actions.define("a:b", (e) => e.entity?.remove(true));',
    ];
    for (const line of bad) expect(typeCheck(line), line).not.toEqual([]);
  });
});
