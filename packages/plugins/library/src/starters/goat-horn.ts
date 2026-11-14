/**
 * The Goat horn Creator flow (ADR 0064 D6): a new `minecraft:instrument` with its English
 * name, its sound (one of the eight vanilla calls, or the user's own `.ogg` through a
 * `minecraft:sounds` event named in the `{ sound_id }` form), how long one blow lasts and how
 * far it is heard; optionally a shapeless recipe that turns a goat horn and an ingredient into
 * a goat horn with the `minecraft:instrument` component, and the `minecraft:regular_goat_horns`
 * tag so goats drop it. Data only, so it works in a vanilla data and resource pack. The
 * instrument id derives from `horn_name`.
 */
import type {
  BundleContext,
  ContentBundle,
  ContentBundleAsset,
  ContentBundleElement,
  Json,
  StarterParameter,
} from '@msm/plugin-api';
import { element, KINDS, PACK_NOTES, packElement, rl } from '../content/bundle';
import {
  articleFor,
  audioValue,
  booleanValue,
  decodeOggDataUrl,
  NAME_MAX_LENGTH,
  NAME_PATTERN,
  nameForms,
  numberValue,
  readValues,
  stringValue,
} from '../content/parameters';

/** The vanilla goat horn calls, by sound event. */
const CALLS: readonly { value: string; label: string }[] = [
  { value: 'minecraft:item.goat_horn.sound.0', label: 'Ponder' },
  { value: 'minecraft:item.goat_horn.sound.1', label: 'Sing' },
  { value: 'minecraft:item.goat_horn.sound.2', label: 'Seek' },
  { value: 'minecraft:item.goat_horn.sound.3', label: 'Feel' },
  { value: 'minecraft:item.goat_horn.sound.4', label: 'Admire' },
  { value: 'minecraft:item.goat_horn.sound.5', label: 'Call' },
  { value: 'minecraft:item.goat_horn.sound.6', label: 'Yearn' },
  { value: 'minecraft:item.goat_horn.sound.7', label: 'Dream' },
];

/** The items the recipe can add to a goat horn. */
const INGREDIENTS: readonly { value: string; label: string }[] = [
  { value: 'minecraft:echo_shard', label: 'Echo shard' },
  { value: 'minecraft:amethyst_shard', label: 'Amethyst shard' },
  { value: 'minecraft:copper_ingot', label: 'Copper ingot' },
  { value: 'minecraft:gold_ingot', label: 'Gold ingot' },
  { value: 'minecraft:note_block', label: 'Note block' },
  { value: 'none', label: 'No recipe' },
];

/** The largest sound file the flow accepts. */
const SOUND_MAX_BYTES = 4 * 1024 * 1024;

/** The Goat horn flow's questions, groups "Horn" and "Getting it". */
export const GOAT_HORN_PARAMETERS: readonly StarterParameter[] = Object.freeze([
  {
    id: 'horn_name',
    label: 'Name',
    description: 'The English name of the call, shown on the horn. Ids derive from it.',
    group: 'Horn',
    type: 'string',
    default: 'Storm Call',
    pattern: NAME_PATTERN,
    maxLength: NAME_MAX_LENGTH,
  },
  {
    id: 'call',
    label: 'Sound',
    description: 'One of the eight vanilla calls. A sound file of your own replaces it.',
    group: 'Horn',
    type: 'choice',
    default: 'minecraft:item.goat_horn.sound.5',
    choices: CALLS.map((entry) => ({ ...entry })),
  },
  {
    id: 'sound_file',
    label: 'Sound file',
    description:
      'Your own call as an Ogg Vorbis file (.ogg, at most 4 MB); a mono file fades with distance. Leave it empty to use the vanilla sound above.',
    group: 'Horn',
    type: 'audio',
    default: null,
    maxBytes: SOUND_MAX_BYTES,
  },
  {
    id: 'seconds',
    label: 'Seconds per blow',
    description: 'How long one blow lasts; the horn then cools down as long. Vanilla horns take 7.',
    group: 'Horn',
    type: 'number',
    default: 7,
    min: 1,
    max: 30,
    step: 0.5,
  },
  {
    id: 'range',
    label: 'Heard from (blocks)',
    description: 'How far away players hear it. Vanilla horns reach 256 blocks.',
    group: 'Horn',
    type: 'number',
    default: 256,
    min: 16,
    max: 512,
    step: 16,
  },
  {
    id: 'ingredient',
    label: 'Crafted from',
    description: 'Any goat horn and one of it in the crafting grid make a horn with the new call.',
    group: 'Getting it',
    type: 'choice',
    default: 'minecraft:echo_shard',
    choices: INGREDIENTS.map((entry) => ({ ...entry })),
  },
  {
    id: 'goats_drop',
    label: 'Goats drop it',
    description:
      'Adds the call to the horns a goat drops when it rams a tree or stone, beside the vanilla calls.',
    group: 'Getting it',
    type: 'boolean',
    default: true,
  },
]);

