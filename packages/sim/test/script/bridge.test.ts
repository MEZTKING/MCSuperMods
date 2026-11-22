/**
 * The bridge with a runner that answers later, as the app's worker does (B400): a click waits
 * for the scripts' answer, and a handler over its budget is reported and the scripts start again
 * with the area and the data stores as they are.
 */
import type { Target } from '@msm/plugin-api';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  inProcessRunner,
  LocalWorldSource,
  type ScriptRequest,
  type ScriptResponse,
  type ScriptRunner,
} from '../../src/index.js';
import { builtInTargets, lowerFixture } from '../lower-fixture.js';
import { compileModule, compileScripts, readApi, scriptFiles } from './helpers.js';

const UP = { x: 0.5, y: 1, z: 0.5 };
const floorAt = (x: number, z: number) => ({ x, y: -1, z });

let target: Target;
beforeAll(async () => {
  target = (await builtInTargets())[0] as Target;
});

/** An in-process runner that answers on a later task; `stall` makes chosen requests time out. */
function laterRunner(stall: (request: ScriptRequest) => boolean = () => false) {
  const inner = inProcessRunner(compileModule);
  let starts = 0;
  const runner: ScriptRunner = {
    start(init, scripts) {
      starts += 1;
      return Promise.resolve(inner.start(init, scripts) as ScriptResponse);
    },
    send(request) {
      const answer = inner.send(request) as ScriptResponse;
      if (stall(request)) {
        return Promise.resolve({ ...answer, steps: [], timedOut: { ms: 2000 } });
      }
      return Promise.resolve(answer);
    },
    dispose() {
      inner.dispose();
    },
  };
  return { runner, starts: () => starts };
}

const settle = async (): Promise<void> => {
  for (let i = 0; i < 10; i++) await Promise.resolve();
};

describe('the bridge with a runner that answers later', () => {
  it('holds a break until the scripts answer, then goes on', async () => {
    const files = scriptFiles({
      watch: `import { msm } from "msm:runtime";
msm.events.on("block.break", (e) => msm.log.info("breaking " + e.block.id));`,
    });
    const { runner } = laterRunner();
    const source = new LocalWorldSource({ files, target, scripts: { runner, api: readApi() } });
    const compiled = compileScripts(files);
    source.loadScripts(compiled.scripts);
    await settle();
    source.act({
      type: 'place',
      pos: floorAt(2, 2),
      face: 'up',
      hit: UP,
      block: 'minecraft:stone',
    });
    await settle();
    source.act({ type: 'break', pos: { x: 2, y: 0, z: 2 } });
    // The block waits for the answer.
    expect(source.world.get({ x: 2, y: 0, z: 2 })?.name).toBe('minecraft:stone');
    await settle();
    expect(source.world.get({ x: 2, y: 0, z: 2 })).toBeNull();
    expect(source.trace.map((entry) => entry.text)).toContain(
      'The script t:watch logged: breaking minecraft:stone',
    );
  });

  it('reports a handler over its budget and starts the scripts again, keeping the stores', async () => {
    const files = scriptFiles({
      loop: `import { msm } from "msm:runtime";
msm.storage.set("loads", ((msm.storage.get("loads") as number | undefined) ?? 0) + 1);
msm.log.info("loads " + msm.storage.get("loads"));
msm.events.on("player.chat", (e) => {
  if (e.message === "spin") return; // the runner stalls this one
  e.player.sendMessage("heard " + e.message);
});`,
    });
    const { runner, starts } = laterRunner(
      (request) =>
        request.type === 'event' &&
        request.name === 'player.chat' &&
        request.data.message === 'spin',
    );
    const source = new LocalWorldSource({ files, target, scripts: { runner, api: readApi() } });
    source.loadScripts(compileScripts(files).scripts);
    await settle();
    source.chat('spin');
    await settle();
    const texts = source.trace.map((entry) => entry.text);
    expect(texts).toContain(
      'The player.chat handlers ran for more than 2 seconds (an endless loop?), so the preview stopped the scripts and started them again; their waiting msm.schedule calls were dropped.',
    );
    expect(starts()).toBe(2);
    expect(texts).toContain('The script t:loop logged: loads 2');
    source.chat('again');
    await settle();
    expect(source.trace.map((entry) => entry.text)).toContain(
      'The script t:loop says to you: "heard again"',
    );
  });

  it('decides a use with the sneaking of the moment it was made, not of the answer', async () => {
    // The sample's satchel opens only on a sneaking use, and its script hears `item.use`: the
    // player lets go of Shift before the scripts answer (the e2e bag screen, B463).
    const files = (await lowerFixture('sample-vanilla-blocks', target)).files;
    const { runner } = laterRunner();
    const source = new LocalWorldSource({ files, target, scripts: { runner, api: readApi() } });
    source.loadScripts(compileScripts(files).scripts);
    await settle();
    const move = (sneak: boolean): void => {
      source.act({
        type: 'move',
        forward: 0,
        strafe: 0,
        jump: false,
        sneak,
        toggleFly: false,
        yaw: 0,
        pitch: 0,
      });
      source.tick();
    };
    move(true);
    expect(source.useItem('msm_sample_vanilla_blocks:satchel')).toBe(true);
    move(false);
    expect(source.parity2.bag).toBeNull();
    await settle();
    expect(source.parity2.bag?.spec).toMatchObject({ screen: 'chest', rows: 2, columns: 9 });
    // And a use made without sneaking stays one when Shift goes down before the answer.
    source.parity2.closeBag();
    expect(source.useItem('msm_sample_vanilla_blocks:satchel')).toBe(true);
    move(true);
    await settle();
    expect(source.parity2.bag).toBeNull();
    expect(source.lines.at(-1)?.text).toContain('opens only while you sneak');
  }, 60_000);
});
