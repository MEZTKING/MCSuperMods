import { utf8 } from '@msm/core';
import type { Problem, Project } from '@msm/plugin-api';
import { builtInTargets } from '@msm/targets';
import { describe, expect, it } from 'vitest';
import {
  assetOutputFiles,
  createMemorySink,
  isTextureMetaPath,
  runExport,
  TEXTURE_META_SCHEMA,
  vanillaPacksExporter,
} from '../src/index';
import { fakeAsset, indexesFor, meta, project, testRegistry } from './helpers';

const errors = (problems: Problem[]): Problem[] =>
  problems.filter((problem) => problem.severity === 'error');

/** A project with one animated texture and its sidecar, whose bytes are `sidecar`. */
function animated(sidecar: unknown): {
  project: Project;
  readAsset: (namespace: string, path: string) => Promise<Uint8Array>;
} {
  return {
    project: project(
      [],
      [
        { path: 'textures/block/glow.png', mediaType: 'image/png' },
        { path: 'textures/block/glow.png.mcmeta', mediaType: 'application/octet-stream' },
      ],
    ),
    readAsset: async (namespace, path) =>
      path.endsWith('.mcmeta')
        ? utf8.encode(`${JSON.stringify(sidecar)}\n`)
        : fakeAsset(namespace, path),
  };
}

describe('isTextureMetaPath', () => {
  it('matches .png.mcmeta files under textures/ only', () => {
    expect(isTextureMetaPath('textures/block/lava.png.mcmeta')).toBe(true);
    expect(isTextureMetaPath('textures/gui/sprites/x.png.mcmeta')).toBe(true);
    expect(isTextureMetaPath('textures/block/lava.png')).toBe(false);
    expect(isTextureMetaPath('textures/block/lava.mcmeta')).toBe(false);
    expect(isTextureMetaPath('sounds/lava.png.mcmeta')).toBe(false);
  });
});

describe('assetOutputFiles', () => {
  it('gives texture sidecars the texture_meta schema and leaves other assets without one', async () => {
    const { project: p, readAsset } = animated({ animation: {} });
    const { files } = await assetOutputFiles(p, readAsset);
    expect(files.map((file) => [file.path, file.schema])).toEqual([
      ['assets/ruby/textures/block/glow.png', undefined],
      ['assets/ruby/textures/block/glow.png.mcmeta', TEXTURE_META_SCHEMA],
    ]);
  });
});

describe.each(builtInTargets.map((bundle) => [bundle.target.id, bundle] as const))(
  'texture sidecars in runExport (%s)',
  (_id, bundle) => {
    async function exportWith(sidecar: unknown) {
      const { schemaIndex, registries } = await indexesFor(bundle);
      const { project: p, readAsset } = animated(sidecar);
      const sink = createMemorySink();
      const report = await runExport({
        project: p,
        registry: testRegistry(),
        target: bundle.target,
        schemaIndex,
        registries,
        exporter: vanillaPacksExporter,
        readAsset,
        meta,
        sink,
      });
      return { report, sink };
    }

    it('exports a valid sidecar next to its texture', async () => {
      const { report, sink } = await exportWith({
        animation: { frametime: 2, interpolate: false, frames: [0, { index: 1, time: 4 }] },
      });
      expect(errors(report.problems)).toEqual([]);
      expect(report.ok).toBe(true);
      expect([...sink.files().keys()]).toContain('assets/ruby/textures/block/glow.png.mcmeta');
    });

    it('blocks an invalid sidecar and writes nothing', async () => {
      const { report, sink } = await exportWith({ animation: { frametime: 'fast', frames: [-1] } });
      expect(report.ok).toBe(false);
      const blocking = errors(report.problems);
      expect(blocking.length).toBeGreaterThan(0);
      for (const problem of blocking) {
        expect(problem.file).toBe('assets/ruby/textures/block/glow.png.mcmeta');
      }
      expect(sink.files().size).toBe(0);
    });

    it('blocks a sidecar that is not JSON', async () => {
      const { schemaIndex, registries } = await indexesFor(bundle);
      const { project: p } = animated({});
      const report = await runExport({
        project: p,
        registry: testRegistry(),
        target: bundle.target,
        schemaIndex,
        registries,
        exporter: vanillaPacksExporter,
        readAsset: async (namespace, path) =>
          path.endsWith('.mcmeta') ? utf8.encode('{ not json') : fakeAsset(namespace, path),
        meta,
        sink: createMemorySink(),
      });
      expect(report.ok).toBe(false);
      expect(errors(report.problems).map((problem) => problem.code)).toEqual([
        'export.invalid-json',
      ]);
    });
  },
);
