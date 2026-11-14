/**
 * The preset mob models (ADR 0073 D1, B289): every geometry and animation set validates against
 * the `msm:geo_model` and `msm:animation` schemas of every target, every animated bone exists,
 * the sets stay inside what the vanilla renderer plays (plain numbers, linear keyframes), the
 * B285 reader rules hold (whole-number box UV, no cube rotation, no bone named `root`) and the
 * skins are pinned by golden PNGs under `test/fixtures/mob-presets/`
 * (`UPDATE_GOLDENS=1` rewrites them).
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateSync } from 'node:zlib';
import type { Json, JsonObject } from '@msm/plugin-api';
import {
  createRegistryIndex,
  createSchemaIndex,
  MSM_SCHEMA_REFS,
  parseVanillaMcdocSymbols,
  validateJson,
} from '@msm/schemas';
import { builtInTargets, readVendoredJson } from '@msm/targets';
import { describe, expect, it } from 'vitest';
import { SADDLE_COLOUR } from '../src/assets/png';
import {
  MOB_PRESET_NAMES,
  MOB_PRESETS,
  type MobPresetName,
  presetAnimationFields,
  presetSkinBoxes,
  presetSkinPng,
} from '../src/content/mob-presets';

const update = process.env.UPDATE_GOLDENS === '1';
const fixtures = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'mob-presets');

const geometryOf = (name: MobPresetName): JsonObject => {
  const model = MOB_PRESETS[name].geometry(name);
  return (model['minecraft:geometry'] as JsonObject[])[0] as JsonObject;
};

const animationsOf = (name: MobPresetName): Record<string, JsonObject> =>
  MOB_PRESETS[name].animations().animations as Record<string, JsonObject>;

/** Decodes the RGBA pixels of a PNG written by the library's encoder (filter 0, stored). */
function decode(png: Uint8Array): { width: number; height: number; rgba: Uint8Array } {
  const buffer = Buffer.from(png);
  let offset = 8;
  let width = 0;
  let height = 0;
  const data: Buffer[] = [];
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('latin1', offset + 4, offset + 8);
    const body = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      width = body.readUInt32BE(0);
      height = body.readUInt32BE(4);
    } else if (type === 'IDAT') {
      data.push(body);
    }
    offset += 12 + length;
  }
  const raw = inflateSync(Buffer.concat(data));
  const rgba = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    rgba.set(raw.subarray(y * (1 + width * 4) + 1, (y + 1) * (1 + width * 4)), y * width * 4);
  }
  return { width, height, rgba };
}

