import type { CatalogueEntity, EntitySnapshot, SimLog, SimOrigin } from '@msm/sim';
import { mat4, vec3 } from 'gl-matrix';
import { describe, expect, it, vi } from 'vitest';
import type { ResourceFolders } from '../../../src/renderer/src/preview/model-chain';
import { frustumPlanes, viewMatrixFor } from '../../../src/renderer/src/tryit/render/camera';
import {
  animationFile,
  animationNameFor,
  geoModelFile,
  interpolatedPosition,
  type MakeGeoRenderer,
  MOB_PLATE_LABEL,
  MobField,
  type MobFrame,
  MobPass,
  mobRootMatrix,
  PLATE_RANGE,
  turnTowards,
  writeMobBox,
} from '../../../src/renderer/src/tryit/render/mobs';
import { FLOATS_PER_VERTEX } from '../../../src/renderer/src/tryit/render/particles';

type Line = { kind: 'info' | 'only'; text: string; origin?: SimOrigin };

function recordingLog(): SimLog & { lines: Line[] } {
  const lines: Line[] = [];
  return {
    lines,
    info: (text, origin) => lines.push({ kind: 'info', text, ...(origin ? { origin } : {}) }),
    onlyInMinecraft: (text, origin) =>
      lines.push({ kind: 'only', text, ...(origin ? { origin } : {}) }),
  };
}

const folders: ResourceFolders = {
  atlases: 'atlases',
  block_definition: 'blockstates',
  font: 'font',
  item_definition: 'items',
  lang: 'lang',
  model: 'models',
  sounds_file: 'sounds.json',
  textures: 'textures',
};

const json = (value: unknown) => JSON.stringify(value);

const GEO = {
  format_version: '1.12.0',
  'minecraft:geometry': [
    {
      description: { identifier: 'geometry.golem', texture_width: 64, texture_height: 64 },
      bones: [
        {
          name: 'body',
          pivot: [0, 0, 0],
          cubes: [{ origin: [-4, 0, -4], size: [8, 16, 8], uv: [0, 0] }],
        },
      ],
    },
  ],
};

const ANIMATIONS = {
  format_version: '1.8.0',
  animations: {
    idle: { loop: true, animation_length: 1, bones: { body: { rotation: [0, 0, 0] } } },
    walk: {
      loop: true,
      animation_length: 1,
      bones: { body: { rotation: { '0': [0, 0, 0], '0.5': [0, 40, 0] } } },
    },
  },
};

function entity(overrides: Partial<CatalogueEntity> = {}): CatalogueEntity {
  return {
    id: 'demo:golem',
    displayName: 'Golem',
    width: 0.8,
    height: 1.6,
    mode: 'walk',
    speed: 0.25,
    flyingSpeed: 0.1,
    hovers: true,
    stepHeight: 0.6,
    model: {
      model: 'demo:entity/golem',
      texture: 'demo:entity/golem',
      animations: 'demo:entity/golem',
      scale: 1,
      idle: 'idle',
      walk: 'walk',
    },
    onlyInMinecraft: [],
    origin: { elementId: overrides.id ?? 'demo:golem' },
    ...overrides,
  };
}

function catalogueOf(...entities: CatalogueEntity[]) {
  const byId = new Map(entities.map((e) => [e.id, e]));
  return { get: (id: string) => byId.get(id) };
}

function snapshot(id: number, at: { x: number; z: number }, extra: Partial<EntitySnapshot> = {}) {
  const position = { x: at.x, y: 0, z: at.z };
  return {
    id,
    type: 'demo:golem',
    position,
    previousPosition: position,
    yaw: 0,
    pitch: 0,
    walking: false,
    ...extra,
  } satisfies EntitySnapshot;
}

function golemFiles(geo: unknown = GEO): Map<string, string | Uint8Array> {
  return new Map<string, string | Uint8Array>([
    ['assets/demo/geckolib/models/entity/golem.geo.json', json(geo)],
    ['assets/demo/geckolib/animations/entity/golem.animation.json', json(ANIMATIONS)],
  ]);
}

/** A WebGL context whose every call does nothing and returns a truthy object. */
const fakeGl = new Proxy(
  {},
  { get: (_target, key) => (key === 'then' ? undefined : () => ({})) },
) as unknown as WebGLRenderingContext;

