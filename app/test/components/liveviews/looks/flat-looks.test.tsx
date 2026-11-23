// @vitest-environment happy-dom
/**
 * B625's flat looks (ADR 0121 D7): particle sprites, waypoint styles, potion bottles, the
 * creative tab page and the effect's frames. Pictures come from fake readers (the project's
 * files and a fake jar cache); no picture of Minecraft's is in the repository, so the jar's
 * files here are made-up bytes and JSON in the game's shapes.
 */

import type { Element, Json, Project } from '@msm/plugin-api';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { LOOKS_VIEWS } from '../../../../src/renderer/src/liveviews/looks';
import EffectLook, {
  EffectLookFrame,
  effectColourOf,
} from '../../../../src/renderer/src/liveviews/looks/effect/EffectLook';
import ParticleSprites, {
  spriteAtAge,
} from '../../../../src/renderer/src/liveviews/looks/particle/ParticleSprites';
import PotionLook, {
  potionThings,
} from '../../../../src/renderer/src/liveviews/looks/potion/PotionLook';
import {
  DEFAULT_POTION_TINT,
  potionColour,
} from '../../../../src/renderer/src/liveviews/looks/potion/potion-colour';
import CreativeTabView from '../../../../src/renderer/src/liveviews/looks/tab/CreativeTabView';
import { slotOf, tabPageThings } from '../../../../src/renderer/src/liveviews/looks/tab/page';
import {
  spriteIndex,
  spriteRanges,
  waypointSpritePath,
} from '../../../../src/renderer/src/liveviews/looks/waypoint/sprites';
import WaypointStyleView, {
  rangeWords,
} from '../../../../src/renderer/src/liveviews/looks/waypoint/WaypointStyleView';
import type { LiveViewProps } from '../../../../src/renderer/src/liveviews/registry';
import type { VanillaAssetReader } from '../../../../src/renderer/src/preview/model-chain';

afterEach(cleanup);

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);
const json = (value: Json) => new TextEncoder().encode(JSON.stringify(value));

function projectOf(elements: Element[], assets: string[] = []): Project {
  return {
    formatVersion: 1,
    name: 'Demo',
    namespaces: [
      {
        name: 'demo',
        elements,
        assets: assets.map((path) => ({ path, mediaType: 'image/png' })),
      },
    ],
    targets: [],
    plugins: [],
    settings: {},
  } as unknown as Project;
}

const el = (id: string, kind: string, data: Json): Element =>
  ({ id, kind, data }) as unknown as Element;

/** A fake jar cache: the files listed, nothing else. */
function fakeJar(files: Record<string, Uint8Array>): VanillaAssetReader {
  return { readAsset: async (path) => files[path] ?? null };
}

/** A project reader over `assets/<ns>/...` paths. */
const projectReader =
  (paths: readonly string[]) =>
  async (path: string): Promise<Uint8Array | null> =>
    paths.includes(path) ? PNG : null;

function propsOf(
  project: Project,
  element: Element,
  extra: Partial<LiveViewProps> = {},
): LiveViewProps {
  return {
    project,
    element,
    vanilla: {} as never,
    vanillaAssets: null,
    preferences: {} as never,
    onPreferences() {},
    onSetup() {},
    ...extra,
  };
}

describe('the registry (B620 index, B625 bodies)', () => {
  it('serves the five looks from their own files', async () => {
    for (const kind of [
      'minecraft:particle',
      'minecraft:waypoint_style',
      'msm:potion',
      'msm:creative_tab',
      'msm:effect',
    ]) {
      const loaded = await (LOOKS_VIEWS[kind] as () => Promise<{ default: unknown }>)();
      expect(typeof loaded.default, kind).toBe('function');
    }
  });
});

