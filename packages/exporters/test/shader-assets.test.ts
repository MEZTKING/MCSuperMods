import { utf8 } from '@msm/core';
import type { Problem, Project } from '@msm/plugin-api';
import { builtInTargets } from '@msm/targets';
import { describe, expect, it } from 'vitest';
import {
  EXPORTED_ASSET_FOLDERS,
  isShaderProgramPath,
  isShaderSourcePath,
  SHADER_PROGRAM_SCHEMA,
  SHADER_SOURCE_LANGUAGE,
} from '../src/assets';
import { assetOutputFiles, createMemorySink, runExport, vanillaPacksExporter } from '../src/index';
import { fakeAsset, indexesFor, meta, project, testRegistry } from './helpers';

const errors = (problems: Problem[]): Problem[] =>
  problems.filter((problem) => problem.severity === 'error');

const FRAGMENT = '#version 330\nout vec4 fragColor;\nvoid main() { fragColor = vec4(1.0); }\n';

/** A project with a shader program, its two GLSL sources and an include (ADR 0106 D2). */
function shaders(program: unknown): {
  project: Project;
  readAsset: (namespace: string, path: string) => Promise<Uint8Array>;
} {
  return {
    project: project(
      [],
      [
        { path: 'shaders/include/fog.glsl', mediaType: 'text/plain' },
        { path: 'shaders/program/glow.fsh', mediaType: 'text/plain' },
        { path: 'shaders/program/glow.json', mediaType: 'application/json' },
        { path: 'shaders/program/glow.vsh', mediaType: 'text/plain' },
      ],
    ),
    readAsset: async (namespace, path) => {
      if (path.endsWith('.json')) return utf8.encode(`${JSON.stringify(program)}\n`);
      if (path.startsWith('shaders/')) return utf8.encode(FRAGMENT);
      return fakeAsset(namespace, path);
    },
  };
}

const VALID = {
  vertex: 'ruby:program/glow',
  fragment: 'ruby:program/glow',
  samplers: [{ name: 'Sampler0' }],
  uniforms: [],
};

describe('shader assets', () => {
  it('passes shaders/ through and recognises programs and sources', () => {
    expect(EXPORTED_ASSET_FOLDERS).toContain('shaders');
    expect(isShaderProgramPath('shaders/program/glow.json')).toBe(true);
    expect(isShaderProgramPath('textures/glow.json')).toBe(false);
    for (const path of ['shaders/post/tint.vsh', 'shaders/post/tint.fsh', 'shaders/include/a.glsl'])
      expect(isShaderSourcePath(path), path).toBe(true);
    expect(isShaderSourcePath('shaders/post/tint.json')).toBe(false);
    expect(isShaderSourcePath('texts/tint.fsh')).toBe(false);
  });

  it('gives programs the shader schema and GLSL sources the glsl language', async () => {
    const { project: p, readAsset } = shaders(VALID);
    const { files, problems } = await assetOutputFiles(p, readAsset);
    expect(problems).toEqual([]);
    expect(files.map((file) => [file.path, file.schema, file.language])).toEqual([
      ['assets/ruby/shaders/include/fog.glsl', undefined, SHADER_SOURCE_LANGUAGE],
      ['assets/ruby/shaders/program/glow.fsh', undefined, SHADER_SOURCE_LANGUAGE],
      ['assets/ruby/shaders/program/glow.json', SHADER_PROGRAM_SCHEMA, undefined],
      ['assets/ruby/shaders/program/glow.vsh', undefined, SHADER_SOURCE_LANGUAGE],
    ]);
  });
});

describe.each(builtInTargets.map((bundle) => [bundle.target.id, bundle] as const))(
  'shader assets in runExport (%s)',
  (_id, bundle) => {
    async function exportWith(program: unknown) {
      const { schemaIndex, registries } = await indexesFor(bundle);
      const { project: p, readAsset } = shaders(program);
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

    it('exports the sources unchanged with one unchecked-language info', async () => {
      const { report, sink } = await exportWith(VALID);
      expect(errors(report.problems)).toEqual([]);
      expect(report.ok).toBe(true);
      const unchecked = report.problems.filter(
        (problem) => problem.code === 'export.language-unchecked',
      );
      expect(unchecked).toHaveLength(1);
      expect(unchecked[0]?.severity).toBe('info');
      expect(unchecked[0]?.message).toContain('3 glsl file(s)');
      const paths = [...sink.files().keys()];
      for (const path of [
        'assets/ruby/shaders/include/fog.glsl',
        'assets/ruby/shaders/program/glow.fsh',
        'assets/ruby/shaders/program/glow.json',
        'assets/ruby/shaders/program/glow.vsh',
      ])
        expect(
          paths.some((entry) => entry.endsWith(path)),
          path,
        ).toBe(true);
    });

    it('blocks a shader program that does not match its schema and writes nothing', async () => {
      const { report, sink } = await exportWith({ vertex: 1, uniforms: 'none' });
      expect(report.ok).toBe(false);
      const blocking = errors(report.problems);
      expect(blocking.length).toBeGreaterThan(0);
      for (const problem of blocking) {
        expect(problem.file).toBe('assets/ruby/shaders/program/glow.json');
      }
      expect(sink.files().size).toBe(0);
    });
  },
);
