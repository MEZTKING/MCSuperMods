/**
 * Script API 1.2 (ADR 0076 D5): containers. The description changes only by additions to the one
 * of runtime 1.5.0 (`test/fixtures/previous/script-api-v1-1.5.0.json`), adds exactly
 * `World.getContainer` and the `Container` type the runtime's `ScriptApi` installs (B317), and
 * type-checks scripts that use them.
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
    readFileSync(new URL('./fixtures/previous/script-api-v1-1.5.0.json', import.meta.url), 'utf8'),
  ),
);

const SINCE = 'Since runtime 1.6.0.';

function signatureCounts(member: ScriptApiMember | undefined): string[] {
  if (member?.kind !== 'method') return [];
  const signatures = member.overloads ?? [{ params: member.params ?? [] }];
  return signatures.map(({ params }) => {
    const required = params.filter((param) => param.optional !== true).length;
    return `${required}..${params.length}`;
  });
}

describe('script API 1.2 is additive', () => {
  it('keeps the version at 1 and every type, member, global and event of runtime 1.5.0', () => {
    expect(SCRIPT_API.version).toBe(1);
    for (const [name, type] of Object.entries(PREVIOUS.types)) {
      const now = SCRIPT_API.types[name];
      expect(now?.extends, name).toBe(type.extends);
      for (const [member, old] of Object.entries(type.members)) {
        expect(now?.members[member], `${name}.${member}`).toEqual(old);
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

describe('script API 1.2 members (the list B317 installs)', () => {
  it('adds exactly World.getContainer and the Container type', () => {
    expect(Object.keys(SCRIPT_API.types).filter((name) => !PREVIOUS.types[name])).toEqual([
      'Container',
    ]);
    const added = Object.entries(SCRIPT_API.types).flatMap(([name, type]) =>
      PREVIOUS.types[name]
        ? Object.keys(type.members)
            .filter((member) => PREVIOUS.types[name]?.members[member] === undefined)
            .map((member) => `${name}.${member}`)
        : [],
    );
    expect(added).toEqual(['World.getContainer']);
    expect(Object.keys(SCRIPT_API.types.Container?.members ?? {}).sort()).toEqual([
      'add',
      'count',
      'get',
      'set',
      'size',
    ]);
  });

  it('gives the runtime the parameter counts it must match', () => {
    const container = SCRIPT_API.types.Container?.members;
    expect(signatureCounts(SCRIPT_API.types.World?.members.getContainer)).toEqual(['1..1']);
    expect(signatureCounts(container?.get)).toEqual(['1..1']);
    expect(signatureCounts(container?.set)).toEqual(['1..2']);
    expect(signatureCounts(container?.count)).toEqual(['1..1']);
    expect(signatureCounts(container?.add)).toEqual(['1..1']);
    expect(container?.size).toMatchObject({ kind: 'property', type: 'number' });
  });

  it('documents the type and every new member with the Since line', () => {
    const container = SCRIPT_API.types.Container;
    const docs: [string, string | undefined][] = [
      ['Container', container?.doc],
      ['World.getContainer', SCRIPT_API.types.World?.members.getContainer?.doc],
      ...Object.entries(container?.members ?? {}).map(([name, member]): [string, string] => [
        `Container.${name}`,
        member.doc,
      ]),
    ];
    expect(docs).toHaveLength(7);
    for (const [name, doc] of docs) expect(doc?.endsWith(`\n\n${SINCE}`), name).toBe(true);
  });

  it('types the new members in the typings', () => {
    for (const line of [
      '  getContainer(pos: Pos): Container | undefined;',
      'interface Container {',
      '  readonly size: number;',
      '  get(slot: number): ItemRef | undefined;',
      '  set(slot: number, item?: ItemSpec): boolean;',
      '  count(item: string): number;',
      '  add(item: ItemSpec): ItemRef | undefined;',
      '  export type Container = globalThis.Container;',
    ]) {
      expect(MSM_RUNTIME_TYPINGS.split('\n'), line).toContain(line);
    }
  });
});

describe('scripts using script API 1.2 type-check', () => {
  it('containers', () => {
    const src = [
      'import { msm, type Container } from "msm:runtime";',
      'msm.actions.define("demo:refuel", (e) => {',
      '  const box: Container | undefined = e.world.getContainer(e.pos);',
      '  if (!box) return;',
      '  const coal: number = box.count("minecraft:coal");',
      '  const left = box.add({ id: "minecraft:coal", count: 64 - coal });',
      '  if (left) e.world.spawnEntity("minecraft:item", e.pos);',
      '  for (let i = 0; i < box.size; i++) {',
      '    const item = box.get(i);',
      '    if (item?.id === "minecraft:rotten_flesh") box.set(i);',
      '  }',
      '  const placed: boolean = box.set(0, "minecraft:torch");',
      '  msm.log.info(String(placed));',
      '});',
    ].join('\n');
    expect(typeCheck(src)).toEqual([]);
  });

  it('rejects misuse', () => {
    const bad = [
      'msm.actions.define("a:b", (e) => e.world.getContainer(e.pos).add("minecraft:coal"));',
      'msm.actions.define("a:b", (e) => e.world.getContainer(e.pos)?.get("head"));',
      'msm.actions.define("a:b", (e) => e.world.getContainer(e.pos)?.add({ count: 1 }));',
      'msm.actions.define("a:b", (e) => { const c = e.world.getContainer(e.pos); if (c) c.size = 3; });',
      'msm.actions.define("a:b", (e) => e.world.getContainer("0 0 0"));',
    ];
    for (const line of bad) expect(typeCheck(line), line).not.toEqual([]);
  });
});
