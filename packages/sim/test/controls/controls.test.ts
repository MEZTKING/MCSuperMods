/**
 * Key binds and the HUD in Try it (B429): the firing rules of the runtime's `KeyBinds` (screens,
 * `when`, cooldown at press time, hold intervals, taps, releases), the HUD actions and the
 * visibility and value rules of `MsmHudLayer`, the vehicle dashboard, the runtime's vehicle
 * keys, and what is said as "Only in Minecraft".
 */
import type { Json } from '@msm/plugin-api';
import { describe, expect, it } from 'vitest';
import {
  buildKeyBindCatalogue,
  dashboardRows,
  IDLE_INPUT,
  keyLabel,
  type LocalSourceTarget,
  LocalWorldSource,
  readHudElements,
} from '../../src/index.js';
import { FAKE_TARGET, testFiles } from '../blocks/helpers.js';

const NS = 'kb';
const event = (...actions: Json[]): Json => ({ actions });

const TARGET = {
  ...FAKE_TARGET,
  controls: {
    runtimeKeys: {
      fire: 'key.keyboard.r',
      second: 'key.keyboard.v',
      horn: 'key.keyboard.h',
      descend: 'key.keyboard.left.alt',
    },
  },
} as unknown as LocalSourceTarget;

const KEYS: Record<string, Json> = {
  boost: {
    format: 1,
    default_key: 'key.keyboard.k',
    cooldown_ticks: 20,
    hold_interval_ticks: 4,
    'msm:on_press': 'pressed',
    'msm:on_release': 'released',
    'msm:while_held': 'holding',
    events: {
      pressed: event({ type: 'set_hud', hud: `${NS}:mana`, value: 15 }),
      released: event({ type: 'hide_hud', hud: `${NS}:mana` }),
      holding: event({ type: 'give_item', item: 'minecraft:stick', count: 1 }),
    },
  },
  walk: {
    format: 1,
    default_key: 'key.keyboard.j',
    when: 'on_foot',
    'msm:on_press': 'go',
    events: { go: event({ type: 'show_hud', hud: `${NS}:secret` }) },
  },
  honk: {
    format: 1,
    default_key: 'key.keyboard.j',
    when: 'driving',
    vehicle: `${NS}:kart`,
    'msm:on_press': 'go',
    events: { go: event({ type: 'set_hud', hud: `${NS}:label`, value: 'Beep' }) },
  },
};

const HUDS: Record<string, Json> = {
  mana: { format: 1, type: 'bar', value: { source: 'set' }, max: 100 },
  secret: { format: 1, type: 'text', show: 'always', starts_hidden: true, text: 'Secret' },
  label: { format: 1, type: 'text', value: { source: 'set' }, anchor: 'top' },
  height: {
    format: 1,
    type: 'text',
    show: 'always',
    value: { source: 'player', stat: 'y' },
    text: 'Y: {value}',
  },
  hearts: { format: 1, type: 'icons', value: { source: 'player', stat: 'health' }, icon: 'x' },
  points: { format: 1, type: 'text', value: { source: 'score', objective: 'points' } },
  fuel: {
    format: 1,
    type: 'bar',
    show: 'driving',
    vehicle: `${NS}:kart`,
    value: { source: 'vehicle', stat: 'fuel' },
    max: 100,
  },
  ammo: { format: 1, type: 'text', show: 'in_vehicle', value: { source: 'vehicle', stat: 'ammo' } },
};

const KART: Json = {
  format: 1,
  model: { geometry: `${NS}:entity/kart`, texture: `${NS}:entity/kart` },
  movement: { mode: 'ground', max_speed: 0.5 },
  engine: { fuel: { items: [{ item: 'minecraft:coal', ticks: 100 }] }, horn: 'minecraft:x' },
  weapons: [{ id: 'machine_gun', projectile: 'minecraft:arrow' }],
  health: { max: 10 },
};

