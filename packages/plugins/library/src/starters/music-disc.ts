/**
 * The Custom music disc starter (ADR 0020, D3). No sound file is bundled: the sound event
 * plays the vanilla file `minecraft:records/cat` until the user imports their own `.ogg`
 * (Import assets, Sounds: stored as `sounds/<name>.ogg`) and points the event at
 * `<namespace>:<name>`. A vanilla pack cannot add an item, so the
 * disc is music disc 13 carrying a `jukebox_playable` component for the new song. The
 * starter overrides music disc 13's item definition with a `select` on that component, so a
 * disc playing the new song gets its own model and every other music disc 13 keeps its look.
 */
import type { BundleContext, ContentBundle } from '@msm/plugin-api';
import { COLOURS, element, KINDS, packElement, rl, texture } from '../content/bundle';

/** The song's path in the project namespace. */
export const SONG = 'my_song';

export function musicDiscBundle({ namespace, projectName }: BundleContext): ContentBundle {
  const song = rl(namespace, SONG);
  const event = `music_disc.${SONG}`;
  const discModel = rl(namespace, `item/${SONG}_disc`);
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
        `Defines the sound event ${namespace}:${event}. It plays the vanilla file records/cat for now: choose Import assets, then Sounds, and pick your own .ogg (for example ${SONG}.ogg; it is stored as sounds/${SONG}.ogg in this namespace), then change name to ${namespace}:${SONG} (the path under sounds/ without .ogg). stream: true plays long music without loading it all at once.`,
      ),
      element(
        song,
        KINDS.jukeboxSong,
        {
          sound_event: rl(namespace, event),
          description: { translate: `jukebox_song.${namespace}.${SONG}` },
          length_in_seconds: 185,
          comparator_output: 7,
        },
        `The jukebox song: which sound event plays (${namespace}:${event}, defined in this pack's sounds element), the "Now playing" text, how long the jukebox counts as playing and the redstone signal a comparator reads (0 to 15). Set length_in_seconds to the length of your own track.`,
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
        `Replaces music disc 13's item definition: a select on its jukebox_playable component picks the new model when the disc plays ${song}; every other music disc 13 falls back to the vanilla model.`,
      ),
      element(
        rl(namespace, 'give_disc'),
        KINDS.function,
        {
          lines: [
            `# Run with /function ${namespace}:give_disc`,
            `give @s minecraft:music_disc_13[minecraft:jukebox_playable="${song}",minecraft:item_name="My Song Disc"]`,
          ],
        },
        'Gives a music disc that plays the new song; the item definition draws it with its own model. Put it in a jukebox to listen.',
      ),
    ],
    assets: [texture(namespace, `item/${SONG}_disc`, 'disc', COLOURS.violet)],
  };
}
