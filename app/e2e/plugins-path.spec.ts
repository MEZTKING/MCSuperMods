/**
 * Third-party plugins (ADR 0035, ADR 0036), driven only through the UI. Each launch gets a
 * plugins folder prepared on disk before start-up, as a user would copy one in:
 *
 * 1. The sample plugin (`fixtures/sample-plugin/dist/`, built by `pnpm build`): Settings lists
 *    `sample.greetings` as loaded; New element lists "Greeting" under "Greetings"; the
 *    schema-driven form shows `message` and `colour`; the exported data pack holds the
 *    `tellraw` function and the `minecraft:load` tag entry.
 * 2. The same plugin with a manifest asking for `apiVersion: "^0.8.0"`: refused with
 *    `plugin.api-incompatible`, and its template is not offered.
 * 3. A hand-written bundle whose `lower` never returns: the worker is stopped at the `lower`
 *    deadline (2 s); Settings shows the plugin as failed with `plugin.timeout`, the Problems
 *    panel shows a `plugin.unavailable` error on the element and the exports are disabled.
 */

import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defaultTargetId, targetById } from '@msm/targets';
import { strFromU8, unzipSync } from 'fflate';
import { expect, type Locator, type Page, test } from 'playwright/test';
import {
  ensureSamplePluginBuilt,
  installPlugin,
  type LaunchedApp,
  launchApp,
  openDockTab,
  outputDir,
  samplePluginDist,
} from './fixtures';

const PLUGIN_ID = 'sample.greetings';
const PLUGIN_FOLDER = 'greetings';
const MESSAGE = 'Hello from the e2e test!';

let base: string | undefined;
const launches: LaunchedApp[] = [];

test.beforeAll(() => {
  ensureSamplePluginBuilt();
});

test.afterEach(async () => {
  for (const launched of launches.splice(0)) await launched.close();
  if (base !== undefined) rmSync(base, { recursive: true, force: true });
  base = undefined;
});

/** Fresh folders for one launch; the project folder name becomes the namespace. */
function foldersFor(namespace: string): { projectDir: string; outDir: string; msmHome: string } {
  base = mkdtempSync(join(tmpdir(), 'msm-plugins-'));
  mkdirSync(outputDir, { recursive: true });
  return {
    projectDir: join(base, namespace),
    outDir: join(base, 'out'),
    msmHome: join(base, 'msm-home'),
  };
}

/** The sample plugin's manifest, as built. */
function sampleManifest(): Record<string, unknown> {
  return JSON.parse(readFileSync(join(samplePluginDist, 'msm-plugin.json'), 'utf8')) as Record<
    string,
    unknown
  >;
}

/** Opens Settings and returns its Plugins section. */
async function openPluginSettings(window: Page): Promise<Locator> {
  await window.getByTestId('toolbar-settings').click();
  const settings = window.getByTestId('settings-dialog');
  await expect(settings).toBeVisible();
  const section = settings.getByTestId('settings-plugins');
  await section.scrollIntoViewIfNeeded();
  await expect(section).toBeVisible();
  return section;
}

async function closeSettings(window: Page): Promise<void> {
  await window.getByTestId('settings-close').click();
  await expect(window.getByTestId('settings-dialog')).toBeHidden();
}

/** The Problems panel's rows of `severity` (opens the panel). */
async function problemRows(window: Page, severity: 'error' | 'warning'): Promise<Locator> {
  await openDockTab(window, 'problems');
  const problems = window.getByTestId('problems-panel');
  await expect(problems).toBeVisible();
  return problems.locator(`[data-testid="problem-row"][data-severity="${severity}"]`);
}

/** Opens the export chevron menu and returns the item `testId` (the menu stays open). */
async function exportItem(window: Page, testId: string): Promise<Locator> {
  await window.getByTestId('toolbar-export-menu').click();
  const item = window.getByTestId(testId);
  await expect(item).toBeVisible();
  return item;
}

