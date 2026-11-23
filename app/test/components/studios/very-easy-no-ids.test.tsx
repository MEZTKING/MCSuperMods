// @vitest-environment happy-dom
/// <reference types="node" />
/**
 * Very easy shows no ids (ADR 0083 D3, ADR 0125 D13): every Studio Very easy can open (the
 * things of My things, the Creator's things, Show me's things), rendered through `ElementForm`
 * in Very easy over a real library example or Creator flow, with every readable string (text,
 * an input's value, placeholder, title, aria-label, alt) run through `forbiddenIn`. The Notes
 * callout of a copied example says its note in plain words there too.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import {
  CommandStack,
  commands,
  type Element,
  type Project,
  type ResourceLocation,
} from '@msm/core';
import type { ElementKind } from '@msm/plugin-api';
import blocksItemsPlugin from '@msm/plugin-blocks-items';
import controlsPlugin from '@msm/plugin-controls';
import entitiesPlugin from '@msm/plugin-entities';
import rulesPlugin from '@msm/plugin-rules';
import scriptingPlugin from '@msm/plugin-scripting';
import { builtInTargets } from '@msm/targets';
import { cleanup, render, waitFor } from '@testing-library/react';
import { useEffect, useReducer } from 'react';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { forbiddenIn } from '../../../src/renderer/src/components/ai/ai-words';
import { EditorArea } from '../../../src/renderer/src/components/EditorArea';
import { usePreferences } from '../../../src/renderer/src/store/preferences';
import { ElementForm } from '../../../src/renderer/src/studios/ElementForm';
import type { SchemaContextState } from '../../../src/renderer/src/studios/use-schema-context';
import { schemaIndex } from '../forms/schemas';
import { PRELOAD_TIMEOUT_MS, preloadChunks } from '../lazy-chunks';
import { schemaState } from './blocks-items/harness';

vi.mock('../../../src/renderer/src/components/texture-editor/png-canvas', () => ({
  encodePicture: (image: { width: number; height: number }) =>
    new Uint8Array([image.width, image.height]),
  decodePicture: async () => ({ width: 1, height: 1, data: new Uint8ClampedArray(4) }),
}));

const ROOT = join(__dirname, '..', '..', '..', '..');
const EXAMPLES = join(ROOT, 'examples');

const KINDS: ElementKind[] = [
  blocksItemsPlugin,
  entitiesPlugin,
  scriptingPlugin,
  rulesPlugin,
  controlsPlugin,
].flatMap((plugin) => [...(plugin.contributes.elementKinds ?? [])]);

function kindOf(id: string): ElementKind | undefined {
  return KINDS.find((entry) => entry.id === id);
}

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

/** A library example or flow on disk (`examples/<folder>`) as a project. */
function exampleProject(folder: string): Project {
  const base = join(EXAMPLES, folder);
  const byNamespace = new Map<string, Project['namespaces'][number]>();
  const namespace = (name: string) => {
    let entry = byNamespace.get(name);
    if (entry === undefined) {
      entry = { name, elements: [], assets: [] };
      byNamespace.set(name, entry);
    }
    return entry;
  };
  for (const path of walk(join(base, 'content'))) {
    if (!path.endsWith('.json')) continue;
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as Element;
    const name = relative(join(base, 'content'), path).split(sep)[0] as string;
    namespace(name).elements.push(parsed);
  }
  try {
    for (const path of walk(join(base, 'assets'))) {
      const [name, ...rest] = relative(join(base, 'assets'), path).split(sep);
      namespace(name as string).assets.push({
        path: rest.join('/'),
        mediaType: path.endsWith('.png') ? 'image/png' : 'application/octet-stream',
      });
    }
  } catch {
    // An example without assets.
  }
  return {
    formatVersion: 1,
    name: folder,
    targets: [],
    plugins: [],
    settings: {},
    namespaces: [...byNamespace.values()],
  };
}

