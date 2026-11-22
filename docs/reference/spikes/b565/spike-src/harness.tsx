/**
 * B565 throwaway: mounts one clip (a `TryItScene` over a `TryItArea` stepped by the spike
 * player) over the app, for the e2e measurements Z2–Z5, Z9 and Z13. Never committed.
 */
import { createEmptyProject, ElementKindRegistry, lowerProjectAsync, registerPlugin } from '@msm/core';
import type { ContentBundle, Target } from '@msm/plugin-api';
import { libraryExamples } from '@msm/plugin-library';
import { SCRIPT_API } from '@msm/plugin-scripting';
import { builtInTargets } from '@msm/targets';
import { createRoot, type Root } from 'react-dom/client';
import { builtInPlugins } from '../plugins/built-in';
import { bundleAssetReader, bundlePreviewProject } from '../preview/bundle-source';
import { fluidLooks } from '../tryit/fluids/fluid-pass';
import { TryItScene } from '../tryit/render/TryItScene';
import { ruleBooksOf, TryItArea, toSimFiles } from '../tryit/session-source';
import { SPIKE_CLIPS } from './clips';
import { SpikePlayer } from './player';


interface Prepared {
  bundle: ContentBundle;
  files: Map<string, string | Uint8Array>;
  project: ReturnType<typeof bundlePreviewProject>;
  target: Target;
  ms: number;
}

const cache = new Map<string, Prepared>();
let registry: ElementKindRegistry | null = null;

function targetOf(id: string): Target {
  const found = builtInTargets.find((entry) => entry.target.id === id);
  if (found === undefined) throw new Error(`no target ${id}`);
  return found.target;
}

async function prepare(exampleId: string, targetId: string): Promise<Prepared & { cached: boolean }> {
  const key = `${exampleId}@${targetId}`;
  const hit = cache.get(key);
  if (hit !== undefined) return { ...hit, cached: true };
  const t0 = performance.now();
  if (registry === null) {
    registry = new ElementKindRegistry();
    for (const plugin of builtInPlugins) registerPlugin(registry, plugin);
  }
  const target = targetOf(targetId);
  const example = libraryExamples.find((one) => one.id === exampleId);
  if (example === undefined) throw new Error(`no example ${exampleId}`);
  const bundle = await example.build({ namespace: 'showcase', projectName: 'showcase', target, values: {} });
  const project = bundlePreviewProject(createEmptyProject('showcase'), bundle);
  const lowered = await lowerProjectAsync(project, registry, target, { plugins: [...builtInPlugins] });
  const files = toSimFiles(lowered.files);
  const prepared = { bundle, files, project, target, ms: performance.now() - t0 };
  cache.set(key, prepared);
  return { ...prepared, cached: false };
}

export interface MountOptions {
  width: number;
  height: number;
  smaller: boolean;
  /** Ticks at which to take a still in `onFrameDrawn`. */
  captureAt: number[];
}

interface Live {
  root: Root;
  host: HTMLDivElement;
  area: TryItArea;
  player: SpikePlayer;
  stats: {
    mountAt: number;
    areaMs: number;
    lowerMs: number;
    lowerCached: boolean;
    scriptsMs: number | null;
    firstFrameAt: number | null;
    frames: number;
    frameTimes: number[];
    captures: { tick: number; ms: number; url: string; colours: number | null }[];
    late: { url: string; colours: number | null } | null;
    canvas: { width: number; height: number } | null;
    maxRebuildMs: number;
    errors: string[];
  };
}

let live: Live | null = null;

function colourCount(url: string): Promise<number> {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = image.width;
      canvas.height = image.height;
      const context = canvas.getContext('2d');
      if (context === null) return resolve(-1);
      context.drawImage(image, 0, 0);
      const data = context.getImageData(0, 0, image.width, image.height).data;
      const seen = new Set<number>();
      for (let i = 0; i < data.length; i += 4) {
        seen.add(((data[i] as number) << 24) | ((data[i + 1] as number) << 16) | ((data[i + 2] as number) << 8) | (data[i + 3] as number));
        if (seen.size > 5000) break;
      }
      resolve(seen.size);
    };
    image.onerror = () => resolve(-2);
    image.src = url;
  });
}

