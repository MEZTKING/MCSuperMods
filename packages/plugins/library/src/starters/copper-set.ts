/**
 * The Copper set Creator flow (ADR 0101 D2, ADR 0094 D8, D9): a new metal that ages as copper
 * does. From one name, a metal colour and the colour it turns into, it builds a block, a cut
 * block with its slab and stairs, a door, a trapdoor and bars (the pieces are a question), each
 * in copper's four stages (`msm:weathering`: unaffected, exposed, weathered, oxidised, each
 * naming the next) with, if you choose, a waxed copy of every stage (`msm:waxable`; honeycomb
 * waxes, an axe scrapes back, both at run time) and the honeycomb crafting recipes. With "Make
 * an ingot" it also adds the ingot, the block from nine ingots and back, and the door,
 * trapdoor and bars crafted from ingots, in vanilla copper's shapes; the cut pieces are crafted
 * and stonecut from the block.
 *
 * Ids derive from `metal_name` as vanilla copper's: `tin_block`, `exposed_tin`, `cut_tin`,
 * `weathered_cut_tin_slab`, `oxidized_tin_door`, `waxed_exposed_tin_bars`, the ingot
 * `tin_ingot` and the recipes `tin_block_from_tin_ingot`, `waxed_tin_block_from_honeycomb`.
 * Display names say "Oxidised" (British English). Stage copies share nothing but the shape:
 * each stage has its own pictures, drawn by MSM (`assets/vanilla-parity`), and the waxed copy
 * of a stage reuses that stage's pictures.
 *
 * {@link ageFamily} turns the unaffected blocks of any family into the four stages and the
 * waxed copies; the Stone set's "Make it a copper-like set that ages" answer uses it too.
 */
import type {
  BundleContext,
  ContentBundle,
  ContentBundleAsset,
  ContentBundleElement,
  Json,
  JsonObject,
  ResourceLocation,
  StarterParameter,
} from '@msm/plugin-api';
import type { Rgb } from '../assets/png';
import {
  type AgeStage,
  agedBarsPng,
  agedDoorPng,
  agedPlatePng,
  agedTrapdoorPng,
  ingotItemPng,
} from '../assets/vanilla-parity/index';
import { element, KINDS, modElement, PACK_NOTES, packElement, rl } from '../content/bundle';
import {
  booleanValue,
  hexFromRgb,
  NAME_MAX_LENGTH,
  NAME_PATTERN,
  nameForms,
  readValues,
  rgbFromHex,
  setValue,
  stringValue,
} from '../content/parameters';

/** The four weathering stages: the component's stage, the id prefix and the display word. */
export const AGE_STAGES = Object.freeze([
  { stage: 'unaffected', prefix: '', word: '' },
  { stage: 'exposed', prefix: 'exposed_', word: 'Exposed' },
  { stage: 'weathered', prefix: 'weathered_', word: 'Weathered' },
  { stage: 'oxidized', prefix: 'oxidized_', word: 'Oxidised' },
] as const);

/** The pieces of a copper set. */
export const COPPER_SET_MEMBERS = Object.freeze([
  { value: 'block', label: 'The block' },
  { value: 'cut', label: 'Cut block' },
  { value: 'slab', label: 'Cut slab' },
  { value: 'stairs', label: 'Cut stairs' },
  { value: 'door', label: 'Door' },
  { value: 'trapdoor', label: 'Trapdoor' },
  { value: 'bars', label: 'Bars' },
  // Vanilla parity 3 (ADR 0104 D1, B518): the six more types that age, and a chest.
  { value: 'rod', label: 'Rod, as a lightning rod' },
  { value: 'button', label: 'Button' },
  { value: 'pressure_plate', label: 'Pressure plate' },
  { value: 'fence', label: 'Fence' },
  { value: 'fence_gate', label: 'Fence gate' },
  { value: 'wall', label: 'Wall' },
  { value: 'chest', label: 'Chest that joins into a double chest' },
] as const);

/** The pieces a new Copper set starts with: the first seven, as before vanilla parity 3. */
export const COPPER_SET_DEFAULT_MEMBERS: readonly string[] = Object.freeze([
  'block',
  'cut',
  'slab',
  'stairs',
  'door',
  'trapdoor',
  'bars',
]);

