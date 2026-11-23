/**
 * The live views path of batch 2, data (ADR 0120; plan briefs B601 stub, B616).
 *
 * The project is a copy of `fixtures/live-views` (MSM's own tables, predicates, tags, modifiers,
 * an enchantment, advancements, dialogs and functions; plugin `msm.datapack`, target 26.3). No
 * Minecraft folder is set up in these runs, so every view works from the project's files alone.
 *
 * 1. The data views in the element's preview, each inside the frame (the Preview tag and a
 *    fidelity level): a loot table's **Roll it** (one roll and the odds out of 1,000 rolls); a
 *    weight edit in the form changes the odds (timed from the edit to the first changed step); a
 *    new seed changes the roll and never the odds; a predicate turns from "only the game knows"
 *    to yes (rain) to no (clear) as the situation's weather changes; a tag's members, where each
 *    came from, and the set-up banner for the Minecraft tag it names; the advancement tree with
 *    this advancement, its parent and its children marked; a dialog drawn with its button saying
 *    what it would do.
 * 2. A function's lines marked in the panel and counted under the editor; **Run in Try it** runs it in Try it
 *    (SwiftShader WebGL), said in What happened.
 * 3. The Creator's Mob flow opens on its **Live** tab, and the mob's view follows a new name;
 *    nothing is made by looking.
 * 4. The AI helper (a scripted model, `MSM_E2E_AI_SCRIPT`, as in `ai-path`) proposes a loot
 *    table; **See it** rolls it before anything is added; Apply adds it.
 */

import { cpSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, type Locator, type Page, test } from 'playwright/test';
import { appDir, type LaunchedApp, type LaunchOptions, launchApp } from './fixtures';

const WEBGL_ARGS = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] as const;

const NAMESPACE = 'live_views';
const FIXTURE = join(appDir, '..', 'fixtures', 'live-views');
/** The table of four item entries weighted 1, 2, 3 and 4 (stone, dirt, sand, gravel). */
const WEIGHTS_ID = `${NAMESPACE}:weights`;
const WEIGHTED = ['minecraft:stone', 'minecraft:dirt', 'minecraft:sand', 'minecraft:gravel'];
/**
 * The first odds step after an edit, counted from the edit (the views' 150 ms debounce, the
 * worker's first 100 rolls and the test's own polling). B609 measured about 250 ms in the
 * running app; this is a ceiling for a loaded test machine, the measured time is logged.
 */
const EDIT_BUDGET_MS = 2_000;

let base: string | undefined;
const launches: LaunchedApp[] = [];

test.afterEach(async () => {
  for (const launched of launches.splice(0)) await launched.close();
  if (base !== undefined) rmSync(base, { recursive: true, force: true });
  base = undefined;
});

/** Launches the app over a fresh copy of the fixture project and opens it. */
async function launchFixture(options: LaunchOptions = {}): Promise<LaunchedApp> {
  base = mkdtempSync(join(tmpdir(), 'msm-live-views-'));
  const folders = {
    projectDir: join(base, NAMESPACE),
    outDir: join(base, 'out'),
    msmHome: join(base, 'msm-home'),
  };
  cpSync(join(FIXTURE, 'content'), join(folders.projectDir, 'content'), { recursive: true });
  cpSync(join(FIXTURE, 'msm.project.json'), join(folders.projectDir, 'msm.project.json'));
  const launched = await launchApp({ ...options, reuse: folders });
  launches.push(launched);
  await launched.window.waitForLoadState('domcontentloaded');
  await launched.window.getByTestId('toolbar-open-project').click();
  await expect(launched.window.getByTestId(`element-row-${WEIGHTS_ID}`)).toBeVisible();
  return launched;
}

/** Opens an element and returns its live view in the editor's preview, checked for the frame. */
async function openView(window: Page, id: string): Promise<Locator> {
  // A click that lands while the sidebar settles after the project opens (the Problems tab
  // coming up) can be lost: click until the row is the selected one.
  const row = window.getByTestId(`element-row-${id}`);
  await expect(async () => {
    await row.click();
    await expect(row).toHaveAttribute('aria-current', 'true', { timeout: 1_000 });
  }).toPass({ timeout: 15_000 });
  const view = window.getByTestId('editor-preview').getByTestId('live-view').first();
  // The first view of a launch loads its chunk and starts the live views worker; the shared
  // test machines can be slow at that.
  await expect(view).toBeVisible({ timeout: 30_000 });
  await expect(view.getByTestId('live-view-tag').first()).toHaveText('Preview');
  await expect(view.getByTestId('live-view-fidelity').first()).toHaveAttribute(
    'data-fidelity',
    /.+/,
  );
  await expect(view.getByTestId('live-view-not-yet')).toHaveCount(0);
  return view;
}

