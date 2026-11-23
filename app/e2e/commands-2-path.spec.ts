/**
 * The command arguments, game rules, statistics and hand-ordered tab path (ADR 0111 D1, D2,
 * D5–D7, ADR 0112 D1, D2; brief B542), in a blank project, driven through the Studios (the Raw
 * JSON tab is never opened):
 *
 * 1. The Creator: the Custom command flow with "Its own game rule" makes `/heal` with the game
 *    rule "Allow /heal" and a Rule book that heals while the rule is on; the Game rule flow with
 *    "Counts" makes the Welcome Message rule, its Rule book and a statistic; the Creative tab
 *    flow "In my own order" with two vanilla items makes the My Blocks tab; no problem at all.
 * 2. The Command Studio: a whole number "amount" (1 to 20) is added after `/heal`, and the
 *    usage line shows it.
 * 3. The Rule book Studio: the heal step's amount becomes "What the player typed" for amount,
 *    and a "Set a game rule" step turns the Welcome Message rule off.
 * 4. The Game rule Studio (an on or off rule in the Chat group, on in a new world, its
 *    `/gamerule` line); turned into a whole number, the true or false both Rule books give it
 *    no longer fits (two errors), and Undo takes it back. The Statistic Studio shows the
 *    scoreboard criterion.
 * 5. The Creative Tab Studio: the hand order lists the first block, then the torch and the
 *    lantern; the lantern moves up.
 * 6. Saved, then the Fabric mod jar on the default target: the command with its argument, both
 *    game rules and the statistic with their names, the tab's hand order, and the Rule book's
 *    script reading the typed amount and setting the game rule.
 */

import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { strFromU8, unzipSync } from 'fflate';
import { expect, type Locator, type Page, test } from 'playwright/test';
import {
  type LaunchedApp,
  launchApp,
  newProjectInFolder,
  openDockTab,
  outputDir,
  toast,
} from './fixtures';

/** The project folder name; a blank project's namespace is derived from it. */
const NAMESPACE = 'beacon';
const id = (path: string) => `${NAMESPACE}:${path}`;
const WELCOME = 'welcome_message';

let base: string | undefined;
let launched: LaunchedApp | undefined;

test.afterEach(async () => {
  await launched?.close();
  launched = undefined;
  if (base !== undefined) rmSync(base, { recursive: true, force: true });
  base = undefined;
});

/** No problem of any severity in the Problems panel (opened), and the status bar agrees. */
async function expectNoProblems(window: Page): Promise<void> {
  await openDockTab(window, 'problems');
  const problems = window.getByTestId('problems-panel');
  await expect(problems).toBeVisible();
  await expect(problems.locator('[data-testid="problem-row"]')).toHaveCount(0);
  await expect(window.locator('footer').getByText(/^0 error\(s\)/)).toBeVisible();
}

