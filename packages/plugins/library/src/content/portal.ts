/**
 * The shared builder of a portal (ADR 0077 D1, ADR 0078 D2): the `msm:block` of type `portal`,
 * its frame block (when the answer is a new one), the key item that lights it (when the answer
 * is a key) and their models, recipes and placeholder textures. The Portal flow, the Dimension
 * flow's portal answer and the portal example all build their portal here.
 *
 * Ids derive from the portal's name: the portal `<id>`, its surface texture `block/<id>`, the
 * frame block `<id>_frame` (model and texture `block/<id>_frame`, recipe
 * `<id>_frame_from_obsidian`) and the key `<id>_key` (model and texture `item/<id>_key`,
 * recipe `<id>_key_from_gold`). Names come from `display_name`, which lowering writes as the
 * `block.<ns>.<id>` and `item.<ns>.<id>` language keys, so no language file is needed.
 *
 * The portal and the key and frame block exist only in the Fabric mod jar (limit P1). A vanilla
 * data pack leaves out the frame block's and the key's recipes and the frame block's loot table
 * (ADR 0066 D3) and makes the portal's `#minecraft:portals` entry optional (D4). The frame block
 * is never used in a flat layer or a feature: that would leave the whole dimension out.
 *
 * @packageDocumentation
 */
import type {
  ContentBundle,
  ContentBundleElement,
  JsonObject,
  ResourceLocation,
} from '@msm/plugin-api';
import type { Rgb } from '../assets/png';
import { COLOURS, element, itemModel, KINDS, rl, texture } from './bundle';
import type { NameForms } from './parameters';

/** The frame choices: a new frame block in the portal colour, or a vanilla block. */
export const PORTAL_FRAMES: readonly { value: string; label: string }[] = Object.freeze([
  { value: 'new', label: 'A new frame block in the portal colour' },
  { value: 'minecraft:crying_obsidian', label: 'Crying obsidian' },
  { value: 'minecraft:gold_block', label: 'Block of gold' },
  { value: 'minecraft:quartz_block', label: 'Block of quartz' },
  { value: 'minecraft:prismarine_bricks', label: 'Prismarine bricks' },
  { value: 'minecraft:purpur_block', label: 'Purpur block' },
]);

/** The igniter choices: vanilla items, or a new key item with {@link PORTAL_KEY_USES} uses. */
export const PORTAL_IGNITERS: readonly { value: string; label: string }[] = Object.freeze([
  { value: 'minecraft:flint_and_steel', label: 'Flint and steel' },
  { value: 'key', label: 'A new key item (64 uses)' },
  { value: 'minecraft:fire_charge', label: 'A fire charge' },
  { value: 'minecraft:ender_eye', label: 'An eye of ender' },
]);

/** How many frames the key item lights before it breaks. */
export const PORTAL_KEY_USES = 64;

/** The default portal colour: a Nether-portal violet. */
export const DEFAULT_PORTAL_COLOUR: Rgb = COLOURS.violet;

/** The answers that shape a portal, besides its name and destination. */
export interface PortalAnswers {
  /** `new` or a vanilla block id ({@link PORTAL_FRAMES}). */
  frame: string;
  /** `key` or a vanilla item id ({@link PORTAL_IGNITERS}). */
  igniter: string;
  /** `1` (one block is one block) or `8` (one block there is eight here, as the Nether). */
  scale: string;
  /** The colour of the portal surface, the new frame block, the key and the dust particles. */
  colour: Rgb;
  /** `portal` (the target's portal sparkles) or `dust` (dust particles in the colour). */
  particles: string;
  /** `hum` (the portal's ambient and travel sounds) or `quiet` (none). */
  sounds: string;
  /** The wobble, overlay and entry sound when standing in the portal (limit P2). */
  overlay: boolean;
}

/** The Portal flow's default answers, which the Dimension flow's portal answer uses too. */
export const DEFAULT_PORTAL_ANSWERS: Readonly<PortalAnswers> = Object.freeze({
  frame: 'new',
  igniter: 'minecraft:flint_and_steel',
  scale: '1',
  colour: DEFAULT_PORTAL_COLOUR,
  particles: 'portal',
  sounds: 'hum',
  overlay: true,
});

/** Where a portal leads. */
export interface PortalDestination {
  /** The dimension id. */
  dimension: ResourceLocation;
  /** The destination in words for notes: `the Nether`, `Sky Realm (flat grass land …)`. */
  words: string;
  /** The travel function of a new dimension, named in the notes; absent for other ones. */
  travel?: ResourceLocation;
}

/** An RGB colour as the integer `particles.color` takes. */
const colourInt = ([r, g, b]: Rgb): number => (r << 16) | (g << 8) | b;

/** The label of a choice value, lower case, or the value itself. */
const labelOf = (choices: readonly { value: string; label: string }[], value: string): string =>
  (choices.find((choice) => choice.value === value)?.label ?? value).toLowerCase();

/**
 * The portal `<ns>:<name.id>` to `destination`, with the elements and placeholder textures
 * `answers` call for.
 */
