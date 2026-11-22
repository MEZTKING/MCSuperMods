/**
 * The live views path of batch 2, data (ADR 0120; plan briefs B601 stub, B616 fills it).
 *
 * Skipped until B616: the project will be a copy of `fixtures/live-views` (MSM's own tables,
 * predicates, tags, modifiers, an enchantment, advancements, a dialog and functions), and the run
 * will check, in the preview panel, that each kind shows its view inside the frame (the Preview
 * tag, the fidelity level, the notes), that Roll it follows an edit of a table within the
 * budgets, and that no view reads the session store. No Minecraft folder is set up in these runs.
 */

import { test } from 'playwright/test';

test.describe
  .skip('live views, data', () => {
    test('each data kind shows its view in the frame', () => {
      // B616.
    });
  });
