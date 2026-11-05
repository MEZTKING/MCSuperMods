/**
 * The manifest schema main applies (`pluginManifestSchema`, ADR 0035 D2) and the renderer's
 * checks of a worker's description and schema exports.
 */

import { describe, expect, it } from 'vitest';
import {
  apiVersionProblem,
  checkDescription,
  contributionNamespace,
  parsePluginSchemas,
  pluginIdNamespace,
} from '../src/renderer/src/plugins/manifest';
import type { PluginDescription } from '../src/renderer/src/plugins/sandbox/protocol';
import { pluginManifestSchema } from '../src/shared/ipc-contract';
import { sampleManifest, sampleSymbols } from './helpers/plugins-fixtures';

const valid = {
  manifestVersion: 1,
  id: 'sample.greetings',
  name: 'Greetings',
  version: '1.0.0',
  apiVersion: '^1.0.0',
  main: 'main.js',
  schemas: ['symbols.json'],
  capabilities: ['elementKinds', 'elementTemplates', 'examples', 'validators'],
  description: 'Says hello.',
  author: 'Someone',
  licence: 'MIT',
  homepage: 'https://example.com/greetings',
};

const issuePaths = (value: unknown): string[] => {
  const result = pluginManifestSchema.safeParse(value);
  return result.success ? [] : result.error.issues.map((issue) => issue.path.join('/'));
};

describe('pluginManifestSchema', () => {
  it('accepts the documented manifest and defaults schemas to none', () => {
    expect(pluginManifestSchema.parse(valid)).toEqual(valid);
    const { schemas: _schemas, ...noSchemas } = valid;
    expect(pluginManifestSchema.parse(noSchemas).schemas).toEqual([]);
    expect(pluginManifestSchema.parse({ ...valid, main: 'dist/main.js' }).main).toBe('dist/main.js');
  });

  it('refuses bad ids, the msm. prefix and reserved namespaces', () => {
    for (const id of ['Sample', '1sample', 'sample greetings', 'sample_x', '', 'msm.tools', 'msm', 'minecraft.extra']) {
      expect(issuePaths({ ...valid, id })).toContain('id');
    }
    expect(issuePaths({ ...valid, id: 'a.b-c.d' })).toEqual([]);
  });

  it('refuses paths that are absolute or leave the folder', () => {
    for (const main of ['/etc/main.js', '../main.js', 'a/../../main.js', 'C:\\main.js', 'dist\\main.js', '']) {
      expect(issuePaths({ ...valid, main })).toContain('main');
    }
    expect(issuePaths({ ...valid, schemas: ['../symbols.json'] })).toContain('schemas/0');
  });

  it('refuses unknown capabilities, unknown fields and malformed versions', () => {
    expect(issuePaths({ ...valid, capabilities: ['editors'] })).toContain('capabilities/0');
    expect(issuePaths({ ...valid, capabilities: ['elementKind'] })).toContain('capabilities/0');
    expect(issuePaths({ ...valid, capabilites: [] })).toEqual(['']);
    expect(issuePaths({ ...valid, version: '1.0' })).toContain('version');
    expect(issuePaths({ ...valid, apiVersion: 'latest; rm' })).toContain('apiVersion');
    expect(issuePaths({ ...valid, manifestVersion: 2 })).toContain('manifestVersion');
    expect(issuePaths({ ...valid, homepage: 'http://example.com' })).toContain('homepage');
  });
});

describe('plugin checks in the renderer', () => {
  it('derives namespaces', () => {
    expect(pluginIdNamespace('sample.greetings')).toBe('sample');
    expect(pluginIdNamespace('solo')).toBe('solo');
    expect(contributionNamespace('sample:greeting')).toBe('sample');
    expect(contributionNamespace('sample-greeting-example')).toBe('sample');
    expect(contributionNamespace('msm.empty')).toBe('msm');
  });

  it('checks the API range before any code runs', () => {
    expect(apiVersionProblem(sampleManifest())).toBeNull();
    expect(apiVersionProblem(sampleManifest({ apiVersion: '^2.0.0' }))).toMatchObject({
      code: 'plugin.api-incompatible',
      message: expect.stringContaining('requires plugin API ^2.0.0'),
    });
    expect(apiVersionProblem(sampleManifest({ apiVersion: 'not a range' }))).toMatchObject({
      code: 'plugin.api-incompatible',
    });
    expect(apiVersionProblem(sampleManifest({ apiVersion: '^1.2.0' }), '1.1.0')?.code).toBe(
      'plugin.api-incompatible',
    );
  });

  const description = (contributes: PluginDescription['contributes']): PluginDescription => ({
    id: 'sample.greetings',
    apiVersion: '^1.0.0',
    contributes,
  });
  const kind = {
    data: { id: 'sample:greeting', schema: '::sample::greeting::Greeting', folder: 'greeting' },
    functions: ['lower'],
  };

  it('accepts declared points and warns about unsupported ones', () => {
    const checked = checkDescription(
      description({ elementKinds: [kind], commands: [{ data: { id: 'c' }, functions: ['run'] }] }),
      sampleManifest(),
    );
    expect(checked.refused).toBe(false);
    expect(checked.points.elementKinds).toHaveLength(1);
    expect(checked.problems).toEqual([
      expect.objectContaining({ code: 'plugin.capability-unsupported', severity: 'warning' }),
    ]);
  });

  it('refuses undeclared points, reserved namespaces, missing functions and fields', () => {
    const missing = checkDescription(
      description({ elementKinds: [kind] }),
      sampleManifest({ capabilities: ['elementTemplates'] }),
    );
    expect(missing.refused).toBe(true);
    expect(missing.problems.map((problem) => problem.code)).toEqual(['plugin.capability-missing']);

    const reserved = checkDescription(
      description({ elementKinds: [{ ...kind, data: { ...kind.data, id: 'minecraft:greeting' } }] }),
      sampleManifest(),
    );
    expect(reserved.problems.map((problem) => problem.code)).toEqual(['plugin.reserved-namespace']);

    const broken = checkDescription(
      description({ elementKinds: [{ data: { id: 'sample:x', folder: 'x' }, functions: [] }] }),
      sampleManifest(),
    );
    expect(broken.problems.map((problem) => problem.message)).toEqual([
      'sample.greetings: elementKinds entry sample:x has no string field "schema".',
      'sample.greetings: elementKinds entry sample:x has no lower function.',
    ]);

    const otherId = checkDescription({ ...description({}), id: 'other.id' }, sampleManifest());
    expect(otherId.problems.map((problem) => problem.code)).toEqual(['plugin.refused']);
  });

  it('parses schema exports and keeps them in the plugin namespace', () => {
    const ok = parsePluginSchemas(sampleManifest(), [sampleSymbols()]);
    expect(ok.ok && Object.keys(ok.symbols[0]?.mcdoc ?? {})).toEqual(['::sample::greeting::Greeting']);
    const outside = parsePluginSchemas(sampleManifest(), [
      sampleSymbols('::java::data::loot::LootTable'),
    ]);
    expect(outside).toMatchObject({
      ok: false,
      problem: { code: 'plugin.refused', message: expect.stringContaining('outside its namespace ::sample') },
    });
    const broken = parsePluginSchemas(sampleManifest(), ['{"ref": 1}']);
    expect(broken).toMatchObject({ ok: false, problem: { code: 'plugin.refused' } });
  });
});
