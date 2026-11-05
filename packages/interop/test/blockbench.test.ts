import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Json } from '@msm/plugin-api';
import { strToU8 } from 'fflate';
import { describe, expect, it } from 'vitest';
import {
  type AnimationFile,
  blockbenchFileType,
  blockbenchImporter,
  checkAnimationJson,
  checkGeoJson,
  convertBbmodel,
  createBlockbenchImporter,
  type GeoBone,
  type GeoFile,
  importBlockbenchFile,
} from '../src/index';
import { makePng } from './helpers/synthetic-jar';

/** Set `UPDATE_GOLDENS=1` to rewrite the expected files from the current output. */
const update = process.env.UPDATE_GOLDENS === '1';
const FIXTURES = join(import.meta.dirname, 'fixtures', 'blockbench');
const EXPECTED = join(FIXTURES, 'expected');

type Obj = Record<string, unknown>;

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, sortKeys((value as Obj)[key])]),
    );
  }
  return value;
}

function golden(name: string, actual: unknown): void {
  const path = join(EXPECTED, name);
  if (update || !existsSync(path)) {
    writeFileSync(path, `${JSON.stringify(sortKeys(actual), null, 2)}\n`);
  }
  expect(JSON.parse(JSON.stringify(actual))).toEqual(JSON.parse(readFileSync(path, 'utf8')));
}

function dataUrl(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `data:image/png;base64,${btoa(binary)}`;
}

const PNG = makePng(8, 8);

/** The fixture with its texture embedded (the PNG is made by the test). */
function fixture(): Obj {
  const model = JSON.parse(readFileSync(join(FIXTURES, 'two_bones.bbmodel'), 'utf8')) as Obj;
  const textures = model.textures as Obj[];
  (textures[0] as Obj).source = dataUrl(PNG);
  return model;
}

/** The fixture without an embedded texture source. */
function fixtureRaw(): Obj {
  return JSON.parse(readFileSync(join(FIXTURES, 'two_bones.bbmodel'), 'utf8')) as Obj;
}

/** Rewrites a 5.x project into the 4.x layout: group fields inline, Bedrock-oriented keyframes. */
function toV4(model: Obj): Obj {
  const groups = new Map((model.groups as Obj[]).map((g) => [g.uuid as string, g]));
  const inline = (node: unknown): unknown => {
    if (typeof node === 'string') return node;
    const n = node as Obj;
    return { ...groups.get(n.uuid as string), children: (n.children as unknown[]).map(inline) };
  };
  const v4 = structuredClone(model);
  v4.meta = { ...(v4.meta as Obj), format_version: '4.10' };
  delete v4.groups;
  v4.outliner = (model.outliner as unknown[]).map(inline);
  for (const animation of v4.animations as Obj[]) {
    for (const animator of Object.values(animation.animators as Obj)) {
      for (const kf of (animator as Obj).keyframes as Obj[]) {
        for (const dp of kf.data_points as Obj[]) {
          const flip = (v: unknown): unknown =>
            Number.isFinite(Number(v)) ? String(-Number(v) || 0) : `-(${String(v)})`;
          if (kf.channel === 'position' || kf.channel === 'rotation') dp.x = flip(dp.x);
          if (kf.channel === 'rotation') dp.y = flip(dp.y);
        }
      }
    }
  }
  return v4;
}

function bones(geometry: GeoFile | undefined): GeoBone[] {
  return geometry?.['minecraft:geometry'][0]?.bones ?? [];
}

function bone(geometry: GeoFile | undefined, name: string): GeoBone {
  const found = bones(geometry).find((b) => b.name === name);
  if (!found) throw new Error(`no bone ${name}`);
  return found;
}

function codes(problems: { code: string }[]): string[] {
  return problems.map((p) => p.code);
}

