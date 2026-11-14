/**
 * The scripting path (Phase 6, ADRs 0031 and 0032), driven through the template picker, the
 * Script Studio, the Problems panel and the export menu: a blank project gets an `msm:script`
 * from the "Block interaction script" template; the Script Studio shows Monaco with
 * TypeScript and offers completions after `msm.` and after `player.data.` (saved data,
 * ADR 0062); a call to a missing API member is a `typescript.semantic` warning on its line; a syntax error is a `typescript.syntax` error
 * that disables "Fabric mod (.jar)…" until it is fixed. The jar is exported with "Separate
 * runtime and GeckoLib (for modpacks)" and holds the script transpiled to ES5 JavaScript (no
 * TypeScript source); `.msm/msm-runtime.d.ts` is in the project folder; a second launch
 * reopens the project with no problems.
 *
 * A second test (Script API 1.1, ADR 0065) adds the "Full set bonus" template (`player.tick`),
 * finds the Inventory members in the completion list after `e.player.inventory.`, finishes a
 * `player.respawn` handler that counts diamonds with no problems, and checks the ES5 script in
 * the jar.
 *
 * Nothing here runs Minecraft or Rhino; the in-game check is `fixtures/sample-script`.
 */

import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { strFromU8, unzipSync } from 'fflate';
import { expect, type Locator, type Page, test } from 'playwright/test';
import ts from 'typescript';
import { type LaunchedApp, launchApp, openDockTab, outputDir } from './fixtures';

/** The project folder name; a blank project's namespace (and mod id) is derived from it. */
const NAMESPACE = 'script_e2e';
const SCRIPT_PATH = 'glow';
const SCRIPT_ID = `${NAMESPACE}:${SCRIPT_PATH}`;
/** The "Block interaction script" template has 11 lines; typed lines go on line 12. */
const TEMPLATE_LINES = 11;
const TYPED_LINE = TEMPLATE_LINES + 1;
/** `msm.nope` does not exist: a semantic (type) problem, reported as a warning. */
const TYPE_ERROR = 'msm.nope();';
/** A missing expression: one syntax problem, reported as an error. */
const SYNTAX_ERROR = 'let x = ;';

let base: string | undefined;
const launches: LaunchedApp[] = [];

test.afterEach(async () => {
  for (const launched of launches.splice(0)) await launched.close();
  if (base !== undefined) rmSync(base, { recursive: true, force: true });
  base = undefined;
});

/** Zip entries of `path`, keyed by entry name. */
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

/** Names in `dir` ending in `extension`, sorted. */
function filesIn(dir: string, extension: string): string[] {
  return readdirSync(dir)
    .filter((name) => name.endsWith(extension))
    .sort();
}

/**
 * The tokens of `source` that ES5 does not have, found with the TypeScript scanner (comments
 * are skipped, so the transpiler's `/** @class *\/` markers do not count).
 */
function es2015Tokens(source: string): string[] {
  const scanner = ts.createScanner(ts.ScriptTarget.Latest, true, ts.LanguageVariant.Standard);
  scanner.setText(source);
  const found: string[] = [];
  for (let token = scanner.scan(); token !== ts.SyntaxKind.EndOfFileToken; token = scanner.scan()) {
    if (token === ts.SyntaxKind.ClassKeyword) found.push('class');
    if (token === ts.SyntaxKind.EqualsGreaterThanToken) found.push('=>');
    if (token === ts.SyntaxKind.ConstKeyword) found.push('const');
    if (token === ts.SyntaxKind.NoSubstitutionTemplateLiteral) found.push('`');
    if (token === ts.SyntaxKind.TemplateHead) found.push('`');
  }
  return found;
}

/** The status toast's text. */
function toast(window: Page): Locator {
  return window.getByTestId('status-toast-text');
}

/** The Problems panel's rows (opens the panel); `severity` narrows them. */
async function problemRows(window: Page, severity?: 'error' | 'warning'): Promise<Locator> {
  await openDockTab(window, 'problems');
  const problems = window.getByTestId('problems-panel');
  await expect(problems).toBeVisible();
  return problems.locator(
    severity === undefined
      ? '[data-testid="problem-row"]'
      : `[data-testid="problem-row"][data-severity="${severity}"]`,
  );
}