function files(): Map<string, string | Uint8Array> {
  const out = testFiles();
  for (const [path, d] of Object.entries(KEYS)) {
    out.set(`msm/${NS}/key_bind/${path}.json`, JSON.stringify(d));
  }
  for (const [path, d] of Object.entries(HUDS)) {
    out.set(`msm/${NS}/hud/${path}.json`, JSON.stringify(d));
  }
  out.set(`msm/${NS}/vehicle/kart.json`, JSON.stringify(KART));
  out.set(
    `assets/${NS}/lang/en_us.json`,
    JSON.stringify({ 'key.kb.boost': 'Boost', 'entity.kb.kart': 'Kart' }),
  );
  return out;
}

const source = (): LocalWorldSource =>
  new LocalWorldSource({ files: files(), target: TARGET, seed: 2 });

const ticks = (s: LocalWorldSource, n: number): void => {
  for (let i = 0; i < n; i += 1) s.tick();
};

const triggers = (s: LocalWorldSource): string[] =>
  s.trace.filter((entry) => entry.kind === 'trigger').map((entry) => entry.text);

/** Places the kart in front of the player and gets in. */
function getIn(s: LocalWorldSource): number {
  s.act({
    type: 'use',
    pos: { x: 24, y: -1, z: 28 },
    face: 'up',
    hit: { x: 0.5, y: 1, z: 0.5 },
    item: `${NS}:kart`,
  });
  const id = s.vehicles.snapshots()[0]?.id ?? -1;
  s.act({ type: 'useVehicle', vehicle: id });
  expect(s.vehicles.riding).toBe(id);
  return id;
}

describe('the key bind catalogue', () => {
  it('reads defaults, names from en_us and keys', () => {
    const catalogue = buildKeyBindCatalogue(files(), TARGET);
    expect(catalogue.ids()).toEqual(['kb:boost', 'kb:honk', 'kb:walk']);
    const boost = catalogue.get('kb:boost');
    expect(boost?.displayName).toBe('Boost');
    expect(boost?.cooldownTicks).toBe(20);
    expect(catalogue.get('kb:walk')?.holdIntervalTicks).toBe(10);
    expect(catalogue.get('kb:walk')?.displayName).toBe('Walk');
    expect(catalogue.onKey('key.keyboard.j').map((bind) => bind.id)).toEqual([
      'kb:honk',
      'kb:walk',
    ]);
    expect(keyLabel('key.keyboard.left.alt')).toBe('Left Alt');
    expect(keyLabel('key.mouse.4')).toBe('Mouse button 4');
  });
});