describe('potion colour', () => {
  const effects = [
    el('demo:frost', 'msm:effect', { format: 1, category: 'harmful', color: 0x0000ff }),
    el('demo:heat', 'msm:effect', { format: 1, category: 'harmful', color: 0xff0000 }),
  ];
  const project = projectOf(effects);

  it('mixes the project effects by level as the game does, whole numbers per channel', () => {
    const mix = potionColour(project, {
      effects: [
        { id: 'demo:frost', duration_ticks: 20 },
        { id: 'demo:heat', duration_ticks: 20, amplifier: 1 },
      ],
    });
    // Weights 1 and 2: red 2 x 255 / 3 = 170, blue 255 / 3 = 85.
    expect(mix.colour).toBe(0xaa0055);
    expect(mix.mixed).toEqual(['demo:frost', 'demo:heat']);
    expect(mix.unknown).toEqual([]);
  });

  it('leaves out effects without particles and names Minecraft’s own', () => {
    const mix = potionColour(project, {
      effects: [
        { id: 'demo:heat', duration_ticks: 20, show_particles: false },
        { id: 'minecraft:speed', duration_ticks: 20 },
      ],
    });
    expect(mix.colour).toBeNull();
    expect(mix.unknown).toEqual(['minecraft:speed']);
    expect(potionColour(project, { effects: [] }).anyVisible).toBe(false);
  });

  it('makes the things the switches allow', () => {
    expect(potionThings({})).toEqual([
      'potion',
      'splash_potion',
      'lingering_potion',
      'tipped_arrow',
    ]);
    expect(potionThings({ splash: false, lingering: false })).toEqual(['potion']);
  });
});

describe('the potion look', () => {
  const potion = (effectColour: number) => {
    const effect = el('demo:frost', 'msm:effect', {
      format: 1,
      category: 'harmful',
      color: effectColour,
    });
    const bottle = el('demo:frost_potion', 'msm:potion', {
      format: 1,
      display_name: 'Frost',
      effects: [{ id: 'demo:frost', duration_ticks: 200 }],
    });
    return { project: projectOf([effect, bottle]), bottle };
  };

  it('draws MSM’s bottles in the potion’s colour, and the colour follows the effect’s', async () => {
    const first = potion(0x112233);
    const view = render(<PotionLook {...propsOf(first.project, first.bottle)} />);
    await waitFor(() =>
      expect(screen.getByTestId('potion-look-potion').getAttribute('data-drawn')).toBe('drawn'),
    );
    expect(screen.getByTestId('potion-look-colour').getAttribute('data-colour')).toBe('#112233');
    for (const thing of ['potion', 'splash_potion', 'lingering_potion', 'tipped_arrow']) {
      expect(screen.getByTestId(`potion-look-${thing}`).getAttribute('data-colour')).toBe(
        '#112233',
      );
    }
    expect(screen.getByTestId('live-view-notes').textContent).toContain('not set up');
    // The names B615's view showed are still there.
    expect(screen.getByTestId('live-potion-names').textContent).toContain('Potion of Frost');

    const second = potion(0xabcdef);
    view.rerender(<PotionLook {...propsOf(second.project, second.bottle)} />);
    expect(screen.getByTestId('potion-look-potion').getAttribute('data-colour')).toBe('#abcdef');
    expect(screen.getByTestId('live-view-fidelity').getAttribute('data-fidelity')).toBe(
      'about_right',
    );
  });

  it('draws the jar’s layers with the definition’s tints', async () => {
    const { project, bottle } = potion(0x00ff00);
    const jar = fakeJar({
      'assets/minecraft/items/potion.json': json({
        model: {
          type: 'minecraft:model',
          model: 'minecraft:item/potion',
          tints: [{ type: 'minecraft:potion', default: -13083194 }],
        },
      }),
      'assets/minecraft/models/item/potion.json': json({
        parent: 'minecraft:item/generated',
        textures: { layer0: 'minecraft:item/potion_overlay', layer1: 'minecraft:item/potion' },
      }),
      'assets/minecraft/textures/item/potion_overlay.png': PNG,
      'assets/minecraft/textures/item/potion.png': PNG,
    });
    render(<PotionLook {...propsOf(project, bottle, { vanillaAssets: jar })} />);
    await waitFor(() =>
      expect(screen.getByTestId('potion-look-potion').getAttribute('data-drawn')).toBe('jar'),
    );
    const tinted = screen.getByTestId('potion-look-potion').querySelectorAll('[data-tint]');
    expect(tinted).toHaveLength(1);
    expect(tinted[0]?.getAttribute('data-tint')).toBe('#00ff00');
    expect(screen.getByTestId('potion-look-potion').querySelectorAll('img')).toHaveLength(1);
    // The splash bottle is not in this fake jar: MSM draws it.
    expect(screen.getByTestId('potion-look-splash_potion').getAttribute('data-drawn')).toBe(
      'drawn',
    );
  });

  it('says only the game knows the colour of Minecraft’s own effects', async () => {
    const bottle = el('demo:fast', 'msm:potion', {
      format: 1,
      effects: [{ id: 'minecraft:speed', duration_ticks: 200 }],
    });
    render(<PotionLook {...propsOf(projectOf([bottle]), bottle)} />);
    expect(screen.getByTestId('live-view-fidelity').getAttribute('data-fidelity')).toBe(
      'only_in_game',
    );
    expect(screen.getByTestId('potion-look-colour').getAttribute('data-colour')).toBe(
      `#${DEFAULT_POTION_TINT.toString(16).padStart(6, '0')}`,
    );
    expect(screen.getByTestId('live-view-notes').textContent).toContain('The colour of Speed');
  });
});

