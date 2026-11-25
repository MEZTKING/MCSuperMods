// @vitest-environment happy-dom
/**
 * The upgrade report's part "If you exported a Java project" (ADR 0136 D8, B822): whether
 * MCSuperMods can eject for the newer version comes from that target; the folder is only read
 * through the platform's scan; the summary and advice follow the answer about hand edits; Save
 * upgrade notes… hands one Markdown file to the save dialog, with the build lines from both
 * targets' facts and a removed id found with its line.
 */
import type { JavaProjectScan } from '@msm/exporters';
import type { Target, TargetChangeSet } from '@msm/plugin-api';
import { builtInTargets } from '@msm/targets';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  canEjectFor,
  JavaProject,
  type SaveNotesFile,
  UPGRADE_NOTES_FILE_NAME,
} from '../../src/renderer/src/components/upgrade/parts/JavaProject';

afterEach(cleanup);

const from = builtInTargets.find((bundle) => bundle.target.loadJavaProject !== undefined)
  ?.target as Target;
const to = builtInTargets.find((bundle) => bundle.target.previous === from.id)?.target as Target;
const changeSets = [to.changes as TargetChangeSet];
const removed = changeSets[0]?.changes.find(
  (change) =>
    change.area === 'ids' &&
    change.what === 'member-removed' &&
    change.registry !== undefined &&
    !change.registry.startsWith('tag/') &&
    (change.stillIn ?? []).length === 0,
);
const removedId = `minecraft:${removed?.subject.slice((removed.registry as string).length + 1)}`;

const scanResult: JavaProjectScan = {
  folder: '/home/me/my_mod',
  files: [
    {
      path: 'gradle.properties',
      text: `minecraft_version=${from.mcVersion}\nfabric_api_version=${from.fabric?.api}\n`,
    },
    { path: 'msm.export.json', text: JSON.stringify({ minecraft: from.mcVersion }) },
    {
      path: 'src/main/resources/data/my_mod/tags/x/y.json',
      text: `{\n  "values": [\n    "${removedId}"\n  ]\n}`,
    },
  ],
  javaFiles: 3,
};

function setup(over: { to?: Target; scan?: (title: string) => Promise<JavaProjectScan | null> }) {
  const saveFile = vi.fn<SaveNotesFile>(async () => '/home/me/my_mod/UPGRADE-NOTES.md');
  const scan = vi.fn(over.scan ?? (async () => scanResult));
  render(
    <JavaProject
      from={from}
      to={over.to ?? to}
      changeSets={changeSets}
      scanJavaProject={scan}
      saveFile={saveFile}
    />,
  );
  return { saveFile, scan };
}

describe('JavaProject', () => {
  it('says from the newer target whether it can eject, reads the folder and saves the notes', async () => {
    expect(removed).toBeDefined();
    const user = userEvent.setup();
    const { saveFile, scan } = setup({});
    const canEject = canEjectFor(to);
    expect(screen.getByTestId('upgrade-java-eject').textContent).toBe(
      canEject
        ? `MCSuperMods can export a Java project for Minecraft ${to.mcVersion}.`
        : `MCSuperMods cannot export a Java project for Minecraft ${to.mcVersion} yet.`,
    );
    expect(screen.queryByTestId('upgrade-java-save')).toBeNull();
    await user.click(screen.getByTestId('upgrade-java-look'));
    expect(scan).toHaveBeenCalledWith('Choose the folder of your Java project');
    await screen.findByTestId('upgrade-java-notes');
    expect(screen.getByTestId('upgrade-java-summary').textContent).toBe(
      'In this project, 2 build lines and 1 place in its data and assets need changing.',
    );
    await user.click(screen.getByTestId('upgrade-java-save'));
    expect(saveFile).toHaveBeenCalledTimes(1);
    const call = saveFile.mock.calls[0]?.[0];
    expect(call?.defaultName).toBe(UPGRADE_NOTES_FILE_NAME);
    const markdown = new TextDecoder().decode(call?.data);
    expect(markdown).toContain(`fabric_api_version=${to.fabric?.api}`);
    expect(markdown).toContain(`minecraft_version=${to.mcVersion}`);
    expect(markdown).toContain(
      `\`src/main/resources/data/my_mod/tags/x/y.json\` line 3: \`${removedId}\``,
    );
    if (!canEject) {
      expect(markdown).toContain(`cannot export a Java project for Minecraft ${to.mcVersion} yet`);
    }
    expect(await screen.findByTestId('upgrade-java-saved')).toBeTruthy();
  });

  it('advises exporting again when the newer version can eject and the Java was not edited', async () => {
    const user = userEvent.setup();
    const ejecting = { ...to, loadJavaProject: async () => ({ generate: () => [] }) } as Target;
    setup({ to: ejecting });
    await user.click(screen.getByTestId('upgrade-java-look'));
    await screen.findByTestId('upgrade-java-notes');
    const advice = () =>
      screen.getAllByTestId('upgrade-java-advice').map((node) => node.textContent ?? '');
    expect(advice()[0]).toMatch(/^If you have not changed this project's Java by hand, export/);
    await user.click(screen.getByTestId('upgrade-java-edited-no'));
    expect(advice()).toHaveLength(1);
    expect(advice()[0]).toMatch(/^You have not changed this project's Java by hand/);
    await user.click(screen.getByTestId('upgrade-java-edited-yes'));
    expect(advice()[0]).toMatch(/^You changed this project's Java by hand/);
  });

  it('shows nothing new when the picker is cancelled, and says when the folder cannot be read', async () => {
    const user = userEvent.setup();
    setup({ scan: async () => null });
    await user.click(screen.getByTestId('upgrade-java-look'));
    await waitFor(() =>
      expect(screen.getByTestId('upgrade-java-look').hasAttribute('disabled')).toBe(false),
    );
    expect(screen.queryByTestId('upgrade-java-notes')).toBeNull();
    cleanup();
    setup({
      scan: async () => {
        throw new Error('no access');
      },
    });
    await user.click(screen.getByTestId('upgrade-java-look'));
    expect((await screen.findByTestId('upgrade-java-failed')).textContent).toBe(
      'The folder could not be read: no access',
    );
  });

  it('has no Look button without the platform scan', () => {
    render(<JavaProject from={from} to={to} changeSets={changeSets} saveFile={vi.fn()} />);
    expect(screen.queryByTestId('upgrade-java-look')).toBeNull();
  });
});
