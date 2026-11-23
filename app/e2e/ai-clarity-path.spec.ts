/**
 * The AI helper is not confusing (ADR 0125, B690): the walks of the clarity plan's "Tests",
 * each on a new install in Very easy unless said, driven by the scripted model
 * (`MSM_E2E_AI_SCRIPT`, one client per launch; `test/fixtures/ai/clarity-*.script.json`), whose
 * turns can wait (`delayMs`) and fail (`error`), so no key or network is involved.
 *
 * 1. No key: the Welcome's AI line keeps a typed description beside the set-up card; Home's AI
 *    tile shows the card (three steps, the typical cost sentence); the toolbar's helper and
 *    **All AI helper settings** land on Settings with the helper's section in view.
 * 2. A small ask: a turn delayed by two seconds reads "Thinking…" with a rising number within
 *    300 ms of Send, with Stop and nothing else claiming to work; "make a ruby sword" ends at
 *    "1 thing is ready. Nothing is in your mod yet."; the tray holds one card, "Ruby Sword", with
 *    a picture of more than one colour; no id or forbidden word anywhere in the panel. A second
 *    ask answered by a question: the answer lies inside the conversation's visible box. Adding:
 *    the notice names the thing, **Show me** opens it, the toolbar's Undo says "Taken out
 *    again.", **Put back** puts it back.
 * 3. A plan: it arrives inside the visible box, the state line says it is the user's turn and
 *    nothing says it is working; "go" and Enter build it. It cannot do it: "Wrote down a wish: …"
 *    and Help > Wishlist holds the wish.
 * 4. Ask the helper on a Things to fix row (the chip in plain words, the exact block folded, the
 *    sent message without an id), then the failures: a key not accepted, no credit, a busy
 *    service (Try again succeeds on the next turn), no connection, and a limit stop with
 *    **Keep going**: each one sentence and one button.
 * 5. Easy and Advanced (a fresh profile, a blank project): Easy's cards with **Files behind
 *    this**; Advanced's ids, kinds, **Before and after**, **Apply**, the limits popover and the
 *    chip of **Ask AI**. Explain on a Problems row is `ai-path`'s second test.
 */

import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, type Locator, type Page, test } from 'playwright/test';
import {
  appDir,
  type LaunchedApp,
  launchApp,
  newProjectInFolder,
  openMoreOptions,
  outputDir,
} from './fixtures';

const SCRIPTS = join(appDir, 'test', 'fixtures', 'ai');
const MOD_NAME = 'Ruby Mod';

/**
 * Words Very easy never shows, as `VERY_EASY_FORBIDDEN` of `components/ai/ai-words.ts` (the
 * e2e specs import nothing from the renderer), and the id pattern of the same file.
 */
const FORBIDDEN = [
  'msm:',
  'minecraft:',
  'json',
  'api',
  'token',
  'tool turn',
  'element',
  'changeset',
  'schema',
  'starter',
  'request',
  'placeholder',
];
const ID_PATTERN = /\b[a-z0-9_.-]+:[a-z0-9_./-]+\b/;

/** The state line's words while the helper works. */
const WORKING = /Thinking…|Looking at your mod…|Making it…|Checking it works…/;

let base: string | undefined;
const launches: LaunchedApp[] = [];
const savedEnv: Record<string, string | undefined> = {};

test.afterEach(async () => {
  for (const launched of launches.splice(0)) await launched.close();
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
    delete savedEnv[key];
  }
  if (base !== undefined) rmSync(base, { recursive: true, force: true });
  base = undefined;
});

function setEnv(key: string, value: string): void {
  if (!(key in savedEnv)) savedEnv[key] = process.env[key];
  process.env[key] = value;
}

/** Launches a new install (the Welcome in Very easy), with the scripted model when given. */
async function launchNewInstall(prefix: string, script?: string): Promise<LaunchedApp> {
  base = mkdtempSync(join(tmpdir(), prefix));
  mkdirSync(outputDir, { recursive: true });
  setEnv('MSM_E2E_NEW_INSTALL', '1');
  const launched = await launchApp({
    reuse: {
      projectDir: join(base, 'picked'),
      outDir: join(base, 'out'),
      msmHome: join(base, 'msm-home'),
    },
    ...(script === undefined ? {} : { aiScript: join(SCRIPTS, script) }),
  });
  launches.push(launched);
  await launched.window.waitForLoadState('domcontentloaded');
  return launched;
}

