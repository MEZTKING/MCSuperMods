/**
 * The Script API walk (B400): every member of `script-api-v1.json` is either implemented by the
 * shim or says it is only in Minecraft when used; none is missing. The shim builds its objects
 * from the JSON, so a member added to the JSON is said out loud without a change here.
 */
import { describe, expect, it } from 'vitest';
import {
  apiMembers,
  createScriptRuntime,
  type ProbeResult,
  type ScriptApiDescription,
  type ScriptRuntimeInit,
} from '../../src/index.js';
import { readApi } from './helpers.js';

function runtimeFor(api: ScriptApiDescription) {
  const init: ScriptRuntimeInit = {
    api,
    version: '1.5.1',
    scripts: [],
    stores: {},
    sync: {
      tick: 0,
      player: { name: 'Player', pos: [1.5, 0, 1.5], sneaking: false, items: [] },
      mobs: [{ id: 1, type: 't:cow', name: 'Cow', pos: [3, 0, 3] }],
      full: { size: [4, 4, 4], palette: ['minecraft:air'], cells: new Array(64).fill(0) },
    },
  };
  return createScriptRuntime(init, {});
}

/** The members the brief names (B400), which must work in the preview. */
const IMPLEMENTED = [
  'msm.version',
  'msm.log.info',
  'msm.log.warn',
  'msm.log.error',
  'msm.events.on',
  'msm.actions.define',
  'msm.schedule',
  'msm.storage',
  'msm.players',
  'require',
  'Pos.x',
  'Pos.offset',
  'Pos.toString',
  'World.dimension',
  'World.time',
  'World.getBlock',
  'World.setBlock',
  'World.spawnParticle',
  'World.playSound',
  'World.entitiesNear',
  'Entity.type',
  'Entity.uuid',
  'Entity.pos',
  'Entity.name',
  'Entity.isPlayer',
  'Entity.isAlive',
  'Entity.asPlayer',
  'Entity.data',
  'Player.isSneaking',
  'Player.heldItem',
  'Player.give',
  'Player.hasItem',
  'Player.sendMessage',
  'BlockRef.id',
  'BlockRef.state',
  'BlockRef.pos',
  'ItemRef.id',
  'ItemRef.count',
  'DataStore.get',
  'DataStore.set',
  'DataStore.remove',
  'DataStore.has',
  'DataStore.keys',
  'GameEvent.world',
];

describe('the Script API walk', () => {
  const api = readApi();
  const members = apiMembers(api);
  const runtime = runtimeFor(api);
  const results = new Map<string, ProbeResult>(
    members.map((member) => [member.path, runtime.probe(member.path)]),
  );

  it('finds the whole description (globals, types and functions)', () => {
    expect(members.length).toBeGreaterThan(200);
    expect(members.some((member) => member.owner === 'function')).toBe(true);
    expect(Object.keys(api.events).length).toBeGreaterThan(20);
  });

  it('has no member that is neither implemented nor said to be only in Minecraft', () => {
    const missing = [...results].filter(([, result]) => result === 'missing').map(([path]) => path);
    expect(missing).toEqual([]);
  });

  it('implements the members the preview can do', () => {
    const notImplemented = IMPLEMENTED.filter((path) => results.get(path) !== 'implemented');
    expect(notImplemented).toEqual([]);
  });

  it('says the rest out loud (health, inventories, boss bars, commands)', () => {
    for (const path of [
      'Entity.health',
      'Entity.damage',
      'Player.inventory',
      'msm.bossBars.create',
      'World.runCommand',
      'World.explode',
      'Inventory.count',
    ]) {
      expect(results.get(path), path).toBe('logged');
    }
  });

  it('gives a member added to the JSON a stub that says it is only in Minecraft', () => {
    const world = api.types.World;
    if (world === undefined) throw new Error('No World type');
    const grown: ScriptApiDescription = {
      ...api,
      types: {
        ...api.types,
        World: {
          ...world,
          members: {
            ...world.members,
            summonRainbow: { kind: 'method', params: [], returns: 'boolean' },
            mood: { kind: 'property', type: 'string' },
          },
        },
      },
    };
    const added = apiMembers(grown).filter((member) =>
      ['World.summonRainbow', 'World.mood'].includes(member.path),
    );
    expect(added).toHaveLength(2);
    const probe = runtimeFor(grown);
    for (const member of added) expect(probe.probe(member.path), member.path).toBe('logged');
  });
});
