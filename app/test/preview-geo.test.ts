import type { Element, Project } from '@msm/plugin-api';
import { type mat4, vec3 } from 'gl-matrix';
import { describe, expect, it } from 'vitest';
import {
  bakeGeometry,
  boneMatrices,
  boxUvRects,
  modelBounds,
  VERTICES_PER_FACE,
} from '../src/renderer/src/preview/geo/geometry';
import {
  animationNotices,
  CATMULLROM_NOTICE,
  evaluateChannel,
  MOLANG_NOTICE,
  parseAnimations,
  playbackTime,
  samplePose,
} from '../src/renderer/src/preview/geo/keyframes';
import { isGeoPreviewKind, resolveGeoScene } from '../src/renderer/src/preview/geo/subject';

const geometry = (bones: unknown[], width = 64, height = 64) => ({
  format_version: '1.12.0',
  'minecraft:geometry': [
    {
      description: { identifier: 'geometry.test', texture_width: width, texture_height: height },
      bones,
    },
  ],
});

/** The world position of a bone-local point. */
const apply = (m: mat4, p: [number, number, number]): number[] =>
  [...vec3.transformMat4(vec3.create(), p, m)].map((v) => Math.round(v * 1e6) / 1e6 + 0);

/** The UV pairs of one baked face (six vertices) starting at vertex `first`. */
const faceUvs = (uvs: Float32Array, first: number, width: number, height: number): number[][] =>
  Array.from({ length: VERTICES_PER_FACE }, (_, i) => [
    Math.round((uvs[(first + i) * 2] as number) * width * 64) / 64,
    Math.round((uvs[(first + i) * 2 + 1] as number) * height * 64) / 64,
  ]);