/** A piece's value. */
type Member = (typeof COPPER_SET_MEMBERS)[number]['value'];

/** The default metal: a pale tin. */
const TIN: Rgb = [176, 182, 190];
/** The default patina: verdigris. */
const VERDIGRIS: Rgb = [82, 162, 136];

/** The Copper set's questions, groups "Metal" and "Pieces". */
export const COPPER_SET_PARAMETERS: readonly StarterParameter[] = Object.freeze([
  {
    id: 'metal_name',
    label: 'Metal name',
    description:
      'The name of the metal. Ids derive from it: Tin gives tin_block, exposed_tin and cut_tin.',
    group: 'Metal',
    type: 'string',
    default: 'Tin',
    pattern: NAME_PATTERN,
    maxLength: NAME_MAX_LENGTH,
  },
  {
    id: 'colour',
    label: 'Metal colour',
    description: 'The colour of the new metal, before it ages.',
    group: 'Metal',
    type: 'colour',
    default: hexFromRgb(TIN),
  },
  {
    id: 'patina_colour',
    label: 'Colour it turns',
    description:
      'The colour the metal slowly turns, a little more at each stage, as copper turns green.',
    group: 'Metal',
    type: 'colour',
    default: hexFromRgb(VERDIGRIS),
  },
  {
    id: 'ingot',
    label: 'Make an ingot',
    description:
      'Adds the ingot, the block from nine ingots and back, and the door, trapdoor and bars crafted from ingots. Without it those pieces come from the creative menu.',
    group: 'Metal',
    type: 'boolean',
    default: true,
  },
  {
    id: 'members',
    label: 'Pieces',
    description:
      'Each piece comes in all four stages. The cut pieces are crafted and stonecut from the block. The chest keeps its items as it ages and joins a chest beside it into a double chest.',
    group: 'Pieces',
    type: 'set',
    default: [...COPPER_SET_DEFAULT_MEMBERS],
    choices: COPPER_SET_MEMBERS.map(({ value, label }) => ({ value, label })),
    min: 1,
  },
  {
    id: 'waxed',
    label: 'Waxed copies',
    description:
      'A waxed copy of every stage, which never ages. Honeycomb waxes a piece in the world or in the crafting grid; an axe scrapes the wax off, and scrapes a stage back.',
    group: 'Pieces',
    type: 'boolean',
    default: true,
  },
]);

// Ageing a family ------------------------------------------------------------------------------

/** The id of `id` at the stage of `prefix`: `ns:tin_block` gives `ns:exposed_tin`. */
export function stageId(id: string, prefix: string): ResourceLocation {
  if (prefix === '') return id as ResourceLocation;
  const colon = id.indexOf(':');
  const namespace = id.slice(0, colon);
  const path = id.slice(colon + 1);
  const slash = path.lastIndexOf('/');
  const dir = slash < 0 ? '' : path.slice(0, slash + 1);
  const base = path.slice(slash + 1).replace(/_block$/, '');
  return `${namespace}:${dir}${prefix}${base}`;
}

/** The waxed copy's id of `id`: `ns:exposed_tin` gives `ns:waxed_exposed_tin`. */
export function waxedId(id: string): ResourceLocation {
  const colon = id.indexOf(':');
  return `${id.slice(0, colon)}:waxed_${id.slice(colon + 1)}`;
}

/** Every string of `value` replaced through `map` where it has an entry. */
function remap(value: Json, map: ReadonlyMap<string, string>): Json {
  if (typeof value === 'string') return map.get(value) ?? value;
  if (Array.isArray(value)) return value.map((entry) => remap(entry, map));
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, remap(entry as Json, map)]),
    );
  }
  return value;
}

/** Options of {@link ageFamily}. */
export interface AgeFamilyOptions {
  /** The unaffected blocks that age (`msm:block` elements of a weathering type). */
  readonly blocks: readonly ContentBundleElement[];
  /** The block models drawn per stage (`minecraft:model` elements); copied to every stage. */
  readonly models: readonly ContentBundleElement[];
  /** The texture ids of the family; each stage names its own. */
  readonly textures: readonly string[];
  /** Whether every stage gets a waxed copy and its honeycomb recipe. */
  readonly waxed: boolean;
  /** The display name of a block at a stage (index 0 to 3) from its unaffected display name. */
  readonly display?: (unaffected: string, stage: number, id: string) => string;
  /** What the family is, for the notes: "tin", "slate". */
  readonly noun: string;
}

