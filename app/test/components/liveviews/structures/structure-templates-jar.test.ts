/// <reference types="node" />
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { STRUCTURE_TEMPLATE_MAX_BYTES, STRUCTURE_TEMPLATE_PATTERN } from '@msm/interop';
import { builtInTargets } from '@msm/targets';
import { unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { parsePieceTemplate } from '../../../../src/renderer/src/liveviews/structures/vanilla-pieces';
import { InvokeChannels, ipcContract } from '../../../../src/shared/ipc-contract';

/**
 * The jar's structure templates (ADR 0122, B636; the B634 spike's 4S6) against the client jar
 * Fabric Loom caches for the engine-mod build: the files are read in memory only, parsed and
 * dropped; nothing is written or kept. Skipped without a jar: MSM never bundles Mojang files.
 */
function loomJar(mcVersion: string): string | undefined {
  const gradleHome = process.env.GRADLE_USER_HOME ?? join(homedir(), '.gradle');
  const path = join(gradleHome, 'caches', 'fabric-loom', mcVersion, 'minecraft-client.jar');
  return existsSync(path) ? path : undefined;
}

describe('the structure templates in the client jar (ADR 0122, B636)', () => {
  for (const { target } of builtInTargets) {
    const jar = loomJar(target.mcVersion);
    it.skipIf(jar === undefined)(
      `every ${target.mcVersion} template has a channel id and parses`,
      async () => {
        const files = unzipSync(new Uint8Array(await readFile(jar as string)), {
          filter: (file) => STRUCTURE_TEMPLATE_PATTERN.test(file.name),
        });
        const names = Object.keys(files);
        // B634 4S6: 1,511 on both targets.
        expect(names.length).toBeGreaterThan(1000);
        const request = ipcContract[InvokeChannels.minecraftStructureTemplates].request;
        let jigsaws = 0;
        for (const name of names) {
          const id = `minecraft:${name.slice('data/minecraft/structure/'.length, -'.nbt'.length)}`;
          const bytes = files[name] as Uint8Array;
          expect(bytes.byteLength, name).toBeLessThanOrEqual(STRUCTURE_TEMPLATE_MAX_BYTES);
          expect(request.safeParse({ mcVersion: target.mcVersion, ids: [id] }).success, id).toBe(
            true,
          );
          const template = parsePieceTemplate(id, bytes);
          expect(
            template.size.every((axis) => axis >= 1),
            id,
          ).toBe(true);
          jigsaws += template.jigsaws.length;
        }
        expect(jigsaws).toBeGreaterThan(0);
      },
      60_000,
    );
  }
});