/** Leaves the Welcome (still in Very easy) and lands on Home. */
async function passWelcome(window: Page): Promise<void> {
  const welcome = window.getByTestId('welcome-dialog');
  await expect(welcome).toBeVisible();
  await welcome.getByRole('button', { name: 'Got it' }).click();
  await expect(welcome).toBeHidden();
  await expect(window.getByTestId('home')).toBeVisible();
}

/** Very easy's New: a mod by name only. */
async function newMod(window: Page): Promise<void> {
  const home = window.getByTestId('home');
  await home.getByTestId('home-new').click();
  const dialog = window.getByTestId('new-mod-dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByTestId('new-mod-name').fill(MOD_NAME);
  await dialog.getByTestId('new-mod-dialog-submit').click();
  await expect(dialog).toBeHidden();
  await expect(home.getByTestId('my-things-empty')).toBeVisible();
}

/** Opens the helper from Home's AI tile (a mod is open: the panel, not the start dialog). */
async function openFromTile(window: Page): Promise<Locator> {
  await window.getByTestId('home').getByTestId('home-tile-ai').click();
  const panel = window.getByTestId('ai-panel');
  await expect(panel).toBeVisible();
  return panel;
}

/** Every text of `panel` a user can read or hear, as the unit test's sweep reads them. */
async function readable(panel: Locator): Promise<string[]> {
  return panel.evaluate((root) => {
    const texts = [root.textContent ?? ''];
    for (const element of [root, ...root.querySelectorAll('*')]) {
      for (const name of ['placeholder', 'title', 'aria-label', 'alt']) {
        const value = element.getAttribute(name);
        if (value !== null && value !== '') texts.push(value);
      }
    }
    return texts;
  });
}

/** Expects no id and none of Very easy's forbidden words anywhere in `panel`. */
async function expectPlain(panel: Locator, moment: string): Promise<void> {
  const found: string[] = [];
  for (const text of await readable(panel)) {
    const lower = text.toLowerCase();
    for (const word of FORBIDDEN) if (lower.includes(word)) found.push(word);
    const id = ID_PATTERN.exec(text);
    if (id !== null) found.push(id[0]);
  }
  expect(found, moment).toEqual([]);
}

/** Whether `inner`'s box lies inside `outer`'s (one pixel of slack). */
async function expectInside(inner: Locator, outer: Locator, what: string): Promise<void> {
  await expect
    .poll(
      async () => {
        const a = await inner.boundingBox();
        const b = await outer.boundingBox();
        if (a === null || b === null) return false;
        return a.y >= b.y - 1 && a.y + a.height <= b.y + b.height + 1;
      },
      { message: what, timeout: 5_000 },
    )
    .toBe(true);
}

/** The parts of a loaded `<img>` and a 2D canvas the colour count reads (no DOM types here). */
interface PagePicture {
  complete: boolean;
  naturalWidth: number;
  naturalHeight: number;
}
interface PageCanvas {
  width: number;
  height: number;
  getContext(kind: '2d'): {
    drawImage(picture: PagePicture, x: number, y: number): void;
    getImageData(x: number, y: number, w: number, h: number): { data: ArrayLike<number> };
  } | null;
}

/** The number of distinct colours of a loaded image, read through a canvas in the page. */
async function colourCount(image: Locator): Promise<number> {
  await expect
    .poll(() =>
      image.evaluate((element) => {
        const picture = element as unknown as PagePicture;
        return picture.complete && picture.naturalWidth > 0;
      }),
    )
    .toBe(true);
  return image.evaluate((element) => {
    const picture = element as unknown as PagePicture;
    const page = globalThis as unknown as {
      document: { createElement(name: 'canvas'): PageCanvas };
    };
    const canvas = page.document.createElement('canvas');
    canvas.width = picture.naturalWidth;
    canvas.height = picture.naturalHeight;
    const context = canvas.getContext('2d');
    if (context === null) return 0;
    context.drawImage(picture, 0, 0);
    const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
    const colours = new Set<number>();
    for (let i = 0; i < data.length; i += 4) {
      if ((data[i + 3] ?? 0) === 0) continue;
      colours.add(((data[i] ?? 0) << 16) | ((data[i + 1] ?? 0) << 8) | (data[i + 2] ?? 0));
    }
    return colours.size;
  });
}

/** The state line's one sentence. */
function statusText(panel: Locator): Locator {
  return panel.getByTestId('ai-status-text');
}

/** The state line's buttons (Stop and the one action). */
function statusButtons(panel: Locator): Locator {
  return panel.getByTestId('ai-status').locator('button');
}

/** Types into the message box and sends with the Send button. */
async function ask(panel: Locator, text: string): Promise<void> {
  await panel.getByTestId('ai-input').fill(text);
  await panel.getByTestId('ai-send').click();
}

/** Clicks an entry of the application menu (`menu` > `item`). */
async function clickMenu(launched: LaunchedApp, menu: string, item: string): Promise<void> {
  await launched.app.evaluate(
    ({ Menu, BrowserWindow }, names) => {
      const top = Menu.getApplicationMenu()?.items.find((entry) => entry.label === names.menu);
      const entry = top?.submenu?.items.find((candidate) => candidate.label === names.item);
      if (entry === undefined) throw new Error(`${names.menu} > ${names.item} is missing.`);
      entry.click(undefined, BrowserWindow.getAllWindows()[0], undefined);
    },
    { menu, item },
  );
}

test('no key: the set-up card from the Welcome, Home and the toolbar, and Settings in view', async () => {
  const launched = await launchNewInstall('msm-ai-clarity-key-');
  const { window } = launched;

  // The Welcome's AI line: what was typed stays beside the set-up card.
  const welcome = window.getByTestId('welcome-dialog');
  await expect(welcome).toBeVisible();
  await welcome.getByTestId('welcome-build-with-ai').click();
  const start = window.getByTestId('ai-start-dialog');
  await expect(start).toBeVisible();
  const description = 'A ruby sword that glows in the dark';
  await start.getByTestId('ai-start-input').fill(description);
  const startCard = start.getByTestId('ai-start-no-key').getByTestId('ai-setup');
  await expect(startCard).toBeVisible();
  await expect(startCard).toContainText('1. Get a key');
  await expect(startCard.getByTestId('ai-setup-cost')).toContainText(/costs about \$\d/);
  // The key field takes a key only where the system can encrypt it (not under xvfb).
  const startKey = startCard.getByTestId('ai-setup-key');
  if (await startKey.isEnabled()) await startKey.fill('not a key yet');
  else await expect(startCard.getByTestId('ai-setup-encryption')).toBeVisible();
  await expect(start.getByTestId('ai-start-input')).toHaveValue(description);
  await expect(start.getByTestId('ai-start-name')).toBeVisible();
  await window.keyboard.press('Escape');
  await expect(start).toBeHidden();
  if (await welcome.isVisible()) {
    await welcome.getByRole('button', { name: 'Got it' }).click();
    await expect(welcome).toBeHidden();
  }
  await expect(window.getByTestId('home')).toBeVisible();
  await newMod(window);

  // Home's AI tile: the set-up card in the panel, three steps and the typical cost.
  const panel = await openFromTile(window);
  const missing = panel.getByTestId('ai-key-missing');
  await expect(missing).toBeVisible();
  const card = missing.getByTestId('ai-setup');
  await expect(card).toContainText('Set up the AI helper');
  await expect(card).toContainText('1. Get a key');
  await expect(card).toContainText('2. Paste it here');
  await expect(card.getByTestId('ai-setup-open-site')).toBeVisible();
  await expect(card.getByTestId('ai-setup-save')).toHaveText(/Save and check/);
  await expect(card.getByTestId('ai-setup-cost')).toContainText(/costs about \$\d/);
  await expectPlain(panel, 'the set-up card');

  // The toolbar's helper, then All AI helper settings: Settings opens on the helper's section.
  await window.getByTestId('toolbar-ai-helper').click();
  if (!(await panel.isVisible())) await window.getByTestId('toolbar-ai-helper').click();
  await expect(panel).toBeVisible();
  await panel.getByTestId('ai-open-settings').click();
  const settings = window.getByTestId('settings-dialog');
  await expect(settings).toBeVisible();
  const section = settings.getByTestId('settings-ai');
  await expect
    .poll(async () => {
      const box = await section.boundingBox();
      const height = await window.evaluate<number>('window.innerHeight');
      return box !== null && box.y >= 0 && box.y < height;
    })
    .toBe(true);
  const key = section.getByTestId('ai-setup-key');
  if (await key.isEnabled()) await expect(key).toBeFocused();
  await window.screenshot({ path: join(outputDir, 'ai-clarity-no-key.png') });
});

test('a small ask: waiting, ready, the tray, the newest answer, adding, Show me, Undo, Put back', async () => {
  test.setTimeout(120_000);
  const launched = await launchNewInstall('msm-ai-clarity-sword-', 'clarity-sword.script.json');
  const { window } = launched;
  await passWelcome(window);
  await newMod(window);
  const panel = await openFromTile(window);
  await expect(panel.getByTestId('ai-empty')).toBeVisible();
  await expectPlain(panel, 'empty');

  // Waiting: "Thinking…" within 300 ms of Send, the seconds rising, Stop and nothing else. The
  // times are taken in the page: from the Send button's pointer down to the state line's change.
  await panel.getByTestId('ai-input').fill('make a ruby sword');
  await window.evaluate(`(() => {
    const record = [];
    window.__clarity = record;
    const note = (text) => record.push({ at: performance.now(), text });
    document
      .querySelector('[data-testid="ai-send"]')
      ?.addEventListener('pointerdown', () => note('send'), { capture: true, once: true });
    const line = document.querySelector('[data-testid="ai-status-text"]');
    if (line === null) throw new Error('No state line.');
    new MutationObserver(() => note(line.textContent ?? '')).observe(line, {
      childList: true,
      characterData: true,
      subtree: true,
    });
  })()`);
  await panel.getByTestId('ai-send').click();
  await expect(statusText(panel)).toHaveText(/^Thinking…/);
  await expect(panel.getByTestId('ai-stop')).toBeVisible();
  await expect(statusButtons(panel)).toHaveCount(1);
  const working = ((await panel.textContent()) ?? '').match(new RegExp(WORKING.source, 'g')) ?? [];
  expect(working, 'only the state line says it is working').toHaveLength(1);
  await expectPlain(panel, 'thinking');

  // Ready: one thing, nothing added yet.
  await expect(statusText(panel)).toHaveText('1 thing is ready. Nothing is in your mod yet.', {
    timeout: 20_000,
  });
  const lines = await window.evaluate<{ at: number; text: string }[]>('window.__clarity');
  const send = lines.find((line) => line.text === 'send');
  const thinking = lines.find((line) => line.text.startsWith('Thinking…'));
  expect(send, 'the Send press was seen').toBeDefined();
  expect(thinking, 'the state line said Thinking').toBeDefined();
  const after = (thinking?.at ?? 0) - (send?.at ?? 0);
  console.log(`ai-clarity: "Thinking…" ${after.toFixed(0)} ms after Send`);
  expect(after).toBeLessThan(300);
  // The seconds rose while it thought, before anything was made.
  const firstMade = lines.findIndex(
    (line) => !line.text.startsWith('Thinking…') && line.text !== 'send',
  );
  const seconds = lines
    .slice(0, firstMade < 0 ? undefined : firstMade)
    .map((line) => /^Thinking… \((\d+) s\)$/.exec(line.text))
    .filter((match) => match !== null)
    .map((match) => Number(match[1]));
  expect(seconds[0], 'the first number').toBe(0);
  expect(Math.max(...seconds), `the numbers ${seconds.join(', ')}`).toBeGreaterThanOrEqual(1);
  await expect(panel.getByTestId('ai-stop')).toBeHidden();
  const tray = panel.getByTestId('ai-tray');
  await expect(tray).toHaveAttribute('data-open', 'false');
  await panel.getByTestId('ai-status-look').click();
  await expect(tray).toHaveAttribute('data-open', 'true');
  await expect(tray.getByTestId('ai-review-heading')).toHaveText('Ready to add: 1 thing');
  const things = tray.getByTestId('ai-things').locator(':scope > li');
  await expect(things).toHaveCount(1);
  const thing = tray.getByTestId('ai-thing-1');
  await expect(thing).toContainText('Ruby Sword');
  await expect(thing.getByTestId('ai-thing-1-keep')).toBeVisible();
  const picture = thing.getByTestId('ai-thing-1-picture');
  const image =
    (await picture.evaluate((node) => node.tagName)) === 'IMG' ? picture : picture.locator('img');
  expect(await colourCount(image.first()), 'the picture has more than one colour').toBeGreaterThan(
    1,
  );
  await expect(tray.locator('[data-primary="true"]')).toHaveCount(1);
  await expect(panel.locator('[data-primary="true"]')).toHaveCount(1);
  await expectPlain(panel, 'ready, the tray open');

  // The newest answer is in view: a second ask while the changes wait, answered by a question.
  await ask(panel, 'Can it glow in the dark too?');
  await expect(panel.getByTestId('ai-transcript')).toContainText('Should it glow a little', {
    timeout: 20_000,
  });
  const answer = panel
    .getByTestId('ai-transcript')
    .locator('[data-role="assistant"]')
    .filter({ hasText: 'Should it glow a little' });
  await expectInside(answer, panel.getByTestId('ai-conversation'), 'the newest answer in view');
  await expect(statusText(panel)).toHaveText('1 thing is ready. Nothing is in your mod yet.');
  await expectPlain(panel, 'a question answered');

  // Adding: the notice names the thing; Show me; Undo; Put back.
  if ((await tray.getAttribute('data-open')) !== 'true')
    await panel.getByTestId('ai-tray-toggle').click();
  const add = tray.getByTestId('ai-apply');
  await expect(add).toHaveText('Add to my mod');
  await expect(add).toHaveAttribute('data-primary', 'true');
  await add.click();
  await expect(statusText(panel)).toHaveText('Added 1 thing to your mod: Ruby Sword.');
  await expect(tray).toHaveCount(0);
  await expectPlain(panel, 'added');
  await panel.getByTestId('ai-status-show-me').click();
  const creator = window.getByTestId('creator-dialog');
  await expect
    .poll(async () => (await creator.isVisible()) || (await window.getByTestId('home').isHidden()))
    .toBe(true);
  await window.screenshot({ path: join(outputDir, 'ai-clarity-show-me.png') });
  if (await creator.isVisible()) {
    await window.keyboard.press('Escape');
    await expect(creator).toBeHidden();
  }
  if (!(await panel.isVisible())) await window.getByTestId('toolbar-ai-helper').click();
  await expect(panel).toBeVisible();
  await window.getByTestId('toolbar-undo').click();
  await expect(statusText(panel)).toHaveText('Taken out again.');
  await expect(panel.getByTestId('ai-status-put-back')).toBeVisible();
  await panel.getByTestId('ai-status-put-back').click();
  await expect(statusText(panel)).toHaveText('Put back in your mod: Ruby Sword.');
  await expectPlain(panel, 'put back');
  await window.screenshot({ path: join(outputDir, 'ai-clarity-sword.png') });
});

test('a plan: in view, your turn, "go" builds it; a wish goes to the Wishlist', async () => {
  test.setTimeout(120_000);
  const launched = await launchNewInstall('msm-ai-clarity-plan-', 'clarity-plan.script.json');
  const { window } = launched;
  await passWelcome(window);
  await newMod(window);
  const panel = await openFromTile(window);

  await ask(panel, 'make a whole mod about rubies');
  const plan = panel.getByTestId('ai-plan');
  await expect(plan).toBeVisible({ timeout: 20_000 });
  await expect(panel.getByTestId('ai-status')).toHaveAttribute('data-state', 'your-turn-plan');
  await expect(statusText(panel)).toHaveText('Your turn: choose what to do with the plan.');
  await expectInside(plan, panel.getByTestId('ai-conversation'), 'the plan in view');
  await expect(plan.getByTestId('ai-plan-build-all')).toHaveAttribute('data-primary', 'true');
  await expect(panel.locator('[data-primary="true"]')).toHaveCount(1);
  // Nothing says it is working while the plan waits.
  await window.waitForTimeout(1_200);
  expect((await panel.textContent()) ?? '').not.toMatch(WORKING);
  await expect(panel.getByTestId('ai-stop')).toHaveCount(0);
  await expectPlain(panel, 'the plan waits');

  // Typing "go" and Enter builds all of it.
  const input = panel.getByTestId('ai-input');
  await expect(input).toBeEnabled();
  await input.fill('go');
  await input.press('Enter');
  await expect(statusText(panel)).toHaveText('1 thing is ready. Nothing is in your mod yet.', {
    timeout: 20_000,
  });
  await expectPlain(panel, 'the plan made');

  // It cannot do it: the wish is written down and Help > Wishlist holds it.
  await ask(panel, 'Make my mod work on phones and consoles too');
  await expect(panel.getByTestId('ai-transcript')).toContainText(
    'Wrote down a wish: Play on phones and consoles',
    { timeout: 20_000 },
  );
  await expect(panel.getByTestId('ai-transcript')).toContainText('I wrote that down');
  await expectPlain(panel, 'a wish');
  await clickMenu(launched, 'Help', 'Wishlist…');
  const wishlist = window.getByTestId('wishlist');
  await expect(wishlist).toBeVisible();
  await expect(wishlist).toContainText('Play on phones and consoles');
  await window.screenshot({ path: join(outputDir, 'ai-clarity-plan.png') });
  await window.keyboard.press('Escape');
});

test('Ask the helper on a thing to fix, then each failure with its sentence and one button', async () => {
  test.setTimeout(120_000);
  const launched = await launchNewInstall('msm-ai-clarity-fail-', 'clarity-failures.script.json');
  const { window } = launched;
  await passWelcome(window);
  await newMod(window);

  // A thing to fix: a rule step without its item.
  const home = window.getByTestId('home');
  await home.getByTestId('home-tile-rules').click();
  const studio = window.getByTestId('rule-book-studio');
  await expect(studio).toBeVisible();
  await studio.getByTestId('rule-add').click();
  const rule = studio.getByTestId('rule-card');
  await rule.getByTestId('rules-add-step-do').click();
  const give = window.getByRole('button', { name: 'Give an item', exact: true });
  await expect(give).toBeAttached();
  await give.dispatchEvent('click');
  const fix = window.getByTestId('things-to-fix');
  await expect(fix).toContainText('Things to fix (1)');
  await window.getByTestId('toolbar-home').click();
  await expect(home).toBeVisible();

  // Ask the helper: the problem attached in plain words, the exact block folded, nothing sent.
  await fix.getByTestId('things-to-fix-0-ask').click();
  const panel = window.getByTestId('ai-panel');
  await expect(panel).toBeVisible();
  const label = panel.getByTestId('ai-context-label');
  await expect(label).toHaveText(/^About: /);
  await expect(panel.getByTestId('ai-context-block')).toHaveCount(0);
  await expect(panel.getByTestId('ai-input')).not.toHaveValue('');
  await expect(panel.locator('[data-role="user"]')).toHaveCount(0);
  await expectPlain(panel, 'a problem attached');
  await panel.getByTestId('ai-context-show').click();
  await expect(panel.getByTestId('ai-context-block')).toBeVisible();
  await panel.getByTestId('ai-context-show').click();
  await expect(panel.getByTestId('ai-context-block')).toHaveCount(0);
  const chip = (await label.textContent()) ?? '';
  await panel.getByTestId('ai-send').click();
  const transcript = panel.getByTestId('ai-transcript');
  await expect(transcript).toContainText('no item is picked yet', { timeout: 20_000 });
  const sentContext = transcript.locator('[data-role="user"] [data-testid$="-context-0"]');
  await expect(sentContext).toContainText(chip);
  await expectPlain(panel, 'a problem sent');

  /** A failure: its sentence, its one button, and nothing that says it is working. */
  const failure = async (sentence: string, action: string | null) => {
    await expect(statusText(panel)).toHaveText(sentence, { timeout: 20_000 });
    await expect(statusButtons(panel)).toHaveCount(action === null ? 0 : 1);
    if (action !== null) await expect(panel.getByTestId(`ai-status-${action}`)).toBeVisible();
    await expect(panel.getByTestId('ai-stop')).toHaveCount(0);
    await expectPlain(panel, sentence);
  };

  await ask(panel, 'hello');
  await failure('Your key was not accepted.', 'check-key');
  await expect(panel.getByTestId('ai-status-check-key')).toHaveText('Check my key');

  await ask(panel, 'hello');
  await failure(
    "Your Anthropic account has no credit left. Add credit on Anthropic's site.",
    'try-again',
  );
  await panel.getByTestId('ai-status-try-again').click();
  await failure('Anthropic is busy just now.', 'try-again');
  await panel.getByTestId('ai-status-try-again').click();
  await expect(transcript).toContainText('Hello again. What would you like to make?', {
    timeout: 20_000,
  });
  await expect(panel.getByTestId('ai-status')).toHaveAttribute('data-state', 'idle');

  await ask(panel, 'are you there');
  await failure('No connection to Anthropic. Check the internet.', 'try-again');
  await panel.getByTestId('ai-status-try-again').click();
  await expect(transcript).toContainText('Yes, I am here.', { timeout: 20_000 });

  // A limit stop offers Keep going, and the helper goes on.
  await ask(panel, 'make lots of things');
  await failure('It paused so the cost stays small.', 'keep-going');
  await expect(panel.getByTestId('ai-status-keep-going')).toHaveText('Keep going');
  await panel.getByTestId('ai-status-keep-going').click();
  await expect(transcript).toContainText('Carrying on: all done now.', { timeout: 20_000 });
  await expect(panel.getByTestId('ai-status')).toHaveAttribute('data-state', 'idle');
  await expectPlain(panel, 'kept going');
  await window.screenshot({ path: join(outputDir, 'ai-clarity-failures.png') });
});

test('More options: the files with ids and kinds, Before and after, the limits, then Add and Ask AI', async () => {
  test.setTimeout(120_000);
  base = mkdtempSync(join(tmpdir(), 'msm-ai-clarity-modes-'));
  mkdirSync(outputDir, { recursive: true });
  const launched = await launchApp({
    reuse: {
      projectDir: join(base, 'ai_e2e'),
      outDir: join(base, 'out'),
      msmHome: join(base, 'msm-home'),
    },
    aiScript: join(SCRIPTS, 'clarity-sword.script.json'),
  });
  launches.push(launched);
  const { window } = launched;
  await window.waitForLoadState('domcontentloaded');
  await newProjectInFolder(window);
  await expect(window.getByTestId('element-row-ai_e2e:pack')).toBeVisible();

  // The cards, and under the review's More options the files with their ids and kinds.
  await window.getByTestId('toolbar-ai-helper').click();
  const panel = window.getByTestId('ai-panel');
  await expect(panel).toBeVisible();
  await ask(panel, 'make a ruby sword');
  await expect(statusText(panel)).toHaveText('1 thing is ready. Nothing is in your mod yet.', {
    timeout: 20_000,
  });
  await panel.getByTestId('ai-status-look').click();
  const tray = panel.getByTestId('ai-tray');
  await expect(tray.getByTestId('ai-review-heading')).toHaveText('Ready to add: 1 thing');
  await expect(tray.getByTestId('ai-thing-1')).toContainText('Ruby Sword');
  await openMoreOptions(tray, 'ai-review-files');
  const rows = tray.locator('li[data-op]');
  const titles = await rows.locator('code').allTextContents();
  expect(titles).toContain('ruby:ruby_sword');
  const swordRow = rows.filter({ has: window.locator('code', { hasText: /^ruby:ruby_sword$/ }) });
  await expect(swordRow).toHaveCount(1);
  await expect(swordRow).toContainText('msm:item');
  await expect(swordRow.locator('[data-testid$="-diff"] summary')).toHaveText('Before and after');
  // The run limits are in the panel's More options.
  await openMoreOptions(panel, 'ai-panel');
  await expect(panel.getByTestId('ai-limits')).toBeVisible();
  await panel.getByTestId('ai-limits').click();
  await expect(window.getByTestId('ai-limits-popover')).toBeVisible();
  await expect(window.getByTestId('ai-limits-popover')).toContainText('Settings');
  await window.keyboard.press('Escape');
  await expect(window.getByTestId('ai-limits-popover')).toBeHidden();
  const apply = tray.getByTestId('ai-apply');
  await expect(apply).toHaveText('Add to my mod');
  await apply.click();
  await expect(statusText(panel)).toHaveText(/^Added 1 thing to your mod/);
  await expect(window.getByTestId('element-row-ruby:ruby_sword')).toBeVisible();

  // Ask AI on the element: the chip names it, the block (with its id) one click away.
  const row = window.getByTestId('element-row-ruby:ruby_sword');
  await row.click();
  if ((await row.getAttribute('aria-current')) === null) await row.click();
  await window.getByTestId('editor-ask-ai').click();
  await expect(panel).toBeVisible();
  await expect(panel.getByTestId('ai-context-label')).toHaveText('About: Ruby Sword');
  await panel.getByTestId('ai-context-show').click();
  await expect(panel.getByTestId('ai-context-block')).toContainText('ruby:ruby_sword');
  await window.screenshot({ path: join(outputDir, 'ai-clarity-more-options.png') });

  await window.getByTestId('toolbar-save').click();
  await expect(window.locator('footer').getByText('Saved', { exact: true })).toBeVisible();
});
