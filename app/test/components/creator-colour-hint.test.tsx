// @vitest-environment happy-dom
/**
 * The Creator passes the flow's colour answer to its image fields (ADR 0092 D9, B502): the Draw
 * dialog shows "The thing's colour" and starts on it, in Advanced and in Very easy.
 */
import type { Project } from '@msm/core';
import type { StarterParameter } from '@msm/plugin-api';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { CreatorDialog } from '../../src/renderer/src/components/creator/CreatorDialog';
import { colourHintOf } from '../../src/renderer/src/components/creator/CreatorImageField';
import type { ProjectSession } from '../../src/renderer/src/session/project-session';
import { usePreferences } from '../../src/renderer/src/store/preferences';
import { aiSession } from './ai-fixtures';
import { LAZY_CHUNK_TIMEOUT_MS, PRELOAD_TIMEOUT_MS, preloadChunks } from './lazy-chunks';

beforeAll(
  () => preloadChunks(() => import('../../src/renderer/src/components/art/DrawPictureDialog')),
  PRELOAD_TIMEOUT_MS,
);

afterEach(() => {
  cleanup();
  usePreferences.setState({ mode: 'advanced' });
});

const param = (fields: Record<string, unknown>): StarterParameter => fields as never;
const image = param({
  id: 'picture',
  label: 'Picture',
  type: 'image',
  group: 'Pictures',
}) as StarterParameter & { type: 'image' };

describe('colourHintOf', () => {
  it('takes a colour of the field group, else the flow first colour', () => {
    const first = param({ id: 'colour', label: 'Colour', type: 'colour', group: 'Stone' });
    const second = param({ id: 'aged', label: 'Aged', type: 'colour', group: 'Stone' });
    const own = param({ id: 'tint', label: 'Tint', type: 'colour', group: 'Pictures' });
    const raw = { colour: '#4B5A6C', aged: '#00ff00', tint: '#123456' };
    expect(colourHintOf([first, second, image], raw, image)).toBe('#4b5a6c');
    expect(colourHintOf([first, own, image], raw, image)).toBe('#123456');
  });

  it('gives nothing without a colour question or a colour answer', () => {
    const first = param({ id: 'colour', label: 'Colour', type: 'colour', group: 'Stone' });
    expect(colourHintOf([image], {}, image)).toBeUndefined();
    expect(colourHintOf([first, image], { colour: 'red' }, image)).toBeUndefined();
  });
});

function renderDialog(session: ProjectSession) {
  render(
    <CreatorDialog
      session={session}
      project={session.snapshot.project as Project}
      namespaces={['demo']}
      folders={session.target.folders.resource}
      readProjectAsset={(namespace, path) => session.readAsset(namespace, path).catch(() => null)}
      vanilla={null}
      onClose={vi.fn()}
      onCreated={vi.fn()}
      newSetId={() => 'set-1'}
      webgl={false}
      debounceMs={5}
      pickImage={async () => []}
    />,
  );
  return userEvent.setup();
}

function stoneColour(session: ProjectSession): string {
  const flow = session.library.starters.find((entry) => entry.id === 'stone-set');
  const colour = flow?.parameters?.find((parameter) => parameter.id === 'colour');
  if (colour === undefined || colour.type !== 'colour') throw new Error('No stone colour');
  return colour.default;
}

describe('the Creator image field and the flow colour', () => {
  for (const mode of ['advanced', 'very-easy'] as const) {
    it(`starts Draw on the flow colour (${mode})`, async () => {
      usePreferences.setState({ mode });
      const { session } = await aiSession();
      const user = renderDialog(session);
      await user.click(screen.getByTestId('creator-flow-stone-set'));
      fireEvent.click(await screen.findByTestId('param-picture_stone-draw'));
      await screen.findByTestId('draw-dialog', undefined, { timeout: LAZY_CHUNK_TIMEOUT_MS });
      expect(screen.getByTestId('draw-swatch-thing')).toBeTruthy();
      const well = screen.getByTestId('draw-colour') as HTMLInputElement;
      expect(well.value.toLowerCase()).toBe(stoneColour(session));
    });
  }
});
