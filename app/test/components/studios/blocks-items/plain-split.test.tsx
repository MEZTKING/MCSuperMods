// @vitest-environment happy-dom
/// <reference types="node" />
/**
 * The blocks and items area's last Studios split into common sections and More options (ADR
 * 0130 D3, plan B705): Particle, Creative tab, World addition, Extra drops and Vanilla block
 * rules, each over a real library example (`examples/`).
 *
 * - The default view (every More options closed) is in plain words (`expectPlain`).
 * - With every More options open, no field is lost: the test ids and the labels of the form
 *   controls are those the Studio showed before the split (`BEFORE`, recorded on the base
 *   commit), plus only the More options buttons, the sections' whys and the parts named in
 *   `ADDED`.
 * - Each Studio's `common` list is not empty and holds its live view.
 */
import {
  CommandStack,
  commands,
  type Element,
  type Json,
  type Project,
  type ResourceLocation,
} from '@msm/core';
import { builtInTargets } from '@msm/targets';
import { act, cleanup, render, waitFor } from '@testing-library/react';
import { useEffect, useReducer } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { ChangeItem } from '../../../../src/renderer/src/changeset/changeset';
import {
  type BlocksItemsStudioHost,
  BlocksItemsStudioHostContext,
} from '../../../../src/renderer/src/studios/blocks-items/host';
import { studios } from '../../../../src/renderer/src/studios/blocks-items/studios';
import { ElementForm } from '../../../../src/renderer/src/studios/ElementForm';
import type { SchemaContextState } from '../../../../src/renderer/src/studios/use-schema-context';
import { schemaIndex } from '../../forms/schemas';
import { PRELOAD_TIMEOUT_MS, preloadChunks } from '../../lazy-chunks';
import { exampleProject, expectPlain, leaksIn } from '../../plain-sweep';
import { kindOf, schemaState } from './harness';

vi.mock('../../../../src/renderer/src/components/texture-editor/png-canvas', () => ({
  encodePicture: (image: { width: number; height: number }) =>
    new Uint8Array([image.width, image.height]),
  decodePicture: async () => ({ width: 1, height: 1, data: new Uint8ClampedArray(4) }),
}));

/** One Studio over a real example; `patch` adds rows the example lacks (for the field check). */
interface Case {
  studio: string;
  entry: string;
  folder: string;
  id: string;
  live: string;
  /** A test id inside the live view, there once its lazy parts are in. */
  ready: string;
  patch?: Record<string, Json>;
}

const CASES: readonly Case[] = [
  {
    studio: 'Particle',
    entry: 'msm.blocks-items.particle',
    folder: 'starters/particle',
    id: 'msm_starter:golden_spark',
    live: 'particle-preview-section',
    ready: 'particle-preview-canvas',
  },
  {
    studio: 'Creative tab',
    entry: 'msm.blocks-items.creative-tab',
    folder: 'starters/creative-tab',
    id: 'msm_starter:my_blocks',
    live: 'creative-tab-preview',
    ready: 'creative-tab-page',
  },
  {
    studio: 'Creative tab (own order)',
    entry: 'msm.blocks-items.creative-tab',
    folder: 'starters/creative-tab',
    id: 'msm_starter:my_blocks',
    live: 'creative-tab-preview',
    ready: 'creative-tab-page',
    patch: { order: 'by_hand', items: ['msm_starter:my_blocks_block', 'minecraft:stone'] },
  },
  {
    studio: 'World addition',
    entry: 'msm.blocks-items.biome-addition',
    folder: 'starters/custom_ore',
    id: 'msm_starter:ruby_ore_generation',
    live: 'world-addition-map',
    ready: 'studio-map-line',
  },
  {
    studio: 'World addition (spawns)',
    entry: 'msm.blocks-items.biome-addition',
    folder: 'starters/custom_ore',
    id: 'msm_starter:ruby_ore_generation',
    live: 'world-addition-map',
    ready: 'studio-map-line',
    patch: {
      features: [
        { feature: 'msm_starter:ore_ruby_placed', step: 'underground_ores' },
        { feature: 'minecraft:ore_coal_upper', step: 'underground_ores' },
      ],
      spawns: [
        { entity: 'minecraft:zombie', category: 'monster', weight: 10, min_group: 1, max_group: 3 },
      ],
    },
  },
  {
    studio: 'Extra drops',
    entry: 'msm.blocks-items.loot-addition',
    folder: 'starters/extra-drop',
    id: 'msm_starter:zombie_drops_emerald',
    live: 'extra-drops-live',
    ready: 'live-view-roll',
  },
  {
    studio: 'Vanilla block rules',
    entry: 'msm.blocks-items.vanilla-block-rules',
    folder: 'all-kinds',
    id: 'msm_examples:mossy_stone_rules',
    live: 'vanilla-rules-try-it-here',
    ready: 'block-rules-try-it',
  },
];