/** The default display of a stage: "Exposed " before the name. */
const stageDisplay = (unaffected: string, stage: number): string => {
  const word = AGE_STAGES[stage]?.word ?? '';
  return word === '' ? unaffected : `${word} ${unaffected}`;
};

/**
 * The four stages and the waxed copies of a family of unaffected blocks (ADR 0094 D8, D9). The
 * unaffected blocks come back with `msm:weathering` (stage `unaffected`, `next` the exposed
 * copy) and, with `waxed`, `msm:waxable`; each later stage is a copy whose ids, models and
 * textures carry the stage prefix (blocks a stage names, as the stairs' base block, are that
 * stage's); the oxidised stage has no `next`. A waxed copy is the stage's block without either
 * component, named `waxed_<stage id>`, and its stage's models; its honeycomb recipe
 * `<waxed id>_from_honeycomb` is shapeless, the block and a honeycomb.
 *
 * @returns The blocks of every stage, the stage models, the waxed copies and their recipes.
 */
export function ageFamily(options: AgeFamilyOptions): ContentBundleElement[] {
  const blockIds = options.blocks.map((entry) => entry.id);
  const lookIds = [...options.models.map((entry) => entry.id), ...options.textures];
  const display = options.display ?? stageDisplay;
  const out: ContentBundleElement[] = [];
  const waxedBlocks: ContentBundleElement[] = [];
  const recipes: ContentBundleElement[] = [];
  AGE_STAGES.forEach(({ stage, prefix, word }, index) => {
    const blockMap = new Map(blockIds.map((id) => [id, stageId(id, prefix)] as const));
    const lookMap = new Map(lookIds.map((id) => [id, stageId(id, prefix)] as const));
    const waxedMap = new Map(blockIds.map((id) => [id, waxedId(stageId(id, prefix))] as const));
    const next = AGE_STAGES[index + 1];
    for (const model of options.models) {
      if (prefix === '') continue;
      out.push(
        element(
          stageId(model.id, prefix),
          model.kind,
          remap(model.data, lookMap),
          `The ${word.toLowerCase()} look of ${model.id}: the same model drawn from the ${word.toLowerCase()} pictures.`,
        ),
      );
    }
    for (const block of options.blocks) {
      const id = stageId(block.id, prefix);
      const source = block.data as JsonObject;
      const shared = remap(remap(source, lookMap), blockMap) as JsonObject;
      const name = display(String(source.display_name ?? ''), index, block.id);
      const components = { ...((shared.components as JsonObject | undefined) ?? {}) };
      components['msm:weathering'] =
        next === undefined ? { stage } : { next: stageId(block.id, next.prefix), stage };
      if (options.waxed) components['msm:waxable'] = { into: waxedId(id) };
      const own = index === 0 && block.notes !== undefined ? `${block.notes} ` : '';
      out.push(
        element(
          id,
          block.kind,
          { ...shared, display_name: name, components },
          `${own}${name}: ${next === undefined ? `the last stage of the ${options.noun}; it ages no further` : `on random ticks it slowly ages into the ${next.word.toLowerCase()} stage, ${stageId(block.id, next.prefix)}, by copper's own chance, and a lower-stage neighbour holds it back`}.${options.waxed ? ` Honeycomb waxes it into ${waxedId(id)}.` : ''}${index > 0 ? ' An axe scrapes it back a stage.' : ''}`,
        ),
      );
      if (!options.waxed) continue;
      const waxedData = remap(remap(source, lookMap), waxedMap) as JsonObject;
      const waxedComponents = { ...((waxedData.components as JsonObject | undefined) ?? {}) };
      delete waxedComponents['msm:weathering'];
      delete waxedComponents['msm:waxable'];
      const waxedName = `Waxed ${name}`;
      const waxed: JsonObject = { ...waxedData, display_name: waxedName };
      if (Object.keys(waxedComponents).length > 0) waxed.components = waxedComponents;
      else delete waxed.components;
      waxedBlocks.push(
        element(
          waxedId(id),
          block.kind,
          waxed,
          `${waxedName}: ${name.toLowerCase()} under wax, which never ages. An axe scrapes the wax off and gives ${id} back.`,
        ),
      );
      recipes.push(
        element(
          `${waxedId(id)}_from_honeycomb`,
          KINDS.recipe,
          {
            type: 'minecraft:crafting_shapeless',
            category: 'building',
            ingredients: [id, 'minecraft:honeycomb'],
            result: { id: waxedId(id) },
          },
          `${name} and a honeycomb in the crafting grid make ${waxedName.toLowerCase()}, as vanilla waxes copper.`,
        ),
      );
    }
  });
  return [...out, ...waxedBlocks, ...recipes];
}

