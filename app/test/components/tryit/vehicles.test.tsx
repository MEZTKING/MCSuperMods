// @vitest-environment happy-dom

/**
 * Try it's vehicles in the view (B428): the hotbar things, the driver's camera, the keys, the
 * pose and root matrix of the vehicle pass (with a fake renderer), the panel, and placing,
 * getting in, driving and getting out through the view's own keys.
 */

import type { OutputFile } from '@msm/plugin-api';
import { buildVehicleCatalogue, type CatalogueVehicle, type VehicleSnapshot } from '@msm/sim';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { mat4, vec3 } from 'gl-matrix';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { frustumPlanes, viewMatrixFor } from '../../../src/renderer/src/tryit/render/camera';
import type { MakeGeoRenderer } from '../../../src/renderer/src/tryit/render/mobs';
import TryItView from '../../../src/renderer/src/tryit/TryItView';
import { useTryItStore } from '../../../src/renderer/src/tryit/tryit-store';
import { CAMERA_MARGIN, driverCamera } from '../../../src/renderer/src/tryit/vehicles/camera';
import { DESCEND_CODE, vehicleKey } from '../../../src/renderer/src/tryit/vehicles/keys';
import { vehicleThings } from '../../../src/renderer/src/tryit/vehicles/things';
import {
  blocksPerSecond,
  fuelWords,
  VehiclePanel,
} from '../../../src/renderer/src/tryit/vehicles/VehiclePanel';
import {
  advanceSpin,
  combinedPose,
  findNamed,
  interpolatedVehicle,
  poseStateOf,
  VehiclePass,
  vehicleLook,
  vehicleRootMatrix,
} from '../../../src/renderer/src/tryit/vehicles/vehicle-pass';
import { demoOutputs, fakeSession, NS, TARGET } from './tryit-fixture';

const folders = TARGET.folders.resource;

const json = (path: string, contents: unknown): OutputFile =>
  ({ path, contents, layer: 'resourcepack' }) as OutputFile;

/** A kart with a turret bone and wheels, its geometry and its item model. */
const KART = {
  format: 1,
  model: { geometry: `${NS}:entity/kart`, texture: `${NS}:entity/kart` },
  size: [1.2, 0.6],
  movement: { mode: 'ground', max_speed: 0.5 },
  seats: [{ offset: [0, 0.2, -0.1] }],
  camera: { distance: 4 },
  parts: { wheels: ['wheel'], steering: ['wheel'] },
  turret: { bone: 'top' },
  engine: { fuel: { items: [{ item: 'minecraft:coal', ticks: 40 }] } },
};

const GEO = {
  format_version: '1.12.0',
  'minecraft:geometry': [
    {
      description: { identifier: 'geometry.kart', texture_width: 64, texture_height: 64 },
      bones: [
        {
          name: 'body',
          pivot: [0, 0, 0],
          cubes: [{ origin: [-8, 2, -8], size: [16, 4, 16], uv: [0, 0] }],
        },
        {
          name: 'wheel',
          pivot: [0, 2, -6],
          cubes: [{ origin: [-9, 0, -7], size: [2, 4, 2], uv: [0, 20] }],
        },
        {
          name: 'top',
          pivot: [0, 6, 0],
          cubes: [{ origin: [-2, 6, -2], size: [4, 4, 4], uv: [0, 30] }],
        },
      ],
    },
  ],
};

function vehicleOutputs(): OutputFile[] {
  return [
    ...demoOutputs({ names: { [`entity.${NS}.kart`]: 'Kart' } }),
    json(`msm/${NS}/vehicle/kart.json`, KART),
    json(`assets/${NS}/geckolib/models/entity/kart.geo.json`, GEO),
    json(`assets/${NS}/${folders.item_definition}/kart.json`, {
      model: { type: 'minecraft:model', model: `${NS}:item/kart` },
    }),
    json(`assets/${NS}/${folders.model}/item/kart.json`, {
      parent: 'minecraft:item/generated',
      textures: { layer0: `${NS}:item/kart` },
    }),
  ];
}