function harness(options: { texture?: Uint8Array | null; plates?: boolean } = {}) {
  const renderers: { draw: ReturnType<typeof vi.fn>; dispose: ReturnType<typeof vi.fn> }[] = [];
  const makeRenderer: MakeGeoRenderer = () => {
    const renderer = { draw: vi.fn(), dispose: vi.fn() };
    renderers.push(renderer);
    return renderer;
  };
  let texture: Uint8Array | null = options.texture ?? new Uint8Array([1, 2, 3]);
  const reads: string[] = [];
  const batch = { gl: fakeGl, white: {} as WebGLTexture, draw: vi.fn() };
  const source = (files: Map<string, string | Uint8Array>) => ({
    files,
    folders,
    vanilla: null,
    readProjectAsset: async (namespace: string, path: string) => {
      reads.push(`${namespace}:${path}`);
      return texture;
    },
  });
  const files = golemFiles();
  const pass = new MobPass(batch, source(files), {
    makeRenderer,
    decode: async (bytes) => ({ bytes }) as unknown as TexImageSource,
    makePlate:
      options.plates === true
        ? (name, label) => ({
            image: { name, label } as unknown as TexImageSource,
            width: 1,
            height: 0.5,
          })
        : () => null,
  });
  return {
    pass,
    batch,
    renderers,
    reads,
    files,
    source,
    setTexture: (bytes: Uint8Array | null) => {
      texture = bytes;
    },
  };
}

