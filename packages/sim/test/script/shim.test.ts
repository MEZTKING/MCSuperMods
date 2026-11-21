/**
 * The shim and the bridge with small hand-written scripts (B400): blocks, particles and sounds,
 * data stores across a reload, `require`, `msm.schedule` on the area's clock, cancelling, errors,
 * and the runtime serialised as the worker serialises it.
 */
import type { Target } from '@msm/plugin-api';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  createScriptRuntime,
  type ScriptModuleFn,
  type ScriptRuntime,
  type ScriptRuntimeInit,
  type SimEffect,
} from '../../src/index.js';
import { builtInTargets } from '../lower-fixture.js';
import { compileScripts, readApi, scriptedArea, scriptFiles, transpile } from './helpers.js';

const UP = { x: 0.5, y: 1, z: 0.5 };
const floorAt = (x: number, z: number) => ({ x, y: -1, z });

let target: Target;
beforeAll(async () => {
  target = (await builtInTargets())[0] as Target;
});

const header = 'import { msm } from "msm:runtime";\n';

describe('the shim over the area', () => {
  it('sets and reads blocks, shows particles and plays sounds', () => {
    const files = scriptFiles({
      blocks: `${header}
msm.events.on("player.chat", (e) => {
  const at = e.player.pos.offset(2, 0, 0);
  e.world.setBlock(at, "minecraft:stone");
  e.player.sendMessage("now " + e.world.getBlock(at));
  e.world.spawnParticle("minecraft:flame", at, { count: 3 });
  e.world.playSound("minecraft:block.note_block.bell", at, { pitch: 2 });
});`,
    });
    const { source, texts } = scriptedArea(files, target);
    const effects: SimEffect[] = [];
    source.subscribe((event) => {
      if (event.type === 'effect') effects.push(event.effect);
    });
    source.chat('hello');
    expect(source.world.get({ x: 26, y: 0, z: 24 })?.name).toBe('minecraft:stone');
    expect(texts()).toContain('The script t:blocks says to you: "now minecraft:stone"');
    expect(texts()).toContain('The script t:blocks set Stone at 26, 0, 24.');
    expect(texts()).toContain('The script t:blocks showed 3 Flame particles.');
    expect(texts()).toContain('The script t:blocks played sound Bell.');
    expect(effects.filter((effect) => effect.kind === 'particle')).toHaveLength(3);
    expect(effects.find((effect) => effect.kind === 'sound')).toMatchObject({
      id: 'minecraft:block.note_block.bell',
      pitch: 2,
    });
    expect(effects.find((effect) => effect.kind === 'chip')?.id).toBe('now minecraft:stone');
  });

  it('keeps data stores across a reload, and require loads a module once', () => {
    const files = scriptFiles({
      'lib/count': `${header}
msm.log.info("count loaded");
export function bump(): number {
  const n = (msm.storage.get("n") as number | undefined) ?? 0;
  msm.storage.set("n", n + 1);
  return n + 1;
}`,
      a: `import { bump } from "./lib/count";
msm.events.on("player.chat", (e) => e.player.sendMessage("a " + bump()));`,
      b: `import { bump } from "./lib/count";
msm.events.on("player.chat", (e) => e.player.sendMessage("b " + bump()));`,
    });
    const { source, texts } = scriptedArea(files, target);
    expect(texts().filter((line) => line.endsWith('logged: count loaded'))).toHaveLength(1);
    source.chat('one');
    expect(texts()).toContain('The script t:a says to you: "a 1"');
    expect(texts()).toContain('The script t:b says to you: "b 2"');
    const compiled = compileScripts(files);
    source.loadScripts(compiled.scripts, compiled.problems);
    source.chat('two');
    expect(texts()).toContain('The script t:a says to you: "a 3"');
  });

  it('runs msm.schedule on the area clock', () => {
    const files = scriptFiles({
      later: `${header}
msm.events.on("player.chat", (e) => {
  msm.schedule(5, () => e.player.sendMessage("five ticks later at " + e.world.time));
});`,
    });
    const { source, texts } = scriptedArea(files, target);
    source.chat('go');
    for (let i = 0; i < 4; i++) source.tick();
    expect(texts().some((line) => line.includes('five ticks later'))).toBe(false);
    source.tick();
    expect(texts()).toContain('The script t:later says to you: "five ticks later at 5"');
  });

  it('lets block.break and block.place be cancelled', () => {
    const files = scriptFiles({
      guard: `${header}
msm.events.on("block.break", (e) => {
  if (e.block.id === "minecraft:stone") e.cancel();
});
msm.events.on("block.place", (e) => {
  if (e.block === "minecraft:dirt") {
    e.cancel();
    e.player.sendMessage("No dirt at " + e.pos);
  }
});`,
    });
    const { source, texts } = scriptedArea(files, target);
    source.act({
      type: 'place',
      pos: floorAt(4, 4),
      face: 'up',
      hit: UP,
      block: 'minecraft:stone',
    });
    expect(source.world.get({ x: 4, y: 0, z: 4 })?.name).toBe('minecraft:stone');
    source.act({ type: 'break', pos: { x: 4, y: 0, z: 4 } });
    expect(source.world.get({ x: 4, y: 0, z: 4 })?.name).toBe('minecraft:stone');
    expect(
      source.lines.some((line) => line.text === 'A script stopped the breaking of Stone.'),
    ).toBe(true);
    source.act({ type: 'place', pos: floorAt(6, 6), face: 'up', hit: UP, block: 'minecraft:dirt' });
    expect(source.world.get({ x: 6, y: 0, z: 6 })).toBeNull();
    expect(texts()).toContain('The script t:guard says to you: "No dirt at 6, 0, 6"');
  });

  it('says what a script does wrong and goes on', () => {
    const files = scriptFiles({
      broken: `${header}
msm.events.on("player.chat", (e) => {
  (e as unknown as { nothing: { here: number } }).nothing.here;
});
msm.events.on("no.such.event", () => {});`,
      fine: `${header}
msm.events.on("player.chat", (e) => e.player.sendMessage("still here"));`,
      bad: `${header}
throw new Error("not today");`,
    });
    const { source, texts } = scriptedArea(files, target);
    expect(texts()).toContain(
      'The script t:broken failed in its msm.events.on: unknown event name "no.such.event"',
    );
    expect(texts()).toContain('The script t:bad failed in its loading: Error: not today');
    source.chat('hi');
    expect(
      texts().some((line) =>
        line.startsWith('The script t:broken failed in its player.chat handler: TypeError'),
      ),
    ).toBe(true);
    expect(texts()).toContain('The script t:fine says to you: "still here"');
  });

  it('reports a script that does not transpile and runs the others', () => {
    const files = scriptFiles({
      good: `${header}msm.log.info("good");`,
      worse: 'const = ;',
    });
    const { texts } = scriptedArea(files, target);
    expect(texts()).toContain('The script t:good logged: good');
    expect(
      texts().some((line) =>
        line.startsWith('The script t:worse has errors, so it does not run in the preview'),
      ),
    ).toBe(true);
  });

  it('finds the player with entitiesNear', () => {
    const files = scriptFiles({
      near: `${header}
msm.events.on("player.chat", (e) => {
  const found = e.world.entitiesNear(e.player.pos, 3);
  e.player.sendMessage(found.length + " near, " + found.filter((n) => n.isPlayer).length + " player");
});`,
    });
    const { source, texts } = scriptedArea(files, target);
    source.chat('who');
    expect(texts()).toContain('The script t:near says to you: "1 near, 1 player"');
  });
});

