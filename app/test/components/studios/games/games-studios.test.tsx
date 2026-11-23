// @vitest-environment happy-dom
/// <reference types="node" />
/**
 * B555 (ADR 0117 D1, D3): the six games Studios through `ElementForm` over a command stack: each
 * edits its kind, shows its live view following an edit, and in Very easy shows only its section
 * list with no id or forbidden word anywhere (text, placeholder, title, aria-label, alt).
 */
import {
  CommandStack,
  commands,
  type Element,
  type Json,
  type Project,
  type ResourceLocation,
} from '@msm/core';
import type { ElementKind } from '@msm/plugin-api';
import gamesPlugin from '@msm/plugin-games';
import structuresPlugin from '@msm/plugin-structures';
import { builtInTargets } from '@msm/targets';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useEffect, useReducer } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { forbiddenIn } from '../../../../src/renderer/src/components/ai/ai-words';
import { ElementForm } from '../../../../src/renderer/src/studios/ElementForm';
import { studios } from '../../../../src/renderer/src/studios/games/studios';
import {
  AREA_COMMON_SECTIONS,
  OBJECTIVE_COMMON_SECTIONS,
  ONE_BLOCK_COMMON_SECTIONS,
  TEAM_COMMON_SECTIONS,
  TIMER_COMMON_SECTIONS,
  WORLD_SETUP_COMMON_SECTIONS,
} from '../../../../src/renderer/src/studios/plain';
import type { SchemaContextState } from '../../../../src/renderer/src/studios/use-schema-context';
import { element } from '../../fixtures';
import { schemaIndex } from '../../forms/schemas';
import { LAZY_CHUNK_TIMEOUT_MS, PRELOAD_TIMEOUT_MS, preloadChunks } from '../../lazy-chunks';
import { schemaState } from '../blocks-items/harness';

const shownMaps: Record<string, unknown>[] = [];
vi.mock('../../../../src/renderer/src/terrain/LiveMap', () => ({
  default: (props: Record<string, unknown>) => {
    shownMaps.push(props);
    return <div data-testid="world-setup-map-stub" />;
  },
}));

const bundle = builtInTargets[0] as (typeof builtInTargets)[number];
let schema: SchemaContextState;
beforeAll(async () => {
  schema = schemaState(bundle, await schemaIndex());
  await preloadChunks(
    () => import('../../../../src/renderer/src/studios/games/WorldSetupStudio'),
    () => import('../../../../src/renderer/src/studios/games/OneBlockStudio'),
    () => import('../../../../src/renderer/src/studios/games/TeamStudio'),
    () => import('../../../../src/renderer/src/studios/games/ObjectiveStudio'),
    () => import('../../../../src/renderer/src/studios/games/TimerStudio'),
    () => import('../../../../src/renderer/src/studios/games/AreaStudio'),
  );
}, PRELOAD_TIMEOUT_MS);
afterEach(() => {
  cleanup();
});

const KINDS: ElementKind[] = [
  ...(gamesPlugin.contributes.elementKinds ?? []),
  ...(structuresPlugin.contributes.elementKinds ?? []),
];
const kindOf = (id: string): ElementKind => {
  const kind = KINDS.find((entry) => entry.id === id);
  if (kind === undefined) throw new Error(`No kind ${id}.`);
  return kind;
};
const defaultOf = (id: string): Json => structuredClone(kindOf(id).defaultData as Json);
const projectOf = (...elements: Element[]): Project => ({
  formatVersion: 1,
  name: 'Demo',
  targets: [],
  plugins: [],
  settings: {},
  namespaces: [{ name: 'demo', elements, assets: [] }],
});