const simFiles = () =>
  new Map(vehicleOutputs().map((file) => [file.path, JSON.stringify(file.contents)]));

function kart(): CatalogueVehicle {
  return buildVehicleCatalogue(simFiles(), TARGET).get(`${NS}:kart`) as CatalogueVehicle;
}

function snapshot(over: Partial<VehicleSnapshot> = {}): VehicleSnapshot {
  return {
    id: 1,
    type: `${NS}:kart`,
    position: { x: 8, y: 0, z: 10 },
    previousPosition: { x: 8, y: 0, z: 9 },
    yaw: 10,
    previousYaw: 350,
    pitch: 0,
    previousPitch: 0,
    speed: 0.3,
    steering: 1,
    throttle: 1,
    distance: 2,
    turretYaw: 20,
    turretPitch: -5,
    fuel: 20,
    fuelCapacity: 400,
    damage: 2,
    maxHealth: 40,
    driven: true,
    onGround: true,
    waterDepth: 0,
    ...over,
  };
}

describe('vehicle things, camera and keys', () => {
  it('offers each vehicle as a hotbar thing with its item picture', () => {
    const things = vehicleThings(buildVehicleCatalogue(simFiles(), TARGET), simFiles(), folders);
    expect(things).toEqual([
      { id: `${NS}:kart`, name: 'Kart', kind: 'vehicle', texture: `${NS}:item/kart` },
    ]);
  });

  it('puts the camera on the seat, or behind it at the camera distance, pulled in by blocks', () => {
    const seat = { x: 5, y: 2, z: 5 };
    const vehicles = {
      riding: 1 as number | null,
      riderEye: () => seat,
      kindOf: () => ({}) as { cameraDistance?: number },
    };
    expect(driverCamera(vehicles, 0.5, { yaw: 0, pitch: 0 })).toEqual({
      eye: seat,
      yaw: 0,
      pitch: 0,
    });
    vehicles.kindOf = () => ({ cameraDistance: 4 });
    const behind = driverCamera(vehicles, 0.5, { yaw: 0, pitch: 0 });
    expect(behind?.eye.z).toBeCloseTo(5 - 4 + CAMERA_MARGIN);
    const pulled = driverCamera(vehicles, 0.5, { yaw: 0, pitch: 0 }, () => 2);
    expect(pulled?.eye.z).toBeCloseTo(5 - 2 + CAMERA_MARGIN);
    vehicles.riding = null;
    expect(driverCamera(vehicles, 0.5, { yaw: 0, pitch: 0 })).toBeNull();
  });

  it('takes Left Alt as the descend key', () => {
    const setDescend = vi.fn();
    const preventDefault = vi.fn();
    expect(vehicleKey({ code: DESCEND_CODE, preventDefault }, true, { setDescend })).toBe(true);
    expect(setDescend).toHaveBeenCalledWith(true);
    expect(vehicleKey({ code: 'KeyW', preventDefault }, true, { setDescend })).toBe(false);
  });
});

