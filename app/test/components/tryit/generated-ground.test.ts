/**
 * My world generation (B584, ADR 0119 D8): the generated ground through the real engine
 * (`@msm/terrain`, in a worker run in the test's thread), over the engine's own hand-written
 * fixture (the hills; no vanilla file).
 */

import { GROUND_AIR, GROUND_SIZE, groundState } from '@msm/sim';
import * as terrain from '@msm/terrain';
import { describe, expect, it } from 'vitest';
import { HILLS_FILES, hills, hillsFiles } from '../../../../packages/terrain/test/fixture';
import { TerrainClient, type WorldgenFileMap } from '../../../src/renderer/src/terrain/client';
import { SET_UP_WORDS } from '../../../src/renderer/src/terrain/controls';
import type { TerrainFilesState } from '../../../src/renderer/src/terrain/files';
import { GENERATED_WORDS } from '../../../src/renderer/src/tryit/grounds';
import {
  type GeneratedGround,
  type GroundTerrainLink,
  TryItArea,
  toSimFiles,
} from '../../../src/renderer/src/tryit/session-source';
import { localWorker } from '../terrain/fake-engine';
import { demoOutputs, NS, TARGET } from './tryit-fixture';

const FACTS = { dataFolders: [], approximate: [] as ('end' | 'biome_layout')[] };

function filesState(project: WorldgenFileMap, hash: string, needsSetUp = false): TerrainFilesState {
  return {
    target: TARGET,
    facts: FACTS,
    project,
    vanilla: null,
    vanillaKey: null,
    needsSetUp,
    filesHash: hash,
    problems: [],
  };
}

/** A link over the real engine; `edit` hands on new files as `TerrainFiles` would. */
function link(project: WorldgenFileMap, needsSetUp = false) {
  const local = localWorker(terrain);
  const client = new TerrainClient({ createWorker: () => local.worker });
  const listeners = new Set<() => void>();
  let state = filesState(project, 'h0', needsSetUp);
  let changed: number | null = null;
  let edits = 0;
  const value: GroundTerrainLink = {
    client,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSnapshot: () => ({ state, error: null }),
    changedAt: () => changed,
  };
  return {
    link: value,
    local,
    edit(next: WorldgenFileMap) {
      edits += 1;
      changed = performance.now();
      state = filesState(next, `h${edits}`, needsSetUp);
      for (const listener of listeners) listener();
    },
  };
}

function newArea(): TryItArea {
  return new TryItArea({ files: toSimFiles(demoOutputs()), target: TARGET, seed: 2 });
}

/** Runs the worker until the ground has nothing left to ask. */
async function settle(
  local: ReturnType<typeof localWorker>,
  ground: () => GeneratedGround | null,
): Promise<void> {
  for (let i = 0; i < 200; i += 1) {
    await local.flush();
    await new Promise((done) => setTimeout(done, 0));
    const status = ground()?.state.status;
    if (status === 'ready' || status === 'error' || status === 'needsSetUp') {
      await local.flush();
      return;
    }
  }
  throw new Error(`The ground did not settle: ${ground()?.state.status}`);
}

const SPEC = {
  source: { dimension: 'msm:test' },
  seed: '0',
  centre: { x: 5, z: -20 },
  label: 'Test',
  elementId: 'msm:test',
};

/** The block id in the area, `minecraft:air` for air. */
function areaId(area: TryItArea, x: number, y: number, z: number): string {
  return area.source.world.get({ x, y, z })?.name ?? GROUND_AIR;
}

/** Higher land: the gradient reaches 0 at y 75 instead of y 64. */
function higher(): WorldgenFileMap {
  const settings = structuredClone(hills()) as {
    noise_router: { final_density: { input: { left: { to_coordinate: number } } } };
  };
  settings.noise_router.final_density.input.left.to_coordinate = 150;
  return hillsFiles(undefined, { 'worldgen/noise_settings': { 'msm:hills': settings } });
}

