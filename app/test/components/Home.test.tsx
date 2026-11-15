// @vitest-environment happy-dom
/**
 * Very easy mode (ADR 0083): Home's tiles and My things, Things to fix, the Very easy toolbar
 * and its mode row, the name-only New, the Studio section lists and the three stored modes.
 */
import type { Element, Problem, Project } from '@msm/core';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Tooltip } from 'radix-ui';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Home, type HomeProps } from '../../src/renderer/src/components/home/Home';
import { MakeChooser } from '../../src/renderer/src/components/home/MakeChooser';
import { copyData, copyId, thingCards } from '../../src/renderer/src/components/home/things';
import { MAKE_TILES, shownTiles, TILE_GROUPS } from '../../src/renderer/src/components/home/tiles';
import {
  modFolder,
  modNameError,
  NewModDialog,
} from '../../src/renderer/src/components/NewProjectDialog';
import { ThingsToFix } from '../../src/renderer/src/components/ThingsToFix';
import { Toolbar, type ToolbarProps } from '../../src/renderer/src/components/Toolbar';
import { WelcomeDialog } from '../../src/renderer/src/components/WelcomeDialog';
import { isUiMode, UI_MODES, usePreferences } from '../../src/renderer/src/store/preferences';
import { sectionShown } from '../../src/renderer/src/studios/very-easy';

afterEach(() => {
  cleanup();
  usePreferences.setState({ mode: 'advanced' });
});

function element(
  id: string,
  kind: string,
  data: Element['data'] = {},
  creator?: { flowId: string; setId: string; values: Record<string, string> },
): Element {
  const meta: Element['meta'] = { createdAt: '2026-01-01T00:00:00.000Z' };
  if (creator !== undefined) meta.creator = { ...creator, generatedId: id };
  return { id: id as Element['id'], kind, formatVersion: 1, data, meta };
}

function project(elements: Element[]): Project {
  return {
    name: 'Ruby',
    namespaces: [{ name: 'ruby', elements, assets: [] }],
  } as unknown as Project;
}

const gear = { flowId: 'gear-set', setId: 'set-1', values: { material_name: 'Ruby' } };
const SAMPLE = project([
  element('ruby:ruby_sword', 'msm:item', { display_name: 'Ruby Sword' }, gear),
  element('ruby:ruby_ore', 'msm:block', { display_name: 'Ruby Ore' }, gear),
  element('ruby:item/ruby_sword', 'minecraft:model', {}, gear),
  element('ruby:lamp', 'msm:block', { display_name: 'Lamp' }),
  element('ruby:gate', 'msm:block', { display_name: 'Gate', type: 'portal' }),
  element('ruby:spark', 'msm:entity', {}),
  element('ruby:rules', 'msm:rules', { format: 1, rules: [] }),
  element('ruby:mod', 'msm:mod', {}),
  element('ruby:en_us', 'minecraft:lang', {}),
  element('ruby:block/lamp', 'minecraft:model', {}),
]);

function homeProps(overrides: Partial<HomeProps> = {}): HomeProps {
  return {
    project: SAMPLE,
    tiles: shownTiles({ flowAvailable: () => true, rules: true, ai: true }),
    onTile: vi.fn(),
    cards: thingCards(SAMPLE, { 'gear-set': 'Gear set' }),
    texturesFolder: 'textures',
    onOpenThing: vi.fn(),
    onEditInCreator: vi.fn(),
    onRenameThing: vi.fn(),
    onDuplicateThing: vi.fn(),
    onDeleteThing: vi.fn(),
    onNewProject: vi.fn(),
    onOpenProject: vi.fn(),
    ...overrides,
  };
}