// The flow -------------------------------------------------------------------------------------

/** Vanilla copper's numbers: hardness 3, resistance 6, a stone pickaxe or better for drops. */
const COPPER_BREAKABLE: JsonObject = {
  hardness: 3,
  resistance: 6,
  tool: 'pickaxe',
  min_tier: 'stone',
};

/** What each piece is, for the notes. */
const MEMBER_NOTES: Readonly<Record<Member, string>> = {
  block: 'A full block of the metal.',
  cut: 'Cut metal: the block in four tiles.',
  slab: 'A cut slab: two stack into a double slab, which drops two.',
  stairs: 'Cut stairs: they form corners next to other stairs.',
  door: 'A two-block-high door that opens by hand or with redstone, as copper doors.',
  trapdoor: 'A trapdoor that opens by hand or with redstone.',
  bars: 'Bars that join each other, walls and solid blocks, as iron bars do.',
  rod: 'A rod that faces any of six ways, as a lightning rod; it gives no light (msm:light_emitter 0). Lightning that strikes near the metal scrapes it back a stage, as it does copper.',
  button: 'A button that gives a short redstone pulse, as a stone button.',
  pressure_plate: 'A pressure plate that mobs and players press, as a stone plate.',
  fence: 'A fence that joins other fences of its kind, walls and solid blocks.',
  fence_gate:
    'A fence gate that opens by hand or with redstone; it plays the oak gate sounds, the only gate sounds a fence gate takes.',
  wall: 'A wall that joins other walls and solid blocks and is too high to jump over.',
  chest:
    'A chest of 27 slots that joins a chest of the same stage beside it into a double chest of 54, as vanilla chests do (sneak to keep them apart). Ageing, waxing, scraping and lightning keep its items, and both halves change together. Hoppers and comparators work with each half.',
};

