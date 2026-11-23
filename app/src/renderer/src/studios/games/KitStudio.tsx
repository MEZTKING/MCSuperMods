/**
 * Kit Studio (ADR 0132) for `msm:kit`, loaded lazily by `./studios.tsx`: a kit as a hotbar, an armour figure and an off hand (B732).
 * B721 stub: one plain section saying it is coming, then the schema form.
 *
 * @packageDocumentation
 */

import type { StudioProps } from '../types';

/** The Kit Studio; until B732 a plain line and the full form. */
export default function KitStudio(props: StudioProps) {
  return (
    <div className="flex flex-col gap-4" data-testid="kit-studio">
      <section className="flex flex-col gap-1" data-testid="kit-coming">
        <p className="text-sm">
          This is where you choose the items, armour and effects a player gets in one go. It is not
          ready yet; meanwhile every setting is below.
        </p>
      </section>
      {props.form}
    </div>
  );
}
