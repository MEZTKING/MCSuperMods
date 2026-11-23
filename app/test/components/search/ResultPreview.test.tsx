// @vitest-environment happy-dom
/**
 * The search's live preview pane (B665; ADR 0124 D9, limit SL8): with a fake clock, the 150 ms
 * wait (a fast move builds nothing; new words restart it), the dropped build when the selection
 * moves, a failed build, and each preview type: a flow with the understood answers through
 * `CreatorPreview` and its "Makes …" line (the real Weapon flow, no WebGL), a starter, an
 * example, a template, a chooser, a Showcase still with its play button (one clip, reduced
 * motion, the setting, no WebGL), a thing of the mod through the Preview panel, a picture of the
 * mod, a vanilla id's picture, a read-only rule card, a guide section's first paragraph, a
 * setting's sentence and a result the target cannot make. Very easy draws no ids.
 */

import type { Json } from '@msm/core';
import type { ExampleProject } from '@msm/plugin-api';
import { libraryStarters } from '@msm/plugin-library';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ResultPreview,
  type ResultPreviewHost,
  type ResultPreviewProps,
} from '../../../src/renderer/src/search/ResultPreview';
import type { ClipViewProps } from '../../../src/renderer/src/showcase/ClipView';
import type { LiveClipEnvironment } from '../../../src/renderer/src/showcase/live-clip';
import { SHOWCASES } from '../../../src/renderer/src/showcase/showcases';
import {
  deferred,
  fakeExample,
  fakeFlow,
  host,
  itemBundle,
  PNG,
  previewHit,
  smallMod,
} from './preview-fixtures';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

/** Lets the pending promises settle (the fake clock does not run them). */
async function settle(): Promise<void> {
  await act(async () => {
    for (let i = 0; i < 10; i += 1) await Promise.resolve();
  });
}

async function advance(ms: number): Promise<void> {
  await act(async () => {
    vi.advanceTimersByTime(ms);
  });
  await settle();
}

function show(props: Partial<ResultPreviewProps> & Pick<ResultPreviewProps, 'hit' | 'host'>) {
  return render(<ResultPreview webgl={false} {...props} />);
}

const pane = () => screen.getByTestId('search-result-preview');

const flowHit = (starter: string, answers?: Record<string, Json>, id = `flow:${starter}`) =>
  previewHit(
    id,
    'flow',
    `Flow ${starter}`,
    { type: 'flow', starter },
    {
      ...(answers === undefined ? {} : { answers }),
    },
  );

/** No `ns:path` id and none of Very easy's forbidden words in the text. */
function expectNoIds(text: string): void {
  expect(text).not.toMatch(/\b[a-z0-9_.-]+:[a-z0-9_./-]+\b/);
  expect(text.toLowerCase()).not.toMatch(/\b(template|element|starter|namespace|json)\b/);
}

