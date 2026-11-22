/** B565 throwaway: Z1 (lowering) and Z6–Z12 (the clip scripts through the sim) on both targets. */
import { writeFileSync } from 'node:fs';
import { SCRIPT_API } from '@msm/plugin-scripting';
import { type CompiledScript, inProcessRunner, type ScriptModuleFn } from '@msm/sim';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { SPIKE_CLIPS } from '../../src/renderer/src/showcase-spike/clips';
import { SpikePlayer } from '../../src/renderer/src/showcase-spike/player';
import { ruleBooksOf, TryItArea } from '../../src/renderer/src/tryit/session-source';
import { lowerExample, median, SHOWCASE_IDS, TARGET_IDS, targetOf } from './helpers';
import { bundlePreviewProject } from '../../src/renderer/src/preview/bundle-source';
import { createEmptyProject } from '@msm/core';

const OUT = '/tmp/claude-0/-home-user/4a56a205-8696-50bd-85e1-c9cc01051fe4/scratchpad/b565-results';

function transpile(source: string) {
  const out = ts.transpileModule(source, {
    reportDiagnostics: true,
    compilerOptions: {
      target: ts.ScriptTarget.ES5,
      module: ts.ModuleKind.CommonJS,
      downlevelIteration: true,
      ignoreDeprecations: '6.0',
      alwaysStrict: true,
    },
  });
  return { js: out.outputText };
}
const compileModule = (script: CompiledScript): ScriptModuleFn =>
  new Function('exports', 'require', 'module', 'msm', `${script.js}\n`) as ScriptModuleFn;

describe('Z1 lowering', () => {
  it('lowers the ten on both targets, five times each', async () => {
    const rows: Record<string, unknown>[] = [];
    for (const targetId of TARGET_IDS) {
      const target = targetOf(targetId);
      for (const id of SHOWCASE_IDS) {
        const totals: number[] = [];
        const lowers: number[] = [];
        let last = await lowerExample(id, target);
        for (let i = 0; i < 5; i += 1) {
          last = await lowerExample(id, target);
          totals.push(last.ms.total);
          lowers.push(last.ms.lower);
        }
        const typed = await lowerExample(id, target, { typedModels: true });
        rows.push({
          target: targetId,
          id,
          medianMs: Math.round(median(totals) * 10) / 10,
          worstMs: Math.round(Math.max(...totals) * 10) / 10,
          lowerMedianMs: Math.round(median(lowers) * 10) / 10,
          files: last.files.length,
          problems: last.problems.length,
          problemsWithTypedModels: typed.problems.length,
          simKB: Math.round(last.simBytes / 102.4) / 10,
          assets: last.bundle.assets.length,
        });
        expect(last.problems).toEqual([]);
      }
    }
    writeFileSync(`${OUT}-z1.json`, JSON.stringify(rows, null, 2));
  }, 300_000);
});

describe('Z6 reach and the player body', () => {
  it('places far away, and not into the player', async () => {
    const target = targetOf('mc-26.3');
    const lowered = await lowerExample('example_msm_wood_set', target);
    const area = new TryItArea({ files: lowered.sim, target });
    area.clock.pause();
    const { flatGround } = await import('@msm/sim');
    area.loadGround('flat', flatGround(), 'flat');
    area.source.player.teleport({ x: 2.5, y: 4, z: 2.5 });
    area.act({ type: 'place', pos: { x: 44, y: 3, z: 44 }, face: 'up', hit: { x: 0.5, y: 1, z: 0.5 }, block: 'showcase:elm_planks' });
    const far = area.source.world.get({ x: 44, y: 4, z: 44 });
    area.act({ type: 'place', pos: { x: 2, y: 3, z: 2 }, face: 'up', hit: { x: 0.5, y: 1, z: 0.5 }, block: 'showcase:elm_planks' });
    const inside = area.source.world.get({ x: 2, y: 4, z: 2 });
    area.act({ type: 'break', pos: { x: 44, y: 4, z: 44 } });
    const broken = area.source.world.get({ x: 44, y: 4, z: 44 });
    const lines = area.whatHappened.map((e) => e.text);
    writeFileSync(`${OUT}-z6.json`, JSON.stringify({ far, inside, broken, lines }, null, 2));
    area.dispose();
  });
});