async function mount(clipId: string, targetId: string, options: MountOptions): Promise<void> {
  if (live !== null) unmount();
  const mountAt = performance.now();
  const clip = SPIKE_CLIPS.find((one) => one.id === clipId);
  if (clip === undefined) throw new Error(`no clip ${clipId}`);
  const prepared = await prepare(clip.exampleId, targetId);
  const t1 = performance.now();
  const scripting = (globalThis as { msm?: { scripting?: { transpile(s: string, n: string): Promise<{ js: string } | { problems: { message: string; line?: number }[] }> } } }).msm?.scripting;
  const transpiled: number[] = [];
  const area = new TryItArea({
    files: prepared.files,
    target: prepared.target,
    seed: 1,
    ruleBooks: ruleBooksOf(prepared.project),
    readProjectAsset: bundleAssetReader(prepared.bundle, async () => null),
    // Z13: no `audio`, so the area shows captions only and plays nothing.
    ...(scripting === undefined ? {} : { scripts: { transpile: async (s: string, n: string) => { const out = await scripting.transpile(s, n); transpiled.push(performance.now() - mountAt); return out; }, api: SCRIPT_API } }),
  });
  const player = new SpikePlayer(area, clip);
  player.start();
  const areaMs = performance.now() - t1;
  const host = document.createElement('div');
  host.dataset.testid = 'b565-clip';
  host.style.cssText = `position:fixed;left:0;top:0;width:${options.width}px;height:${options.height}px;z-index:99999;background:#000`;
  document.body.appendChild(host);
  const root = createRoot(host);
  const stats: Live['stats'] = {
    mountAt,
    areaMs,
    lowerMs: prepared.ms,
    lowerCached: prepared.cached,
    scriptsMs: null,
    firstFrameAt: null,
    frames: 0,
    frameTimes: [],
    captures: [],
    late: null,
    canvas: null,
    maxRebuildMs: 0,
    errors: [],
  };
  const current: Live = { root, host, area, player, stats };
  (stats as unknown as { transpiled: number[] }).transpiled = transpiled;
  let ruleSeen = false;
  area.subscribe(() => {
    if (ruleSeen) return;
    const hit = area.whatHappened.find((entry) => entry.text.includes('ran as a script'));
    if (hit !== undefined) {
      ruleSeen = true;
      (stats as unknown as { firstRuleMs: number; firstRuleTick: number }).firstRuleMs = performance.now() - mountAt;
      (stats as unknown as { firstRuleTick: number }).firstRuleTick = player.tick;
    }
  });
  live = current;
  const scriptsStart = performance.now();
  void area.loadScripts().then(() => {
    stats.scriptsMs = performance.now() - scriptsStart;
  });
  const pending = new Set(options.captureAt);
  const fluids = fluidLooks(area.source.fluids.catalogue.all());
  root.render(
    <TryItScene
      grid={area.source.world}
      camera={() => player.camera()}
      files={area.files}
      folders={prepared.target.folders.resource}
      vanilla={null}
      readProjectAsset={bundleAssetReader(prepared.bundle, async () => null)}
      particles={area.particles}
      fluids={fluids}
      mobs={area.mobField}
      vehicles={{
        snapshots: () => area.source.vehicles.snapshots(),
        kind: (type) => area.source.vehicles.types.get(type),
        log: area.source.log,
      }}
      partialTick={() => player.alpha}
      smaller={options.smaller}
      onFrame={(elapsed) => {
        if (stats.firstFrameAt !== null) player.advance(elapsed);
      }}
      onFrameDrawn={(drawn) => {
        const now = performance.now();
        if (stats.firstFrameAt === null) stats.firstFrameAt = now;
        stats.frames += 1;
        stats.frameTimes.push(now);
        stats.maxRebuildMs = Math.max(stats.maxRebuildMs, drawn.rebuildMs);
        const canvas = host.querySelector('canvas');
        if (canvas !== null) stats.canvas = { width: canvas.width, height: canvas.height };
        const due = [...pending].find((tick) => player.tick >= tick);
        if (due !== undefined && canvas !== null) {
          pending.delete(due);
          const t = performance.now();
          const url = canvas.toDataURL('image/png');
          stats.captures.push({ tick: player.tick, ms: performance.now() - t, url, colours: null });
        }
      }}
      onWebGLUnavailable={() => stats.errors.push('webgl unavailable')}
      label={`Clip: ${clip.id}`}
    />,
  );
}

