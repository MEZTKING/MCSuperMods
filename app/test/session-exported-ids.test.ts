/**
 * The exported-ids record in the session (ADR 0102 D4, D5): every export and install kind merges
 * the ids it carried into `.msm/exported-ids.json`, sorted and with generated ids; renames and
 * deletes of exported ids warn, fresh ones do not. The pure rules are in `exported-ids.test.ts`.
 */
import { createMemoryFileSystem, type MemoryFileSystem } from '@msm/core';
import type { Json, ResourceLocation } from '@msm/plugin-api';
import { describe, expect, it } from 'vitest';
import {
  EXPORTED_IDS_FILE,
  type ExportedIdsRecord,
} from '../src/renderer/src/session/exported-ids';
import { newSession } from './session-fixture';

const runtimeBytes = new Uint8Array([0x50, 0x4b, 0x05, 0x06, 1, 2, 3]);

async function openSession(elements: { id: ResourceLocation; kind: string; data?: Json }[]) {
  const fs = createMemoryFileSystem();
  const fixture = newSession(fs);
  const { platform } = fixture;
  platform.exports = {
    ...platform.exports,
    runtimeJar: async () => runtimeBytes,
    geckolibJar: async () => runtimeBytes,
    pickFolder: async () => '/exports/both',
    writeFiles: async (folder, files) => ({ paths: files.map((file) => `${folder}/${file.name}`) }),
    writeTree: async (root, files) => ({ ok: true, root: `${root}/demo`, count: files.length }),
    gradleWrapper: async () => ({
      jar: new Uint8Array([0x50, 0x4b, 0x03, 0x04]),
      gradlew: '#!/bin/sh\n',
      gradlewBat: '@echo off\r\n',
    }),
  };
  platform.minecraft = {
    ...platform.minecraft,
    installDataPack: async (world, fileName) => ({ path: `/saves/${world}/datapacks/${fileName}` }),
  };
  platform.testInMinecraft = {
    ...platform.testInMinecraft,
    run: async () => ({
      jarPath: '/mods/demo.jar',
      replaced: false,
      removed: [],
      fabricApi: 'present',
      fabricApiFile: 'fabric-api.jar',
      launched: false,
      note: null,
    }),
  };
  await fixture.session.newProject();
  for (const element of elements) fixture.session.addElement(element);
  await fixture.session.flushValidation();
  return { ...fixture, fs };
}

async function record(fs: MemoryFileSystem): Promise<ExportedIdsRecord | null> {
  if (!(await fs.exists(EXPORTED_IDS_FILE))) return null;
  return JSON.parse(new TextDecoder().decode(await fs.readFile(EXPORTED_IDS_FILE)));
}

async function text(fs: MemoryFileSystem): Promise<string> {
  return new TextDecoder().decode(await fs.readFile(EXPORTED_IDS_FILE));
}

const MOD: { id: ResourceLocation; kind: string; data?: Json }[] = [
  { id: 'demo:ruby_block', kind: 'msm:block' },
  { id: 'demo:acid', kind: 'msm:fluid' },
  {
    id: 'demo:entity/goblin',
    kind: 'msm:geo_model',
    data: {
      format_version: '1.12.0',
      'minecraft:geometry': [
        {
          description: { identifier: 'geometry.goblin', texture_width: 64, texture_height: 64 },
          bones: [{ name: 'body', pivot: [0, 0, 0] }],
        },
      ],
    },
  },
  {
    id: 'demo:entity/goblin_animations',
    kind: 'msm:animation',
    data: {
      format_version: '1.8.0',
      animations: { idle: { loop: true, animation_length: 1, bones: {} } },
    },
  },
  {
    id: 'demo:goblin',
    kind: 'msm:entity',
    data: {
      format: 1,
      category: 'monster',
      size: { width: 0.6, height: 1.8 },
      components: {
        'msm:animated_model': {
          model: 'demo:entity/goblin',
          animations: 'demo:entity/goblin_animations',
          texture: 'demo:entity/goblin',
          idle: 'idle',
        },
      },
    },
  },
];