describe('Home tiles', () => {
  it('lists the tiles in order under their headings (ADR 0083 D2, ADR 0086 D8, ADR 0091 D4)', () => {
    expect(MAKE_TILES.map((tile) => `${tile.group}: ${tile.label}`)).toEqual([
      'start: Surprise me',
      'blocks: Make a block',
      'blocks: Make a chest or machine',
      'blocks: Make an item',
      'blocks: Make a tool or weapon',
      'blocks: Make armour',
      'blocks: Make food',
      'blocks: Make a plant or tree',
      'blocks: Make a recipe',
      'creatures: Make a mob',
      'creatures: Make a pet or animal',
      'vehicles: Make a vehicle',
      'magic: Make a potion or effect',
      'magic: Make sparkles',
      'magic: Make a magic wand',
      'worlds: Make a portal',
      'worlds: Make a world or biome',
      'worlds: Make a building',
      'worlds: Change drops and trades',
      'looks: Change how Minecraft looks',
      'looks: Make a painting',
      'looks: Make a sound or music',
      'looks: Paint a picture',
      'more: Make things happen',
      'more: Build with the AI helper',
    ]);
    // Tiles keep to the headings' order.
    const order = TILE_GROUPS.map((group) => group.id as string);
    const groups = MAKE_TILES.map((tile) => order.indexOf(tile.group));
    expect(groups).toEqual([...groups].sort((a, b) => a - b));
    expect(new Set(MAKE_TILES.map((tile) => tile.id)).size).toBe(MAKE_TILES.length);
  });

  it('reaches every Creator flow of the library from some tile', async () => {
    const { default: library } = await import('@msm/plugin-library');
    const reached = new Set(
      MAKE_TILES.flatMap((tile) => (tile.action.type === 'flows' ? tile.action.flowIds : [])),
    );
    const flows = (library.contributes.projectStarters ?? []).filter(
      (starter) => starter.creator !== undefined,
    );
    for (const flow of flows) expect(reached.has(flow.id), flow.id).toBe(true);
  });

  it('names only library starters that are not flows as starters', async () => {
    const { default: library } = await import('@msm/plugin-library');
    const starters = library.contributes.projectStarters ?? [];
    for (const tile of MAKE_TILES) {
      if (tile.action.type !== 'flows') continue;
      for (const id of tile.action.starterIds ?? []) {
        const starter = starters.find((entry) => entry.id === id);
        expect(starter, id).toBeDefined();
        expect(starter?.creator, id).toBeUndefined();
        expect(starter?.category, id).not.toBe('blank');
      }
    }
  });

  it('shows a starter tile only when its starter is available', () => {
    const without = shownTiles({ flowAvailable: () => true, rules: true, ai: true });
    expect(without.map((entry) => entry.tile.id)).not.toContain('building');
    expect(without.find((entry) => entry.tile.id === 'world')?.starterIds).toEqual([]);
    const shown = shownTiles({
      flowAvailable: () => true,
      starterAvailable: (id) => id !== 'recipe_pack',
      rules: true,
      ai: true,
      surprise: false,
    });
    const ids = shown.map((entry) => entry.tile.id);
    expect(ids).toContain('building');
    expect(ids).not.toContain('recipe');
    expect(ids).not.toContain('surprise');
    expect(shown.find((entry) => entry.tile.id === 'world')).toMatchObject({
      flowIds: ['dimension'],
      starterIds: ['custom_biome'],
    });
  });

  it('hides tiles whose flows are all unavailable, and Rules and the AI helper when off', () => {
    const shown = shownTiles({
      flowAvailable: (id) => id !== 'portal' && id !== 'dimension' && id !== 'weapon',
      rules: false,
      ai: false,
    });
    const ids = shown.map((entry) => entry.tile.id);
    expect(ids).not.toContain('portal');
    expect(ids).not.toContain('rules');
    expect(ids).not.toContain('ai');
    expect(ids).toContain('paint');
    expect(shown.find((entry) => entry.tile.id === 'tool')?.flowIds).toEqual([
      'gear-set',
      'enchantment',
    ]);
    expect(ids).toContain('surprise');
  });

  it('every flow id a tile names is a Creator flow of the library', async () => {
    const { default: library } = await import('@msm/plugin-library');
    const flows = new Set(
      (library.contributes.projectStarters ?? [])
        .filter((starter) => starter.creator !== undefined)
        .map((starter) => starter.id),
    );
    for (const tile of MAKE_TILES) {
      if (tile.action.type !== 'flows') continue;
      for (const id of tile.action.flowIds) expect(flows.has(id), id).toBe(true);
    }
  });

  it('shows the tiles under their headings with Surprise me first', () => {
    render(<Home {...homeProps()} />);
    const groups = screen.getAllByTestId(/^home-group-/).map((node) => node.dataset.testid);
    expect(groups).toEqual([
      'home-group-start',
      'home-group-blocks',
      'home-group-creatures',
      'home-group-vehicles',
      'home-group-magic',
      'home-group-worlds',
      'home-group-looks',
      'home-group-more',
    ]);
    expect(screen.getAllByTestId(/^home-tile-/)[0]?.dataset.testid).toBe('home-tile-surprise');
  });

  it('offers Surprise me without a mod open', async () => {
    const onSurprise = vi.fn();
    render(<Home {...homeProps({ project: null, onSurprise })} />);
    await userEvent.setup().click(screen.getByTestId('home-surprise'));
    expect(onSurprise).toHaveBeenCalledOnce();
  });

  it('the chooser of a tile with starters picks a flow or a starter', async () => {
    const onPick = vi.fn();
    const onClose = vi.fn();
    render(
      <MakeChooser
        title="Make a world or biome"
        choices={[
          { type: 'flow', id: 'dimension', title: 'Dimension', sentence: 'A world.' },
          { type: 'starter', id: 'custom_biome', title: 'Custom biome', sentence: 'A biome.' },
        ]}
        onPick={onPick}
        onClose={onClose}
      />,
    );
    const user = userEvent.setup();
    expect(screen.getByTestId('make-chooser').textContent).toContain('Adds it to your mod');
    await user.click(screen.getByTestId('make-choice-custom_biome'));
    expect(onPick).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'starter', id: 'custom_biome' }),
    );
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('runs the tile the user clicks', async () => {
    const p = homeProps();
    render(<Home {...p} />);
    await userEvent.setup().click(screen.getByTestId('home-tile-block'));
    expect(p.onTile).toHaveBeenCalledWith(
      expect.objectContaining({ tile: expect.objectContaining({ id: 'block' }) }),
    );
  });
});

