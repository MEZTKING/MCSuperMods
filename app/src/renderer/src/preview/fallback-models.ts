/**
 * MSM-authored fallback parent models for the preview (ADR 0010).
 *
 * These models are written from scratch by MSM. They are not extracted from, derived from or
 * copied out of any Mojang file. They exist only so that the preview can show models built on
 * the common parents before the user has pointed MSM at a Minecraft installation. They are used
 * for preview only and are never written to an export.
 *
 * The geometry is deliberately simple: a full unit cube with one texture variable per face, a
 * pair of crossed planes, and the generated item layers that deepslate builds itself from
 * `builtin/generated`. The texture variable names (`all`, `side`, `end`, `top`, `bottom`,
 * `cross`, `layer0`) follow the model format so that ordinary project models resolve against
 * them unchanged.
 */

import type { JsonObject } from '@msm/plugin-api';

/** The namespace of the fallback parents. */
export const FALLBACK_NAMESPACE = 'msm';

const FACES = ['down', 'up', 'north', 'south', 'west', 'east'] as const;

/** A full 16x16x16 cube whose six faces each read their own texture variable. */
function unitCube(): JsonObject {
  const faces: JsonObject = {};
  for (const face of FACES) faces[face] = { cullface: face, texture: `#${face}` };
  return { faces, from: [0, 0, 0], to: [16, 16, 16] };
}

/** A view of the block turned to show three faces, used when a model is shown as an item. */
const BLOCK_DISPLAY: JsonObject = {
  gui: { rotation: [30, 45, 0], scale: [0.6, 0.6, 0.6], translation: [0, 0, 0] },
};

/** Two vertical planes crossing through the block centre, both reading `#cross`. */
function crossedPlanes(): JsonObject[] {
  const rotation = { angle: 45, axis: 'y', origin: [8, 8, 8], rescale: true };
  return [
    {
      faces: { north: { texture: '#cross' }, south: { texture: '#cross' } },
      from: [0.75, 0, 8],
      rotation,
      to: [15.25, 16, 8],
    },
    {
      faces: { east: { texture: '#cross' }, west: { texture: '#cross' } },
      from: [8, 0, 0.75],
      rotation,
      to: [8, 16, 15.25],
    },
  ];
}

/**
 * The seven fallback parents, keyed by their `msm:` path. Each value is model JSON in the
 * vanilla model format.
 */
export const FALLBACK_MODELS: Readonly<Record<string, JsonObject>> = Object.freeze({
  'block/cube': {
    display: BLOCK_DISPLAY,
    elements: [unitCube()],
  },
  'block/cube_all': {
    parent: 'msm:block/cube',
    textures: {
      down: '#all',
      east: '#all',
      north: '#all',
      particle: '#all',
      south: '#all',
      up: '#all',
      west: '#all',
    },
  },
  'block/cube_column': {
    parent: 'msm:block/cube',
    textures: {
      down: '#end',
      east: '#side',
      north: '#side',
      particle: '#side',
      south: '#side',
      up: '#end',
      west: '#side',
    },
  },
  'block/cube_bottom_top': {
    parent: 'msm:block/cube',
    textures: {
      down: '#bottom',
      east: '#side',
      north: '#side',
      particle: '#side',
      south: '#side',
      up: '#top',
      west: '#side',
    },
  },
  'block/cross': {
    display: BLOCK_DISPLAY,
    elements: crossedPlanes(),
    textures: { particle: '#cross' },
  },
  'item/generated': {
    parent: 'builtin/generated',
  },
  'item/handheld': {
    display: {
      thirdperson_righthand: {
        rotation: [0, -90, 50],
        scale: [0.8, 0.8, 0.8],
        translation: [0, 4, 0.5],
      },
    },
    parent: 'msm:item/generated',
  },
});
