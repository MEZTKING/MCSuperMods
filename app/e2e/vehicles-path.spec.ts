/**
 * The vehicles path (ADR 0091 D7; brief B427). A brand-new install (`MSM_E2E_NEW_INSTALL`) opens
 * Home in Very easy; "Start a new mod" makes the mod by name.
 *
 * 1. Home's "Make a vehicle" tile runs the Tank and Car flows with their defaults; Things to fix
 *    has nothing to fix and no tips, and My things lists both vehicles.
 * 2. The Vehicle Studio: the tank's speed and seats change in its Basics (Very easy); in Advanced
 *    a Go-kart from its template gets "Make a starter model" (a geo model and a painted texture)
 *    and an item picture; the tank gets a second weapon.
 * 3. Rules: the tank's Rules section adds "Someone gets in the vehicle" picked from the When
 *    chip, with "Show on screen" and the HUD element picked from the HUD menu; the Rule book
 *    Studio adds the same trigger for the car through the vehicle picker.
 * 4. Back in Very easy, Things to fix still has nothing to fix and no tips.
 */

import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, type Locator, type Page, test } from 'playwright/test';
import { type LaunchedApp, launchApp, openAddDialog, outputDir } from './fixtures';

const MOD_NAME = 'Garage Mod';

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

/** Runs `flowId` from Home's "Make a vehicle" tile with its defaults. */
async function makeVehicle(window: Page, flowId: string): Promise<void> {
  await window.getByTestId('toolbar-home').click();
  await window.getByTestId('home').getByTestId('home-tile-vehicle').click();
  const creator = window.getByTestId('creator-dialog');
  await expect(creator).toBeVisible();
  await expect(creator.getByTestId('creator-group-vehicles')).toBeVisible();
  await creator.getByTestId(`creator-flow-${flowId}`).click();
  const create = creator.getByTestId('creator-create');
  await expect(create).toBeEnabled({ timeout: 30_000 });
  await create.click();
  await expect(creator).toBeHidden({ timeout: 30_000 });
}

/**
 * Opens a chip's or menu button's popover and chooses the entry named `name` (or with test id
 * `testId`). The popover can reach past the bottom of the window, so the choice is clicked
 * through its DOM event.
 */
async function pickFromMenu(
  window: Page,
  opener: Locator,
  choice: { name: string } | { testId: string },
): Promise<void> {
  await opener.click();
  const entry =
    'name' in choice
      ? window.getByRole('button', { name: choice.name, exact: true })
      : window.getByTestId(choice.testId);
  await expect(entry).toBeAttached();
  await entry.dispatchEvent('click');
}

/** The `data` of a saved element file. */
function savedData(projectDir: string, ns: string, folder: string, path: string) {
  const file = join(projectDir, 'content', ns, folder, `${path}.json`);
  return (JSON.parse(readFileSync(file, 'utf8')) as { data: Record<string, unknown> }).data;
}

/** Adds an element from template `templateId` through the New element dialog. */
async function addFromTemplate(
  window: Page,
  ns: string,
  filter: string,
  templateId: string,
  name: string,
): Promise<void> {
  await openAddDialog(window);
  const add = window.getByTestId('new-element-dialog');
  await expect(add).toBeVisible();
  await add.getByTestId('new-element-filter').fill(filter);
  await add.getByTestId(`template-${templateId}`).check();
  await expect(add.getByTestId('new-element-namespace')).toHaveValue(ns);
  await add.getByTestId('new-element-name').fill(name);
  await add.getByTestId('new-element-dialog-submit').click();
  await expect(add).toBeHidden();
}

