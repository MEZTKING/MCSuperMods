/**
 * The commands path (ADR 0096, ADR 0101 D6; brief B465). A brand-new install
 * (`MSM_E2E_NEW_INSTALL`) opens Home in Very easy; "Start a new mod" makes the mod by name.
 *
 * 1. Home's "Make your mod do something" tile offers the Custom command and Creative tab flows;
 *    both run with their defaults (`/heal`, the tab "My Blocks" with its first block), My things
 *    lists the tab and Things to fix has nothing to fix and no tips.
 * 2. A command made in the Command Studio (Advanced) from the "Help command" template: its name,
 *    two values to type (a whole number from 1 to 64, and a player that may be left out), the
 *    preview of how it is typed, and a new event with a Heal action picked under "What it does";
 *    the saved command holds all of it.
 * 3. Back in Very easy, Things to fix still has nothing to fix and no tips.
 *
 * Left out: a Rules command trigger. The Rules catalogue has no trigger for commands (B460,
 * checked again at B465), so the Command Studio shows no Rules section; the path asserts that.
 */

import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, type Page, test } from 'playwright/test';
import {
  expectStatusAgrees,
  type LaunchedApp,
  launchApp,
  openAddDialog,
  outputDir,
} from './fixtures';

const MOD_NAME = 'Chat Mod';
const EVENT_ID = 'give_gift';

let base: string | undefined;
let launched: LaunchedApp | undefined;
const savedEnv: Record<string, string | undefined> = {};

test.afterEach(async () => {
  await launched?.close();
  launched = undefined;
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  if (base !== undefined) rmSync(base, { recursive: true, force: true });
  base = undefined;
});

/** Things to fix shows nothing to fix and no tips (warnings and info included). */
async function expectNothingToFix(window: Page): Promise<void> {
  const fix = window.getByTestId('things-to-fix');
  await expect(fix.getByTestId('things-to-fix-none')).toBeVisible({ timeout: 30_000 });
  await expect(fix.getByTestId('things-to-fix-tips')).toHaveCount(0);
}

/** Runs `flowId` from Home's "Make your mod do something" tile with its defaults. */
async function makeFromCommandsTile(window: Page, flowId: string): Promise<void> {
  await window.getByTestId('toolbar-home').click();
  await window.getByTestId('home').getByTestId('home-tile-commands').click();
  const creator = window.getByTestId('creator-dialog');
  await expect(creator).toBeVisible();
  await creator.getByTestId(`creator-flow-${flowId}`).click();
  const create = creator.getByTestId('creator-create');
  await expect(create).toBeEnabled({ timeout: 30_000 });
  await create.click();
  await expect(creator).toBeHidden({ timeout: 30_000 });
}