/** Adds an element from the template `templateId` named `name` through New element. */
async function addElement(
  window: Page,
  group: string,
  templateId: string,
  name: string,
): Promise<void> {
  await window.getByTestId('toolbar-add-element').click();
  const dialog = window.getByTestId('new-element-dialog');
  await expect(dialog).toBeVisible();
  const template = dialog
    .getByTestId(`template-group-${group}`)
    .getByTestId(`template-${templateId}`);
  await expect(template).toBeVisible();
  await template.check();
  await dialog.getByTestId('new-element-name').fill(name);
  await dialog.getByTestId('new-element-dialog-submit').click();
  await expect(dialog).toBeHidden();
}

test('plugins: the sample plugin loads, its kind has a schema form and exports', async () => {
  const namespace = 'greet_e2e';
  const folders = foldersFor(namespace);
  installPlugin(folders.msmHome, PLUGIN_FOLDER, samplePluginDist);

  const launched = await launchApp({ reuse: folders });
  launches.push(launched);
  const { window } = launched;
  await window.waitForLoadState('domcontentloaded');

  // Settings > Plugins lists the plugin as loaded, with no problems.
  const section = await openPluginSettings(window);
  const row = section.getByTestId(`plugin-${PLUGIN_ID}`);
  await expect(row).toBeVisible();
  await expect(row).toContainText('Greetings');
  await expect(row).toContainText(String(sampleManifest().version));
  await expect(section.getByTestId(`plugin-${PLUGIN_ID}-state`)).toHaveText('Loaded');
  await expect(row.locator('li')).toHaveCount(0);
  await closeSettings(window);

  // A blank project: the greeting is its only data pack content, so the data pack export
  // must see the plugin's (asynchronous) lowering.
  await window.getByTestId('toolbar-new-project').click();
  await expect(window.getByTestId(`element-row-${namespace}:pack`)).toBeVisible();

  // New element offers the plugin's template under its own category.
  await addElement(window, 'greetings', 'sample-greeting', 'hello');
  const elementId = `${namespace}:hello`;
  await expect(window.getByTestId(`element-row-${elementId}`)).toBeVisible();

  // The generic form comes from the plugin's mcdoc schema.
  await window.getByTestId(`element-row-${elementId}`).click();
  await window.getByTestId('editor-tab-form').click();
  const form = window.getByTestId('schema-form');
  const message = form.getByLabel('message', { exact: true });
  const colour = form.getByLabel('colour', { exact: true });
  await expect(message).toBeVisible();
  await expect(message).toHaveValue(`Hello from hello!`);
  await expect(colour).toHaveValue('gold');
  await message.fill(MESSAGE);
  await message.press('Tab');
  await expect(message).toHaveValue(MESSAGE);

  await expect(await problemRows(window, 'error')).toHaveCount(0);
  await expect(window.locator('footer').getByText(/^0 error\(s\)/)).toBeVisible();

  // The data pack carries the greeting function and the load tag entry.
  const dataItem = await exportItem(window, 'export-data-zip');
  await expect(dataItem).not.toHaveAttribute('data-disabled', /.*/);
  await dataItem.click();
  const zips = (): string[] => readdirSync(folders.outDir).filter((name) => name.endsWith('.zip'));
  await expect.poll(zips, { timeout: 20_000 }).toHaveLength(1);
  const files = unzipSync(new Uint8Array(readFileSync(join(folders.outDir, zips()[0] ?? ''))));
  // New projects use the default (newest release) target; the status bar shows it.
  await expect(window.getByTestId('project-target')).toHaveText(defaultTargetId);
  const projectTarget = targetById(defaultTargetId)?.target;
  if (projectTarget === undefined) throw new Error('No default target.');
  const functionFolder = projectTarget.folders.data.function;
  const tagsFolder = projectTarget.folders.data.tags;
  const fn = files[`data/${namespace}/${functionFolder}/greet_hello.mcfunction`];
  expect(fn, 'the greeting function is in the data pack').toBeDefined();
  expect(strFromU8(fn ?? new Uint8Array())).toBe(
    `tellraw @a {"text": ${JSON.stringify(MESSAGE)}, "color": "gold"}\n`,
  );
  const loadTag = JSON.parse(
    strFromU8(
      files[`data/minecraft/${tagsFolder}/${functionFolder}/load.json`] ?? new Uint8Array(),
    ),
  ) as { values?: string[] };
  expect(loadTag.values).toEqual([`${namespace}:greet_hello`]);

  // The plugin's exporter is under More exports; its option is asked in a dialog, and the
  // file is written by the plugin's worker into the picked folder (MSM_E2E_OUT_DIR).
  await window.getByTestId('toolbar-export-menu').click();
  // Keyboard, as in worldgen-path: moving the pointer into the submenu can close it.
  const more = window.getByTestId('export-more');
  await expect(more).toBeVisible();
  await more.focus();
  await window.keyboard.press('ArrowRight');
  const pluginExport = window.getByTestId('export-plugin-sample-greeting-list');
  await expect(pluginExport).toHaveText('Greeting list into a folder…');
  await pluginExport.focus();
  await window.keyboard.press('Enter');
  const exportDialog = window.getByTestId('plugin-export-dialog');
  await expect(exportDialog.getByTestId('exporter-option-sorted')).toBeChecked();
  await exportDialog.getByRole('button', { name: 'Export…' }).click();
  const listFile = join(folders.outDir, 'greetings.txt');
  await expect.poll(() => existsSync(listFile), { timeout: 20_000 }).toBe(true);
  expect(readFileSync(listFile, 'utf8')).toBe(
    `${namespace}:greet_hello: tellraw @a {"text": ${JSON.stringify(MESSAGE)}, "color": "gold"}\n`,
  );

  // The same exporter under File > More Exports (the menu entry opens the same dialog).
  await expect
    .poll(() =>
      launched.app.evaluate(({ Menu }) => {
        const file = Menu.getApplicationMenu()?.items.find((item) => item.label === 'File');
        const more = file?.submenu?.items.find((item) => item.label === 'More Exports');
        return more?.submenu?.items.map((item) => item.label) ?? [];
      }),
    )
    .toContain('Greeting list into a folder…');
  await launched.app.evaluate(({ Menu, BrowserWindow }) => {
    const file = Menu.getApplicationMenu()?.items.find((item) => item.label === 'File');
    const more = file?.submenu?.items.find((item) => item.label === 'More Exports');
    const entry = more?.submenu?.items.find(
      (item) => item.label === 'Greeting list into a folder…',
    );
    if (entry === undefined) throw new Error('File > More Exports has no plugin exporter.');
    entry.click(undefined, BrowserWindow.getAllWindows()[0], undefined);
  });
  await expect(window.getByTestId('plugin-export-dialog')).toBeVisible();
  await window.getByTestId('plugin-export-dialog').getByRole('button', { name: 'Cancel' }).click();
  await expect(window.getByTestId('plugin-export-dialog')).toBeHidden();

  await window.screenshot({ path: join(outputDir, 'plugins-path.png') });
  await window.getByTestId('toolbar-save').click();
  await expect(window.locator('footer').getByText('Saved', { exact: true })).toBeVisible();
});