/** Structural checks mirroring the `msm:geo_model` schema (strict keys). */
function assertGeoShape(geo: GeoFile): void {
  expect(Object.keys(geo).sort()).toEqual(['format_version', 'minecraft:geometry']);
  for (const def of geo['minecraft:geometry']) {
    expect(Number.isInteger(def.description.texture_width)).toBe(true);
    expect(def.description.texture_width).toBeGreaterThanOrEqual(1);
    for (const b of def.bones ?? []) {
      for (const key of Object.keys(b)) {
        expect(['name', 'parent', 'pivot', 'rotation', 'mirror', 'reset', 'cubes']).toContain(key);
      }
      expect(b.pivot).toHaveLength(3);
      for (const cube of b.cubes ?? []) {
        for (const key of Object.keys(cube)) {
          expect(['origin', 'size', 'pivot', 'rotation', 'inflate', 'mirror', 'uv']).toContain(key);
        }
        expect(cube.origin).toHaveLength(3);
        expect(cube.size).toHaveLength(3);
      }
    }
  }
}

/** Structural checks mirroring the `msm:animation` schema. */
function assertAnimationShape(file: AnimationFile): void {
  expect(Object.keys(file).sort()).toEqual(['animations', 'format_version']);
  for (const animation of Object.values(file.animations)) {
    for (const boneTag of Object.values(animation.bones)) {
      for (const [channel, frames] of Object.entries(boneTag)) {
        expect(['rotation', 'position', 'scale']).toContain(channel);
        for (const [time, value] of Object.entries(frames as Obj)) {
          expect(Number.isFinite(Number(time))).toBe(true);
          if (Array.isArray(value)) expect(value).toHaveLength(3);
          else {
            for (const key of Object.keys(value as Obj)) {
              expect(['pre', 'post', 'lerp_mode']).toContain(key);
            }
            const lerp = (value as Obj).lerp_mode;
            if (lerp !== undefined) expect(['linear', 'catmullrom']).toContain(lerp);
          }
        }
      }
    }
  }
}