/** The odds once all 1,000 rolls are in: item id to chance, in the rows' order. */
async function settledOdds(view: Locator): Promise<[string, number][]> {
  const odds = view.getByTestId('odds');
  await expect(odds.getByTestId('odds-row-0')).toBeVisible();
  await expect(odds.getByTestId('odds-done')).toHaveCount(0);
  await expect(odds.getByTestId('odds-waiting')).toHaveCount(0);
  const rows = odds.locator('li[data-testid^="odds-row-"]');
  const out: [string, number][] = [];
  for (let index = 0; index < (await rows.count()); index += 1) {
    const row = rows.nth(index);
    out.push([
      (await row.getAttribute('data-item')) ?? '',
      Number(await row.getAttribute('data-chance')),
    ]);
  }
  return out;
}

function chanceOf(odds: readonly [string, number][], item: string): number {
  return odds.find(([id]) => id === item)?.[1] ?? Number.NaN;
}

/** The item of the roll's first stack. */
async function rolledItem(view: Locator): Promise<string> {
  const stack = view.getByTestId('roll-it-stack-0');
  await expect(stack).toBeVisible();
  return (await stack.getAttribute('data-item')) ?? '';
}

test('the data views: Roll it with a weight edit and a new seed, a predicate, a tag, the tree, a dialog', async () => {
  test.setTimeout(150_000);
  const { window } = await launchFixture();

  // Roll it: one roll and the odds of the weighted table. ----------------------------------
  let view = await openView(window, WEIGHTS_ID);
  await expect(view).toHaveAttribute('aria-label', 'Loot table');
  await expect(view.getByTestId('live-view-set-up')).toHaveCount(0);
  expect(WEIGHTED).toContain(await rolledItem(view));
  const before = await settledOdds(view);
  expect(before.map(([id]) => id).sort()).toEqual([...WEIGHTED].sort());
  // Weights 1 to 4 of 10, out of 1,000 seeded rolls (B605's sim is within 2 points of the game).
  for (const [index, item] of WEIGHTED.entries()) {
    expect(Math.abs(chanceOf(before, item) - (index + 1) / 10), item).toBeLessThan(0.05);
  }

  // A weight edit in the form: stone from 1 to 10 makes it the likeliest drop (10 of 19).
  await window.getByRole('button', { name: 'Expand entries item 1', exact: true }).click();
  const weight = window.getByRole('spinbutton', { name: 'weight', exact: true });
  await expect(weight).toHaveValue('1');
  const edited = Date.now();
  await weight.fill('10');
  await weight.press('Tab');
  const odds = view.getByTestId('odds');
  await expect
    .poll(() => odds.getByTestId('odds-row-0').getAttribute('data-item'), { intervals: [20] })
    .toBe('minecraft:stone');
  const firstStepMs = Date.now() - edited;
  console.log(`live-views-data-path: weight edit to the first odds step ${firstStepMs} ms`);
  expect(firstStepMs).toBeLessThan(EDIT_BUDGET_MS);
  const after = await settledOdds(view);
  expect(Math.abs(chanceOf(after, 'minecraft:stone') - 10 / 19)).toBeLessThan(0.05);
  expect(Math.abs(chanceOf(after, 'minecraft:gravel') - 4 / 19)).toBeLessThan(0.05);

  // A new seed changes the roll and never the odds (they roll with a fixed seed of their own).
  const seed = view.getByTestId('live-view-seed');
  const firstRoll = await rolledItem(view);
  let changed = false;
  for (const next of ['2', '3', '4', '5', '6', '7', '8', '9', '10', '11']) {
    await seed.fill(next);
    await seed.press('Enter');
    await expect(seed).toHaveValue(next);
    changed = await expect
      .poll(() => rolledItem(view), { timeout: 1_500 })
      .not.toBe(firstRoll)
      .then(
        () => true,
        () => false,
      );
    expect(await settledOdds(view)).toEqual(after);
    if (changed) break;
  }
  expect(changed, 'no seed of ten changed the roll').toBe(true);

  // A predicate: unknown without weather, yes in the rain, no when clear. ------------------
  view = await openView(window, `${NAMESPACE}:raining`);
  const answer = view.getByTestId('predicate-answer');
  await expect(answer).toHaveAttribute('data-answer', 'unknown');
  await expect(answer).toHaveText('Only the game knows');
  await view.getByTestId('situation-advanced').click();
  const weather = view.getByTestId('situation-field-weather');
  await weather.selectOption('rain');
  await expect(answer).toHaveAttribute('data-answer', 'yes');
  await expect(answer).toHaveText('Yes');
  await expect(view.getByTestId('situation-custom')).toBeVisible();
  await weather.selectOption('clear');
  await expect(answer).toHaveAttribute('data-answer', 'no');
  await expect(answer).toHaveText('No');

  // A tag: its members, where each came from, and the banner for Minecraft's tag it names. ---
  view = await openView(window, `${NAMESPACE}:tags_inside`);
  await expect(view.getByTestId('tag-count')).toHaveText('Everything in it: 3 things');
  const members = view.getByTestId('tag-member');
  await expect(members).toHaveCount(3);
  const ids = await members.evaluateAll((rows) =>
    rows.map((row) => `${row.getAttribute('data-id')} ${row.getAttribute('data-chain')}`),
  );
  expect(ids.sort()).toEqual([
    `minecraft:dirt ${NAMESPACE}:plain`,
    'minecraft:sand ',
    `minecraft:stone ${NAMESPACE}:plain`,
  ]);
  await expect(view.getByTestId('tag-members')).toContainText(
    `minecraft:sand comes from your #${NAMESPACE}:tags_inside`,
  );
  // `#minecraft:logs` needs the jar: the banner, never a claim that the game drops it.
  await expect(view.getByTestId('live-view-set-up')).toBeVisible();
  await expect(view.getByTestId('tag-dropped')).toHaveCount(0);

  // The advancement tree: this one lit, its parent and children marked. --------------------
  view = await openView(window, `${NAMESPACE}:tab/a`);
  const node = (id: string) => view.locator(`[data-testid="advancement-node"][data-id="${id}"]`);
  await expect(node(`${NAMESPACE}:tab/a`)).toHaveAttribute('data-state', 'this');
  await expect(node(`${NAMESPACE}:tab/root`)).toHaveAttribute('data-state', 'parent');
  await expect(node(`${NAMESPACE}:tab/a1`)).toHaveAttribute('data-state', 'child');
  await expect(node(`${NAMESPACE}:tab/b`)).toHaveAttribute('data-state', 'other');
  // The root is column 0 and its child column 1.
  await expect(node(`${NAMESPACE}:tab/root`)).toHaveAttribute('data-x', '0');
  await expect(node(`${NAMESPACE}:tab/a`)).toHaveAttribute('data-x', '1');
  // The one without a display is not drawn.
  await expect(node(`${NAMESPACE}:tab/nodisplay`)).toHaveCount(0);
  await expect(view.getByTestId('advancement-criterion')).toHaveAttribute('data-name', 'c0');

  // A dialog: drawn, and its button says what it would do. -------------------------------
  view = await openView(window, `${NAMESPACE}:notice`);
  await expect(view.getByTestId('dialog-screen')).toBeVisible();
  await expect(view.getByTestId('dialog-title')).toHaveText('Notice');
  const said = view.getByTestId('dialog-said');
  await expect(said).toHaveText('Press a button to see what it would do.');
  await view.getByTestId('dialog-button').filter({ hasText: 'OK' }).click();
  await expect(said).toContainText('say hi');
});