const bundle = builtInTargets[0] as (typeof builtInTargets)[number];
let schema: SchemaContextState;
const projects = new Map<string, Project>();

beforeAll(async () => {
  schema = schemaState(bundle, await schemaIndex());
  for (const entry of CASES) {
    if (!projects.has(entry.folder)) projects.set(entry.folder, exampleProject(entry.folder));
  }
  await preloadChunks(
    () => import('../../../../src/renderer/src/studios/blocks-items/ParticleStudio'),
    () => import('../../../../src/renderer/src/studios/blocks-items/CreativeTabStudio'),
    () => import('../../../../src/renderer/src/liveviews/BundleLiveView'),
    () => import('../../../../src/renderer/src/liveviews/looks/tab/CreativeTabView'),
  );
}, PRELOAD_TIMEOUT_MS);
afterEach(() => {
  cleanup();
  globalThis.localStorage?.clear();
  window.msmMoreOptionsOpen = true;
});

/** A host with every button's service (pictures, painting, changes). */
function host(stack: () => CommandStack): BlocksItemsStudioHost {
  return {
    thumbnail: async () => new Uint8Array(),
    revision: 0,
    paintTexture: () => undefined,
    applyChanges: async (_items: readonly ChangeItem[], _label: string) => {
      stack();
    },
  };
}

function Harness(props: { stack: CommandStack; id: ResourceLocation }) {
  const [, rerender] = useReducer((count: number) => count + 1, 0);
  useEffect(() => props.stack.subscribe(() => rerender()), [props.stack]);
  const subject = props.stack.state.namespaces
    .flatMap((namespace) => namespace.elements)
    .find((entry) => entry.id === props.id);
  if (subject === undefined) return null;
  return (
    <ElementForm
      project={props.stack.state}
      element={subject}
      kind={kindOf(subject.kind)}
      problems={[]}
      schema={schema}
      onChange={(pointer, value, options) =>
        props.stack.execute(commands.setElementValue(props.id, pointer, value, options ?? {}))
      }
      focusPointer={null}
      onFocused={vi.fn()}
    />
  );
}

/** Renders the case's Studio and waits until its lazy parts are in. */
async function show(entry: Case): Promise<HTMLElement> {
  const base = projects.get(entry.folder) as Project;
  const project: Project = {
    ...base,
    namespaces: base.namespaces.map((namespace) => ({
      ...namespace,
      elements: namespace.elements.map((element): Element => {
        if (element.id !== entry.id || entry.patch === undefined) return element;
        return { ...element, data: { ...(element.data as Record<string, Json>), ...entry.patch } };
      }),
    })),
  };
  const subject = project.namespaces
    .flatMap((namespace) => namespace.elements)
    .find((element) => element.id === entry.id);
  expect(subject, `${entry.id} in examples/${entry.folder}`).toBeDefined();
  const stack = new CommandStack(project);
  const studioHost = host(() => stack);
  const { container } = render(
    <BlocksItemsStudioHostContext.Provider value={studioHost}>
      <Harness stack={stack} id={entry.id as ResourceLocation} />
    </BlocksItemsStudioHostContext.Provider>,
  );
  await waitFor(
    () => {
      expect(container.textContent).not.toMatch(/Loading the|Loading…/);
      expect(container.textContent?.length ?? 0).toBeGreaterThan(0);
      expect(container.querySelector(`[data-testid="${entry.ready}"]`)).not.toBeNull();
    },
    { timeout: 10_000 },
  );
  // Settle: parts sent to a More options arrive a render after their section (a portal).
  let before = '';
  for (let round = 0; round < 20; round += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 30));
    });
    const now = container.innerHTML;
    if (now === before) break;
    before = now;
  }
  return container;
}

