/**
 * Script API 1.8 (B729; the B720 spike's K21): `EntityDeathEvent.killer`, the kill credit
 * (`LivingEntity.getKillCredit()`), so Rules' "A player dies" names the hitter of a knock into
 * the void as vanilla's kill score does, where `attacker` (the damage source's entity) is none.
 * The description changes only by additions to the 1.7 one
 * (`test/fixtures/previous/script-api-v1-1.11.0.json`): exactly the member below, documented with
 * the Since line; scripts that use it type-check. The release that ships it is the next one
 * after 1.5.9, so the Since line names 1.5.10.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  generateTypings,
  MSM_RUNTIME_TYPINGS,
  parseScriptApi,
  SCRIPT_API,
  type ScriptApi,
} from '../src/index';
import { typeCheck } from './support';

const PREVIOUS: ScriptApi = parseScriptApi(
  JSON.parse(
    readFileSync(new URL('./fixtures/previous/script-api-v1-1.11.0.json', import.meta.url), 'utf8'),
  ),
);

const SINCE = 'Since runtime 1.5.10.';

const ADDED_MEMBERS = ['EntityDeathEvent.killer'];

describe('script API 1.8 is additive', () => {
  it('keeps every type, member, global, event, function and alias of 1.7', () => {
    expect(SCRIPT_API.version).toBe(1);
    for (const [name, type] of Object.entries(PREVIOUS.types)) {
      const now = SCRIPT_API.types[name];
      expect(now?.extends, name).toBe(type.extends);
      expect(now?.doc, name).toBe(type.doc);
      for (const [key, old] of Object.entries(type.members)) {
        expect(now?.members[key], `${name}.${key}`).toEqual(old);
      }
    }
    expect(SCRIPT_API.events).toEqual(PREVIOUS.events);
    expect(SCRIPT_API.functions).toEqual(PREVIOUS.functions);
    expect(SCRIPT_API.aliases).toEqual(PREVIOUS.aliases);
    expect(SCRIPT_API.globals).toEqual(PREVIOUS.globals);
  });

  it('keeps every previous line of the typings', () => {
    const lines = new Set(MSM_RUNTIME_TYPINGS.split('\n'));
    const previous = generateTypings(PREVIOUS).split('\n');
    expect(previous.filter((line) => !lines.has(line))).toEqual([]);
  });
});

describe('script API 1.8 members', () => {
  it('adds exactly the kill credit, no type and no event', () => {
    expect(Object.keys(SCRIPT_API.types).filter((name) => !PREVIOUS.types[name])).toEqual([]);
    const added = Object.entries(SCRIPT_API.types).flatMap(([name, type]) =>
      Object.keys(type.members)
        .filter((key) => PREVIOUS.types[name]?.members[key] === undefined)
        .map((key) => `${name}.${key}`),
    );
    expect(added).toEqual(ADDED_MEMBERS);
    expect(SCRIPT_API.types.EntityDeathEvent?.members.killer).toMatchObject({
      kind: 'property',
      type: 'Entity',
      optional: true,
    });
  });

  it('documents the new member with the Since line', () => {
    expect(SCRIPT_API.types.EntityDeathEvent?.members.killer?.doc.endsWith(`\n\n${SINCE}`)).toBe(
      true,
    );
  });

  it('types the new member in the typings', () => {
    expect(MSM_RUNTIME_TYPINGS.split('\n')).toContain('  readonly killer?: Entity;');
  });
});

describe('scripts using script API 1.8 type-check', () => {
  it('reads the killer of a player', () => {
    const src = [
      'import { msm } from "msm:runtime";',
      'msm.events.on("entity.death", (e) => {',
      '  const player = e.entity.asPlayer();',
      '  const killer = e.killer?.asPlayer();',
      '  if (player !== undefined && killer !== undefined) killer.sendMessage("You got " + player.name);',
      '  const who: string = e.killer === undefined ? "nobody" : e.killer.type;',
      '  msm.log.info(who);',
      '});',
    ].join('\n');
    expect(typeCheck(src)).toEqual([]);
  });

  it('rejects misuse', () => {
    const bad = [
      'import { msm } from "msm:runtime";',
      'msm.events.on("entity.death", (e) => { const k: string = e.killer; });',
    ].join('\n');
    expect(typeCheck(bad).length).toBeGreaterThan(0);
  });
});
