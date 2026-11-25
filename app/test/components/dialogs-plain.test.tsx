// @vitest-environment happy-dom
/**
 * The export, install and other dialogs in plain words (plan B716, ADR 0130 D2, D3): each opens
 * with one line saying what it does; its default view, every More options closed, passes
 * `expectPlain`; mod ids, versions, paths and raw names sit in the dialog's own More options,
 * and every old field is there once it is open. Change id and Where this is used are expert
 * bodies: only their titles and first lines are plain. Test in Minecraft's **Create test
 * instance** goes through the instance offer card (`offerTestInstance`).
 */
import type { Modpack, Project, ResourceLocation } from '@msm/core';
import { createFabricContentJarExporter } from '@msm/exporters';
import type { MigrationReport, TargetFacts } from '@msm/plugin-api';
import { builtInTargets } from '@msm/targets';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { ReactElement } from 'react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { ExportFabricJarDialog } from '../../src/renderer/src/components/ExportFabricJarDialog';
import { ExportJavaProjectDialog } from '../../src/renderer/src/components/ExportJavaProjectDialog';
import ExportMapDialog from '../../src/renderer/src/components/ExportMapDialog';
import { ImportAssetsDialog } from '../../src/renderer/src/components/ImportAssetsDialog';
import {
  BLOCKBENCH_IMPORT_NOTE,
  BLOCKBENCH_IMPORT_SUMMARY,
  ImportFilesDialog,
} from '../../src/renderer/src/components/ImportFilesDialog';
import type { InstallTargetOption } from '../../src/renderer/src/components/install-target';
import { ModpacksDialog } from '../../src/renderer/src/components/ModpacksDialog';
import { PluginExportDialog } from '../../src/renderer/src/components/PluginExportDialog';
import {
  RENAME_TITLE,
  RenameElementDialog,
} from '../../src/renderer/src/components/RenameElementDialog';
import {
  offerTestInstance,
  TestInMinecraftDialog,
  type TestInstanceOfferHost,
} from '../../src/renderer/src/components/TestInMinecraftDialog';
import { UpgradeTargetDialog } from '../../src/renderer/src/components/UpgradeTargetDialog';
import { USAGES_TITLE, UsagesDialog } from '../../src/renderer/src/components/UsagesDialog';
import type { ProjectSession } from '../../src/renderer/src/session/project-session';
import type { InstanceOfferInput } from '../../src/renderer/src/store/instances-store';
import type {
  InstancePlan,
  InstancePlanRequest,
  MapsPlatform,
  ModpackView,
  PlatformAdapter,
  TestInMinecraftStatus,
} from '../../src/shared/platform';
import { expectPlain } from './plain-sweep';

const targets = builtInTargets.map((entry) => entry.target) as TargetFacts[];
const target = targets[targets.length - 1] as TargetFacts;
const other = targets.find((entry) => entry.id !== target.id) as TargetFacts;

beforeAll(() => {
  // The default view: every More options closed (the test setup opens them).
  window.msmMoreOptionsOpen = false;
});
afterEach(() => {
  cleanup();
  globalThis.localStorage?.clear();
});
afterAll(() => {
  window.msmMoreOptionsOpen = true;
});

/** Opens the dialog's More options (`dialog-<key>`) and returns its content. */
function openMore(key: string): HTMLElement {
  fireEvent.click(screen.getByTestId(`more-options-dialog-${key}`));
  return screen.getByTestId(`more-options-dialog-${key}-content`);
}

// The dialogs' inputs --------------------------------------------------------------------

const jarOptions = createFabricContentJarExporter().options ?? [];

const maps: MapsPlatform = {
  listWorlds: async () => [
    {
      id: 'msm-play',
      name: 'MCSuperMods Test',
      managed: true,
      worlds: [{ dir: 'msm-test', name: 'Test world', lastModified: '2026-11-24T10:00:00Z' }],
    },
  ],
  listStructureSaves: async () => [],
  exportMap: async () => null,
} as unknown as MapsPlatform;

