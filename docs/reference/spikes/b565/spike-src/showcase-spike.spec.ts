/**
 * B565 throwaway: Z2–Z5, Z9, Z13 in the real app under SwiftShader. Mounts each spike clip over
 * the app through the temporary `window.__b565` hook; never committed.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'playwright/test';
import { type LaunchedApp, launchApp } from './fixtures';

const WEBGL_ARGS = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] as const;
const OUT = process.env.B565_OUT ?? '/tmp/b565-e2e';
const TARGETS = (process.env.B565_TARGETS ?? 'mc-26.3,mc-26.4').split(',');
const PART = process.env.B565_PART ?? 'all';

let launched: LaunchedApp | undefined;
test.afterEach(async () => {
  await launched?.close();
  launched = undefined;
});

type Api = {
  prepare(e: string, t: string): Promise<number>;
  mount(c: string, t: string, o: object): Promise<void>;
  unmount(): void;
  stats(): Promise<Record<string, unknown> | null>;
  fps(s: number): { fps: number; frames: number; worstGapMs: number } | null;
  lateCapture(): Promise<unknown>;
  memory(): { used: number; total: number } | null;
  clips: string[];
  lengths: Record<string, [number, number]>;
};

test('B565 measures', async () => {
  test.setTimeout(60 * 60_000);
  mkdirSync(OUT, { recursive: true });
  launched = await launchApp({ args: [...WEBGL_ARGS, '--js-flags=--expose-gc'] });
  const { window, app } = launched;
  const warnings: string[] = [];
  window.on('console', (message) => {
    const text = message.text();
    if (/WebGL|context|GL_|webgl/i.test(text)) warnings.push(`${message.type()}: ${text.slice(0, 300)}`);
  });
  await window.waitForLoadState('domcontentloaded');
  await window.waitForTimeout(3000);
  // Z13: count audio contexts and media plays.
  await window.evaluate(() => {
    const w = window as unknown as Record<string, unknown>;
    w.__audio = 0;
    const Orig = window.AudioContext;
    window.AudioContext = class extends Orig {
      constructor(...args: ConstructorParameters<typeof AudioContext>) {
        super(...args);
        w.__audio = (w.__audio as number) + 1;
      }
    } as typeof AudioContext;
    const play = HTMLMediaElement.prototype.play;
    w.__plays = 0;
    HTMLMediaElement.prototype.play = function (this: HTMLMediaElement) {
      w.__plays = (w.__plays as number) + 1;
      return play.call(this);
    };
  });
  const loadStart = Date.now();
  await window.evaluate(async () => {
    await (window as unknown as { __b565: () => Promise<unknown> }).__b565();
  });
  const harnessLoadMs = Date.now() - loadStart;
  const api = <T,>(fn: (a: Api, arg: unknown) => T | Promise<T>, arg?: unknown): Promise<T> =>
    window.evaluate(
      ([source, value]) => {
        const a = (window as unknown as { __b565api: Api }).__b565api;
        // biome-ignore lint/security/noGlobalEval: throwaway spike
        return (0, eval)(source)(a, value);
      },
      [fn.toString(), arg] as const,
    ) as Promise<T>;
  const clips = await api((a) => a.clips);
  const lengths = await api((a) => a.lengths);
  const gpu = async () => {
    const metrics = await app.evaluate(({ app: electronApp }) => electronApp.getAppMetrics());
    const out: Record<string, number> = {};
    for (const one of metrics) out[one.type] = (out[one.type] ?? 0) + Math.round(one.memory.workingSetSize / 1024);
    return out;
  };
  const results: Record<string, unknown> = { harnessLoadMs, targets: {}, loadStart: (await import('node:os')).loadavg(), cpus: (await import('node:os')).cpus().length };

  for (const targetId of TARGETS) {
    const perTarget: Record<string, unknown> = {};
    (results.targets as Record<string, unknown>)[targetId] = perTarget;
    if (PART === 'all' || PART === 'play') {
      // Z2 cold-ish (first mount per target), Z3, Z5, Z9, Z13: each clip plays its whole length.
      const plays: Record<string, unknown> = {};
      for (const clip of clips) {
        const [length, stillAt] = lengths[clip] as [number, number];
        await api((a, arg) => {
          const [c, t, still] = arg as [string, string, number];
          return a.mount(c, t, { width: 320, height: 180, smaller: true, captureAt: [0, still] });
        }, [clip, targetId, stillAt]);
        await window.waitForFunction(
          () => (window as unknown as { __b565api: Api }).__b565api !== undefined,
        );
        const deadline = Date.now() + 120_000;
        for (;;) {
          const s = await api((a) => a.stats());
          if (s !== null && ((s.loops as number) >= 1 || (s.tick as number) >= length - 2)) break;
          if (Date.now() > deadline) break;
          await window.waitForTimeout(500);
        }
        const fps = await api((a) => a.fps(30));
        const late = await api((a) => a.lateCapture());
        const s = (await api((a) => a.stats())) as Record<string, unknown>;
        const captures = (s.captures as { tick: number; ms: number; url: string; colours: number }[]) ?? [];
        for (const capture of captures) {
          const name = `${targetId}-${clip}-t${capture.tick}.png`;
          writeFileSync(join(OUT, name), Buffer.from(capture.url.split(',')[1] as string, 'base64'));
        }
        plays[clip] = {
          ...s,
          captures: captures.map((c) => ({ tick: c.tick, ms: Math.round(c.ms * 10) / 10, colours: c.colours, bytes: c.url.length })),
          late,
          fps,
          audio: await window.evaluate(() => [(window as unknown as { __audio: number }).__audio, (window as unknown as { __plays: number }).__plays]),
        };
        await api((a) => a.unmount());
      }
      perTarget.plays = plays;
      // Frame rate at 640 by 360 with Smaller picture (a 320 by 180 drawing buffer).
      const big: Record<string, unknown> = {};
      for (const clip of clips) {
        await api((a, arg) => {
          const [c, t] = arg as [string, string];
          return a.mount(c, t, { width: 640, height: 360, smaller: true, captureAt: [] });
        }, [clip, targetId]);
        await window.waitForTimeout(6000);
        big[clip] = { fps: await api((a) => a.fps(5)), canvas: ((await api((a) => a.stats())) as Record<string, unknown>).canvas };
        await api((a) => a.unmount());
      }
      perTarget.fps640 = big;
    }
    if (PART === 'all' || PART === 'churn') {
      // Z4 and Z2 warm: 50 mounts and unmounts, cycling through the ten.
      await window.waitForTimeout(1000);
      const memBefore = await api((a) => a.memory());
      const gpuBefore = await gpu();
      const mounts: { clip: string; firstFrameMs: number | null; areaMs: number; lowerCached: boolean }[] = [];
      for (let i = 0; i < 50; i += 1) {
        const clip = clips[i % clips.length] as string;
        await api((a, arg) => {
          const [c, t] = arg as [string, string];
          return a.mount(c, t, { width: 320, height: 180, smaller: true, captureAt: [] });
        }, [clip, targetId]);
        const deadline = Date.now() + 20_000;
        let s: Record<string, unknown> | null = null;
        for (;;) {
          s = await api((a) => a.stats());
          if (s !== null && s.firstFrameMs !== null) break;
          if (Date.now() > deadline) break;
          await window.waitForTimeout(50);
        }
        await window.waitForTimeout(300);
        mounts.push({
          clip,
          firstFrameMs: (s?.firstFrameMs as number | null) ?? null,
          areaMs: Math.round((s?.areaMs as number) ?? 0),
          lowerCached: (s?.lowerCached as boolean) ?? false,
        });
        await api((a) => a.unmount());
      }
      await window.waitForTimeout(2000);
      const memAfter = await api((a) => a.memory());
      const gpuAfter = await gpu();
      perTarget.churn = { memBefore, memAfter, gpuBefore, gpuAfter, mounts };
    }
  }
  results.warnings = warnings;
  results.loadEnd = (await import('node:os')).loadavg();
  writeFileSync(join(OUT, 'results.json'), JSON.stringify(results, null, 2));
  expect(true).toBe(true);
});