/** The label of a form control: its aria-label, its `<label for>` or the label around it. */
function controlLabel(control: globalThis.Element): string | null {
  const own = control.getAttribute('aria-label');
  if (own !== null) return own;
  const id = control.getAttribute('id');
  if (id !== null) {
    const label = control.ownerDocument.querySelector(`label[for="${CSS.escape(id)}"]`);
    if (label !== null) return label.textContent?.trim() ?? '';
  }
  const around = control.closest('label');
  return around === null ? null : (around.textContent?.trim() ?? '');
}

/** Every test id and every form control's label, sorted. */
function fieldsOf(root: HTMLElement): string[] {
  const out = new Set<string>();
  for (const node of root.querySelectorAll('[data-testid]')) {
    out.add(`id:${node.getAttribute('data-testid')}`);
  }
  for (const node of root.querySelectorAll('input, select, textarea')) {
    const label = controlLabel(node);
    if (label !== null) out.add(`label:${label}`);
  }
  return [...out].sort();
}

/** What a split may add: More options buttons and contents, and the sections' whys. */
const STRUCTURE = /^id:(more-options-.*|.*-why)$/;

/** The parts each Studio gained on purpose (beyond {@link STRUCTURE}). */
const ADDED: Readonly<Record<string, readonly string[]>> = {
  // On the map: the live map of the addition (ADR 0119 D7), through the worldgen map line.
  'World addition': [
    'id:studio-map-line',
    'id:studio-see-map',
    'id:studio-walk-in-it',
    'id:world-addition-map',
  ],
  'World addition (spawns)': [
    'id:studio-map-line',
    'id:studio-see-map',
    'id:studio-walk-in-it',
    'id:world-addition-map',
  ],
};

/**
 * What the default view still shows that the plain view forbids, outside this brief's files:
 * the Vanilla block rules live view (`liveviews/data/block-rules/BlockRules.tsx`, B614) names
 * sounds, a drop and Try it's blocks and tools by id. Empty this when that view says names.
 */
const KNOWN_LEAKS: Readonly<Record<string, readonly string[]>> = {
  'Vanilla block rules': [
    '[block-rules-row-strip-0-sound] minecraft:, minecraft:item.axe.strip in "minecraft:item.axe.strip"',
    '[block-rules-row-strip-1-sound] minecraft:, minecraft:item.axe.strip in "minecraft:item.axe.strip"',
    '[block-rules-row-flatten-0-sound] minecraft:, minecraft:item.shovel.flatten in "minecraft:item.shovel.flatten"',
    '[block-rules-row-till-0-sound] minecraft:, minecraft:item.hoe.till in "minecraft:item.hoe.till"',
    '[block-rules-row-till-0] minecraft:, minecraft:moss_carpet in "Drops minecraft:moss_carpet once."',
    '[block-rules-try-it] minecraft:, minecraft:moss_block in "minecraft:moss_block, minecraft:mossy_cobblestone, minecraft:mossy_stone_bricks, minecraft:mud"',
    '[block-rules-try-it] minecraft:, minecraft:iron_axe in "minecraft:iron_axe, minecraft:iron_shovel, minecraft:iron_hoe"',
  ],
};