describe('the wait and the cancel', () => {
  it('shows the plain tile at once and builds 150 ms after the selection rests', async () => {
    const build = vi.fn((context) => itemBundle(context.namespace, 'Blue Sword'));
    show({
      hit: flowHit('sword', { sword_name: 'Blue Sword' }),
      host: host({
        library: { starters: [fakeFlow('sword', build)], templates: [], examples: [] },
      }),
    });
    expect(pane().dataset.state).toBe('waiting');
    expect(screen.getByTestId('search-preview-tile')).toBeTruthy();
    await advance(149);
    expect(build).not.toHaveBeenCalled();
    await advance(1);
    expect(build).toHaveBeenCalledTimes(1);
    expect(build.mock.calls[0]?.[0].values.sword_name).toBe('Blue Sword');
    expect(pane().dataset.state).toBe('drawn');
    expect(screen.getByTestId('search-preview-creator')).toBeTruthy();
    expect(screen.getByTestId('search-preview-makes').textContent).toBe('Makes Blue Sword.');
  });

  it('builds nothing for a selection passed over within 150 ms', async () => {
    const build = vi.fn((context) => itemBundle(context.namespace, 'Thing'));
    const library = {
      starters: [fakeFlow('a', build), fakeFlow('b', build)],
      templates: [],
      examples: [],
    };
    const view = show({ hit: flowHit('a'), host: host({ library }) });
    await advance(100);
    view.rerender(<ResultPreview webgl={false} hit={flowHit('b')} host={host({ library })} />);
    await advance(100);
    expect(build).not.toHaveBeenCalled();
    await advance(50);
    expect(build).toHaveBeenCalledTimes(1);
    expect(build.mock.calls[0]?.[0].values.sword_name).toBe('Ruby Sword');
  });

  it('waits again when the words change the answers of the same result', async () => {
    const build = vi.fn((context) =>
      itemBundle(context.namespace, String(context.values.sword_name)),
    );
    const library = { starters: [fakeFlow('sword', build)], templates: [], examples: [] };
    const view = show({
      hit: flowHit('sword', { sword_name: 'Red Sword' }),
      host: host({ library }),
    });
    await advance(100);
    view.rerender(
      <ResultPreview
        webgl={false}
        hit={flowHit('sword', { sword_name: 'Blue Sword' })}
        host={host({ library })}
      />,
    );
    await advance(100);
    expect(build).not.toHaveBeenCalled();
    await advance(50);
    expect(build).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('search-preview-makes').textContent).toBe('Makes Blue Sword.');
  });

  it('drops an older build when the selection moves while it runs', async () => {
    const slow = deferred<ReturnType<typeof itemBundle>>();
    const library = {
      starters: [
        fakeFlow('slow', () => slow.promise),
        fakeFlow('quick', (context) => itemBundle(context.namespace, 'Quick Gem')),
      ],
      templates: [],
      examples: [],
    };
    const view = show({ hit: flowHit('slow'), host: host({ library }) });
    await advance(150);
    expect(pane().dataset.state).toBe('building');
    view.rerender(<ResultPreview webgl={false} hit={flowHit('quick')} host={host({ library })} />);
    expect(pane().dataset.state).toBe('waiting');
    // The old build finishes now: it is never shown.
    slow.resolve(itemBundle('my_mod', 'Slow Gem'));
    await settle();
    expect(screen.queryByText('Makes Slow Gem.')).toBeNull();
    await advance(150);
    expect(screen.getByTestId('search-preview-makes').textContent).toBe('Makes Quick Gem.');
    expect(screen.queryByText('Makes Slow Gem.')).toBeNull();
  });

  it('keeps the plain tile and says so when a build fails', async () => {
    const library = {
      starters: [
        fakeFlow('broken', () => {
          throw new Error('demo:broken has no picture');
        }),
      ],
      templates: [],
      examples: [],
    };
    const view = show({ hit: flowHit('broken'), host: host({ library }) });
    await advance(150);
    expect(pane().dataset.state).toBe('failed');
    expect(screen.getByTestId('search-preview-tile')).toBeTruthy();
    expect(screen.getByTestId('search-preview-failed').textContent).toContain('could not be made');
    cleanup();
    show({ hit: flowHit('broken'), host: host({ library, mode: 'very-easy' }) });
    await advance(150);
    expect(screen.getByTestId('search-preview-failed').textContent).toBe(
      'The picture could not be made.',
    );
    expectNoIds(pane().textContent ?? '');
    void view;
  });

  it('reports the time from the selection to the drawn picture', async () => {
    const onDrawn = vi.fn();
    let clock = 1000;
    show({
      hit: flowHit('sword'),
      host: host({ library: { starters: [fakeFlow('sword')], templates: [], examples: [] } }),
      now: () => clock,
      onDrawn,
    });
    clock = 1160;
    await advance(150);
    expect(onDrawn).toHaveBeenCalledWith({ id: 'flow:sword', ms: 160 });
    expect(screen.getByTestId('search-preview-creator').dataset.ms).toBe('160');
  });
});

