/**
 * The Music disc starter and Creator flow (ADR 0044 D6): a new `minecraft:jukebox_song` with
 * its `minecraft:sounds` event, its English description and a disc. With the Fabric mod jar
 * (the default) the disc is a real `msm:item` whose vanilla `jukebox_playable` component
 * (through `msm:components`, ADR 0044 D1) plays the song; a project that stays vanilla gets
 * the Custom music disc starter's approach instead: music disc 13 with a `select` item
 * definition and a function that gives the disc. No sound file is bundled: the event plays
 * the vanilla `minecraft:records/cat` until the user imports their own `.ogg`. Ids derive
 * from `song_name`: the song `<id>`, the disc item `<id>_disc`.
 */
import type {
  BundleContext,
  ContentBundle,
  ContentBundleElement,
  StarterParameter,
} from '@msm/plugin-api';
import {
  COLOURS,
  element,
  itemModel,
  KINDS,
  modElement,
  PACK_NOTES,
  packElement,
  rl,
  texture,
} from '../content/bundle';
import {
  hexFromRgb,
  NAME_MAX_LENGTH,
  NAME_PATTERN,
  nameForms,
  numberValue,
  readValues,
  rgbFromHex,
  stringValue,
} from '../content/parameters';

/** The Music disc flow's questions (ADR 0044 D6), groups "Song" and "Disc". */
export const MUSIC_DISC_ITEM_PARAMETERS: readonly StarterParameter[] = Object.freeze([
  {
    id: 'song_name',
    label: 'Song name',
    description: 'The English song title. Ids derive from it: Ruby Waltz gives ruby_waltz.',
    group: 'Song',
    type: 'string',
    default: 'Ruby Waltz',
    pattern: NAME_PATTERN,
    maxLength: NAME_MAX_LENGTH,
  },
  {
    id: 'artist',
    label: 'Artist',
    description: 'Shown before the title: "Artist - Song".',
    group: 'Song',
    type: 'string',
    default: 'You',
    pattern: NAME_PATTERN,
    maxLength: NAME_MAX_LENGTH,
  },
  {
    id: 'length_seconds',
    label: 'Length in seconds',
    description:
      'How long the jukebox counts as playing; set it to the length of your .ogg file (import it with Import assets, then Sounds).',
    group: 'Song',
    type: 'number',
    default: 185,
    min: 1,
    max: 1200,
    step: 1,
  },
  {
    id: 'comparator_output',
    label: 'Comparator signal',
    description: 'The redstone signal a comparator reads from the playing jukebox, 1 to 15.',
    group: 'Song',
    type: 'number',
    default: 7,
    min: 1,
    max: 15,
    step: 1,
  },
  {
    id: 'colour',
    label: 'Label colour',
    description: 'The colour of the disc label on the placeholder texture.',
    group: 'Disc',
    type: 'colour',
    default: hexFromRgb(COLOURS.violet),
  },
  {
    id: 'disc_type',
    label: 'Disc',
    group: 'Disc',
    type: 'choice',
    default: 'item',
    choices: [
      { value: 'item', label: 'A new music disc item (needs the Fabric mod jar)' },
      { value: 'vanilla', label: 'Music disc 13 with a new look (works in vanilla packs)' },
    ],
  },
]);

