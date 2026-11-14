// @vitest-environment happy-dom
/**
 * "Surprise me" (ADR 0086): the dialog's buttons (Make it, Roll again, Change theme, a typed
 * seed, Cancel) over a stubbed roll, the dialog over the real generator and session, and the
 * Creator's "Pick for me".
 */
import type { Project } from '@msm/core';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CreatorDialog } from '../../src/renderer/src/components/creator/CreatorDialog';
import {
  makesPhrase,
  SurpriseDialog,
} from '../../src/renderer/src/components/surprise/SurpriseDialog';
import {
  rollSurprise,
  SURPRISE_THEMES,
  type SurpriseMod,
  type SurpriseTheme,
} from '../../src/renderer/src/surprise/surprise';
import { aiSession } from './ai-fixtures';

afterEach(cleanup);

const theme = (id: string): SurpriseTheme =>
  SURPRISE_THEMES.find((entry) => entry.id === id) as SurpriseTheme;

/** A small stand-in mod: the seed and theme show in its names. */
function fakeMod(seed: number, themeId: string | null): SurpriseMod {
  const chosen = theme(themeId ?? (seed % 2 === 0 ? 'ruby' : 'frost'));
  return {
    seed,
    theme: chosen,
    modName: `${chosen.word} Mod`,
    things: [
      {
        flowId: 'custom_ore',
        title: 'Custom ore',
        what: 'an ore with its gem and block',
        name: `${chosen.word} ${seed}`,
        values: {},
        bundle: { elements: [], assets: [] },
        makes: [`${chosen.word} Ore`, `Block of ${chosen.word}`, chosen.word],
        pictures: [],
      },
    ],
    rule: { id: 'demo:luck', sentence: `When a player breaks ${chosen.word} Ore, …` },
    items: [],
    label: `Surprise me: ${chosen.word} Mod`,
  };
}

function renderDialog(overrides: { newMod?: boolean; seeds?: number[] } = {}) {
  const roll = vi.fn(async (seed: number, themeId: string | null) => fakeMod(seed, themeId));
  const onMake = vi.fn(async () => {});
  const onClose = vi.fn();
  const seeds = [...(overrides.seeds ?? [20, 31])];
  render(
    <SurpriseDialog
      roll={roll}
      onMake={onMake}
      onClose={onClose}
      newMod={overrides.newMod ?? false}
      seed={10}
      newSeed={() => seeds.shift() ?? 99}
    />,
  );
  return { roll, onMake, onClose, user: userEvent.setup() };
}

describe('makesPhrase', () => {
  it('lists up to five names in words', () => {
    expect(makesPhrase([])).toBe('');
    expect(makesPhrase(['A'])).toBe('A');
    expect(makesPhrase(['A', 'B', 'C'])).toBe('A, B and C');
    expect(makesPhrase(['A', 'B', 'C', 'D', 'E', 'F', 'G'])).toBe('A, B, C, D, E and 2 more');
  });
});