describe('built in memory', () => {
  const weapon = libraryStarters.find((starter) => starter.id === 'weapon');
  const library = { starters: weapon === undefined ? [] : [weapon], templates: [], examples: [] };
  const answers = { weapon_type: 'sword', colour: '#3355ff', weapon_name: 'Blue Sword' };

  it('draws the Weapon flow with the understood answers through CreatorPreview, without WebGL', async () => {
    expect(weapon).toBeDefined();
    show({ hit: flowHit('weapon', answers), host: host({ library }) });
    await advance(150);
    const creator = screen.getByTestId('search-preview-creator');
    expect(creator.querySelector('[role="tablist"]')).not.toBeNull();
    expect(screen.getByTestId('creator-tab-items').getAttribute('aria-selected')).toBe('true');
    expect(creator.textContent).toContain('Blue Sword');
    expect(creator.querySelector('img')).not.toBeNull();
    expect(screen.getByTestId('search-preview-makes').textContent).toBe('Makes Blue Sword.');
  });

  it('drops an answer the flow refuses and builds with its default', async () => {
    show({
      hit: flowHit('weapon', { ...answers, durability: -5 }),
      host: host({ library }),
    });
    await advance(150);
    expect(pane().dataset.state).toBe('drawn');
    expect(screen.getByTestId('search-preview-makes').textContent).toBe('Makes Blue Sword.');
  });

  it('hides the tabs and every id in Very easy', async () => {
    show({ hit: flowHit('weapon', answers), host: host({ library, mode: 'very-easy' }) });
    await advance(150);
    const creator = screen.getByTestId('search-preview-creator');
    expect(creator.className).toContain('[&_[role=tablist]]:hidden');
    // Only the open tab's content is in the page: the Items gallery.
    expectNoIds(creator.textContent ?? '');
    expectNoIds(pane().textContent ?? '');
  });

  it('builds a starter that is not a flow, and an example', async () => {
    const { creator: _flow, ...starter } = fakeFlow('kit', (context) =>
      itemBundle(context.namespace, 'Kit Gem'),
    );
    const example = fakeExample('example_gem');
    const all = { starters: [starter], templates: [], examples: [example] };
    show({
      hit: previewHit('starter:kit', 'starter', 'Kit', { type: 'starter', starter: 'kit' }),
      host: host({ library: all }),
    });
    await advance(150);
    expect(screen.getByTestId('search-preview-makes').textContent).toBe('Makes Kit Gem.');
    cleanup();
    show({
      hit: previewHit('example:example_gem', 'example', 'Gem', {
        type: 'example',
        example: 'example_gem',
      }),
      host: host({ library: all }),
    });
    await advance(150);
    expect(screen.getByTestId('search-preview-makes').textContent).toBe('Makes Example Gem.');
    expect(screen.getByTestId('search-preview-creator')).toBeTruthy();
  });

  it("builds a template's element in the open mod's namespace", async () => {
    show({
      hit: previewHit('template:blocks-items.item', 'template', 'Item', {
        type: 'template',
        template: 'blocks-items.item',
        kind: 'msm:item',
      }),
      host: host({ project: smallMod() }),
    });
    await advance(150);
    expect(screen.getByTestId('search-preview-makes').textContent).toBe('Makes Ruby.');
    expect(screen.getByTestId('creator-item-demo:ruby')).toBeTruthy();
  });

  it('builds nothing for a result the target cannot make, and gives the reason', async () => {
    const build = vi.fn((context) => itemBundle(context.namespace, 'Thing'));
    show({
      hit: previewHit(
        'flow:sword',
        'flow',
        'Sword',
        { type: 'flow', starter: 'sword' },
        {
          available: false,
          reason: 'Not available for Minecraft 26.4.',
        },
      ),
      host: host({
        library: { starters: [fakeFlow('sword', build)], templates: [], examples: [] },
      }),
    });
    await advance(150);
    expect(build).not.toHaveBeenCalled();
    expect(screen.getByTestId('search-preview-tile')).toBeTruthy();
    expect(screen.getByTestId('search-preview-text').textContent).toBe(
      'Not available for Minecraft 26.4.',
    );
  });

  it('names the flows of a chooser', async () => {
    show({
      hit: previewHit('tile:mobs', 'tile', 'Make a mob', {
        type: 'flows',
        flows: ['a', 'b'],
      }),
      host: host({
        library: { starters: [fakeFlow('a'), fakeFlow('b')], templates: [], examples: [] },
      }),
    });
    await advance(150);
    expect(screen.getByTestId('search-preview-choices').textContent).toBe(
      'Choose from Flow a or Flow b.',
    );
  });
});