describe('geometry baker', () => {
  it('bakes a box UV cube into six faces of two triangles', () => {
    const model = bakeGeometry(
      geometry([
        {
          name: 'body',
          pivot: [0, 0, 0],
          cubes: [{ origin: [-8, 0, -8], size: [16, 16, 16], uv: [0, 0] }],
        },
      ]),
    );
    expect(model.problems).toEqual([]);
    expect(model.cubeCount).toBe(1);
    expect(model.positions.length / 3).toBe(36);
    expect(model.uvs.length / 2).toBe(36);
    expect(model.bones[0]).toMatchObject({ name: 'body', parent: -1, first: 0, count: 36 });
    expect(modelBounds(model)).toEqual({ min: [-8, 0, -8], max: [8, 16, 8] });
  });

  it('lays out box UV like Blockbench, mirrored too', () => {
    const rects = boxUvRects([16, 16, 16], [0, 0], false);
    expect(rects.east).toEqual({ u1: 0, v1: 16, u2: 16, v2: 32 });
    expect(rects.north).toEqual({ u1: 16, v1: 16, u2: 32, v2: 32 });
    expect(rects.west).toEqual({ u1: 32, v1: 16, u2: 48, v2: 32 });
    expect(rects.south).toEqual({ u1: 48, v1: 16, u2: 64, v2: 32 });
    expect(rects.up).toEqual({ u1: 32, v1: 16, u2: 16, v2: 0 });
    expect(rects.down).toEqual({ u1: 48, v1: 0, u2: 32, v2: 16 });
    // A biped arm (4x12x4) at its skin offset; sizes are floored.
    const arm = boxUvRects([4.5, 12, 4], [40, 16], false);
    expect(arm.north).toEqual({ u1: 44, v1: 20, u2: 48, v2: 32 });
    const mirrored = boxUvRects([16, 16, 16], [0, 0], true);
    expect(mirrored.east).toEqual({ u1: 48, v1: 16, u2: 32, v2: 32 });
    expect(mirrored.west).toEqual({ u1: 16, v1: 16, u2: 0, v2: 32 });
    expect(mirrored.north).toEqual({ u1: 32, v1: 16, u2: 16, v2: 32 });
  });

  it('maps box UV into the vertex UVs with the anti-bleeding inset', () => {
    const model = bakeGeometry(
      geometry(
        [{ name: 'body', cubes: [{ origin: [0, 0, 0], size: [2, 2, 2], uv: [0, 0] }] }],
        16,
        16,
      ),
    );
    // Face 0 is east: rectangle (0, 2) to (2, 4); corners TL, BL, TR, BL, BR, TR.
    const m = 1 / 64;
    expect(faceUvs(model.uvs, 0, 16, 16)).toEqual([
      [0 + m, 2 + m],
      [0 + m, 4 - m],
      [2 - m, 2 + m],
      [0 + m, 4 - m],
      [2 - m, 4 - m],
      [2 - m, 2 + m],
    ]);
  });

  it('draws only the faces a per-face UV names, flipping up and down', () => {
    const model = bakeGeometry(
      geometry([
        {
          name: 'head',
          cubes: [
            {
              origin: [0, 0, 0],
              size: [8, 8, 8],
              uv: { north: { uv: [8, 8], uv_size: [8, 8] }, up: { uv: [8, 0], uv_size: [8, 8] } },
            },
          ],
        },
      ]),
    );
    expect(model.positions.length / 3).toBe(2 * VERTICES_PER_FACE);
    // Face order east, west, up, down, south, north: up first, then north.
    expect(faceUvs(model.uvs, 0, 64, 64)[0]).toEqual([16, 8]);
    expect(faceUvs(model.uvs, 0, 64, 64)[4]).toEqual([8, 0]);
    expect(faceUvs(model.uvs, VERTICES_PER_FACE, 64, 64)[0]).toEqual([8, 8]);
    expect(faceUvs(model.uvs, VERTICES_PER_FACE, 64, 64)[4]).toEqual([16, 16]);
  });

  it('grows inflated cubes on every side and mirrors x into Blockbench scene space', () => {
    const model = bakeGeometry(
      geometry([
        { name: 'b', cubes: [{ origin: [0, 0, 0], size: [2, 2, 2], inflate: 1, uv: [0, 0] }] },
      ]),
    );
    expect(modelBounds(model)).toEqual({ min: [-3, -1, -1], max: [1, 3, 3] });
    const boneInflate = bakeGeometry(
      geometry([
        { name: 'b', inflate: 0.5, cubes: [{ origin: [0, 0, 0], size: [2, 2, 2], uv: [0, 0] }] },
      ]),
    );
    expect(modelBounds(boneInflate)).toEqual({ min: [-2.5, -0.5, -0.5], max: [0.5, 2.5, 2.5] });
  });

  it('stores vertices relative to the bone pivot and chains parent pivots', () => {
    const model = bakeGeometry(
      geometry([
        { name: 'body', pivot: [0, 10, 0] },
        {
          name: 'arm',
          parent: 'body',
          pivot: [4, 20, 0],
          cubes: [{ origin: [4, 10, 0], size: [2, 10, 2], uv: [0, 0] }],
        },
      ]),
    );
    expect(model.order).toEqual([0, 1]);
    const arm = model.bones[1];
    expect(arm).toMatchObject({ parent: 0, pivot: [-4, 20, 0] });
    const matrices = boneMatrices(model);
    expect(apply(matrices[0] as mat4, [0, 0, 0])).toEqual([0, 10, 0]);
    expect(apply(matrices[1] as mat4, [0, 0, 0])).toEqual([-4, 20, 0]);
    expect(modelBounds(model)).toEqual({ min: [-6, 10, 0], max: [-4, 20, 2] });
  });

  it('rotates in ZYX order with Bedrock x and y negated', () => {
    const model = bakeGeometry(geometry([{ name: 'b', pivot: [0, 0, 0], rotation: [0, 90, 0] }]));
    // Bedrock y +90 is scene y -90: scene +x goes to scene +z.
    expect(apply(boneMatrices(model)[0] as mat4, [1, 0, 0])).toEqual([0, 0, 1]);
    const zyx = bakeGeometry(geometry([{ name: 'b', rotation: [90, 0, 90] }]));
    // Rz(90) * Ry(0) * Rx(-90): x applied first. (0, 1, 0) -> Rx(-90) -> (0, 0, -1) -> Rz(90) -> (0, 0, -1).
    expect(apply(boneMatrices(zyx)[0] as mat4, [0, 1, 0])).toEqual([0, 0, -1]);
    // (0, 0, 1) -> Rx(-90) -> (0, 1, 0) -> Rz(90) -> (-1, 0, 0).
    expect(apply(boneMatrices(zyx)[0] as mat4, [0, 0, 1])).toEqual([-1, 0, 0]);
  });

  it('applies an animation pose: rotation added, position x negated, scale about the pivot', () => {
    const model = bakeGeometry(geometry([{ name: 'b', pivot: [0, 8, 0] }]));
    const pose = new Map([
      [
        'b',
        {
          rotation: [0, 0, 0] as [number, number, number],
          position: [2, 1, 0] as [number, number, number],
          scale: [2, 2, 2] as [number, number, number],
        },
      ],
    ]);
    const m = boneMatrices(model, pose)[0] as mat4;
    expect(apply(m, [0, 0, 0])).toEqual([-2, 9, 0]);
    expect(apply(m, [1, 0, 0])).toEqual([0, 9, 0]);
  });

  it('reports duplicate bones, unknown parents and parent cycles without throwing', () => {
    const model = bakeGeometry(
      geometry([
        { name: 'a', parent: 'b' },
        { name: 'b', parent: 'a' },
        { name: 'a' },
        { name: 'c', parent: 'nowhere' },
      ]),
    );
    expect(model.bones.map((bone) => bone.name)).toEqual(['a', 'b', 'c']);
    expect(model.problems).toEqual([
      'Duplicate bone "a" skipped.',
      'Bone "c" has an unknown parent "nowhere".',
      'Bone "a" is part of a parent cycle; drawn as a root bone.',
    ]);
    expect(new Set(model.order)).toEqual(new Set([0, 1, 2]));
    expect(bakeGeometry({}).problems).toEqual(['The model has no geometry.']);
    expect(modelBounds(bakeGeometry({}))).toBeNull();
  });

  it('turns a rotated cube about its own pivot', () => {
    const model = bakeGeometry(
      geometry([
        {
          name: 'b',
          cubes: [
            {
              origin: [0, 0, 0],
              size: [2, 2, 2],
              pivot: [0, 0, 0],
              rotation: [0, 0, 90],
              uv: [0, 0],
            },
          ],
        },
      ]),
    );
    // Scene box x -2..0, y 0..2 turned +90 about z: x' = -y, y' = x.
    const bounds = modelBounds(model);
    const round = (v: number[] = []) => v.map((n) => Math.round(n * 1e6) / 1e6 + 0);
    expect({ min: round(bounds?.min), max: round(bounds?.max) }).toEqual({
      min: [-2, -2, 0],
      max: [0, 0, 2],
    });
  });
});

