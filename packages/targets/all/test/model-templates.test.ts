import { existsSync } from 'node:fs';
import { open } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { builtInTargets } from '../src/index';

/**
 * `BlockFacts.modelTemplates` against the client jar's listing (ADR 0094 D10). The jar is the
 * one Fabric Loom caches for the engine-mod build (`<gradle user home>/caches/fabric-loom/<mc
 * version>/minecraft-client.jar`); `MSM_CLIENT_JAR_<id>` (for example `MSM_CLIENT_JAR_MC_26_3`)
 * names another copy. Only the file names are read, never a file's contents. Without a jar the
 * test is skipped: MSM never bundles Mojang files.
 */
function clientJarPath(id: string, mcVersion: string): string | undefined {
  const override = process.env[`MSM_CLIENT_JAR_${id.toUpperCase().replace(/[-.]/g, '_')}`];
  if (override !== undefined && override !== '') return existsSync(override) ? override : undefined;
  const gradleHome = process.env.GRADLE_USER_HOME ?? join(homedir(), '.gradle');
  const path = join(gradleHome, 'caches', 'fabric-loom', mcVersion, 'minecraft-client.jar');
  return existsSync(path) ? path : undefined;
}

/** The entry names of a zip file, read from its central directory (no zip64: under 65,535 entries). */
async function zipEntryNames(path: string): Promise<string[]> {
  const file = await open(path, 'r');
  try {
    const { size } = await file.stat();
    const tailLength = Math.min(size, 22 + 0xffff);
    const tail = Buffer.alloc(tailLength);
    await file.read(tail, 0, tailLength, size - tailLength);
    let end = -1;
    for (let i = tailLength - 22; i >= 0; i--) {
      if (tail.readUInt32LE(i) === 0x06054b50) {
        end = i;
        break;
      }
    }
    if (end < 0) throw new Error(`${path}: no end of central directory`);
    const count = tail.readUInt16LE(end + 10);
    const directorySize = tail.readUInt32LE(end + 12);
    const directoryOffset = tail.readUInt32LE(end + 16);
    if (count === 0xffff || directoryOffset === 0xffffffff) {
      throw new Error(`${path}: zip64 jars are not read by this test`);
    }
    const directory = Buffer.alloc(directorySize);
    await file.read(directory, 0, directorySize, directoryOffset);
    const names: string[] = [];
    let at = 0;
    for (let n = 0; n < count; n++) {
      if (directory.readUInt32LE(at) !== 0x02014b50) throw new Error(`${path}: bad entry ${n}`);
      const nameLength = directory.readUInt16LE(at + 28);
      const extraLength = directory.readUInt16LE(at + 30);
      const commentLength = directory.readUInt16LE(at + 32);
      names.push(directory.toString('utf8', at + 46, at + 46 + nameLength));
      at += 46 + nameLength + extraLength + commentLength;
    }
    return names;
  } finally {
    await file.close();
  }
}

describe.each(builtInTargets.map((bundle) => [bundle.target.id, bundle.target] as const))(
  'model templates of %s',
  (id, target) => {
    const jar = clientJarPath(id, target.mcVersion);
    it.skipIf(jar === undefined)('names only block models of the cached client jar', async () => {
      const names = new Set(await zipEntryNames(jar ?? ''));
      expect(names.size).toBeGreaterThan(1000);
      const templates = target.blocks?.modelTemplates ?? [];
      expect(templates.length).toBeGreaterThan(0);
      for (const model of templates) {
        const path = model.slice('minecraft:'.length);
        expect(names, model).toContain(`assets/minecraft/models/${path}.json`);
      }
    });
  },
);