const sodium = {
  projectId: 'AANobbMI',
  versionId: 'VERSION1',
  title: 'Sodium',
  fileName: 'sodium-fabric-0.6.2+mc26.3.jar',
  url: 'https://cdn.modrinth.com/data/AANobbMI/versions/VERSION1/sodium.jar',
  sha1: 'a'.repeat(40),
  sha512: 'b'.repeat(128),
  size: 42,
};

const modpack: Modpack = {
  formatVersion: 1,
  name: 'Ruby pack',
  version: '1.0.0',
  summary: 'Gems and more',
  targetId: target.id,
  projects: [{ path: '../ruby' }, { path: '../old' }],
  mods: [sodium],
};

const modpackView: ModpackView = {
  root: '/home/me/packs/ruby',
  modpack,
  members: [
    { path: '../ruby', root: '/home/me/ruby', found: true, name: 'Ruby mod', targetId: target.id },
    { path: '../old', root: '/home/me/old', found: true, name: 'Old mod', targetId: other.id },
  ],
};

const modpacks = {
  list: async () => [{ root: modpackView.root, name: modpack.name, found: true }],
  read: async () => modpackView,
  create: async () => null,
  addExisting: async () => null,
  forget: async () => {},
  write: async () => modpackView,
  addProject: async () => null,
  readProject: async () => [],
  lookupMod: async () => {
    throw new Error('offline');
  },
} as NonNullable<PlatformAdapter['modpacks']>;

const testStatus: TestInMinecraftStatus = {
  mcVersion: target.mcVersion,
  loader: '0.17.2',
  api: '0.130.0+26.3',
  location: {
    ref: { launcher: 'prism', root: '/home/me/prism', instance: 'My-Instance' },
    id: 'prism:My-Instance',
    displayName: 'My Instance',
    mcVersion: target.mcVersion,
    loader: { kind: 'fabric', version: '0.17.2' },
    gameDir: '/home/me/prism/instances/My-Instance/minecraft',
    modsDir: '/home/me/prism/instances/My-Instance/minecraft/mods',
    problems: [],
    warnings: [],
  },
  mode: 'launch',
  reason: null,
  launcherProgram: null,
  managedInstanceName: `MCSuperMods Test (${target.mcVersion})`,
  managedInstanceSelected: false,
  canCreateInstance: true,
};

const report: MigrationReport = {
  changes: [{ elementId: 'demo:ruby', description: 'Its sound moved', data: {} }],
  problems: [
    { severity: 'warning', code: 'target.check', message: 'Check by hand', elementId: 'demo:gem' },
  ],
};