describe('Z7 vehicles', () => {
  it('drives with forward; the look yaw does not steer, strafe does', async () => {
    const target = targetOf('mc-26.3');
    const lowered = await lowerExample('example_msm_vehicle', target);
    const area = new TryItArea({ files: lowered.sim, target });
    area.clock.pause();
    const { flatGround } = await import('@msm/sim');
    area.loadGround('flat', flatGround(), 'flat');
    area.source.player.teleport({ x: 24.5, y: 4, z: 34.5 });
    const move = (forward: number, strafe: number, yaw: number) =>
      area.act({ type: 'move', forward, strafe, jump: false, sneak: false, toggleFly: false, yaw, pitch: 0 });
    move(0, 0, 180);
    area.clock.step();
    area.act({ type: 'use', pos: { x: 24, y: 3, z: 30 }, face: 'up', hit: { x: 0.5, y: 1, z: 0.5 }, item: 'showcase:tank' });
    const id = area.source.vehicles.snapshots()[0]?.id as number;
    area.act({ type: 'useVehicle', vehicle: id });
    const snap = () => {
      const one = area.source.vehicles.snapshots()[0];
      return one === undefined ? null : { x: Math.round(one.position.x * 100) / 100, z: Math.round(one.position.z * 100) / 100, yaw: Math.round(one.yaw * 10) / 10 };
    };
    const rows: Record<string, unknown> = { placed: snap(), riding: area.source.vehicles.riding };
    for (let i = 0; i < 40; i += 1) { move(1, 0, 180 + i * 3); area.clock.step(); }
    rows.afterForwardWithTurningLook = snap();
    for (let i = 0; i < 30; i += 1) { move(1, 1, 180); area.clock.step(); }
    rows.afterForwardWithStrafeRight = snap();
    for (let i = 0; i < 30; i += 1) { move(0, 0, 180); area.clock.step(); }
    rows.afterCoasting = snap();
    rows.lookTurn = area.source.vehicles.takeLookTurn();
    writeFileSync(`${OUT}-z7.json`, JSON.stringify(rows, null, 2));
    area.dispose();
  });
});

describe('clips through the sim', () => {
  for (const targetId of TARGET_IDS) {
    it(`plays the ten on ${targetId}`, async () => {
      const target = targetOf(targetId);
      const results: Record<string, unknown>[] = [];
      for (const clip of SPIKE_CLIPS) {
        const lowered = await lowerExample(clip.exampleId, target);
        const project = bundlePreviewProject(createEmptyProject('showcase'), lowered.bundle);
        const area = new TryItArea({
          files: lowered.sim,
          target,
          seed: 1,
          ruleBooks: ruleBooksOf(project),
          scripts: {
            transpile: async (source) => transpile(source),
            api: SCRIPT_API,
            runner: () => inProcessRunner(compileModule),
          },
        });
        const loadStart = performance.now();
        await area.loadScripts();
        const scriptsMs = performance.now() - loadStart;
        const player = new SpikePlayer(area, clip);
        const t0 = performance.now();
        player.start();
        const setupMs = performance.now() - t0;
        const startLines = area.whatHappened.length;
        const statesNow = (): string[] => {
          const out: string[] = [];
          for (const entry of [...clip.steps.map((e) => e.step), ...clip.setup.map((e) => ({ ...e, type: 'set' }))]) {
            if (!('pos' in entry)) continue;
            for (const dy of [0, 1]) {
              const p = { x: entry.pos.x, y: entry.pos.y + dy, z: entry.pos.z };
              const st = area.source.world.get(p);
              if (st !== null && st.name.startsWith('showcase:')) {
                out.push(`${p.x},${p.y},${p.z} ${st.name.slice(9)}${Object.keys(st.properties).length ? JSON.stringify(st.properties) : ''}`);
              }
            }
          }
          return [...new Set(out)];
        };
        const t1 = performance.now();
        const snapshots: Record<string, unknown>[] = [];
        while (player.tick < clip.length) {
          player.stepTick();
          await Promise.resolve();
          if (player.tick === clip.stillAt || player.tick === clip.length) {
            snapshots.push({
              tick: player.tick,
              states: statesNow(),
              mobs: area.source.entities.count,
              vehicles: area.source.vehicles.snapshots().map((one) => ({
                x: Math.round(one.position.x * 10) / 10,
                z: Math.round(one.position.z * 10) / 10,
                yaw: Math.round(one.yaw),
              })),
              particles: area.particles.size, emitted: area.particles.emitted,
              riding: area.source.vehicles.riding,
            });
          }
        }
        const playMs = performance.now() - t1;
        const world = area.source.world;
        const states: string[] = [];
        for (const entry of clip.steps) {
          const s = entry.step;
          if ('pos' in s) {
            for (const dy of [0, 1]) {
              const p = { x: s.pos.x, y: s.pos.y + dy, z: s.pos.z };
              const st = world.get(p);
              if (st !== null && st.name.startsWith('showcase:')) {
                states.push(`${p.x},${p.y},${p.z} ${st.name}${JSON.stringify(st.properties)}`);
              }
            }
          }
        }
        results.push({
          clip: clip.id,
          scriptsMs: Math.round(scriptsMs),
          setupMs: Math.round(setupMs * 10) / 10,
          playMs: Math.round(playMs),
          problems: player.problems,
          records: player.records,
          allLines: area.whatHappened.slice(startLines).map((e) => `t${e.tick} [${e.kind}] ${e.text}`),
          snapshots,
          finalStates: [...new Set(states)],
        });
        area.dispose();
      }
      writeFileSync(`${OUT}-${targetId}.json`, JSON.stringify(results, null, 2));
      writeFileSync(`${OUT}-clips.json`, JSON.stringify(SPIKE_CLIPS, null, 2));
    }, 300_000);
  }
});