describe('the Showcase', () => {
  const clip = SHOWCASES[0];
  const example: ExampleProject = { ...fakeExample(clip?.exampleId ?? 'x') };
  const codec = {
    decode: async () => ({ width: 1, height: 1, data: new Uint8ClampedArray(4) }),
    encode: () => PNG,
  };
  const played: ClipViewProps[] = [];
  function FakeClip(props: ClipViewProps) {
    played.push(props);
    return <div data-testid="fake-clip" />;
  }
  function environment(reduced: boolean): LiveClipEnvironment {
    return {
      reducedMotion: () => reduced,
      onReducedMotion: () => () => {},
      windowShown: () => true,
      onWindowShown: () => () => {},
      watchInView: () => () => {},
    };
  }
  const cardHit = () =>
    previewHit(`card:${clip?.id}`, 'tile', clip?.title ?? '', {
      type: 'showcase',
      card: clip?.id ?? '',
      example: clip?.exampleId ?? '',
    });
  const showcaseHost = (extra: Partial<ResultPreviewHost> = {}) =>
    host({
      library: { starters: [], templates: [], examples: [example] },
      showcase: { deps: { registry: {} as never, plugins: [] }, playClips: true },
      ...extra,
    });

  beforeEach(() => {
    played.length = 0;
  });

  it('shows the still and plays one clip only when asked', async () => {
    show({
      hit: cardHit(),
      host: showcaseHost(),
      webgl: true,
      codec: codec as never,
      clipView: FakeClip,
      environment: environment(false),
    });
    await advance(150);
    expect(screen.getByTestId('search-preview-still')).toBeTruthy();
    expect(screen.queryByTestId('fake-clip')).toBeNull();
    fireEvent.click(screen.getByTestId('search-preview-play'));
    await settle();
    expect(screen.getAllByTestId('fake-clip')).toHaveLength(1);
    expect(played.at(-1)?.once).toBe(false);
    expect(screen.getByTestId('search-preview-play').getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByTestId('search-preview-play'));
    await settle();
    expect(screen.queryByTestId('fake-clip')).toBeNull();
  });

  it('plays once under reduced motion or with Play showcase clips off', async () => {
    show({
      hit: cardHit(),
      host: showcaseHost(),
      webgl: true,
      codec: codec as never,
      clipView: FakeClip,
      environment: environment(true),
    });
    await advance(150);
    fireEvent.click(screen.getByTestId('search-preview-play'));
    await settle();
    expect(played.at(-1)?.once).toBe(true);
    cleanup();
    show({
      hit: cardHit(),
      host: showcaseHost({
        showcase: { deps: { registry: {} as never, plugins: [] }, playClips: false },
      }),
      webgl: true,
      codec: codec as never,
      clipView: FakeClip,
      environment: environment(false),
    });
    await advance(150);
    expect(screen.queryByTestId('fake-clip')).toBeNull();
    fireEvent.click(screen.getByTestId('search-preview-play'));
    await settle();
    expect(played.at(-1)?.once).toBe(true);
  });

  it('shows the still and the Showcase line without WebGL', async () => {
    show({
      hit: cardHit(),
      host: showcaseHost(),
      webgl: false,
      codec: codec as never,
      clipView: FakeClip,
      environment: environment(false),
    });
    await advance(150);
    expect(screen.getByTestId('search-preview-still')).toBeTruthy();
    expect(screen.queryByTestId('search-preview-play')).toBeNull();
    expect(screen.getByTestId('search-preview-no-webgl').textContent).toBe(
      'This computer cannot show moving pictures here.',
    );
  });
});