describe('preset mob models', () => {
  it('lists six presets, the four new shapes first', () => {
    expect([...MOB_PRESET_NAMES]).toEqual([
      'quadruped',
      'bird',
      'fish',
      'flyer',
      'biped',
      'cube_creature',
    ]);
    expect(Object.keys(MOB_PRESETS).sort()).toEqual([...MOB_PRESET_NAMES].sort());
  });

  it('pins the bone names, saddle bones and state animations', () => {
    const summary = Object.fromEntries(
      MOB_PRESET_NAMES.map((name) => [
        name,
        {
          bones: [...MOB_PRESETS[name].bones],
          saddle: MOB_PRESETS[name].saddleBone ?? null,
          states: [...MOB_PRESETS[name].states],
        },
      ]),
    );
    expect(summary).toEqual({
      quadruped: {
        bones: [
          'body',
          'head',
          'tail',
          'leg_front_right',
          'leg_front_left',
          'leg_back_right',
          'leg_back_left',
          'saddle',
        ],
        saddle: 'saddle',
        states: ['sit', 'swim', 'attack', 'shoot'],
      },
      bird: {
        bones: ['body', 'head', 'wing_right', 'wing_left', 'tail', 'leg_right', 'leg_left'],
        saddle: null,
        states: ['sit', 'fly', 'attack'],
      },
      fish: {
        bones: ['body', 'tail', 'fin_top', 'fin_right', 'fin_left'],
        saddle: null,
        states: ['swim'],
      },
      flyer: {
        bones: [
          'body',
          'wing_front_right',
          'wing_front_left',
          'wing_back_right',
          'wing_back_left',
          'saddle',
        ],
        saddle: 'saddle',
        states: ['fly', 'attack', 'shoot'],
      },
      biped: {
        bones: ['body', 'head', 'right_arm', 'left_arm', 'right_leg', 'left_leg'],
        saddle: null,
        states: ['sit', 'attack', 'shoot'],
      },
      cube_creature: {
        bones: ['body', 'head'],
        saddle: null,
        states: ['sit', 'attack'],
      },
    });
  });

  it.each(MOB_PRESET_NAMES)('names its geometry after the id and its texture size (%s)', (name) => {
    const description = geometryOf(name).description as JsonObject;
    expect(description.identifier).toBe(`geometry.${name}`);
    expect(MOB_PRESETS[name].geometry('demo_mob')).toMatchObject({ format_version: '1.12.0' });
    expect([description.texture_width, description.texture_height]).toEqual([
      MOB_PRESETS[name].texture.width,
      MOB_PRESETS[name].texture.height,
    ]);
    expect(MOB_PRESETS[name].texture.width).toBe(64);
    expect([32, 64]).toContain(MOB_PRESETS[name].texture.height);
  });

  it.each(MOB_PRESET_NAMES)(
    'keeps the reader rules: unique bones, known parents, no root (%s)',
    (name) => {
      const bones = geometryOf(name).bones as JsonObject[];
      const names = bones.map((bone) => bone.name as string);
      expect(new Set(names).size).toBe(names.length);
      expect(names).not.toContain('root');
      for (const bone of bones) {
        if (bone.parent !== undefined) expect(names).toContain(bone.parent);
        expect(bone.name as string).toMatch(/^[a-z_]+$/);
      }
    },
  );

  it.each(MOB_PRESET_NAMES)(
    'uses whole-number box UV inside the texture, no cube rotation and no overlaps (%s)',
    (name) => {
      const { width, height } = MOB_PRESETS[name].texture;
      const rects: [number, number, number, number][] = [];
      for (const bone of geometryOf(name).bones as JsonObject[]) {
        for (const cube of bone.cubes as JsonObject[]) {
          expect(cube.rotation).toBeUndefined();
          const uv = cube.uv as number[];
          const size = cube.size as number[];
          expect(Array.isArray(uv)).toBe(true);
          for (const value of [...uv, ...size]) expect(Number.isInteger(value)).toBe(true);
          const [u, v] = uv as [number, number];
          const [w, h, d] = size as [number, number, number];
          expect(u + 2 * (w + d)).toBeLessThanOrEqual(width);
          expect(v + d + h).toBeLessThanOrEqual(height);
          rects.push([u, v, 2 * (w + d), d + h]);
        }
      }
      for (const [i, a] of rects.entries()) {
        for (const b of rects.slice(i + 1)) {
          const overlap =
            a[0] < b[0] + b[2] && b[0] < a[0] + a[2] && a[1] < b[1] + b[3] && b[1] < a[1] + a[3];
          expect(overlap, `${JSON.stringify(a)} and ${JSON.stringify(b)}`).toBe(false);
        }
      }
    },
  );

  it.each(MOB_PRESET_NAMES)('has idle, walk and its state animations (%s)', (name) => {
    const animations = animationsOf(name);
    const expected = ['idle', 'walk', ...MOB_PRESETS[name].states];
    expect(Object.keys(animations).sort()).toEqual([...expected].sort());
    expect(presetAnimationFields(name)).toEqual(
      Object.fromEntries(expected.map((state) => [state, state])),
    );
    for (const state of ['idle', 'walk', 'sit', 'fly', 'swim']) {
      if (animations[state] !== undefined) expect(animations[state]?.loop, state).toBe(true);
    }
    for (const state of ['attack', 'shoot']) {
      if (animations[state] !== undefined) expect(animations[state]?.loop, state).toBe(false);
    }
  });

  it.each(MOB_PRESET_NAMES)(
    'animates only bones of its model with plain numbers and linear keyframes (%s)',
    (name) => {
      const bones = new Set(MOB_PRESETS[name].bones);
      for (const [animationName, animation] of Object.entries(animationsOf(name))) {
        const length = animation.animation_length as number;
        expect(typeof length).toBe('number');
        for (const key of ['sound_effects', 'particle_effects', 'timeline']) {
          expect(animation[key]).toBeUndefined();
        }
        for (const [boneName, channels] of Object.entries(animation.bones as JsonObject)) {
          expect(bones.has(boneName), `${animationName}: ${boneName}`).toBe(true);
          for (const [channelName, channel] of Object.entries(channels as JsonObject)) {
            expect(['rotation', 'position', 'scale']).toContain(channelName);
            for (const [time, value] of Object.entries(channel as JsonObject)) {
              expect(time).toMatch(/^\d+\.\d+$/);
              expect(Number(time)).toBeLessThanOrEqual(length);
              // A plain `[x, y, z]` is a linear keyframe with no Molang and no easing.
              expect(Array.isArray(value), `${animationName}/${boneName}/${time}`).toBe(true);
              expect((value as Json[]).every((n) => typeof n === 'number')).toBe(true);
              expect(value).toHaveLength(3);
            }
          }
        }
      }
    },
  );

  it('puts a saddle bone on the quadruped and the flyer only', () => {
    for (const name of MOB_PRESET_NAMES) {
      const saddle = MOB_PRESETS[name].saddleBone;
      expect(saddle !== undefined, name).toBe(name === 'quadruped' || name === 'flyer');
      if (saddle !== undefined) expect(MOB_PRESETS[name].bones).toContain(saddle);
    }
  });
});