function Harness(props: { stack: CommandStack; id: ResourceLocation }) {
  const [, rerender] = useReducer((count: number) => count + 1, 0);
  useEffect(() => props.stack.subscribe(() => rerender()), [props.stack]);
  const subject = props.stack.state.namespaces[0]?.elements.find((entry) => entry.id === props.id);
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

function renderOn(subject: Element, others: Element[] = []) {
  const stack = new CommandStack(projectOf(subject, ...others));
  render(<Harness stack={stack} id={subject.id} />);
  const data = () =>
    stack.state.namespaces[0]?.elements.find((entry) => entry.id === subject.id)?.data as {
      [key: string]: Json;
    };
  return { stack, data };
}

const find = (testId: string) =>
  screen.findByTestId(testId, {}, { timeout: LAZY_CHUNK_TIMEOUT_MS });

/** Every string Very easy shows: text, placeholders, titles, labels and alt texts. */
function shownStrings(root: HTMLElement): string[] {
  const out = [root.textContent ?? ''];
  for (const node of root.querySelectorAll('*')) {
    for (const name of ['placeholder', 'title', 'aria-label', 'alt']) {
      const value = node.getAttribute(name);
      if (value !== null) out.push(value);
    }
  }
  return out;
}

const ISLAND = element('demo:island' as ResourceLocation, 'minecraft:structure_template', {
  size: [5, 4, 5],
  palette: ['minecraft:grass_block', 'minecraft:chest[facing=north]'],
  blocks: [
    [0, 0, 0, 0],
    [2, 1, 2, 1],
  ],
  block_entities: [
    { pos: [2, 1, 2], nbt: '{id:"minecraft:chest",LootTable:"minecraft:chests/simple_dungeon"}' },
  ],
});

const SAMPLES: readonly {
  kind: string;
  studio: string;
  sections: readonly string[];
  data?: Json;
}[] = [
  {
    kind: 'msm:world_setup',
    studio: 'world-setup',
    sections: WORLD_SETUP_COMMON_SECTIONS,
    data: {
      world: { type: 'void', nether: 'vanilla', end: 'void' },
      start: { structure: 'demo:island', spawn: [2, 1, 2] },
      game_mode: 'survival',
      difficulty: 'normal',
      game_rules: { keep_inventory: true },
      new_player: {
        items: [{ item: 'minecraft:lava_bucket', count: 1, slot: 'hotbar.0' }],
        effects: [{ effect: 'minecraft:speed', seconds: 30 }],
        message: 'Welcome!',
      },
    },
  },
  { kind: 'msm:one_block', studio: 'one-block', sections: ONE_BLOCK_COMMON_SECTIONS },
  { kind: 'msm:team', studio: 'team', sections: TEAM_COMMON_SECTIONS },
  { kind: 'msm:objective', studio: 'objective', sections: OBJECTIVE_COMMON_SECTIONS },
  { kind: 'msm:timer', studio: 'timer', sections: TIMER_COMMON_SECTIONS },
  {
    kind: 'msm:area',
    studio: 'area',
    sections: AREA_COMMON_SECTIONS,
    data: {
      name: 'Arena',
      dimension: 'minecraft:overworld',
      from: [0, 64, 0],
      to: [15, 79, 15],
      reset: { structures: [{ structure: 'demo:island', at: [0, 64, 0] }] },
    },
  },
];

describe('the games Studio entries', () => {
  it('has one lazy Studio with a Very easy list per games kind', () => {
    expect(studios.map((entry) => entry.kindId)).toEqual([
      'msm:world_setup',
      'msm:one_block',
      'msm:team',
      'msm:objective',
      'msm:timer',
      'msm:area',
    ]);
    for (const entry of studios) expect(entry.common?.length).toBeGreaterThan(0);
  });
});

describe.each(SAMPLES)('$studio Studio', (sample) => {
  const subject = () =>
    element(
      `demo:my_${sample.studio.replace('-', '_')}` as ResourceLocation,
      sample.kind,
      sample.data ?? defaultOf(sample.kind),
    );

  it('shows every section of its common list with no id or forbidden word', async () => {
    window.msmMoreOptionsOpen = false;
    renderOn(subject(), [ISLAND]);
    const studio = await find(`${sample.studio}-studio`);
    for (const section of sample.sections) expect(screen.getByTestId(section)).toBeTruthy();
    const found = shownStrings(studio).flatMap((text) => forbiddenIn(text));
    expect(found).toEqual([]);
    window.msmMoreOptionsOpen = true;
  });

  it('shows a live view and the whole form under Every setting', async () => {
    renderOn(subject(), [ISLAND]);
    await find(`${sample.studio}-studio`);
    expect(screen.getByTestId(sample.sections[0] as string)).toBeTruthy();
    fireEvent.click(screen.getByTestId('more-options-every-setting'));
    expect(screen.getByTestId('schema-form')).toBeTruthy();
  });
});

describe('Team Studio', () => {
  it('edits the colour and draws the name in it', async () => {
    const { data, stack } = renderOn(
      element('demo:red' as ResourceLocation, 'msm:team', defaultOf('msm:team')),
    );
    fireEvent.change(await find('team-colour'), { target: { value: 'red' } });
    expect(data().colour).toBe('red');
    const name = screen.getAllByTestId('team-live-name')[0] as HTMLElement;
    expect((name.children[1] as HTMLElement).style.color).toMatch(/ff5555|255, 85, 85/i);
    fireEvent.click(screen.getByTestId('team-friendly-fire'));
    expect(data().friendly_fire).toBe(false);
    act(() => stack.undo());
    expect(data().friendly_fire).toBe(true);
    expect(screen.getByTestId('team-commands').textContent).toContain('/team join demo.red @s');
  });
});

describe('Objective Studio', () => {
  it('writes a fixed text in place of the number on the sidebar', async () => {
    const { data } = renderOn(
      element('demo:points' as ResourceLocation, 'msm:objective', defaultOf('msm:objective')),
    );
    expect(await find('objective-live-sidebar')).toBeTruthy();
    fireEvent.change(screen.getByTestId('objective-number-format'), {
      target: { value: 'fixed' },
    });
    expect(data().number_format).toEqual({ type: 'fixed', text: '-' });
    const scores = screen.getAllByTestId('objective-live-score').map((node) => node.textContent);
    expect(scores).toEqual(['-', '-', '-']);
    fireEvent.change(screen.getByTestId('objective-display'), { target: { value: 'list' } });
    expect(data().display).toBe('list');
    expect(screen.getByTestId('objective-live-list')).toBeTruthy();
  });
});

describe('Timer Studio', () => {
  it('shows the boss bar at a second and edits the length', async () => {
    const { data } = renderOn(
      element('demo:clock' as ResourceLocation, 'msm:timer', defaultOf('msm:timer')),
    );
    const look = await find('timer-live-look');
    expect(look.getAttribute('data-shown')).toBe('300');
    fireEvent.change(screen.getByTestId('timer-live-slider'), { target: { value: '60' } });
    expect(screen.getByTestId('timer-live-look').getAttribute('data-shown')).toBe('240');
    fireEvent.change(screen.getByTestId('timer-minutes'), { target: { value: '1' } });
    expect(data().seconds).toBe(60);
    expect(screen.getByTestId('timer-live-look').getAttribute('data-shown')).toBe('0');
    expect(screen.getByTestId('timer-live-ended')).toBeTruthy();
  });
});

describe('Area Studio', () => {
  it('draws the box and its building, and follows a corner edit', async () => {
    const { data } = renderOn(
      element('demo:arena' as ResourceLocation, 'msm:area', SAMPLES[5]?.data as Json),
      [ISLAND],
    );
    expect((await find('area-live-size')).textContent).toContain('16 × 16 × 16');
    expect(screen.getByTestId('area-live-top-building-0').getAttribute('data-out')).toBe('false');
    fireEvent.change(screen.getByTestId('area-to-x'), { target: { value: '2' } });
    expect(data().to).toEqual([2, 79, 15]);
    expect(screen.getByTestId('area-live-size').textContent).toContain('3 × 16 × 16');
    expect(screen.getByTestId('area-live-top-building-0').getAttribute('data-out')).toBe('true');
    expect(screen.getByTestId('area-live-out')).toBeTruthy();
  });
});

describe('One Block Studio', () => {
  it('adds a phase and a block, and plays the breaks', async () => {
    const { data } = renderOn(
      element('demo:magic' as ResourceLocation, 'msm:one_block', defaultOf('msm:one_block')),
    );
    expect((await find('one-block-live-run')).children).toHaveLength(24);
    fireEvent.click(screen.getByTestId('one-block-phase-add'));
    expect((data().phases as Json[]).length).toBe(2);
    fireEvent.click(screen.getByTestId('one-block-phase-1-block-add'));
    expect(((data().phases as { blocks: Json[] }[])[1]?.blocks ?? []).length).toBe(2);
    fireEvent.change(screen.getByTestId('one-block-phase-0-chest-chance'), {
      target: { value: '12.5' },
    });
    expect((data().phases as { chest_chance: number }[])[0]?.chest_chance).toBe(0.125);
    expect(screen.getByTestId('one-block-live-phase-1')).toBeTruthy();
  });
});

describe('World Setup Studio', () => {
  it('draws the world it writes and edits the start', async () => {
    shownMaps.length = 0;
    const { data } = renderOn(
      element('demo:sky_world' as ResourceLocation, 'msm:world_setup', SAMPLES[0]?.data as Json),
      [ISLAND],
    );
    expect(await find('world-setup-map-stub')).toBeTruthy();
    const last = shownMaps[shownMaps.length - 1] as { element: Element; project: Project };
    expect(last.element.kind).toBe('minecraft:worldgen/world_preset');
    expect(last.element.id).toBe('demo:sky_world');
    expect(screen.getByTestId('world-setup-name').textContent).toContain('Sky World');
    fireEvent.click(screen.getByTestId('world-setup-start-cell-3-4'));
    expect((data().start as { spawn: Json }).spawn).toEqual([3, 1, 4]);
    fireEvent.click(screen.getByTestId('world-setup-start-world-generation'));
    expect((data().start as { when: Json }).when).toBe('world_generation');
    expect(screen.getByTestId('world-setup-start-warning').textContent).toContain('x 0, z 0');
    fireEvent.change(screen.getByTestId('world-setup-type'), { target: { value: 'vanilla' } });
    expect(await find('world-setup-map-none')).toBeTruthy();
  });
});
