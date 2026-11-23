/**
 * The live views path of batch 4, assembled structures (ADR 0122; plan briefs B635 stub, B643 fills it).
 *
 * Skipped until B643: the run will check, in the preview panel and the Structure Studios, that a
 * template pool, a jigsaw structure and a processor list each show their view inside the frame, that
 * Play and Step assemble piece by piece and light the two jigsaws that met, that a pool edit
 * reassembles, that a processor list shows its template before and after with the count of blocks
 * each rule changed, and that Walk in it opens the assembly in Try it. No real Minecraft folder is
 * set up in these runs.
 */

import { test } from 'playwright/test';

test.describe
  .skip('live views, assembled structures', () => {
    test('each batch 4 kind shows its view in the frame', () => {
      // B643.
    });
  });
