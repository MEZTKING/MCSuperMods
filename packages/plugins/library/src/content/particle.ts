/**
 * The shared builder of a particle (ADR 0081 D3, D5): the `msm:particle` element (ADR 0080 D1),
 * its frame pictures and, when asked, a block that shows it by itself (`msm:ambient_particles`)
 * or an item whose use sends a burst of it (`spawn_particle`). The Particle flow, the
 * `msm:particle` per-kind example and the "Firefly jar" example all build their particle here.
 *
 * Ids derive from the particle's name: the particle `<id>`, its frames `textures/particle/
 * <id>_0.png` to `_3.png` (sprites `<ns>:<id>_0` to `_3`; a picked picture is the one frame
 * `textures/particle/<id>.png`, sprite `<ns>:<id>`), the block `<id>_block` (model and texture
 * `block/<id>_block`) and the item `<id>_wand`. Names come from `display_name`, which lowering
 * writes as the language keys, so no language file is needed.
 *
 * A project particle is a registry entry of the Fabric mod jar (limit K1): the particle, the
 * block and the item exist only there. Nothing here names the particle in a biome, dimension
 * type, timeline, enchantment or function, so a vanilla data pack only leaves out the block's
 * loot table (ADR 0066 D3).
 *
 * @packageDocumentation
 */
import type {
  ContentBundle,
  ContentBundleAsset,
  ContentBundleElement,
  JsonObject,
  ResourceLocation,
} from '@msm/plugin-api';
import { PARTICLE_FRAMES, type PlaceholderPattern, placeholderPng, type Rgb } from '../assets/png';
import { COLOURS, element, KINDS, rl, texture } from './bundle';
import { decodePngDataUrl, type NameForms } from './parameters';

/**
 * The particle kinds (ADR 0080): the blocks and items plugin's `msm:particle` and the resource
 * pack plugin's particle description `minecraft:particle`. Named here by id, as {@link KINDS}
 * names the others.
 */
export const PARTICLE_KINDS = Object.freeze({
  particle: 'msm:particle',
  description: 'minecraft:particle',
} as const);

/** The default particle colour, a warm gold (ADR 0081 D3: `#ffd060`). */
export const DEFAULT_PARTICLE_COLOUR: Rgb = Object.freeze([255, 208, 96]) as Rgb;

/** One look of a particle: a placeholder pattern drawn in frames, or a picture of one's own. */
interface ParticleLook {
  value: string;
  label: string;
  /** The pattern of the frames; absent for `own`. */
  pattern?: PlaceholderPattern;
  /** The definition fields the look adds: how the frame is picked, a spin, a growing size. */
  fields: JsonObject;
  /** The look in words for notes. */
  words: string;
}

/** The looks of the flow (ADR 0081 D3), each drawn in {@link PARTICLE_FRAMES} frames. */
export const PARTICLE_LOOKS: readonly ParticleLook[] = Object.freeze([
  {
    value: 'spark',
    label: 'Spark',
    pattern: 'particle_spark',
    fields: { animation: 'loop' },
    words: 'a four-pointed spark that twinkles (animation loop, a frame every 2 ticks)',
  },
  {
    value: 'orb',
    label: 'Orb',
    pattern: 'particle_orb',
    fields: { animation: 'loop', frame_ticks: 4 },
    words: 'a round glow that pulses (animation loop, a frame every 4 ticks)',
  },
  {
    value: 'puff',
    label: 'Puff',
    pattern: 'particle_puff',
    fields: {},
    words: 'a cloud puff that thins out over its life and grows to twice its size (size_end)',
  },
  {
    value: 'leaf',
    label: 'Leaf',
    pattern: 'particle_leaf',
    fields: { animation: 'random', spin: 6 },
    words: 'a leaf that picks one of its frames at random and spins 6 degrees a tick',
  },
  {
    value: 'own',
    label: 'My own picture (below)',
    fields: {},
    words: 'your own picture',
  },
]);

/** The size choices: half the width of the square in blocks (vanilla's particles are 0.2). */
export const PARTICLE_SIZES: readonly { value: string; label: string; size: number }[] =
  Object.freeze([
    { value: 'small', label: 'Small', size: 0.1 },
    { value: 'medium', label: 'Medium', size: 0.2 },
    { value: 'large', label: 'Large', size: 0.4 },
  ]);

/** The lifetime choices, in ticks (20 ticks are one second). */
export const PARTICLE_LIFETIMES: readonly { value: string; label: string; ticks: number }[] =
  Object.freeze([
    { value: 'short', label: 'Short (half a second)', ticks: 10 },
    { value: 'medium', label: 'Medium (one second)', ticks: 20 },
    { value: 'long', label: 'Long (two seconds)', ticks: 40 },
  ]);