/** A number rounded to two decimals, so float sliders give tidy JSON. */
const tidy = (value: number): number => Math.round(value * 100) / 100;

export function goatHornBundle(context: BundleContext): ContentBundle {
  const { namespace, projectName } = context;
  const values = readValues(GOAT_HORN_PARAMETERS, context);
  const name = nameForms(stringValue(values, 'horn_name'));
  const call =
    CALLS.find((entry) => entry.value === stringValue(values, 'call')) ??
    (CALLS[5] as { value: string; label: string });
  const picked = decodeOggDataUrl(audioValue(values, 'sound_file') ?? '');
  const seconds = tidy(numberValue(values, 'seconds'));
  const range = Math.round(numberValue(values, 'range'));
  const ingredient = INGREDIENTS.find((entry) => entry.value === stringValue(values, 'ingredient'));
  const goatsDrop = booleanValue(values, 'goats_drop');

  const id = rl(namespace, name.id);
  const key = `instrument.${namespace}.${name.id}`;
  const event = `item.goat_horn.${name.id}`;
  const elements: ContentBundleElement[] = [
    packElement(namespace, `${projectName}: ${name.lower} goat horn`, PACK_NOTES),
  ];
  const assets: ContentBundleAsset[] = [];
  let sound: Json = call.value;
  let soundWords = `sound_event is the vanilla ${call.label} call, named by its sound event id.`;
  if (picked !== null) {
    sound = { sound_id: rl(namespace, event) };
    soundWords = `sound_event is your sound file through the event ${namespace}:${event}, written as { "sound_id": ... } because a project sound is not a registered sound event.`;
    elements.push(
      element(
        rl(namespace, 'sounds'),
        KINDS.sounds,
        { [event]: { sounds: [{ name: rl(namespace, `item/goat_horn/${name.id}`) }] } },
        `Defines the sound event ${namespace}:${event}: it plays your file sounds/item/goat_horn/${name.id}.ogg in this namespace (${picked.channels === 1 ? 'mono, so it fades with distance' : 'stereo, so it plays at the same volume everywhere'}).`,
      ),
    );
    assets.push({
      namespace,
      path: `sounds/item/goat_horn/${name.id}.ogg`,
      bytes: picked.bytes,
    });
  }
  elements.push(
    element(
      id,
      KINDS.instrument,
      {
        description: { translate: key },
        sound_event: sound,
        use_duration: seconds,
        range,
      },
      `The call a goat horn plays. ${soundWords} One blow lasts ${seconds} seconds and the horn then cools down as long (use_duration); players hear it ${range} blocks away (range). A goat horn plays it when its minecraft:instrument component names ${id}: /give @s minecraft:goat_horn[minecraft:instrument="${id}"].`,
    ),
  );
  if (ingredient !== undefined && ingredient.value !== 'none') {
    elements.push(
      element(
        rl(namespace, `${name.id}_goat_horn`),
        KINDS.recipe,
        {
          type: 'minecraft:crafting_shapeless',
          category: 'misc',
          ingredients: ['minecraft:goat_horn', ingredient.value],
          result: { id: 'minecraft:goat_horn', components: { 'minecraft:instrument': id } },
        },
        `Any goat horn and ${articleFor(ingredient.label)} ${ingredient.label.toLowerCase()} anywhere in the crafting grid make a goat horn that plays the ${name.lower}: the result carries the minecraft:instrument component.`,
      ),
    );
  }
  if (goatsDrop) {
    elements.push(
      element(
        'minecraft:regular_goat_horns',
        KINDS.tagInstrument,
        { values: [id] },
        "Adds the call to the vanilla tag goats pick from when they ram a tree or stone and drop a horn. The export merges it into vanilla's tag, so the eight vanilla calls stay.",
      ),
    );
  }
  elements.push(
    element(
      rl(namespace, 'en_us'),
      KINDS.lang,
      { [key]: name.display },
      'The English name of the call, shown on the goat horn.',
    ),
  );
  return { elements, assets };
}