describe('the creative tab page', () => {
  const items = [
    el('demo:zircon', 'msm:item', { display_name: 'Zircon', creative_tab: 'demo:gems' }),
    el('demo:amber', 'msm:item', { display_name: 'Amber', creative_tab: 'demo:gems' }),
    el('demo:loose', 'msm:item', { display_name: 'Loose' }),
  ];
  const tab = (data: Json) => el('demo:gems', 'msm:creative_tab', data);
  const names = () =>
    Array.from(document.querySelectorAll('[data-testid^="creative-tab-page-slot-"]')).map((node) =>
      node.getAttribute('data-name'),
    );

  it('lays things out in the 9 by 5 grid', () => {
    expect(slotOf(0)).toEqual({ page: 0, x: 9, y: 18 });
    expect(slotOf(10)).toEqual({ page: 0, x: 27, y: 36 });
    expect(slotOf(45)).toEqual({ page: 1, x: 9, y: 18 });
  });

  it('shows the things in the data’s order, and the order follows an edit', () => {
    const first = tab({ display_name: 'Gems', icon: 'demo:amber' });
    const project = projectOf([...items, first]);
    const view = render(<CreativeTabView {...propsOf(project, first)} />);
    expect(names()).toEqual(['Zircon', 'Amber']);
    expect(screen.getByTestId('creative-tab-page-title').textContent).toBe('Gems');
    expect(screen.getByTestId('creative-tab-page-icon')).toBeTruthy();
    expect(screen.getByTestId('creative-tab-page').getAttribute('data-drawn')).toBe('msm');

    const byName = tab({ display_name: 'Gems', order: 'by_name' });
    view.rerender(<CreativeTabView {...propsOf(projectOf([...items, byName]), byName)} />);
    expect(names()).toEqual(['Amber', 'Zircon']);

    const byHand = tab({
      display_name: 'Gems',
      order: 'by_hand',
      items: ['minecraft:diamond', 'demo:zircon'],
    });
    view.rerender(<CreativeTabView {...propsOf(projectOf([...items, byHand]), byHand)} />);
    expect(names()).toEqual(['Diamond', 'Zircon', 'Amber']);
    expect(tabPageThings(projectOf([...items, byHand]), byHand).map((t) => t.own)).toEqual([
      false,
      true,
      true,
    ]);
  });

  it('draws the jar’s panel and the project’s own pictures', async () => {
    const first = tab({ display_name: 'Gems' });
    const project = projectOf([...items, first], ['textures/item/zircon.png']);
    const jar = fakeJar({
      'assets/minecraft/textures/gui/container/creative_inventory/tab_items.png': PNG,
    });
    render(
      <CreativeTabView
        {...propsOf(project, first, {
          vanillaAssets: jar,
          readProject: projectReader(['assets/demo/textures/item/zircon.png']),
        })}
      />,
    );
    await waitFor(() =>
      expect(screen.getByTestId('creative-tab-page').getAttribute('data-drawn')).toBe('jar'),
    );
    await waitFor(() =>
      expect(screen.getByTestId('creative-tab-page-slot-0').querySelector('img')).toBeTruthy(),
    );
    // Amber has no picture: its letters stand in.
    expect(screen.getByTestId('creative-tab-page-slot-1').textContent).toBe('A');
  });

  it('pages after 45 things', () => {
    const many = Array.from({ length: 50 }, (_, n) =>
      el(`demo:thing_${String(n).padStart(2, '0')}`, 'msm:item', { creative_tab: 'demo:gems' }),
    );
    const first = tab({});
    render(<CreativeTabView {...propsOf(projectOf([...many, first]), first)} />);
    expect(names()).toHaveLength(45);
    expect(screen.getByTestId('creative-tab-page-number').textContent).toBe('Page 1 of 2');
    fireEvent.click(screen.getByTestId('creative-tab-page-next'));
    expect(names()).toHaveLength(5);
  });
});

