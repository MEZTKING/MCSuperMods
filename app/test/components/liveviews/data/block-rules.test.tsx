// @vitest-environment happy-dom

/**
 * B614's view: a block transformer's and a vanilla block rules file's rows, each the block
 * before and after with its tool and sound, what only the game does named, who uses it and what
 * Try it's picker offers; an edit shows at once. Only MSM's own made-up files; no Mojang file.
 */

import type { Element, Json, Project } from '@msm/plugin-api';
import { defaultTargetId, targetFacts } from '@msm/targets';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import BlockRules from '../../../../src/renderer/src/liveviews/data/block-rules/BlockRules';
import {
  itemsNaming,
  transformerModel,
  vanillaRulesModel,
} from '../../../../src/renderer/src/liveviews/data/block-rules/block-rules-model';
import type { LiveViewProps } from '../../../../src/renderer/src/liveviews/registry';
import { NOT_SET_UP_VANILLA_DATA } from '../../../../src/renderer/src/liveviews/vanilla-data';
import { DEFAULT_PREFS } from '../../../../src/renderer/src/liveviews/view-prefs';

afterEach(cleanup);

function element(kind: string, id: string, data: Json): Element {
  return { id, kind, data } as unknown as Element;
}

function projectOf(...elements: Element[]): Project {
  return {
    formatVersion: 1,
    name: 'Demo',
    namespaces: [{ name: 'demo', assets: [], elements }],
    targets: [],
    plugins: [],
    settings: {},
  } as unknown as Project;
}

const rule = (blocks: string, then: Json): Json => ({
  if_true: { type: 'minecraft:matching_blocks', blocks },
  then,
});

const BRUSH: Json = [
  {
    block_state_provider: {
      type: 'minecraft:rule_based',
      rules: [
        rule('minecraft:gravel', { id: 'minecraft:sand' }),
        rule('#demo:sandy', { id: 'minecraft:red_sand', properties: { snowy: 'false' } }),
      ],
    },
    sound: 'minecraft:item.brush.brushing.generic',
    particle: 'scrape',
    loot: 'demo:brushed',
  },
  {
    block_state_provider: {
      type: 'minecraft:rule_based',
      rules: [rule('minecraft:sandstone', { type: 'minecraft:noise_provider' })],
    },
  },
];

const RULES: Json = {
  format: 1,
  strip: [{ block: 'minecraft:basalt', into: 'minecraft:polished_basalt' }],
  till: [{ block: 'minecraft:dirt', into: 'minecraft:mud', drops: 'minecraft:clay_ball' }],
  wax: [{ block: 'minecraft:end_stone', into: 'minecraft:end_stone_bricks' }],
  burn: [{ block: 'minecraft:stone', burn_odds: 5, ignite_odds: 20 }],
};

function props(project: Project, shown: Element): LiveViewProps {
  return {
    project,
    element: shown,
    vanilla: NOT_SET_UP_VANILLA_DATA,
    vanillaAssets: null,
    preferences: DEFAULT_PREFS,
    onPreferences: vi.fn(),
    onSetup: vi.fn(),
  };
}

describe('the block rules model (B614)', () => {
  it('reads a transformer into rows, naming what only the game knows', () => {
    const transformer = element('minecraft:block_transformer', 'demo:brush', BRUSH);
    const model = transformerModel(transformer, projectOf(transformer));
    const rows = model.groups.flatMap((group) => group.rows);
    expect(rows.map((row) => [row.before, row.after ?? row.unknown, row.fidelity])).toEqual([
      [['minecraft:gravel'], 'minecraft:sand', 'about_right'],
      [['#demo:sandy'], 'minecraft:red_sand', 'about_right'],
      [
        ['minecraft:sandstone'],
        'the block state provider minecraft:noise_provider',
        'only_in_game',
      ],
    ]);
    expect(rows[1]?.properties).toEqual(['snowy=false']);
    expect(rows[0]?.lines).toContain('Drops the loot of demo:brushed.');
    expect(model.usedBy[0]).toContain('Nothing uses it yet');
    expect(model.tryItBlocks).toEqual(['minecraft:gravel', 'minecraft:sandstone']);
  });

  it('names the items that use a transformer, and a vanilla tool’s own id', () => {
    const brush = element('minecraft:block_transformer', 'demo:brush', BRUSH);
    const item = element('msm:item', 'demo:brush_tool', {
      format: 1,
      components: { 'msm:components': { 'minecraft:block_transformer': 'demo:brush' } },
    });
    const project = projectOf(brush, item);
    expect(itemsNaming(project, 'demo:brush')).toEqual(['demo:brush_tool']);
    expect(transformerModel(brush, project).tryItTools).toEqual(['demo:brush_tool']);
    const axe = element('minecraft:block_transformer', 'minecraft:axe', BRUSH);
    const model = transformerModel(axe, projectOf(axe));
    expect(model.usedBy[0]).toContain('Every axe');
    expect(model.tryItTools).toEqual(['minecraft:iron_axe']);
  });

  it('reads vanilla block rules with their tools, sounds and replaced pairs', () => {
    const pairs = targetFacts(defaultTargetId)?.blocks?.vanillaPairs;
    const model = vanillaRulesModel(element('msm:vanilla_block_rules', 'demo:rules', RULES), pairs);
    expect(model.groups.map((group) => group.key)).toEqual(['strip', 'till', 'wax', 'burn']);
    const till = model.groups.find((group) => group.key === 'till')?.rows[0];
    expect(till?.sound).toBe('minecraft:item.hoe.till');
    expect(till?.lines).toContain('Drops minecraft:clay_ball once.');
    // Dirt is one of Minecraft's own till pairs: the rule replaces it.
    expect(till?.lines.some((line) => line.includes('this rule replaces that'))).toBe(true);
    expect(model.groups.find((group) => group.key === 'burn')?.rows[0]?.fidelity).toBe(
      'only_in_game',
    );
    expect(model.tryItTools).toEqual([
      'minecraft:iron_axe',
      'minecraft:iron_hoe',
      'minecraft:honeycomb',
    ]);
  });
});

