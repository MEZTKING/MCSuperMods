/**
 * The main-area sections of the Game Studio and the Kit Studio (ADR 0130 D3, ADR 0132), read
 * by `../studios.tsx` without loading either Studio. B721's stub names the two stubs' only
 * sections; B732 replaces the lists with the real sections' test ids.
 *
 * @packageDocumentation
 */

/** The Game Studio's sections in the main area. */
export const GAME_COMMON_SECTIONS: readonly string[] = ['game-coming'];

/** The Kit Studio's sections in the main area. */
export const KIT_COMMON_SECTIONS: readonly string[] = ['kit-coming'];
