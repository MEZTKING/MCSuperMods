import type { Json } from '@msm/plugin-api';
import { describe, expect, it } from 'vitest';
import {
  createRegistryIndex,
  createSchemaIndex,
  parseVanillaMcdocSymbols,
  type SchemaProblem,
  validateJson,
} from '../src/index';
import { loadFixtureJson } from './fixture';

const index = createSchemaIndex(parseVanillaMcdocSymbols(loadFixtureJson()), {
  mcVersion: '1.21.5',
});
const model = index.resolveSchemaRef('::java::assets::model::Model');
const codes = (problems: SchemaProblem[]): [string, string][] =>
  problems.map((problem) => [problem.path, problem.code]);

const cube: Json = {
  parent: 'minecraft:block/block',
  textures: { particle: '#all', all: 'minecraft:block/stone' },
  elements: [
    {
      from: [0, 0, 0],
      to: [16, 16, 16],
      faces: {
        down: { texture: '#all', cullface: 'down' },
        up: { texture: '#all', cullface: 'up', uv: [0, 0, 16, 16], rotation: 90 },
        north: { texture: '#all', cullface: 'north' },
        south: { texture: '#all', cullface: 'south' },
        west: { texture: '#all', cullface: 'west' },
        east: { texture: '#all', cullface: 'east', tintindex: 0 },
      },
    },
  ],
  display: {
    gui: { rotation: [30, 225, 0], translation: [0, 0, 0], scale: [0.625, 0.625, 0.625] },
  },
};

const withElement = (patch: Record<string, Json>): Json => {
  const copy = structuredClone(cube) as { elements: Record<string, Json>[] };
  copy.elements[0] = { ...copy.elements[0], ...patch };
  return copy as unknown as Json;
};

describe('validateJson over the fixture Model', () => {
  it('accepts a valid cube model', () => {
    expect(validateJson(cube, model)).toEqual([]);
  });

  it('rejects a two-number `from`', () => {
    expect(codes(validateJson(withElement({ from: [0, 0] }), model))).toEqual([
      ['/elements/0/from', 'schema.invalid-length'],
    ]);
  });

  it('rejects out-of-range coordinates and a bad face rotation', () => {
    const value = withElement({ to: [16, 16, 40] });
    expect(codes(validateJson(value, model))).toEqual([
      ['/elements/0/to/2', 'schema.out-of-range'],
    ]);
    const faces = withElement({ faces: { up: { texture: '#all', rotation: 45 } } });
    expect(codes(validateJson(faces, model))).toEqual([
      ['/elements/0/faces/up/rotation', 'schema.no-union-match'],
    ]);
  });

  it('rejects unknown keys', () => {
    expect(codes(validateJson({ ...(cube as object), ambient_occlusion: true }, model))).toEqual([
      ['/ambient_occlusion', 'schema.unknown-field'],
    ]);
  });

  it('checks typed map keys and values', () => {
    const badFace = withElement({ faces: { upward: { texture: '#all' } } });
    const problems = validateJson(badFace, model);
    expect(problems.map((problem) => problem.path)).toEqual(['/elements/0/faces/upward']);
    expect(problems[0]?.message).toMatch(/^Invalid key "upward"/);
    expect(codes(validateJson({ textures: { all: 3 } }, model))).toEqual([
      ['/textures/all', 'schema.no-union-match'],
    ]);
  });

  it('drops fields outside the game version', () => {
    expect(codes(validateJson({ overrides: [] }, model))).toEqual([
      ['/overrides', 'schema.unknown-field'],
    ]);
  });
});

describe('validateJson over the fixture recipe dispatcher', () => {
  const recipe = index.resolveSchemaRef('resource:recipe');
  const smelting: Json = {
    type: 'minecraft:smelting',
    ingredient: 'minecraft:iron_ore',
    result: { id: 'minecraft:iron_ingot' },
    experience: 0.7,
    cookingtime: 200,
  };

  it('dispatches by `type`', () => {
    expect(validateJson(smelting, recipe).filter((p) => p.severity === 'error')).toEqual([]);
    const bad = validateJson({ ...(smelting as object), cookingtime: 'slow' }, recipe);
    expect(codes(bad)).toContainEqual(['/cookingtime', 'schema.type-mismatch']);
  });

  it('accepts the dispatch key with or without the minecraft: prefix', () => {
    const errors = (value: Json): SchemaProblem[] =>
      validateJson(value, recipe).filter((p) => p.severity === 'error');
    expect(errors(smelting)).toEqual([]);
    expect(errors({ ...(smelting as object), type: 'smelting' })).toEqual([]);
  });

  it('keeps rejecting a minecraft: prefix on a non-dispatch enum', () => {
    const face = withElement({ faces: { up: { texture: '#all', cullface: 'minecraft:up' } } });
    expect(codes(validateJson(face, model))).toEqual([
      ['/elements/0/faces/up/cullface', 'schema.invalid-enum'],
    ]);
  });

  it('warns about unknown registry ids', () => {
    const registries = createRegistryIndex({ vanilla: { recipe_serializer: ['smelting'] } });
    expect(
      codes(
        validateJson({ ...(smelting as object), type: 'minecraft:melting' }, recipe, {
          registries,
        }),
      ),
    ).toContainEqual(['/type', 'schema.unknown-id']);
  });
});
