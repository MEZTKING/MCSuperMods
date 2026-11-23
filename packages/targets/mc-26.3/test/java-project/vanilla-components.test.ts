/**
 * The ejected `VanillaComponents.DELAYED` (`templates/vanilla-components-java.ts`) is the
 * runtime's `ComponentPassthrough.DELAYED` (ADR 0044 D1, ADR 0127 D2, ADR 0117 Y16): an ejected
 * mod decodes the same components once data packs are loaded as the runtime does. Nothing is left
 * out; a component left out on purpose would be listed in `LEFT_OUT` with its reason.
 */
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { vanillaComponentsJava } from '../../src/java-project/templates/vanilla-components-java';

const here = dirname(fileURLToPath(import.meta.url));
const passthrough = join(
  here,
  '../../../../../engine-mod/src/main/java/dev/mcsupermods/runtime/registry/ComponentPassthrough.java',
);

/** Components of the runtime's list the eject leaves out on purpose, with the reason. None today. */
const LEFT_OUT: Readonly<Record<string, string>> = {};

/** The ids in a Java `DELAYED = Set.of(...)` declaration. */
function delayedIds(java: string): string[] {
  const start = java.indexOf('DELAYED = Set.of(');
  expect(start, 'DELAYED = Set.of( not found').toBeGreaterThan(-1);
  const body = java.slice(start, java.indexOf(');', start));
  return [...body.matchAll(/withDefaultNamespace\("([a-z_/]+)"\)/g)].map((match) => match[1] ?? '');
}

describe('VanillaComponents.DELAYED (26.3 eject)', () => {
  it('mirrors the runtime list of late passthrough components', async () => {
    const runtime = delayedIds(await readFile(passthrough, 'utf8'));
    const ejected = delayedIds(vanillaComponentsJava('msm_test', 'msm_test'));
    expect(runtime).toContain('can_break');
    expect(runtime).toContain('can_place_on');
    expect(runtime).toContain('enchantments');
    expect([...ejected].sort()).toEqual(runtime.filter((id) => !(id in LEFT_OUT)).sort());
    // The same order as the runtime, so the two sources read alike.
    expect(ejected).toEqual(runtime.filter((id) => !(id in LEFT_OUT)));
  });
});
