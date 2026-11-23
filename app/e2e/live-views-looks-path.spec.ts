/**
 * The live views path of batch 3, looks and sounds (ADR 0121; plan briefs B620 stub, B631).
 * Shaders and post effects have their own spec (`live-views-shaders-path`, B629).
 *
 * The project is written here: MSM's own pictures, a bitmap font, two Ogg files (headers only,
 * `ogg.ts`) and the elements that use them, in one namespace (plugins resource pack and data
 * pack, target 26.3). No Minecraft folder is set up, so nothing of Minecraft's is read and every
 * view draws from the project's files (Minecraft's own base pictures are MSM's stand-ins).
 *
 * The sound player is real; only its way out is faked. Before the first press the test replaces
 * `decodeAudioData`, `createBufferSource` and `createGain` on the page's `AudioContext.prototype`
 * (the player makes its context at the first sound), so nothing is heard and every sound started
 * is recorded in `window.__msmPlayed` with the length of its file (read from the Ogg header the
 * way the views read it), its volume and its pitch.
 *
 * 1. A project sound plays from three places: the sounds view, a cat's voice and a goat horn
 *    call; a music disc song plays its own file and its view shows the file's length.
 * 2. A painting, a banner pattern, a trim and a wolf variant draw from the project's pictures
 *    and follow an edit (Raw JSON) or a pick in the view; a pot pattern draws on its sides.
 * 3. A font draws typed text: the line grows with the text, and a letter it lacks is named.
 * 4. The day strip places a timeline's keyframes along its period.
 *
 * The 3D bodies and shapes use the app's WebGL (SwiftShader, as `entities-path` launches it).
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { crc32, deflateSync } from 'node:zlib';
import { expect, type Locator, type Page, test } from 'playwright/test';
import { type LaunchedApp, launchApp, openRawText, toolbarMenu } from './fixtures';
import { oggVorbis } from './ogg';

const WEBGL_ARGS = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] as const;

const NS = 'looks_demo';

type Rgba = readonly [number, number, number, number];
type Rgb = readonly [number, number, number];

function pngChunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

/** An 8-bit RGBA PNG whose pixel at (x, y) is `at(x, y)`. */
function png(width: number, height: number, at: (x: number, y: number) => Rgba): Buffer {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  const rows: Buffer[] = [];
  for (let y = 0; y < height; y += 1) {
    const row = Buffer.alloc(1 + width * 4);
    for (let x = 0; x < width; x += 1) row.set(at(x, y), 1 + x * 4);
    rows.push(row);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(Buffer.concat(rows))),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

const CLEAR: Rgba = [0, 0, 0, 0];
const WHITE: Rgba = [255, 255, 255, 255];
const hex = (rgb: Rgb): string => `#${rgb.map((c) => c.toString(16).padStart(2, '0')).join('')}`;

/** Eight colours of a palette strip (8 by 1), from a base colour stepping by `step`. */
const strip = (base: Rgb, step: Rgb): Rgb[] =>
  Array.from({ length: 8 }, (_, i) => [
    Math.min(255, base[0] + step[0] * i),
    Math.min(255, base[1] + step[1] * i),
    Math.min(255, base[2] + step[2] * i),
  ]);
const paletteOf = (colours: readonly Rgb[]): Buffer =>
  png(8, 1, (x) => {
    const [r, g, b] = colours[x] ?? [0, 0, 0];
    return [r, g, b, 255];
  });

const KEY = strip([20, 20, 20], [30, 30, 30]);
const RUBY = strip([120, 10, 30], [16, 4, 4]);
const RUBY_DARK = strip([60, 5, 15], [8, 2, 2]);
const SAPPHIRE = strip([10, 30, 120], [4, 6, 16]);

/** A trim layer (64 by 32): a band in key colour 0 with a line in key colour 3. */
const trimLayer = png(64, 32, (x, y) => {
  if (y < 20 || y >= 26 || x < 16 || x >= 40) return CLEAR;
  const [r, g, b] = (y === 22 ? KEY[3] : KEY[0]) ?? [0, 0, 0];
  return [r, g, b, 255];
});

/** A banner or shield pattern mask (64 by 64): a band of rows on the flag's or plate's front. */
const bandMask = (from: number, to: number) =>
  png(64, 64, (x, y) => (y >= from && y < to && x >= 1 && x < 21 ? WHITE : CLEAR));
/** A cross: a column down the front. */
const columnMask = png(64, 64, (x, y) => (x >= 8 && x < 12 && y >= 1 && y < 41 ? WHITE : CLEAR));

/** A wolf picture (64 by 32) of one colour. */
const wolfPicture = (colour: Rgba) => png(64, 32, () => colour);

/** Two 8 by 8 glyphs: A is 5 pixels wide, B is 7 (16 by 8). */
const glyphs = png(16, 8, (x, y) => {
  if (y >= 8) return CLEAR;
  if (x < 5) return WHITE;
  if (x >= 8 && x < 15) return WHITE;
  return CLEAR;
});

const element = (id: string, kind: string, data: unknown) => ({
  data,
  formatVersion: 1,
  id: `${NS}:${id}`,
  kind,
  meta: { createdAt: '2026-11-23T00:00:00.000Z' },
});

const HUM_SECONDS = 3;
const SONG_SECONDS = 12;
const HUM_VOLUME = 0.5;
const HUM_PITCH = 1.5;

const FILES: Record<string, unknown> = {
  'msm.project.json': {
    formatVersion: 1,
    name: 'Looks Path',
    namespaces: ['minecraft', NS],
    plugins: ['msm.resourcepack', 'msm.datapack'],
    settings: {},
    targets: ['mc-26.3'],
  },
  // Sounds: one event of one short file at its own volume and pitch, one song.
  [`content/${NS}/sounds/sounds.json`]: element('sounds', 'minecraft:sounds', {
    'block.hum': {
      sounds: [{ name: `${NS}:hum`, pitch: HUM_PITCH, volume: HUM_VOLUME }],
      subtitle: 'Humming',
    },
    'music_disc.song': { sounds: [`${NS}:song`] },
  }),
  [`content/${NS}/cat_sound_variant/purring.json`]: element(
    'purring',
    'minecraft:cat_sound_variant',
    {
      adult_sounds: { ambient_sound: { sound_id: `${NS}:block.hum` } },
      baby_sounds: {},
    },
  ),
  [`content/${NS}/instrument/call.json`]: element('call', 'minecraft:instrument', {
    description: { text: 'Hum Call' },
    range: 64,
    sound_event: { sound_id: `${NS}:block.hum` },
    use_duration: 3,
  }),
  [`content/${NS}/jukebox_song/song.json`]: element('song', 'minecraft:jukebox_song', {
    comparator_output: 9,
    description: { text: 'Test Song' },
    length_in_seconds: SONG_SECONDS,
    sound_event: { sound_id: `${NS}:music_disc.song` },
  }),
  [`assets/${NS}/sounds/hum.ogg`]: oggVorbis(HUM_SECONDS, 1),
  [`assets/${NS}/sounds/song.ogg`]: oggVorbis(SONG_SECONDS, 2),
  // A painting of 2 by 1 blocks, and a second picture for the edit.
  [`content/${NS}/painting_variant/sunset.json`]: element('sunset', 'minecraft:painting_variant', {
    asset_id: `${NS}:sunset`,
    height: 1,
    width: 2,
  }),
  [`assets/${NS}/textures/painting/sunset.png`]: png(32, 16, (x) =>
    x < 16 ? [230, 120, 40, 255] : [90, 40, 120, 255],
  ),
  [`assets/${NS}/textures/painting/moon.png`]: png(16, 16, () => [200, 200, 230, 255]),
  // A banner pattern with its banner and shield masks, and a second pattern for the edit.
  [`content/${NS}/banner_pattern/band.json`]: element('band', 'minecraft:banner_pattern', {
    asset_id: `${NS}:band`,
    translation_key: `block.${NS}.banner.band`,
  }),
  [`assets/${NS}/textures/entity/banner/band.png`]: bandMask(10, 20),
  [`assets/${NS}/textures/entity/shield/band.png`]: bandMask(6, 12),
  [`assets/${NS}/textures/entity/banner/column.png`]: columnMask,
  [`assets/${NS}/textures/entity/shield/column.png`]: columnMask,
  // A trim: a pattern with keyed layers, a material, palettes, an armour overriding the material.
  [`content/${NS}/trim_pattern/stripe.json`]: element('stripe', 'minecraft:trim_pattern', {
    asset_id: `${NS}:stripe`,
    decal: false,
    description: { text: 'Stripe Armour Trim' },
  }),
  [`content/${NS}/trim_material/ruby.json`]: element('ruby', 'minecraft:trim_material', {
    description: { color: '#C41C34', text: 'Ruby Material' },
    palette_id: `${NS}:trim/ruby`,
  }),
  [`content/${NS}/equipment/dark_plate.json`]: element('dark_plate', 'minecraft:equipment', {
    layers: { humanoid: [{ texture: `${NS}:dark_plate` }] },
    trim_overrides: [{ palette: `${NS}:trim/ruby_dark`, when: { material: `${NS}:ruby` } }],
  }),
  [`assets/${NS}/textures/trims/entity/humanoid/stripe.png`]: trimLayer,
  [`assets/${NS}/textures/trims/entity/humanoid_leggings/stripe.png`]: trimLayer,
  [`assets/${NS}/textures/trims/entity/humanoid/stripe.png.mcmeta`]: {
    palette: { base_palette: `${NS}:trim/key` },
  },
  [`assets/${NS}/textures/trims/entity/humanoid_leggings/stripe.png.mcmeta`]: {
    palette: { base_palette: `${NS}:trim/key` },
  },
  [`assets/${NS}/textures/palettes/trim/key.png`]: paletteOf(KEY),
  [`assets/${NS}/textures/palettes/trim/ruby.png`]: paletteOf(RUBY),
  [`assets/${NS}/textures/palettes/trim/ruby_dark.png`]: paletteOf(RUBY_DARK),
  [`assets/${NS}/textures/palettes/trim/sapphire.png`]: paletteOf(SAPPHIRE),
  // A wolf variant on the project's own pictures, and a second wild picture for the edit.
  [`content/${NS}/wolf_variant/frost.json`]: element('frost', 'minecraft:wolf_variant', {
    assets: {
      angry: `${NS}:entity/wolf/frost_angry`,
      tame: `${NS}:entity/wolf/frost_tame`,
      wild: `${NS}:entity/wolf/frost`,
    },
    spawn_conditions: [{ priority: 0 }],
  }),
  [`assets/${NS}/textures/entity/wolf/frost.png`]: wolfPicture([220, 230, 240, 255]),
  [`assets/${NS}/textures/entity/wolf/frost_tame.png`]: wolfPicture([200, 210, 230, 255]),
  [`assets/${NS}/textures/entity/wolf/frost_angry.png`]: wolfPicture([240, 200, 200, 255]),
  [`assets/${NS}/textures/entity/wolf/ember.png`]: wolfPicture([200, 90, 30, 255]),
  // A pot pattern.
  [`content/${NS}/decorated_pot_pattern/wave.json`]: element(
    'wave',
    'minecraft:decorated_pot_pattern',
    { asset_id: `${NS}:wave` },
  ),
  [`assets/${NS}/textures/entity/decorated_pot/wave.png`]: png(16, 16, (x, y) =>
    (x + y) % 4 < 2 ? [150, 70, 40, 255] : [90, 40, 20, 255],
  ),
  // A bitmap font of two letters.
  [`content/${NS}/font/letters.json`]: element('letters', 'minecraft:font', {
    providers: [
      { ascent: 7, chars: ['AB'], file: `${NS}:font/glyphs.png`, height: 8, type: 'bitmap' },
    ],
  }),
  [`assets/${NS}/textures/font/glyphs.png`]: glyphs,
  // A timeline of two days with keyframes at the start and half way.
  [`content/${NS}/timeline/slime_days.json`]: element('slime_days', 'minecraft:timeline', {
    clock: 'minecraft:overworld',
    period_ticks: 48000,
    tracks: {
      'minecraft:gameplay/surface_slime_spawn_chance': {
        ease: 'constant',
        keyframes: [
          { ticks: 0, value: 1 },
          { ticks: 24000, value: 0 },
        ],
        modifier: 'maximum',
      },
    },
  }),
};

let base: string | undefined;
const launches: LaunchedApp[] = [];

test.afterEach(async () => {
  for (const launched of launches.splice(0)) await launched.close();
  if (base !== undefined) rmSync(base, { recursive: true, force: true });
  base = undefined;
});

/** Launches the app (SwiftShader WebGL) over a fresh copy of the project and opens it. */
async function launchProject(): Promise<LaunchedApp> {
  base = mkdtempSync(join(tmpdir(), 'msm-looks-'));
  const folders = {
    projectDir: join(base, NS),
    outDir: join(base, 'out'),
    msmHome: join(base, 'msm-home'),
  };
  for (const [path, contents] of Object.entries(FILES)) {
    const file = join(folders.projectDir, path);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(
      file,
      Buffer.isBuffer(contents) ? contents : `${JSON.stringify(contents, null, 2)}\n`,
    );
  }
  const launched = await launchApp({ args: WEBGL_ARGS, reuse: folders });
  launches.push(launched);
  await launched.window.waitForLoadState('domcontentloaded');
  await toolbarMenu(launched.window, 'toolbar-open-project');
  await expect(launched.window.getByTestId(`element-row-${NS}:sunset`)).toBeVisible();
  return launched;
}

/** Opens an element and returns its live view in the editor's preview, checked for the frame. */
async function openView(window: Page, id: string, title: string): Promise<Locator> {
  // A click that lands while the sidebar settles after the project opens can be lost (B616):
  // click until the row is the selected one.
  const row = window.getByTestId(`element-row-${NS}:${id}`);
  await expect(async () => {
    await row.click();
    await expect(row).toHaveAttribute('aria-current', 'true', { timeout: 1_000 });
  }).toPass({ timeout: 15_000 });
  const view = window
    .getByTestId('editor-preview')
    .getByTestId('live-view')
    .and(window.getByLabel(title, { exact: true }))
    .first();
  // The first view of a launch loads its chunk; the shared test machines can be slow at that.
  await expect(view).toBeVisible({ timeout: 30_000 });
  await expect(view.getByTestId('live-view-tag').first()).toHaveText('Preview');
  await expect(view.getByTestId('live-view-not-yet')).toHaveCount(0);
  return view;
}

/**
 * Replaces the Raw JSON editor's text with `data` and applies it (as `creator-path` does): the
 * text goes in as one input event on a single line, so Monaco's auto-closing leaves it alone.
 */
async function applyRawJson(window: Page, data: unknown): Promise<void> {
  await openRawText(window);
  const panel = window.getByRole('region', { name: 'Raw JSON' });
  const lines = panel.locator('.monaco-editor .view-lines');
  await expect(lines).toBeVisible();
  // Near the top left: the lines can be wider than the editor, their middle under the ruler.
  await lines.click({ position: { x: 8, y: 8 } });
  await window.keyboard.press('ControlOrMeta+A');
  await window.keyboard.press('Delete');
  await window.keyboard.insertText(JSON.stringify(data));
  await panel.getByRole('button', { name: 'Apply' }).click();
  await expect(panel.getByRole('button', { name: 'Apply' })).toBeDisabled();
}

/** One sound the fake audio out was asked to start. */
interface Played {
  /** The file's length from its Ogg header, in seconds. */
  seconds: number;
  volume: number;
  pitch: number;
}

/**
 * Fakes the page's audio out (see the module comment). The player makes its `AudioContext` at
 * its first sound, so this must run before any Play press.
 */
async function fakeAudioOut(window: Page): Promise<void> {
  await window.evaluate(() => {
    interface FakeBuffer {
      duration: number;
      length: number;
      numberOfChannels: number;
    }
    interface FakeGain {
      gain: { value: number };
      connect(node: unknown): unknown;
    }
    const played: { seconds: number; volume: number; pitch: number }[] = [];
    (window as unknown as { __msmPlayed: typeof played }).__msmPlayed = played;
    const proto = (
      globalThis as unknown as { AudioContext: { prototype: Record<string, unknown> } }
    ).AudioContext.prototype;
    proto.decodeAudioData = (data: ArrayBuffer): Promise<FakeBuffer> => {
      const bytes = new Uint8Array(data);
      let last = -1;
      for (let i = 0; i + 4 <= bytes.length; i += 1) {
        if (bytes[i] === 0x4f && bytes[i + 1] === 0x67 && bytes[i + 2] === 0x67) {
          if (bytes[i + 3] === 0x53) last = i;
        }
      }
      if (last < 0) return Promise.reject(new Error('Not an Ogg file.'));
      const granule = new DataView(data).getUint32(last + 6, true);
      return Promise.resolve({ duration: granule / 44_100, length: granule, numberOfChannels: 1 });
    };
    proto.createGain = (): FakeGain => ({ gain: { value: 1 }, connect: (node) => node });
    proto.createBufferSource = () => {
      let out: FakeGain | null = null;
      const source = {
        buffer: null as FakeBuffer | null,
        playbackRate: { value: 1 },
        onended: null as (() => void) | null,
        connect(node: FakeGain) {
          out = node;
          return node;
        },
        start() {
          played.push({
            seconds: source.buffer?.duration ?? -1,
            volume: out?.gain.value ?? -1,
            pitch: source.playbackRate.value,
          });
        },
        stop() {
          const ended = source.onended;
          source.onended = null;
          ended?.();
        },
      };
      return source;
    };
  });
}

/** What the fake audio out has started so far. */
const playedSounds = (window: Page): Promise<Played[]> =>
  window.evaluate(() => [...(window as unknown as { __msmPlayed: Played[] }).__msmPlayed]);

/** Presses a Play button, waits for it to play, and returns the sound the fake out started. */
async function playFrom(window: Page, button: Locator, place: string): Promise<Played> {
  const before = (await playedSounds(window)).length;
  await expect(button).toHaveAttribute('data-state', 'idle');
  await button.click();
  await expect(button).toHaveAttribute('data-state', 'playing');
  await expect.poll(async () => (await playedSounds(window)).length).toBe(before + 1);
  const startMs = Number(await button.getAttribute('data-start-ms'));
  console.log(`live-views-looks-path: ${place}, press to player ${startMs} ms`);
  // B619's budget is 200 ms for a project sound; this ceiling allows for a loaded test machine.
  expect(startMs).toBeLessThan(1_000);
  const sound = (await playedSounds(window))[before];
  if (sound === undefined) throw new Error('Nothing was played.');
  // A second press stops it.
  await button.click();
  await expect(button).toHaveAttribute('data-state', 'idle');
  return sound;
}

const expectHum = (sound: Played) => {
  expect(sound.seconds).toBeCloseTo(HUM_SECONDS, 3);
  expect(sound.volume).toBeCloseTo(HUM_VOLUME, 3);
  expect(sound.pitch).toBeCloseTo(HUM_PITCH, 3);
};

test('a project sound plays from the sounds view, a cat voice, a goat horn; a song plays its file', async () => {
  test.setTimeout(150_000);
  const { window } = await launchProject();
  await fakeAudioOut(window);

  // 1. The sounds view: the event's Play picks the file and plays it at its volume and pitch.
  let view = await openView(window, 'sounds', 'Sounds');
  await expect(view.getByTestId('sounds-view-event-block.hum')).toContainText('Humming');
  expectHum(await playFrom(window, view.getByTestId('sounds-view-play-block.hum'), 'sounds view'));
  await expect(view.getByTestId('sounds-view-picked-block.hum')).toContainText('Picked Hum');

  // 2. A cat's voice naming the same event.
  view = await openView(window, 'purring', 'Cat voice');
  expectHum(
    await playFrom(
      window,
      view.getByTestId('sound-variant-play-adult_sounds-ambient_sound'),
      'cat voice',
    ),
  );
  await expect(view.getByTestId('sound-variant-picked')).toBeVisible();

  // 3. A goat horn call naming it too.
  view = await openView(window, 'call', 'Goat horn call');
  await expect(view.getByTestId('instrument-name')).toHaveText('Hum Call');
  expectHum(await playFrom(window, view.getByTestId('instrument-play'), 'goat horn'));

  // A music disc song: the file's own length beside the stated one, and the file plays.
  view = await openView(window, 'song', 'Music disc song');
  const file = view.getByTestId('song-file');
  await expect(file).toHaveAttribute('data-seconds', SONG_SECONDS.toFixed(2));
  await expect(file).toHaveAttribute('data-verdict', 'matches');
  await expect(view.getByTestId('song-comparator')).toHaveAttribute('data-strength', '9');
  const song = await playFrom(window, view.getByTestId('song-play'), 'music disc song');
  expect(song.seconds).toBeCloseTo(SONG_SECONDS, 3);
  expect(await playedSounds(window)).toHaveLength(4);
});

test('a painting, a banner pattern, a trim and a wolf variant draw and follow an edit; a pot', async () => {
  test.setTimeout(180_000);
  const { window } = await launchProject();

  // A painting at its size, then smaller on another picture.
  let view = await openView(window, 'sunset', 'Painting');
  const picture = view.getByTestId('live-painting-picture');
  await expect(picture).toHaveAttribute('data-found', 'true');
  await expect(picture).toHaveAttribute('data-width', '2');
  await expect(picture).toHaveAttribute('data-height', '1');
  await expect(view.getByTestId('live-painting-canvas')).toBeVisible();
  await applyRawJson(window, { asset_id: `${NS}:moon`, height: 1, width: 1 });
  await expect(picture).toHaveAttribute('data-width', '1');
  await expect(picture).toHaveAttribute('data-found', 'true');
  await expect(view.getByTestId('live-painting-words')).toContainText('1 by 1 block');

  // A banner pattern on a banner and a shield; a dye pick and an edit of the pattern.
  view = await openView(window, 'band', 'Banner pattern');
  const banner = view.getByTestId('live-banner-banner');
  const shield = view.getByTestId('live-banner-shield');
  await expect(banner).toBeVisible();
  await expect(shield).toBeVisible();
  const black = await banner.getAttribute('data-pattern-dye');
  await view.getByTestId('live-banner-dye').selectOption('red');
  await expect(banner).not.toHaveAttribute('data-pattern-dye', black ?? '');
  const red = await banner.getAttribute('data-pattern-dye');
  await expect(shield).toHaveAttribute('data-pattern-dye', red ?? '');
  const front = view.getByTestId('live-banner-banner-front');
  const bandFront = await front.getAttribute('src');
  await expect(view.getByTestId('live-banner-banner-canvas')).toBeVisible();
  await applyRawJson(window, {
    asset_id: `${NS}:column`,
    translation_key: `block.${NS}.banner.band`,
  });
  await expect(front).not.toHaveAttribute('src', bandFront ?? '');
  // The dye picked stays with the view.
  await expect(banner).toHaveAttribute('data-pattern-dye', red ?? '');

  // A trim material on the project's pattern: its palette, then the armour's override, then an
  // edit of the material's palette.
  view = await openView(window, 'ruby', 'Armour trim');
  const swatch = view.getByTestId('live-trim-swatch').first();
  await expect(view.getByTestId('live-trim-swatch')).toHaveCount(KEY.length);
  await expect(swatch).toHaveAttribute('data-key', hex(KEY[0] as Rgb));
  await expect(swatch).toHaveAttribute('data-colour', hex(RUBY[0] as Rgb));
  await expect(view.getByTestId('live-trim-layer-humanoid')).toBeVisible();
  await view.getByTestId('live-trim-armour').selectOption(`${NS}:dark_plate`);
  await expect(swatch).toHaveAttribute('data-colour', hex(RUBY_DARK[0] as Rgb));
  await applyRawJson(window, {
    description: { color: '#C41C34', text: 'Ruby Material' },
    palette_id: `${NS}:trim/sapphire`,
  });
  // The armour's override names this material, so it still wins; another armour shows the edit.
  await expect(swatch).toHaveAttribute('data-colour', hex(RUBY_DARK[0] as Rgb));
  const armour = view.getByTestId('live-trim-armour');
  const others = (
    await armour
      .locator('option')
      .evaluateAll((options) =>
        options.map((option) => (option as unknown as { value: string }).value),
      )
  ).filter((value) => value !== `${NS}:dark_plate`);
  expect(others.length).toBeGreaterThan(0);
  await armour.selectOption(others[0] ?? '');
  await expect(swatch).toHaveAttribute('data-colour', hex(SAPPHIRE[0] as Rgb));

  // A wolf variant on the wolf's body (WebGL), then a new wild picture.
  view = await openView(window, 'frost', 'Wolf variant');
  const body = view.getByTestId('variant-body');
  await expect(body).toHaveAttribute('data-state', 'ready');
  await expect(body).toHaveAttribute('data-mode', 'body');
  await expect(body).toHaveAttribute('data-layers', `assets/${NS}/textures/entity/wolf/frost.png`);
  await expect(view.getByTestId('variant-body-canvas')).toBeVisible();
  await expect(view.getByTestId('variant-body-missing')).toHaveCount(0);
  await view.getByTestId('variant-wolf-tame').click();
  await expect(body).toHaveAttribute(
    'data-layers',
    `assets/${NS}/textures/entity/wolf/frost_tame.png`,
  );
  await view.getByTestId('variant-wolf-wild').click();
  await applyRawJson(window, {
    assets: {
      angry: `${NS}:entity/wolf/frost_angry`,
      tame: `${NS}:entity/wolf/frost_tame`,
      wild: `${NS}:entity/wolf/ember`,
    },
    spawn_conditions: [{ priority: 0 }],
  });
  await expect(body).toHaveAttribute('data-layers', `assets/${NS}/textures/entity/wolf/ember.png`);
  await expect(body).toHaveAttribute('data-state', 'ready');

  // A pot pattern on all four sides, then not on the front.
  view = await openView(window, 'wave', 'Pot pattern');
  for (const side of ['north', 'east', 'south', 'west']) {
    await expect(view.getByTestId(`live-pot-face-${side}`)).toHaveAttribute(
      'data-patterned',
      'true',
    );
  }
  await view.getByTestId('live-pot-side-north').click();
  await expect(view.getByTestId('live-pot-face-north')).toHaveAttribute('data-patterned', 'false');
  await expect(view.getByTestId('live-pot-face-east')).toHaveAttribute('data-patterned', 'true');
});

test('a font draws typed text; the day strip places a timeline', async () => {
  test.setTimeout(120_000);
  const { window } = await launchProject();

  const view = await openView(window, 'letters', 'Font');
  const text = view.getByTestId('font-sample-text');
  const line = view.locator('[data-testid="font-line"][data-scale="1"]');
  await text.fill('A');
  await expect(line).toHaveAttribute('data-width', /^[1-9]/);
  const one = Number(await line.getAttribute('data-width'));
  await text.fill('AB');
  await expect.poll(async () => Number(await line.getAttribute('data-width'))).toBeGreaterThan(one);
  const two = Number(await line.getAttribute('data-width'));
  await text.fill('ABAB');
  await expect.poll(async () => Number(await line.getAttribute('data-width'))).toBe(two * 2);
  await expect(view.getByTestId('font-missing')).toHaveCount(0);
  await expect(view.getByTestId('font-width')).toHaveText(`${two * 2} pixels wide at GUI scale 1.`);
  // Every scale draws the same line, wider.
  const scaled = view.locator('[data-testid="font-line"]:not([data-scale="1"])').first();
  const scale = Number(await scaled.getAttribute('data-scale'));
  await expect(scaled).toHaveAttribute('data-width', String(two * 2 * scale));
  // A letter the font lacks is named.
  await text.fill('ABZ');
  await expect(view.getByTestId('font-missing')).toContainText('Z');

  const day = await openView(window, 'slime_days', 'Day strip');
  await expect(day.getByTestId('day-period')).toHaveAttribute('data-span', '48000');
  const keyframes = day.getByTestId('day-keyframe');
  await expect(keyframes).toHaveCount(2);
  expect(
    (await keyframes.evaluateAll((all) => all.map((one) => one.getAttribute('data-x')))).sort(),
  ).toEqual(['0', '50']);
  await expect(day.getByTestId('day-undrawable')).toHaveCount(0);
});