/** The movement choices: the gravity factor and the drag of the definition. */
export const PARTICLE_MOVEMENTS: readonly {
  value: string;
  label: string;
  fields: JsonObject;
  words: string;
}[] = Object.freeze([
  {
    value: 'floats',
    label: 'Floats up',
    fields: { gravity: -0.1 },
    words: 'floats up (gravity -0.1)',
  },
  {
    value: 'drifts',
    label: 'Drifts',
    fields: { friction: 0.9 },
    words: 'drifts and slows down (no gravity, friction 0.9)',
  },
  { value: 'falls', label: 'Falls', fields: { gravity: 0.1 }, words: 'falls (gravity 0.1)' },
]);

/** Where the flow shows the particle. */
export const PARTICLE_SHOW: readonly { value: string; label: string }[] = Object.freeze([
  { value: 'block', label: 'Around a new block' },
  { value: 'item', label: 'When an item is used' },
  { value: 'none', label: 'Only the particle (use it with /particle)' },
]);

/** The answers that shape a particle, besides its name. */
export interface ParticleAnswers {
  /** A {@link PARTICLE_LOOKS} value. */
  look: string;
  /** For the `own` look: an image parameter's value (a PNG `data:` URL) or `null`. */
  picture: string | null;
  /** The colour the frames are drawn in (a picture of one's own keeps its colours). */
  colour: Rgb;
  /** A {@link PARTICLE_SIZES} value. */
  size: string;
  /** A {@link PARTICLE_LIFETIMES} value. */
  lifetime: string;
  /** A {@link PARTICLE_MOVEMENTS} value. */
  movement: string;
  /** Drawn at full brightness (`emissive`). */
  glows: boolean;
  /** Fades out over its life (`fade: out`). */
  fades: boolean;
  /** A {@link PARTICLE_SHOW} value. */
  show: string;
}

/** The Particle flow's default answers (ADR 0081 D3). */
export const DEFAULT_PARTICLE_ANSWERS: Readonly<ParticleAnswers> = Object.freeze({
  look: 'spark',
  picture: null,
  colour: DEFAULT_PARTICLE_COLOUR,
  size: 'medium',
  lifetime: 'medium',
  movement: 'floats',
  glows: true,
  fades: true,
  show: 'block',
});

/** The choice of `choices` whose value is `value`, else the first one. */
function choiceOf<T extends { value: string }>(choices: readonly T[], value: string): T {
  const found = choices.find((choice) => choice.value === value) ?? choices[0];
  if (found === undefined) throw new Error('No choices.');
  return found;
}

/** The sprite ids and pictures of a particle's frames. */
export function particleFrames(
  namespace: string,
  id: string,
  answers: Pick<ParticleAnswers, 'look' | 'picture' | 'colour'>,
): { sprites: ResourceLocation[]; assets: ContentBundleAsset[]; own: boolean } {
  const look = choiceOf(PARTICLE_LOOKS, answers.look);
  if (look.pattern === undefined) {
    const decoded = answers.picture === null ? null : decodePngDataUrl(answers.picture);
    // Without a picture, the first frame of the spark in the colour stands in for it.
    const bytes =
      decoded?.bytes ?? placeholderFrame('particle_spark', 0, answers.colour, namespace, id).bytes;
    return {
      sprites: [rl(namespace, id)],
      assets: [{ namespace, path: `textures/particle/${id}.png`, bytes }],
      own: decoded !== null,
    };
  }
  const pattern = look.pattern;
  const frames = [...Array(PARTICLE_FRAMES).keys()];
  return {
    sprites: frames.map((frame) => rl(namespace, `${id}_${frame}`)),
    assets: frames.map((frame) =>
      placeholderFrame(pattern, frame, answers.colour, namespace, `${id}_${frame}`),
    ),
    own: false,
  };
}

/** Frame `frame` of `pattern` in `colour`, at `textures/particle/<name>.png`. */
function placeholderFrame(
  pattern: PlaceholderPattern,
  frame: number,
  colour: Rgb,
  namespace: string,
  name: string,
): ContentBundleAsset {
  return {
    namespace,
    path: `textures/particle/${name}.png`,
    bytes: placeholderPng(pattern, { colour, frame }),
  };
}

