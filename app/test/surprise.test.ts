/**
 * "Surprise me" (ADR 0086): the seeded generator through the real session, the library's flows
 * and the Creator's planning. Every seed of a fixed list, on each built-in target, gives a mod
 * whose changes apply as one undo step, validate with no errors and lower to a Fabric content
 * jar; Undo restores the project. The same seed gives the same mod; answers stay within each
 * question's rules; "Pick for me" answers any flow validly.
 */

import { createMemoryFileSystem, type Json, type Project } from '@msm/core';
import { SEPARATE_RUNTIME_OPTION } from '@msm/exporters';
import { builtInTargets } from '@msm/targets';
import { describe, expect, it, vi } from 'vitest';
import { createScriptingService } from '../src/main/platform/scripting';
import { MAKE_TILES } from '../src/renderer/src/components/home/tiles';
import { validateParameter } from '../src/renderer/src/components/wizard/wizard-model';
import type { ProjectSession } from '../src/renderer/src/session/project-session';
import {
  bundleClashes,
  FLOW_RECIPES,
  isSeed,
  newSeed,
  pickForMe,
  randomAnswers,
  rollSurprise,
  SURPRISE_THEMES,
  type SurpriseInput,
  seededRandom,
  themeOfSeed,
} from '../src/renderer/src/surprise/surprise';
import { newSession } from './session-fixture';

vi.setConfig({ testTimeout: 600_000 });

const SEEDS = Number(process.env.SURPRISE_SEEDS ?? 200);
const runtimeBytes = new Uint8Array([0x50, 0x4b, 0x05, 0x06, 1, 2, 3]);

async function openSession(targetId?: string) {
  const fs = createMemoryFileSystem();
  const { session, platform } = newSession(
    fs,
    {},
    { scripting: createScriptingService(), validationDelay: 0 },
  );
  platform.exports = {
    ...platform.exports,
    runtimeJar: async () => runtimeBytes,
    geckolibJar: async () => runtimeBytes,
  };
  const opened = await session.newProject(targetId === undefined ? {} : { targetId });
  expect(opened.ok).toBe(true);
  await session.schemas();
  await session.flushValidation();
  return session;
}

const projectOf = (session: ProjectSession) => session.snapshot.project as Project;

function inputOf(session: ProjectSession, seed: number, themeId?: string): SurpriseInput {
  const project = projectOf(session);
  return {
    seed,
    ...(themeId === undefined ? {} : { themeId }),
    starters: session.library.starters,
    target: session.target,
    namespace: project.namespaces.find((entry) => entry.name !== 'minecraft')?.name ?? 'demo',
    project,
    isKnownKind: (kind) => session.registry.get(kind) !== undefined,
    rules: session.registry.get('msm:rules') !== undefined,
  };
}

