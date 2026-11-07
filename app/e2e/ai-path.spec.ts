/**
 * The AI helper path (ADR 0041), driven by the scripted model client (`MSM_E2E_AI_SCRIPT`, one
 * client per launch) so no key, network or SDK is involved:
 *
 * 1. Build mode with `test/fixtures/ai/ruby-tools.script.json`: a blank project, the dock tab
 *    "AI helper" opened through the palette ("Open AI helper"), Build, the ruby tools prompt,
 *    the plan with its items, "Build all", the changeset (ore, sword, pickaxe, axe, loot table,
 *    mob, placeholder textures), Apply; the sidebar shows the new elements and Problems no
 *    errors; the resource pack (toolbar) and data pack (Export menu) zips and the Fabric mod
 *    jar with "Separate runtime and GeckoLib (for modpacks)" (palette) hold the ore's model,
 *    the recipes and `msm/ruby/`; Edit > Undo removes the elements; Settings shows the key
 *    status "Key set (…e2e!)" and the privacy text.
 * 2. Chat mode with `test/fixtures/ai/explain-problem.script.json` over a copy of
 *    `fixtures/sample-mod` with one injected `blocks-items.unknown-event` error: "Explain" on
 *    the Problems row opens the panel with the context chip, the answer streams, the
 *    `update_element` fix applies and the problem disappears. The script's fix is rebuilt from
 *    the fixture's own wand data, so the spec follows changes to the sample mod.
 */

import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { strFromU8, unzipSync } from 'fflate';
import { expect, type Locator, type Page, test } from 'playwright/test';
import { appDir, type LaunchedApp, launchApp, outputDir } from './fixtures';
import { rgbaPng } from './png';

/** The project folder name; a blank project's namespace is derived from it. */
const NAMESPACE = 'ai_e2e';
const RUBY_PROMPT = 'make a ruby tools mod with ore, blocks, items, recipes, a mob';
const SCRIPTS = join(appDir, 'test', 'fixtures', 'ai');
const SAMPLE_MOD = resolve(appDir, '..', 'fixtures', 'sample-mod');
const WAND_FILE = join('content', 'msm_sample_mod', 'item', 'ruby_wand.json');
const WAND_ID = 'msm_sample_mod:ruby_wand';

/** The elements the build must create (a selection; the changeset has more). */
const BUILT = [
  'ruby:ruby_ore',
  'ruby:ruby_block',
  'ruby:ruby',
  'ruby:ruby_sword',
  'ruby:ruby_pickaxe',
  'ruby:ruby_axe',
  'ruby:blocks/ruby_block',
  'ruby:ruby_golem',
  'ruby:mod',
];

let base: string | undefined;
const launches: LaunchedApp[] = [];

test.afterEach(async () => {
  for (const launched of launches.splice(0)) await launched.close();
  if (base !== undefined) rmSync(base, { recursive: true, force: true });
  base = undefined;
});

function readZip(path: string): Record<string, Uint8Array> {
  return unzipSync(new Uint8Array(readFileSync(path)));
}

/** Whether `path` reads as a complete zip (export writes are not atomic). */
function isCompleteZip(path: string): boolean {
  try {
    readZip(path);
    return true;
  } catch {
    return false;
  }
}

function filesIn(dir: string, extension: string): string[] {
  return readdirSync(dir)
    .filter((name) => name.endsWith(extension))
    .sort();
}

/** Waits for one new file with `extension` in `dir` beyond `known`, complete, and reads it. */
async function newZip(
  dir: string,
  extension: string,
  known: readonly string[],
): Promise<{ name: string; files: Record<string, Uint8Array> }> {
  let name = '';
  await expect
    .poll(
      () => {
        name = filesIn(dir, extension).find((entry) => !known.includes(entry)) ?? '';
        return name !== '' && isCompleteZip(join(dir, name));
      },
      { timeout: 20_000 },
    )
    .toBe(true);
  return { name, files: readZip(join(dir, name)) };
}

async function openPalette(window: Page, query: string): Promise<Locator> {
  await window.keyboard.press('ControlOrMeta+Shift+P');
  const palette = window.getByTestId('command-palette');
  await expect(palette).toBeVisible();
  await palette.getByTestId('command-palette-input').fill(query);
  return palette;
}

async function errorRows(window: Page): Promise<Locator> {
  await window.getByTestId('dock-tab-problems').click();
  const problems = window.getByTestId('problems-panel');
  await expect(problems).toBeVisible();
  return problems.locator('[data-testid="problem-row"][data-severity="error"]');
}

