import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { builtInTargets } from '@msm/targets';
import { unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { LIVE_VIEW_DATA_FOLDERS } from '../src/shared/platform';

/**
 * The live views' folders against the client jar Fabric Loom caches for the engine-mod build
 * (`<gradle user home>/caches/fabric-loom/<mc version>/minecraft-client.jar`): entry names only,
 * no file is read or kept. Skipped without a jar: MSM never bundles Mojang files.
 */
function loomJar(mcVersion: string): string | undefined {
  const gradleHome = process.env.GRADLE_USER_HOME ?? join(homedir(), '.gradle');
  const path = join(gradleHome, 'caches', 'fabric-loom', mcVersion, 'minecraft-client.jar');
  return existsSync(path) ? path : undefined;
}

describe('the live views data folders in the client jar (ADR 0120 D11)', () => {
  for (const { target } of builtInTargets) {
    const jar = loomJar(target.mcVersion);
    it.skipIf(jar === undefined)(`each has JSON files in the ${target.mcVersion} jar`, async () => {
      const names: string[] = [];
      unzipSync(new Uint8Array(await readFile(jar as string)), {
        filter: (file) => {
          names.push(file.name);
          return false;
        },
      });
      const worldgen = target.worldgen.terrainPreview?.dataFolders ?? [];
      let total = 0;
      for (const folder of LIVE_VIEW_DATA_FOLDERS) {
        // Not already a world generation folder, nor inside or around one.
        for (const other of worldgen) {
          expect(folder === other || folder.startsWith(`${other}/`), folder).toBe(false);
          expect(other.startsWith(`${folder}/`), folder).toBe(false);
        }
        const count = names.filter(
          (name) => name.startsWith(`data/minecraft/${folder}/`) && name.endsWith('.json'),
        ).length;
        expect(count, folder).toBeGreaterThan(0);
        total += count;
      }
      // B600 counted 3,875 more files on 26.3; a new snapshot may add some.
      expect(total).toBeGreaterThan(3000);
      expect(total).toBeLessThan(6000);
      expect(names.some((name) => name.startsWith('data/minecraft/item_modifier/'))).toBe(false);
    });
  }
});
