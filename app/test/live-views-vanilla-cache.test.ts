import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createMemoryFileSystem } from '@msm/core';
import { unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import type { VanillaDataFiles } from '../src/shared/platform';
import { newSession } from './session-fixture';

/**
 * ADR 0120 D11 and the plan's rule: the vanilla data files the live views read from the user's
 * jar stay in the local cache. They are in no export, no project write and no AI helper context
 * (as `session-worldgen-cache.test.ts` checks for the world generation files).
 */
const MARKER = 'msm-vanilla-live-view-marker';

/** A cached answer as main would give it, every file carrying the marker. */
const CACHED: VanillaDataFiles = {
  version: '9.9-msm-test',
  folders: {
    loot_table: { 'minecraft:blocks/made_up': { marker: MARKER, pools: [] } },
    advancement: { 'minecraft:story/made_up': { marker: MARKER, criteria: {} } },
    'tags/item': { 'minecraft:made_up': { marker: MARKER, values: [] } },
  },
  fileCount: 3,
};

const runtimeBytes = new Uint8Array([0x50, 0x4b, 0x05, 0x06, 1, 2, 3]);
const decoder = new TextDecoder();

function containsMarker(zip: Uint8Array): string[] {
  return Object.entries(unzipSync(zip))
    .filter(([, data]) => decoder.decode(data).includes(MARKER))
    .map(([name]) => name);
}

describe('vanilla live view data files stay in the cache', () => {
  it('are read by no export and written into no project file', async () => {
    const fs = createMemoryFileSystem();
    const { session, platform, calls } = newSession(fs);
    let dataReads = 0;
    platform.minecraft = {
      ...platform.minecraft,
      readDataFiles: async () => {
        dataReads += 1;
        return structuredClone(CACHED);
      },
    };
    platform.exports = { ...platform.exports, runtimeJar: async () => runtimeBytes };
    await session.newProject();
    session.addElement({ id: 'demo:blocks/made_up', kind: 'minecraft:loot_table' });
    session.addElement({ id: 'demo:story/made_up', kind: 'minecraft:advancement' });
    await session.save();

    const data = await session.exportPack('data', 'zip');
    expect(data.ok).toBe(true);
    const jar = await session.buildContentJar();
    expect(jar.report.problems.filter((problem) => problem.severity === 'error')).toEqual([]);
    expect(jar.data).toBeDefined();

    expect(dataReads).toBe(0);
    for (const saved of calls.saved) expect(containsMarker(saved.data)).toEqual([]);
    expect(containsMarker(jar.data as Uint8Array)).toEqual([]);
    // The data pack holds only the project's own tables and advancements.
    const names = Object.keys(unzipSync(calls.saved.at(-1)?.data ?? new Uint8Array()));
    expect(names.filter((name) => name.startsWith('data/minecraft/'))).toEqual([]);
    expect(fs.list().length).toBeGreaterThan(0);
    for (const path of fs.list()) {
      expect(decoder.decode(await fs.readFile(path)), path).not.toContain(MARKER);
    }
  });

  it('are never reached by the AI helper or any exporter code', async () => {
    // Every file that builds the AI helper's context or runs an export: none names the call or
    // the live views' reader.
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
        if (
          /readDataFiles|minecraftDataFiles|vanilla-data|VanillaDataReader|LIVE_VIEW_DATA_FOLDERS/.test(
            text,
          )
        ) {
          offenders.push(file);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('are read in the renderer only by the live views reader', async () => {
    const root = fileURLToPath(new URL('../src/renderer/src', import.meta.url));
    const offenders: string[] = [];
    for (const file of await sourceFiles(root)) {
      if (file.endsWith(join('liveviews', 'vanilla-data.ts'))) continue;
      if (/readDataFiles/.test(await readFile(file, 'utf8'))) offenders.push(file);
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