/** Clicks Edit > Undo in the application menu. */
async function menuUndo(launched: LaunchedApp): Promise<void> {
  await launched.app.evaluate(({ Menu, BrowserWindow }) => {
    const edit = Menu.getApplicationMenu()?.items.find((item) => item.label === 'Edit');
    const undo = edit?.submenu?.items.find((item) => item.label === 'Undo');
    if (undo === undefined) throw new Error('Edit > Undo is missing.');
    undo.click(undefined, BrowserWindow.getAllWindows()[0], undefined);
  });
}

test('AI helper: build the ruby tools mod, apply, export, undo; Settings key status', async () => {
  const started = Date.now();
  base = mkdtempSync(join(tmpdir(), 'msm-ai-'));
  const folders = {
    projectDir: join(base, NAMESPACE),
    outDir: join(base, 'out'),
    msmHome: join(base, 'msm-home'),
  };
  mkdirSync(outputDir, { recursive: true });
  const launched = await launchApp({
    reuse: folders,
    aiScript: join(SCRIPTS, 'ruby-tools.script.json'),
  });
  launches.push(launched);
  const { window } = launched;
  await window.waitForLoadState('domcontentloaded');

  await window.getByTestId('toolbar-new-project').click();
  await expect(window.getByTestId(`element-row-${NAMESPACE}:pack`)).toBeVisible();

  // Open the helper through the palette and switch to Build.
  const palette = await openPalette(window, 'AI helper');
  await palette.getByTestId('command-aiHelper').click();
  await expect(palette).toBeHidden();
  await expect(window.getByTestId('dock-tab-assistant')).toHaveAttribute('aria-selected', 'true');
  const panel = window.getByTestId('ai-panel');
  await expect(panel).toBeVisible();
  await panel.getByTestId('ai-mode-build').click();
  await expect(panel.getByTestId('ai-mode-build')).toHaveAttribute('aria-pressed', 'true');

  await panel.getByTestId('ai-input').fill(RUBY_PROMPT);
  await panel.getByTestId('ai-send').click();

  // The plan lists its items; build all of them.
  const plan = panel.getByTestId('ai-plan');
  await expect(plan).toBeVisible();
  await expect(plan).toHaveAttribute('data-status', 'pending');
  for (const itemId of ['ore', 'sword', 'pickaxe', 'axe', 'block-loot', 'mob']) {
    await expect(plan.getByTestId(`ai-plan-item-${itemId}`)).toBeVisible();
  }
  await plan.getByTestId('ai-plan-build-all').click();

  // The run ends with the closing summary and the changeset.
  await expect(panel.getByTestId('ai-transcript')).toContainText('ready to review', {
    timeout: 30_000,
  });
  await expect(panel.getByTestId('ai-stop')).toBeHidden();
  const changeset = panel.getByTestId('ai-changeset');
  await expect(changeset).toBeVisible();
  const rows = changeset.locator('li[data-op]');
  const titles = await rows.locator('code').allTextContents();
  for (const id of BUILT) expect(titles, id).toContain(id);
  expect(titles.some((title) => title.includes('textures/item/ruby_pickaxe.png'))).toBe(true);
  expect(titles.some((title) => title.includes('textures/item/ruby_axe.png'))).toBe(true);
  // Every row is kept and none conflicts.
  await expect(changeset.locator('li[data-op][data-accepted="false"]')).toHaveCount(0);
  await expect(changeset.locator('[data-testid$="-conflict"]')).toHaveCount(0);
  await expect(changeset).toContainText(`(${titles.length} of ${titles.length} kept)`);

  await panel.getByTestId('ai-apply').click();
  await expect(panel.getByTestId('ai-transcript')).toContainText('Undo reverts them in one step.');
  await expect(changeset).toBeHidden();

  // The sidebar shows the new content, and there are no errors.
  for (const id of ['ruby:ruby_ore', 'ruby:ruby_sword', 'ruby:ruby_pickaxe', 'ruby:ruby_golem']) {
    await expect(window.getByTestId(`element-row-${id}`)).toBeVisible();
  }
  await expect(await errorRows(window)).toHaveCount(0);
  await expect(window.locator('footer').getByText(/^0 error\(s\)/)).toBeVisible();

  // Resource pack through the toolbar.
  await window.getByTestId('toolbar-export-zip').click();
  const resource = await newZip(folders.outDir, '.zip', []);
  expect(Object.keys(resource.files)).toEqual(
    expect.arrayContaining([
      'pack.mcmeta',
      'assets/ruby/models/block/ruby_ore.json',
      'assets/ruby/models/item/ruby_pickaxe.json',
      'assets/ruby/textures/item/ruby_pickaxe.png',
    ]),
  );
  const lang = JSON.parse(
    strFromU8(resource.files['assets/ruby/lang/en_us.json'] ?? new Uint8Array()),
  ) as Record<string, string>;
  expect(lang['item.ruby.ruby_pickaxe']).toBe('Ruby Pickaxe');

  // Data pack through the Export menu.
  await window.getByTestId('toolbar-export-menu').click();
  const dataItem = window.getByTestId('export-data-zip');
  await expect(dataItem).toBeVisible();
  await dataItem.click();
  const data = await newZip(folders.outDir, '.zip', [resource.name]);
  expect(Object.keys(data.files)).toEqual(
    expect.arrayContaining([
      'data/ruby/recipe/ruby_pickaxe_from_rubies.json',
      'data/ruby/recipe/ruby_sword_from_emerald.json',
      'data/ruby/loot_table/blocks/ruby_block.json',
    ]),
  );

  // The Fabric mod jar through the palette, with the runtime and GeckoLib kept separate.
  const jarPalette = await openPalette(window, 'fabric mod jar');
  await jarPalette.getByTestId('command-exportFabricJar').click();
  await expect(jarPalette).toBeHidden();
  const jarDialog = window.getByTestId('fabric-jar-dialog');
  await expect(jarDialog).toBeVisible();
  await expect(jarDialog.getByText('Separate runtime and GeckoLib (for modpacks)')).toBeVisible();
  await jarDialog.getByTestId('exporter-option-separateRuntime').check();
  await jarDialog.getByTestId('fabric-jar-dialog-submit').click();
  await expect(jarDialog).toBeHidden();
  const jar = await newZip(folders.outDir, '.jar', []);
  expect(jar.name).toBe('ruby.jar');
  const jarNames = Object.keys(jar.files);
  expect(jarNames).toEqual(
    expect.arrayContaining([
      'fabric.mod.json',
      'msm/ruby/block/ruby_ore.json',
      'msm/ruby/item/ruby_pickaxe.json',
      'msm/ruby/entity/ruby_golem.json',
    ]),
  );

  await window.screenshot({ path: join(outputDir, 'ai-path.png') });

  // Edit > Undo removes everything the helper added.
  await menuUndo(launched);
  for (const id of ['ruby:ruby_ore', 'ruby:ruby_sword', 'ruby:ruby_pickaxe', 'ruby:ruby_golem']) {
    await expect(window.getByTestId(`element-row-${id}`)).toHaveCount(0);
  }
  await expect(window.getByTestId(`element-row-${NAMESPACE}:pack`)).toBeVisible();

  // Settings: the scripted key reads as set, with the privacy text.
  await window.getByTestId('toolbar-settings').click();
  const settings = window.getByTestId('settings-dialog');
  await expect(settings).toBeVisible();
  await expect(settings.getByTestId('settings-ai-key-status')).toHaveText('Key set (…e2e!)');
  await expect(settings.getByTestId('settings-ai-privacy')).toBeVisible();
  await expect(settings.getByTestId('settings-ai-privacy')).not.toBeEmpty();
  await window.keyboard.press('Escape');
  await expect(settings).toBeHidden();

  // Save, so closing does not prompt to discard.
  await window.getByTestId('toolbar-save').click();
  await expect(window.locator('footer').getByText('Saved', { exact: true })).toBeVisible();
  console.log(`ai-path build: ${((Date.now() - started) / 1000).toFixed(1)} s`);
});