describe('keyframe evaluator', () => {
  const data = {
    format_version: '1.8.0',
    animations: {
      walk: {
        loop: true,
        animation_length: 2,
        bones: {
          leg: {
            rotation: { '0.0': [0, 0, 0], '1.0': [40, 0, 0], '2.0': [0, 0, 0] },
            position: { '0.5': { pre: [0, 0, 0], post: [0, 2, 0] }, '1.5': ['1.5', 0, 0] },
          },
        },
      },
      bob: {
        loop: 'hold_on_last_frame',
        bones: { body: { position: { '0': 0, '0.5': 'math.sin(q.anim_time * 90)' }, scale: 2 } },
      },
      wave: {
        bones: {
          arm: { rotation: { '0': { post: [0, 0, 0], lerp_mode: 'catmullrom' }, '1': [0, 0, 90] } },
        },
      },
    },
  };
  const [walk, bob, wave] = parseAnimations(data);

  it('parses animations in file order with loop modes and lengths', () => {
    expect([walk?.name, bob?.name, wave?.name]).toEqual(['walk', 'bob', 'wave']);
    expect([walk?.loop, bob?.loop, wave?.loop]).toEqual([true, 'hold_on_last_frame', false]);
    // Without animation_length, the last keyframe.
    expect([walk?.length, bob?.length, wave?.length]).toEqual([2, 0.5, 1]);
  });

  it('interpolates linearly and holds outside the keyframes', () => {
    const rotation = walk?.bones.get('leg')?.rotation ?? [];
    expect(evaluateChannel(rotation, 0.5)).toEqual([20, 0, 0]);
    expect(evaluateChannel(rotation, 1)).toEqual([40, 0, 0]);
    expect(evaluateChannel(rotation, 1.5)).toEqual([20, 0, 0]);
    expect(evaluateChannel(rotation, 5)).toEqual([0, 0, 0]);
    const position = walk?.bones.get('leg')?.position ?? [];
    // Before the first keyframe its `pre`; from it on its `post`; numeric strings are numbers.
    expect(evaluateChannel(position, 0.2)).toEqual([0, 0, 0]);
    expect(evaluateChannel(position, 0.5)).toEqual([0, 2, 0]);
    expect(evaluateChannel(position, 1)).toEqual([0.75, 1, 0]);
    expect(evaluateChannel(position, 1.5)).toEqual([1.5, 0, 0]);
    expect(walk?.molang).toBe(false);
  });

  it('plays Molang as 0 and catmullrom as linear, with notices', () => {
    const position = bob?.bones.get('body')?.position ?? [];
    expect(evaluateChannel(position, 0.5)).toEqual([0, 0, 0]);
    expect(bob?.bones.get('body')?.scale).toEqual([
      { time: 0, pre: [2, 2, 2], post: [2, 2, 2], catmullrom: false },
    ]);
    expect(animationNotices(bob)).toEqual([MOLANG_NOTICE]);
    expect(evaluateChannel(wave?.bones.get('arm')?.rotation ?? [], 0.5)).toEqual([0, 0, 45]);
    expect(animationNotices(wave)).toEqual([CATMULLROM_NOTICE]);
    expect(animationNotices(walk)).toEqual([]);
  });

  it('maps playback time by loop mode', () => {
    expect(playbackTime({ loop: true, length: 2 }, 5)).toEqual({
      time: 1,
      finished: false,
      rest: false,
    });
    expect(playbackTime({ loop: true, length: 0 }, 5)).toEqual({
      time: 0,
      finished: false,
      rest: false,
    });
    expect(playbackTime({ loop: false, length: 2 }, 1)).toEqual({
      time: 1,
      finished: false,
      rest: false,
    });
    expect(playbackTime({ loop: false, length: 2 }, 3)).toEqual({
      time: 2,
      finished: true,
      rest: true,
    });
    expect(playbackTime({ loop: 'hold_on_last_frame', length: 2 }, 3)).toEqual({
      time: 2,
      finished: true,
      rest: false,
    });
  });

  it('samples a pose with defaults for absent channels', () => {
    const pose = samplePose(walk as NonNullable<typeof walk>, 1);
    expect(pose.get('leg')).toEqual({
      rotation: [40, 0, 0],
      position: [0.75, 1, 0],
      scale: [1, 1, 1],
    });
  });

  it('ignores malformed input', () => {
    expect(parseAnimations(null)).toEqual([]);
    expect(
      parseAnimations({
        animations: { x: 3, y: { bones: { b: { rotation: { nope: [1, 1, 1], '0': true } } } } },
      }),
    ).toEqual([
      {
        name: 'y',
        loop: false,
        length: 0,
        bones: new Map([['b', {}]]),
        catmullrom: false,
        molang: false,
      },
    ]);
  });
});