/** Opens the Creator from the toolbar on `flowId`, sets its answers and applies it. */
async function runFlow(
  window: Page,
  flowId: string,
  title: string,
  answer: (dialog: Locator) => Promise<void>,
): Promise<void> {
  await window.getByTestId('toolbar-creator').click();
  const dialog = window.getByTestId('creator-dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByTestId(`creator-flow-${flowId}`).click();
  await answer(dialog);
  const create = dialog.getByTestId('creator-create');
  await expect(create).toBeEnabled({ timeout: 30_000 });
  await create.click();
  await expect(dialog).toBeHidden({ timeout: 60_000 });
  await expect(
    toast(window).filter({
      hasText: new RegExp(`^Create ${title}: \\d+ element\\(s\\) and file\\(s\\) changed`),
    }),
  ).toBeVisible();
}

/**
 * Opens a chip's or menu button's popover and chooses the entry named `name`. The popover can
 * reach past the bottom of the window, so the choice is clicked through its DOM event.
 */
async function pickFromMenu(window: Page, opener: Locator, name: string): Promise<void> {
  await opener.click();
  const choice = window.getByRole('button', { name, exact: true });
  await expect(choice).toBeAttached();
  await choice.dispatchEvent('click');
}

type Data = Record<string, unknown>;

/** The `data` of a saved element file in the project folder. */
function savedData(projectDir: string, folder: string, path: string): Data {
  const file = join(projectDir, 'content', NAMESPACE, folder, `${path}.json`);
  return (JSON.parse(readFileSync(file, 'utf8')) as { data: Data }).data;
}

function readZip(path: string): Record<string, Uint8Array> {
  return unzipSync(new Uint8Array(readFileSync(path)));
}

function isCompleteZip(path: string): boolean {
  try {
    readZip(path);
    return true;
  } catch {
    return false;
  }
}

/** A JSON file of an exported zip. */
function zipJson<T>(files: Record<string, Uint8Array>, path: string): T {
  const bytes = files[path];
  if (bytes === undefined) throw new Error(`${path} is missing from the export.`);
  return JSON.parse(strFromU8(bytes)) as T;
}

test('commands 2: a typed argument a rule reads, a game rule a rule sets, a statistic, a hand-ordered tab, the jar', async () => {
  test.setTimeout(240_000);
  base = mkdtempSync(join(tmpdir(), 'msm-commands-2-'));
  const folders = {
    projectDir: join(base, NAMESPACE),
    outDir: join(base, 'out'),
    msmHome: join(base, 'msm-home'),
  };
  mkdirSync(outputDir, { recursive: true });
  launched = await launchApp({ reuse: folders });
  const { window } = launched;
  await window.waitForLoadState('domcontentloaded');
  await newProjectInFolder(window);
  await expect(window.getByTestId(`element-row-${id('pack')}`)).toBeVisible();

  // 1. The three flows. --------------------------------------------------------------------------
  await runFlow(window, 'custom-command', 'Custom command', async (dialog) => {
    await expect(dialog.getByTestId('param-command_name')).toHaveValue('heal');
    await dialog.getByTestId('param-own_rule').check();
  });
  await runFlow(window, 'game-rule', 'Game rule', async (dialog) => {
    await expect(dialog.getByTestId('param-rule_name')).toHaveValue('Welcome Message');
    await dialog.getByTestId('param-counts').check();
  });
  await runFlow(window, 'creative-tab', 'Creative tab', async (dialog) => {
    await dialog.getByTestId('param-order').selectOption('by_hand');
    await dialog.getByTestId('param-extra_items-minecraft:torch').check();
    await dialog.getByTestId('param-extra_items-minecraft:lantern').check();
  });
  for (const path of [
    'heal',
    'allow_heal',
    'heal_rules',
    WELCOME,
    `${WELCOME}_rules`,
    `${WELCOME}_count`,
    'my_blocks',
    'my_blocks_block',
  ]) {
    await expect(window.getByTestId(`element-row-${id(path)}`)).toHaveCount(1);
  }
  await expectNoProblems(window);

  // 2. The Command Studio: a number typed after /heal. -------------------------------------------
  await window.getByTestId(`element-row-${id('heal')}`).click();
  const command = window.getByTestId('command-studio');
  await expect(command).toBeVisible({ timeout: 30_000 });
  await expect(command.getByTestId('command-no-arguments')).toBeVisible();
  await command.getByTestId('command-add-argument').click();
  await command.getByTestId('command-argument-0-name').fill('amount');
  await command.getByTestId('command-argument-0-type').selectOption('integer');
  await command.getByTestId('command-argument-0-min').fill('1');
  await command.getByTestId('command-argument-0-max').fill('20');
  await expect(command.getByTestId('command-usage')).toHaveText('/heal <amount>');
  await expect(command.getByTestId('command-usage-key')).toHaveText('amount: A whole number');

  // 3. The Rule book: the typed amount, and a game rule set. -------------------------------------
  await window.getByTestId(`element-row-${id('heal_rules')}`).click();
  const book = window.getByTestId('rule-book-studio');
  await expect(book).toBeVisible({ timeout: 30_000 });
  const rule = book.getByTestId('rule-card');
  await expect(rule).toHaveCount(1);
  const sentence = rule.getByTestId('rule-sentence');
  await expect(sentence).toContainText(
    'When a player types the command /heal, if the game rule Allow /heal is true, then (heal the player who typed it by 20 half hearts,',
  );
  await rule.getByRole('button', { name: /^Amount: / }).click();
  const kind = window.getByTestId('rules-value-kind');
  await expect(kind).toBeVisible();
  await kind.selectOption('command_argument');
  const typedFor = window.getByTestId('rules-command-argument-name');
  await typedFor.selectOption('amount');
  await expect(typedFor).toHaveValue('amount');
  await window.keyboard.press('Escape');
  await expect(sentence).toContainText(
    'heal the player who typed it by what the player typed for "amount" half hearts,',
  );
  // The If step's own "Add a step" comes before the rule's.
  const addStep = rule.getByTestId('rules-add-step-do');
  await expect(addStep).toHaveCount(2);
  await pickFromMenu(window, addStep.last(), 'Set a game rule');
  await rule.getByRole('button', { name: 'Game rule: pick a game rule' }).click();
  const menu = window.getByTestId('rules-id-menu-game_rule');
  await expect(menu).toBeVisible();
  await menu.getByTestId(`rules-id-${id(WELCOME)}`).dispatchEvent('click');
  await rule.getByRole('button', { name: 'Value: set the value' }).click();
  await window
    .getByTestId('rules-game-rule-value')
    .getByTestId('rules-game-rule-false')
    .dispatchEvent('click');
  await expect(sentence).toContainText('and set the game rule Welcome Message to false.');
  await window.keyboard.press('Escape');
  await expectNoProblems(window);
  await window.screenshot({ path: join(outputDir, 'commands-2-path-book.png') });

  // 4. The Game rule and Statistic Studios. ------------------------------------------------------
  await window.getByTestId(`element-row-${id(WELCOME)}`).click();
  const gameRule = window.getByTestId('game-rule-studio');
  await expect(gameRule).toBeVisible({ timeout: 30_000 });
  const ruleKind = gameRule.getByTestId('game-rule-kind');
  await expect(ruleKind).toHaveValue('boolean');
  await expect(gameRule.getByTestId('game-rule-category')).toHaveValue('chat');
  await expect(gameRule.getByTestId('game-rule-default-boolean')).toBeChecked();
  await expect(gameRule.getByTestId('game-rule-command')).toContainText(
    `/gamerule ${id(WELCOME)} true`,
  );
  await ruleKind.selectOption('integer');
  await expect(gameRule.getByTestId('game-rule-default')).toBeVisible();
  await openDockTab(window, 'problems');
  // Both Rule books give it true or false: the one setting it here, and the greeting's check.
  const misfits = window
    .getByTestId('problems-panel')
    .locator('[data-testid="problem-row"][data-severity="error"]')
    .filter({
      hasText: `The game rule "${id(WELCOME)}" holds a whole number, not true or false.`,
    });
  await expect(misfits).toHaveCount(2);
  await window.getByTestId('toolbar-undo').click();
  await expect(ruleKind).toHaveValue('boolean');
  await expect(gameRule.getByTestId('game-rule-default-boolean')).toBeChecked();
  await expectNoProblems(window);

  await window.getByTestId(`element-row-${id(`${WELCOME}_count`)}`).click();
  const stat = window.getByTestId('stat-studio');
  await expect(stat).toBeVisible({ timeout: 30_000 });
  await expect(stat.getByTestId('stat-criterion')).toHaveText(
    `Scoreboard criterion: minecraft.custom:${NAMESPACE}.${WELCOME}_count`,
  );

  // 5. The Creative Tab Studio's own order. ------------------------------------------------------
  await window.getByTestId(`element-row-${id('my_blocks')}`).click();
  const tab = window.getByTestId('creative-tab-studio');
  await expect(tab).toBeVisible({ timeout: 30_000 });
  await expect(tab.getByTestId('creative-tab-order')).toHaveValue('by_hand');
  await expect(tab.getByTestId('creative-tab-hand-0')).toHaveText('1. My Blocks Block');
  await expect(tab.getByTestId('creative-tab-hand-1')).toContainText('Torch');
  await expect(tab.getByTestId('creative-tab-hand-2')).toContainText('Lantern');
  await tab.getByTestId('creative-tab-hand-2-up').click();
  await expect(tab.getByTestId('creative-tab-hand-1')).toContainText('Lantern');
  await expect(tab.getByTestId('creative-tab-hand-2')).toContainText('Torch');
  await expectNoProblems(window);

  // 6. Saved, then the jar. ----------------------------------------------------------------------
  const footer = window.locator('footer');
  await expect(footer.getByText('Unsaved changes', { exact: true })).toBeVisible();
  await window.getByTestId('toolbar-save').click();
  await expect(footer.getByText('Saved', { exact: true })).toBeVisible();
  expect(savedData(folders.projectDir, 'command', 'heal').arguments).toEqual([
    { max: 20, min: 1, name: 'amount', type: 'integer' },
  ]);
  const healRule = (
    savedData(folders.projectDir, 'rules', 'heal_rules') as { rules: { do: Data[] }[] }
  ).rules[0];
  expect(healRule?.do[0]).toMatchObject({
    step: 'if',
    do: [{ amount: { name: 'amount', value: 'command_argument' }, step: 'heal' }, {}, {}],
  });
  expect(healRule?.do[1]).toEqual({
    game_rule: id(WELCOME),
    step: 'set_game_rule',
    value: false,
  });
  expect(savedData(folders.projectDir, 'creative_tab', 'my_blocks')).toMatchObject({
    order: 'by_hand',
    items: [id('my_blocks_block'), 'minecraft:lantern', 'minecraft:torch'],
  });

  await window.keyboard.press('ControlOrMeta+Shift+P');
  const palette = window.getByTestId('command-palette');
  await expect(palette).toBeVisible();
  await palette.getByTestId('command-palette-input').fill('fabric mod jar');
  await palette.getByTestId('command-exportFabricJar').click();
  await expect(palette).toBeHidden();
  const jarDialog = window.getByTestId('fabric-jar-dialog');
  await expect(jarDialog).toBeVisible();
  // CI's `ci` job builds no runtime jar to nest.
  await jarDialog.getByTestId('exporter-option-separateRuntime').check();
  await jarDialog.getByTestId('fabric-jar-dialog-submit').click();
  await expect(jarDialog).toBeHidden();
  const jarPath = join(folders.outDir, `${NAMESPACE}.jar`);
  await expect
    .poll(
      () => readdirSync(folders.outDir).includes(`${NAMESPACE}.jar`) && isCompleteZip(jarPath),
      { timeout: 30_000 },
    )
    .toBe(true);
  const files = readZip(jarPath);
  const definition = (folder: string, path: string) =>
    zipJson<Data>(files, `msm/${NAMESPACE}/${folder}/${path}.json`);
  // The command runs the Rule book's script, which reads the typed amount and sets the rule.
  const heal = definition('command', 'heal');
  expect(heal.arguments).toEqual([{ max: 20, min: 1, name: 'amount', type: 'integer' }]);
  expect(JSON.stringify(heal.events)).toContain(`${NAMESPACE}:rules/heal_rules/`);
  const script = files[`msm/${NAMESPACE}/script/rules/heal_rules.js`];
  expect(script).toBeDefined();
  const scriptText = strFromU8(script as Uint8Array);
  expect(scriptText).toContain('(args, "amount", 0)');
  expect(scriptText).toContain(`world.setGameRule("${id(WELCOME)}", false);`);
  expect(scriptText).toContain(`world.gameRule("${id('allow_heal')}")`);
  expect(definition('game_rule', 'allow_heal')).toEqual({
    category: 'player',
    default: true,
    format: 1,
    kind: 'boolean',
  });
  expect(definition('game_rule', WELCOME)).toMatchObject({ category: 'chat', kind: 'boolean' });
  expect(Object.keys(files)).toContain(`msm/${NAMESPACE}/stat/${WELCOME}_count.json`);
  expect(definition('creative_tab', 'my_blocks')).toMatchObject({
    order: 'by_hand',
    items: [id('my_blocks_block'), 'minecraft:lantern', 'minecraft:torch'],
  });
  const lang = zipJson<Record<string, string>>(files, `assets/${NAMESPACE}/lang/en_us.json`);
  expect(lang[`gamerule.${NAMESPACE}.allow_heal`]).toBe('Allow /heal');
  expect(lang[`gamerule.${NAMESPACE}.${WELCOME}`]).toBe('Welcome Message');
});
