/**
 * Game Studio (ADR 0132) for `msm:game`, loaded lazily by `./studios.tsx`: a whole game: its type, how a round starts and is won, the lobby, the roles and its mechanics, as the mock-up of ADR 0132 section 12 shows (B732).
 * B721 stub: one plain section saying it is coming, then the schema form.
 *
 * @packageDocumentation
 */

import type { StudioProps } from '../types';

/** The Game Studio; until B732 a plain line and the full form. */
export default function GameStudio(props: StudioProps) {
  return (
    <div className="flex flex-col gap-4" data-testid="game-studio">
      <section className="flex flex-col gap-1" data-testid="game-coming">
        <p className="text-sm">
          This is where you set up a whole game: its rounds, its players and what happens in it. It
          is not ready yet; meanwhile every setting is below.
        </p>
      </section>
      {props.form}
    </div>
  );
}