export function portalContent(
  namespace: string,
  name: NameForms,
  destination: PortalDestination,
  answers: Readonly<PortalAnswers>,
): ContentBundle {
  const id = name.id;
  const portal = rl(namespace, id);
  const surface = rl(namespace, `block/${id}`);
  const newFrame = answers.frame === 'new';
  const frame: ResourceLocation = newFrame
    ? rl(namespace, `${id}_frame`)
    : (answers.frame as ResourceLocation);
  const frameModel = rl(namespace, `block/${id}_frame`);
  const withKey = answers.igniter === 'key';
  const key = rl(namespace, `${id}_key`);
  const scale = answers.scale === '8' ? 8 : 1;
  const dust = answers.particles === 'dust';
  const quiet = answers.sounds === 'quiet';

  const travel: JsonObject = { scale };
  if (!answers.overlay) travel.overlay = false;
  const data: JsonObject = {
    format: 1,
    display_name: name.display,
    type: 'portal',
    frame,
    destination: destination.dimension,
    travel,
    textures: { portal: surface },
  };
  if (withKey) data.igniter = key;
  else if (answers.igniter !== 'minecraft:flint_and_steel') data.igniter = answers.igniter;
  if (quiet) data.sounds = { ambient: false, travel: false };
  if (dust) data.particles = { color: colourInt(answers.colour) };

  const frameWords = newFrame ? `${name.lower} frame blocks` : labelOf(PORTAL_FRAMES, frame);
  const igniterWords = withKey
    ? `the ${name.lower} key`
    : labelOf(PORTAL_IGNITERS, answers.igniter);
  const elements: ContentBundleElement[] = [
    element(
      portal,
      KINDS.block,
      data,
      `The portal (type portal). Build an upright frame of ${frameWords} with an opening 2 to 21 blocks wide and 3 to 21 high (the corners may be left out) and use ${igniterWords} on the inside: the opening fills with this block, which takes players, mobs and items to ${destination.words} and back to the overworld (return_to). ${scale === 8 ? 'travel.scale 8: one block there is eight in the overworld, as in the Nether.' : 'travel.scale 1: one block there is one block here.'} Arriving, it finds the nearest linked portal of the same block or builds one (of ${newFrame ? 'the frame block' : 'the frame'}). ${dust ? 'particles.color gives coloured dust particles.' : 'It sparkles with the portal particles.'} ${quiet ? 'sounds false: no hum and no travel sound.' : 'It hums and whooshes as the Nether portal does.'} ${answers.overlay ? 'Standing in it wobbles the screen with the Nether portal overlay (the game draws that one picture for every portal).' : 'travel.overlay false: no wobble and no overlay.'} textures.portal is the surface, drawn see-through from textures/block/${id}.png. A portal has no item, no loot and cannot be mined; it needs the Fabric mod jar export${destination.travel === undefined ? '' : `, and the travel function ${destination.travel} still works in vanilla packs`}.`,
    ),
  ];
  const assets = [texture(namespace, `block/${id}`, 'portal', answers.colour)];
  if (newFrame) {
    elements.push(
      element(
        frame,
        KINDS.block,
        {
          format: 1,
          model: frameModel,
          display_name: `${name.display} Frame`,
          sound_type: 'stone',
          loot: 'self',
          item: { creative_tab: 'minecraft:building_blocks' },
          components: {
            'msm:breakable': { hardness: 5, resistance: 6, tool: 'pickaxe', min_tier: 'iron' },
            'msm:light_emitter': { level: 5 },
          },
        },
        `The frame block of ${name.lower}: build the frame of it. It glows faintly (light level 5), needs an iron pickaxe and drops itself. Exit portals built at the other end are made of it too.`,
      ),
      element(
        frameModel,
        KINDS.model,
        { parent: 'minecraft:block/cube_all', textures: { all: frameModel } },
        `A full cube drawn from textures/block/${id}_frame.png.`,
      ),
      element(
        rl(namespace, `${id}_frame_from_obsidian`),
        KINDS.recipe,
        {
          type: 'minecraft:crafting_shaped',
          category: 'building',
          pattern: ['OOO', 'OAO', 'OOO'],
          key: { O: 'minecraft:obsidian', A: 'minecraft:amethyst_shard' },
          result: { id: frame, count: 8 },
        },
        `Eight obsidian around an amethyst shard make eight ${name.lower} frame blocks, enough for most of a frame. Element ids are unique across kinds, so the recipe has a name of its own.`,
      ),
    );
    assets.push(texture(namespace, `block/${id}_frame`, 'portal_frame', answers.colour));
  }
  if (withKey) {
    elements.push(
      element(
        key,
        KINDS.item,
        {
          format: 1,
          model: rl(namespace, `item/${id}_key`),
          display_name: `${name.display} Key`,
          rarity: 'rare',
          creative_tab: 'minecraft:tools_and_utilities',
          components: { 'msm:durability': { max: PORTAL_KEY_USES } },
        },
        `The key that lights ${name.lower}: use it on the inside of a finished frame. Each lit frame takes one of its ${PORTAL_KEY_USES} uses (msm:durability); in creative it never wears.`,
      ),
      itemModel(
        namespace,
        `${id}_key`,
        'minecraft:item/generated',
        `The key's flat item model, drawn from textures/item/${id}_key.png.`,
      ),
      element(
        rl(namespace, `${id}_key_from_gold`),
        KINDS.recipe,
        {
          type: 'minecraft:crafting_shapeless',
          category: 'equipment',
          ingredients: ['minecraft:gold_ingot', 'minecraft:amethyst_shard'],
          result: { id: key },
        },
        `A gold ingot and an amethyst shard make the ${name.lower} key.`,
      ),
    );
    assets.push(texture(namespace, `item/${id}_key`, 'gem', answers.colour));
  }
  return { elements, assets };
}