describe('waypoint styles (3S11)', () => {
  it('gives each sprite its range, matching spriteIndex', () => {
    const ranges = spriteRanges(8, 32, 4);
    expect(ranges).toEqual([
      { index: 0, from: 0, to: 8 },
      { index: 1, from: 8, to: 20 },
      { index: 2, from: 20, to: 32 },
      { index: 3, from: 32, to: null },
    ]);
    for (let d = 0; d < 50; d += 0.5) {
      const range = ranges.find((r) => d >= r.from && (r.to === null || d < r.to));
      expect(range?.index, `distance ${d}`).toBe(spriteIndex(d, 8, 32, 4));
    }
    // Two sprites: the last from near on, as the rule gives.
    expect(spriteRanges(8, 32, 2)).toEqual([
      { index: 0, from: 0, to: 8 },
      { index: 1, from: 8, to: null },
    ]);
    expect(spriteIndex(20, 8, 32, 2)).toBe(1);
    expect(rangeWords({ index: 0, from: 0, to: 8 })).toBe('Closer than 8 blocks');
    expect(rangeWords({ index: 3, from: 32, to: null })).toBe('32 blocks and further');
    expect(waypointSpritePath('minecraft:default_0')).toBe(
      'assets/minecraft/textures/gui/sprites/hud/locator_bar_dot/default_0.png',
    );
  });

  it('draws a step per sprite and moves the bar’s dot with the distance', async () => {
    const style = el('demo:dots', 'minecraft:waypoint_style', {
      near_distance: 8,
      far_distance: 32,
      sprites: ['demo:a', 'demo:b', 'demo:c', 'demo:d'],
    });
    const view = render(
      <WaypointStyleView
        {...propsOf(projectOf([style]), style, {
          readProject: projectReader([
            'assets/demo/textures/gui/sprites/hud/locator_bar_dot/a.png',
            'assets/demo/textures/gui/sprites/hud/locator_bar_dot/b.png',
          ]),
        })}
      />,
    );
    await waitFor(() =>
      expect(screen.getByTestId('waypoint-step-0').getAttribute('data-state')).toBe('found'),
    );
    expect(screen.getByTestId('waypoint-step-3').getAttribute('data-state')).toBe('missing');
    expect(screen.getByTestId('live-view-notes').textContent).toContain('Dot 3 has no picture yet');
    fireEvent.change(screen.getByTestId('waypoint-distance'), { target: { value: '25' } });
    expect(screen.getByTestId('waypoint-bar').getAttribute('data-index')).toBe('2');

    const edited = el('demo:dots', 'minecraft:waypoint_style', {
      near_distance: 30,
      far_distance: 60,
      sprites: ['demo:a', 'demo:b', 'demo:c', 'demo:d'],
    });
    view.rerender(<WaypointStyleView {...propsOf(projectOf([edited]), edited)} />);
    expect(screen.getByTestId('waypoint-bar').getAttribute('data-index')).toBe('0');
  });
});

