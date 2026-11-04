// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Tooltip } from 'radix-ui';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  describeInstallTarget,
  type InstallTargetOption,
} from '../../src/renderer/src/components/install-target';
import { Toolbar, type ToolbarProps } from '../../src/renderer/src/components/Toolbar';

afterEach(cleanup);

function props(overrides: Partial<ToolbarProps> = {}): ToolbarProps {
  return {
    hasProject: true,
    canUndo: false,
    canRedo: false,
    undoLabel: undefined,
    redoLabel: undefined,
    saveDisabledReason: null,
    canAddElement: true,
    onNew: vi.fn(),
    onOpen: vi.fn(),
    onSave: vi.fn(),
    onUndo: vi.fn(),
    onRedo: vi.fn(),
    onAddNamespace: vi.fn(),
    onAddElement: vi.fn(),
    ...overrides,
  };
}

function renderToolbar(p: ToolbarProps) {
  return render(
    <Tooltip.Provider>
      <Toolbar {...p} />
    </Tooltip.Provider>,
  );
}

function button(name: string): HTMLButtonElement {
  return screen.getByRole('button', { name }) as HTMLButtonElement;
}

describe('Toolbar', () => {
  it('disables Save, Add namespace and Add element without a project', () => {
    renderToolbar(
      props({ hasProject: false, canAddElement: false, saveDisabledReason: 'No project is open.' }),
    );
    expect(button('Save').disabled).toBe(true);
    expect(button('Add namespace').disabled).toBe(true);
    expect(button('Add element').disabled).toBe(true);
    expect(button('New').disabled).toBe(false);
    expect(button('Open').disabled).toBe(false);
  });

  it('enables Save with a project and reports clicks', async () => {
    const p = props({ canUndo: true, undoLabel: 'Add element' });
    renderToolbar(p);
    expect(button('Save').disabled).toBe(false);
    expect(button('Redo').disabled).toBe(true);
    const user = userEvent.setup();
    await user.click(button('Save'));
    await user.click(button('Undo'));
    expect(p.onSave).toHaveBeenCalledOnce();
    expect(p.onUndo).toHaveBeenCalledOnce();
  });

  it('keeps New blank and offers starters and examples on the split arrow', async () => {
    const onNewFromStarter = vi.fn();
    const onExamples = vi.fn();
    const p = props({ onNewFromStarter, onExamples });
    renderToolbar(p);
    const user = userEvent.setup();
    await user.click(screen.getByTestId('toolbar-new-project'));
    expect(p.onNew).toHaveBeenCalledOnce();
    const arrow = screen.getByTestId('toolbar-new-menu');
    expect(arrow.getAttribute('aria-label')).toBe('More ways to start a project');
    await user.click(arrow);
    await user.click(screen.getByTestId('toolbar-new-from-starter'));
    expect(onNewFromStarter).toHaveBeenCalledOnce();
    await user.click(screen.getByTestId('toolbar-new-menu'));
    await user.click(screen.getByTestId('toolbar-examples'));
    expect(onExamples).toHaveBeenCalledOnce();
    await user.click(screen.getByTestId('toolbar-new-menu'));
    await user.click(screen.getByTestId('toolbar-new-blank'));
    expect(p.onNew).toHaveBeenCalledTimes(2);
  });

  it('lists recent projects on the Open split arrow, with missing ones disabled', async () => {
    const onOpenRecent = vi.fn();
    const onRemoveRecent = vi.fn();
    const onClearRecent = vi.fn();
    const onRecentMenuOpen = vi.fn();
    renderToolbar(
      props({
        recentProjects: [
          { root: '/p/beta', name: 'Beta', openedAt: '2', exists: true },
          { root: '/p/alpha', name: 'Alpha', openedAt: '1', exists: false },
        ],
        onOpenRecent,
        onRemoveRecent,
        onClearRecent,
        onRecentMenuOpen,
      }),
    );
    const user = userEvent.setup();
    const arrow = screen.getByTestId('toolbar-open-menu');
    expect(arrow.getAttribute('aria-label')).toBe('Recent projects');
    await user.click(arrow);
    expect(onRecentMenuOpen).toHaveBeenCalledOnce();
    const beta = screen.getByTestId('recent-project-0');
    expect(beta.textContent).toContain('Beta');
    expect(beta.textContent).toContain('/p/beta');
    const alpha = screen.getByTestId('recent-project-1');
    expect(alpha.textContent).toContain('Alpha (missing)');
    expect(alpha.hasAttribute('data-disabled')).toBe(true);
    expect(screen.queryByTestId('recent-project-remove-0')).toBeNull();
    await user.click(screen.getByTestId('recent-project-remove-1'));
    expect(onRemoveRecent).toHaveBeenCalledWith('/p/alpha');
    await user.click(screen.getByTestId('toolbar-open-menu'));
    await user.click(screen.getByTestId('recent-project-0'));
    expect(onOpenRecent).toHaveBeenCalledWith('/p/beta');
    await user.click(screen.getByTestId('toolbar-open-menu'));
    await user.click(screen.getByTestId('recent-projects-clear'));
    expect(onClearRecent).toHaveBeenCalledOnce();
  });

  it('says so when there are no recent projects', async () => {
    renderToolbar(props({ recentProjects: [], onClearRecent: vi.fn() }));
    await userEvent.setup().click(screen.getByTestId('toolbar-open-menu'));
    expect(screen.getByTestId('recent-projects-empty').textContent).toBe('No recent projects');
    expect(screen.getByTestId('recent-projects-clear').hasAttribute('data-disabled')).toBe(true);
  });

  it('is a labelled toolbar', () => {
    renderToolbar(props());
    expect(screen.getByRole('toolbar', { name: 'Project' })).toBeTruthy();
  });
});