describe('My things', () => {
  it('has one card per set and per loose thing, and no technical elements', () => {
    const cards = thingCards(SAMPLE, { 'gear-set': 'Gear set' });
    expect(cards.map((card) => [card.key, card.name, card.what])).toEqual([
      ['ruby:gate', 'Gate', 'Portal'],
      ['ruby:lamp', 'Lamp', 'Block'],
      ['set:set-1', 'Ruby', 'Gear set'],
      ['ruby:rules', 'Rules', 'Rules'],
      ['ruby:spark', 'Spark', 'Mob'],
    ]);
    const set = cards.find((card) => card.key === 'set:set-1');
    expect(set?.main.id).toBe('ruby:ruby_ore');
    expect(set?.elements).toHaveLength(3);
    expect(thingCards(null)).toEqual([]);
  });

  it('opens a card and offers Edit in Creator, Rename, Duplicate and Delete', async () => {
    const p = homeProps();
    render(<Home {...p} />);
    const user = userEvent.setup();
    await user.click(screen.getByTestId('my-thing-open-ruby:lamp'));
    expect(p.onOpenThing).toHaveBeenCalledWith(expect.objectContaining({ key: 'ruby:lamp' }));

    await user.click(screen.getByTestId('my-thing-menu-set:set-1'));
    await user.click(await screen.findByTestId('my-thing-edit-in-creator'));
    expect(p.onEditInCreator).toHaveBeenCalledWith(expect.objectContaining({ key: 'set:set-1' }));

    await user.click(screen.getByTestId('my-thing-menu-ruby:lamp'));
    expect(screen.queryByTestId('my-thing-edit-in-creator')).toBeNull();
    await user.click(await screen.findByTestId('my-thing-duplicate'));
    expect(p.onDuplicateThing).toHaveBeenCalledWith(expect.objectContaining({ key: 'ruby:lamp' }));
    await user.click(screen.getByTestId('my-thing-menu-ruby:lamp'));
    await user.click(await screen.findByTestId('my-thing-rename'));
    expect(p.onRenameThing).toHaveBeenCalled();
    await user.click(screen.getByTestId('my-thing-menu-ruby:lamp'));
    await user.click(await screen.findByTestId('my-thing-delete'));
    expect(p.onDeleteThing).toHaveBeenCalledWith(expect.objectContaining({ key: 'ruby:lamp' }));
  });

  it('says so when there is nothing yet', () => {
    render(<Home {...homeProps({ project: project([]), cards: [] })} />);
    expect(screen.getByTestId('my-things-empty').textContent).toContain('Nothing here yet');
  });

  it('makes free copy ids and marks the copy’s name', () => {
    expect(copyId(SAMPLE, 'ruby:lamp')).toBe('ruby:lamp_copy');
    const withCopy = project([
      element('ruby:lamp', 'msm:block'),
      element('ruby:lamp_copy', 'msm:block'),
    ]);
    expect(copyId(withCopy, 'ruby:lamp')).toBe('ruby:lamp_copy_2');
    expect(copyData({ display_name: 'Lamp', light: 15 })).toEqual({
      display_name: 'Lamp (copy)',
      light: 15,
    });
  });

  it('without a project offers a new mod, opening one and the recent mods', async () => {
    const p = homeProps({
      project: null,
      recentProjects: [
        { root: '/m/ruby', name: 'Ruby', openedAt: '2026-01-01T00:00:00.000Z', exists: true },
        { root: '/m/gone', name: 'Gone', openedAt: '2026-01-01T00:00:00.000Z', exists: false },
      ],
      onOpenRecent: vi.fn(),
    });
    render(<Home {...p} />);
    const user = userEvent.setup();
    expect(screen.queryByTestId('home-tile-block')).toBeNull();
    await user.click(screen.getByTestId('home-new'));
    expect(p.onNewProject).toHaveBeenCalled();
    await user.click(screen.getByTestId('home-open'));
    expect(p.onOpenProject).toHaveBeenCalled();
    expect(screen.queryByTestId('home-recent-1')).toBeNull();
    await user.click(screen.getByTestId('home-recent-0'));
    expect(p.onOpenRecent).toHaveBeenCalledWith('/m/ruby');
  });
});