describe('the runtime as the worker carries it', () => {
  it('works from its own source text alone (it is self-contained)', () => {
    const rebuilt = new Function(`return (${createScriptRuntime.toString()});`)() as (
      init: ScriptRuntimeInit,
      modules: Readonly<Record<string, ScriptModuleFn>>,
    ) => ScriptRuntime;
    const js = transpile(`${header}
msm.events.on("block.interact", (e) => {
  e.world.setBlock(e.block.pos.offset(0, 1, 0), "minecraft:glowstone");
  e.cancel();
});`);
    const runtime = rebuilt(
      {
        api: readApi(),
        version: '1.5.1',
        scripts: [{ id: 't:glow' }],
        stores: {},
        sync: {
          tick: 0,
          player: { name: 'Player', pos: [0.5, 0, 0.5], sneaking: false, items: [] },
          mobs: [],
          full: { size: [2, 2, 2], palette: ['minecraft:air'], cells: new Array(8).fill(0) },
        },
      },
      {
        't:glow': new Function('exports', 'require', 'module', 'msm', js) as ScriptModuleFn,
      },
    );
    runtime.handle({ type: 'load' });
    expect(runtime.collect().listeners).toEqual({ 'block.interact': ['t:glow'] });
    runtime.handle({
      type: 'event',
      name: 'block.interact',
      data: {
        block: { $block: { pos: [0, 0, 0], state: 'minecraft:stone' } },
        player: { $entity: { kind: 'player' } },
        hand: 'main',
      },
      sync: {
        tick: 1,
        player: { name: 'Player', pos: [0.5, 0, 0.5], sneaking: false, items: [] },
        mobs: [],
      },
    });
    const answer = runtime.collect();
    expect(answer.cancelled).toBe(true);
    expect(answer.steps).toEqual([
      { op: 'setBlock', script: 't:glow', pos: [0, 1, 0], state: 'minecraft:glowstone' },
    ]);
  });
});
