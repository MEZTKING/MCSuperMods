// @vitest-environment happy-dom
/**
 * The app explains itself: the Creator warns before it skips a thing the project already has
 * (and names it for the toast), and the Block and Item Studios say why "Make with AI" has
 * nothing to make on a vanilla model.
 */
import type { Project } from '@msm/core';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  AiPicturesContext,
  type AiPicturesHost,
} from '../../src/renderer/src/components/ai-pictures/ai-pictures-host';
import {
  isVanillaModel,
  ModelPicturesAi,
} from '../../src/renderer/src/components/ai-pictures/StudioAiPictures';
import {
  type CreatorCreated,
  CreatorDialog,
  skippedWarning,
} from '../../src/renderer/src/components/creator/CreatorDialog';
import type { ProjectSession } from '../../src/renderer/src/session/project-session';
import {
  type BlocksItemsStudioHost,
  BlocksItemsStudioHostContext,
} from '../../src/renderer/src/studios/blocks-items/host';
import { aiSession } from './ai-fixtures';

afterEach(cleanup);

function projectOf(session: ProjectSession): Project {
  return session.snapshot.project as Project;
}

function dialog(
  session: ProjectSession,
  setId: string,
  onCreated: (result: CreatorCreated) => void = () => {},
  mode?: 'very-easy',
) {
  return (
    <CreatorDialog
      session={session}
      project={projectOf(session)}
      namespaces={['demo']}
      folders={session.target.folders.resource}
      readProjectAsset={(namespace, path) => session.readAsset(namespace, path).catch(() => null)}
      vanilla={null}
      onClose={() => {}}
      onCreated={onCreated}
      newSetId={() => setId}
      webgl={false}
      debounceMs={5}
      {...(mode === undefined ? {} : { mode })}
    />
  );
}

describe('Creator: things it would skip', () => {
  it('words the warning for each mode', () => {
    expect(skippedWarning(['Glow Stone'])).toBe(
      'Your mod already has Glow Stone, so it will not be made again. Choose another name.',
    );
    expect(skippedWarning(['Glow Stone'], 'very-easy')).toBe(
      'You already have Glow Stone, so it will not be made again. Type a different name.',
    );
  });

  it('warns at the name field before Create, and reports the skip after it', async () => {
    const { session } = await aiSession();
    const user = userEvent.setup();
    const first = render(dialog(session, 'set-a'));
    await user.click(screen.getByTestId('creator-flow-gear-set'));
    await screen.findByTestId('creator-tab-elements');
    expect(screen.queryByTestId('creator-skipped-warning')).toBeNull();
    await user.click(screen.getByTestId('creator-create'));
    await waitFor(() => expect(session.snapshot.dirty).toBe(true));
    first.unmount();

    // A second set with the same name: every piece is already in the project.
    render(dialog(session, 'set-b', () => {}, 'very-easy'));
    await user.click(screen.getByTestId('creator-flow-gear-set'));
    const warning = await screen.findByTestId('creator-skipped-warning');
    expect(warning.textContent).toContain('You already have Ruby');
    expect(warning.textContent).toContain('Type a different name.');
    // Another name clears the warning.
    const name = screen.getByTestId('param-material_name');
    await user.clear(name);
    await user.type(name, 'Sapphire');
    await waitFor(() => expect(screen.queryByTestId('creator-skipped-warning')).toBeNull());
  });
});

describe('Studios: Make with AI on a vanilla model', () => {
  const ai = {
    platform: {},
    status: null,
    refresh: vi.fn(),
    openSettings: vi.fn(),
    codec: {},
  } as unknown as AiPicturesHost;
  const host = {
    revision: 0,
    thumbnail: async () => new Uint8Array(),
    paintTexture: () => {},
    textureLayers: async () => [],
    applyChanges: async () => {},
  } as unknown as BlocksItemsStudioHost;

  function show(model: string, kind: 'block' | 'item') {
    return render(
      <AiPicturesContext.Provider value={ai}>
        <BlocksItemsStudioHostContext.Provider value={host}>
          <ModelPicturesAi
            project={{ namespaces: [] } as unknown as Project}
            model={model}
            name="Glow Stone"
            kind={kind}
            testId="m-ai"
          />
        </BlocksItemsStudioHostContext.Provider>
      </AiPicturesContext.Provider>,
    );
  }

  it('tells what a vanilla model is', () => {
    expect(isVanillaModel('minecraft:block/stone')).toBe(true);
    expect(isVanillaModel('block/stone')).toBe(true);
    expect(isVanillaModel('demo:block/glow')).toBe(false);
  });

  it('shows a note on a block with a vanilla model', () => {
    show('minecraft:block/stone', 'block');
    expect(screen.getByTestId('m-ai-vanilla-note').textContent).toContain(
      "This block uses Minecraft's own model, so it has no pictures of its own",
    );
  });

  it('shows a note on an item with a vanilla model', () => {
    show('minecraft:item/stick', 'item');
    expect(screen.getByTestId('m-ai-vanilla-note').textContent).toContain('This item uses');
  });

  it('shows nothing for a project model that has no pictures yet', async () => {
    show('demo:block/glow', 'block');
    await Promise.resolve();
    expect(screen.queryByTestId('m-ai-vanilla-note')).toBeNull();
  });
});