describe('the mod, Minecraft and words', () => {
  it("draws a thing of the mod through the Preview panel's route", async () => {
    show({
      hit: previewHit('project:element:demo:ruby', 'project', 'Ruby', {
        type: 'element',
        element: 'demo:ruby',
      }),
      host: host({ project: smallMod() }),
    });
    await advance(150);
    const element = screen.getByTestId('search-preview-element');
    expect(element.textContent).toContain('WebGL is disabled');
  });

  it('keeps the sentence for a thing with no picture route', async () => {
    show({
      hit: previewHit(
        'project:element:demo:notes',
        'project',
        'Notes',
        { type: 'element', element: 'demo:notes' },
        { sentence: 'Language file' },
      ),
      host: host({ project: smallMod() }),
    });
    await advance(150);
    expect(screen.queryByTestId('search-preview-element')).toBeNull();
    expect(screen.getByTestId('search-preview-text').textContent).toBe('Language file');
  });

  it('shows a picture of the mod', async () => {
    const read = vi.fn(async () => PNG);
    show({
      hit: previewHit('project:asset:demo:textures/item/ruby.png', 'project', 'Ruby', {
        type: 'asset',
        namespace: 'demo',
        path: 'textures/item/ruby.png',
      }),
      host: host({ project: smallMod(), readProjectAsset: read }),
    });
    await advance(150);
    expect(read).toHaveBeenCalledWith('demo', 'textures/item/ruby.png');
    expect(
      screen.getByTestId('search-preview-asset').querySelector('img')?.getAttribute('src'),
    ).toMatch(/^data:image\/png;base64,/);
  });

  it("shows a vanilla id's picture through ThingPictures", async () => {
    const vanilla = vi.fn(async (path: string) =>
      path.endsWith('item/diamond_sword.png') ? PNG : null,
    );
    show({
      hit: previewHit('vanilla:thing:diamond_sword', 'vanilla', 'Diamond sword', {
        type: 'vanilla',
        id: 'minecraft:diamond_sword',
        sort: 'thing',
      }),
      host: host({ pictures: { vanilla } }),
    });
    await advance(150);
    expect(vanilla).toHaveBeenCalledWith('assets/minecraft/textures/item/diamond_sword.png');
    expect(screen.getByTestId('search-preview-vanilla').querySelector('img')).not.toBeNull();
  });

  it('shows a rule of the mod as a read-only card', async () => {
    for (const mode of ['advanced', 'very-easy'] as const) {
      show({
        hit: previewHit('project:rule:demo:ruby_rules#0', 'project', 'Ruby boom', {
          type: 'rule',
          book: 'demo:ruby_rules',
          index: 0,
        }),
        host: host({ project: smallMod(), mode }),
      });
      await advance(150);
      const card = screen.getByTestId('search-preview-rule');
      expect(card.textContent).toContain('Ruby boom');
      expect(card.textContent).toContain('When');
      expect(card.textContent).toContain('Ruby');
      expect(card.textContent).toContain('Only if');
      expect(card.textContent).toContain('Do');
      expect(card.textContent).toContain('explosion');
      expect(card.querySelector('input, button, select')).toBeNull();
      if (mode === 'very-easy') expectNoIds(card.textContent ?? '');
      cleanup();
    }
  });

  it("shows a guide section's first paragraph", async () => {
    const page = vi.fn(async () =>
      [
        '# Recipes',
        '',
        'Intro.',
        '',
        '## Add a recipe',
        '',
        '| a | b |',
        '|---|---|',
        '| 1 | 2 |',
        '',
        'Open **Add element** and pick [a recipe](recipes.md#kinds). It is `minecraft:recipe`.',
        '',
        '## Next',
        '',
        'Later.',
      ].join('\n'),
    );
    show({
      hit: previewHit('guide:recipes#add-a-recipe', 'guide', 'Add a recipe', {
        type: 'guide',
        page: 'recipes',
        anchor: 'add-a-recipe',
      }),
      host: host({ readGuidePage: page }),
    });
    await advance(150);
    expect(page).toHaveBeenCalledWith('recipes');
    expect(screen.getByTestId('search-preview-guide').textContent).toBe(
      'Open Add element and pick a recipe. It is minecraft:recipe.',
    );
    cleanup();
    show({
      hit: previewHit('guide:recipes#add-a-recipe', 'guide', 'Add a recipe', {
        type: 'guide',
        page: 'recipes',
        anchor: 'add-a-recipe',
      }),
      host: host({ readGuidePage: page, mode: 'very-easy' }),
    });
    await advance(150);
    expectNoIds(screen.getByTestId('search-preview-guide').textContent ?? '');
  });

  it("shows a setting's and a command's sentence", async () => {
    show({
      hit: previewHit(
        'setting:theme',
        'setting',
        'Theme',
        { type: 'setting', setting: 'theme' },
        { sentence: 'Light, dark or as the system.' },
      ),
      host: host(),
    });
    await advance(150);
    expect(pane().dataset.state).toBe('drawn');
    expect(screen.getByTestId('search-preview-text').textContent).toBe(
      'Light, dark or as the system.',
    );
    cleanup();
    show({
      hit: previewHit(
        'command:export',
        'command',
        'Export jar',
        { type: 'command', command: 'export' },
        { sentence: 'Makes the mod file.' },
      ),
      host: host(),
    });
    await advance(150);
    expect(screen.getByTestId('search-preview-text').textContent).toBe('Makes the mod file.');
  });
});