describe.each(builtInTargets.map((bundle) => [bundle.target.id, bundle] as const))(
  'preset mob models on %s',
  (_id, bundle) => {
    const indexes = (async () => {
      const read = async (url: URL): Promise<Uint8Array> => readFile(url);
      const symbols = parseVanillaMcdocSymbols(
        await readVendoredJson(bundle, 'vanillaMcdocSymbols', read),
      );
      const vanilla = (await readVendoredJson(bundle, 'mcmetaRegistries', read)) as Record<
        string,
        string[]
      >;
      return {
        schemaIndex: createSchemaIndex(symbols, { mcVersion: bundle.target.mcVersion }),
        registries: createRegistryIndex({ vanilla, project: {} }),
      };
    })();

    const problems = async (schemaRef: string, value: Json) => {
      const { schemaIndex, registries } = await indexes;
      return validateJson(value, schemaIndex.resolveSchemaRef(schemaRef), { registries }).filter(
        (problem) => problem.severity === 'error' || problem.code === 'schema.unknown-id',
      );
    };

    it.each(MOB_PRESET_NAMES)('validates the geometry against msm:geo_model (%s)', async (name) => {
      expect(await problems(MSM_SCHEMA_REFS.geoModel, MOB_PRESETS[name].geometry(name))).toEqual(
        [],
      );
    });

    it.each(MOB_PRESET_NAMES)(
      'validates the animation set against msm:animation (%s)',
      async (name) => {
        expect(await problems(MSM_SCHEMA_REFS.animation, MOB_PRESETS[name].animations())).toEqual(
          [],
        );
      },
    );
  },
);

describe('preset skins', () => {
  it.each(MOB_PRESET_NAMES)('equals the golden PNG of %s', (name) => {
    const png = presetSkinPng(name);
    const file = join(fixtures, `${name}.png`);
    if (update) {
      mkdirSync(fixtures, { recursive: true });
      writeFileSync(file, png);
    }
    expect(Buffer.from(readFileSync(file)).equals(Buffer.from(png))).toBe(true);
  });

  it.each(MOB_PRESET_NAMES)(
    'draws %s at the texture size, opaque on every face and clear elsewhere',
    (name) => {
      const { width, height, rgba } = decode(presetSkinPng(name));
      expect({ width, height }).toEqual(MOB_PRESETS[name].texture);
      const alpha = (x: number, y: number) => rgba[(y * width + x) * 4 + 3];
      for (const box of presetSkinBoxes(name)) {
        // The front face's centre is drawn; the unused corner above the east face is not
        // (unless another box covers it, which the overlap test rules out).
        expect(
          alpha(box.u + box.d + Math.floor(box.w / 2), box.v + box.d + Math.floor(box.h / 2)),
        ).toBe(255);
        if (box.d > 0) expect(alpha(box.u, box.v)).toBe(0);
      }
      expect(presetSkinPng(name)).toEqual(presetSkinPng(name));
    },
  );

  it('tints by colour but keeps the saddle leather brown', () => {
    const red = decode(presetSkinPng('quadruped'));
    const blue = decode(presetSkinPng('quadruped', { colour: [36, 84, 196] }));
    const saddle = presetSkinBoxes('quadruped').find((box) => box.role === 'saddle');
    expect(saddle).toBeDefined();
    const at = (image: { rgba: Uint8Array; width: number }, x: number, y: number) => [
      ...image.rgba.subarray((y * image.width + x) * 4, (y * image.width + x) * 4 + 4),
    ];
    const { u, v, w, h, d } = saddle as { u: number; v: number; w: number; h: number; d: number };
    const face: string[] = [];
    for (let y = v; y < v + d + h; y += 1) {
      for (let x = u; x < u + 2 * (w + d); x += 1) {
        expect(at(red, x, y)).toEqual(at(blue, x, y));
        face.push(at(red, x, y).join(','));
      }
    }
    expect(face).toContain([...SADDLE_COLOUR, 255].join(','));
    expect(at(red, 20, 16)).not.toEqual(at(blue, 20, 16));
  });

  it('draws eyes on the face', () => {
    const image = decode(presetSkinPng('quadruped'));
    const head = presetSkinBoxes('quadruped').find((box) => box.role === 'face');
    expect(head).toMatchObject({ u: 0, v: 21, w: 6, h: 6, d: 6 });
    const pixel = (x: number, y: number) => [
      ...image.rgba.subarray((y * image.width + x) * 4, (y * image.width + x) * 4 + 4),
    ];
    // Front face from (6, 27); eyes on row 29, columns 7 and 10.
    expect(pixel(7, 29)).toEqual([24, 22, 28, 255]);
    expect(pixel(10, 29)).toEqual([24, 22, 28, 255]);
    const fish = presetSkinBoxes('fish').find((box) => box.role === 'side_face');
    expect(fish).toMatchObject({ u: 0, v: 0, w: 3, h: 6, d: 10 });
  });
});