test('vehicles: the Tank and Car flows, the Vehicle Studio, a Rules get-in card, nothing to fix', async () => {
  test.setTimeout(240_000);
  base = mkdtempSync(join(tmpdir(), 'msm-vehicles-'));
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

  // The Tank and Car flows with their defaults. -----------------------------------------------
  await expect(home.getByTestId('home-group-vehicles')).toBeVisible();
  await makeVehicle(window, 'vehicle-tank');
  await expectNothingToFix(window);
  await makeVehicle(window, 'vehicle-car');
  await expectNothingToFix(window);
  await window.getByTestId('toolbar-home').click();
  const things = home.getByTestId('my-things');
  await expect(things).toContainText('Battle Tank');
  await expect(things).toContainText('Racing Car');

  // The Vehicle Studio's Basics: speed and seats. --------------------------------------------
  // The tank's card (its shell has a card of its own).
  await things.getByRole('button', { name: /^Battle Tank, / }).click();
  const studio = window.getByTestId('vehicle-studio');
  await expect(studio).toBeVisible();
  const basics = studio.getByTestId('vehicle-basics');
  await expect(basics.getByTestId('vehicle-basics-speed')).toHaveValue('5');
  await basics.getByTestId('vehicle-basics-speed').fill('7');
  await expect(basics).toContainText('7 blocks a second');
  await basics.getByTestId('vehicle-basics-seats').selectOption('3');
  await expect(basics.getByTestId('vehicle-basics-seats')).toHaveValue('3');
  // The rest of the Vehicle Studio, each section with its More options (ADR 0130). ------------
  await window.getByTestId(`element-row-${id('battle_tank')}`).click();
  await expect(studio).toBeVisible();
  await expect(studio.getByTestId('vehicle-seat-2')).toBeVisible();
  await expect(studio.getByTestId('vehicle-seat-marker-2')).toBeAttached();

  // A second weapon.
  const weapons = studio.getByTestId('vehicle-weapons');
  await expect(weapons.getByTestId('vehicle-weapon-0')).toBeVisible();
  await expect(weapons.getByTestId('vehicle-weapon-1')).toHaveCount(0);
  await weapons.getByTestId('vehicle-add-weapon').click();
  await expect(weapons.getByTestId('vehicle-weapon-1')).toBeVisible();

  // A Go-kart from its template, with a starter model and an item picture.
  await addFromTemplate(window, ns, 'go-kart', 'msm_vehicle_go_kart', 'kart');
  await expect(studio).toBeVisible();
  const model = studio.getByTestId('vehicle-model');
  // A ground vehicle suggests the car shape; the kart's own is picked.
  await expect(model.getByTestId('vehicle-starter-shape')).toHaveValue('car');
  await model.getByTestId('vehicle-starter-shape').selectOption('go_kart');
  await model.getByTestId('vehicle-make-starter-model').click();
  await expect(model.getByTestId('vehicle-starter-status')).toContainText(
    `Made ${id('entity/kart')}`,
  );
  await expect(window.getByTestId(`element-row-${id('entity/kart')}`)).toBeVisible();
  await expect(model.getByTestId('vehicle-make-starter-model')).toHaveText(
    'Replace with a starter model',
  );
  const itemPicture = studio.getByTestId('vehicle-item-texture');
  await itemPicture.fill(`${ns}:item/racing_car`);
  await itemPicture.press('Enter');
  await expect(window.getByTestId('status-things-to-fix')).toHaveCount(0);

  // Rules: "Someone gets in the vehicle" shows a HUD element. --------------------------------
  await addFromTemplate(window, ns, 'coordinates', 'msm_hud_coordinates', 'height');
  await expect(window.getByTestId('hud-studio')).toBeVisible();
  await window.getByTestId(`element-row-${id('battle_tank')}`).click();
  await expect(studio).toBeVisible();
  const section = studio.getByTestId('rules-section');
  await expect(section.getByTestId('rules-section-empty')).toBeVisible();
  await section.getByTestId('rules-section-add').click();
  const card = section.getByTestId('rule-card');
  await expect(card).toHaveCount(1);
  await pickFromMenu(window, card.getByTestId('rules-chip-trigger'), {
    testId: 'rules-trigger-vehicle_mounted',
  });
  await expect(card.getByTestId('rules-chip-subject')).toHaveText('Battle Tank');
  await expect(card.getByTestId('rule-sentence')).toHaveText(
    'When someone gets in Battle Tank, nothing.',
  );
  await pickFromMenu(window, card.getByTestId('rules-add-step-do'), { name: 'Show on screen' });
  const hudChip = card.getByTestId('rules-chip-hud');
  await pickFromMenu(window, hudChip, { testId: `rules-hud-${id('height')}` });
  await window.keyboard.press('Escape');
  await expect(hudChip).toHaveText('Height');
  await expect(card.getByTestId('rule-sentence')).toContainText(
    'When someone gets in Battle Tank, show Height to',
  );
  await expect(card.getByRole('alert')).toHaveCount(0);

  // The Rule book Studio: the same trigger for the car, picked through the vehicle picker.
  await section.getByTestId('rules-section-open-book').click();
  const book = window.getByTestId('rule-book-studio');
  await expect(book).toBeVisible();
  await book.getByTestId('rule-add').click();
  const cards = book.getByTestId('rule-card');
  await expect(cards).toHaveCount(2);
  const carRule = cards.nth(1);
  await pickFromMenu(window, carRule.getByTestId('rules-chip-trigger'), {
    testId: 'rules-trigger-vehicle_mounted',
  });
  const subject = carRule.getByTestId('rules-chip-subject');
  await expect(subject).toHaveAccessibleName('Thing: pick one of your vehicles');
  await subject.click();
  const picker = window.getByTestId('thing-picker');
  await expect(picker).toBeVisible();
  await picker.getByTestId('thing-search').fill('car');
  await picker.getByTestId(`thing-${id('racing_car')}`).click();
  await expect(picker).toBeHidden();
  await expect(subject).toHaveAccessibleName('Thing: Racing Car');
  await pickFromMenu(window, carRule.getByTestId('rules-add-step-do'), { name: 'Show on screen' });
  await pickFromMenu(window, carRule.getByTestId('rules-chip-hud'), {
    testId: `rules-hud-${id('height')}`,
  });
  await window.keyboard.press('Escape');
  await expect(carRule.getByTestId('rule-sentence')).toContainText(
    'When someone gets in Racing Car, show Height to',
  );
  await expect(window.getByTestId('rule-book-error')).toHaveCount(0);
  await expect(window.getByTestId('status-things-to-fix')).toHaveCount(0);

  // Save: the files hold every change. ---------------------------------------------------------
  await window.getByTestId('toolbar-save').click();
  await expect(window.locator('footer').getByText('Saved', { exact: true })).toBeVisible();
  const tank = savedData(projectDir, ns, 'vehicle', 'battle_tank') as {
    movement: { max_speed: number };
    seats: unknown[];
    weapons: unknown[];
  };
  expect(tank.movement.max_speed).toBeCloseTo(0.35, 5);
  expect(tank.seats).toHaveLength(3);
  expect(tank.weapons).toHaveLength(2);
  const kart = savedData(projectDir, ns, 'vehicle', 'kart') as {
    model: { geometry: string; texture: string };
  };
  expect(kart.model).toMatchObject({ geometry: id('entity/kart'), texture: id('entity/kart') });
  expect(existsSync(join(projectDir, 'assets', ns, 'textures', 'entity', 'kart.png'))).toBe(true);
  const rules = savedData(projectDir, ns, 'rules', 'rules') as {
    rules: { when: { trigger: string; subject: string }; do: { step: string; hud: string }[] }[];
  };
  expect(rules.rules.map((rule) => [rule.when.trigger, rule.when.subject])).toEqual([
    ['vehicle_mounted', id('battle_tank')],
    ['vehicle_mounted', id('racing_car')],
  ]);
  for (const rule of rules.rules) {
    expect(rule.do).toMatchObject([{ step: 'show_hud', hud: id('height') }]);
  }
  await window.screenshot({ path: join(outputDir, 'vehicles-path.png') });

  // Back to Very easy: nothing to fix. ---------------------------------------------------------
  await window.getByTestId('toolbar-home').click();
  await window.getByTestId('toolbar-home').click();
  await expect(home).toBeVisible();
  await expectNothingToFix(window);
});
