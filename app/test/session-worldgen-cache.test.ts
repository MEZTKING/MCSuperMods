import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createMemoryFileSystem } from '@msm/core';
import { unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import type { VanillaWorldgenFiles } from '../src/shared/platform';
import { newSession } from './session-fixture';

/**
 * ADR 0119 D4 and the plan's rule: the vanilla worldgen files read from the user's jar stay in
 * the local cache. They are in no export, no project write and no AI helper context.
 */
const MARKER = 'msm-vanilla-worldgen-marker';

/** A cached answer as main would give it, every file carrying the marker. */
const CACHED: VanillaWorldgenFiles = {
  version: '9.9-msm-test',
  files: {
    'worldgen/noise_settings': { 'minecraft:overworld': { marker: MARKER, sea_level: 63 } },
    dimension_type: { 'minecraft:overworld': { marker: MARKER } },
  },
  fileCount: 2,
  resolvedBiomeLists: null,
};

const runtimeBytes = new Uint8Array([0x50, 0x4b, 0x05, 0x06, 1, 2, 3]);
const decoder = new TextDecoder();

function containsMarker(zip: Uint8Array): string[] {
  return Object.entries(unzipSync(zip))
    .filter(([, data]) => decoder.decode(data).includes(MARKER))
    .map(([name]) => name);
}

describe('vanilla worldgen files stay in the cache', () => {
  it('are read by no export and written into no project file', async () => {
    const fs = createMemoryFileSystem();
    const { session, platform, calls } = newSession(fs);
    let worldgenReads = 0;
    platform.minecraft = {
      ...platform.minecraft,
      readWorldgenFiles: async () => {
        worldgenReads += 1;
        return structuredClone(CACHED);
      },
    };
    platform.exports = { ...platform.exports, runtimeJar: async () => runtimeBytes };
    await session.newProject();
    session.addElement({ id: 'demo:hills', kind: 'minecraft:worldgen/noise_settings' });
    session.addElement({ id: 'demo:high', kind: 'minecraft:dimension_type' });
    await session.save();

    const data = await session.exportPack('data', 'zip');
    expect(data.ok).toBe(true);
    const jar = await session.buildContentJar();
    expect(jar.report.problems.filter((problem) => problem.severity === 'error')).toEqual([]);
    expect(jar.data).toBeDefined();

    expect(worldgenReads).toBe(0);
    for (const saved of calls.saved) expect(containsMarker(saved.data)).toEqual([]);
    expect(containsMarker(jar.data as Uint8Array)).toEqual([]);
    // The data pack holds only the project's own worldgen files.
    const names = Object.keys(unzipSync(calls.saved.at(-1)?.data ?? new Uint8Array()));
    expect(names.filter((name) => name.startsWith('data/minecraft/worldgen/'))).toEqual([]);
    expect(fs.list().length).toBeGreaterThan(0);
    for (const path of fs.list()) {
      expect(decoder.decode(await fs.readFile(path)), path).not.toContain(MARKER);
    }
  });

  it('are never reached by the AI helper or any exporter code', async () => {
    // Every file that builds the AI helper's context or runs an export: none names the call.
    const root = fileURLToPath(new URL('../..', import.meta.url));
    const folders = [
      'app/src/renderer/src/ai',
      'app/src/main/ai',
      'packages/ai/src',
      'packages/exporters/src',
      'packages/core/src',
    ];
    const offenders: string[] = [];
    for (const folder of folders) {
      for (const file of await sourceFiles(join(root, folder))) {
        const text = await readFile(file, 'utf8');
        if (/readWorldgenFiles|minecraftWorldgenFiles|worldgenFiles/.test(text)) {
          offenders.push(file);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});

async function sourceFiles(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await sourceFiles(path)));
    else if (/\.(ts|tsx)$/.test(entry.name)) out.push(path);
  }
  return out;
}