test('commands: the flows with defaults, a command in its Studio, nothing to fix', async () => {
  test.setTimeout(180_000);
  base = mkdtempSync(join(tmpdir(), 'msm-commands-'));
  const folders = {
    projectDir: join(base, 'picked'),
    outDir: join(base, 'out'),
    msmHome: join(base, 'msm-home'),
  };
  mkdirSync(outputDir, { recursive: true });
  savedEnv.MSM_E2E_NEW_INSTALL = process.env.MSM_E2E_NEW_INSTALL;
  process.env.MSM_E2E_NEW_INSTALL = '1';

  launched = await launchApp({ reuse: folders });
  const { window } = launched;
  await window.waitForLoadState('domcontentloaded');

  const welcome = window.getByTestId('welcome-dialog');
  await expect(welcome).toBeVisible();
  await welcome.getByRole('button', { name: 'Got it' }).click();
  await expect(welcome).toBeHidden();
  const home = window.getByTestId('home');
  await expect(home).toBeVisible();

  // A new mod by name. ------------------------------------------------------------------------
  await home.getByTestId('home-new').click();
  const newMod = window.getByTestId('new-mod-dialog');
  await newMod.getByTestId('new-mod-name').fill(MOD_NAME);
  await newMod.getByTestId('new-mod-dialog-submit').click();
  await expect(newMod).toBeHidden();
  const projectDir = join(folders.msmHome, 'Documents', 'MCSuperMods', MOD_NAME);
  await expect.poll(() => existsSync(join(projectDir, 'msm.project.json'))).toBe(true);
  const manifest = JSON.parse(readFileSync(join(projectDir, 'msm.project.json'), 'utf8')) as {
    namespaces: string[];
  };
  const ns = manifest.namespaces[0] ?? '';
  expect(ns).not.toBe('');
  const id = (path: string) => `${ns}:${path}`;

  // The Custom command and Creative tab flows with their defaults. ----------------------------
  await makeFromCommandsTile(window, 'custom-command');
  await expectNothingToFix(window);
  await makeFromCommandsTile(window, 'creative-tab');
  await expectNothingToFix(window);
  await window.getByTestId('toolbar-home').click();
  // My things shows the tab through its first block. A command is not a card kind of My things
  // (`components/home/things.ts` `THING_KINDS`), so the command is not listed there (B465 report).
  await expect(home.getByTestId('my-things')).toContainText('My Blocks');
  // Commands are My things cards too (orchestrator, after B465).
  await expect(home.getByTestId('my-things')).toContainText('heal');

  // Advanced: a command made in the Command Studio. -------------------------------------------
  await expect(window.getByTestId(`element-row-${id('heal')}`)).toBeVisible();
  await openAddDialog(window);
  const add = window.getByTestId('new-element-dialog');
  await expect(add).toBeVisible();
  await add.getByTestId('new-element-filter').fill('help command');
  await add.getByTestId('template-msm_command_help').check();
  await expect(add.getByTestId('new-element-namespace')).toHaveValue(ns);
  await add.getByTestId('new-element-name').fill('gift');
  await add.getByTestId('new-element-dialog-submit').click();
  await expect(add).toBeHidden();
  const studio = window.getByTestId('command-studio');
  await expect(studio).toBeVisible();

  // Name.
  await studio.getByTestId('command-name').fill('gift_box');
  await expect(studio.getByTestId('command-usage')).toHaveText('/gift_box');

  // Two values to type: a whole number from 1 to 64, and a player that may be left out.
  await expect(studio.getByTestId('command-no-arguments')).toBeVisible();
  await studio.getByTestId('command-add-argument').click();
  const amount = studio.getByTestId('command-argument-0');
  await amount.getByTestId('command-argument-0-name').fill('amount');
  await amount.getByTestId('command-argument-0-type').selectOption('integer');
  const lowest = amount.getByTestId('command-argument-0-min');
  await lowest.fill('1');
  await lowest.press('Enter');
  const highest = amount.getByTestId('command-argument-0-max');
  await highest.fill('64');
  await highest.press('Enter');
  await studio.getByTestId('command-add-argument').click();
  const who = studio.getByTestId('command-argument-1');
  await who.getByTestId('command-argument-1-name').fill('who');
  await who.getByTestId('command-argument-1-type').selectOption('player');
  await who.getByTestId('command-argument-1-optional').check();
  await expect(studio.getByTestId('command-usage')).toHaveText('/gift_box <amount> [who]');
  await expect(studio.getByTestId('command-usage-key')).toContainText('A whole number');
  await expect(studio.getByTestId('command-usage-key')).toContainText('may be left out');

  // An event of its own, with a Heal action, picked under "What it does".
  const events = studio.getByTestId('msm-events');
  await events.getByLabel('New event id').fill(EVENT_ID);
  await events.getByRole('button', { name: 'Add event' }).click();
  const event = events.getByTestId(`msm-event-${EVENT_ID}`);
  await expect(event).toBeVisible();
  await event.getByLabel(`New action type for ${EVENT_ID}`).selectOption('heal');
  await event.getByRole('button', { name: `Add action to ${EVENT_ID}` }).click();
  await expect(event.getByTestId('msm-action-0')).toBeVisible();
  await expect(studio.getByTestId('command-runs')).toHaveValue('event');
  await studio.getByTestId('command-event').selectOption(EVENT_ID);
  await expect(studio.getByTestId('command-event')).toHaveValue(EVENT_ID);
  await studio.getByTestId('command-feedback').fill('Here you are!');

  // A Rules section: the Rules catalogue has a trigger for commands (B458).
  await expect(studio.getByTestId('rules-section')).toBeVisible();
  await expectStatusAgrees(window);

  await window.getByTestId('toolbar-save').click();
  await expect(window.locator('footer').getByText('Saved', { exact: true })).toBeVisible();
  const command = (
    JSON.parse(readFileSync(join(projectDir, 'content', ns, 'command', 'gift.json'), 'utf8')) as {
      data: Record<string, unknown>;
    }
  ).data as {
    name: string;
    arguments: Record<string, unknown>[];
    event: string;
    events: Record<string, { actions: { type: string }[] }>;
    feedback_text: string;
  };
  expect(command.name).toBe('gift_box');
  expect(command.arguments).toEqual([
    { name: 'amount', type: 'integer', min: 1, max: 64 },
    { name: 'who', type: 'player', optional: true },
  ]);
  expect(command.event).toBe(EVENT_ID);
  expect(command.events[EVENT_ID]?.actions.map((action) => action.type)).toEqual(['heal']);
  expect(command.feedback_text).toBe('Here you are!');
  await window.screenshot({ path: join(outputDir, 'commands-path.png') });

  // Back to Very easy: nothing to fix. ---------------------------------------------------------
  await window.getByTestId('toolbar-home').click();
  await window.getByTestId('toolbar-home').click();
  await expect(home).toBeVisible();
  await expectNothingToFix(window);
});
