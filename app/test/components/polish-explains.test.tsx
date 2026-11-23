// @vitest-environment happy-dom
/**
 * The app explains itself: the Creator warns before it skips a thing the project already has
 * (and names it for the toast), the Block and Item Studios say why "Make with AI" has
 * nothing to make on a vanilla model, and Explain and Ask the helper attach a problem with a
 * chip in plain words (ADR 0125 D11, B689).
 */
import { DEFAULT_AI_SETTINGS } from '@msm/ai';
import type { Element, Problem, Project } from '@msm/core';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { attachElementToAi } from '../../src/renderer/src/App';
import { elementChipLabel, problemChipLabel } from '../../src/renderer/src/ai/context-blocks';
import { AiPanel } from '../../src/renderer/src/components/ai/AiPanel';
import {
  AiController,
  EXPLAIN_PROBLEM_TEXT,
  useAiPanelStore,
} from '../../src/renderer/src/components/ai/ai-controller';
import { forbiddenIn } from '../../src/renderer/src/components/ai/ai-words';
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
import { ThingsToFix } from '../../src/renderer/src/components/ThingsToFix';
import type { ProjectSession } from '../../src/renderer/src/session/project-session';
import { useAiStore } from '../../src/renderer/src/store/ai-store';
import { useUiStore } from '../../src/renderer/src/store/ui-store';
import {
  type BlocksItemsStudioHost,
  BlocksItemsStudioHostContext,
} from '../../src/renderer/src/studios/blocks-items/host';
import { aiSession, fakeAi } from './ai-fixtures';

afterEach(cleanup);

function projectOf(session: ProjectSession): Project {
  return session.snapshot.project as Project;
}

function dialog(
  session: ProjectSession,
  setId: string,
  onCreated: (result: CreatorCreated) => void = () => {},
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
    />
  );
}

describe('Creator: things it would skip', () => {
  it('words the warning', () => {
    expect(skippedWarning(['Glow Stone'])).toBe(
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
    render(dialog(session, 'set-b', () => {}));
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

// Explain everywhere (ADR 0125 D11, B689) -------------------------------------------------

const SWORD: Element = {
  id: 'demo:ruby_sword',
  kind: 'msm:item',
  formatVersion: 1,
  data: { display_name: 'Ruby Sword' },
  meta: { createdAt: '2026-01-01T00:00:00.000Z' },
};

const SWORD_PROJECT = {
  namespaces: [{ namespace: 'demo', elements: [SWORD] }],
} as unknown as Project;

const MISSING_MODEL: Problem = {
  severity: 'error',
  code: 'blocks-items.missing-model',
  message: 'Model demo:item/ruby_sword is missing.',
  elementId: 'demo:ruby_sword',
  path: '/model',
};

const UNKNOWN: Problem = {
  severity: 'error',
  code: 'scripting.who-knows',
  message: 'The original words.',
  elementId: 'demo:ruby_sword',
};

const ON_THE_MOD: Problem = {
  severity: 'error',
  code: 'scripting.who-knows',
  message: 'Something about the mod.',
};

/** An id-shaped word (`demo:ruby_sword`) or a problem code (`blocks-items.missing-model`). */
const ID_OR_CODE = /[a-z0-9_.-]+:[a-z0-9_/.-]+|[a-z-]+\.[a-z-]+/;

describe("Explain's chip (ADR 0125 D11)", () => {
  it('names the thing and the plain problem with no id or code', () => {
    const labels = [
      problemChipLabel(MISSING_MODEL, SWORD_PROJECT),
      problemChipLabel(UNKNOWN, SWORD_PROJECT),
      problemChipLabel(ON_THE_MOD, SWORD_PROJECT),
      elementChipLabel(SWORD),
    ];
    expect(labels).toEqual([
      'About: Ruby Sword, it has no shape picture (model) to show. Pick a picture for it',
      'About: Ruby Sword, something in Ruby Sword needs fixing',
      'About: Your mod, something in your mod needs fixing',
      'About: Ruby Sword',
    ]);
    for (const label of labels) {
      expect(label).not.toMatch(ID_OR_CODE);
      expect(forbiddenIn(label)).toEqual([]);
    }
  });
});

describe('Ask the helper on a Things to fix row (ADR 0125 D11)', () => {
  beforeEach(() => {
    useAiStore.setState({ conversations: {} });
    useAiPanelStore.setState({
      keyStatus: null,
      settings: null,
      models: {},
      drafts: {},
      applying: false,
      focusRequest: 0,
    });
    useUiStore.setState({ snapshot: null, rightDock: 'problems' });
  });
  async function host() {
    const ai = fakeAi();
    const { session } = await aiSession();
    session.addElement({ id: 'demo:ruby_sword', kind: 'msm:item', data: SWORD.data });
    const controller = new AiController({
      session,
      ai,
      loadSettings: async () => ({
        minecraftDir: null,
        updates: { autoCheck: true },
        detectedMinecraftDir: null,
        ai: DEFAULT_AI_SETTINGS,
      }),
      newId: () => 'id-1',
    });
    controller.attach();
    return { ai, session, controller };
  }

  it('attaches the problem in plain words and sends nothing', async () => {
    const { ai, session, controller } = await host();
    const project = session.snapshot.project;
    render(
      <>
        <ThingsToFix
          project={project}
          problems={[MISSING_MODEL]}
          onShow={vi.fn()}
          onAsk={(problem) => controller.explainProblem(problem)}
        />
        <AiPanel controller={controller} onOpenSettings={vi.fn()} />
      </>,
    );
    const user = userEvent.setup();
    await user.click(screen.getByTestId('things-to-fix-0-ask'));
    expect(useUiStore.getState().rightDock).toBe('assistant');
    const label = await screen.findByTestId('ai-context-label');
    expect(label.textContent).toBe(
      'About: Ruby Sword, it has no shape picture (model) to show. Pick a picture for it',
    );
    expect(label.textContent).not.toMatch(ID_OR_CODE);
    // The exact text that would be sent is folded, and still there to see on a click.
    expect(screen.getByTestId('ai-context').textContent).not.toMatch(ID_OR_CODE);
    await user.click(screen.getByTestId('ai-context-show'));
    expect(screen.getByTestId('ai-context').textContent).toContain(
      '`blocks-items.missing-model` on `demo:ruby_sword`',
    );
    expect((screen.getByTestId('ai-input') as HTMLTextAreaElement).value).toBe(
      EXPLAIN_PROBLEM_TEXT,
    );
    // Nothing was sent.
    await Promise.resolve();
    expect(ai.starts).toEqual([]);
    expect(
      useAiStore.getState().conversations[session.snapshot.root ?? '']?.messages ?? [],
    ).toEqual([]);
  });

  it('labels the chip in plain words, and Ask AI by the thing', async () => {
    const { session, controller } = await host();
    render(<AiPanel controller={controller} onOpenSettings={vi.fn()} />);
    controller.explainProblem(MISSING_MODEL);
    expect((await screen.findByTestId('ai-context-label')).textContent).toBe(
      'About: Ruby Sword, it has no shape picture (model) to show. Pick a picture for it',
    );
    attachElementToAi(controller, 'demo:ruby_sword', session.snapshot.project);
    await waitFor(() =>
      expect(screen.getByTestId('ai-context-label').textContent).toBe('About: Ruby Sword'),
    );
  });
});
