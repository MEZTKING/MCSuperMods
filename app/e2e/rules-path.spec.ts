/**
 * Rules end to end (ADR 0082), driven only through the Studios (the Raw JSON tab is never
 * opened). A new project with a Chime Block and a Jump Pad (the bounce pad template, which has
 * hand-made events). The Chime Block's Rules section adds a plain rule ("When a player uses
 * Chime Block, give the player Diamond") into a new rule book; its empty item chip shows a
 * problem until a thing is picked. The Rule book Studio adds a logic rule ("When a player
 * joins, repeat 2 times: show a chat message"). The Jump Pad's events editor turns its
 * "broken" event into a rule. The Fabric mod jar then holds the plain rule as an event on the
 * Chime Block and the logic rule as a script. Undo takes the "Turn into rules" back in one step.
 * Last, "Copy as my own script" (Advanced, the fresh profile's mode) makes the book's script a
 * script of the project's own and turns the rules off, as one undo step that Undo takes back.
 */

import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { strFromU8, unzipSync } from 'fflate';
import { expect, type Locator, type Page, test } from 'playwright/test';
import { type LaunchedApp, launchApp, newProjectInFolder, outputDir, toast } from './fixtures';

/** The project folder name; a new project's namespace is derived from it. */
const NAMESPACE = 'msm_rules_e2e';
const CHIME_ID = `${NAMESPACE}:chime_block`;
const PAD_ID = `${NAMESPACE}:jump_pad`;
const BOOK_ID = `${NAMESPACE}:rules`;
const PAD_EVENT = `${NAMESPACE}:jump_pad_broken`;
const CHIME_EVENT = `${NAMESPACE}:chime_block_rules_block_used`;