/** The fields each case showed before the split, every More options open (the base commit). */
const BEFORE: Readonly<Record<string, readonly string[]>> = {
  Particle: [
    'id:every-setting',
    'id:more-options-every-setting',
    'id:more-options-every-setting-content',
    'id:more-options-particle-command',
    'id:more-options-particle-command-content',
    'id:more-options-particle-pictures',
    'id:more-options-particle-pictures-content',
    'id:particle-add-frame',
    'id:particle-always-show',
    'id:particle-animation',
    'id:particle-collision',
    'id:particle-colour',
    'id:particle-colour-why',
    'id:particle-command',
    'id:particle-drag',
    'id:particle-draw-frames',
    'id:particle-emissive',
    'id:particle-fade',
    'id:particle-frame-0',
    'id:particle-frame-0-down',
    'id:particle-frame-0-paint',
    'id:particle-frame-0-remove',
    'id:particle-frame-0-sprite',
    'id:particle-frame-0-sprite-plain',
    'id:particle-frame-0-up',
    'id:particle-frame-1',
    'id:particle-frame-1-down',
    'id:particle-frame-1-paint',
    'id:particle-frame-1-remove',
    'id:particle-frame-1-sprite',
    'id:particle-frame-1-sprite-plain',
    'id:particle-frame-1-up',
    'id:particle-frame-2',
    'id:particle-frame-2-down',
    'id:particle-frame-2-paint',
    'id:particle-frame-2-remove',
    'id:particle-frame-2-sprite',
    'id:particle-frame-2-sprite-plain',
    'id:particle-frame-2-up',
    'id:particle-frame-3',
    'id:particle-frame-3-down',
    'id:particle-frame-3-paint',
    'id:particle-frame-3-remove',
    'id:particle-frame-3-sprite',
    'id:particle-frame-3-sprite-plain',
    'id:particle-frame-3-up',
    'id:particle-frame-ticks',
    'id:particle-frames',
    'id:particle-gravity',
    'id:particle-gravity-falls',
    'id:particle-gravity-none',
    'id:particle-gravity-up',
    'id:particle-life',
    'id:particle-life-why',
    'id:particle-lifetime',
    'id:particle-lifetime-between',
    'id:particle-movement',
    'id:particle-movement-why',
    'id:particle-new-picture',
    'id:particle-opacity',
    'id:particle-pictures',
    'id:particle-pictures-why',
    'id:particle-preview',
    'id:particle-preview-background',
    'id:particle-preview-burst',
    'id:particle-preview-canvas',
    'id:particle-preview-pause',
    'id:particle-preview-placeholder',
    'id:particle-preview-section',
    'id:particle-preview-section-why',
    'id:particle-preview-stream',
    'id:particle-size',
    'id:particle-size-end',
    'id:particle-spin',
    'id:particle-split',
    'id:particle-split-count',
    'id:particle-split-file',
    'id:particle-split-layout',
    'id:particle-studio',
    'id:particle-tint',
    'id:particle-tint-end',
    'id:particle-translucent',
    'label:Animation',
    'label:Between',
    'label:Drag (speed kept per tick, 0 to 1)',
    'label:Fade',
    'label:Frame 1',
    'label:Frame 2',
    'label:Frame 3',
    'label:Frame 4',
    'label:Frames (empty: square frames)',
    'label:Glows in the dark',
    'label:Gravity',
    'label:Lifetime (ticks)',
    'label:Opacity (0 to 1)',
    'label:Picture to split into frames',
    'label:See-through',
    'label:Show from far away',
    'label:Size',
    'label:Size at the end',
    'label:Spin (degrees per tick)',
    'label:Split a strip into frames',
    'label:Stops on blocks',
    'label:Ticks per frame',
    'label:Tint',
    'label:Tint at the end',
  ],
  'Creative tab': [
    'id:creative-tab-add',
    'id:creative-tab-add-loose',
    'id:creative-tab-add-pick',
    'id:creative-tab-general',
    'id:creative-tab-general-why',
    'id:creative-tab-icon',
    'id:creative-tab-icon-plain',
    'id:creative-tab-member-msm_starter:my_blocks_block',
    'id:creative-tab-members',
    'id:creative-tab-members-why',
    'id:creative-tab-order',
    'id:creative-tab-page',
    'id:creative-tab-page-icon',
    'id:creative-tab-page-slot-0',
    'id:creative-tab-page-tab',
    'id:creative-tab-page-title',
    'id:creative-tab-preview',
    'id:creative-tab-preview-count',
    'id:creative-tab-preview-icon',
    'id:creative-tab-preview-title',
    'id:creative-tab-preview-why',
    'id:creative-tab-remove-msm_starter:my_blocks_block',
    'id:creative-tab-studio',
    'id:creative-tab-title',
    'id:every-setting',
    'id:live-view',
    'id:live-view-fidelity',
    'id:live-view-notes',
    'id:live-view-tag',
    'id:more-options-creative-tab-general',
    'id:more-options-creative-tab-general-content',
    'id:more-options-every-setting',
    'id:more-options-every-setting-content',
    'label:Add',
    'label:Icon (an item)',
    'label:Order of the things in it',
    'label:Title',
  ],
  'Creative tab (own order)': [
    'id:creative-tab-add',
    'id:creative-tab-add-loose',
    'id:creative-tab-add-pick',
    'id:creative-tab-general',
    'id:creative-tab-general-why',
    'id:creative-tab-hand-0',
    'id:creative-tab-hand-0-down',
    'id:creative-tab-hand-0-remove',
    'id:creative-tab-hand-0-up',
    'id:creative-tab-hand-1',
    'id:creative-tab-hand-1-down',
    'id:creative-tab-hand-1-remove',
    'id:creative-tab-hand-1-up',
    'id:creative-tab-hand-add',
    'id:creative-tab-hand-add-plain',
    'id:creative-tab-hand-order',
    'id:creative-tab-hand-order-why',
    'id:creative-tab-icon',
    'id:creative-tab-icon-plain',
    'id:creative-tab-member-msm_starter:my_blocks_block',
    'id:creative-tab-members',
    'id:creative-tab-members-why',
    'id:creative-tab-order',
    'id:creative-tab-page',
    'id:creative-tab-page-icon',
    'id:creative-tab-page-slot-0',
    'id:creative-tab-page-slot-1',
    'id:creative-tab-page-tab',
    'id:creative-tab-page-title',
    'id:creative-tab-preview',
    'id:creative-tab-preview-count',
    'id:creative-tab-preview-icon',
    'id:creative-tab-preview-title',
    'id:creative-tab-preview-why',
    'id:creative-tab-remove-msm_starter:my_blocks_block',
    'id:creative-tab-studio',
    'id:creative-tab-title',
    'id:every-setting',
    'id:live-view',
    'id:live-view-fidelity',
    'id:live-view-notes',
    'id:live-view-tag',
    'id:more-options-creative-tab-general',
    'id:more-options-creative-tab-general-content',
    'id:more-options-creative-tab-hand-order',
    'id:more-options-creative-tab-hand-order-content',
    'id:more-options-every-setting',
    'id:more-options-every-setting-content',
    'label:Add',
    'label:Add an item to the order',
    'label:Icon (an item)',
    'label:Order of the things in it',
    'label:Title',
  ],
  'World addition': [
    'id:every-setting',
    'id:more-options-every-setting',
    'id:more-options-every-setting-content',
    'id:more-options-world-addition-biomes',
    'id:more-options-world-addition-biomes-content',
    'id:more-options-world-addition-features',
    'id:more-options-world-addition-features-content',
    'id:world-addition-add-feature',
    'id:world-addition-add-spawn',
    'id:world-addition-biomes',
    'id:world-addition-biomes-why',
    'id:world-addition-feature-0',
    'id:world-addition-feature-0-id',
    'id:world-addition-feature-0-id-plain',
    'id:world-addition-feature-0-step',
    'id:world-addition-features',
    'id:world-addition-features-why',
    'id:world-addition-spawns',
    'id:world-addition-spawns-why',
    'id:world-addition-studio',
    'label:Biomes 1',
    'label:Feature 1 placed feature',
    'label:Feature 1 step',
    'label:New entry in Biomes',
  ],
  'World addition (spawns)': [
    'id:every-setting',
    'id:more-options-every-setting',
    'id:more-options-every-setting-content',
    'id:more-options-world-addition-biomes',
    'id:more-options-world-addition-biomes-content',
    'id:more-options-world-addition-features',
    'id:more-options-world-addition-features-content',
    'id:more-options-world-addition-spawns',
    'id:more-options-world-addition-spawns-content',
    'id:world-addition-add-feature',
    'id:world-addition-add-spawn',
    'id:world-addition-biomes',
    'id:world-addition-biomes-why',
    'id:world-addition-feature-0',
    'id:world-addition-feature-0-id',
    'id:world-addition-feature-0-id-plain',
    'id:world-addition-feature-0-step',
    'id:world-addition-feature-1',
    'id:world-addition-feature-1-copy',
    'id:world-addition-feature-1-id',
    'id:world-addition-feature-1-id-plain',
    'id:world-addition-feature-1-step',
    'id:world-addition-features',
    'id:world-addition-features-why',
    'id:world-addition-spawn-0',
    'id:world-addition-spawn-0-category',
    'id:world-addition-spawn-0-entity',
    'id:world-addition-spawn-0-entity-plain',
    'id:world-addition-spawn-0-max-group',
    'id:world-addition-spawn-0-min-group',
    'id:world-addition-spawn-0-weight',
    'id:world-addition-spawns',
    'id:world-addition-spawns-why',
    'id:world-addition-studio',
    'label:Biomes 1',
    'label:Feature 1 placed feature',
    'label:Feature 1 step',
    'label:Feature 2 placed feature',
    'label:Feature 2 step',
    'label:New entry in Biomes',
    'label:Spawn 1 category',
    'label:Spawn 1 entity',
    'label:Spawn 1 max group',
    'label:Spawn 1 min group',
    'label:Spawn 1 weight',
  ],
  'Extra drops': [
    'id:every-setting',
    'id:extra-drops-0',
    'id:extra-drops-0-chance',
    'id:extra-drops-0-item',
    'id:extra-drops-0-item-plain',
    'id:extra-drops-0-max',
    'id:extra-drops-0-min',
    'id:extra-drops-0-player-kill',
    'id:extra-drops-add',
    'id:extra-drops-live',
    'id:extra-drops-pools',
    'id:extra-drops-pools-why',
    'id:extra-drops-studio',
    'id:extra-drops-table-group',
    'id:extra-drops-table-groups',
    'id:extra-drops-tables',
    'id:extra-drops-tables-why',
    'id:live-view',
    'id:live-view-fidelity',
    'id:live-view-roll',
    'id:live-view-seed',
    'id:live-view-set-up',
    'id:live-view-tag',
    'id:more-options-every-setting',
    'id:more-options-every-setting-content',
    'id:more-options-extra-drops-pools',
    'id:more-options-extra-drops-pools-content',
    'id:more-options-extra-drops-tables',
    'id:more-options-extra-drops-tables-content',
    'id:situation-advanced',
    'id:situation-picker',
    'id:situation-preset-block_exploded',
    'id:situation-preset-chest',
    'id:situation-preset-kill_looting',
    'id:situation-preset-kill_mob',
    'id:situation-preset-kill_player',
    'id:situation-preset-mine_fortune',
    'id:situation-preset-mine_hand',
    'id:situation-preset-mine_pickaxe',
    'id:situation-preset-mine_silk',
    'id:situation-preset-mob_died',
    'label:Drop 1 chance (%)',
    'label:Drop 1 item',
    'label:Drop 1 largest count',
    'label:Drop 1 smallest count',
    'label:Loot tables 1',
    'label:New entry in Loot tables',
    'label:Only when a player kills it',
    'label:Seed',
    'label:Suggest tables of',
  ],
  'Vanilla block rules': [
    'id:block-rules-group-burn',
    'id:block-rules-group-flatten',
    'id:block-rules-group-strip',
    'id:block-rules-group-till',
    'id:block-rules-row-burn-0',
    'id:block-rules-row-burn-0-after',
    'id:block-rules-row-burn-0-before-0',
    'id:block-rules-row-burn-0-tool',
    'id:block-rules-row-burn-0-unknown',
    'id:block-rules-row-burn-1',
    'id:block-rules-row-burn-1-after',
    'id:block-rules-row-burn-1-before-0',
    'id:block-rules-row-burn-1-tool',
    'id:block-rules-row-burn-1-unknown',
    'id:block-rules-row-flatten-0',
    'id:block-rules-row-flatten-0-after',
    'id:block-rules-row-flatten-0-before-0',
    'id:block-rules-row-flatten-0-sound',
    'id:block-rules-row-flatten-0-tool',
    'id:block-rules-row-strip-0',
    'id:block-rules-row-strip-0-after',
    'id:block-rules-row-strip-0-before-0',
    'id:block-rules-row-strip-0-sound',
    'id:block-rules-row-strip-0-tool',
    'id:block-rules-row-strip-1',
    'id:block-rules-row-strip-1-after',
    'id:block-rules-row-strip-1-before-0',
    'id:block-rules-row-strip-1-sound',
    'id:block-rules-row-strip-1-tool',
    'id:block-rules-row-till-0',
    'id:block-rules-row-till-0-after',
    'id:block-rules-row-till-0-before-0',
    'id:block-rules-row-till-0-sound',
    'id:block-rules-row-till-0-tool',
    'id:block-rules-try-it',
    'id:block-rules-used-by',
    'id:every-setting',
    'id:live-view',
    'id:live-view-fidelity',
    'id:live-view-notes',
    'id:live-view-tag',
    'id:more-options-every-setting',
    'id:more-options-every-setting-content',
    'id:more-options-vanilla-rules-burn',
    'id:more-options-vanilla-rules-burn-content',
    'id:more-options-vanilla-rules-flatten',
    'id:more-options-vanilla-rules-flatten-content',
    'id:more-options-vanilla-rules-strip',
    'id:more-options-vanilla-rules-strip-content',
    'id:more-options-vanilla-rules-till',
    'id:more-options-vanilla-rules-till-content',
    'id:vanilla-block-rules-studio',
    'id:vanilla-rules-age',
    'id:vanilla-rules-age-add',
    'id:vanilla-rules-age-why',
    'id:vanilla-rules-burn',
    'id:vanilla-rules-burn-0',
    'id:vanilla-rules-burn-0-block',
    'id:vanilla-rules-burn-0-block-plain',
    'id:vanilla-rules-burn-0-burn-odds',
    'id:vanilla-rules-burn-0-ignite-odds',
    'id:vanilla-rules-burn-1',
    'id:vanilla-rules-burn-1-block',
    'id:vanilla-rules-burn-1-block-plain',
    'id:vanilla-rules-burn-1-burn-odds',
    'id:vanilla-rules-burn-1-ignite-odds',
    'id:vanilla-rules-burn-add',
    'id:vanilla-rules-burn-why',
    'id:vanilla-rules-flatten',
    'id:vanilla-rules-flatten-0',
    'id:vanilla-rules-flatten-0-block',
    'id:vanilla-rules-flatten-0-block-plain',
    'id:vanilla-rules-flatten-0-into',
    'id:vanilla-rules-flatten-0-into-plain',
    'id:vanilla-rules-flatten-add',
    'id:vanilla-rules-flatten-why',
    'id:vanilla-rules-strip',
    'id:vanilla-rules-strip-0',
    'id:vanilla-rules-strip-0-block',
    'id:vanilla-rules-strip-0-block-plain',
    'id:vanilla-rules-strip-0-into',
    'id:vanilla-rules-strip-0-into-plain',
    'id:vanilla-rules-strip-1',
    'id:vanilla-rules-strip-1-block',
    'id:vanilla-rules-strip-1-block-plain',
    'id:vanilla-rules-strip-1-into',
    'id:vanilla-rules-strip-1-into-plain',
    'id:vanilla-rules-strip-add',
    'id:vanilla-rules-strip-why',
    'id:vanilla-rules-till',
    'id:vanilla-rules-till-0',
    'id:vanilla-rules-till-0-block',
    'id:vanilla-rules-till-0-block-plain',
    'id:vanilla-rules-till-0-drops',
    'id:vanilla-rules-till-0-drops-plain',
    'id:vanilla-rules-till-0-into',
    'id:vanilla-rules-till-0-into-plain',
    'id:vanilla-rules-till-add',
    'id:vanilla-rules-till-why',
    'id:vanilla-rules-try-it-here',
    'id:vanilla-rules-try-it-here-why',
    'id:vanilla-rules-wax',
    'id:vanilla-rules-wax-add',
    'id:vanilla-rules-wax-why',
    'label:Becomes',
    'label:Block',
    'label:Burns away (0 to 300)',
    'label:Catches fire (0 to 300)',
    'label:Drops once',
  ],
};

