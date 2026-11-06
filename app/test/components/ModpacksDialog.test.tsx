// @vitest-environment happy-dom
import type { Modpack } from '@msm/core';
import { builtInTargets } from '@msm/targets';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ModpacksDialog } from '../../src/renderer/src/components/ModpacksDialog';
import type { ProjectSession } from '../../src/renderer/src/session/project-session';
import type { ModpackView, PlatformAdapter } from '../../src/shared/platform';

afterEach(cleanup);

const sodium = {
  projectId: 'AANobbMI',
  versionId: 'VERSION1',
  title: 'Sodium',
  fileName: 'sodium.jar',
  url: 'https://cdn.modrinth.com/data/AANobbMI/versions/VERSION1/sodium.jar',
  sha1: 'a'.repeat(40),
  sha512: 'b'.repeat(128),
  size: 42,
};

function fakeModpacks() {
  let stored: Modpack | null = null;
  const view = (): ModpackView => ({
    root: '/packs/ruby',
    modpack: stored as Modpack,
    members: (stored?.projects ?? []).map(({ path }) => ({
      path,
      root: `/projects/${path}`,
      found: true,
      name: 'Ruby mod',
      targetId: 'mc-26.3',
    })),
  });
  const api: NonNullable<PlatformAdapter['modpacks']> = {
    list: async () =>
      stored === null ? [] : [{ root: '/packs/ruby', name: stored.name, found: true }],
    create: vi.fn(async (name: string, targetId: string) => {
      stored = { formatVersion: 1, name, version: '1.0.0', targetId, projects: [], mods: [] };
      return view();
    }),
    addExisting: async () => null,
    forget: async () => {
      stored = null;
    },
    read: async () => view(),
    write: async (_root, modpack) => {
      stored = modpack;
      return view();
    },
    addProject: vi.fn(async (_root, projectRoot) => {
      if (stored === null || projectRoot === null) return null;
      stored = { ...stored, projects: [...stored.projects, { path: '../ruby' }] };
      return view();
    }),
    readProject: async () => [],
    lookupMod: vi.fn(async (input: string) => {
      if (input === 'nope') throw new Error('Modrinth has no such project.');
      return { file: sodium, versionNumber: '0.6.2', requiredProjects: ['P7dR8mSH', 'OTHER123'] };
    }),
  };
  return api;
}

function renderDialog(api = fakeModpacks()) {
  render(
    <ModpacksDialog
      session={{} as ProjectSession}
      modpacks={api}
      testInMinecraft={{} as PlatformAdapter['testInMinecraft']}
      saveFile={async () => null}
      targets={builtInTargets.map((entry) => entry.target)}
      currentProjectRoot="/projects/ruby"
      defaultTargetId="mc-26.3"
      onOpenProject={vi.fn()}
      onClose={vi.fn()}
    />,
  );
  return api;
}

describe('ModpacksDialog', () => {
  it('creates a modpack, adds the open project and a Modrinth mod', async () => {
    const api = renderDialog();
    const user = userEvent.setup();
    expect(await screen.findByText('No modpacks yet.')).toBeTruthy();
    await user.click(screen.getByTestId('modpack-new'));
    expect(api.create).toHaveBeenCalledWith('My modpack', 'mc-26.3');
    const details = await screen.findByTestId('modpack-details');
    expect((within(details).getByTestId('modpack-name') as HTMLInputElement).value).toBe(
      'My modpack',
    );
    await user.click(screen.getByTestId('modpack-add-open-project'));
    expect(api.addProject).toHaveBeenCalledWith('/packs/ruby', '/projects/ruby');
    expect(await screen.findByText('Ruby mod')).toBeTruthy();
    await user.type(screen.getByTestId('modpack-mod-input'), 'sodium');
    await user.click(screen.getByTestId('modpack-add-mod'));
    await waitFor(() =>
      expect(screen.getByTestId('modpack-message').textContent).toBe(
        'Added Sodium 0.6.2. It also needs these Modrinth projects: OTHER123. Add them too.',
      ),
    );
    expect(within(screen.getByTestId('modpack-mods')).getByText('Sodium')).toBeTruthy();
    expect(screen.getAllByTestId('modpack-entry').map((entry) => entry.textContent)).toEqual([
      'My modpack',
    ]);
  });

  it('shows lookup errors', async () => {
    renderDialog();
    const user = userEvent.setup();
    await user.click(await screen.findByTestId('modpack-new'));
    await user.type(await screen.findByTestId('modpack-mod-input'), 'nope');
    await user.click(screen.getByTestId('modpack-add-mod'));
    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toBe('Modrinth has no such project.'),
    );
  });
});