describe('Surprise me: seeds and answers', () => {
  it('makes seeds from 1 to 999999 and checks them', () => {
    expect(newSeed(() => 0)).toBe(1);
    expect(newSeed(() => 0.9999999)).toBe(999_999);
    expect(isSeed(1)).toBe(true);
    expect(isSeed(0)).toBe(false);
    expect(isSeed(1.5)).toBe(false);
    expect(isSeed(1_000_000)).toBe(false);
  });

  it('gives the same numbers for the same seed', () => {
    const a = seededRandom(42);
    const b = seededRandom(42);
    const first = [a(), a(), a()];
    expect([b(), b(), b()]).toEqual(first);
    expect(first.every((value) => value >= 0 && value < 1)).toBe(true);
    expect(seededRandom(43)()).not.toBe(first[0]);
  });

  it('has themes with valid words and colours', () => {
    expect(SURPRISE_THEMES.length).toBeGreaterThanOrEqual(6);
    for (const theme of SURPRISE_THEMES) {
      expect(theme.word).toMatch(/^[A-Z][a-z]+$/);
      for (const colour of theme.colours) expect(colour).toMatch(/^#[0-9a-f]{6}$/);
    }
    expect(SURPRISE_THEMES.map((theme) => theme.id)).toContain(themeOfSeed(7).id);
  });

  it('answers every Creator flow within its rules, for many seeds', async () => {
    const session = await openSession();
    const flows = session.library.starters.filter((starter) => starter.creator !== undefined);
    for (const flow of flows) {
      for (let seed = 1; seed <= 40; seed += 1) {
        for (const values of [
          randomAnswers(flow.parameters, seededRandom(seed)),
          pickForMe(flow, seed),
        ]) {
          for (const parameter of flow.parameters ?? []) {
            const value = values[parameter.id] as Json;
            const raw =
              typeof value === 'number' ? String(value) : value === null ? '' : (value as never);
            expect(validateParameter(parameter, raw), `${flow.id} ${parameter.id}`).toBeNull();
          }
        }
      }
    }
  });

  it('names every recipe flow and keeps them Creator flows of the library', async () => {
    const session = await openSession();
    for (const recipe of FLOW_RECIPES) {
      const flow = session.library.starters.find((starter) => starter.id === recipe.flowId);
      expect(flow?.creator, recipe.flowId).toBeDefined();
      for (const id of Object.keys(recipe.names)) {
        expect(
          flow?.parameters?.some((parameter) => parameter.id === id && parameter.type === 'string'),
          `${recipe.flowId} ${id}`,
        ).toBe(true);
      }
    }
  });
});

describe('Surprise me: the mod', () => {
  it('gives the same mod for the same seed and theme, and another for another seed', async () => {
    const session = await openSession();
    const a = await rollSurprise(inputOf(session, 1234));
    const b = await rollSurprise(inputOf(session, 1234));
    expect(b.items).toEqual(a.items);
    expect(b.things.map((thing) => thing.values)).toEqual(a.things.map((thing) => thing.values));
    expect(a.things.length).toBeGreaterThanOrEqual(3);
    expect(a.things.length).toBeLessThanOrEqual(5);
    const c = await rollSurprise(inputOf(session, 1235));
    expect(c.items).not.toEqual(a.items);
    // Another theme keeps the things but changes their names.
    const other = SURPRISE_THEMES.find((theme) => theme.id !== a.theme.id)?.id as string;
    const d = await rollSurprise(inputOf(session, 1234, other));
    expect(d.theme.id).toBe(other);
    expect(d.things.map((thing) => thing.flowId)).toEqual(a.things.map((thing) => thing.flowId));
    expect(d.things[0]?.name).not.toBe(a.things[0]?.name);
  });

  it('avoids ids the project already has, as one undo step that Undo takes back', async () => {
    const session = await openSession();
    const before = projectOf(session);
    const first = await rollSurprise(inputOf(session, 77));
    await session.applyChangeset(first.items, first.label);
    expect(session.snapshot.undoLabel).toBe(first.label);
    const afterFirst = projectOf(session);
    // The same seed again: nothing clashes, every thing gets a new name.
    const second = await rollSurprise(inputOf(session, 77));
    expect(second.things.length).toBe(first.things.length);
    for (const thing of second.things)
      expect(bundleClashes(thing.bundle, afterFirst, thing.flowId)).toBe(false);
    const result = await session.applyChangeset(second.items, second.label);
    expect(result.skipped).toEqual([]);
    await session.flushValidation();
    const errors = session.snapshot.problems.filter((problem) => problem.severity === 'error');
    expect(errors).toEqual([]);
    expect(session.undo()).toBe(true);
    expect(projectOf(session)).toEqual(afterFirst);
    expect(session.undo()).toBe(true);
    expect(projectOf(session)).toEqual(before);
  });

  for (const bundle of builtInTargets) {
    const targetId = bundle.target.id;
    it(`validates with no errors and lowers to a content jar on ${targetId} (${SEEDS} seeds)`, async () => {
      const session = await openSession(targetId);
      expect(session.target.id).toBe(targetId);
      const before = projectOf(session);
      const flows = new Set<string>();
      let rules = 0;
      for (let seed = 1; seed <= SEEDS; seed += 1) {
        const mod = await rollSurprise(inputOf(session, seed * 7919));
        expect(mod.things.length, `seed ${seed}`).toBeGreaterThanOrEqual(3);
        for (const thing of mod.things) flows.add(thing.flowId);
        if (mod.rule !== null) rules += 1;
        const applied = await session.applyChangeset(mod.items, mod.label);
        expect(applied.skipped, `seed ${seed}`).toEqual([]);
        const jar = await session.buildContentJar({ [SEPARATE_RUNTIME_OPTION]: true });
        const errors = jar.report.problems
          .filter((problem) => problem.severity === 'error')
          .map((problem) => `${problem.elementId ?? ''} ${problem.code} ${problem.message}`);
        expect(errors, `seed ${seed * 7919} ${mod.things.map((t) => t.flowId).join(',')}`).toEqual(
          [],
        );
        expect(jar.data, `seed ${seed}`).toBeDefined();
        // The session's own pass (schemas, plugin validators, scripts) ran before the export.
        const sessionErrors = session.snapshot.problems
          .filter((problem) => problem.severity === 'error')
          .map((problem) => `${problem.elementId ?? ''} ${problem.code}`);
        expect(sessionErrors, `seed ${seed * 7919}`).toEqual([]);
        expect(session.undo()).toBe(true);
        expect(projectOf(session)).toEqual(before);
      }
      if (SEEDS >= 50) {
        expect(flows.size).toBeGreaterThanOrEqual(10);
        expect(rules).toBeGreaterThan(0);
      }
    });
  }
});

describe('Home tiles: the library starters they add (ADR 0086 D8)', () => {
  const starterIds = MAKE_TILES.flatMap((tile) =>
    tile.action.type === 'flows' ? (tile.action.starterIds ?? []) : [],
  );

  for (const bundle of builtInTargets) {
    const targetId = bundle.target.id;
    it(`adds each tile starter to a mod with no errors on ${targetId}, one undo step each`, async () => {
      const session = await openSession(targetId);
      const before = projectOf(session);
      for (const id of starterIds) {
        const starter = session.library.starters.find((entry) => entry.id === id);
        if (starter === undefined) throw new Error(`no starter ${id}`);
        if (starter.supports !== undefined && !starter.supports(session.target)) continue;
        const result = await session.addBundle(starter, {
          namespace: 'demo',
          label: `Add ${starter.title}`,
        });
        expect(result.added.length, id).toBeGreaterThan(0);
        expect(session.snapshot.undoLabel).toBe(`Add ${starter.title}`);
        await session.flushValidation();
        const errors = session.snapshot.problems
          .filter((problem) => problem.severity === 'error')
          .map((problem) => `${problem.elementId ?? ''} ${problem.code} ${problem.message}`);
        expect(errors, id).toEqual([]);
        expect(session.undo()).toBe(true);
        expect(projectOf(session)).toEqual(before);
      }
    });
  }
});