test('a function: its lines marked, and Run in Try it runs it in Try it', async () => {
  const { window } = await launchFixture({ args: WEBGL_ARGS });
  const id = `${NAMESPACE}:scores`;
  const view = await openView(window, id);
  await expect(view.getByTestId('function-view-summary')).toHaveText(
    'Runs in Try it: every line (4).',
  );
  const lines = view.getByTestId('function-view-line');
  await expect(lines).toHaveCount(4);
  for (const line of await lines.all()) await expect(line).toContainText('Runs in Try it');

  for (const line of await lines.all()) await expect(line).toHaveAttribute('data-runs', 'true');

  // The editor's own summary (Monaco draws the marks in its glyph margin; the plain editor's
  // column has the test id `function-line-mark`).
  const summary = window.getByTestId('function-run-summary');
  await expect(summary).toHaveAttribute('data-runs', '4');
  await expect(summary).toHaveAttribute('data-lines', '4');
  await expect(window.getByTestId('function-not-run')).toHaveCount(0);

  // Run in Try it: Try it opens and says the run in What happened.
  await window.getByTestId('function-run-in-tryit').click();
  await expect(window.getByTestId('tryit-view')).toBeVisible();
  const log = window.getByTestId('tryit-log');
  await expect(
    log
      .getByTestId('tryit-log-line')
      .filter({ hasText: `from function ${id}.` })
      .first(),
  ).toBeVisible({ timeout: 30_000 });
  await expect(log.getByTestId('tryit-log-only')).toHaveCount(0);
});