describe('the block rules view (B614)', () => {
  it('draws a transformer in the frame with the Preview tag, and follows an edit at once', () => {
    const transformer = element('minecraft:block_transformer', 'demo:brush', BRUSH);
    const project = projectOf(transformer);
    const { rerender } = render(<BlockRules {...props(project, transformer)} />);
    expect(screen.getByTestId('live-view-tag').textContent).toBe('Preview');
    expect(screen.getByTestId('live-view-fidelity').getAttribute('data-fidelity')).toBe(
      'only_in_game',
    );
    expect(screen.getByTestId('block-rules-row-0-0-before-0').getAttribute('data-item')).toBe(
      'minecraft:gravel',
    );
    expect(screen.getByTestId('block-rules-row-0-0-after').getAttribute('data-item')).toBe(
      'minecraft:sand',
    );
    expect(screen.getByTestId('block-rules-row-0-1-before-0').textContent).toBe('#demo:sandy');
    expect(screen.getByTestId('block-rules-row-1-0-unknown').textContent).toContain(
      'minecraft:noise_provider',
    );
    expect(screen.getByTestId('block-rules-row-0-0-sound').textContent).toContain(
      'minecraft:item.brush.brushing.generic',
    );
    expect(screen.getByTestId('live-view-notes').textContent).toContain('props');
    const edited = element('minecraft:block_transformer', 'demo:brush', [
      { block_state_provider: { id: 'minecraft:dirt' } },
    ]);
    rerender(<BlockRules {...props(projectOf(edited), edited)} />);
    expect(screen.getByTestId('block-rules-row-0-0-before-0').textContent).toBe('Any block');
    expect(screen.getByTestId('block-rules-row-0-0-after').getAttribute('data-item')).toBe(
      'minecraft:dirt',
    );
    expect(screen.getByTestId('live-view-fidelity').getAttribute('data-fidelity')).toBe(
      'about_right',
    );
  });

  it('draws vanilla block rules with what Try it offers to try them', () => {
    const rules = element('msm:vanilla_block_rules', 'demo:rules', RULES);
    render(<BlockRules {...props(projectOf(rules), rules)} />);
    expect(screen.getByRole('heading', { name: 'Vanilla block rules' })).toBeTruthy();
    expect(screen.getByTestId('block-rules-row-strip-0-tool').textContent).toContain('An axe');
    expect(screen.getByTestId('block-rules-row-burn-0').getAttribute('data-fidelity')).toBe(
      'only_in_game',
    );
    const tryIt = screen.getByTestId('block-rules-try-it').textContent ?? '';
    expect(tryIt).toContain('minecraft:basalt');
    expect(tryIt).toContain('minecraft:iron_axe');
  });

  it('says when there is nothing yet', () => {
    const rules = element('msm:vanilla_block_rules', 'demo:rules', { format: 1 });
    render(<BlockRules {...props(projectOf(rules), rules)} />);
    expect(screen.getByTestId('block-rules-empty')).toBeTruthy();
    expect(screen.getByTestId('block-rules-try-it').textContent).toContain('Nothing to try yet');
  });
});