describe('ProjectSession: the exported-ids record (ADR 0102 D4)', () => {
  it('writes nothing before an export', async () => {
    const { fs, session } = await openSession(MOD);
    expect(await record(fs)).toBeNull();
    expect(session.exportedIds).toBeNull();
  });

  it('records the jar ids with generated ones, sorted, 2-space with sorted keys', async () => {
    const { fs, session } = await openSession(MOD);
    const result = await session.exportFabricJar();
    expect(result.problems.filter((problem) => problem.severity === 'error')).toEqual([]);
    const saved = await record(fs);
    expect(saved?.ids.block).toEqual(['demo:acid', 'demo:ruby_block']);
    expect(saved?.ids.item).toEqual([
      'demo:acid_bucket',
      'demo:goblin_spawn_egg',
      'demo:ruby_block',
    ]);
    expect(saved?.ids.entity_type).toEqual(['demo:goblin']);
    expect(saved?.ids.fluid).toContain('demo:acid');
    expect(saved?.lastExport).toEqual({
      date: '2026-01-01T00:00:00.000Z',
      target: session.target.id,
      via: 'content-jar',
    });
    const written = await text(fs);
    expect(written.startsWith('{\n  "format": 1,\n  "ids": {\n    "block": [')).toBe(true);
    expect(written.endsWith('}\n')).toBe(true);
    expect(session.exportedIds?.ids.block).toEqual(['demo:acid', 'demo:ruby_block']);
  });

  it('records nothing when the save is cancelled', async () => {
    const fs = createMemoryFileSystem();
    const { session, platform } = newSession(fs, { savePath: null });
    platform.exports = { ...platform.exports, runtimeJar: async () => runtimeBytes };
    await session.newProject();
    session.addElement({ id: 'demo:ruby_block', kind: 'msm:block' });
    await session.exportFabricJar();
    expect(await record(fs)).toBeNull();
  });

  it('merges later exports: an id stays recorded once exported', async () => {
    const { fs, session } = await openSession([{ id: 'demo:ruby_block', kind: 'msm:block' }]);
    await session.exportFabricJar();
    session.removeElement('demo:ruby_block');
    session.addElement({ id: 'demo:amber', kind: 'msm:block' });
    await session.testInMinecraft();
    const saved = await record(fs);
    expect(saved?.ids.block).toEqual(['demo:amber', 'demo:ruby_block']);
    expect(saved?.lastExport?.via).toBe('test-in-minecraft');
  });

  it('records Test in Minecraft, the Java project, Play and Reload as jar exports', async () => {
    for (const run of [
      (s: Awaited<ReturnType<typeof openSession>>['session']) => s.testInMinecraft(),
      (s: Awaited<ReturnType<typeof openSession>>['session']) => s.exportJavaProject('/exports'),
      (s: Awaited<ReturnType<typeof openSession>>['session']) => s.recordPlayed('play'),
      (s: Awaited<ReturnType<typeof openSession>>['session']) => s.recordPlayed('reload'),
    ]) {
      const { fs, session } = await openSession([{ id: 'demo:ruby_block', kind: 'msm:block' }]);
      await run(session);
      expect((await record(fs))?.ids.block).toEqual(['demo:ruby_block']);
    }
  });

  it('records vanilla pack exports and installs without the mod-only ids', async () => {
    for (const [run, via] of [
      [
        (s: Awaited<ReturnType<typeof openSession>>['session']) => s.exportPack('data', 'zip'),
        'data-pack',
      ],
      [
        (s: Awaited<ReturnType<typeof openSession>>['session']) => s.exportPack('resource', 'zip'),
        'resource-pack',
      ],
      [
        (s: Awaited<ReturnType<typeof openSession>>['session']) =>
          s.exportPack('resource', 'combined'),
        'both-packs',
      ],
      [
        (s: Awaited<ReturnType<typeof openSession>>['session']) => s.installDataPack('World'),
        'install-data-pack',
      ],
      [
        (s: Awaited<ReturnType<typeof openSession>>['session']) => s.exportResourcePack('install'),
        'install-resource-pack',
      ],
    ] as const) {
      const { fs, session } = await openSession(MOD);
      const result = await run(session);
      expect(result.ok, via).toBe(true);
      const saved = await record(fs);
      expect(saved?.lastExport?.via).toBe(via);
      // A vanilla pack cannot register blocks, items or mobs (ADR 0066).
      expect(saved?.ids).toEqual({});
    }
  });

  it('reads the record of an earlier session on open', async () => {
    const { fs, session } = await openSession([{ id: 'demo:ruby_block', kind: 'msm:block' }]);
    await session.exportFabricJar();
    await session.save();
    const { session: again } = newSession(fs);
    expect((await again.openProject()).ok).toBe(true);
    expect(again.exportedIds?.ids.block).toEqual(['demo:ruby_block']);
  });
});

describe('ProjectSession: warnings for exported ids (ADR 0102 D5)', () => {
  it('warns on renaming an exported id and its generated ids, not a fresh one', async () => {
    const { session } = await openSession(MOD);
    await session.exportFabricJar();
    session.addElement({ id: 'demo:fresh', kind: 'msm:block' });
    expect(session.renameExportedIdsWarning('demo:fresh', 'demo:newer')).toBeNull();
    const warning = session.renameExportedIdsWarning('demo:acid', 'demo:slime');
    expect(warning?.ids.map((entry) => `${entry.registry} ${entry.id}`)).toEqual(
      expect.arrayContaining(['block demo:acid', 'item demo:acid_bucket', 'fluid demo:acid']),
    );
    expect(warning?.becomes.map((entry) => entry.id)).toEqual(
      expect.arrayContaining(['demo:slime', 'demo:slime_bucket']),
    );
    // Before a valid new id is typed: every exported id it owns.
    expect(session.renameExportedIdsWarning('demo:goblin')?.ids.map((entry) => entry.id)).toEqual([
      'demo:goblin',
      'demo:goblin_spawn_egg',
    ]);
  });

  it('warns on deleting an exported element, not a fresh one', async () => {
    const { session } = await openSession(MOD);
    await session.exportFabricJar();
    session.addElement({ id: 'demo:fresh', kind: 'msm:block' });
    expect(session.deleteExportedIdsWarning(['demo:fresh'])).toBeNull();
    expect(session.deleteExportedIdsWarning(['demo:ruby_block'])?.ids).toEqual([
      { registry: 'block', id: 'demo:ruby_block' },
      { registry: 'item', id: 'demo:ruby_block' },
    ]);
  });
});