test('plugins: a manifest asking for an incompatible API range is refused', async () => {
  const folders = foldersFor('refused_e2e');
  installPlugin(folders.msmHome, PLUGIN_FOLDER, samplePluginDist, {
    'msm-plugin.json': `${JSON.stringify({ ...sampleManifest(), apiVersion: '^0.8.0' }, null, 2)}\n`,
  });

  const launched = await launchApp({ reuse: folders });
  launches.push(launched);
  const { window } = launched;
  await window.waitForLoadState('domcontentloaded');

  const section = await openPluginSettings(window);
  const row = section.getByTestId(`plugin-${PLUGIN_ID}`);
  await expect(row).toBeVisible();
  await expect(section.getByTestId(`plugin-${PLUGIN_ID}-state`)).toHaveText('Refused');
  await expect(row).toContainText('plugin.api-incompatible');
  await expect(row).toContainText('^0.8.0');
  await closeSettings(window);

  // Nothing of the plugin is registered: New element has no Greetings group.
  await window.getByTestId('toolbar-new-project').click();
  await expect(window.getByTestId('element-row-refused_e2e:pack')).toBeVisible();
  await window.getByTestId('toolbar-add-element').click();
  const dialog = window.getByTestId('new-element-dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByTestId('template-sample-greeting')).toHaveCount(0);
  await expect(dialog.getByTestId('template-group-greetings')).toHaveCount(0);
  await window.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
});

/**
 * A hand-written plugin bundle (plain ES2022, no imports) whose `lower` never returns. It
 * reuses the sample plugin's schema export, so it is in the `sample` namespace.
 */
const LOOPING_BUNDLE = `defineMsmPlugin({
  id: 'sample.spinner',
  apiVersion: '^1.0.0',
  contributes: {
    elementKinds: [{
      id: 'sample:spinner',
      schema: '::sample::greeting::Greeting',
      folder: 'spinner',
      defaultData: { message: 'Round and round' },
      lower() { for (;;) {} },
    }],
    elementTemplates: [{
      id: 'sample-spinner',
      kind: 'sample:spinner',
      title: 'Spinner',
      description: 'Never finishes lowering.',
      category: 'Spinners',
      defaultName: 'spin',
      data() { return { message: 'Round and round' }; },
    }],
  },
});
`;

test('plugins: a lower call that never returns stops the plugin and blocks export', async () => {
  const namespace = 'spin_e2e';
  const folders = foldersFor(namespace);
  installPlugin(folders.msmHome, 'spinner', null, {
    'msm-plugin.json': `${JSON.stringify(
      {
        manifestVersion: 1,
        id: 'sample.spinner',
        name: 'Spinner',
        version: '0.0.1',
        apiVersion: '^1.0.0',
        main: 'main.js',
        schemas: ['symbols.json'],
        capabilities: ['elementKinds', 'elementTemplates'],
      },
      null,
      2,
    )}\n`,
    'main.js': LOOPING_BUNDLE,
    'symbols.json': readFileSync(join(samplePluginDist, 'symbols.json'), 'utf8'),
  });

  const launched = await launchApp({ reuse: folders });
  launches.push(launched);
  const { window } = launched;
  await window.waitForLoadState('domcontentloaded');

  // It loads: nothing has called lower yet.
  let section = await openPluginSettings(window);
  await expect(section.getByTestId('plugin-sample.spinner-state')).toHaveText('Loaded');
  await closeSettings(window);

  await window.getByTestId('toolbar-new-project').click();
  await expect(window.getByTestId(`element-row-${namespace}:pack`)).toBeVisible();
  await addElement(window, 'spinners', 'sample-spinner', 'spin');
  const elementId = `${namespace}:spin`;
  await expect(window.getByTestId(`element-row-${elementId}`)).toBeVisible();

  // The first lower call passes its 2 s deadline: the worker is stopped, and the element
  // cannot be exported until the app restarts.
  const errors = await problemRows(window, 'error');
  const unavailable = errors.and(window.locator('[data-code="plugin.unavailable"]'));
  await expect(unavailable).toHaveCount(1);
  await expect(unavailable).toContainText(elementId);
  await expect(unavailable).toContainText('sample.spinner');

  for (const testId of ['export-data-zip', 'export-resource-zip']) {
    const item = await exportItem(window, testId);
    await expect(item).toHaveAttribute('data-disabled', /.*/);
    await expect(window.getByTestId(`${testId}-reason`)).toContainText(/Fix \d+ error/);
    await window.keyboard.press('Escape');
  }

  section = await openPluginSettings(window);
  await expect(section.getByTestId('plugin-sample.spinner-state')).toHaveText('Failed');
  await expect(section.getByTestId('plugin-sample.spinner')).toContainText('plugin.timeout');
  await window.screenshot({ path: join(outputDir, 'plugins-path-timeout.png') });
  await closeSettings(window);

  await window.getByTestId('toolbar-save').click();
  await expect(window.locator('footer').getByText('Saved', { exact: true })).toBeVisible();
});
