// @vitest-environment happy-dom

/**
 * The Structure Studio's link to the processor view (B641): **Try a processor list on it** opens
 * the view on this building, with the list a pool places it with picked first; another list
 * can be picked; a mod without lists says how to add one.
 */

import { cleanup, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { NO_LISTS_LINE } from '../../../../src/renderer/src/liveviews/structures/processors/OnTemplate';
import type { SchemaContextState } from '../../../../src/renderer/src/studios/use-schema-context';
import { hut, mossList, pool, randomList } from '../../liveviews/structures/processors-fixtures';
import { projectOf, readySchema, renderStudio } from './harness';

vi.mock(
  '../../../../src/renderer/src/liveviews/structures/processors/client',
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import('../../../../src/renderer/src/liveviews/structures/processors/client')
      >();
    let client: InstanceType<typeof actual.ProcessorClient> | null = null;
    return {
      ...actual,
      sharedProcessorClient: () => {
        client ??= new actual.ProcessorClient({
          createWorker: async () =>
            (await import('../../liveviews/structures/processors-fixtures')).hostWorker(),
        });
        return client;
      },
    };
  },
);

afterEach(cleanup);

let schema: SchemaContextState;
beforeAll(async () => {
  schema = await readySchema();
  await import('../../../../src/renderer/src/liveviews/structures/processors/OnTemplate');
}, 60_000);

describe('Structure Studio: Try a processor list on it (B641)', () => {
  it('shows this building through the list a pool places it with', async () => {
    const building = hut();
    const project = projectOf(
      building,
      randomList('demo:crumble'),
      mossList('demo:moss'),
      pool('demo:huts', 'demo:hut', 'demo:moss'),
    );
    renderStudio({ project, subject: building, schema });
    const user = userEvent.setup();
    expect(screen.queryByTestId('structure-processors-view')).toBeNull();
    await user.click(screen.getByTestId('structure-try-processors'));
    const picker = (await screen.findByTestId(
      'structure-processors-list',
      {},
      {
        timeout: 10_000,
      },
    )) as HTMLSelectElement;
    expect(picker.value).toBe('demo:moss');
    // The view's own building picker is hidden: the building is the Studio's.
    expect(screen.queryByTestId('processors-template')).toBeNull();
    await waitFor(
      () =>
        expect(screen.getByTestId('processors-changed').textContent).toBe(
          '16 of 32 blocks changed',
        ),
      { timeout: 5000 },
    );
    await user.selectOptions(picker, 'demo:crumble');
    await waitFor(
      () =>
        expect(screen.getByTestId('processors-rule-0').textContent).toContain(
          'Leaves blocks out at random',
        ),
      { timeout: 5000 },
    );
    expect(screen.getByTestId('structure-try-processors').textContent).toBe('Hide the processors');
  });

  it('says how to add a list when the mod has none', async () => {
    const building = hut();
    renderStudio({ project: projectOf(building), subject: building, schema });
    await userEvent.setup().click(screen.getByTestId('structure-try-processors'));
    expect(
      (await screen.findByTestId('structure-processors-none', {}, { timeout: 10_000 })).textContent,
    ).toBe(NO_LISTS_LINE);
  });
});
