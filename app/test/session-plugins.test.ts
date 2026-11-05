/**
 * The session with a third-party plugin (ADR 0035): its kind registers after the built-ins,
 * lowers through the async driver into a data pack, is validated against the plugin's own
 * schema export, runs its validator through the worker, and a plugin that stops blocks the
 * export of its elements (`plugin.unavailable`).
 */

import { createMemoryFileSystem, type Problem } from '@msm/core';
import { unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { builtInPlugins } from '../src/renderer/src/plugins/built-in';
import { loadExternalPlugins } from '../src/renderer/src/plugins/external-plugins';
import { sampleManifest, stubPluginsPlatform, vmWorkers } from './helpers/plugins-fixtures';
import { newSession } from './session-fixture';

const codes = (problems: readonly Problem[]) => problems.map((problem) => problem.code);

async function pluginSession() {
  const { platform: plugins } = stubPluginsPlatform([{ manifest: sampleManifest() }]);
  const external = await loadExternalPlugins(plugins, {
    builtIns: builtInPlugins,
    spawn: vmWorkers().spawn,
  });
  const fs = createMemoryFileSystem();
  const { session, calls } = newSession(
    fs,
    {},
    {
      externalPlugins: external.plugins,
      externalPluginStatus: external,
      externalSymbols: external.symbols,
    },
  );
  await session.newProject();
  return { session, calls, external };
}

describe('ProjectSession with a third-party plugin', () => {
  it('registers the kind and offers its library entries', async () => {
    const { session, external } = await pluginSession();
    expect(session.registry.get('sample:greeting')?.folder).toBe('greeting');
    expect(session.library.templates.map((template) => template.id)).toContain('sample-greeting');
    expect(session.library.examples.map((example) => example.id)).toContain(
      'sample-greeting-example',
    );
    expect(session.pluginExporters.map((exporter) => exporter.id)).toContain('sample.notes');
    expect(session.externalPlugins).toEqual(external.states);
    expect(session.snapshot.project?.plugins).toContain('sample.greetings');
    external.terminate();
  });

  it('validates against the plugin schema and runs its validator through the worker', async () => {
    const { session, external } = await pluginSession();
    session.addElement({ id: 'demo:quiet', kind: 'sample:greeting', data: { message: '' } });
    session.addElement({ id: 'demo:odd', kind: 'sample:greeting', data: { message: 5 } });
    await session.flushValidation();
    const problems = session.snapshot.problems;
    expect(codes(problems)).not.toContain('session.schemas-unavailable');
    expect(problems.find((problem) => problem.elementId === 'demo:odd')?.severity).toBe('error');
    expect(problems).toContainEqual(
      expect.objectContaining({ code: 'sample.empty-message', elementId: 'demo:quiet' }),
    );
    expect(problems.find((problem) => problem.code === 'sample.registry')?.message).toBe(
      'stone:true tag:true',
    );
    external.terminate();
  });

  it('lowers through the worker into the data pack', async () => {
    const { session, calls, external } = await pluginSession();
    session.addElement({ id: 'demo:hello', kind: 'sample:greeting', data: { message: 'Hi' } });
    const result = await session.exportPack('data', 'zip');
    expect(result.problems.filter((problem) => problem.severity === 'error')).toEqual([]);
    expect(result.ok).toBe(true);
    const zip = unzipSync(calls.saved[0]?.data ?? new Uint8Array());
    const fn = zip['data/demo/function/greet_hello.mcfunction'];
    expect(new TextDecoder().decode(fn)).toBe('tellraw @a {"text":"Hi"}\n');
    external.terminate();
  });

  it('blocks the export of its elements once the plugin has stopped', async () => {
    const { session, calls, external } = await pluginSession();
    session.addElement({ id: 'demo:stuck', kind: 'sample:greeting', data: { message: 'hang' } });
    // The lower call passes its 2 s deadline: the worker is terminated and the plugin fails.
    const first = await session.exportPack('data', 'zip');
    expect(first.ok).toBe(false);
    expect(codes(first.problems)).toContain('lowering.failed');
    expect(session.externalPlugins[0]?.state).toBe('failed');
    expect(session.snapshot.problems).toContainEqual(
      expect.objectContaining({ code: 'plugin.unavailable', elementId: 'demo:stuck' }),
    );
    session.setElementData('demo:stuck', { message: 'Hi' });
    const second = await session.exportPack('data', 'zip');
    expect(second.ok).toBe(false);
    expect(codes(second.problems)).toContain('plugin.unavailable');
    expect(calls.saved).toEqual([]);
    external.terminate();
  }, 15_000);
});
