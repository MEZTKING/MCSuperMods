import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { LOOKS_ASSET_PATTERNS } from '@msm/interop';
import { builtInTargets } from '@msm/targets';
import { unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { InvokeChannels, ipcContract } from '../src/shared/ipc-contract';
import { LIVE_VIEW_DATA_FOLDERS, LOOKS_DATA_FOLDERS } from '../src/shared/platform';

/**
 * The looks and sounds views' jar folders (ADR 0121 D3; B619 3S4) against the client jar Fabric
 * Loom caches for the engine-mod build: entry names only, no file is read or kept. Skipped
 * without a jar: MSM never bundles Mojang files.
 */
function loomJar(mcVersion: string): string | undefined {
  const gradleHome = process.env.GRADLE_USER_HOME ?? join(homedir(), '.gradle');
  const path = join(gradleHome, 'caches', 'fabric-loom', mcVersion, 'minecraft-client.jar');
  return existsSync(path) ? path : undefined;
}

describe('LOOKS_DATA_FOLDERS (B621)', () => {
  it("names B619's data folders, sorted, as plain keys beside the live views' ones", () => {
    expect(LOOKS_DATA_FOLDERS).toHaveLength(23);
    expect([...LOOKS_DATA_FOLDERS]).toEqual([...LOOKS_DATA_FOLDERS].sort());
    for (const folder of LOOKS_DATA_FOLDERS) {
      expect(LIVE_VIEW_DATA_FOLDERS).not.toContain(folder);
      expect(
        ipcContract[InvokeChannels.minecraftDataFiles].request.safeParse({
          mcVersion: '26.3',
          folders: [folder],
        }).success,
        folder,
      ).toBe(true);
    }
  });
});

describe('the looks and sounds views in the client jar (ADR 0121 D3)', () => {
  for (const { target } of builtInTargets) {
    const jar = loomJar(target.mcVersion);
    it.skipIf(jar === undefined)(`finds every folder in the ${target.mcVersion} jar`, async () => {
      const names: string[] = [];
      unzipSync(new Uint8Array(await readFile(jar as string)), {
        filter: (file) => {
          names.push(file.name);
          return false;
        },
      });
      for (const folder of LOOKS_DATA_FOLDERS) {
        const count = names.filter(
          (name) => name.startsWith(`data/minecraft/${folder}/`) && name.endsWith('.json'),
        ).length;
        // `block_sound_set` is new in 26.4 (B619 3S4).
        if (folder === 'block_sound_set' && target.mcVersion === '26.3') {
          expect(count, folder).toBe(0);
        } else {
          expect(count, folder).toBeGreaterThan(0);
        }
      }
      // Every pattern matches something, and the sounds stay out of the jar list.
      for (const pattern of LOOKS_ASSET_PATTERNS) {
        expect(
          names.some((name) => pattern.test(name)),
          String(pattern),
        ).toBe(true);
      }
      const looks = names.filter((name) => LOOKS_ASSET_PATTERNS.some((p) => p.test(name)));
      // B619 counted about 1,170 texture, asset and shader files on each target.
      expect(looks.length).toBeGreaterThan(900);
      expect(looks.length).toBeLessThan(2000);
      expect(looks.some((name) => name.endsWith('.ogg'))).toBe(false);
    });
  }
});