/** One Studio of Very easy over a real element. */
interface Case {
  studio: string;
  folder: string;
  id: string;
}

const CASES: readonly Case[] = [
  { studio: 'Block (simple)', folder: 'starters/simple-block', id: 'msm_starter:ruby_tiles' },
  { studio: 'Block (ore)', folder: 'starters/custom_ore', id: 'msm_starter:ruby_ore' },
  { studio: 'Block (crop)', folder: 'starters/crop', id: 'msm_starter:tomato_crop' },
  { studio: 'Block (bed)', folder: 'starters/bed', id: 'msm_starter:cosy_bed' },
  { studio: 'Block (lights)', folder: 'starters/lights', id: 'msm_starter:glow_lantern' },
  { studio: 'Block (crate)', folder: 'starters/storage-crate', id: 'msm_starter:supply_crate' },
  { studio: 'Block (portal)', folder: 'starters/portal', id: 'msm_starter:sky_portal' },
  { studio: 'Block (cake)', folder: 'starters/cake', id: 'msm_starter:berry_cake' },
  { studio: 'Item (sword)', folder: 'starters/gear-set', id: 'msm_starter:ruby_sword' },
  { studio: 'Item (helmet)', folder: 'starters/gear-set', id: 'msm_starter:ruby_helmet' },
  { studio: 'Item (food)', folder: 'starters/food', id: 'msm_starter:ruby_apple' },
  { studio: 'Item (drink)', folder: 'starters/consumable', id: 'msm_starter:ruby_tonic' },
  { studio: 'Item (totem)', folder: 'starters/totem', id: 'msm_starter:ruby_totem' },
  { studio: 'Item (throwable)', folder: 'starters/throwable', id: 'msm_starter:ruby_knife' },
  { studio: 'Item (bag)', folder: 'starters/backpack', id: 'msm_starter:backpack' },
  { studio: 'Item (wand)', folder: 'starters/scripted-item', id: 'msm_starter:ruby_wand' },
  { studio: 'Mob', folder: 'starters/custom_mob', id: 'msm_starter:ruby_golem' },
  { studio: 'Mob (pet)', folder: 'starters/pet', id: 'msm_starter:ember_fox' },
  {
    studio: 'Mob (trader)',
    folder: 'starters/wandering-merchant',
    id: 'msm_starter:travelling_merchant',
  },
  { studio: 'Effect', folder: 'starters/status-effect', id: 'msm_starter:ruby_rush' },
  { studio: 'Potion', folder: 'starters/potion', id: 'msm_starter:moon_leap' },
  { studio: 'Particle', folder: 'starters/particle', id: 'msm_starter:golden_spark' },
  { studio: 'Fluid', folder: 'starters/fluid', id: 'msm_starter:mint_water' },
  { studio: 'Vehicle', folder: 'starters/vehicle-car', id: 'msm_starter:racing_car' },
  { studio: 'Village job', folder: 'starters/village-job', id: 'msm_starter:tinker' },
  { studio: 'Villager look', folder: 'all-kinds', id: 'msm_examples:blossom' },
  { studio: 'Key bind', folder: 'all-kinds', id: 'msm_examples:dash' },
  { studio: 'On screen', folder: 'all-kinds', id: 'msm_examples:mana' },
  { studio: 'Command', folder: 'starters/custom-command', id: 'msm_starter:heal' },
  { studio: 'Creative tab', folder: 'starters/creative-tab', id: 'msm_starter:my_blocks' },
  { studio: 'Game rule', folder: 'all-kinds', id: 'msm_examples:sparkle_trails' },
  { studio: 'Statistic', folder: 'all-kinds', id: 'msm_examples:bells_rung' },
  { studio: 'Rule book', folder: 'rules', id: 'msm_examples:lucky_block_rules' },
];

/** One readable string and where it is (the nearest test id, for the failure message). */
interface Readable {
  text: string;
  at: string;
}

