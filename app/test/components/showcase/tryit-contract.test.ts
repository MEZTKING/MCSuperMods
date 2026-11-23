// @vitest-environment happy-dom
/**
 * The contract between the showcase and Try it (ADR 0118 Consequences, B566): the members of
 * `TryItArea`, `TryItScene`, `LocalWorldSource` and the grounds that `showcase/` uses (and the
 * clip view of B568 will use, as B565's harness did). The showcase reads Try it and `@msm/sim`
 * without changing them, so when one of these disappears or changes shape this test fails at
 * run time, and the typed block below fails `pnpm typecheck`: fix the showcase, or ask for a
 * seam (reserve B573), rather than editing Try it from here.
 */

import type { Target } from '@msm/plugin-api';
import {
  AREA_SIZE_X,
  AREA_SIZE_Y,
  AREA_SIZE_Z,
  type EntitySnapshot,
  flatGround,
  type GroundBlocks,
  type GroundKind,
  groundState,
  type LocalWorldSource,
  type PlayerAction,
  QUICK_SHAPES,
  QUICK_TREES,
  type QuickWorldOptions,
  quickWorld,
  SIM_TOOLS,
  type SimFiles,
  scriptSources,
  type VehicleSnapshot,
} from '@msm/sim';
import { cleanup, render, screen } from '@testing-library/react';
import { createElement } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { hasWebGL } from '../../../src/renderer/src/preview/webgl';
import { fluidLooks } from '../../../src/renderer/src/tryit/fluids/fluid-pass';
import {
  boxInFrustum,
  type CameraPose,
  frustumPlanes,
} from '../../../src/renderer/src/tryit/render/camera';
import {
  NO_WEBGL_MESSAGE,
  type TryItFrameStats,
  TryItScene,
  type TryItSceneProps,
} from '../../../src/renderer/src/tryit/render/TryItScene';
import {
  ruleBooksOf,
  TryItArea,
  type TryItAreaOptions,
  type TryItScripts,
  toSimFiles,
  type WhatHappenedEntry,
} from '../../../src/renderer/src/tryit/session-source';
import { type DriverView, driverCamera } from '../../../src/renderer/src/tryit/vehicles/camera';
import { TARGETS } from './showcase-fixture';

afterEach(cleanup);

const target = TARGETS[0] as Target;

describe('Try it members the showcase uses', () => {
  it('builds a silent area with the options the clip player passes', () => {
    const files: SimFiles = toSimFiles([]);
    const area = new TryItArea({
      files,
      target,
      seed: 1,
      ruleBooks: ruleBooksOf(null),
      readProjectAsset: async () => null,
      audio: null,
    });
    try {
      // The clock steps one tick at a time while paused.
      area.clock.pause();
      expect(area.clock.paused).toBe(true);
      area.setRunEveryTime(true);
      expect(area.runEveryTime).toBe(true);
      const loaded = area.loadGround('flat', flatGround(), 'Clip');
      expect(loaded.blocks).toBeGreaterThan(0);
      expect(area.ground).toBe('flat');
      const before = area.source.ticksRun;
      area.clock.step();
      expect(area.source.ticksRun).toBe(before + 1);
      // Blocks by state, through the catalogue.
      const state = area.source.catalogue.normalise(groundState('minecraft:stone'));
      expect(state).not.toBeNull();
      if (state !== null) area.source.world.set({ x: 1, y: 10, z: 1 }, state);
      expect(area.source.world.get({ x: 1, y: 10, z: 1 })?.name).toBe('minecraft:stone');
      // The player: put once, its eye read by the driver camera's fallback.
      area.source.player.teleport({ x: 3.5, y: 4, z: 3.5 });
      expect(area.source.player.eyePosition(1).x).toBe(3.5);
      // Mobs and vehicles by order.
      expect(area.source.entities.snapshots()).toEqual([]);
      expect(area.source.entities.count).toBe(0);
      expect(area.source.vehicles.snapshots()).toEqual([]);
      expect(area.source.vehicles.riding).toBeNull();
      expect(area.source.scripts).toBeNull();
      // "What happened" lines carry a serial, a tick, words and a kind.
      area.act({ type: 'break', pos: { x: 1, y: 10, z: 1 } });
      area.act({ type: 'clear' });
      const last = area.whatHappened.at(-1);
      expect(last).toMatchObject({
        serial: expect.any(Number),
        tick: expect.any(Number),
        text: expect.any(String),
      });
      expect(typeof area.subscribe(() => undefined)).toBe('function');
      expect(area.effects.captions).toEqual([]);
      expect(area.particles).toBeDefined();
      expect(area.mobField).toBeDefined();
      expect(area.files).toBe(files);
      expect(area.source.fluids.catalogue.all()).toEqual([]);
      expect(fluidLooks(area.source.fluids.catalogue.all()).size).toBe(0);
    } finally {
      area.dispose();
    }
  });

  it('has the grounds, tools and area size the clip format names', () => {
    expect(AREA_SIZE_X).toBe(48);
    expect(AREA_SIZE_Y).toBe(32);
    expect(AREA_SIZE_Z).toBe(48);
    expect([...QUICK_SHAPES]).toEqual(
      expect.arrayContaining(['flat', 'hills', 'island', 'valley']),
    );
    expect([...QUICK_TREES]).toEqual(['none', 'few', 'many']);
    expect(SIM_TOOLS.map((tool) => tool.id)).toEqual(expect.arrayContaining(['grow', 'power']));
    expect(quickWorld({ shape: 'flat', trees: 'none', seed: 1 }).palette.length).toBeGreaterThan(1);
    expect(groundState('./x[a=b]'.replace('./', 'showcase:'))).toEqual({
      name: 'showcase:x',
      properties: { a: 'b' },
    });
    expect(scriptSources(new Map())).toEqual([]);
  });

  it('gives the driver camera, the frustum test and the no-WebGL scene', () => {
    const walking: DriverView = { riding: null, riderEye: () => null, kindOf: () => undefined };
    expect(driverCamera(walking, 0.5, { yaw: 0, pitch: 0 })).toBeNull();
    expect(typeof frustumPlanes).toBe('function');
    expect(typeof boxInFrustum).toBe('function');
    expect(hasWebGL()).toBe(false);
    render(
      createElement(TryItScene, {
        grid: flatGroundWorld(),
        camera: () => ({ eye: { x: 24, y: 6, z: 30 }, yaw: 180, pitch: 10 }),
        files: new Map(),
        folders: target.folders.resource,
        vanilla: null,
        smaller: true,
        label: 'Clip: A set of wood',
      }),
    );
    expect(screen.getByRole('alert').textContent).toBe(NO_WEBGL_MESSAGE);
  });
});

