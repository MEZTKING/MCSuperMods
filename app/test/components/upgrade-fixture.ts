/// <reference types="node" />
/**
 * B816's fixtures for the report's component tests (B818): `fixtures/sample-worldgen` opened in
 * a session on the release target, with the things the next target's change set touches added
 * on demand (noise settings holding `default_block`, a large dripstone feature, a function that
 * pours flowing lava), and the next target to move to.
 */

import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createMemoryFileSystem, type MemoryFileSystem } from '@msm/core';
import { builtInTargets, defaultTargetId, targetById } from '@msm/targets';
import { expect } from 'vitest';
import { builtInPlugins } from '../../src/renderer/src/plugins/built-in';
import { ProjectSession } from '../../src/renderer/src/session/project-session';
import type { PlatformAdapter } from '../../src/shared/platform';

const repoRoot = join(__dirname, '..', '..', '..');

export const release = builtInTargets.find((entry) => entry.target.id === defaultTargetId)
  ?.target as (typeof builtInTargets)[number]['target'];
export const next = builtInTargets.find((entry) => entry.target.previous === defaultTargetId)
  ?.target as (typeof builtInTargets)[number]['target'];
if (release === undefined || next === undefined) {
  throw new Error('A release target and the target after it are needed.');
}

/** The change ids the fixture's things touch. */
export const DEFAULT_BLOCK = 'formats:minecraft:resource/worldgen/noise_settings#/default_block';
export const SPELEOTHEM = 'ids:worldgen/feature_type/large_dripstone';
export const FLOWING_LAVA = 'ids:fluid/flowing_lava';

export const HILLS = 'msm_sample_worldgen:hills';
export const SPIKES = 'msm_sample_worldgen:spikes';
export const POUR = 'msm_sample_worldgen:pour';

export const LARGE_DRIPSTONE = {
  type: 'minecraft:large_dripstone',
  floor_to_ceiling_search_range: 30,
  column_radius: { type: 'minecraft:uniform', min_inclusive: 3, max_inclusive: 19 },
  height_scale: { type: 'minecraft:uniform', min_inclusive: 0.4, max_inclusive: 2 },
  max_column_radius_to_cave_height_ratio: 0.33,
  stalactite_bluntness: { type: 'minecraft:uniform', min_inclusive: 0.3, max_inclusive: 0.9 },
  stalagmite_bluntness: { type: 'minecraft:uniform', min_inclusive: 0.4, max_inclusive: 1 },
  wind_speed: { type: 'minecraft:uniform', min_inclusive: 0, max_inclusive: 0.3 },
  min_radius_for_wind: 4,
  min_bluntness_for_wind: 0.6,
};

/** The file a vendored URL names: a `file:` URL, or Vite's `/@fs/` URL under happy-dom. */
function vendoredPath(url: URL): string {
  if (url.protocol === 'file:') return fileURLToPath(url.href);
  const prefix = '/@fs/';
  if (url.pathname.startsWith(prefix)) {
    return decodeURIComponent(url.pathname.slice(prefix.length - 1));
  }
  throw new Error(`Cannot read ${url.href} from the file system.`);
}

const unavailable = async (): Promise<never> => {
  throw new Error('Not available in this test.');
};

/**
 * A platform over `fs` with the vendored target data read from disk; every other service
 * rejects (`../session-fixture` is outside the component tests' project, so this is its own).
 */
function platformOver(fs: MemoryFileSystem): PlatformAdapter {
  const rejecting = new Proxy({}, { get: () => unavailable });
  const own: Partial<PlatformAdapter> = {
    app: {
      info: async () => ({ version: '0.1.0-test', electron: '0', platform: 'test' }),
      launchNotice: async () => null,
    },
    targets: {
      readVendored: async (targetId, key) => {
        const bundle = targetById(targetId);
        if (bundle === undefined) throw new Error(`Unknown target ${targetId}`);
        const buffer = await readFile(vendoredPath(bundle.vendored[key]));
        return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
      },
    },
    project: {
      openRoot: async () => ({ ok: true }),
      createRoot: async () => ({ ok: true }),
      closeRoot: async () => {},
      currentRoot: async () => '/projects/demo',
      recent: async () => [],
      openRecent: async () => ({ ok: false, reason: 'none' }),
      removeRecent: async () => {},
      clearRecent: async () => {},
    },
    fs,
  };
  return new Proxy(own, {
    get: (target, key) => (key in target ? target[key as keyof PlatformAdapter] : rejecting),
  }) as PlatformAdapter;
}

async function readFolder(folder: string, prefix = ''): Promise<Record<string, Uint8Array>> {
  const out: Record<string, Uint8Array> = {};
  for (const entry of await readdir(join(folder, prefix), { withFileTypes: true })) {
    const path = prefix === '' ? entry.name : `${prefix}/${entry.name}`;
    if (entry.isDirectory()) Object.assign(out, await readFolder(folder, path));
    else out[path] = new Uint8Array(await readFile(join(folder, path)));
  }
  return out;
}

/** What to add to sample-worldgen before the dry run. */
export interface FixtureThings {
  /** Noise settings made on the release target (holding `default_block`). */
  hills?: boolean;
  /** A large dripstone feature (the next target renames its type). */
  spikes?: boolean;
  /** A function that pours flowing lava (gone in the next target). */
  pour?: boolean;
}

/** Opens sample-worldgen with `things` added and its validation flushed. */
export async function openSampleWorldgen(things: FixtureThings = {}) {
  const files = await readFolder(join(repoRoot, 'fixtures', 'sample-worldgen'));
  const fs = createMemoryFileSystem(files);
  const session = new ProjectSession(platformOver(fs), {
    plugins: builtInPlugins,
    targets: builtInTargets,
    now: () => '2026-01-01T00:00:00.000Z',
    validationDelay: 0,
  });
  expect(await session.loadSnapshot('/fixtures/sample-worldgen')).toEqual({ ok: true });
  if (things.hills === true) {
    session.addElement({ id: HILLS, kind: 'minecraft:worldgen/noise_settings' });
  }
  if (things.spikes === true) {
    session.addElement({ id: SPIKES, kind: 'minecraft:worldgen/feature', data: LARGE_DRIPSTONE });
  }
  if (things.pour === true) {
    session.addElement({
      id: POUR,
      kind: 'minecraft:function',
      data: { lines: ['setblock ~ ~ ~ minecraft:flowing_lava'] },
    });
  }
  await session.flushValidation();
  return { session, fs };
}