test('the Creator: the Mob flow opens on Live and its view follows an answer', async () => {
  const { window } = await launchFixture();
  await window.getByTestId('toolbar-creator').click();
  const dialog = window.getByTestId('creator-dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByTestId('creator-flow-custom_mob').click();
  await expect(dialog.getByTestId('creator-tab-live')).toHaveAttribute('aria-selected', 'true');
  const live = dialog.getByTestId('creator-live');
  await expect(live.getByTestId('live-view')).toBeVisible({ timeout: 15_000 });
  await expect(live.getByTestId('live-view-tag')).toHaveText('Preview');
  const words = live.getByTestId('live-mob-words');
  await expect(words).not.toBeEmpty();
  const before = (await words.textContent()) ?? '';

  await dialog.getByTestId('param-mob_name').fill('Bramble Beast');
  await expect(words).not.toHaveText(before);
  await expect(words).toContainText('Bramble Beast');

  // Looking made nothing.
  await window.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(window.locator('[data-testid^="element-row-"][data-testid*="bramble"]')).toHaveCount(
    0,
  );
});

test('the AI helper: See it rolls a proposed loot table before it is added', async () => {
  const tableId = `${NAMESPACE}:ai_drops`;
  const scriptBase = mkdtempSync(join(tmpdir(), 'msm-live-views-ai-'));
  const script = join(scriptBase, 'see-it.script.json');
  writeFileSync(
    script,
    JSON.stringify({
      turns: [
        {
          content: [
            { type: 'text', text: 'I have proposed a loot table that drops diamonds or emeralds.' },
            {
              type: 'tool_use',
              name: 'create_elements',
              input: {
                elements: [
                  {
                    id: tableId,
                    kind: 'minecraft:loot_table',
                    data: {
                      type: 'minecraft:chest',
                      pools: [
                        {
                          rolls: 1,
                          entries: [
                            { type: 'minecraft:item', name: 'minecraft:diamond', weight: 1 },
                            { type: 'minecraft:item', name: 'minecraft:emerald', weight: 3 },
                          ],
                        },
                      ],
                    },
                  },
                ],
              },
            },
          ],
          usage: { inputTokens: 900, outputTokens: 200 },
        },
        {
          content: [{ type: 'tool_use', name: 'run_checks', input: { scope: 'pending' } }],
          usage: { inputTokens: 300, outputTokens: 40 },
        },
        {
          content: [
            {
              type: 'text',
              text: 'The checks report no errors. Nothing is in your mod until you add it.',
            },
          ],
          stopReason: 'end_turn',
          usage: { inputTokens: 300, outputTokens: 40 },
        },
      ],
    }),
  );
  try {
    const { window } = await launchFixture({ aiScript: script });
    await window.keyboard.press('ControlOrMeta+Shift+P');
    const palette = window.getByTestId('command-palette');
    await palette.getByTestId('command-palette-input').fill('AI helper');
    await palette.getByTestId('command-aiHelper').click();
    const panel = window.getByTestId('ai-panel');
    await expect(panel).toBeVisible();
    await panel.getByTestId('ai-mode-chat').click();
    await panel.getByTestId('ai-input').fill('Add a chest loot table with diamonds and emeralds.');
    await panel.getByTestId('ai-send').click();
    await expect(panel.getByTestId('ai-transcript')).toContainText('The checks report no errors');
    await expect(panel.getByTestId('ai-stop')).toBeHidden();

    // See it: the proposed table rolled before Apply; the project does not have it yet.
    const seeIt = panel.getByTestId('ai-see-it');
    await expect(seeIt).toBeVisible();
    await expect(seeIt.getByTestId('ai-see-it-thing-1')).toHaveAttribute('data-element', tableId);
    const view = seeIt.getByTestId('live-view');
    await expect(view).toBeVisible({ timeout: 15_000 });
    await expect(view.getByTestId('live-view-tag')).toHaveText('Preview');
    expect(['minecraft:diamond', 'minecraft:emerald']).toContain(await rolledItem(view));
    const odds = await settledOdds(view);
    expect(Math.abs(chanceOf(odds, 'minecraft:emerald') - 0.75)).toBeLessThan(0.05);
    await expect(window.getByTestId(`element-row-${tableId}`)).toHaveCount(0);

    await panel.getByTestId('ai-apply').click();
    await expect(seeIt).toBeHidden();
    await expect(window.getByTestId(`element-row-${tableId}`)).toBeVisible();
    await window.getByTestId('toolbar-save').click();
    await expect(window.locator('footer').getByText('Saved', { exact: true })).toBeVisible();
  } finally {
    rmSync(scriptBase, { recursive: true, force: true });
  }
});