/** Asserts that the Problems panel lists nothing at all and the status bar agrees. */
async function expectNoProblems(window: Page): Promise<void> {
  await expect(await problemRows(window)).toHaveCount(0);
  await expect(window.locator('footer').getByText(/^0 error\(s\)/)).toBeVisible();
}

/** Opens the export chevron menu and returns the item `testId` (not clicked). */
async function exportItem(window: Page, testId: string): Promise<Locator> {
  await window.getByTestId('toolbar-export-menu').click();
  const item = window.getByTestId(testId);
  await expect(item).toBeVisible();
  return item;
}

/** The Monaco script editor's rendered lines container. */
function scriptView(window: Page): Locator {
  return window.getByTestId('script-editor').locator('.monaco-editor .view-lines');
}

/** The Monaco script editor's text, read from its rendered lines in document order. */
async function monacoText(window: Page): Promise<string> {
  return scriptView(window).evaluate((host) => {
    // The e2e build has no DOM types: just the fields read here.
    type Line = { style: { top: string }; textContent: string | null };
    const lines = [...host.querySelectorAll('.view-line')] as unknown as Line[];
    return lines
      .sort((a, b) => Number.parseFloat(a.style.top) - Number.parseFloat(b.style.top))
      .map((line) => (line.textContent ?? '').replace(/ /g, ' '))
      .join('\n');
  });
}

/** The editor's last line. */
async function lastLine(window: Page): Promise<string> {
  const lines = (await monacoText(window)).split('\n');
  return lines[lines.length - 1] ?? '';
}

/** Puts the caret at the end of the source and starts a new line (no completion open). */
async function newLastLine(window: Page): Promise<void> {
  await scriptView(window).click();
  await window.keyboard.press('Escape');
  await window.keyboard.press('ControlOrMeta+End');
  await window.keyboard.press('Enter');
  await expect.poll(() => lastLine(window)).toBe('');
}

/** Removes the last line (typed by {@link newLastLine}), leaving the template's text. */
async function removeLastLine(window: Page, template: string): Promise<void> {
  await scriptView(window).click();
  await window.keyboard.press('Escape');
  await window.keyboard.press('ControlOrMeta+End');
  await window.keyboard.press('Shift+Home');
  await window.keyboard.press('Delete');
  await window.keyboard.press('Backspace');
  await expect.poll(() => monacoText(window)).toBe(template);
}