describe('vehicle pass', () => {
  it('reads the look and interpolates between ticks the short way round', () => {
    expect(vehicleLook(kart())).toEqual({
      geometry: `${NS}:entity/kart`,
      texture: `${NS}:entity/kart`,
      scale: 1,
    });
    const at = interpolatedVehicle(snapshot(), 0.5);
    expect(at.position.z).toBeCloseTo(9.5);
    expect(at.yaw).toBeCloseTo(360);
  });

  it('turns the model to the yaw with its front ahead and the nose down by the pitch', () => {
    const front = vec3.fromValues(0, 0, -16);
    const at0 = vec3.transformMat4(
      vec3.create(),
      front,
      vehicleRootMatrix({ x: 0, y: 0, z: 0 }, 0, 0, 1),
    );
    expect(at0[2]).toBeCloseTo(1);
    const at90 = vec3.transformMat4(
      vec3.create(),
      front,
      vehicleRootMatrix({ x: 0, y: 0, z: 0 }, 90, 0, 1),
    );
    expect(at90[0]).toBeCloseTo(-1);
    const down = vec3.transformMat4(
      vec3.create(),
      front,
      vehicleRootMatrix({ x: 0, y: 0, z: 0 }, 0, 30, 1),
    );
    expect(down[1]).toBeCloseTo(-0.5);
  });

  it('poses wheels, steering and the turret over the animation', () => {
    const rig = {
      turret: { bone: 'top', pitchBone: null, yawLimit: null, pitchLimit: null },
      wheels: ['wheel'],
      wheelRadius: 0.5,
      steering: ['wheel'],
      rotors: [],
      propellers: [],
    };
    const state = poseStateOf(snapshot(), 0);
    const pose = combinedPose(
      rig,
      state,
      new Map([['top', { rotation: [1, 0, 0], position: [0, 0, 0], scale: [1, 1, 1] }]]),
    );
    expect(pose.get('top')?.rotation).toEqual([1, 20, 0]);
    expect(pose.get('wheel')?.rotation[1]).toBe(30);
    expect(advanceSpin(0, 1, 1000 / 3)).toBeCloseTo(0);
    expect(advanceSpin(0, 0.5, 100)).toBeCloseTo(54);
    expect(findNamed(new Map([['animation.kart.moving', 1]]), 'moving')).toBe(1);
  });

  it('draws a vehicle with its model, and a box without one', async () => {
    const fakeGl = new Proxy(
      {},
      { get: (_t, key) => (key === 'then' ? undefined : () => ({})) },
    ) as unknown as WebGLRenderingContext;
    const renderers: { draw: ReturnType<typeof vi.fn>; dispose: ReturnType<typeof vi.fn> }[] = [];
    const makeRenderer: MakeGeoRenderer = () => {
      const renderer = { draw: vi.fn(), dispose: vi.fn() };
      renderers.push(renderer);
      return renderer;
    };
    const batch = { gl: fakeGl, white: {} as WebGLTexture, draw: vi.fn() };
    const files = simFiles();
    const pass = new VehiclePass(
      batch,
      { files, folders, vanilla: null, readProjectAsset: async () => new Uint8Array([1]) },
      { makeRenderer, decode: async () => ({}) as TexImageSource },
    );
    const pose = { eye: { x: 8, y: 1.6, z: 0 }, yaw: 0, pitch: 0 };
    const projection = mat4.perspective(mat4.create(), 1.2, 16 / 9, 0.05, 500);
    const view = viewMatrixFor(pose);
    const clip = mat4.multiply(mat4.create(), projection, view);
    const frame = {
      projection,
      view,
      clip,
      planes: frustumPlanes(clip),
      alpha: 1,
      nowMs: 0,
      elapsedMs: 16,
    };
    const lines: string[] = [];
    const log = { info: (text: string) => lines.push(text), onlyInMinecraft: () => {} };
    const source = { snapshots: () => [snapshot()], kind: () => kart(), log };
    pass.draw(source, frame);
    await new Promise((done) => setTimeout(done, 0));
    const stats = pass.draw(source, frame);
    expect(stats.models).toBe(1);
    expect(renderers[0]?.draw).toHaveBeenCalled();
    const boxless = {
      ...kart(),
      definition: { ...kart().definition, model: { geometry: `${NS}:entity/none`, texture: '' } },
    };
    const boxed = pass.draw({ snapshots: () => [snapshot()], kind: () => boxless, log }, frame);
    expect(boxed.boxes).toBe(1);
    expect(lines).toContain(
      `Kart's model ${NS}:entity/none is not in the project; the preview draws it as a box.`,
    );
    pass.dispose();
  });
});

