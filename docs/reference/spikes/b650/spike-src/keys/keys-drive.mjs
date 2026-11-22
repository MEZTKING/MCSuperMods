// B650 spike: drives the SQ9/SQ15 page through Playwright's Electron support.
import { _electron } from 'playwright';
const K = process.env.KEYS_DIR;
const app = await _electron.launch({ args: ['--no-sandbox', `${K}/main.mjs`], executablePath: process.env.ELECTRON });
const page = await app.firstWindow();
await page.waitForFunction(() => window.__editor !== undefined);
const result = {};
const clear = () => page.evaluate(() => { window.__log.length = 0; });
const read = () => page.evaluate(() => window.__log.splice(0));
// 1 a plain text field
await page.click('#plain');
await clear();
await page.keyboard.press('Control+K');
await page.waitForTimeout(400);
result.textInput = await read();
// 2 inside Monaco: Ctrl+K, then Ctrl+X (trim trailing whitespace, a Ctrl+K chord in the app's features)
await page.click('#editor .view-lines');
await clear();
const before = await page.evaluate(() => window.__value());
await page.keyboard.press('Control+K');
await page.waitForTimeout(300);
const status = await page.evaluate(() => document.body.innerText.includes('Waiting for second key of chord'));
await page.keyboard.press('Control+X');
await page.waitForTimeout(300);
const after = await page.evaluate(() => window.__value());
result.monaco = { events: await read(), chordMessageShown: status, chordRan: before !== after, before, after };
// 3 Ctrl+Z inside Monaco (the app's existing pair: Monaco's undo and the menu's)
await clear();
await page.keyboard.press('Control+Z');
await page.waitForTimeout(300);
result.monacoUndo = { events: await read(), value: await page.evaluate(() => window.__value()) };
// 4 the body
await page.evaluate(() => { document.activeElement.blur(); document.body.focus(); });
await clear();
await page.keyboard.press('Control+K');
await page.waitForTimeout(400);
result.body = await read();
// SQ15: the accessibility tree of the draft combobox
result.ariaSnapshot = await page.locator('#search').ariaSnapshot();
const cdp = await page.context().newCDPSession(page);
const tree = await cdp.send('Accessibility.getFullAXTree');
result.axNodes = tree.nodes.filter((n) => ['combobox', 'listbox', 'group', 'option', 'status'].includes(n.role?.value)).map((n) => ({ role: n.role?.value, name: n.name?.value, props: (n.properties ?? []).filter((p) => ['expanded', 'activedescendant', 'selected', 'disabled', 'live', 'autocomplete', 'controls'].includes(p.name)).map((p) => `${p.name}=${JSON.stringify(p.value?.value ?? p.value?.relatedNodes?.map((r) => r.idref ?? r.backendDOMNodeId))}`) }));
await app.close();
console.log(JSON.stringify(result, null, 1));