test('AI helper: explain a problem in the sample mod and apply the fix', async () => {
  const started = Date.now();
  base = mkdtempSync(join(tmpdir(), 'msm-ai-explain-'));
  const folders = {
    projectDir: join(base, 'sample_mod'),
    outDir: join(base, 'out'),
    msmHome: join(base, 'msm-home'),
  };
  cpSync(SAMPLE_MOD, folders.projectDir, { recursive: true });

  // Inject the error: the wand's use trigger names an event the wand does not declare.
  const wandPath = join(folders.projectDir, WAND_FILE);
  const wand = JSON.parse(readFileSync(wandPath, 'utf8')) as {
    data: { components: Record<string, { event?: string }> };
  };
  const original = structuredClone(wand.data);
  const onUse = wand.data.components['msm:on_use'];
  if (onUse?.event === undefined) throw new Error('The sample wand has no use trigger event.');
  onUse.event = `${onUse.event}_typo`;
  writeFileSync(wandPath, `${JSON.stringify(wand, null, 2)}\n`);

  // The explain script, with the fix rebuilt from the fixture's own data.
  const script = JSON.parse(readFileSync(join(SCRIPTS, 'explain-problem.script.json'), 'utf8')) as {
    turns: { content: { type: string; name?: string; input?: unknown }[] }[];
  };
  for (const turn of script.turns) {
    for (const block of turn.content) {
      if (block.type === 'tool_use' && block.name === 'update_element') {
        block.input = { id: WAND_ID, data: original };
      }
    }
  }
  // A last turn answers the pasted screenshot (ADR 0048).
  script.turns.push({
    content: [{ type: 'text', text: 'A red square, like a ruby block.' } as never],
  });
  const scriptPath = join(base, 'explain.script.json');
  writeFileSync(scriptPath, JSON.stringify(script));

  const launched = await launchApp({ reuse: folders, aiScript: scriptPath });
  launches.push(launched);
  const { window } = launched;
  await window.waitForLoadState('domcontentloaded');
  await window.getByTestId('toolbar-open-project').click();
  await expect(window.getByTestId(`element-row-${WAND_ID}`)).toBeVisible();

  // The injected error, with an Explain button.
  const errors = await errorRows(window);
  await expect(errors).toHaveCount(1);
  await expect(errors.first()).toContainText('is not declared');
  await errors.first().getByRole('button', { name: 'Explain' }).click();

  const panel = window.getByTestId('ai-panel');
  await expect(panel).toBeVisible();
  await expect(panel.getByTestId('ai-mode-chat')).toHaveAttribute('aria-pressed', 'true');
  await expect(panel.getByTestId('ai-context')).toBeVisible();
  await expect(panel.getByTestId('ai-context-label')).not.toBeEmpty();
  await expect(panel.getByTestId('ai-input')).toHaveValue(
    'Explain this problem and how to fix it.',
  );
  await panel.getByTestId('ai-send').click();

  // The answer streams in, and the fix is proposed and checked.
  const transcript = panel.getByTestId('ai-transcript');
  await expect(transcript).toContainText('It looks like a typo.');
  await expect(transcript).toContainText('The checks report no errors');
  await expect(panel.getByTestId('ai-stop')).toBeHidden();
  const changeset = panel.getByTestId('ai-changeset');
  const rows = changeset.locator('li[data-op]');
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toHaveAttribute('data-op', 'update');
  await expect(rows.first().locator('code')).toHaveText(WAND_ID);

  await panel.getByTestId('ai-apply').click();
  await expect(transcript).toContainText('Applied 1 change. Undo reverts it in one step.');
  await expect(await errorRows(window)).toHaveCount(0);
  await expect(window.locator('footer').getByText(/^0 error\(s\)/)).toBeVisible();

  await window.getByTestId('toolbar-save').click();
  await expect(window.locator('footer').getByText('Saved', { exact: true })).toBeVisible();

  // A pasted screenshot goes with the next message and shows in the transcript.
  const screenshot = [
    ...rgbaPng(40, 30, (x, y) =>
      x > 10 && x < 30 && y > 5 && y < 25 ? [200, 20, 40, 255] : [255, 255, 255, 255],
    ),
  ];
  await window.getByTestId('dock-tab-assistant').click();
  await panel.getByTestId('ai-input').focus();
  await window.evaluate(`(() => {
    const transfer = new DataTransfer();
    transfer.items.add(new File([new Uint8Array(${JSON.stringify(screenshot)})], 'image.png', { type: 'image/png' }));
    document.activeElement.dispatchEvent(
      new ClipboardEvent('paste', { clipboardData: transfer, bubbles: true, cancelable: true }),
    );
  })()`);
  await expect(panel.getByTestId('ai-picture-0')).toBeVisible();
  await expect(panel.getByTestId('ai-send')).toBeEnabled();
  await panel.getByTestId('ai-send').click();
  await expect(transcript).toContainText('A red square, like a ruby block.');
  await expect(transcript.locator('[data-testid$="-pictures"] img')).toHaveCount(1);
  await expect(transcript).toContainText('What does this picture show');
  await expect(panel.getByTestId('ai-pictures')).toHaveCount(0);
  console.log(`ai-path explain: ${((Date.now() - started) / 1000).toFixed(1)} s`);
});