describe('convertBbmodel', () => {
  it('converts two_bones.bbmodel to the golden geometry and animation files', () => {
    const result = convertBbmodel(fixture());
    expect(result.problems).toEqual([]);
    expect(result.name).toBe('two_bones');
    if (!result.geometry || !result.animations) throw new Error('missing output');
    assertGeoShape(result.geometry);
    assertAnimationShape(result.animations);
    golden('two_bones.geo.json', result.geometry);
    golden('two_bones.animation.json', result.animations);
  });

  it('applies the Bedrock export sign conventions to cubes and bones', () => {
    const { geometry } = convertBbmodel(fixture());
    expect(geometry?.format_version).toBe('1.12.0');
    const description = geometry?.['minecraft:geometry'][0]?.description;
    expect(description).toMatchObject({
      identifier: 'geometry.two_bones',
      texture_width: 32,
      texture_height: 32,
    });
    const body = bone(geometry, 'body');
    expect(body.parent).toBeUndefined();
    expect(body.pivot).toEqual([0, 0, 0]);
    expect(body.rotation).toBeUndefined();
    // from [-4, 0, -3], to [4, 8, 3]: origin.x = -(from.x + size.x) = -(-4 + 8).
    expect(body.cubes?.[0]).toEqual({ origin: [-4, 0, -3], size: [8, 8, 6], uv: [0, 0] });
    const head = bone(geometry, 'head');
    expect(head.parent).toBe('body');
    // group origin [2, 8, -1] -> pivot x negated; rotation [5, -10, 15] -> x and y negated.
    expect(head.pivot).toEqual([-2, 8, -1]);
    expect(head.rotation).toEqual([-5, 10, 15]);
    // from [-3, 8, -3], size 6: origin.x = -(-3 + 6); cube origin [1, 8, 0] -> pivot [-1, 8, 0];
    // rotation [10, 20, 5] -> [-10, -20, 5]; box UV with mirror (bone not mirrored).
    expect(head.cubes?.[0]).toEqual({
      origin: [-3, 8, -3],
      size: [6, 6, 6],
      pivot: [-1, 8, 0],
      rotation: [-10, -20, 5],
      uv: [0, 14],
      mirror: true,
    });
  });

  it('negates position x and rotation x and y of 5.x keyframes', () => {
    const { animations } = convertBbmodel(fixture());
    const walk = animations?.animations['animation.two_bones.walk'];
    expect(animations?.format_version).toBe('1.8.0');
    expect(walk?.loop).toBe(true);
    expect(walk?.animation_length).toBe(1);
    expect(walk?.bones.head?.rotation).toEqual({ '0.0': [0, 0, 0], '0.5': [-10, 20, 5] });
    expect(walk?.bones.head?.position).toEqual({
      '0.0': [0, 0, 0],
      // The keyframe after a step keyframe holds the previous value until its time.
      '0.5': { pre: [0, 0, 0], post: [-2, 1, 0] },
      '1.0': {
        pre: ['-(math.sin(q.anim_time * 90))', 0, 0],
        post: ['-(math.sin(q.anim_time * 90))', 0, 0],
        lerp_mode: 'catmullrom',
      },
    });
    expect(walk?.bones.body?.scale).toEqual({ '0.25': [1, 1.25, 1] });
  });

  it('reads the 4.x layout (inline groups, Bedrock-oriented keyframes) to the same output', () => {
    const v5 = convertBbmodel(fixture());
    const v4 = convertBbmodel(toV4(fixture()));
    expect(v4.problems).toEqual([]);
    expect(v4.geometry).toEqual(v5.geometry);
    expect(v4.animations).toEqual(v5.animations);
  });

  it('decodes embedded PNG textures', () => {
    const { textures } = convertBbmodel(fixture());
    expect(textures).toHaveLength(1);
    expect(textures[0]).toMatchObject({ index: 0, name: 'two_bones.png', width: 8, height: 8 });
    expect(textures[0]?.bytes).toEqual(PNG);
  });

  it('reports textures that are not embedded or not PNG', () => {
    const model = fixtureRaw();
    (model.textures as Obj[]).push({ name: 'other.jpg', source: 'data:image/jpeg;base64,AAAA' });
    (model.textures as Obj[]).push({ name: 'broken.png', source: 'data:image/png;base64,AAAA' });
    const result = convertBbmodel(model);
    expect(result.textures).toEqual([]);
    expect(codes(result.problems)).toEqual([
      'blockbench.texture-not-embedded',
      'blockbench.texture-not-png',
      'blockbench.texture-invalid',
    ]);
    expect(result.geometry).toBeDefined();
  });

  it('warns on an unknown format version and continues', () => {
    const model = fixture();
    model.meta = { ...(model.meta as Obj), format_version: '6.0' };
    const result = convertBbmodel(model);
    expect(codes(result.problems)).toEqual(['blockbench.unknown-format-version']);
    expect(result.problems[0]?.severity).toBe('warning');
    expect(bones(result.geometry)).toHaveLength(2);
  });

  it('refuses Java block models', () => {
    const model = fixture();
    model.meta = { ...(model.meta as Obj), model_format: 'java_block' };
    const result = convertBbmodel(model);
    expect(result.geometry).toBeUndefined();
    expect(result.animations).toBeUndefined();
    expect(result.problems).toMatchObject([
      { severity: 'error', code: 'blockbench.java-block-not-supported' },
    ]);
    expect(result.problems[0]?.message).toContain('Export Block/Item Model');
  });

  it('refuses files that are not projects', () => {
    expect(codes(convertBbmodel([]).problems)).toEqual(['blockbench.not-a-model']);
    expect(codes(convertBbmodel({ elements: [] }).problems)).toEqual(['blockbench.not-a-model']);
  });

  it('skips non-cube elements and puts loose cubes under a root bone', () => {
    const model = fixtureRaw();
    (model.elements as Obj[]).push(
      { type: 'locator', name: 'hand', uuid: 'l1', position: [0, 0, 0] },
      { type: 'mesh', name: 'blob', uuid: 'm1' },
      { name: 'tail', from: [0, 0, 3], to: [1, 1, 7], uv_offset: [10, 10], uuid: 'c3' },
    );
    (model.outliner as unknown[]).push('l1', 'm1', 'c3');
    const result = convertBbmodel(model);
    expect(codes(result.problems)).toEqual([
      'blockbench.unsupported-element',
      'blockbench.unsupported-element',
      'blockbench.texture-not-embedded',
    ]);
    expect(bones(result.geometry).map((b) => b.name)).toEqual(['root', 'body', 'head']);
    expect(bone(result.geometry, 'root')).toEqual({
      name: 'root',
      pivot: [0, 0, 0],
      cubes: [{ origin: [-1, 0, 3], size: [1, 1, 4], uv: [10, 10] }],
    });
  });

  it('names the root bone apart from a group called root', () => {
    const model = fixtureRaw();
    (model.groups as Obj[])[0] = { ...(model.groups as Obj[])[0], name: 'root' };
    (model.elements as Obj[]).push({ name: 'x', from: [0, 0, 0], to: [1, 1, 1], uuid: 'c3' });
    (model.outliner as unknown[]).push('c3');
    const names = bones(convertBbmodel(model).geometry).map((b) => b.name);
    expect(names).toEqual(['root_2', 'root', 'head']);
  });

  it('writes per-face UVs with the up and down faces flipped', () => {
    const model = fixtureRaw();
    model.meta = { ...(model.meta as Obj), box_uv: false };
    for (const element of model.elements as Obj[]) delete element.box_uv;
    const faces = (model.elements as Obj[])[0]?.faces as Obj;
    faces.west = { uv: [14, 6, 20, 14], texture: null };
    (faces.north as Obj).rotation = 90;
    const cube = bone(convertBbmodel(model).geometry, 'body').cubes?.[0];
    expect(cube?.uv).toEqual({
      north: { uv: [6, 6], uv_size: [8, 8], uv_rotation: 90 },
      east: { uv: [0, 6], uv_size: [6, 8] },
      south: { uv: [20, 6], uv_size: [8, 8] },
      // up [14, 6, 6, 0]: uv = [u2, v2], uv_size = [u1 - u2, v1 - v2].
      up: { uv: [6, 0], uv_size: [8, 6] },
      down: { uv: [14, 6], uv_size: [8, -6] },
    });
    expect(cube?.mirror).toBeUndefined();
  });

  it('renames duplicate bones and follows the rename in animations', () => {
    const model = fixtureRaw();
    (model.groups as Obj[])[1] = { ...(model.groups as Obj[])[1], name: 'body' };
    const result = convertBbmodel(model);
    expect(codes(result.problems)).toContain('blockbench.duplicate-bone-name');
    expect(bones(result.geometry).map((b) => b.name)).toEqual(['body', 'body_2']);
    const walk = result.animations?.animations['animation.two_bones.walk'];
    expect(Object.keys(walk?.bones ?? {}).sort()).toEqual(['body', 'body_2']);
    expect(walk?.bones.body_2?.rotation).toBeDefined();
  });

  it('maps loop modes and reports skipped channels and bezier keyframes', () => {
    const model = fixtureRaw();
    const base = (model.animations as Obj[])[0] as Obj;
    const animators = base.animators as Obj;
    animators.effects = {
      name: 'Effects',
      type: 'effect',
      keyframes: [{ channel: 'sound', time: 0, data_points: [{ effect: 'x' }] }],
    };
    const head = animators['b0000000-0000-4000-8000-000000000002'] as Obj;
    ((head.keyframes as Obj[])[0] as Obj).interpolation = 'bezier';
    (model.animations as Obj[]).push(
      { name: 'animation.two_bones.hold', loop: 'hold', length: 2, animators: {} },
      { name: 'animation.two_bones.once', loop: 'once', length: 2, start_delay: '0.5', animators },
    );
    const result = convertBbmodel(model);
    expect(codes(result.problems)).toEqual([
      'blockbench.unsupported-channel',
      'blockbench.unsupported-interpolation',
      'blockbench.unsupported-channel',
      'blockbench.unsupported-interpolation',
      'blockbench.texture-not-embedded',
    ]);
    const all = result.animations?.animations ?? {};
    expect(all['animation.two_bones.hold']).toEqual({
      loop: 'hold_on_last_frame',
      animation_length: 2,
      bones: {},
    });
    expect(all['animation.two_bones.once']?.loop).toBeUndefined();
    expect(all['animation.two_bones.once']?.start_delay).toBe(0.5);
  });

  it('leaves animations out when the project has none', () => {
    const model = fixtureRaw();
    delete model.animations;
    expect(convertBbmodel(model).animations).toBeUndefined();
  });
});