/** Adds an element from template `templateId` through the New element dialog. */
async function addFromTemplate(
  window: Page,
  filter: string,
  templateId: string,
  name: string,
): Promise<void> {
  await window.getByTestId('toolbar-add-element').click();
  const dialog = window.getByTestId('new-element-dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByTestId('new-element-filter').fill(filter);
  const template = dialog.getByTestId(`template-${templateId}`);
  await expect(template).toBeVisible();
  await template.check();
  await expect(dialog.getByTestId('new-element-namespace')).toHaveValue(NAMESPACE);
  await dialog.getByTestId('new-element-name').fill(name);
  await dialog.getByTestId('new-element-dialog-submit').click();
  await expect(dialog).toBeHidden();
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

/** Picks `id` in the open ThingPicker after searching for `search`. */
async function pickThing(window: Page, search: string, id: string): Promise<void> {
  const picker = window.getByTestId('thing-picker');
  await expect(picker).toBeVisible();
  await picker.getByTestId('thing-search').fill(search);
  await picker.getByTestId(`thing-${id}`).click();
  await expect(picker).toBeHidden();
}

function filesIn(dir: string, extension: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => name.endsWith(extension))
    .sort();
}

/** The saved element file of `id` (`content/<ns>/<folder>/<path>.json`). */
function savedData(projectDir: string, folder: string, path: string): Record<string, unknown> {
  const file = join(projectDir, 'content', NAMESPACE, folder, `${path}.json`);
  return (JSON.parse(readFileSync(file, 'utf8')) as { data: Record<string, unknown> }).data;
}

let base: string | undefined;
let launched: LaunchedApp | undefined;

test.afterEach(async () => {
  await launched?.close();
  launched = undefined;
  if (base !== undefined) rmSync(base, { recursive: true, force: true });
  base = undefined;
});

test('rules: a plain and a logic rule through the Studios, a chip problem, Turn into rules, jar, undo', async () => {
  test.setTimeout(150_000);
  base = mkdtempSync(join(tmpdir(), 'msm-rules-'));
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
  await expect(window.getByTestId(`element-row-${NAMESPACE}:pack`)).toBeVisible();
  await addFromTemplate(window, 'simple block', 'msm_block_simple', 'chime_block');
  await addFromTemplate(window, 'bounce pad', 'msm_block_bounce_pad', 'jump_pad');

  // A plain rule from the Chime Block's Rules section. ---------------------------------------
  await window.getByTestId(`element-row-${CHIME_ID}`).click();
  const section = window.getByTestId('rules-section');
  await expect(section).toBeVisible();
  await expect(section.getByTestId('rules-section-empty')).toBeVisible();
  await section.getByTestId('rules-section-add').click();
  await expect(window.getByTestId(`element-row-${BOOK_ID}`)).toBeVisible();
  await expect(window.locator('footer')).toContainText('Undo: Add a rule');
  const card = section.getByTestId('rule-card');
  await expect(card).toHaveCount(1);
  await expect(card.getByTestId('rule-sentence')).toHaveText(
    'When a player uses Chime Block, nothing.',
  );

  // The Rule book Studio: a step whose item is still empty shows its problem at the chip. -----
  await section.getByTestId('rules-section-open-book').click();
  const studio = window.getByTestId('rule-book-studio');
  await expect(studio).toBeVisible();
  const cards = studio.getByTestId('rule-card');
  const plain = cards.first();
  await pickFromMenu(window, plain.getByTestId('rules-add-step-do'), 'Give an item');
  const itemChip = plain.getByTestId('rules-chip-item');
  await expect(itemChip).toHaveAttribute('aria-invalid', 'true');
  await expect(itemChip).toHaveAccessibleName('Item: pick an item');
  await expect(plain.getByRole('alert')).toHaveText(
    'Rules is missing something it needs. Fill it in.',
  );
  await expect(window.locator('footer')).toContainText('1 error(s)');
  await itemChip.click();
  await pickThing(window, 'diamond', 'minecraft:diamond');
  await expect(itemChip).toHaveAccessibleName('Item: Diamond');
  await expect(itemChip).not.toHaveAttribute('aria-invalid', 'true');
  await expect(plain.getByRole('alert')).toHaveCount(0);
  await expect(plain.getByTestId('rule-sentence')).toHaveText(
    'When a player uses Chime Block, give the player 1 Diamond.',
  );
  await expect(window.locator('footer')).toContainText('0 error(s)');

  // A logic rule: when a player joins, repeat 2 times a chat message. --------------------------
  await studio.getByTestId('rule-add').click();
  await expect(cards).toHaveCount(2);
  const logic = cards.nth(1);
  await expect(logic.getByTestId('rule-sentence')).toHaveText('When a player joins, nothing.');
  await pickFromMenu(window, logic.getByTestId('rules-add-step-do'), 'Repeat');
  // The Repeat card's own "Add a step" comes before the rule's.
  const steps = logic.getByTestId('rules-add-step-do');
  await expect(steps).toHaveCount(2);
  await pickFromMenu(window, steps.first(), 'Show a chat message');
  await expect(logic.getByTestId('rule-sentence')).toContainText(
    'When a player joins, repeat 2 times: show the player the message',
  );
  await window.screenshot({ path: join(outputDir, 'rules-path-book.png') });

  // Turn the Jump Pad's "broken" event into a rule. -------------------------------------------
  await window.getByTestId(`element-row-${PAD_ID}`).click();
  const turn = window.getByTestId(`turn-into-rules-${PAD_EVENT}`);
  await expect(turn).toBeVisible();
  await turn.click();
  await expect(window.locator('footer')).toContainText(`Undo: Turn ${PAD_EVENT} into rules`);
  await expect(window.getByTestId('events-from-rules')).toBeVisible();
  await expect(turn).toHaveCount(0);

  // Save, then the Fabric mod jar holds the rule event and the script. -------------------------
  await window.keyboard.press('ControlOrMeta+S');
  await expect(window.locator('footer')).not.toContainText('Unsaved');
  const book = savedData(folders.projectDir, 'rules', 'rules');
  expect((book.rules as unknown[]).length).toBe(3);

  await window.keyboard.press('ControlOrMeta+Shift+P');
  const palette = window.getByTestId('command-palette');
  await palette.getByTestId('command-palette-input').fill('fabric mod jar');
  await palette.getByTestId('command-exportFabricJar').click();
  const jarDialog = window.getByTestId('fabric-jar-dialog');
  await expect(jarDialog).toBeVisible();
  await jarDialog.getByTestId('exporter-option-separateRuntime').check();
  await jarDialog.getByTestId('fabric-jar-dialog-submit').click();
  await expect(jarDialog).toBeHidden();
  await expect(toast(window)).toContainText('Exported the Fabric mod jar to', { timeout: 30_000 });
  expect(filesIn(folders.outDir, '.jar')).toEqual([`${NAMESPACE}.jar`]);
  const jar = unzipSync(readFileSync(join(folders.outDir, `${NAMESPACE}.jar`)));
  const chime = JSON.parse(strFromU8(jar[`msm/${NAMESPACE}/block/chime_block.json`] as Uint8Array));
  expect(Object.keys(chime.events ?? {})).toContain(CHIME_EVENT);
  expect(JSON.stringify(chime.events[CHIME_EVENT])).toContain('minecraft:diamond');
  // The turned event is now the rule's: the Jump Pad's hand-made "broken" event is gone.
  const pad = JSON.parse(strFromU8(jar[`msm/${NAMESPACE}/block/jump_pad.json`] as Uint8Array));
  const padEvents = Object.keys(pad.events ?? {});
  expect(padEvents).not.toContain(PAD_EVENT);
  expect(padEvents).toContain(`${NAMESPACE}:jump_pad_rules_block_broken`);
  const script = jar[`msm/${NAMESPACE}/script/rules/rules.js`];
  expect(script).toBeDefined();
  const scriptText = strFromU8(script as Uint8Array);
  // Only the logic rule needs the script; the plain ones are events.
  const scriptRules = new Set([...scriptText.matchAll(/rule:([a-z0-9_]+)/g)].map((m) => m[1]));
  expect([...scriptRules]).toEqual(['rule_2']);
  expect(scriptText).toContain('Hello!');

  // Undo takes "Turn into rules" back: the event is hand-made again. ---------------------------
  await window.getByTestId('toolbar-undo').click();
  await expect(window.getByTestId(`turn-into-rules-${PAD_EVENT}`)).toBeVisible();
  await expect(window.locator('footer')).toContainText(`Redo: Turn ${PAD_EVENT} into rules`);

  // Copy as my own script: a script of the project's own, the rules off; Undo takes it back. --
  const scriptId = `${NAMESPACE}:rules_script`;
  await window.getByTestId(`element-row-${BOOK_ID}`).click();
  await expect(studio).toBeVisible();
  await studio.getByTestId('rules-copy-as-script-button').click();
  await expect(studio.getByTestId('rules-copy-as-script-done')).toContainText(
    `Copied to the script ${scriptId}.`,
  );
  await expect(window.locator('footer')).toContainText(`Undo: Copy ${BOOK_ID} as my own script`);
  await expect(window.getByTestId(`element-row-${scriptId}`)).toBeVisible();
  await expect(studio.getByTestId('rule-enabled').first()).not.toBeChecked();
  await window.getByTestId('toolbar-undo').click();
  await expect(window.getByTestId(`element-row-${scriptId}`)).toHaveCount(0);
  await expect(window.locator('footer')).toContainText(`Redo: Copy ${BOOK_ID} as my own script`);
});