describe('Things to fix', () => {
  const problems: Problem[] = [
    {
      severity: 'error',
      code: 'blocks-items.missing-model',
      message: 'Model ruby:block/lamp is missing.',
      elementId: 'ruby:lamp',
      path: '/model',
    },
    {
      severity: 'error',
      code: 'rules.unknown-step',
      message: 'Unknown step.',
      elementId: 'ruby:rules',
      path: '/rules/0/do/1',
    },
    {
      severity: 'error',
      code: 'scripting.who-knows',
      message: 'The original words.',
      elementId: 'ruby:spark',
    },
    {
      severity: 'warning',
      code: 'blocks-items.fast-tick-trigger',
      message: 'Fast.',
      elementId: 'ruby:lamp',
    },
  ];

  it('shows errors in plain words with Show me, Fix it and details, and folds tips', async () => {
    const onShow = vi.fn();
    const onFix = vi.fn();
    render(
      <ThingsToFix
        project={SAMPLE}
        problems={[...problems, problems[0] as Problem]}
        onShow={onShow}
        onFix={onFix}
      />,
    );
    const user = userEvent.setup();
    expect(screen.getByTestId('things-to-fix').textContent).toContain('Things to fix (3)');
    expect(screen.getByTestId('things-to-fix-0-text').textContent).toBe(
      'Lamp has no shape picture (model) to show. Pick a picture for it.',
    );
    expect(screen.getByTestId('things-to-fix').textContent).not.toContain('ruby:');
    await user.click(screen.getByTestId('things-to-fix-0-show'));
    expect(onShow).toHaveBeenCalledWith(problems[0]);
    expect(screen.queryByTestId('things-to-fix-0-fix')).toBeNull();
    await user.click(screen.getByTestId('things-to-fix-1-fix'));
    expect(onFix).toHaveBeenCalledWith(problems[1], 'remove-step');
    expect(screen.getByTestId('things-to-fix-2-text').textContent).toBe(
      'Something in Spark needs fixing.',
    );
    expect(screen.queryByTestId('things-to-fix-2-message')).toBeNull();
    await user.click(screen.getByTestId('things-to-fix-2-details'));
    expect(screen.getByTestId('things-to-fix-2-message').textContent).toBe('The original words.');
    const tips = screen.getByTestId('things-to-fix-tips');
    expect(tips.textContent).toContain('Tips (1)');
    expect((tips as HTMLDetailsElement).open).toBe(false);
  });

  it('says when nothing needs fixing', () => {
    render(<ThingsToFix project={SAMPLE} problems={[]} onShow={vi.fn()} />);
    expect(screen.getByTestId('things-to-fix-none').textContent).toBe(
      'Everything is ready to play.',
    );
  });
});