function flatGroundWorld(): TryItSceneProps['grid'] {
  const area = new TryItArea({ files: new Map(), target });
  area.dispose();
  return area.source.world;
}

/**
 * Never called: type-checked only. Each line is a use the showcase makes; a changed member type
 * fails `pnpm typecheck` here first.
 */
export function typedContract(
  area: TryItArea,
  scripts: TryItScripts,
  pose: CameraPose,
  ground: GroundBlocks,
  options: Partial<QuickWorldOptions>,
): void {
  const areaOptions: TryItAreaOptions = {
    files: area.files,
    target: area.target,
    seed: 1,
    ruleBooks: [],
    readProjectAsset: async () => null,
    audio: null,
    scripts,
    vanillaBlockstates: new Map<string, string>(),
  };
  const kind: GroundKind = 'quick';
  area.loadGround(kind, ground, 'Clip');
  area.loadGround('quick', quickWorld(options), 'Clip');
  const actions: PlayerAction[] = [
    {
      type: 'move',
      forward: 1,
      strafe: 0,
      jump: false,
      sneak: false,
      toggleFly: false,
      yaw: 0,
      pitch: 0,
    },
    {
      type: 'place',
      pos: { x: 0, y: 0, z: 0 },
      face: 'up',
      hit: { x: 0.5, y: 1, z: 0.5 },
      block: 'a:b',
    },
    {
      type: 'use',
      pos: { x: 0, y: 0, z: 0 },
      face: 'up',
      hit: { x: 0.5, y: 1, z: 0.5 },
      item: 'a:b',
    },
    { type: 'break', pos: { x: 0, y: 0, z: 0 } },
    { type: 'interact', entity: 1, item: 'a:b' },
    { type: 'useVehicle', vehicle: 1, item: 'a:b' },
    { type: 'tool', tool: 'grow', pos: { x: 0, y: 0, z: 0 } },
  ];
  for (const action of actions) area.act(action);
  const source: LocalWorldSource = area.source;
  const loaded: boolean | undefined = source.scripts?.loaded;
  const mob: EntitySnapshot | undefined = source.entities.snapshots()[0];
  const vehicle: VehicleSnapshot | undefined = source.vehicles.snapshots()[0];
  const driver: CameraPose | null = driverCamera(source.vehicles, 0, pose);
  const entry: WhatHappenedEntry | undefined = area.whatHappened[0];
  const serial: number | undefined = entry?.serial;
  const scene: TryItSceneProps = {
    grid: source.world,
    camera: () => pose,
    files: area.files,
    folders: area.target.folders.resource,
    vanilla: null,
    readProjectAsset: async () => null,
    particles: area.particles,
    mobs: area.mobField,
    vehicles: {
      snapshots: () => source.vehicles.snapshots(),
      kind: (type) => source.vehicles.types.get(type),
      log: source.log,
    },
    fluids: fluidLooks(source.fluids.catalogue.all()),
    partialTick: () => 0,
    smaller: true,
    maxPixelRatio: 2,
    active: true,
    onFrame: (elapsedMs: number) => void elapsedMs,
    onFrameDrawn: (stats: TryItFrameStats) => void stats.rebuildMs,
    onWebGLUnavailable: () => undefined,
    label: 'Clip',
    webgl: false,
  };
  void [
    areaOptions,
    loaded,
    mob?.position,
    mob?.previousPosition,
    vehicle?.id,
    driver,
    serial,
    scene,
  ];
}
