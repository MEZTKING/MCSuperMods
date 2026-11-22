// @vitest-environment happy-dom
/**
 * Where the showcase appears (B569, ADR 0118 D1, D8, D10): Home without a mod and with one (open
 * while the mod has no things, folded to a link after that), the New project strip choosing a
 * flow starter and going on to its wizard, the name prefilled in the name-only New, the
 * Examples gallery's detail pane, the setting **Play showcase clips**, the remembered fold and
 * the palette's "Showcase".
 */

import type { Project } from '@msm/core';
import { libraryExamples, libraryStarters } from '@msm/plugin-library';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  BUILT_IN_COMMANDS,
  paletteCommands,
} from '../../../src/renderer/src/commands/built-in-commands';
import { ExamplesDialog } from '../../../src/renderer/src/components/ExamplesDialog';
import {
  HIDE_SHOWCASE,
  Home,
  type HomeProps,
  SHOW_SHOWCASE,
} from '../../../src/renderer/src/components/home/Home';
import { thingCards } from '../../../src/renderer/src/components/home/things';
import {
  NewModDialog,
  NewProjectDialog,
} from '../../../src/renderer/src/components/NewProjectDialog';
import { SettingsDialog } from '../../../src/renderer/src/components/SettingsDialog';
import {
  SHOWCASES,
  showcaseModName,
  showcasesFor,
} from '../../../src/renderer/src/showcase/showcases';
import { usePreferences } from '../../../src/renderer/src/store/preferences';
import { TARGETS } from './showcase-fixture';

afterEach(() => {
  cleanup();
  usePreferences.setState({ showcaseClips: true, showcaseOpen: false });
});

const gallery = <section data-testid="fake-gallery">See what you can make</section>;

function mod(elements: number): Project {
  return {
    name: 'Ruby',
    namespaces: [
      {
        name: 'ruby',
        elements: Array.from({ length: elements }, (_, index) => ({
          id: `ruby:lamp_${index}`,
          kind: 'msm:block',
          formatVersion: 1,
          data: { display_name: `Lamp ${index}` },
          meta: { createdAt: '2026-01-01T00:00:00.000Z' },
        })),
        assets: [],
      },
    ],
  } as unknown as Project;
}

function homeProps(project: Project | null, overrides: Partial<HomeProps> = {}): HomeProps {
  return {
    project,
    tiles: [],
    onTile: vi.fn(),
    cards: project === null ? [] : thingCards(project, {}),
    texturesFolder: 'textures',
    onOpenThing: vi.fn(),
    onRenameThing: vi.fn(),
    onDuplicateThing: vi.fn(),
    onDeleteThing: vi.fn(),
    onNewProject: vi.fn(),
    onOpenProject: vi.fn(),
    showcase: gallery,
    ...overrides,
  };
}

describe('Home showcase (ADR 0118 D1)', () => {
  it('sits under the buttons without a mod', () => {
    render(<Home {...homeProps(null, { onSurprise: vi.fn() })} />);
    const home = screen.getByTestId('home');
    const order = [...home.querySelectorAll('[data-testid]')].map((node) =>
      node.getAttribute('data-testid'),
    );
    expect(order.indexOf('home-showcase')).toBeGreaterThan(order.indexOf('home-surprise'));
    expect(within(screen.getByTestId('home-showcase')).getByTestId('fake-gallery')).toBeTruthy();
  });

  it('is open between the tiles and My things while the mod has no things', () => {
    render(<Home {...homeProps(mod(0))} />);
    expect(screen.getByTestId('home-showcase')).toBeTruthy();
    expect(screen.queryByTestId('home-showcase-show')).toBeNull();
    expect(screen.queryByTestId('home-showcase-hide')).toBeNull();
  });

  it('folds to a link once the mod has things, and the link opens and folds it', async () => {
    const onShowcaseOpenChange = vi.fn();
    const { rerender } = render(<Home {...homeProps(mod(1), { onShowcaseOpenChange })} />);
    expect(screen.queryByTestId('home-showcase')).toBeNull();
    const user = userEvent.setup();
    const show = screen.getByTestId('home-showcase-show');
    expect(show.textContent).toBe(SHOW_SHOWCASE);
    await user.click(show);
    expect(onShowcaseOpenChange).toHaveBeenLastCalledWith(true);
    rerender(<Home {...homeProps(mod(1), { onShowcaseOpenChange, showcaseOpen: true })} />);
    expect(screen.getByTestId('fake-gallery')).toBeTruthy();
    const hide = screen.getByTestId('home-showcase-hide');
    expect(hide.textContent).toBe(HIDE_SHOWCASE);
    await user.click(hide);
    expect(onShowcaseOpenChange).toHaveBeenLastCalledWith(false);
  });

  it('shows nothing when the host gives no gallery', () => {
    render(<Home {...homeProps(mod(1), { showcase: undefined })} />);
    expect(screen.queryByTestId('home-showcase-show')).toBeNull();
  });
});