describe('key binds in Try it', () => {
  it('fires on_press, on_release and while_held one interval after the press', () => {
    const s = source();
    const result = s.controls.keys.press('key.keyboard.k');
    expect(result.fired).toEqual(['kb:boost']);
    expect(triggers(s)).toEqual(['You pressed Boost (K), so its event "pressed" ran.']);
    expect(s.controls.hud.valueOf('kb:mana')).toBe(15);
    ticks(s, 3);
    expect(s.inventory.count('minecraft:stick')).toBe(0);
    ticks(s, 1);
    expect(s.inventory.count('minecraft:stick')).toBe(1);
    ticks(s, 4);
    expect(s.inventory.count('minecraft:stick')).toBe(2);
    s.controls.keys.release('key.keyboard.k');
    expect(triggers(s).at(-1)).toBe('You let go of Boost (K), so its event "released" ran.');
    ticks(s, 8);
    expect(s.inventory.count('minecraft:stick')).toBe(2);
    expect(s.controls.hud.frame().map((item) => item.hud.id)).not.toContain('kb:mana');
  });

  it('checks the cooldown at press time; a refused press holds nothing', () => {
    const s = source();
    s.controls.keys.press('key.keyboard.k');
    s.controls.keys.release('key.keyboard.k');
    ticks(s, 5);
    const refused = s.controls.keys.press('key.keyboard.k');
    expect(refused.fired).toEqual([]);
    expect(s.controls.keys.held()).toEqual([]);
    expect(s.trace.at(-1)?.kind).toBe('skipped');
    expect(s.trace.at(-1)?.text).toBe(
      'You pressed Boost (K), but it rests for 1 second after each press (0.75 seconds left); nothing ran.',
    );
    ticks(s, 10);
    s.controls.keys.release('key.keyboard.k');
    ticks(s, 5);
    expect(s.controls.keys.press('key.keyboard.k').fired).toEqual(['kb:boost']);
  });

  it('treats a tap as a press and a release, and ignores a second press while held', () => {
    const s = source();
    s.controls.keys.press('key.keyboard.k');
    s.controls.keys.press('key.keyboard.k');
    s.controls.keys.release('key.keyboard.k');
    expect(triggers(s)).toEqual([
      'You pressed Boost (K), so its event "pressed" ran.',
      'You let go of Boost (K), so its event "released" ran.',
    ]);
  });

  it('ignores presses while a screen is open and lets go of held keys when one opens', () => {
    const crate = {
      format: 1,
      components: { 'msm:container': { rows: 1 } },
    };
    const extra = files();
    extra.set(`msm/${NS}/block/crate.json`, JSON.stringify(crate));
    const s = new LocalWorldSource({ files: extra, target: TARGET });
    s.act({
      type: 'place',
      pos: { x: 24, y: -1, z: 26 },
      face: 'up',
      hit: { x: 0.5, y: 1, z: 0.5 },
      block: `${NS}:crate`,
    });
    s.controls.keys.press('key.keyboard.k');
    s.act({ type: 'use', pos: { x: 24, y: 0, z: 26 }, face: 'up', hit: { x: 0.5, y: 1, z: 0.5 } });
    expect(s.screen).not.toBeNull();
    expect(s.controls.keys.held()).toEqual([]);
    expect(triggers(s).at(-1)).toBe('You let go of Boost (K), so its event "released" ran.');
    expect(s.controls.keys.press('key.keyboard.j').fired).toEqual([]);
    s.closeScreen();
    s.controls.keys.release('key.keyboard.j');
    expect(s.controls.keys.press('key.keyboard.j').fired).toEqual(['kb:walk']);
  });

  it('follows when: on foot, and driving a given vehicle', () => {
    const s = source();
    const onFoot = s.controls.keys.press('key.keyboard.j');
    expect(onFoot.fired).toEqual(['kb:walk']);
    expect(onFoot.refused).toEqual(['kb:honk']);
    expect(s.trace.some((entry) => entry.text.includes('it works only while driving Kart'))).toBe(
      true,
    );
    s.controls.keys.release('key.keyboard.j');
    getIn(s);
    const driving = s.controls.keys.press('key.keyboard.j');
    expect(driving.fired).toEqual(['kb:honk']);
    expect(s.controls.hud.valueOf('kb:label')).toBe('Beep');
  });

  it('says the runtime vehicle keys are the game’s, once, only in a vehicle that has them', () => {
    const s = source();
    s.controls.keys.press('key.keyboard.r');
    expect(s.lines.some((line) => line.text.startsWith('R (Vehicle: fire)'))).toBe(false);
    s.controls.keys.release('key.keyboard.r');
    getIn(s);
    for (const key of ['key.keyboard.r', 'key.keyboard.v', 'key.keyboard.h']) {
      s.controls.keys.press(key);
      s.controls.keys.release(key);
      s.controls.keys.press(key);
      s.controls.keys.release(key);
    }
    const only = s.lines.filter((line) => line.onlyInMinecraft).map((line) => line.text);
    expect(only.filter((text) => text.startsWith('R (Vehicle: fire) fires Kart'))).toHaveLength(1);
    expect(only.some((text) => text.startsWith('V ('))).toBe(false);
    expect(only).toContain("H (Vehicle: horn) sounds Kart's horn only in the game");
  });

  it('forgets held keys on Clear the area, without events', () => {
    const s = source();
    s.controls.keys.press('key.keyboard.k');
    s.clear();
    expect(s.controls.keys.held()).toEqual([]);
    s.controls.keys.release('key.keyboard.k');
    expect(triggers(s)).toEqual([]);
  });
});