describe('vehicle panel', () => {
  it('says speed, health and fuel, and offers the buttons', () => {
    expect(blocksPerSecond(0.4)).toBe('8.0');
    expect(fuelWords(0)).toBe('empty');
    expect(fuelWords(1300)).toBe('1 min 5 s');
    const onFillTank = vi.fn();
    const onGetOut = vi.fn();
    render(
      <VehiclePanel
        vehicles={{
          count: 1,
          riding: 1,
          snapshot: () => snapshot(),
          kindOf: () => kart(),
        }}
        pointed={null}
        onGetIn={vi.fn()}
        onGetOut={onGetOut}
        onFillTank={onFillTank}
        onRepair={vi.fn()}
      />,
    );
    expect(screen.getByTestId('tryit-vehicle-speed').textContent).toBe('6.0 blocks a second');
    expect(screen.getByTestId('tryit-vehicle-health').textContent).toBe('38 of 40');
    expect(screen.getByTestId('tryit-vehicle-fuel').textContent).toContain('1 s');
    expect(screen.getByTestId('tryit-vehicle-state').dataset.riding).toBe(`${NS}:kart`);
    fireEvent.click(screen.getByTestId('tryit-vehicle-fill'));
    expect(onFillTank).toHaveBeenCalledWith(1);
    fireEvent.click(screen.getByTestId('tryit-vehicle-get-out'));
    expect(onGetOut).toHaveBeenCalled();
    cleanup();
  });
});

describe('vehicles in the Try it view', () => {
  beforeEach(() => {
    useTryItStore.getState().reset();
    useTryItStore.setState({ cardSeen: true, smaller: null });
  });
  afterEach(() => {
    cleanup();
    useTryItStore.getState().reset();
  });

  const press = (code: string, options: { shiftKey?: boolean } = {}) =>
    act(() => {
      fireEvent.keyDown(screen.getByTestId('tryit-canvas'), { code, ...options });
      fireEvent.keyUp(screen.getByTestId('tryit-canvas'), { code, ...options });
    });

  it('places the kart from its slot, gets in with C, fills up, drives and gets out', async () => {
    const fake = fakeSession(vehicleOutputs());
    render(
      <TryItView
        session={fake.session}
        root="/projects/demo"
        vanilla={null}
        readProjectAsset={async () => null}
        playAvailable
        onPlay={vi.fn()}
        onTestInMinecraft={vi.fn()}
        webgl={false}
      />,
    );
    await waitFor(() => expect(screen.getByTestId('tryit-vehicle-state')).toBeTruthy());
    const state = () => screen.getByTestId('tryit-vehicle-state');
    // Berry, door, ruby block, the golem's egg, then the kart.
    await waitFor(() =>
      expect(screen.getByTestId('tryit-slot-5').getAttribute('data-thing')).toBe(`${NS}:kart`),
    );
    expect(screen.getByTestId('tryit-keys').textContent).toContain('Get out');
    press('ArrowDown');
    press('ArrowDown');
    press('ArrowDown');
    press('ArrowDown');
    press('Digit5');
    press('KeyC');
    await waitFor(() => expect(state().dataset.vehicles).toBe('1'));
    await waitFor(() => expect(state().dataset.pointed).toBe(`${NS}:kart`));
    expect(screen.getByTestId('tryit-vehicle').dataset.vehicle).toBe(`${NS}:kart`);
    press('KeyC');
    await waitFor(() => expect(state().dataset.riding).toBe(`${NS}:kart`));
    fireEvent.click(screen.getByTestId('tryit-vehicle-fill'));
    await waitFor(() =>
      expect(screen.getByTestId('tryit-vehicle-fuel').textContent).toContain('20 s'),
    );
    fireEvent.click(screen.getByTestId('tryit-vehicle-get-out'));
    await waitFor(() => expect(state().dataset.riding).toBe(''));
    expect(screen.getByTestId('tryit-log').textContent).toContain('You got out of Kart.');
  });
});