describe('particle sprites', () => {
  it('plays the sprites in order over the life', () => {
    expect([0, 5, 10, 15, 19, 20].map((age) => spriteAtAge(age, 20, 4))).toEqual([
      0, 1, 2, 3, 3, 0,
    ]);
  });

  it('shows each sprite, marks one with no picture, and follows an edit', async () => {
    const particle = (textures: string[]) =>
      el('demo:spark', 'minecraft:particle', { textures }) as Element;
    const read = projectReader([
      'assets/demo/textures/particle/spark_0.png',
      'assets/demo/textures/particle/spark_1.png',
    ]);
    const first = particle(['demo:spark_0', 'demo:spark_1', 'demo:spark_2']);
    const view = render(
      <ParticleSprites {...propsOf(projectOf([first]), first, { readProject: read })} />,
    );
    await waitFor(() =>
      expect(screen.getByTestId('particle-sprites-frame-2').getAttribute('data-state')).toBe(
        'missing',
      ),
    );
    expect(screen.getByTestId('particle-sprites-frame-0').getAttribute('data-state')).toBe('found');
    expect(screen.getByTestId('live-view-notes').textContent).toContain(
      'Picture 3 has no picture yet',
    );
    fireEvent.click(screen.getByTestId('particle-sprites-step'));
    expect(screen.getByTestId('particle-sprites-current').getAttribute('data-index')).toBe('1');

    const second = particle(['demo:spark_1']);
    view.rerender(
      <ParticleSprites {...propsOf(projectOf([second]), second, { readProject: read })} />,
    );
    await waitFor(() =>
      expect(screen.getByTestId('particle-sprites-frame-0').getAttribute('data-state')).toBe(
        'found',
      ),
    );
    expect(screen.queryByTestId('particle-sprites-frame-1')).toBeNull();
  });

  it('asks for the Minecraft folder for Minecraft’s own sprites', async () => {
    const particle = el('demo:smoke', 'minecraft:particle', { textures: ['minecraft:generic_0'] });
    render(<ParticleSprites {...propsOf(projectOf([particle]), particle)} />);
    expect(screen.getByTestId('live-view-set-up')).toBeTruthy();
    const jar = fakeJar({ 'assets/minecraft/textures/particle/generic_0.png': PNG });
    cleanup();
    render(
      <ParticleSprites {...propsOf(projectOf([particle]), particle, { vanillaAssets: jar })} />,
    );
    await waitFor(() =>
      expect(screen.getByTestId('particle-sprites-frame-0').getAttribute('data-state')).toBe(
        'found',
      ),
    );
    expect(screen.queryByTestId('live-view-set-up')).toBeNull();
  });
});

describe('the effect look', () => {
  const effect = (color: number, extra: Record<string, Json> = {}) =>
    el('demo:rush', 'msm:effect', { format: 1, category: 'beneficial', color, ...extra });

  it('draws the frames and the swirl in the effect’s colour, which follows an edit', async () => {
    const first = effect(0xff8800);
    const view = render(
      <EffectLookFrame project={projectOf([first])} element={first} vanillaAssets={null} />,
    );
    expect(screen.getByTestId('effect-look-swirl').getAttribute('data-colour')).toBe('#ff8800');
    expect(screen.getByTestId('effect-look-hud').getAttribute('data-drawn')).toBe('msm');
    expect(screen.getByTestId('effect-look-panel-name').textContent).toBe('Rush');
    const second = effect(0x0088ff);
    view.rerender(
      <EffectLookFrame project={projectOf([second])} element={second} vanillaAssets={null} />,
    );
    expect(screen.getByTestId('effect-look-swirl').getAttribute('data-colour')).toBe('#0088ff');
    expect(effectColourOf({})).toBeNull();
  });

  it('uses the jar’s frames and swirl sprites, and the project’s icon', async () => {
    const first = effect(0x00ff00);
    const gui = 'assets/minecraft/textures/gui/sprites';
    const files: Record<string, Uint8Array> = {
      [`${gui}/hud/effect_background.png`]: PNG,
      [`${gui}/hud/effect_background_ambient.png`]: PNG,
      [`${gui}/container/inventory/effect_background.png`]: PNG,
    };
    for (let n = 0; n < 8; n += 1)
      files[`assets/minecraft/textures/particle/effect_${n}.png`] = PNG;
    render(
      <EffectLook
        {...propsOf(projectOf([first], ['textures/mob_effect/rush.png']), first, {
          vanillaAssets: fakeJar(files),
          readProject: projectReader(['assets/demo/textures/mob_effect/rush.png']),
        })}
      />,
    );
    await waitFor(() =>
      expect(screen.getByTestId('effect-look-hud').getAttribute('data-drawn')).toBe('jar'),
    );
    expect(screen.getByTestId('effect-look-panel').getAttribute('data-drawn')).toBe('jar');
    await waitFor(() =>
      expect(
        screen.getByTestId('effect-look-swirl').querySelectorAll('[data-tint="#00ff00"]'),
      ).toHaveLength(8),
    );
    await waitFor(() =>
      expect(screen.getAllByTestId('effect-look-hud-icon')[0]?.tagName).toBe('IMG'),
    );
    // B615's card is still below.
    expect(screen.getByTestId('live-effect-name').textContent).toBe('Rush');
  });

  it('names its own particle in place of the swirl', () => {
    const first = effect(0x00ff00, { particle: 'minecraft:heart' });
    render(<EffectLookFrame project={projectOf([first])} element={first} vanillaAssets={null} />);
    expect(screen.getByTestId('live-view-notes').textContent).toContain(
      'It shows Heart around the player',
    );
  });
});