describe('SurpriseDialog', () => {
  it('shows the rolled mod with its seed, things and rule', async () => {
    const { roll } = renderDialog();
    expect(await screen.findByTestId('surprise-mod-name')).toHaveProperty(
      'textContent',
      'Ruby Mod',
    );
    expect(roll).toHaveBeenCalledWith(10, null);
    expect((screen.getByTestId('surprise-seed') as HTMLInputElement).value).toBe('10');
    expect(screen.getByTestId('surprise-thing-0').textContent).toContain('Ruby 10');
    expect(screen.getByTestId('surprise-thing-0').textContent).toContain(
      'Makes Ruby Ore, Block of Ruby and Ruby.',
    );
    expect(screen.getByTestId('surprise-rule').textContent).toContain('When a player breaks');
    expect(screen.getByTestId('surprise-dialog').textContent).toContain('added to your mod');
  });

  it('Make it hands over the mod; Roll again rolls a new seed', async () => {
    const { roll, onMake, user } = renderDialog({ newMod: true });
    await screen.findByTestId('surprise-mod-name');
    expect(screen.getByTestId('surprise-dialog').textContent).toContain('a new mod');
    await user.click(screen.getByTestId('surprise-roll'));
    await waitFor(() => expect(roll).toHaveBeenLastCalledWith(20, null));
    await waitFor(() =>
      expect(screen.getByTestId('surprise-thing-0').textContent).toContain('Ruby 20'),
    );
    expect((screen.getByTestId('surprise-seed') as HTMLInputElement).value).toBe('20');
    await user.click(screen.getByTestId('surprise-make'));
    expect(onMake).toHaveBeenCalledWith(expect.objectContaining({ seed: 20 }));
  });

  it('Change theme keeps the seed and rolls with the picked theme', async () => {
    const { roll, user } = renderDialog();
    await screen.findByTestId('surprise-mod-name');
    expect(screen.queryByTestId('surprise-theme-void')).toBeNull();
    await user.click(screen.getByTestId('surprise-change-theme'));
    for (const entry of SURPRISE_THEMES) {
      expect(screen.getByTestId(`surprise-theme-${entry.id}`)).toBeTruthy();
    }
    await user.click(screen.getByTestId('surprise-theme-void'));
    await waitFor(() => expect(roll).toHaveBeenLastCalledWith(10, 'void'));
    await waitFor(() =>
      expect(screen.getByTestId('surprise-mod-name').textContent).toBe('Void Mod'),
    );
    expect(screen.queryByTestId('surprise-theme-void')).toBeNull();
  });

  it('a typed seed shows that seed’s mod; a bad one is ignored', async () => {
    const { roll, user } = renderDialog();
    await screen.findByTestId('surprise-mod-name');
    const seed = screen.getByTestId('surprise-seed');
    await user.clear(seed);
    await user.type(seed, '4242');
    await waitFor(() => expect(roll).toHaveBeenLastCalledWith(4242, null));
    roll.mockClear();
    await user.clear(seed);
    await user.type(seed, 'abc');
    expect(roll).not.toHaveBeenCalled();
  });

  it('shows why Make it failed and keeps the dialog open; Cancel closes it', async () => {
    const roll = vi.fn(async (seed: number, themeId: string | null) => fakeMod(seed, themeId));
    const onClose = vi.fn();
    render(
      <SurpriseDialog
        roll={roll}
        onMake={async () => {
          throw new Error('The folder is not empty.');
        }}
        onClose={onClose}
        newMod
        seed={3}
      />,
    );
    const user = userEvent.setup();
    await screen.findByTestId('surprise-mod-name');
    await user.click(screen.getByTestId('surprise-make'));
    expect((await screen.findByTestId('surprise-error')).textContent).toBe(
      'The folder is not empty.',
    );
    await user.click(screen.getByTestId('surprise-cancel'));
    expect(onClose).toHaveBeenCalled();
  });

  it('rolls a real mod with pictures through the session', async () => {
    const { session } = await aiSession();
    const project = session.snapshot.project as Project;
    const roll = (seed: number, themeId: string | null) =>
      rollSurprise({
        seed,
        themeId,
        starters: session.library.starters,
        target: session.target,
        namespace: 'demo',
        project,
        isKnownKind: (kind) => session.registry.get(kind) !== undefined,
        rules: true,
      });
    render(
      <SurpriseDialog
        roll={roll}
        onMake={async () => {}}
        onClose={() => {}}
        newMod={false}
        seed={5}
      />,
    );
    await screen.findByTestId('surprise-mod-name');
    expect(screen.getAllByTestId(/^surprise-thing-/).length).toBeGreaterThanOrEqual(3);
    const pictures = screen.getByTestId('surprise-dialog').querySelectorAll('img');
    expect(pictures.length).toBeGreaterThan(0);
    expect(pictures[0]?.getAttribute('src')).toMatch(/^data:image\/png;base64,/);
  });
});

describe('Creator: Pick for me', () => {
  it('fills every field with answers that work and keeps Create available', async () => {
    const { session } = await aiSession();
    render(
      <CreatorDialog
        session={session}
        project={session.snapshot.project as Project}
        namespaces={['demo']}
        edit={null}
        folders={session.target.folders.resource}
        readProjectAsset={async () => null}
        vanilla={null}
        onClose={() => {}}
        onCreated={() => {}}
        webgl={false}
        debounceMs={5}
        pickSeed={() => 12345}
      />,
    );
    const user = userEvent.setup();
    await user.click(screen.getByTestId('creator-flow-food'));
    const name = screen.getByTestId('param-food_name') as HTMLInputElement;
    expect(name.value).toBe('Ruby Apple');
    await user.click(screen.getByTestId('creator-pick-for-me'));
    await waitFor(() => expect(name.value).not.toBe('Ruby Apple'));
    expect(screen.queryByTestId('param-food_name-error')).toBeNull();
    await waitFor(() =>
      expect((screen.getByTestId('creator-create') as HTMLButtonElement).disabled).toBe(false),
    );
  });
});