/** A frame looking south (+z) from (8, 1.6, 0) over a 32-block area. */
function frame(nowMs = 0): MobFrame {
  const pose = { eye: { x: 8, y: 1.6, z: 0 }, yaw: 0, pitch: 0 };
  const projection = mat4.perspective(mat4.create(), (70 * Math.PI) / 180, 16 / 9, 0.05, 500);
  const view = viewMatrixFor(pose);
  const clip = mat4.multiply(mat4.create(), projection, view);
  return {
    projection,
    view,
    clip,
    planes: frustumPlanes(clip),
    eye: pose.eye,
    alpha: 0.5,
    nowMs,
    elapsedMs: 16,
  };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('mob files and choices', () => {
  it('finds models and animations where GeckoLib reads them', () => {
    expect(geoModelFile('demo:entity/golem')).toBe(
      'assets/demo/geckolib/models/entity/golem.geo.json',
    );
    expect(animationFile('demo:entity/golem')).toBe(
      'assets/demo/geckolib/animations/entity/golem.animation.json',
    );
  });

  it('plays walk while walking, fly for flyers, and idle otherwise', () => {
    const walker = entity();
    expect(animationNameFor(walker, false)).toBe('idle');
    expect(animationNameFor(walker, true)).toBe('walk');
    const flyer = entity({
      mode: 'fly',
      model: { model: 'a:b', texture: 'a:b', scale: 1, idle: 'hover', walk: 'walk', fly: 'flap' },
    });
    expect(animationNameFor(flyer, true)).toBe('flap');
    expect(animationNameFor(flyer, false)).toBe('hover');
    const flyerWithoutFly = entity({
      mode: 'fly',
      model: { model: 'a:b', texture: 'a:b', scale: 1, idle: 'hover', walk: 'walk' },
    });
    expect(animationNameFor(flyerWithoutFly, true)).toBe('walk');
    const standing = entity({ model: { model: 'a:b', texture: 'a:b', scale: 1, idle: 'idle' } });
    expect(animationNameFor(standing, true)).toBe('idle');
    const { model: _model, ...noModel } = entity();
    expect(animationNameFor(noModel, true)).toBeUndefined();
  });
});

describe('mob placement', () => {
  it('draws between ticks by the partial tick', () => {
    const s = snapshot(1, { x: 2, z: 4 }, { previousPosition: { x: 1, y: 0, z: 4 } });
    expect(interpolatedPosition(s, 0)).toEqual({ x: 1, y: 0, z: 4 });
    expect(interpolatedPosition(s, 0.25)).toEqual({ x: 1.25, y: 0, z: 4 });
    expect(interpolatedPosition(s, 1)).toEqual({ x: 2, y: 0, z: 4 });
    expect(interpolatedPosition(s, 3)).toEqual({ x: 2, y: 0, z: 4 });
  });

  it('turns the short way and arrives', () => {
    const step = turnTowards(350, 10, 16);
    expect(step).toBeGreaterThan(350);
    let yaw = 350;
    for (let i = 0; i < 200; i += 1) yaw = turnTowards(yaw, 10, 16);
    expect(((yaw % 360) + 360) % 360).toBeCloseTo(10, 3);
    expect(turnTowards(40, 40, 16)).toBe(40);
  });

  it('turns the model to the yaw: Bedrock front (-z) faces the way the mob walks', () => {
    const front = (yaw: number) => {
      const m = mobRootMatrix({ x: 5, y: 1, z: 5 }, yaw, 1);
      return vec3.transformMat4(vec3.create(), [0, 0, -16], m);
    };
    const south = front(0);
    expect(south[0]).toBeCloseTo(5);
    expect(south[2]).toBeCloseTo(6);
    const west = front(90);
    expect(west[0]).toBeCloseTo(4);
    expect(west[2]).toBeCloseTo(5);
    const scaled = vec3.transformMat4(
      vec3.create(),
      [0, 16, 0],
      mobRootMatrix({ x: 0, y: 0, z: 0 }, 0, 2),
    );
    expect(scaled[1]).toBeCloseTo(2);
  });

  it('writes a shaded box of the hitbox for a mob without a model', () => {
    const out = new Float32Array(36 * FLOATS_PER_VERTEX);
    const end = writeMobBox(out, 0, { x: 2, y: 0, z: 3 }, 0.6, 1.8);
    expect(end).toBe(36 * FLOATS_PER_VERTEX);
    const xs: number[] = [];
    const ys: number[] = [];
    for (let at = 0; at < end; at += FLOATS_PER_VERTEX) {
      xs.push(out[at] as number);
      ys.push(out[at + 1] as number);
    }
    expect(Math.min(...xs)).toBeCloseTo(1.7);
    expect(Math.max(...xs)).toBeCloseTo(2.3);
    expect(Math.min(...ys)).toBe(0);
    expect(Math.max(...ys)).toBeCloseTo(1.8);
  });
});

describe('MobField', () => {
  it('holds the last snapshots, clears, and says each line once', () => {
    const log = recordingLog();
    const field = new MobField({ catalogue: catalogueOf(entity()), log });
    field.update([snapshot(1, { x: 1, z: 1 })]);
    expect(field.size).toBe(1);
    expect(field.entity('demo:golem')?.displayName).toBe('Golem');
    field.sayOnce('k', 'a thing');
    field.sayOnce('k', 'a thing');
    field.sayOnce('p', 'plain', { plain: true });
    expect(log.lines).toEqual([
      { kind: 'only', text: 'a thing' },
      { kind: 'info', text: 'plain' },
    ]);
    const before = field.revision;
    field.setCatalogue(catalogueOf());
    expect(field.revision).toBe(before + 1);
    field.clear();
    expect(field.size).toBe(0);
  });
});

describe('MobPass', () => {
  it('bakes one look for many mobs and draws each with it', async () => {
    const h = harness();
    const field = new MobField({ catalogue: catalogueOf(entity()) });
    const mobs = Array.from({ length: 12 }, (_, i) => snapshot(i + 1, { x: 2 + i, z: 10 }));
    field.update(mobs);
    // The first frame starts reading the picture; nothing is drawn yet.
    expect(h.pass.draw(field, frame()).models).toBe(0);
    await settle();
    const stats = h.pass.draw(field, frame(16));
    expect(stats.models).toBe(12);
    expect(h.renderers).toHaveLength(1);
    expect(h.renderers[0]?.draw).toHaveBeenCalledTimes(12);
    expect(h.pass.lookCount).toBe(1);
    expect(h.reads).toEqual(['demo:textures/entity/golem.png']);
  });

  it('bakes again only when the model file changes, and uploads only new picture bytes', async () => {
    const h = harness();
    const field = new MobField({ catalogue: catalogueOf(entity()) });
    field.update([snapshot(1, { x: 8, z: 6 })]);
    h.pass.draw(field, frame());
    await settle();
    h.pass.draw(field, frame());
    expect(h.renderers).toHaveLength(1);

    // New files with the same model and picture: read again, nothing remade.
    h.pass.setSource(h.source(golemFiles()));
    h.pass.draw(field, frame());
    await settle();
    h.pass.draw(field, frame());
    expect(h.reads).toHaveLength(2);
    expect(h.renderers).toHaveLength(1);

    // A changed model: baked again at once with the picture it has.
    const bigger = structuredClone(GEO);
    const cube = bigger['minecraft:geometry'][0]?.bones[0]?.cubes[0];
    if (cube !== undefined) cube.size = [10, 20, 10];
    h.pass.setSource(h.source(golemFiles(bigger)));
    h.pass.draw(field, frame());
    expect(h.renderers).toHaveLength(2);
    expect(h.renderers[0]?.dispose).toHaveBeenCalledTimes(1);
    await settle();

    // A changed picture: a new renderer.
    h.setTexture(new Uint8Array([9, 9, 9]));
    h.pass.setSource(h.source(golemFiles(bigger)));
    h.pass.draw(field, frame());
    await settle();
    h.pass.draw(field, frame());
    expect(h.renderers).toHaveLength(3);
    expect(h.renderers[2]?.draw).toHaveBeenCalled();
  });

  it('draws a mob without a model as a box and says so once', async () => {
    const h = harness();
    const log = recordingLog();
    const { model: _model, ...plain } = entity({ id: 'demo:blob', displayName: 'Blob' });
    const field = new MobField({ catalogue: catalogueOf(plain), log });
    field.update([
      snapshot(1, { x: 7, z: 6 }, { type: 'demo:blob' }),
      snapshot(2, { x: 9, z: 6 }, { type: 'demo:blob' }),
    ]);
    const stats = h.pass.draw(field, frame());
    h.pass.draw(field, frame());
    expect(stats).toMatchObject({ models: 0, boxes: 2 });
    expect(h.batch.draw).toHaveBeenCalledTimes(2);
    const [, vertices, runs] = h.batch.draw.mock.calls[0] as [unknown, Float32Array, unknown[]];
    expect(vertices.length).toBe(2 * 36 * FLOATS_PER_VERTEX);
    expect(runs).toHaveLength(1);
    expect(log.lines).toEqual([
      {
        kind: 'only',
        text: 'how Blob looks (it has no geo model); the preview draws it as a box',
        origin: { elementId: 'demo:blob' },
      },
    ]);
  });

  it('draws a box for a model the lowered files do not hold, with a plain line', () => {
    const h = harness();
    const log = recordingLog();
    const field = new MobField({
      catalogue: catalogueOf(
        entity({ model: { model: 'demo:entity/gone', texture: 'demo:entity/gone', scale: 1 } }),
      ),
      log,
    });
    field.update([snapshot(1, { x: 8, z: 6 })]);
    expect(h.pass.draw(field, frame()).boxes).toBe(1);
    expect(log.lines[0]?.kind).toBe('info');
    expect(log.lines[0]?.text).toContain('demo:entity/gone is not in the project');
  });

  it('leaves out mobs outside the view', async () => {
    const h = harness();
    const field = new MobField({ catalogue: catalogueOf(entity()) });
    field.update([snapshot(1, { x: 8, z: 6 }), snapshot(2, { x: 8, z: -10 })]);
    h.pass.draw(field, frame());
    await settle();
    expect(h.pass.draw(field, frame()).models).toBe(1);
  });

  it('puts a name plate over mobs near the eye only', async () => {
    const h = harness({ plates: true });
    const field = new MobField({ catalogue: catalogueOf(entity()) });
    field.update([snapshot(1, { x: 8, z: 6 }), snapshot(2, { x: 8, z: PLATE_RANGE + 10 })]);
    h.pass.draw(field, frame());
    await settle();
    const stats = h.pass.draw(field, frame());
    expect(stats).toMatchObject({ models: 2, plates: 1 });
    expect(MOB_PLATE_LABEL).toBe('wanders only in the preview');
  });

  it('starts the walk animation from its beginning when a mob starts walking', async () => {
    const h = harness();
    const field = new MobField({ catalogue: catalogueOf(entity()) });
    field.update([snapshot(1, { x: 8, z: 6 })]);
    h.pass.draw(field, frame(0));
    await settle();
    h.pass.draw(field, frame(1000));
    field.update([snapshot(1, { x: 8, z: 6 }, { walking: true })]);
    // Started at 2000 ms: at 2250 ms the body has turned 20 of its 40 degrees.
    h.pass.draw(field, frame(2000));
    h.pass.draw(field, frame(2250));
    const calls = h.renderers[0]?.draw.mock.calls ?? [];
    const bones = calls[calls.length - 1]?.[2] as mat4[];
    const restBones = calls[0]?.[2] as mat4[];
    expect(bones[0]).not.toEqual(restBones[0]);
    const turned = vec3.transformMat4(vec3.create(), [0, 0, -16], bones[0] as mat4);
    const rest = vec3.transformMat4(vec3.create(), [0, 0, -16], restBones[0] as mat4);
    const angle =
      (Math.atan2(turned[0] - 8, turned[2] - 6) - Math.atan2(rest[0] - 8, rest[2] - 6)) *
      (180 / Math.PI);
    expect(Math.abs(angle)).toBeCloseTo(20, 0);
  });
});
