/**
 * Chips and sound captions over Try it's picture (ADR 0085 D6, L13; B398). Chips about the player
 * sit above the hotbar, where the game shows its own messages; chips about a mob sit at the top
 * of the picture with the mob's name. Captions list the sounds that just played at the top
 * right, as the game's subtitles list them; a Minecraft sound says it plays only in the game.
 *
 * Drawing only: the chips and captions come from `effects.ts`. Part of the lazy Try it chunk.
 */

import { Volume2, VolumeX } from 'lucide-react';
import { type ShownCaption, type ShownChip, VANILLA_SOUND_NOTE } from './effects';

/** Props of {@link Chips}. */
export interface ChipsProps {
  chips: readonly ShownChip[];
  captions: readonly ShownCaption[];
  /** A mob's name by its entity id, or `undefined` when it is gone. */
  mobName(entity: number): string | undefined;
}

/** The chips and captions; see the module comment. */
export function Chips(props: ChipsProps) {
  const playerChips = props.chips.filter((chip) => chip.target === 'player');
  const mobChips = props.chips.filter((chip) => chip.target !== 'player');
  return (
    <>
      {mobChips.length > 0 && (
        <ul
          aria-label="About the mobs"
          className="pointer-events-none absolute top-2 left-1/2 z-10 flex -translate-x-1/2 flex-col items-center gap-1"
        >
          {mobChips.map((chip) => {
            const name = typeof chip.target === 'number' ? props.mobName(chip.target) : undefined;
            return (
              <li
                key={chip.serial}
                data-testid="tryit-chip-mob"
                className="rounded bg-panel/90 px-2 py-0.5 text-xs shadow"
              >
                {name === undefined ? chip.text : `${name}: ${chip.text}`}
              </li>
            );
          })}
        </ul>
      )}
      {playerChips.length > 0 && (
        <ul
          aria-label="About you"
          className="pointer-events-none absolute bottom-16 left-1/2 z-10 flex -translate-x-1/2 flex-col items-center gap-1"
        >
          {playerChips.map((chip) => (
            <li
              key={chip.serial}
              data-testid="tryit-chip"
              className="rounded bg-panel/90 px-2 py-0.5 text-sm shadow"
            >
              {chip.text}
            </li>
          ))}
        </ul>
      )}
      {props.captions.length > 0 && (
        <ul
          aria-label="Sounds"
          className="pointer-events-none absolute top-2 right-2 z-10 flex max-w-[45%] flex-col items-end gap-0.5"
        >
          {props.captions.map((caption) => (
            <li
              key={caption.id}
              data-testid="tryit-caption"
              data-played={caption.played ? 'true' : 'false'}
              title={caption.note}
              className="flex items-center gap-1 rounded bg-black/70 px-1.5 py-0.5 text-xs text-white"
            >
              {caption.played ? (
                <Volume2 size={12} aria-hidden />
              ) : (
                <VolumeX size={12} aria-hidden />
              )}
              <span>{caption.text}</span>
              {caption.note !== undefined && (
                <span className="text-white/70">
                  ({caption.note === VANILLA_SOUND_NOTE ? 'plays in the game only' : caption.note})
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