const TARGETS: InstallTargetOption[] = [
  {
    id: 'official:default',
    launcher: 'official',
    displayName: 'Official launcher',
    mcVersion: null,
    loader: null,
    gameDir: '/home/me/.minecraft',
    warnings: [],
    problems: [],
    installable: true,
  },
  {
    id: 'prism:My-Instance',
    launcher: 'prism',
    displayName: 'My Instance',
    mcVersion: '9.9-msm-test',
    loader: { kind: 'neoforge', version: '1.2.3' },
    gameDir: '/data/prism/instances/My-Instance/minecraft',
    warnings: [],
    problems: [],
    installable: true,
  },
];

describe('describeInstallTarget', () => {
  it('names the launcher, instance and version', () => {
    expect(describeInstallTarget(TARGETS[1] ?? null)).toBe(
      'Install to: Prism Launcher — My Instance (MC 9.9-msm-test)',
    );
    expect(describeInstallTarget(TARGETS[0] ?? null)).toBe('Install to: Official launcher');
    expect(describeInstallTarget(null)).toBe('No install target: choose one in Settings');
  });
});

describe('Toolbar install target', () => {
  it('shows the target sentence and switches targets through the submenu', async () => {
    const onChooseInstallTarget = vi.fn();
    const p = props({
      installTarget: TARGETS[0] ?? null,
      installTargets: TARGETS,
      onChooseInstallTarget,
      onInstall: vi.fn(),
      onInstallData: vi.fn(),
    });
    renderToolbar(p);
    const user = userEvent.setup();
    await user.click(screen.getByTestId('toolbar-install-menu'));
    const target = screen.getByTestId('install-target');
    expect(target.textContent).toBe('Install to: Official launcher');
    expect(target.getAttribute('aria-live')).toBe('polite');
    expect(screen.getByTestId('install-resource')).toBeTruthy();
    expect(screen.getByTestId('install-data')).toBeTruthy();
    await user.click(screen.getByTestId('install-target-change'));
    const item = await screen.findByTestId('install-target-prism:My-Instance');
    expect(item.getAttribute('aria-label')).toBe(
      'Install to Prism Launcher — My Instance (MC 9.9-msm-test), NeoForge 1.2.3',
    );
    expect(screen.getByTestId('install-target-official:default').getAttribute('aria-checked')).toBe(
      'true',
    );
    // happy-dom has no layout, so moving the pointer off the sub trigger closes the submenu
    // (Radix's pointer grace area is empty); click the item without a pointer move.
    fireEvent.click(item);
    expect(onChooseInstallTarget).toHaveBeenCalledExactlyOnceWith('prism:My-Instance');
  });

  it('reaches the submenu and its targets with the keyboard', async () => {
    const onChooseInstallTarget = vi.fn();
    renderToolbar(
      props({
        installTarget: null,
        installTargets: TARGETS,
        onChooseInstallTarget,
        onInstall: vi.fn(),
      }),
    );
    const user = userEvent.setup();
    screen.getByTestId('toolbar-install-menu').focus();
    await user.keyboard('{Enter}');
    expect(screen.getByTestId('install-target').textContent).toBe(
      'No install target: choose one in Settings',
    );
    const change = screen.getByTestId('install-target-change');
    change.focus();
    await user.keyboard('{ArrowRight}');
    const first = await screen.findByTestId('install-target-official:default');
    await waitFor(() => expect(document.activeElement).toBe(first));
    await user.keyboard('{ArrowDown}');
    expect(document.activeElement).toBe(screen.getByTestId('install-target-prism:My-Instance'));
    await user.keyboard('{Enter}');
    expect(onChooseInstallTarget).toHaveBeenCalledExactlyOnceWith('prism:My-Instance');
  });

  it('keeps the Install menu unchanged without a target', async () => {
    renderToolbar(props({ onInstall: vi.fn() }));
    await userEvent.setup().click(screen.getByTestId('toolbar-install-menu'));
    expect(screen.queryByTestId('install-target')).toBeNull();
    expect(screen.queryByTestId('install-target-change')).toBeNull();
    expect(screen.getByTestId('install-resource')).toBeTruthy();
  });
});