describe('geo subject resolution', () => {
  const el = (kind: string, id: string, data: unknown): Element =>
    ({ formatVersion: 1, id, kind, data, meta: {} }) as unknown as Element;
  const cube = geometry([{ name: 'body', cubes: [] }]);
  const biped = geometry([{ name: 'body' }, { name: 'head' }, { name: 'left_leg' }]);
  const anims = {
    format_version: '1.8.0',
    animations: { idle: { loop: true, bones: { head: {} } }, walk: { bones: { left_leg: {} } } },
  };
  const project = (elements: Element[]): Project =>
    ({ namespaces: [{ name: 'demo', elements, assets: [] }] }) as unknown as Project;
  const full = project([
    el('msm:geo_model', 'demo:entity/cube', cube),
    el('msm:geo_model', 'demo:entity/golem', biped),
    el('msm:animation', 'demo:entity/golem_animations', anims),
  ]);

  it('knows the geo preview kinds', () => {
    expect(['geo_model', 'animation', 'entity', 'model'].map(isGeoPreviewKind)).toEqual([
      true,
      true,
      true,
      false,
    ]);
  });

  it('draws a geo model with its conventional texture', () => {
    expect(
      resolveGeoScene(full, { previewKind: 'geo_model', id: 'demo:entity/cube', data: cube }),
    ).toEqual({
      ok: true,
      modelId: 'demo:entity/cube',
      model: cube,
      textureId: 'demo:entity/cube',
      animations: null,
      initialAnimation: null,
      scale: 1,
      notices: [],
    });
  });

  it('plays an animation set on the first model with all its bones', () => {
    const scene = resolveGeoScene(full, {
      previewKind: 'animation',
      id: 'demo:entity/golem_animations',
      data: anims,
    });
    expect(scene).toMatchObject({
      ok: true,
      modelId: 'demo:entity/golem',
      model: biped,
      textureId: 'demo:entity/golem',
      initialAnimation: 'idle',
      notices: [],
    });
  });

  it('falls back to the first model with a notice, or explains there is none', () => {
    const other = { animations: { spin: { bones: { tail: {} } } } };
    expect(
      resolveGeoScene(full, { previewKind: 'animation', id: 'demo:x', data: other }),
    ).toMatchObject({
      ok: true,
      modelId: 'demo:entity/cube',
      initialAnimation: 'spin',
      notices: ['No geo model has every bone of this animation set; shown on demo:entity/cube.'],
    });
    expect(
      resolveGeoScene(project([]), { previewKind: 'animation', id: 'demo:x', data: other }),
    ).toEqual({
      ok: false,
      message: 'Add a geo model to the project to play this animation on.',
    });
  });

  const entity = (animated: unknown) => ({
    format: 1,
    components: { 'msm:animated_model': animated },
  });

  it('reads an entity: model, texture, animations, idle and scale', () => {
    const scene = resolveGeoScene(full, {
      previewKind: 'entity',
      id: 'demo:golem',
      data: entity({
        model: 'demo:entity/golem',
        texture: 'demo:entity/golem',
        animations: 'demo:entity/golem_animations',
        idle: 'idle',
        scale: 1.5,
      }),
    });
    expect(scene).toEqual({
      ok: true,
      modelId: 'demo:entity/golem',
      model: biped,
      textureId: 'demo:entity/golem',
      animations: anims,
      initialAnimation: 'idle',
      scale: 1.5,
      notices: [],
    });
  });

  it('shows the panel message for a missing model and notices for the rest', () => {
    expect(
      resolveGeoScene(full, {
        previewKind: 'entity',
        id: 'demo:g',
        data: entity({ model: 'demo:entity/none', texture: '' }),
      }),
    ).toEqual({
      ok: false,
      message: 'Geo model demo:entity/none is not in the project.',
    });
    expect(
      resolveGeoScene(full, {
        previewKind: 'entity',
        id: 'demo:g',
        data: entity({ model: '', texture: '' }),
      }),
    ).toEqual({
      ok: false,
      message: 'Choose a geo model for this entity.',
    });
    expect(
      resolveGeoScene(full, { previewKind: 'entity', id: 'demo:g', data: { components: {} } }),
    ).toEqual({
      ok: false,
      message: 'This entity has no msm:animated_model component.',
    });
    const partial = resolveGeoScene(full, {
      previewKind: 'entity',
      id: 'demo:g',
      data: entity({
        model: 'demo:entity/golem',
        texture: '',
        animations: 'demo:entity/missing',
        scale: -1,
      }),
    });
    expect(partial).toMatchObject({
      ok: true,
      textureId: '',
      animations: null,
      initialAnimation: null,
      scale: 1,
      notices: [
        'No texture chosen; drawn with the missing texture.',
        'Animation set demo:entity/missing is not in the project; shown without animation.',
      ],
    });
    const noIdle = resolveGeoScene(full, {
      previewKind: 'entity',
      id: 'demo:g',
      data: entity({
        model: 'demo:entity/golem',
        texture: 'demo:entity/golem',
        animations: 'demo:entity/golem_animations',
        idle: 'sleep',
      }),
    });
    expect(noIdle).toMatchObject({
      initialAnimation: null,
      notices: ['Idle animation "sleep" is not in demo:entity/golem_animations.'],
    });
  });
});
