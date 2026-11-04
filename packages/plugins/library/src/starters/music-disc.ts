/**
 * The Custom music disc starter (ADR 0020, D3). No sound file is bundled: the sound event
 * plays the vanilla file `minecraft:records/cat` until the user imports their own `.ogg`
 * under `sounds/` and points the event at it. A vanilla pack cannot add an item, so the
 * disc is music disc 13 carrying a `jukebox_playable` component for the new song and an
 * `item_model` component naming the starter's own item definition, so vanilla discs keep
 * their look.
 */
import type { BundleContext, ContentBundle } from '@msm/plugin-api';
import { COLOURS, element, KINDS, packElement, rl, texture } from '../content/bundle';

/** The song's path in the project namespace. */
export const SONG = 'my_song';

export function musicDiscBundle({ namespace, projectName }: BundleContext): ContentBundle {
  const song = rl(namespace, SONG);
  const event = `music_disc.${SONG}`;
  const discModel = rl(namespace, `item/${SONG}_disc`);
  const discItem = rl(namespace, `${SONG}_disc`);
  return {
    elements: [
      packElement(namespace, `${projectName}: a new music disc`),
      element(
        rl(namespace, 'sounds'),
        KINDS.sounds,
        {
          [event]: {
            sounds: [{ name: 'minecraft:records/cat', stream: true }],
          },
        },
        `Defines the sound event ${namespace}:${event}. It plays the vanilla file records/cat for now: import your own .ogg (for example sounds/records/${SONG}.ogg), then change name to ${namespace}:records/${SONG}. stream: true plays long music without loading it all at once.`,
      ),
      element(
        song,
        KINDS.jukeboxSong,
        {
          sound_event: { sound_id: rl(namespace, event) },
          description: { translate: `jukebox_song.${namespace}.${SONG}` },
          length_in_seconds: 185,
          comparator_output: 7,
        },
        'The jukebox song: which sound event plays (written as an object with sound_id, so the event can live in this pack\'s sounds element), the "Now playing" text, how long the jukebox counts as playing and the redstone signal a comparator reads (0 to 15). Set length_in_seconds to the length of your own track.',
      ),
      element(
        rl(namespace, 'en_us'),
        KINDS.lang,
        { [`jukebox_song.${namespace}.${SONG}`]: 'Your Name - My Song' },
        'The English text of the song description, shown under the disc and when it starts playing.',
      ),
      element(
        discModel,
        KINDS.model,
        { parent: 'minecraft:item/generated', textures: { layer0: discModel } },
        `The disc's item model, drawn from textures/item/${SONG}_disc.png.`,
      ),
      element(
        discItem,
        KINDS.itemDefinition,
        { model: { type: 'minecraft:model', model: discModel } },
        `An item definition of your own. Items use it when their item_model component names it (${discItem}), so the vanilla discs keep their look.`,
      ),
      element(
        rl(namespace, 'give_disc'),
        KINDS.function,
        {
          lines: [
            `# Run with /function ${namespace}:give_disc`,
            `give @s minecraft:music_disc_13[minecraft:jukebox_playable="${song}",minecraft:item_model="${discItem}",minecraft:item_name="My Song Disc"]`,
          ],
        },
        'Gives a music disc that plays the new song and is drawn with its own model. Put it in a jukebox to listen.',
      ),
    ],
    assets: [texture(namespace, `item/${SONG}_disc`, 'disc', COLOURS.violet)],
  };
}