describe('pass-through', () => {
  const geo = JSON.parse(readFileSync(join(EXPECTED, 'two_bones.geo.json'), 'utf8')) as Json;
  const animation = JSON.parse(
    readFileSync(join(EXPECTED, 'two_bones.animation.json'), 'utf8'),
  ) as Json;

  it('returns geometry and animation files unchanged', () => {
    expect(checkGeoJson(geo)).toEqual({ data: geo, problems: [] });
    expect(checkGeoJson(geo).data).toBe(geo);
    expect(checkAnimationJson(animation)).toEqual({ data: animation, problems: [] });
  });

  it('accepts newer geometry versions and warns on unknown ones', () => {
    expect(checkGeoJson({ ...(geo as Obj as never), format_version: '1.21.20' }).problems).toEqual(
      [],
    );
    const old = checkGeoJson({ ...(geo as Obj as never), format_version: '1.10.0' });
    expect(codes(old.problems)).toEqual(['blockbench.unknown-format-version']);
    expect(old.data).toBeDefined();
    const anim = checkAnimationJson({ ...(animation as Obj as never), format_version: '2.0.0' });
    expect(codes(anim.problems)).toEqual(['blockbench.unknown-format-version']);
  });

  it('refuses legacy and malformed files', () => {
    const legacy = checkGeoJson({ format_version: '1.8.0', 'geometry.x': { bones: [] } });
    expect(legacy.data).toBeUndefined();
    expect(codes(legacy.problems)).toEqual(['blockbench.invalid-geometry']);
    expect(codes(checkGeoJson([]).problems)).toEqual(['blockbench.invalid-geometry']);
    expect(codes(checkAnimationJson({ format_version: '1.8.0' }).problems)).toEqual([
      'blockbench.invalid-animation',
    ]);
    expect(codes(checkAnimationJson({ animations: {} }).problems)).toEqual([
      'blockbench.invalid-animation',
    ]);
  });

  it('warns on unexpected top-level keys', () => {
    const result = checkGeoJson({ ...(geo as Obj as never), debug: true });
    expect(codes(result.problems)).toEqual(['blockbench.unknown-key']);
  });
});