export function copperSetBundle(context: BundleContext): ContentBundle {
  const { namespace, projectName } = context;
  const values = readValues(COPPER_SET_PARAMETERS, context);
  const name = nameForms(stringValue(values, 'metal_name'));
  const colour = rgbFromHex(stringValue(values, 'colour'), TIN);
  const patina = rgbFromHex(stringValue(values, 'patina_colour'), VERDIGRIS);
  const chosen = new Set(setValue(values, 'members') as readonly Member[]);
  const has = (member: Member): boolean => chosen.has(member);
  const waxed = booleanValue(values, 'waxed');
  const ingot = booleanValue(values, 'ingot');
  const m = name.id;
  const id = (path: string): ResourceLocation => rl(namespace, path);

  const paths: Record<Member, string> = {
    block: `${m}_block`,
    cut: `cut_${m}`,
    slab: `cut_${m}_slab`,
    stairs: `cut_${m}_stairs`,
    door: `${m}_door`,
    trapdoor: `${m}_trapdoor`,
    bars: `${m}_bars`,
    rod: `${m}_rod`,
    button: `${m}_button`,
    pressure_plate: `${m}_pressure_plate`,
    fence: `${m}_fence`,
    fence_gate: `${m}_fence_gate`,
    wall: `${m}_wall`,
    chest: `${m}_chest`,
  };
  const names: Record<Member, string> = {
    block: `Block of ${name.display}`,
    cut: `Cut ${name.display}`,
    slab: `Cut ${name.display} Slab`,
    stairs: `Cut ${name.display} Stairs`,
    door: `${name.display} Door`,
    trapdoor: `${name.display} Trapdoor`,
    bars: `${name.display} Bars`,
    rod: `${name.display} Rod`,
    button: `${name.display} Button`,
    pressure_plate: `${name.display} Pressure Plate`,
    fence: `${name.display} Fence`,
    fence_gate: `${name.display} Fence Gate`,
    wall: `${name.display} Wall`,
    chest: `${name.display} Chest`,
  };
  const blocks: ContentBundleElement[] = [];
  const models: ContentBundleElement[] = [];
  const textures: string[] = [];
  /** Texture ids and the picture each is drawn as at a stage. */
  const pictures: { id: string; draw: (stage: AgeStage) => Uint8Array }[] = [];
  const picture = (path: string, draw: (stage: AgeStage) => Uint8Array): string => {
    const textureId = id(`block/${path}`);
    textures.push(textureId);
    pictures.push({ id: textureId, draw });
    return textureId;
  };
  const block = (member: Member, data: JsonObject, more: JsonObject = {}): void => {
    blocks.push(
      element(
        id(paths[member]),
        KINDS.block,
        {
          format: 1,
          display_name: names[member],
          sound_type: 'copper',
          loot: 'self',
          item: { creative_tab: 'minecraft:building_blocks' },
          ...data,
          components: { 'msm:breakable': { ...COPPER_BREAKABLE }, ...more },
        },
        `${MEMBER_NOTES[member]} Mined with a stone pickaxe or better, as copper.`,
      ),
    );
  };
  const cube = (member: Member, cut: boolean): void => {
    const texture = picture(paths[member], (stage) => agedPlatePng(colour, patina, stage, cut));
    const model = id(`block/${paths[member]}`);
    models.push(
      element(model, KINDS.model, {
        parent: 'minecraft:block/cube_all',
        textures: { all: texture },
      }),
    );
    block(member, { model });
  };
  if (has('block')) cube('block', false);
  const cutTexture = (): string => {
    if (!has('cut') && !textures.includes(id(`block/${paths.cut}`))) {
      picture(paths.cut, (stage) => agedPlatePng(colour, patina, stage, true));
    }
    return id(`block/${paths.cut}`);
  };
  if (has('cut')) cube('cut', true);
  if (has('slab')) block('slab', { type: 'slab', textures: { all: cutTexture() } });
  if (has('stairs')) {
    const base = has('cut')
      ? id(paths.cut)
      : has('block')
        ? id(paths.block)
        : 'minecraft:cut_copper';
    block('stairs', { type: 'stairs', base_block: base, textures: { all: cutTexture() } });
  }
  if (has('door')) {
    const top = picture(`${paths.door}_top`, (stage) => agedDoorPng(colour, patina, stage, 'top'));
    const bottom = picture(`${paths.door}_bottom`, (stage) =>
      agedDoorPng(colour, patina, stage, 'bottom'),
    );
    block('door', { type: 'door', set_type: 'copper', textures: { top, bottom } });
  }
  if (has('trapdoor')) {
    const texture = picture(paths.trapdoor, (stage) => agedTrapdoorPng(colour, patina, stage));
    block('trapdoor', { type: 'trapdoor', set_type: 'copper', textures: { texture } });
  }
  if (has('bars')) {
    const texture = picture(paths.bars, (stage) => agedBarsPng(colour, patina, stage));
    block('bars', { type: 'pane', sound_type: 'copper', textures: { all: texture } });
  }
  // The pieces of vanilla parity 3 (ADR 0104 D1): drawn from the block's picture, which is
  // drawn for them when the block itself is not chosen.
  const plateTexture = (): string => {
    const textureId = id(`block/${paths.block}`);
    if (!textures.includes(textureId)) {
      picture(paths.block, (stage) => agedPlatePng(colour, patina, stage, false));
    }
    return textureId;
  };
  if (has('rod')) {
    block(
      'rod',
      { type: 'rod', textures: { texture: plateTexture() } },
      { 'msm:light_emitter': { level: 0 } },
    );
  }
  if (has('button')) {
    block('button', { type: 'button', set_type: 'copper', textures: { texture: plateTexture() } });
  }
  if (has('pressure_plate')) {
    block('pressure_plate', {
      type: 'pressure_plate',
      set_type: 'copper',
      textures: { texture: plateTexture() },
    });
  }
  if (has('fence')) block('fence', { type: 'fence', textures: { texture: plateTexture() } });
  if (has('fence_gate')) {
    block('fence_gate', {
      type: 'fence_gate',
      wood_type: 'oak',
      textures: { texture: plateTexture() },
    });
  }
  if (has('wall')) block('wall', { type: 'wall', textures: { texture: plateTexture() } });
  if (has('chest')) {
    const front = picture(`${paths.chest}_front`, (stage) =>
      agedPlatePng(colour, patina, stage, true),
    );
    const side = plateTexture();
    block(
      'chest',
      {
        type: 'horizontal',
        item: { creative_tab: 'minecraft:functional_blocks' },
        textures: { front, side, top: side },
      },
      { 'msm:container': { layout: 'chest', rows: 3, double: true } },
    );
  }

  const family = ageFamily({
    blocks,
    models,
    textures,
    waxed,
    noun: name.lower,
    // "Block of Tin" ages into "Exposed Tin", as vanilla's block of copper does.
    display: (unaffected, stage, blockId) =>
      stage === 0
        ? unaffected
        : blockId === id(paths.block)
          ? `${AGE_STAGES[stage]?.word} ${name.display}`
          : `${AGE_STAGES[stage]?.word} ${unaffected}`,
  });
  const elements: ContentBundleElement[] = [
    packElement(namespace, `${projectName}: ${name.lower} that ages as copper`, PACK_NOTES),
    modElement(namespace, projectName, `Adds ${name.lower}, a metal that ages as copper does.`),
    ...models.map((model) => ({
      ...model,
      notes: `A full cube drawn from textures/${model.id.slice(namespace.length + 1)}.png. Each stage has a model and picture of its own.`,
    })),
    ...family,
  ];

  // The ingot and the recipes of the unaffected stage, in vanilla copper's shapes.
  const ingotId = id(`${m}_ingot`);
  if (ingot) {
    const model = id(`item/${m}_ingot`);
    elements.push(
      element(
        ingotId,
        KINDS.item,
        {
          format: 1,
          display_name: `${name.display} Ingot`,
          model,
          creative_tab: 'minecraft:ingredients',
        },
        `The ${name.lower} ingot: nine make a block, and the door, trapdoor and bars are crafted from ingots.`,
      ),
      element(
        model,
        KINDS.model,
        { parent: 'minecraft:item/generated', textures: { layer0: model } },
        `A flat item model drawn from textures/item/${m}_ingot.png.`,
      ),
    );
  }
  elements.push(...copperRecipes(namespace, paths, has, ingot ? ingotId : undefined));

  const assets: ContentBundleAsset[] = [];
  for (const { id: textureId, draw } of pictures) {
    AGE_STAGES.forEach((_, stage) => {
      const staged = stageId(textureId, AGE_STAGES[stage]?.prefix ?? '');
      assets.push({
        namespace,
        path: `textures/${staged.slice(namespace.length + 1)}.png`,
        bytes: draw(stage as AgeStage),
      });
    });
  }
  if (ingot) {
    assets.push({ namespace, path: `textures/item/${m}_ingot.png`, bytes: ingotItemPng(colour) });
  }
  return { elements, assets };
}