describe('the generated ground (B584)', () => {
  it('matches the engine’s columns for the fixture dimension, stage by stage', async () => {
    const { link: terrainLink, local } = link(hillsFiles());
    const area = newArea();
    const started = area.useGenerated(terrainLink, SPEC, { retryMs: 0 });
    await settle(local, () => area.generated);
    await started;
    const state = area.generated?.state;
    expect(state?.status).toBe('ready');
    expect(state?.stage).toBe('features');
    expect(Object.keys(state?.times ?? {}).sort()).toEqual(['features', 'surface', 'terrain']);
    expect(area.ground).toBe('generated');

    // 3 by 3 whole chunks around (5, -20), the surface there a third of the way up.
    const window = area.generatedWindow;
    expect(window).toMatchObject({ x0: -16, z0: -48, sizeX: 48, sizeY: 32, sizeZ: 48 });
    const world = terrain.createTerrainWorld({
      files: { vanilla: null, project: hillsFiles() },
      source: { dimension: 'msm:test' },
      seed: 0n,
      facts: FACTS,
    });
    const surface = terrain.sampleHeights(
      world,
      { x0: 5, z0: -20, width: 1, depth: 1, step: 1 },
      'surface',
    )[0] as number;
    expect(window?.y0).toBe(Math.max(surface, world.seaLevel) - 10);

    const expected = terrain.buildColumns(world, window as terrain.ColumnWindow, 'features');
    let differ = 0;
    let solid = 0;
    for (let y = 0; y < GROUND_SIZE.y; y += 1) {
      for (let z = 0; z < GROUND_SIZE.z; z += 1) {
        for (let x = 0; x < GROUND_SIZE.x; x += 1) {
          const text =
            expected.palette[expected.blocks[(y * GROUND_SIZE.z + z) * GROUND_SIZE.x + x] ?? 0];
          const want = groundState(text ?? GROUND_AIR).name;
          if (want !== GROUND_AIR) solid += 1;
          if (areaId(area, x, y, z) !== want) differ += 1;
        }
      }
    }
    expect(solid).toBeGreaterThan(1000);
    expect(differ).toBe(0);
    // The surface rules ran: grass on top.
    expect(expected.palette).toContain('minecraft:grass_block[snowy=false]');
    // The notes always carry the "about right" line and what is left out.
    expect(state?.notes).toContain(GENERATED_WORDS.aboutRight);
    expect(state?.notes).toContain(GENERATED_WORDS.carved);
    area.dispose();
  });

  it('makes the land again after an edit, keeping the player standing and their blocks', async () => {
    const { link: terrainLink, local, edit } = link(hillsFiles());
    const area = newArea();
    void area.useGenerated(terrainLink, SPEC, { retryMs: 0 });
    await settle(local, () => area.generated);
    const before = area.generatedWindow;
    const feet = area.source.player.position;

    // A block placed in the air over the land (kept) and one low in the sky the land will fill.
    const ruby = { name: `${NS}:ruby_block`, properties: {} };
    const top = (x: number, z: number): number => {
      for (let y = GROUND_SIZE.y - 1; y >= 0; y -= 1) {
        if (area.source.world.get({ x, y, z }) !== null) return y;
      }
      return -1;
    };
    const keptAt = { x: 3, y: GROUND_SIZE.y - 1, z: 3 };
    const lostAt = { x: 40, y: top(40, 40) + 1, z: 40 };
    area.source.world.set(keptAt, ruby);
    area.source.world.set(lostAt, ruby);
    expect(area.generatedEdits).toHaveLength(2);

    edit(higher());
    await settle(local, () => area.generated);
    const state = area.generated?.state;
    expect(state?.reason).toBe('edit');
    expect(state?.runs).toBe(2);
    expect(state?.editMs).not.toBeNull();
    // The same window, the player where they were or lifted onto the new land.
    expect(area.generatedWindow).toEqual(before);
    const now = area.source.player.position;
    expect(now.x).toBe(feet.x);
    expect(now.z).toBe(feet.z);
    expect(now.y).toBeGreaterThanOrEqual(feet.y);
    const cell = { x: Math.floor(now.x), y: Math.floor(now.y + 0.5), z: Math.floor(now.z) };
    expect(area.source.world.get(cell)).toBeNull();
    expect(area.source.world.get({ ...cell, y: cell.y + 1 })).toBeNull();
    // The land rose: the lost block's place is land now, the kept one is still there.
    expect(areaId(area, keptAt.x, keptAt.y, keptAt.z)).toBe(`${NS}:ruby_block`);
    expect(areaId(area, lostAt.x, lostAt.y, lostAt.z)).not.toBe(`${NS}:ruby_block`);
    expect(areaId(area, lostAt.x, lostAt.y, lostAt.z)).not.toBe(GROUND_AIR);
    expect(area.generatedEdits).toHaveLength(1);
    expect(area.whatHappened.map((entry) => entry.text)).toContain(
      '1 block you placed is gone: the new land fills its place.',
    );
    area.dispose();
  });

  it('moves the window up and down, and makes the land around the player', async () => {
    const { link: terrainLink, local } = link(hillsFiles());
    const area = newArea();
    void area.useGenerated(terrainLink, SPEC, { retryMs: 0 });
    await settle(local, () => area.generated);
    const start = area.generatedWindow;
    if (start === null) throw new Error('no window');
    void area.generated?.move(16);
    await settle(local, () => area.generated);
    expect(area.generatedWindow?.y0).toBe(start.y0 + 16);
    void area.generated?.move(-32);
    await settle(local, () => area.generated);
    // The hills' world starts at y 0: the window stops there.
    expect(area.generatedWindow?.y0).toBe(Math.max(0, start.y0 - 16));
    area.source.player.teleport({ x: 47.5, y: 31, z: 0.5 });
    void area.generated?.aroundPlayer();
    await settle(local, () => area.generated);
    expect(area.generatedWindow?.x0).toBe(start.x0 + 16);
    expect(area.generatedWindow?.z0).toBe(start.z0 - 16);
    // The player keeps their place in the world: now in the middle chunk.
    expect(area.source.player.position.x).toBeCloseTo(31.5);
    expect(area.source.player.position.z).toBeCloseTo(16.5);
    area.dispose();
  });

  it('shows the set-up banner instead of land when a vanilla file is missing', async () => {
    const files = hillsFiles();
    const project = {
      ...files,
      dimension: {
        'msm:test': {
          type: 'msm:hills',
          generator: {
            type: 'minecraft:noise',
            settings: 'minecraft:overworld',
            biome_source: { type: 'minecraft:fixed', biome: 'msm:meadow' },
          },
        },
      },
    };
    const { link: terrainLink, local } = link(project, true);
    const area = newArea();
    const started = area.useGenerated(terrainLink, SPEC, { retryMs: 0 });
    const outcome = started.then(
      () => 'shown',
      (error: Error) => error.message,
    );
    await settle(local, () => area.generated);
    expect(await outcome).toBe(SET_UP_WORDS);
    expect(area.generated?.state.status).toBe('needsSetUp');
    expect(area.generatedWindow).toBeNull();
    area.dispose();
  });

  it('another ground replaces it and stops it following edits', async () => {
    const { link: terrainLink, local, edit } = link(hillsFiles());
    const area = newArea();
    void area.useGenerated(terrainLink, SPEC, { retryMs: 0 });
    await settle(local, () => area.generated);
    area.loadGround('flat', undefined, 'Flat world');
    expect(area.generated).toBeNull();
    expect(area.generatedWindow).toBeNull();
    const posted = local.sent.length;
    edit({ ...HILLS_FILES });
    await local.flush();
    expect(local.sent.length).toBe(posted);
    area.dispose();
  });
});