/** Each dialog with plain words by default, and the old test ids found under More options. */
const DIALOGS: {
  name: string;
  render(): ReactElement;
  /** Waits until the dialog has loaded (lists from main). */
  ready?(): Promise<unknown>;
  /** Before More options: clicks that show the part being checked. */
  show?(): Promise<void>;
  intro: string;
  more: string;
  /** Old test ids reachable once More options is open. */
  inMore: string[];
}[] = [
  {
    name: 'Save the mod as a file',
    render: () => (
      <ExportFabricJarDialog
        options={jarOptions}
        hasEntities
        needsGeckolib
        onExport={vi.fn()}
        onClose={vi.fn()}
      />
    ),
    intro: 'fabric-jar-dialog-intro',
    more: 'fabric-jar',
    inMore: ['exporter-option-separateRuntime', 'fabric-jar-requirements'],
  },
  {
    name: 'Export Java project',
    render: () => (
      <ExportJavaProjectDialog
        scripts={['demo:glow']}
        rules={[{ bookId: 'demo:rules', key: 'sneaky', label: 'Sneaky gift' }]}
        onExport={vi.fn()}
        onClose={vi.fn()}
      />
    ),
    intro: 'java-project-dialog-intro',
    more: 'java-project',
    inMore: ['java-project-note', 'java-project-scripts-note', 'java-project-rule-books'],
  },
  {
    name: 'Export as a map',
    render: () => (
      <ExportMapDialog
        maps={maps}
        target={target}
        namespace="demo"
        projectName="Ruby Sky"
        build={vi.fn()}
        onDone={vi.fn()}
        onClose={vi.fn()}
      />
    ),
    ready: () => screen.findByTestId('export-map-source'),
    intro: 'export-map-dialog-intro',
    more: '',
    inMore: [],
  },
  {
    name: 'A plugin export',
    render: () => (
      <PluginExportDialog
        displayName="Greeting list"
        options={[{ id: 'sorted', label: 'Sorted', type: 'boolean', default: true }]}
        onExport={vi.fn()}
        onClose={vi.fn()}
      />
    ),
    intro: 'plugin-export-dialog-intro',
    more: '',
    inMore: [],
  },
  {
    name: 'Modpacks',
    render: () => (
      <ModpacksDialog
        session={{} as ProjectSession}
        modpacks={modpacks}
        testInMinecraft={{} as PlatformAdapter['testInMinecraft']}
        saveFile={async () => null}
        targets={targets}
        currentProjectRoot="/home/me/ruby"
        defaultTargetId={target.id}
        onOpenProject={vi.fn()}
        onClose={vi.fn()}
      />
    ),
    show: async () => {
      fireEvent.click(await screen.findByTestId('modpack-entry'));
      await screen.findByTestId('modpack-details');
    },
    intro: 'modpacks-dialog-intro',
    more: 'modpacks',
    inMore: [
      'modpack-version',
      'modpack-summary',
      'modpack-folder',
      'modpack-member-paths',
      'modpack-mod-files',
    ],
  },
  {
    name: 'Test in Minecraft',
    render: () => (
      <TestInMinecraftDialog
        load={async () => testStatus}
        createInstance={async () => testStatus}
        pickLauncherProgram={async () => null}
        onRun={vi.fn()}
        onOpenSettings={vi.fn()}
        onClose={vi.fn()}
      />
    ),
    ready: () => screen.findByTestId('test-in-minecraft-game'),
    intro: 'test-in-minecraft-intro',
    more: 'test-in-minecraft',
    inMore: ['test-in-minecraft-location', 'test-in-minecraft-needs', 'test-in-minecraft-program'],
  },
  {
    name: 'Move to another Minecraft version',
    render: () => (
      <UpgradeTargetDialog
        currentTargetId={target.id}
        targets={targets}
        preview={async () => report}
        onUpgrade={vi.fn()}
        onCancel={vi.fn()}
      />
    ),
    ready: () => screen.findByTestId('upgrade-target-summary'),
    intro: 'upgrade-target-intro',
    more: 'upgrade-target',
    inMore: ['upgrade-target-ids'],
  },
  {
    name: 'Bring in pictures or sounds',
    render: () => (
      <ImportAssetsDialog
        namespaces={['demo', 'minecraft']}
        onImport={vi.fn()}
        onCancel={vi.fn()}
      />
    ),
    intro: 'import-assets-intro',
    more: 'import-assets',
    inMore: [
      'import-assets-namespace',
      'import-assets-folder-custom',
      'import-assets-folder-shaders',
    ],
  },
  {
    name: 'Import Blockbench model',
    render: () => (
      <ImportFilesDialog
        title="Import Blockbench model"
        namespaces={['demo']}
        importers={[
          {
            id: 'msm:blockbench',
            displayName: 'Blockbench model (.bbmodel, .geo.json, .animation.json)',
            extensions: ['bbmodel', 'json'],
          },
        ]}
        summary={BLOCKBENCH_IMPORT_SUMMARY}
        note={BLOCKBENCH_IMPORT_NOTE}
        onImport={vi.fn()}
        onCancel={vi.fn()}
      />
    ),
    intro: 'import-files-intro',
    more: 'import-files',
    inMore: ['import-files-namespace', 'import-files-importers', 'import-files-note'],
  },
  {
    name: 'Import structure, from my test worlds',
    render: () => (
      <ImportFilesDialog
        title="Import structure"
        namespaces={['demo']}
        importers={[{ id: 'msm:nbt', displayName: 'Structure', extensions: ['nbt'] }]}
        onImport={vi.fn()}
        onCancel={vi.fn()}
        testWorlds={{
          list: async () => [
            {
              world: 'msm-game-demo',
              id: 'demo:houses/tower',
              size: 10,
              lastModified: '2026-11-24T10:00:00Z',
            },
          ],
          importSaves: async () => null,
        }}
      />
    ),
    show: async () => {
      fireEvent.click(screen.getByTestId('import-files-tab-test-worlds'));
      await screen.findByTestId('import-test-worlds-list');
    },
    intro: 'import-files-intro',
    more: 'import-files',
    inMore: ['import-files-namespace', 'import-test-worlds-ids'],
  },
];