/** The `msm:particle` definition the answers give, with the sprites of its frames. */
export function particleData(
  sprites: readonly ResourceLocation[],
  answers: Omit<ParticleAnswers, 'colour' | 'picture' | 'show'>,
): JsonObject {
  const look = choiceOf(PARTICLE_LOOKS, answers.look);
  const size = choiceOf(PARTICLE_SIZES, answers.size).size;
  const data: JsonObject = {
    format: 1,
    textures: [...sprites],
    lifetime: choiceOf(PARTICLE_LIFETIMES, answers.lifetime).ticks,
    size,
    ...(sprites.length > 1 ? structuredClone(look.fields) : {}),
    ...structuredClone(choiceOf(PARTICLE_MOVEMENTS, answers.movement).fields),
  };
  if (look.value === 'puff') data.size_end = Math.round(size * 2 * 100) / 100;
  if (answers.fades) data.fade = 'out';
  if (answers.glows) data.emissive = true;
  return data;
}

/**
 * The particle `<ns>:<name.id>` with its frames and, by `answers.show`, the block that shows it
 * or the item that sends it.
 */
export function particleContent(
  namespace: string,
  name: NameForms,
  answers: Readonly<ParticleAnswers>,
): ContentBundle {
  const id = name.id;
  const particle = rl(namespace, id);
  const frames = particleFrames(namespace, id, answers);
  const data = particleData(frames.sprites, answers);
  const look = choiceOf(PARTICLE_LOOKS, answers.look);
  const movement = choiceOf(PARTICLE_MOVEMENTS, answers.movement);
  const show = choiceOf(PARTICLE_SHOW, answers.show).value;
  const pictures =
    frames.sprites.length === 1
      ? `textures/particle/${id}.png${frames.own ? ' (your picture)' : ' (a placeholder spark until you pick a picture)'}`
      : `textures/particle/${id}_0.png to _${frames.sprites.length - 1}.png`;
  const looks = look.pattern === undefined ? 'your own picture' : look.words;
  const elements: ContentBundleElement[] = [
    element(
      particle,
      PARTICLE_KINDS.particle,
      data,
      `A particle type of your own (msm:particle): ${looks}, drawn from ${pictures}, which lowering also lists in the description assets/${namespace}/particles/${id}.json. It lives ${data.lifetime} ticks, is ${data.size} blocks to each side of its centre and ${movement.words}.${answers.fades ? ' fade out makes it see-through towards the end.' : ''}${answers.glows ? ' emissive draws it at full brightness, so it glows in the dark.' : ''} Use ${particle} in a spawn_particle action, as a block's ambient particle, or with /particle ${particle} ~ ~1 ~ 0.3 0.3 0.3 0 10. It needs the Fabric mod jar export, on the server and on every client.`,
    ),
  ];
  const assets = [...frames.assets];
  if (show === 'block') {
    const block = rl(namespace, `${id}_block`);
    const model = rl(namespace, `block/${id}_block`);
    elements.push(
      element(
        block,
        KINDS.block,
        {
          format: 1,
          model,
          display_name: `${name.display} Block`,
          sound_type: 'stone',
          loot: 'self',
          item: { creative_tab: 'minecraft:building_blocks' },
          components: {
            'msm:breakable': { hardness: 1.5, resistance: 6, tool: 'pickaxe' },
            'msm:ambient_particles': {
              particle,
              chance: 0.4,
              offset: [0.5, 1.1, 0.5],
              spread: [0.5, 0.2, 0.5],
            },
          },
        },
        `A block that shows ${name.lower} by itself, as a torch shows its flame: msm:ambient_particles gives a 40 per cent chance each tick of one particle just above its top (offset from the block's corner, with a random spread). The client draws them near the player only, so they cost the server nothing. It needs a pickaxe and drops itself.`,
      ),
      element(
        model,
        KINDS.model,
        { parent: 'minecraft:block/cube_all', textures: { all: model } },
        `A full cube drawn from textures/block/${id}_block.png.`,
      ),
    );
    assets.push(texture(namespace, `block/${id}_block`, 'polished_stone', COLOURS.slate));
  } else if (show === 'item') {
    const item = rl(namespace, `${id}_wand`);
    const used = rl(namespace, `${id}_wand_used`);
    elements.push(
      element(
        item,
        KINDS.item,
        {
          format: 1,
          model: 'minecraft:item/blaze_rod',
          display_name: `${name.display} Wand`,
          max_stack_size: 1,
          creative_tab: 'minecraft:tools_and_utilities',
          components: { 'msm:on_use': { event: used, cooldown_ticks: 10 } },
          events: {
            [used]: {
              actions: [{ type: 'spawn_particle', particle, count: 16, spread: 0.6, speed: 0.05 }],
            },
          },
        },
        `An item that sends a burst of ${name.lower}: msm:on_use fires ${used} when a player uses it, at most every half second, and its spawn_particle action sends 16 particles around the player to everyone nearby. It reuses the vanilla blaze rod model, so it needs no texture.`,
      ),
    );
  }
  return { elements, assets };
}