test('scripting: template, Monaco TypeScript, problems, Fabric jar with ES5 script, typings, reopen', async () => {
  base = mkdtempSync(join(tmpdir(), 'msm-scripting-'));
  const folders = {
    projectDir: join(base, NAMESPACE),
    outDir: join(base, 'out'),
    msmHome: join(base, 'msm-home'),
  };
  mkdirSync(outputDir, { recursive: true });

  // First launch: a blank project with a script from the template. -------------------------
  const first = await launchApp({ reuse: folders });
  launches.push(first);
  const { window } = first;
  await window.waitForLoadState('domcontentloaded');

  await window.getByTestId('toolbar-new-project').click();
  await expect(window.getByTestId(`element-row-${NAMESPACE}:pack`)).toBeVisible();

  await window.getByTestId('toolbar-add-element').click();
  const dialog = window.getByTestId('new-element-dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByTestId('new-element-filter').fill('block interaction');
  const template = dialog.getByTestId('template-msm_script_block_interaction');
  await expect(template).toBeVisible();
  await template.check();
  await expect(dialog.getByTestId('new-element-namespace')).toHaveValue(NAMESPACE);
  await dialog.getByTestId('new-element-name').fill(SCRIPT_PATH);
  await dialog.getByTestId('new-element-dialog-submit').click();
  await expect(dialog).toBeHidden();

  // The sidebar's "Scripts" group and the Script Studio with Monaco. -----------------------
  const row = window.getByTestId(`element-row-${SCRIPT_ID}`);
  await expect(row).toBeVisible();
  await expect(window.getByRole('heading', { name: 'Scripts', exact: true })).toBeVisible();
  await row.click();
  const studio = window.getByTestId('script-studio');
  await expect(studio).toBeVisible();
  await expect(studio.getByTestId('script-id')).toHaveText(SCRIPT_ID);
  await expect(studio.getByTestId('script-typings-note')).toContainText('msm-runtime.d.ts');
  await expect(studio.getByTestId('script-editor').locator('.monaco-editor')).toBeVisible();
  await expect(studio.getByTestId('script-summary-event')).toHaveText('Event block.interact');
  await expect.poll(async () => (await monacoText(window)).split('\n').length).toBe(TEMPLATE_LINES);
  const templateText = await monacoText(window);
  expect(templateText).toContain('msm.events.on("block.interact"');
  await expectNoProblems(window);

  // The typings are written next to the project. -------------------------------------------
  const typingsPath = join(folders.projectDir, '.msm', 'msm-runtime.d.ts');
  await expect.poll(() => existsSync(typingsPath)).toBe(true);
  expect(readFileSync(typingsPath, 'utf8')).toContain('declare module "msm:runtime"');

  // Saved data (ADR 0062): completion after `player.data.` lists the DataStore members. ----
  await newLastLine(window);
  await window.keyboard.type('declare const player: Player; player.data.');
  const dataSuggest = window.locator('.monaco-editor .suggest-widget');
  await expect(dataSuggest).toBeVisible({ timeout: 30_000 });
  for (const member of ['get', 'set', 'keys']) {
    await expect(
      dataSuggest.locator('.monaco-list-row', { hasText: new RegExp(`^${member}\\b`) }).first(),
    ).toBeVisible({ timeout: 30_000 });
  }
  await window.keyboard.press('Escape');
  await expect(dataSuggest).toBeHidden();
  await removeLastLine(window, templateText);

  // Completion after `msm.` comes from the typings through Monaco's TypeScript worker. ------
  await newLastLine(window);
  await window.keyboard.type('msm.');
  const suggest = window.locator('.monaco-editor .suggest-widget');
  await expect(suggest).toBeVisible({ timeout: 30_000 });
  await expect(suggest.locator('.monaco-list-row', { hasText: 'events' }).first()).toBeVisible({
    timeout: 30_000,
  });
  await window.keyboard.press('Escape');
  await expect(suggest).toBeHidden();

  // A missing API member: a typescript.semantic warning on line 12. -------------------------
  await window.keyboard.type('nope();');
  await window.keyboard.press('Escape');
  await expect.poll(() => lastLine(window)).toBe(TYPE_ERROR);
  const warnings = await problemRows(window, 'warning');
  await expect(warnings).toHaveCount(1, { timeout: 20_000 });
  await expect(warnings.first()).toHaveAttribute('data-code', 'typescript.semantic');
  await expect(warnings.first()).toContainText(SCRIPT_ID);
  await expect(warnings.first()).toContainText(new RegExp(`line ${TYPED_LINE}\\b`));
  await expect(warnings.first()).toContainText('nope');
  await expect(warnings.first()).toContainText('(TS2339)');
  await expect(studio.getByTestId('problem-line')).toContainText(`Line ${TYPED_LINE}:`);
  // A warning does not block the jar.
  const allowed = await exportItem(window, 'export-fabric-jar');
  await expect(allowed).toHaveText(/Fabric mod \(\.jar\)…/);
  await expect(allowed).not.toHaveAttribute('data-disabled', /.*/);
  await window.keyboard.press('Escape');

  // Fix it. ---------------------------------------------------------------------------------
  await removeLastLine(window, templateText);
  await expectNoProblems(window);

  // A syntax error: a typescript.syntax error that blocks "Fabric mod (.jar)…". -------------
  await newLastLine(window);
  await window.keyboard.type(SYNTAX_ERROR);
  await window.keyboard.press('Escape');
  await expect.poll(() => lastLine(window)).toBe(SYNTAX_ERROR);
  const errors = await problemRows(window, 'error');
  await expect(errors).toHaveCount(1, { timeout: 20_000 });
  await expect(errors.first()).toHaveAttribute('data-code', 'typescript.syntax');
  await expect(errors.first()).toContainText(new RegExp(`line ${TYPED_LINE}\\b`));
  await expect(errors.first()).toContainText('(TS1109)');
  const blocked = await exportItem(window, 'export-fabric-jar');
  await expect(blocked).toHaveText(/Fabric mod \(\.jar\)…/);
  await expect(blocked).toHaveAttribute('data-disabled', /.*/);
  await expect(window.getByTestId('export-fabric-jar-reason')).toContainText('Fix 1 error');
  await window.keyboard.press('Escape');
  await expect(blocked).toBeHidden();

  // Fix it. ---------------------------------------------------------------------------------
  await removeLastLine(window, templateText);
  await expectNoProblems(window);

  // Export the Fabric mod jar with a separate runtime. --------------------------------------
  const jarItem = await exportItem(window, 'export-fabric-jar');
  await expect(jarItem).not.toHaveAttribute('data-disabled', /.*/);
  await jarItem.click();
  const jarDialog = window.getByTestId('fabric-jar-dialog');
  await expect(jarDialog).toBeVisible();
  await expect(jarDialog.getByText('Separate runtime and GeckoLib (for modpacks)')).toBeVisible();
  const separate = jarDialog.getByTestId('exporter-option-separateRuntime');
  await separate.check();
  await jarDialog.getByTestId('fabric-jar-dialog-submit').click();
  await expect(jarDialog).toBeHidden();
  await expect
    .poll(() => filesIn(folders.outDir, '.jar'), { timeout: 20_000 })
    .toEqual([`${NAMESPACE}.jar`]);
  const jarPath = join(folders.outDir, `${NAMESPACE}.jar`);
  await expect.poll(() => isCompleteZip(jarPath), { timeout: 20_000 }).toBe(true);
  await expect(toast(window)).toContainText('Exported the Fabric mod jar to');
  {
    const jar = readZip(jarPath);
    const names = Object.keys(jar);
    expect(names.some((name) => name.startsWith('META-INF/jars/'))).toBe(false);
    expect(names.filter((name) => name.endsWith('.ts'))).toEqual([]);
    const scriptEntry = `msm/${NAMESPACE}/script/${SCRIPT_PATH}.js`;
    const bytes = jar[scriptEntry];
    if (bytes === undefined) throw new Error(`${scriptEntry} is missing from the jar.`);
    const js = strFromU8(bytes);
    expect(js).toContain('"use strict"');
    expect(js).toContain('block.interact');
    expect(es2015Tokens(js)).toEqual([]);
    const modJson = JSON.parse(strFromU8(jar['fabric.mod.json'] ?? new Uint8Array())) as {
      id?: string;
      depends?: Record<string, string>;
    };
    expect(modJson.id).toBe(NAMESPACE);
    expect(Object.keys(modJson.depends ?? {})).toContain('msm_runtime');
  }

  await window.screenshot({ path: join(outputDir, 'scripting-path.png') });

  // Save, so closing does not prompt to discard.
  await window.getByTestId('toolbar-save').click();
  await expect(window.locator('footer').getByText('Saved', { exact: true })).toBeVisible();
  await first.close();
  launches.splice(0);

  // Second launch: reopen with zero problems and the script kept. ---------------------------
  const second = await launchApp({ reuse: folders });
  launches.push(second);
  const w2 = second.window;
  await w2.waitForLoadState('domcontentloaded');
  await w2.getByTestId('toolbar-open-project').click();
  const reopenedRow = w2.getByTestId(`element-row-${SCRIPT_ID}`);
  await expect(reopenedRow).toBeVisible();
  await reopenedRow.click();
  await expect(w2.getByTestId('script-studio')).toBeVisible();
  await expect(w2.getByTestId('script-editor').locator('.monaco-editor')).toBeVisible();
  await expect.poll(() => monacoText(w2)).toBe(templateText);
  await expectNoProblems(w2);
  await w2.screenshot({ path: join(outputDir, 'scripting-path-reopened.png') });
});

test('scripting: Script API 1.1, player.inventory completes and the script exports', async () => {
  base = mkdtempSync(join(tmpdir(), 'msm-scripting-inventory-'));
  const folders = {
    projectDir: join(base, NAMESPACE),
    outDir: join(base, 'out'),
    msmHome: join(base, 'msm-home'),
  };
  mkdirSync(outputDir, { recursive: true });
  const launched = await launchApp({ reuse: folders });
  launches.push(launched);
  const { window } = launched;
  await window.waitForLoadState('domcontentloaded');
  await window.getByTestId('toolbar-new-project').click();
  await expect(window.getByTestId(`element-row-${NAMESPACE}:pack`)).toBeVisible();

  // The "Full set bonus" template: player.tick with an interval and entity equipment. -------
  const scriptId = `${NAMESPACE}:bonus`;
  await window.getByTestId('toolbar-add-element').click();
  const dialog = window.getByTestId('new-element-dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByTestId('new-element-filter').fill('full set');
  const template = dialog.getByTestId('template-msm_script_full_set_bonus');
  await expect(template).toBeVisible();
  await template.check();
  await dialog.getByTestId('new-element-name').fill('bonus');
  await dialog.getByTestId('new-element-dialog-submit').click();
  await expect(dialog).toBeHidden();
  await window.getByTestId(`element-row-${scriptId}`).click();
  const studio = window.getByTestId('script-studio');
  await expect(studio.getByTestId('script-editor').locator('.monaco-editor')).toBeVisible();
  await expect(studio.getByTestId('script-summary-event')).toHaveText('Event player.tick');
  await expect.poll(() => monacoText(window)).toContain('"player.tick"');
  await expectNoProblems(window);

  // Completion after `player.inventory.` lists the Inventory members. -----------------------
  await newLastLine(window);
  // insertText skips Monaco's auto-closing brackets and quotes; the dot is typed to open the list.
  await window.keyboard.insertText('msm.events.on("player.respawn", (e) => e.player.inventory');
  await window.keyboard.type('.');
  const suggest = window.locator('.monaco-editor .suggest-widget');
  await expect(suggest).toBeVisible({ timeout: 30_000 });
  for (const member of ['count', 'find', 'get', 'remove', 'set']) {
    await expect(
      suggest.locator('.monaco-list-row', { hasText: new RegExp(`^${member}\\b`) }).first(),
    ).toBeVisible({ timeout: 30_000 });
  }
  await window.keyboard.press('Escape');
  await expect(suggest).toBeHidden();
  await window.keyboard.insertText('count("minecraft:diamond"));');
  await expect
    .poll(() => lastLine(window))
    .toBe('msm.events.on("player.respawn", (e) => e.player.inventory.count("minecraft:diamond"));');
  await expectNoProblems(window);
  await expect(studio.getByTestId('script-summary-event')).toHaveCount(2);

  // The jar holds the script as ES5 with both handlers. -------------------------------------
  const jarItem = await exportItem(window, 'export-fabric-jar');
  await expect(jarItem).not.toHaveAttribute('data-disabled', /.*/);
  await jarItem.click();
  const jarDialog = window.getByTestId('fabric-jar-dialog');
  await expect(jarDialog).toBeVisible();
  await jarDialog.getByTestId('exporter-option-separateRuntime').check();
  await jarDialog.getByTestId('fabric-jar-dialog-submit').click();
  await expect(jarDialog).toBeHidden();
  const jarPath = join(folders.outDir, `${NAMESPACE}.jar`);
  await expect.poll(() => isCompleteZip(jarPath), { timeout: 20_000 }).toBe(true);
  const bytes = readZip(jarPath)[`msm/${NAMESPACE}/script/bonus.js`];
  if (bytes === undefined) throw new Error('The script is missing from the jar.');
  const js = strFromU8(bytes);
  expect(js).toContain('player.tick');
  expect(js).toContain('e.player.inventory.count("minecraft:diamond")');
  expect(es2015Tokens(js)).toEqual([]);

  await window.getByTestId('toolbar-save').click();
  await expect(window.locator('footer').getByText('Saved', { exact: true })).toBeVisible();
});