describe('blockbenchImporter', () => {
  const now = () => '2026-11-05T00:00:00.000Z';
  const importer = createBlockbenchImporter({ now });
  const bytesOf = (value: unknown) => strToU8(JSON.stringify(value));

  it('declares its id and extensions', () => {
    expect(blockbenchImporter.id).toBe('blockbench');
    expect(blockbenchImporter.extensions).toEqual(['bbmodel', 'json']);
    expect(blockbenchFileType('Ruby Golem.GEO.json')).toEqual({ type: 'geo', name: 'ruby_golem' });
    expect(blockbenchFileType('a.animations.json').type).toBe('animation');
    expect(blockbenchFileType('pack.json').type).toBe('other');
  });

  it('imports a .bbmodel as a geo model, an animation, a texture and the original file', async () => {
    const bytes = bytesOf(fixture());
    const result = await importer.import({ name: 'Two Bones.bbmodel', bytes }, 'my_mod');
    expect(result.problems).toEqual([]);
    expect(result.elements.map((e) => [e.id, e.kind, e.formatVersion])).toEqual([
      ['my_mod:entity/two_bones', 'msm:geo_model', 1],
      ['my_mod:entity/two_bones_animations', 'msm:animation', 1],
    ]);
    expect(result.elements[0]?.meta).toEqual({ createdAt: '2026-11-05T00:00:00.000Z' });
    expect(result.elements[0]?.data).toEqual(convertBbmodel(fixture()).geometry);
    expect(result.assets.map((a) => a.asset)).toEqual([
      { path: 'textures/entity/two_bones.png', mediaType: 'image/png' },
      { path: 'blockbench/two_bones.bbmodel', mediaType: 'application/octet-stream' },
    ]);
    expect(result.assets[0]?.bytes).toEqual(PNG);
    expect(result.assets[1]?.bytes).toBe(bytes);
  });

  it('numbers several textures and tags problems with the file and element', async () => {
    const model = fixture();
    (model.textures as Obj[]).push({ name: 'eyes' }, { name: 'glow', source: dataUrl(PNG) });
    delete model.animations;
    const result = importBlockbenchFile({ name: 'two_bones.bbmodel', bytes: bytesOf(model) }, 'ns', {
      now,
    });
    expect(result.elements.map((e) => e.id)).toEqual(['ns:entity/two_bones']);
    expect(result.assets.map((a) => a.asset.path)).toEqual([
      'textures/entity/two_bones_0.png',
      'textures/entity/two_bones_2.png',
      'blockbench/two_bones.bbmodel',
    ]);
    expect(result.problems).toMatchObject([
      {
        code: 'blockbench.texture-not-embedded',
        file: 'two_bones.bbmodel',
        elementId: 'ns:entity/two_bones',
      },
    ]);
  });

  it('imports nothing from a Java block model', async () => {
    const model = fixture();
    model.meta = { ...(model.meta as Obj), model_format: 'java_block' };
    const result = await importer.import({ name: 'b.bbmodel', bytes: bytesOf(model) }, 'ns');
    expect(result.elements).toEqual([]);
    expect(result.assets).toEqual([]);
    expect(codes(result.problems)).toEqual(['blockbench.java-block-not-supported']);
  });

  it('passes .geo.json and .animation.json through unchanged', async () => {
    const geo = JSON.parse(readFileSync(join(EXPECTED, 'two_bones.geo.json'), 'utf8')) as Json;
    const anim = JSON.parse(
      readFileSync(join(EXPECTED, 'two_bones.animation.json'), 'utf8'),
    ) as Json;
    const g = await importer.import({ name: 'golem.geo.json', bytes: bytesOf(geo) }, 'ns');
    expect(g.elements).toEqual([
      {
        formatVersion: 1,
        id: 'ns:entity/golem',
        kind: 'msm:geo_model',
        data: geo,
        meta: { createdAt: '2026-11-05T00:00:00.000Z' },
      },
    ]);
    expect(g.assets).toEqual([]);
    const a = await importer.import({ name: 'golem.animation.json', bytes: bytesOf(anim) }, 'ns');
    expect(a.elements.map((e) => [e.id, e.kind])).toEqual([
      ['ns:entity/golem_animations', 'msm:animation'],
    ]);
    expect(a.elements[0]?.data).toEqual(anim);
    const b = await importer.import(
      { name: 'golem_animations.animation.json', bytes: bytesOf(anim) },
      'ns',
    );
    expect(b.elements[0]?.id).toBe('ns:entity/golem_animations');
  });

  it('refuses other JSON, invalid JSON and malformed pass-through files', async () => {
    const other = await importer.import({ name: 'pack.json', bytes: bytesOf({}) }, 'ns');
    expect(other.elements).toEqual([]);
    expect(other.problems).toMatchObject([
      { severity: 'error', code: 'blockbench.not-a-model', file: 'pack.json' },
    ]);
    const broken = await importer.import({ name: 'x.bbmodel', bytes: strToU8('{nope') }, 'ns');
    expect(codes(broken.problems)).toEqual(['blockbench.invalid-json']);
    const badGeo = await importer.import({ name: 'x.geo.json', bytes: bytesOf({ a: 1 }) }, 'ns');
    expect(badGeo.elements).toEqual([]);
    expect(codes(badGeo.problems)).toEqual(['blockbench.invalid-geometry']);
  });
});