const placeOf = (node: globalThis.Element | null): string =>
  node?.closest('[data-testid]')?.getAttribute('data-testid') ?? '?';

/** Every readable string under `root`: text nodes, input values and the readable attributes. */
function readableStrings(root: HTMLElement): Readable[] {
  const out: Readable[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
    if (node.parentElement?.closest('style, script') != null) continue;
    // A text node inside an <option> of a closed select still reads when it opens.
    const text = node.textContent?.trim() ?? '';
    if (text !== '') out.push({ text, at: placeOf(node.parentElement) });
  }
  for (const element of root.querySelectorAll('*')) {
    for (const attribute of ['placeholder', 'title', 'aria-label', 'alt']) {
      const value = element.getAttribute(attribute);
      if (value !== null && value.trim() !== '') out.push({ text: value, at: placeOf(element) });
    }
    const typed =
      (element instanceof HTMLInputElement && ['text', 'search'].includes(element.type)) ||
      element instanceof HTMLTextAreaElement;
    if (typed && element.value.trim() !== '') {
      out.push({ text: element.value, at: placeOf(element) });
    }
  }
  return out;
}

/** A clock time or a ratio (`1:30`, `8:00`): not an id, though `ID_PATTERN` matches it. */
const DIGITS_ONLY = /^\d+:\d+$/;

/** The leaks of `root`: each string with what it holds that Very easy forbids. */
function leaksIn(root: HTMLElement): string[] {
  return readableStrings(root)
    .map((entry) => ({
      ...entry,
      found: forbiddenIn(entry.text).filter((hit) => !DIGITS_ONLY.test(hit)),
    }))
    .filter((entry) => entry.found.length > 0)
    .map((entry) => `[${entry.at}] ${entry.found.join(', ')} in "${entry.text.slice(0, 160)}"`);
}

const bundle = builtInTargets[0] as (typeof builtInTargets)[number];
let schema: SchemaContextState;
const before = usePreferences.getState().mode;
const projects = new Map<string, Project>();

beforeAll(async () => {
  schema = schemaState(bundle, await schemaIndex());
  for (const entry of CASES) {
    if (!projects.has(entry.folder)) projects.set(entry.folder, exampleProject(entry.folder));
  }
  await preloadChunks(
    () => import('../../../src/renderer/src/studios/rules/RulesSection'),
    () => import('../../../src/renderer/src/studios/entities/TraderSection'),
    () => import('../../../src/renderer/src/studios/entities/vehicle/VehicleStudio'),
    () => import('../../../src/renderer/src/studios/entities/ProfessionStudio'),
    () => import('../../../src/renderer/src/studios/entities/VillagerTypeStudio'),
    () => import('../../../src/renderer/src/studios/blocks-items/InventorySection'),
    () => import('../../../src/renderer/src/studios/blocks-items/PortalSection'),
    () => import('../../../src/renderer/src/studios/blocks-items/AmbientParticlesSection'),
    () => import('../../../src/renderer/src/studios/blocks-items/SoundsSection'),
    () => import('../../../src/renderer/src/studios/blocks-items/ParticleStudio'),
    () => import('../../../src/renderer/src/studios/blocks-items/CreativeTabStudio'),
    () => import('../../../src/renderer/src/studios/blocks-items/FluidStudio'),
    () => import('../../../src/renderer/src/studios/controls/KeyBindStudio'),
    () => import('../../../src/renderer/src/studios/controls/HudStudio'),
    () => import('../../../src/renderer/src/studios/scripting/CommandStudio'),
    () => import('../../../src/renderer/src/studios/scripting/GameRuleStudio'),
    () => import('../../../src/renderer/src/studios/scripting/StatStudio'),
    () => import('../../../src/renderer/src/studios/rules/RuleBookStudio'),
  );
  usePreferences.setState({ mode: 'very-easy' as never });
}, PRELOAD_TIMEOUT_MS);
afterAll(() => {
  cleanup();
  usePreferences.setState({ mode: before });
});

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

