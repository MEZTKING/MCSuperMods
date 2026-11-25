/**
 * The AI helper's `upgrade_report` (ADR 0136 D15, B825) over a real dry run of
 * `fixtures/sample-worldgen` with a large dripstone feature: the report not made yet in the
 * app's sentences, with the ids the helper needs; the version found by its number and by its
 * release number; no newer version once moved; after the move, the saved report with the items
 * still open marked and one leaving when fixed; unknown versions refused. Nothing it does
 * changes the project.
 */

import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createMemoryFileSystem } from '@msm/core';
import type { TargetFacts } from '@msm/plugin-api';
import { builtInTargets, defaultTargetId } from '@msm/targets';
import { describe, expect, it } from 'vitest';
import { createToolExecutor } from '../src/renderer/src/ai/tool-executor';
import { newerTargets, targetForVersion } from '../src/renderer/src/ai/upgrade-report-tool';
import { PendingChangeset } from '../src/renderer/src/changeset/changeset';
import { forbiddenIn } from '../src/renderer/src/components/ai/ai-words';
import { newSession } from './session-fixture';

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
const SPIKES = 'msm_sample_worldgen:spikes';

const release = builtInTargets.find((entry) => entry.target.id === defaultTargetId)?.target;
const next = builtInTargets.find((entry) => entry.target.previous === defaultTargetId)?.target;
if (release === undefined || next === undefined) {
  throw new Error('A release target and the target after it are needed.');
}

async function readFolder(folder: string, prefix = ''): Promise<Record<string, Uint8Array>> {
  const out: Record<string, Uint8Array> = {};
  for (const entry of await readdir(join(folder, prefix), { withFileTypes: true })) {
    const path = prefix === '' ? entry.name : `${prefix}/${entry.name}`;
    if (entry.isDirectory()) Object.assign(out, await readFolder(folder, path));
    else out[path] = new Uint8Array(await readFile(join(folder, path)));
  }
  return out;
}

const LARGE_DRIPSTONE = {
  type: 'minecraft:large_dripstone',
  floor_to_ceiling_search_range: 30,
  column_radius: { type: 'minecraft:uniform', min_inclusive: 3, max_inclusive: 19 },
  height_scale: { type: 'minecraft:uniform', min_inclusive: 0.4, max_inclusive: 2 },
  max_column_radius_to_cave_height_ratio: 0.33,
  stalactite_bluntness: { type: 'minecraft:uniform', min_inclusive: 0.3, max_inclusive: 0.9 },
  stalagmite_bluntness: { type: 'minecraft:uniform', min_inclusive: 0.4, max_inclusive: 1 },
  wind_speed: { type: 'minecraft:uniform', min_inclusive: 0, max_inclusive: 0.3 },
  min_radius_for_wind: 4,
  min_bluntness_for_wind: 0.6,
};

async function setup() {
  const fs = createMemoryFileSystem(
    await readFolder(join(repoRoot, 'fixtures', 'sample-worldgen')),
  );
  const { session } = newSession(fs, {}, { validationDelay: 0 });
  expect(await session.loadSnapshot('/fixtures/sample-worldgen')).toEqual({ ok: true });
  session.addElement({
    id: SPIKES,
    kind: 'minecraft:worldgen/feature',
    data: structuredClone(LARGE_DRIPSTONE),
  });
  await session.flushValidation();
  const execute = createToolExecutor(session, new PendingChangeset(), {
    proposePlan: async () => ({ decision: 'revise', items: [], comments: '' }),
    checkpoint: async () => 'continue',
  });
  let n = 0;
  const call = async (input: unknown = {}) => {
    n += 1;
    const result = await execute(
      { requestId: `r${n}`, toolUseId: `t${n}`, name: 'upgrade_report', input },
      new AbortController().signal,
    );
    // biome-ignore lint/suspicious/noExplicitAny: tool results are parsed JSON, read loosely in tests
    return { result, value: JSON.parse(result.content) as any };
  };
  return { session, call };
}

describe('upgrade_report (ADR 0136 D15)', () => {
  it('finds versions by id, version and release number, and the newer ones in order', () => {
    const targets = builtInTargets.map((entry) => entry.target) as TargetFacts[];
    expect(targetForVersion(next.id, targets)?.id).toBe(next.id);
    expect(targetForVersion(next.mcVersion, targets)?.id).toBe(next.id);
    expect(targetForVersion(`Minecraft ${next.mcVersion.split('-')[0]}`, targets)?.id).toBe(
      next.id,
    );
    expect(targetForVersion('0.0.1', targets)).toBeUndefined();
    expect(newerTargets(release.id, targets).map((target) => target.id)).toEqual([next.id]);
    expect(newerTargets(next.id, targets)).toEqual([]);
  });

  it('reads a move not made yet in the report words, then the made move with what is still open', async () => {
    const { session, call } = await setup();
    const before = session.snapshot.project;

    // No version: the newer version the app would offer, tried on a copy.
    let { result, value } = await call();
    expect(result.isError, result.content).toBe(false);
    expect(value.made).toBe(false);
    expect(value.back).toBe(false);
    expect(value.from).toBe(release.mcVersion);
    expect(value.to).toBe(next.mcVersion);
    expect(value.summary).toMatch(/need you\.$/);
    const spikes = value.needsYou.find((item: { elementId?: string }) => item.elementId === SPIKES);
    expect(spikes.sentence).toBe(
      `Spikes uses something Minecraft ${next.mcVersion} no longer has.`,
    );
    expect(spikes.path).toBe('/type');
    expect(spikes.hint).toMatch(/^How: /);
    expect(spikes.open).toBeUndefined();
    expect(value.changedInMinecraft.length).toBeGreaterThan(0);
    for (const item of value.changedInMinecraft) {
      expect(forbiddenIn(item.sentence), item.sentence).toEqual([]);
      expect(item.changeId).toMatch(/^[a-z-]+:/);
    }
    expect(value.cannotKnow).toContain('play it once');
    expect(value.rule).toContain('Do not name others');
    // Nothing changed.
    expect(session.snapshot.project).toBe(before);

    // The same move by its number.
    ({ value } = await call({ version: next.mcVersion }));
    expect(value.to).toBe(next.mcVersion);

    // Unknown versions are refused with the versions known.
    ({ result, value } = await call({ version: '0.0.1' }));
    expect(result.isError).toBe(true);
    expect(value.error.code).toBe('not_found');
    expect(value.error.message).toContain(next.mcVersion);

    // The move made: the saved report, with the items still open.
    const dry = await session.upgradeReport(next.id);
    await session.upgradeTarget(next.id, dry.migration, { upgradeReport: dry.report });
    await session.flushValidation();
    ({ result, value } = await call());
    expect(result.isError, result.content).toBe(false);
    expect(value.made).toBe(true);
    const open = value.needsYou.filter((item: { open: boolean }) => item.open);
    expect(open.length).toBeGreaterThan(0);
    // Fixing the feature takes its items out of what is open.
    session.setElementData(SPIKES, { ...LARGE_DRIPSTONE, type: 'minecraft:ore' });
    await session.flushValidation();
    ({ value } = await call());
    const left = value.needsYou.filter((item: { open: boolean }) => item.open);
    expect(left.length).toBeLessThan(open.length);

    // Moving back is reported as putting back.
    ({ result, value } = await call({ version: release.mcVersion }));
    expect(result.isError, result.content).toBe(false);
    expect(value.back).toBe(true);
    expect(value.made).toBe(false);
    expect(value.otherMoves).toHaveLength(1);
    session.dispose();
  }, 60_000);
});
