/**
 * B556: what "Export as a map…" carries beside the world (ADR 0116 D2): both vanilla packs for
 * a data-only project, the content jar for a project that registers anything only the mod jar
 * provides.
 */
import { createMemoryFileSystem, type Json, type ResourceLocation } from '@msm/core';
import { unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { newSession } from './session-fixture';

const runtimeBytes = new Uint8Array([0x50, 0x4b, 0x05, 0x06, 1, 2, 3]);

async function mapSession(elements: { id: ResourceLocation; kind: string; data?: Json }[]) {
  const fixture = newSession(createMemoryFileSystem());
  fixture.platform.exports = { ...fixture.platform.exports, runtimeJar: async () => runtimeBytes };
  await fixture.session.newProject();
  for (const element of elements) fixture.session.addElement(element);
  await fixture.session.flushValidation();
  return fixture;
}

describe('ProjectSession.buildMapContent (ADR 0116 D2)', () => {
  it('carries both vanilla packs for a data-only project, with no dialog', async () => {
    const { session, calls } = await mapSession([
      { id: 'demo:my_logs', kind: 'minecraft:tag/block', data: { values: ['minecraft:oak_log'] } },
    ]);
    const content = await session.buildMapContent();
    expect(content.report.ok).toBe(true);
    expect(content.needsJar).toBe(false);
    expect(content.jar).toBeUndefined();
    expect(content.dataPack?.fileName).toMatch(/\.zip$/);
    const data = unzipSync(content.dataPack?.data ?? new Uint8Array());
    expect(Object.keys(data)).toContain('pack.mcmeta');
    expect(Object.keys(data).some((path) => path.endsWith('my_logs.json'))).toBe(true);
    expect(Object.keys(unzipSync(content.resourcePack ?? new Uint8Array()))).toContain(
      'pack.mcmeta',
    );
    expect(calls.saved).toEqual([]);
  });

  it('carries the content jar when the project registers a block', async () => {
    const { session, calls } = await mapSession([{ id: 'demo:ruby_block', kind: 'msm:block' }]);
    const content = await session.buildMapContent();
    expect(content.needsJar).toBe(true);
    expect(content.dataPack).toBeUndefined();
    expect(content.resourcePack).toBeUndefined();
    expect(content.jar?.data).toBeDefined();
    expect(Object.keys(unzipSync(content.jar?.data ?? new Uint8Array()))).toContain(
      'fabric.mod.json',
    );
    expect(calls.saved).toEqual([]);
  });
});