function unmount(): void {
  if (live === null) return;
  live.root.unmount();
  live.host.remove();
  live.area.dispose();
  live = null;
}

async function stats(): Promise<unknown> {
  if (live === null) return null;
  const s = live.stats;
  for (const capture of s.captures) if (capture.colours === null) capture.colours = await colourCount(capture.url);
  return {
    ...s,
    firstFrameMs: s.firstFrameAt === null ? null : s.firstFrameAt - s.mountAt,
    tick: live.player.tick,
    loops: live.player.loops,
    lines: live.area.whatHappened.map((entry) => `t${entry.tick} [${entry.kind}] ${entry.text}`),
    mobs: live.area.source.entities.count,
    frameTimes: undefined,
  };
}

/** Frames a second over the last `seconds`. */
function fps(seconds: number): { fps: number; frames: number; worstGapMs: number; medianGapMs: number; p95GapMs: number; over50: number } | null {
  if (live === null) return null;
  const times = live.stats.frameTimes;
  const end = times[times.length - 1] ?? 0;
  const startAt = (live.stats.firstFrameAt ?? 0) + 1000;
  const inside = times.filter((t) => t >= Math.max(startAt, end - seconds * 1000));
  const gaps: number[] = [];
  for (let i = 1; i < inside.length; i += 1) gaps.push((inside[i] as number) - (inside[i - 1] as number));
  gaps.sort((a, b) => a - b);
  const medianGapMs = gaps[Math.floor(gaps.length / 2)] ?? 0;
  const p95GapMs = gaps[Math.floor(gaps.length * 0.95)] ?? 0;
  const over50 = gaps.filter((g) => g > 50).length;
  let worst = 0;
  for (let i = 1; i < inside.length; i += 1) worst = Math.max(worst, (inside[i] as number) - (inside[i - 1] as number));
  const span = inside.length > 1 ? ((inside[inside.length - 1] as number) - (inside[0] as number)) / 1000 : 0;
  return { fps: span > 0 ? (inside.length - 1) / span : 0, frames: inside.length, worstGapMs: worst, medianGapMs, p95GapMs, over50 };
}

/** A still taken now, outside `onFrameDrawn` (Z5: without `preserveDrawingBuffer`). */
async function lateCapture(): Promise<unknown> {
  if (live === null) return null;
  const canvas = live.host.querySelector('canvas');
  if (canvas === null) return null;
  const url = canvas.toDataURL('image/png');
  return { colours: await colourCount(url) };
}

function memory(): { used: number; total: number } | null {
  const gc = (globalThis as { gc?: () => void }).gc;
  if (gc !== undefined) gc();
  const m = (performance as unknown as { memory?: { usedJSHeapSize: number; totalJSHeapSize: number } }).memory;
  return m === undefined ? null : { used: m.usedJSHeapSize, total: m.totalJSHeapSize };
}

const api = { prepare: async (e: string, t: string) => (await prepare(e, t)).ms, mount, unmount, stats, fps, lateCapture, memory, clips: SPIKE_CLIPS.map((c) => c.id), lengths: Object.fromEntries(SPIKE_CLIPS.map((c) => [c.id, [c.length, c.stillAt]])) };
(globalThis as { __b565api?: unknown }).__b565api = api;
export default api;