describe('New project strip (ADR 0118 D10)', () => {
  it('Make this selects the flow starter and goes on to its wizard', async () => {
    const renderShowcase = vi.fn((choose: (flowIds: readonly string[]) => void) => (
      <button type="button" data-testid="fake-make" onClick={() => choose(['nope', 'crop'])}>
        Make this
      </button>
    ));
    render(
      <NewProjectDialog
        starters={libraryStarters}
        onCancel={vi.fn()}
        onCreate={vi.fn()}
        renderShowcase={renderShowcase}
      />,
    );
    expect(screen.getByTestId('new-project-showcase')).toBeTruthy();
    await userEvent.setup().click(screen.getByTestId('fake-make'));
    expect(screen.getByTestId('wizard-step-2')).toBeTruthy();
    expect(screen.queryByTestId('new-project-showcase')).toBeNull();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Back' }));
    expect(
      (screen.getByTestId('starter-crop') as HTMLInputElement).checked,
      'the flow stays chosen',
    ).toBe(true);
  });

  it('starts on a flow when opened from a card', () => {
    render(
      <NewProjectDialog
        starters={libraryStarters}
        onCancel={vi.fn()}
        onCreate={vi.fn()}
        startWith={['wood-set']}
      />,
    );
    expect(screen.getByTestId('wizard-step-2')).toBeTruthy();
  });
});

describe('Make this without a mod (ADR 0118 D10)', () => {
  it('prefills the name from the card', () => {
    const wood = SHOWCASES.find((clip) => clip.id === 'wood-set');
    if (wood === undefined) throw new Error('no wood set card');
    expect(showcaseModName(wood)).toBe('Elm Mod');
    for (const clip of SHOWCASES) expect(showcaseModName(clip)).toMatch(/^[A-Z][a-z]+ Mod$/);
    render(
      <NewModDialog
        parent="/docs/MCSuperMods"
        initialName={showcaseModName(wood)}
        onCancel={vi.fn()}
        onCreate={vi.fn(async () => null)}
      />,
    );
    expect((screen.getByTestId('new-mod-name') as HTMLInputElement).value).toBe('Elm Mod');
    expect(screen.getByTestId('new-mod-folder').textContent).toContain('/docs/MCSuperMods/Elm Mod');
  });
});

describe('Examples gallery detail pane (ADR 0118 D1)', () => {
  it("shows a showcased example's clip card and nothing for the others", async () => {
    const target = TARGETS[0];
    if (target === undefined) throw new Error('no target');
    const shown = new Set(showcasesFor(target, libraryExamples).map((clip) => clip.exampleId));
    const crop = libraryExamples.find((example) => example.id === 'example_msm_crop');
    const other = libraryExamples.find((example) => !shown.has(example.id));
    if (crop === undefined || other === undefined) throw new Error('no examples');
    render(
      <ExamplesDialog
        examples={[crop, other]}
        namespaces={null}
        target={target}
        onClose={vi.fn()}
        onOpenAsProject={vi.fn()}
        onCopy={vi.fn()}
        renderClip={(example) =>
          shown.has(example.id) ? <span data-testid={`clip-of-${example.id}`} /> : null
        }
      />,
    );
    const user = userEvent.setup();
    await user.click(screen.getByTestId(`example-${crop.id}`));
    expect(
      within(screen.getByTestId('example-detail-clip')).getByTestId(`clip-of-${crop.id}`),
    ).toBeTruthy();
    await user.click(screen.getByTestId(`example-${other.id}`));
    expect(screen.queryByTestId('example-detail-clip')).toBeNull();
  });
});

describe('Play showcase clips (ADR 0118 D8)', () => {
  it('is on by default and the Settings switch turns it off and on', async () => {
    expect(usePreferences.getState().showcaseClips).toBe(true);
    render(
      <SettingsDialog
        mcVersion="1.0-test"
        status={null}
        progress={null}
        load={async () => ({
          minecraftDir: null,
          updates: { autoCheck: true },
          detectedMinecraftDir: null,
        })}
        save={vi.fn(async () => {})}
        browse={async () => null}
        extract={async () => null}
        onClose={vi.fn()}
      />,
    );
    const box = screen.getByRole('checkbox', { name: 'Play showcase clips' }) as HTMLInputElement;
    expect(box.checked).toBe(true);
    expect(screen.getByText(/Moving pictures on Home and in New project/)).toBeTruthy();
    const user = userEvent.setup();
    await user.click(box);
    expect(usePreferences.getState().showcaseClips).toBe(false);
    expect(box.checked).toBe(false);
    await user.click(box);
    expect(usePreferences.getState().showcaseClips).toBe(true);
  });

  it('keeps the setting and the fold in the stored preferences', () => {
    usePreferences.getState().setShowcaseClips(false);
    usePreferences.getState().setShowcaseOpen(true);
    const stored = JSON.parse(localStorage.getItem('msm.preferences.v1') ?? '{}') as Record<
      string,
      unknown
    >;
    expect(stored.showcaseClips).toBe(false);
    expect(stored.showcaseOpen).toBe(true);
  });
});

describe('Palette (ADR 0118 D1)', () => {
  it('offers "Showcase: see what you can make"', () => {
    const run = vi.fn();
    const commands = paletteCommands({ showcase: run }, [], { modKey: 'Ctrl', onError: vi.fn() });
    const command = commands.find((entry) => entry.id === 'showcase');
    expect(command?.title).toBe('Showcase: see what you can make');
    expect(BUILT_IN_COMMANDS.showcase.title).toBe(command?.title);
    command?.run();
    expect(run).toHaveBeenCalled();
  });
});