export function musicDiscItemBundle(context: BundleContext): ContentBundle {
  const { namespace, projectName } = context;
  const values = readValues(MUSIC_DISC_ITEM_PARAMETERS, context);
  const name = nameForms(stringValue(values, 'song_name'));
  const artist = nameForms(stringValue(values, 'artist')).display;
  const colour = rgbFromHex(stringValue(values, 'colour'), COLOURS.violet);
  const length = Math.round(numberValue(values, 'length_seconds'));
  const comparator = Math.round(numberValue(values, 'comparator_output'));
  const asItem = stringValue(values, 'disc_type') !== 'vanilla';

  const song = rl(namespace, name.id);
  const event = `music_disc.${name.id}`;
  const songKey = `jukebox_song.${namespace}.${name.id}`;
  const disc = rl(namespace, `${name.id}_disc`);
  const discModel = rl(namespace, `item/${name.id}_disc`);
  const lang: Record<string, string> = { [songKey]: `${artist} - ${name.display}` };
  const elements: ContentBundleElement[] = [
    packElement(namespace, `${projectName}: ${name.lower}`, PACK_NOTES),
  ];
  if (asItem) {
    elements.push(
      modElement(namespace, projectName, `Adds a music disc that plays ${name.display}.`),
    );
  }
  elements.push(
    element(
      rl(namespace, 'sounds'),
      KINDS.sounds,
      { [event]: { sounds: [{ name: 'minecraft:records/cat', stream: true }] } },
      `Defines the sound event ${namespace}:${event}. It plays the vanilla file records/cat for now: choose Import assets, then Sounds, and pick your own .ogg (for example ${name.id}.ogg; it is stored as sounds/${name.id}.ogg in this namespace), then change name to ${namespace}:${name.id}. stream: true plays long music without loading it all at once.`,
    ),
    element(
      song,
      KINDS.jukeboxSong,
      {
        sound_event: rl(namespace, event),
        description: { translate: songKey },
        length_in_seconds: length,
        comparator_output: comparator,
      },
      `The jukebox song: the sound event ${namespace}:${event}, the "Now playing" text, how long the jukebox counts as playing (${length} seconds) and the comparator signal (${comparator}).`,
    ),
  );
  if (asItem) {
    lang[`item.${namespace}.${name.id}_disc`] = 'Music Disc';
    elements.push(
      element(
        disc,
        KINDS.item,
        {
          format: 1,
          model: discModel,
          max_stack_size: 1,
          rarity: 'uncommon',
          creative_tab: 'minecraft:tools_and_utilities',
          components: { 'msm:components': { 'minecraft:jukebox_playable': song } },
        },
        `The music disc: a new item whose vanilla component minecraft:jukebox_playable (set through msm:components) names the song ${song}, so a jukebox plays it and the tooltip shows the song. Take it from the creative menu or add a recipe or loot table.`,
      ),
      itemModel(
        namespace,
        `${name.id}_disc`,
        'minecraft:item/generated',
        `The disc's flat item model, drawn from textures/item/${name.id}_disc.png.`,
      ),
    );
  } else {
    elements.push(
      itemModel(
        namespace,
        `${name.id}_disc`,
        'minecraft:item/generated',
        `The disc's item model, drawn from textures/item/${name.id}_disc.png.`,
      ),
      element(
        'minecraft:music_disc_13',
        KINDS.itemDefinition,
        {
          model: {
            type: 'minecraft:select',
            property: 'minecraft:component',
            component: 'minecraft:jukebox_playable',
            cases: [{ when: song, model: { type: 'minecraft:model', model: discModel } }],
            fallback: { type: 'minecraft:model', model: 'minecraft:item/music_disc_13' },
          },
        },
        `A vanilla pack cannot add an item, so music disc 13 carries the song: a select on its jukebox_playable component picks the new model when the disc plays ${song}; every other music disc 13 keeps the vanilla model.`,
      ),
      element(
        rl(namespace, `give_${name.id}_disc`),
        KINDS.function,
        {
          lines: [
            `# Run with /function ${namespace}:give_${name.id}_disc`,
            `give @s minecraft:music_disc_13[minecraft:jukebox_playable="${song}",minecraft:item_name="${name.display} Disc"]`,
          ],
        },
        'Gives a music disc that plays the new song. Put it in a jukebox to listen.',
      ),
    );
  }
  elements.push(
    element(
      rl(namespace, 'en_us'),
      KINDS.lang,
      Object.fromEntries(Object.entries(lang).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))),
      'The English text of the song description, shown under the disc and when it starts playing.',
    ),
  );
  return { elements, assets: [texture(namespace, `item/${name.id}_disc`, 'disc', colour)] };
}
