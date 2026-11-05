import { createMemoryFileSystem } from '@msm/core';
import { FabricContentJarProblemCodes, SEPARATE_RUNTIME_OPTION } from '@msm/exporters';
import { unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { newSession } from './session-fixture';

const runtimeBytes = new Uint8Array([0x50, 0x4b, 0x05, 0x06, 1, 2, 3]);

async function openSession(runtimeJar: Uint8Array | null) {
  const fs = createMemoryFileSystem();
  const { session, platform, calls } = newSession(fs);
  let runtimeReads = 0;
  platform.exports = {
    ...platform.exports,
    runtimeJar: async () => {
      runtimeReads += 1;
      return runtimeJar;
    },
  };
  await session.newProject();
  return { session, calls, runtimeReads: () => runtimeReads };
}

function modJson(entries: Record<string, Uint8Array>): Record<string, unknown> {
  const bytes = entries['fabric.mod.json'];
  if (bytes === undefined) throw new Error('fabric.mod.json is missing');
  return JSON.parse(new TextDecoder().decode(bytes)) as Record<string, unknown>;
}

describe('ProjectSession.exportFabricJar', () => {
  it('declares the content jar options for the dialog', async () => {
    const { session } = await openSession(null);
    expect(session.fabricJarOptions.map((option) => [option.id, option.type, option.default])).toEqual([
      [SEPARATE_RUNTIME_OPTION, 'boolean', false],
    ]);
  });

  it('nests the runtime jar from the platform and saves <mod id>.jar', async () => {
    const { session, calls, runtimeReads } = await openSession(runtimeBytes);
    const result = await session.exportFabricJar();
    expect(result.ok).toBe(true);
    expect(runtimeReads()).toBe(1);
    expect(calls.saved).toHaveLength(1);
    const saved = calls.saved[0];
    if (saved === undefined) throw new Error('unreachable');
    const entries = unzipSync(saved.data);
    const json = modJson(entries);
    expect(saved.defaultName).toBe(`${String(json.id)}.jar`);
    expect(result.location).toBe(`/exports/${saved.defaultName}`);
    // The runtime carries the app's version (ADR 0026 D4).
    expect(entries['META-INF/jars/msm_runtime-0.1.0-test.jar']).toEqual(runtimeBytes);
    expect(json.jars).toEqual([{ file: 'META-INF/jars/msm_runtime-0.1.0-test.jar' }]);
    expect((json.depends as Record<string, unknown>).msm_runtime).toBe('>=0.1.0-test');
  });

  it('stops with export.runtime-missing when there is no runtime jar to nest', async () => {
    const { session, calls } = await openSession(null);
    const result = await session.exportFabricJar({});
    expect(result.ok).toBe(false);
    expect(result.problems.map((problem) => problem.code)).toContain(
      FabricContentJarProblemCodes.runtimeMissing,
    );
    expect(calls.saved).toHaveLength(0);
  });

  it('passes the separate runtime option through to the exporter', async () => {
    const { session, calls, runtimeReads } = await openSession(null);
    const result = await session.exportFabricJar({ [SEPARATE_RUNTIME_OPTION]: true });
    expect(result.ok).toBe(true);
    expect(runtimeReads()).toBe(0);
    const saved = calls.saved[0];
    if (saved === undefined) throw new Error('unreachable');
    const entries = unzipSync(saved.data);
    expect(Object.keys(entries).some((path) => path.startsWith('META-INF/jars/'))).toBe(false);
    const json = modJson(entries);
    expect(json.jars).toBeUndefined();
    expect((json.depends as Record<string, unknown>).msm_runtime).toBe('>=0.1.0-test');
  });

  it('reports a cancelled save without a location', async () => {
    const fs = createMemoryFileSystem();
    const { session, platform } = newSession(fs, { savePath: null });
    platform.exports = { ...platform.exports, runtimeJar: async () => runtimeBytes };
    await session.newProject();
    const result = await session.exportFabricJar();
    expect(result.ok).toBe(true);
    expect(result.cancelled).toBe(true);
    expect(result.location).toBeUndefined();
  });
});
