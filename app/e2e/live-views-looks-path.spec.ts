/**
 * The live views path of batch 3, looks and sounds (ADR 0121; plan briefs B620 stub, B631 fills it).
 *
 * Skipped until B631: the run will check, in the preview panel and the Studios, that each kind of
 * batch 3 shows its view inside the frame, that a Play button plays a project sound and (with a
 * fake Minecraft folder) a vanilla one, that a variant mob wears the user's texture, and that a
 * shader's compiler lines name the user's own lines. No real Minecraft folder is set up in these
 * runs.
 */

import { test } from 'playwright/test';

test.describe
  .skip('live views, looks and sounds', () => {
    test('each batch 3 kind shows its view in the frame', () => {
      // B631.
    });
  });
