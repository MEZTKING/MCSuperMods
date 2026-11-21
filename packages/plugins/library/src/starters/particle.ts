/**
 * The Particle Creator flow (ADR 0081 D3, group `magic`): a particle type of the project's own
 * (`msm:particle`, ADR 0080) drawn from four placeholder frames in the colour picked (a spark,
 * an orb, a puff or a leaf) or from a picture of one's own, with its size, lifetime, movement,
 * glow and fade, shown around a new block (`msm:ambient_particles`, the default), sent by an
 * item when used (`spawn_particle`) or made alone for `/particle` and actions.
 *
 * Ids derive from `particle_name` (see `content/particle.ts`: the particle `golden_spark`, its
 * frames `particle/golden_spark_0` to `_3`, the block `golden_spark_block`, the item
 * `golden_spark_wand`). The flow writes no function and names the particle nowhere a vanilla
 * data pack could, so its vanilla data pack only leaves out the block's loot table (ADR 0066).
 * Particles need the Fabric mod jar export.
 */
import type { BundleContext, ContentBundle, StarterParameter } from '@msm/plugin-api';
import { modElement, PACK_NOTES, packElement } from '../content/bundle';
import {
  booleanValue,
  hexFromRgb,
  imageValue,
  NAME_MAX_LENGTH,
  NAME_PATTERN,
  nameForms,
  readValues,
  rgbFromHex,
  stringValue,
} from '../content/parameters';
import {
  DEFAULT_PARTICLE_ANSWERS,
  DEFAULT_PARTICLE_COLOUR,
  PARTICLE_LIFETIMES,
  PARTICLE_LOOKS,
  PARTICLE_MOVEMENTS,
  PARTICLE_SHOW,
  PARTICLE_SIZES,
  particleContent,
} from '../content/particle';

/** The largest picture side the flow accepts, in pixels. */
const PICTURE_MAX_SIZE = 64;

/** The largest picture file the flow accepts, in bytes (256 KB). */
const PICTURE_MAX_BYTES = 262_144;

/** The Particle flow's questions, groups "Particle", "Look", "Life and movement" and "Show it". */
export const PARTICLE_PARAMETERS: readonly StarterParameter[] = Object.freeze([
  {
    id: 'particle_name',
    label: 'Particle name',
    description: 'The English name. Ids derive from it: Golden Spark gives golden_spark.',
    group: 'Particle',
    type: 'string',
    default: 'Golden Spark',
    pattern: NAME_PATTERN,
    maxLength: NAME_MAX_LENGTH,
  },
  {
    id: 'look',
    label: 'Look',
    description:
      'Spark, Orb, Puff and Leaf are drawn in four frames in the colour below; you can redraw them later.',
    group: 'Look',
    type: 'choice',
    default: DEFAULT_PARTICLE_ANSWERS.look,
    choices: PARTICLE_LOOKS.map(({ value, label }) => ({ value, label })),
  },
  {
    id: 'picture',
    label: 'My own picture',
    description: `For My own picture: one PNG, 8 by 8 as vanilla's particles (up to ${PICTURE_MAX_SIZE} by ${PICTURE_MAX_SIZE}), drawn as it is. Leave it empty for a drawn spark.`,
    group: 'Look',
    type: 'image',
    default: null,
    maxBytes: PICTURE_MAX_BYTES,
    maxSize: PICTURE_MAX_SIZE,
  },
  {
    id: 'colour',
    label: 'Colour',
    description: 'The colour the frames are drawn in. Your own picture keeps its colours.',
    group: 'Look',
    type: 'colour',
    default: hexFromRgb(DEFAULT_PARTICLE_COLOUR),
  },
  {
    id: 'size',
    label: 'Size',
    group: 'Look',
    type: 'choice',
    default: DEFAULT_PARTICLE_ANSWERS.size,
    choices: PARTICLE_SIZES.map(({ value, label }) => ({ value, label })),
  },
  {
    id: 'glows',
    label: 'Glows',
    description:
      'Drawn at full brightness, so it shines in the dark as glow and end rod particles do.',
    group: 'Look',
    type: 'boolean',
    default: DEFAULT_PARTICLE_ANSWERS.glows,
  },
  {
    id: 'how_long',
    label: 'How long',
    description: 'How long each particle lives before it disappears.',
    group: 'Life and movement',
    type: 'choice',
    default: DEFAULT_PARTICLE_ANSWERS.lifetime,
    choices: PARTICLE_LIFETIMES.map(({ value, label }) => ({ value, label })),
  },
  {
    id: 'movement',
    label: 'Movement',
    group: 'Life and movement',
    type: 'choice',
    default: DEFAULT_PARTICLE_ANSWERS.movement,
    choices: PARTICLE_MOVEMENTS.map(({ value, label }) => ({ value, label })),
  },
  {
    id: 'fades',
    label: 'Fades out',
    description: 'Becomes see-through towards the end of its life.',
    group: 'Life and movement',
    type: 'boolean',
    default: DEFAULT_PARTICLE_ANSWERS.fades,
  },
  {
    id: 'show',
    label: 'Show it',
    description:
      'A new block shows it by itself; a new item sends a burst of it when used. Either way you can also use it in any action.',
    group: 'Show it',
    type: 'choice',
    default: DEFAULT_PARTICLE_ANSWERS.show,
    choices: PARTICLE_SHOW.map((entry) => ({ ...entry })),
  },
]);

export function particleBundle(context: BundleContext): ContentBundle {
  const { namespace, projectName } = context;
  const values = readValues(PARTICLE_PARAMETERS, context);
  const name = nameForms(stringValue(values, 'particle_name'));
  const content = particleContent(namespace, name, {
    look: stringValue(values, 'look'),
    picture: imageValue(values, 'picture'),
    colour: rgbFromHex(stringValue(values, 'colour'), DEFAULT_PARTICLE_COLOUR),
    size: stringValue(values, 'size'),
    lifetime: stringValue(values, 'how_long'),
    movement: stringValue(values, 'movement'),
    glows: booleanValue(values, 'glows'),
    fades: booleanValue(values, 'fades'),
    show: stringValue(values, 'show'),
  });
  return {
    elements: [
      packElement(namespace, `${projectName}: ${name.lower}`, PACK_NOTES),
      modElement(namespace, projectName, `Adds ${name.lower}, a particle of its own.`),
      ...content.elements,
    ],
    assets: content.assets,
  };
}