describe('the dialogs in plain words (plan B716)', () => {
  for (const dialog of DIALOGS) {
    it(`${dialog.name}: one plain first line, plain by default, the rest under More options`, async () => {
      render(dialog.render());
      await dialog.ready?.();
      await dialog.show?.();
      expect(screen.getByTestId(dialog.intro).textContent?.length).toBeGreaterThan(20);
      expectPlain(document.body);
      for (const id of dialog.inMore) expect(screen.queryByTestId(id), id).toBeNull();
      if (dialog.more === '') return;
      const more = openMore(dialog.more);
      for (const id of dialog.inMore)
        expect(within(document.body).getByTestId(id), id).toBeTruthy();
      expect(more).toBeTruthy();
    });
  }

  it('titles say mod, never project', async () => {
    for (const dialog of DIALOGS) {
      render(dialog.render());
      await dialog.ready?.();
      const heading = within(screen.getByRole('dialog')).getAllByRole('heading')[0] as HTMLElement;
      if (dialog.name !== 'Export Java project') {
        expect(heading.textContent?.toLowerCase(), dialog.name).not.toContain('project');
      }
      cleanup();
    }
  });

  it('shows the ids of an upgrade only with More options open', async () => {
    render(
      <UpgradeTargetDialog
        currentTargetId={target.id}
        targets={targets}
        preview={async () => report}
        onUpgrade={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    const changes = await screen.findByTestId('upgrade-target-changes');
    expect(changes.textContent).toBe('Its sound moved');
    openMore('upgrade-target');
    expect(screen.getByTestId('upgrade-target-changes').textContent).toBe(
      'demo:ruby: Its sound moved',
    );
    expect(screen.getByTestId('upgrade-target-problems-warning').textContent).toBe(
      'demo:gem: Check by hand',
    );
    expect(screen.getByTestId(`upgrade-target-${other.id}`).textContent).toContain(other.id);
    // Closed again: the ids go.
    fireEvent.click(screen.getByTestId('more-options-dialog-upgrade-target'));
    expect(screen.getByTestId('upgrade-target-changes').textContent).toBe('Its sound moved');
  });

  it('Change id: a plain title and what changing an id means; the body shows the id', () => {
    render(
      <RenameElementDialog
        id={'demo:ruby' as ResourceLocation}
        references={2}
        onCancel={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );
    const dialog = screen.getByTestId('rename-dialog');
    expect(within(dialog).getByRole('heading').textContent).toBe(RENAME_TITLE);
    expectPlain(within(dialog).getByRole('heading'));
    const intro = screen.getByTestId('rename-intro');
    expectPlain(intro);
    expect(intro.textContent).toContain('commands, recipes, tags and saved worlds');
    expect(intro.textContent).toContain('lose the thing');
    expect((screen.getByTestId('rename-input') as HTMLInputElement).value).toBe('demo:ruby');
  });

  it('Where this is used: a plain title over the expert list', () => {
    render(
      <UsagesDialog
        id={'demo:ruby' as ResourceLocation}
        usages={[{ from: 'demo:recipe' as ResourceLocation, path: '/result/id' }] as never}
        onNavigate={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    const heading = within(screen.getByTestId('usages-dialog')).getByRole('heading');
    expect(heading.textContent).toBe(USAGES_TITLE);
    expectPlain(heading);
    expect(screen.getByTestId('usage-row').textContent).toContain('demo:recipe');
  });
});

// Test in Minecraft's Create test instance through the offer card ------------------------

const project: Project = {
  formatVersion: 1,
  name: 'Ruby',
  targets: [],
  plugins: [],
  settings: {},
  namespaces: [
    { name: 'minecraft', elements: [], assets: [] },
    { name: 'ruby', elements: [], assets: [] },
  ],
};

const location: InstallTargetOption = {
  id: 'prism:Mine',
  launcher: 'prism',
  displayName: 'Mine',
  mcVersion: target.mcVersion,
  loader: { kind: 'fabric', version: '0.17.2' },
  gameDir: '/home/me/prism/instances/Mine/minecraft',
  warnings: [],
  problems: [],
  installable: true,
};

function planOf(overrides: Partial<InstancePlan> = {}): InstancePlan {
  return {
    ok: true,
    recipe: { place: { kind: 'instance', name: `MCSuperMods Test (${target.mcVersion})` } },
    kind: 'test',
    title: 'Make a test game',
    sentences: [],
    launcher: 'prism',
    existing: null,
    ask: true,
    ...overrides,
  } as InstancePlan;
}

function host(
  plan: InstancePlan | null,
  outcome: Awaited<ReturnType<TestInstanceOfferHost['prepare']>>,
) {
  const requests: InstancePlanRequest[] = [];
  const prepared: InstanceOfferInput[] = [];
  const offer: TestInstanceOfferHost = {
    instances:
      plan === null
        ? undefined
        : {
            plan: async (request) => {
              requests.push(request);
              return plan;
            },
          },
    targetId: target.id,
    project,
    build: async () => ({ modId: 'ruby', data: new Uint8Array([1, 2]) }),
    locations: [location],
    prepare: async (input) => {
      prepared.push(input);
      return outcome;
    },
  };
  return { offer, requests, prepared };
}

describe("Test in Minecraft's Create test instance (B765's note)", () => {
  it('asks for the test instance and offers the card with the jar and the own games', async () => {
    const made = {
      ok: true,
      id: 'i',
      name: 'n',
      created: true,
      updated: false,
      gameDir: '',
      mods: [],
    };
    const { offer, requests, prepared } = host(planOf(), { kind: 'made', made: made as never });
    expect(await offerTestInstance(offer)).toEqual({ kind: 'create' });
    expect(requests).toEqual([
      {
        targetId: target.id,
        action: { kind: 'test' },
        project: { namespace: 'ruby', modId: 'ruby', playsWithoutMods: false },
      },
    ]);
    expect(prepared[0]?.locations).toEqual([location]);
    expect(await prepared[0]?.jars?.()).toEqual([{ modId: 'ruby', data: new Uint8Array([1, 2]) }]);
  });

  it('uses one of my own games when the card says so', async () => {
    const { offer } = host(planOf(), { kind: 'mine', locationId: 'prism:Mine' });
    expect(await offerTestInstance(offer)).toEqual({ kind: 'mine', locationId: 'prism:Mine' });
  });

  it('changes nothing when the card is closed, and says a failure in main’s words', async () => {
    expect(await offerTestInstance(host(planOf(), { kind: 'cancelled' }).offer)).toEqual({
      kind: 'cancelled',
    });
    const failed = host(planOf({ ask: false }), {
      kind: 'failed',
      failure: { ok: false, code: 'failed', message: 'Prism is busy.' },
    });
    expect(await offerTestInstance(failed.offer)).toEqual({
      kind: 'failed',
      message: 'Prism is busy.',
    });
  });

  it('goes straight on when the instance is there, or without the service', async () => {
    const existing = host(planOf({ existing: { id: 'i', name: 'n' } }), { kind: 'cancelled' });
    expect(await offerTestInstance(existing.offer)).toEqual({ kind: 'create' });
    expect(existing.prepared).toEqual([]);
    const none = host(null, { kind: 'cancelled' });
    expect(await offerTestInstance(none.offer)).toEqual({ kind: 'create' });
    expect(none.prepared).toEqual([]);
  });

  it('the dialog re-reads the status after the card (a cancelled card changes nothing)', async () => {
    const load = vi.fn(async () => testStatus);
    const createInstance = vi.fn(async () => ({ ...testStatus, managedInstanceSelected: true }));
    render(
      <TestInMinecraftDialog
        load={load}
        createInstance={createInstance}
        pickLauncherProgram={async () => null}
        onRun={vi.fn()}
        onOpenSettings={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    fireEvent.click(await screen.findByTestId('test-in-minecraft-create'));
    await vi.waitFor(() => expect(createInstance).toHaveBeenCalledTimes(1));
    await vi.waitFor(() => expect(screen.queryByTestId('test-in-minecraft-create')).toBeNull());
  });
});