function toolbarProps(overrides: Partial<ToolbarProps> = {}): ToolbarProps {
  return {
    hasProject: true,
    canUndo: true,
    canRedo: false,
    undoLabel: 'Add element',
    redoLabel: undefined,
    saveDisabledReason: null,
    canAddElement: true,
    onNew: vi.fn(),
    onOpen: vi.fn(),
    onSave: vi.fn(),
    onUndo: vi.fn(),
    onRedo: vi.fn(),
    onAddNamespace: vi.fn(),
    onAddElement: vi.fn(),
    onToggleMode: vi.fn(),
    onSetMode: vi.fn(),
    onHome: vi.fn(),
    onShare: vi.fn(),
    shareDisabledReason: null,
    onFirstMod: vi.fn(),
    onAiHelper: vi.fn(),
    ...overrides,
  };
}

function renderToolbar(p: ToolbarProps) {
  return render(
    <Tooltip.Provider>
      <Toolbar {...p} />
    </Tooltip.Provider>,
  );
}

describe('Very easy toolbar and the mode row', () => {
  it('shows Home, Undo, Redo, Share my mod, the AI helper, Help and the mode row only', async () => {
    const p = toolbarProps({ mode: 'very-easy' });
    renderToolbar(p);
    const user = userEvent.setup();
    expect(screen.getByTestId('toolbar-very-easy')).toBeTruthy();
    for (const hidden of [
      'toolbar-save',
      'toolbar-add-element',
      'toolbar-export-menu',
      'toolbar-install-menu',
      'toolbar-new-project',
      'toolbar-mode',
    ]) {
      expect(screen.queryByTestId(hidden), hidden).toBeNull();
    }
    await user.click(screen.getByTestId('toolbar-home'));
    expect(p.onHome).toHaveBeenCalled();
    await user.click(screen.getByTestId('toolbar-share'));
    expect(p.onShare).toHaveBeenCalled();
    await user.click(screen.getByTestId('toolbar-undo'));
    expect(p.onUndo).toHaveBeenCalled();
    await user.click(screen.getByTestId('toolbar-help'));
    await user.click(await screen.findByTestId('toolbar-help-first-mod'));
    expect(p.onFirstMod).toHaveBeenCalled();
    expect(screen.getByTestId('toolbar-mode-very-easy').getAttribute('data-state')).toBe('on');
    await user.click(screen.getByTestId('toolbar-mode-advanced'));
    expect(p.onSetMode).toHaveBeenCalledWith('advanced');
  });

  it('disables Share my mod while errors block it', () => {
    renderToolbar(toolbarProps({ mode: 'very-easy', shareDisabledReason: 'Fix 2 errors first.' }));
    expect((screen.getByTestId('toolbar-share') as HTMLButtonElement).disabled).toBe(true);
  });

  it('keeps the Easy and Advanced toolbar and adds the row beside the switch', async () => {
    const p = toolbarProps({ mode: 'easy' });
    renderToolbar(p);
    const user = userEvent.setup();
    expect(screen.getByTestId('toolbar-save')).toBeTruthy();
    expect(screen.queryByTestId('toolbar-home')).toBeNull();
    expect(screen.getByTestId('toolbar-mode-easy').getAttribute('data-state')).toBe('on');
    await user.click(screen.getByTestId('toolbar-mode'));
    expect(p.onToggleMode).toHaveBeenCalled();
    await user.click(screen.getByTestId('toolbar-mode-very-easy'));
    expect(p.onSetMode).toHaveBeenCalledWith('very-easy');
  });
});

