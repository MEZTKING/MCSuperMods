/**
 * Test setup (ADR 0130): in component tests every More options never opened or closed starts
 * open, as in the end-to-end runs (`MSM_E2E_MORE_OPTIONS=open`), so the tests of a Studio's
 * fields reach the ids and rarer settings without opening each one. The tests of the default
 * view (`studios/plain-no-ids.test.tsx`, `more-options.test.tsx`) set `msmMoreOptionsOpen` back
 * to `false`. What one test opened or closed is forgotten before the next.
 */
import { beforeEach } from 'vitest';

const host = globalThis as { window?: { msmMoreOptionsOpen?: boolean } };
if (host.window !== undefined) host.window.msmMoreOptionsOpen = true;

beforeEach(() => {
  try {
    globalThis.localStorage?.removeItem('msm.more-options.v1');
  } catch {
    // No storage in this environment.
  }
});
