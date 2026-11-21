import { describe, expect, it } from 'vitest';
import { builtInTargets } from '../src/index';
import { clientJarPath, zipEntryNames } from './client-jar';

/**
 * `BlockFacts.modelTemplates` against the client jar's listing (ADR 0094 D10). The jar is the
 * one Fabric Loom caches for the engine-mod build (`clientJarPath`). Only the file names are
 * read, never a file's contents. Without a jar the test is skipped: MSM never bundles Mojang
 * files.
 */
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