describe('the three modes', () => {
  it('names three modes in the row order and accepts only them', () => {
    expect(UI_MODES.map((entry) => entry.label)).toEqual(['Very easy', 'Easy', 'Advanced']);
    expect(isUiMode('very-easy')).toBe(true);
    expect(isUiMode('expert')).toBe(false);
  });

  it('stores Very easy like the others', () => {
    usePreferences.getState().setMode('very-easy');
    expect(usePreferences.getState().mode).toBe('very-easy');
    expect(usePreferences.getState().modeChosen).toBe(true);
    expect(globalThis.localStorage.getItem('msm.preferences.v1')).toContain('"very-easy"');
  });

  it('offers the three modes in the Welcome, with the Very easy steps', async () => {
    const onMode = vi.fn();
    render(
      <WelcomeDialog
        hasProject={false}
        onSettings={vi.fn()}
        onNewProject={vi.fn()}
        onClose={vi.fn()}
        mode="very-easy"
        onMode={onMode}
      />,
    );
    expect(screen.getByTestId('welcome-mode-very-easy').getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByTestId('welcome-steps').textContent).toContain('Start a new mod');
    await userEvent.setup().click(screen.getByTestId('welcome-mode-easy'));
    expect(onMode).toHaveBeenCalledWith('easy');
  });

  it('keeps the Rules section and drops the events on every subject Studio list', async () => {
    const lists = await import('../../src/renderer/src/studios/very-easy');
    for (const list of [
      lists.BLOCK_VERY_EASY_SECTIONS,
      lists.ITEM_VERY_EASY_SECTIONS,
      lists.EFFECT_VERY_EASY_SECTIONS,
      lists.MOB_VERY_EASY_SECTIONS,
    ]) {
      expect(list).toContain('rules-section');
      expect(list).not.toContain('msm-events');
      expect(list).not.toContain('msm-triggers');
    }
  });

  it('hides sections not on a Very easy list, and none without one', () => {
    const list = new Set(['block-type']);
    expect(sectionShown(list, 'block-type')).toBe(true);
    expect(sectionShown(list, 'msm-events')).toBe(false);
    expect(sectionShown(null, 'msm-events')).toBe(true);
    expect(sectionShown(list, undefined)).toBe(true);
  });
});

describe('New mod (a name only)', () => {
  it('checks the name and builds the folder', () => {
    expect(modNameError('  ')).toBe('Type a name for your mod.');
    expect(modNameError('a/b')).toContain('Leave out');
    expect(modNameError('Ruby mod')).toBeNull();
    expect(modFolder('/home/a/Documents/MCSuperMods', ' Ruby mod ')).toBe(
      '/home/a/Documents/MCSuperMods/Ruby mod',
    );
    expect(modFolder('C:\\Users\\a\\Documents\\MCSuperMods\\', 'Ruby')).toBe(
      'C:\\Users\\a\\Documents\\MCSuperMods\\Ruby',
    );
  });

  it('asks only for a name, can change the folder and creates there', async () => {
    const onCreate = vi.fn(async () => null);
    const onChangeFolder = vi.fn(async () => '/elsewhere');
    render(
      <NewModDialog
        parent="/docs/MCSuperMods"
        onChangeFolder={onChangeFolder}
        onCancel={vi.fn()}
        onCreate={onCreate}
      />,
    );
    const user = userEvent.setup();
    await user.click(screen.getByTestId('new-mod-dialog-submit'));
    expect(screen.getByTestId('new-mod-error').textContent).toBe('Type a name for your mod.');
    await user.type(screen.getByTestId('new-mod-name'), 'Ruby mod');
    expect(screen.getByTestId('new-mod-folder').textContent).toContain(
      '/docs/MCSuperMods/Ruby mod',
    );
    await user.click(screen.getByTestId('new-mod-change-folder'));
    await waitFor(() =>
      expect(screen.getByTestId('new-mod-folder').textContent).toContain('/elsewhere/Ruby mod'),
    );
    await user.click(screen.getByTestId('new-mod-dialog-submit'));
    expect(onCreate).toHaveBeenCalledWith('/elsewhere/Ruby mod', 'Ruby mod');
  });
});

describe('Studio sections in Very easy', () => {
  it('shows only the listed sections inside a Very easy list and every section outside it', async () => {
    const { Section } = await import('../../src/renderer/src/studios/worldgen/parts');
    const { VeryEasySectionsContext } = await import('../../src/renderer/src/studios/very-easy');
    const { RulesSlot } = await import('../../src/renderer/src/studios/RulesSlot');
    const studio = (
      <>
        <Section title="Type" testId="block-type">
          <p>type</p>
        </Section>
        <Section title="Events" testId="msm-events">
          <p>events</p>
        </Section>
        <RulesSlot>
          <p>rules</p>
        </RulesSlot>
      </>
    );
    render(
      <VeryEasySectionsContext.Provider value={new Set(['block-type'])}>
        {studio}
      </VeryEasySectionsContext.Provider>,
    );
    expect(screen.getByTestId('block-type')).toBeTruthy();
    expect(screen.queryByTestId('msm-events')).toBeNull();
    expect(screen.getByTestId('rules-slot').getAttribute('data-first')).toBe('true');
    cleanup();
    render(studio);
    expect(screen.getByTestId('msm-events')).toBeTruthy();
    expect(screen.getByTestId('rules-slot').getAttribute('data-first')).toBeNull();
  });
});