describe('the HUD in Try it', () => {
  it('reads elements sorted by id with defaults', () => {
    const elements = readHudElements(files(), TARGET);
    expect(elements.map((one) => one.id)).toEqual([
      'kb:ammo',
      'kb:fuel',
      'kb:hearts',
      'kb:height',
      'kb:label',
      'kb:mana',
      'kb:points',
      'kb:secret',
    ]);
    expect(elements.find((one) => one.id === 'kb:label')?.show).toBe('when_set');
    expect(elements.find((one) => one.id === 'kb:mana')?.max).toBe(100);
  });

  it('draws what is shown and has a value; show_hud shows a hidden one', () => {
    const s = source();
    const ids = () => s.controls.hud.frame().map((item) => item.hud.id);
    expect(ids()).toEqual(['kb:hearts', 'kb:height']);
    s.controls.keys.press('key.keyboard.j');
    expect(ids()).toEqual(['kb:hearts', 'kb:height', 'kb:secret']);
    expect(s.controls.hud.valueOf('kb:height')).toBe(Math.floor(s.player.position.y));
    expect(s.controls.hud.valueOf('kb:hearts')).toBe(20);
    expect(s.controls.hud.valueOf('kb:points')).toBeNull();
    s.controls.hud.set('kb:points', 7);
    expect(ids()).toContain('kb:points');
    s.controls.hud.hide('kb:height');
    expect(ids()).not.toContain('kb:height');
    expect(s.controls.hud.set('kb:nothing', 1)).toBe(false);
    expect(s.controls.hud.set('kb:mana', Number.NaN)).toBe(false);
  });

  it('says out loud the sources the preview does not keep', () => {
    const s = source();
    const only = s.lines.filter((line) => line.onlyInMinecraft).map((line) => line.text);
    expect(only).toContain(
      'Points shows the score points: scores are kept only in the game, so the preview shows only what an action sets',
    );
    expect(only).toContain('Hearts shows your health: the preview has none, so it shows 20');
    expect(only).toContain(
      "Ammo shows a vehicle's ammunition: weapons are only in the game, so the preview shows only what an action sets",
    );
    expect(only.some((text) => text.startsWith('Height'))).toBe(false);
  });

  it('shows vehicle values while driving, with the dashboard rows', () => {
    const s = source();
    expect(s.controls.dashboard()).toEqual([]);
    const id = getIn(s);
    const ids = s.controls.hud.frame().map((item) => item.hud.id);
    expect(ids).toContain('kb:fuel');
    expect(ids).toContain('kb:ammo');
    expect(s.controls.hud.valueOf('kb:fuel')).toBe(0);
    expect(s.controls.hud.valueOf('kb:ammo')).toBeNull();
    const rows = s.controls.dashboard();
    expect(rows.map((row) => row.label)).toEqual(['Health', 'Fuel', 'Machine gun']);
    expect(rows[0]?.fraction).toBe(1);
    expect(rows[2]?.kind).toBe('ready');
    const snapshot = s.vehicles.snapshot(id);
    expect(snapshot).toBeDefined();
    if (snapshot !== undefined) {
      const noHud = { ...KART, hud: false } as Json;
      const kart = s.vehicles.types.get(`${NS}:kart`);
      expect(
        dashboardRows(
          kart === undefined ? undefined : { ...kart, definition: noHud as never },
          snapshot,
        ),
      ).toEqual([]);
    }
    s.act({ type: 'move', ...IDLE_INPUT, sneak: true });
    ticks(s, 2);
    expect(s.vehicles.riding).toBeNull();
    expect(s.controls.hud.frame().map((item) => item.hud.id)).not.toContain('kb:fuel');
  });

  it('runs the HUD actions from events and says when there is no element', () => {
    const extra = files();
    extra.set(
      `msm/${NS}/item/wand.json`,
      JSON.stringify({
        format: 1,
        components: { 'msm:on_use': { event: 'use' } },
        events: {
          use: event(
            { type: 'set_hud', hud: `${NS}:label`, value: 'Hello' },
            { type: 'show_hud', hud: `${NS}:missing` },
          ),
        },
      }),
    );
    const s = new LocalWorldSource({ files: extra, target: TARGET });
    s.act({
      type: 'use',
      pos: { x: 3, y: -1, z: 3 },
      face: 'up',
      hit: { x: 0.5, y: 1, z: 0.5 },
      item: `${NS}:wand`,
    });
    const texts = s.trace.map((entry) => entry.text);
    expect(texts).toContain('Set Label to "Hello" on screen.');
    expect(texts).toContain('There is no HUD element kb:missing; nothing changed on screen.');
    expect(s.controls.hud.valueOf('kb:label')).toBe('Hello');
  });
});
