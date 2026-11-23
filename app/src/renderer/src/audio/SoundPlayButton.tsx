/**
 * The Play button every sound shows (ADR 0121 D1; B620 stub, B622 builds it). Until then it is
 * a disabled button that says it is not built, so a place that lists it shows the frame, not a
 * crash.
 */

import type { Project } from '@msm/plugin-api';
import type { VanillaSoundReader } from './vanilla-sounds';

/** Props of {@link SoundPlayButton}. */
export interface SoundPlayButtonProps {
  /** A sound event id (`minecraft:entity.wolf.ambient`, `my_mod:thing.hum`). */
  event?: string;
  /** A sound file (`namespace:path`, no extension). */
  file?: { namespace: string; path: string };
  project: Project;
  /** Reads vanilla's sounds, or `null` when the Minecraft folder is not set up. */
  sounds: VanillaSoundReader | null;
  /** The button's words; "Play" by default. */
  label?: string;
}

export function SoundPlayButton({ label = 'Play' }: SoundPlayButtonProps) {
  return (
    <button
      type="button"
      disabled
      data-testid="sound-play-button"
      title="Not yet: the sound player is on its way."
      className="rounded border border-border px-2 py-1 text-xs text-muted"
    >
      {label}
    </button>
  );
}