describe('B705: the default view is plain', () => {
  it.each(CASES)('$studio', async (entry) => {
    window.msmMoreOptionsOpen = false;
    const container = await show(entry);
    const known = KNOWN_LEAKS[entry.studio];
    if (known === undefined) {
      expectPlain(container);
      return;
    }
    // Every leak is inside the live view, and they are the known ones.
    const live = container.querySelector(`[data-testid="${entry.live}"]`) as HTMLElement;
    const outside = leaksIn(container).filter((leak) => !leaksIn(live).includes(leak));
    expect(outside).toEqual([]);
    expect(leaksIn(container)).toEqual(known);
  });
});

describe('B705: no field lost with every More options open', () => {
  it.each(CASES)('$studio', async (entry) => {
    window.msmMoreOptionsOpen = true;
    const container = await show(entry);
    const now = fieldsOf(container);
    if (process.env.B705_DUMP_FILE !== undefined) {
      const { appendFileSync } = await import('node:fs');
      appendFileSync(
        process.env.B705_DUMP_FILE ?? '',
        `${JSON.stringify({ [entry.studio]: now })}\n`,
      );
      return;
    }
    const before = BEFORE[entry.studio] ?? [];
    expect(before.length).toBeGreaterThan(0);
    expect(before.filter((field) => !now.includes(field))).toEqual([]);
    const extra = now.filter((field) => !before.includes(field) && !STRUCTURE.test(field));
    expect(extra).toEqual([...(ADDED[entry.studio] ?? [])].sort());
  });
});

describe('B705: each Studio has its common sections with its live view', () => {
  it.each(CASES)('$studio', (entry) => {
    const studio = studios.find((candidate) => candidate.id === entry.entry);
    expect(studio?.common?.length ?? 0).toBeGreaterThan(0);
    expect(studio?.common).toContain(entry.live);
  });
});