/** The crafting and stonecutting recipes of the unaffected pieces. */
function copperRecipes(
  namespace: string,
  paths: Record<Member, string>,
  has: (member: Member) => boolean,
  ingot: ResourceLocation | undefined,
): ContentBundleElement[] {
  const out: ContentBundleElement[] = [];
  const id = (path: string): ResourceLocation => rl(namespace, path);
  const result = (member: Member, count: number): JsonObject =>
    count === 1 ? { id: id(paths[member]) } : { count, id: id(paths[member]) };
  const shaped = (
    member: Member,
    from: string,
    category: string,
    pattern: string[],
    count: number,
    notes: string,
  ): void => {
    out.push(
      element(
        id(`${paths[member]}_from_${from.slice(namespace.length + 1)}`),
        KINDS.recipe,
        {
          type: 'minecraft:crafting_shaped',
          category,
          key: { '#': from },
          pattern,
          result: result(member, count),
        },
        notes,
      ),
    );
  };
  const cut = (member: Member, from: Member, count: number): void => {
    out.push(
      element(
        id(`${paths[member]}_from_${paths[from]}_stonecutting`),
        KINDS.recipe,
        {
          type: 'minecraft:stonecutting',
          ingredient: id(paths[from]),
          result: result(member, count),
        },
        `The stonecutter turns one ${paths[from].replaceAll('_', ' ')} into ${count === 1 ? 'one' : count} ${paths[member].replaceAll('_', ' ')}.`,
      ),
    );
  };
  if (ingot !== undefined && has('block')) {
    shaped('block', ingot, 'building', ['###', '###', '###'], 1, 'Nine ingots make a block.');
    out.push(
      element(
        `${ingot}_from_${paths.block}`,
        KINDS.recipe,
        {
          type: 'minecraft:crafting_shapeless',
          category: 'misc',
          ingredients: [id(paths.block)],
          result: { count: 9, id: ingot },
        },
        'A block gives its nine ingots back.',
      ),
    );
  }
  if (has('block') && has('cut')) {
    shaped(
      'cut',
      id(paths.block),
      'building',
      ['##', '##'],
      4,
      'Four blocks make four cut blocks.',
    );
    cut('cut', 'block', 4);
  }
  if (has('slab')) {
    if (has('cut')) {
      shaped('slab', id(paths.cut), 'building', ['###'], 6, 'Three cut blocks make six slabs.');
      cut('slab', 'cut', 2);
    }
    if (has('block')) cut('slab', 'block', 8);
  }
  if (has('stairs')) {
    if (has('cut')) {
      shaped(
        'stairs',
        id(paths.cut),
        'building',
        ['#  ', '## ', '###'],
        4,
        'Six cut blocks make four stairs.',
      );
      cut('stairs', 'cut', 1);
    }
    if (has('block')) cut('stairs', 'block', 4);
  }
  if (ingot !== undefined) {
    if (has('door'))
      shaped('door', ingot, 'redstone', ['##', '##', '##'], 3, 'Six ingots make three doors.');
    if (has('trapdoor'))
      shaped('trapdoor', ingot, 'redstone', ['##', '##'], 1, 'Four ingots make a trapdoor.');
    if (has('bars'))
      shaped('bars', ingot, 'misc', ['###', '###'], 16, 'Six ingots make sixteen bars.');
    if (has('rod'))
      shaped('rod', ingot, 'redstone', ['#', '#', '#'], 1, 'Three ingots in a column make a rod.');
    if (has('button')) {
      out.push(
        element(
          id(`${paths.button}_from_${ingot.slice(namespace.length + 1)}`),
          KINDS.recipe,
          {
            type: 'minecraft:crafting_shapeless',
            category: 'redstone',
            ingredients: [ingot],
            result: { id: id(paths.button) },
          },
          'An ingot makes a button.',
        ),
      );
    }
    if (has('pressure_plate'))
      shaped(
        'pressure_plate',
        ingot,
        'redstone',
        ['##'],
        1,
        'Two ingots side by side make a plate.',
      );
    if (has('chest')) {
      out.push(
        element(
          id(`${paths.chest}_from_${ingot.slice(namespace.length + 1)}`),
          KINDS.recipe,
          {
            type: 'minecraft:crafting_shaped',
            category: 'misc',
            key: { '#': ingot, C: 'minecraft:chest' },
            pattern: ['###', '#C#', '###'],
            result: { id: id(paths.chest) },
          },
          'Eight ingots around a chest make a chest of the metal.',
        ),
      );
    }
    for (const [member, pattern, count] of [
      ['fence', ['#S#', '#S#'], 3],
      ['fence_gate', ['S#S', 'S#S'], 1],
    ] as const) {
      if (!has(member)) continue;
      out.push(
        element(
          id(`${paths[member]}_from_${ingot.slice(namespace.length + 1)}`),
          KINDS.recipe,
          {
            type: 'minecraft:crafting_shaped',
            category: 'redstone',
            key: { '#': ingot, S: 'minecraft:stick' },
            pattern: [...pattern],
            result: result(member, count),
          },
          member === 'fence'
            ? 'Four ingots and two sticks make three fences.'
            : 'Two ingots between four sticks make a fence gate.',
        ),
      );
    }
  }
  if (has('wall') && has('block')) {
    shaped('wall', id(paths.block), 'misc', ['###', '###'], 6, 'Six blocks make six walls.');
    cut('wall', 'block', 1);
  }
  return out;
}
