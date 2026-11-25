/**
 * Pack formats, data version and the version itself, from mcmeta's `version.json`.
 *
 * @packageDocumentation
 */

import { makeChange } from './change.ts';
import type { Json, TargetChange, TargetChangeHandling } from './types.ts';

/** The fields of mcmeta's `version.json` this tool reads. */
export interface VersionFile {
  id: string;
  data_version: number;
  data_pack_version: number;
  data_pack_version_minor?: number;
  resource_pack_version: number;
  resource_pack_version_minor?: number;
  protocol_version?: number;
  type?: string;
  stable?: boolean;
}

/** The values compared, by subject: how to read each and who acts on a change. */
const VALUES: readonly {
  subject: string;
  read: (v: VersionFile) => Json | undefined;
  handling: TargetChangeHandling;
}[] = [
  {
    subject: 'data_pack_format',
    read: (v) => ({ major: v.data_pack_version, minor: v.data_pack_version_minor ?? 0 }),
    handling: 'auto',
  },
  { subject: 'data_version', read: (v) => v.data_version, handling: 'auto' },
  { subject: 'protocol_version', read: (v) => v.protocol_version, handling: 'none' },
  {
    subject: 'resource_pack_format',
    read: (v) => ({ major: v.resource_pack_version, minor: v.resource_pack_version_minor ?? 0 }),
    handling: 'auto',
  },
  { subject: 'stable', read: (v) => v.stable, handling: 'none' },
  { subject: 'type', read: (v) => v.type, handling: 'none' },
  { subject: 'version', read: (v) => v.id, handling: 'none' },
];

/**
 * One `value-changed` per value that differs. Pack formats and the data version are `auto`
 * (lowering writes the target's own); the version, its type, `stable` and the protocol are
 * news.
 */
export function diffPacks(before: VersionFile, after: VersionFile): TargetChange[] {
  const changes: TargetChange[] = [];
  for (const { subject, read, handling } of VALUES) {
    const from = read(before);
    const to = read(after);
    if (JSON.stringify(from) === JSON.stringify(to)) continue;
    changes.push(
      makeChange({
        area: 'packs',
        what: 'value-changed',
        subject,
        ...(from === undefined ? {} : { from }),
        ...(to === undefined ? {} : { to }),
        handling,
        source: 'version',
      }),
    );
  }
  return changes;
}
