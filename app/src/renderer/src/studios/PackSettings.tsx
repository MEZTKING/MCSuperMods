/**
 * Pack settings: the `pack.mcmeta` form (its pack formats are hidden because export writes
 * them) plus the detected target.
 *
 * @packageDocumentation
 */

import type { PackFormat, Target } from '@msm/plugin-api';
import type { ReactNode } from 'react';

/** The format a target writes, for example `97.1` or `46`. */
export function formatLabel({ major, minor }: PackFormat): string {
  return minor === 0 ? String(major) : `${major}.${minor}`;
}

/** The pack settings view around the generated `pack.mcmeta` form. */
export function PackSettings({ target, children }: { target: Target; children: ReactNode }) {
  return (
    <section aria-label="Pack settings" className="flex flex-col gap-2">
      <p className="px-2 text-sm" data-testid="pack-target">
        Target: Minecraft {target.mcVersion} (<code className="font-mono">{target.id}</code>),
        resource pack format {formatLabel(target.packFormats.resource)}. Export writes the pack
        format for you.
      </p>
      <div data-testid="schema-form">{children}</div>
    </section>
  );
}