describe('Very easy Studios show no ids', () => {
  it.each(CASES)('$studio', async (entry) => {
    const project = projects.get(entry.folder) as Project;
    const subject = project.namespaces
      .flatMap((namespace) => namespace.elements)
      .find((element) => element.id === entry.id);
    expect(subject, `${entry.id} in examples/${entry.folder}`).toBeDefined();
    const stack = new CommandStack(project);
    const { container, unmount } = render(
      <Harness stack={stack} id={entry.id as ResourceLocation} />,
    );
    try {
      await waitFor(
        () => {
          expect(container.textContent).not.toMatch(/Loading the|Loading…/);
          expect(container.textContent?.length ?? 0).toBeGreaterThan(0);
        },
        { timeout: 4000 },
      );
      expect(container.querySelector('[data-testid="schema-form"] form')).toBeNull();
      expect(leaksIn(container)).toEqual([]);
    } finally {
      unmount();
    }
  });

  const NOTED: readonly { folder: string; id: string }[] = [
    { folder: 'starters/potion', id: 'msm_starter:moon_leap' },
    { folder: 'starters/scripted-item', id: 'msm_starter:ruby_wand' },
    { folder: 'starters/wandering-merchant', id: 'msm_starter:travelling_merchant' },
    { folder: 'starters/vehicle-plane', id: 'msm_starter:biplane' },
    { folder: 'starters/gear-set', id: 'msm_starter:ruby_sword' },
  ];

  it.each(NOTED)('says the Notes of $id in plain words', ({ folder, id }) => {
    const project = projects.get(folder) ?? exampleProject(folder);
    const subject = project.namespaces
      .flatMap((namespace) => namespace.elements)
      .find((element) => element.id === id) as Element;
    expect(subject.meta.notes).toBeTruthy();
    const { container, unmount } = render(
      <EditorArea element={subject} onApply={vi.fn()} form={<p>Form</p>} hideRawJson hideIds />,
    );
    try {
      expect(leaksIn(container)).toEqual([]);
    } finally {
      unmount();
    }
  });

  it('says an id-laden note in words and keeps it whole in Easy', () => {
    const sword: Element = {
      formatVersion: 1,
      id: 'ruby:ruby_sword' as ResourceLocation,
      kind: 'msm:item',
      data: {},
      meta: {
        createdAt: '2026-11-23T00:00:00.000Z',
        notes:
          'A ruby sword. msm:tool makes it a sword of the iron tier, and it sits in minecraft:combat. Its model is ruby:item/ruby_sword.',
      },
    };
    const veryEasy = render(
      <EditorArea element={sword} onApply={vi.fn()} form={<p>Form</p>} hideRawJson hideIds />,
    );
    expect(veryEasy.getByTestId('element-notes-text').textContent).toBe(
      'A ruby sword. Tool makes it a sword of the iron tier, and it sits in combat. Its model is ruby sword.',
    );
    expect(leaksIn(veryEasy.container)).toEqual([]);
    veryEasy.unmount();
    const easy = render(<EditorArea element={sword} onApply={vi.fn()} form={<p>Form</p>} />);
    expect(easy.getByTestId('element-notes-text').textContent).toBe(sword.meta.notes);
    easy.unmount();
  });

  it('keeps the id fields of Easy', async () => {
    usePreferences.setState({ mode: 'easy' as never });
    try {
      const project = projects.get('starters/gear-set') as Project;
      const { findByTestId, unmount } = render(
        <Harness
          stack={new CommandStack(project)}
          id={'msm_starter:ruby_sword' as ResourceLocation}
        />,
      );
      const tab = (await findByTestId('item-tab', {}, { timeout: 4000 })) as HTMLInputElement;
      expect(tab.value).toBe('minecraft:combat');
      unmount();
    } finally {
      usePreferences.setState({ mode: 'very-easy' as never });
    }
  });
});
