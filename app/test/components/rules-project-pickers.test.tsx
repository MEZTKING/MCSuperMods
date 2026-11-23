// @vitest-environment happy-dom
/// <reference types="node" />
/**
 * B424a: the rule card pickers for the slot types B424 added. Key binds and vehicles as the
 * thing of a trigger (the ThingPicker with the project's own only, "pick one of your keys"),
 * the HUD element of the HUD steps with "Make a new on-screen number" made inline as one undo
 * step with the rule, a vehicle reading's weapon from the rule's vehicle (the first weapon by
 * default), and "The vehicle fires" offered only on a vehicle with weapons.
 */
import {
  CommandStack,
  commands,
  type Element,
  type Json,
  type Project,
  type ResourceLocation,
} from '@msm/core';
import rulesPlugin, { RULES_KIND, triggerById } from '@msm/plugin-rules';
import { createRegistryIndex } from '@msm/schemas';
import { builtInTargets } from '@msm/targets';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useEffect, useReducer } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { type ChangeItem, planChangeItems } from '../../src/renderer/src/changeset/changeset';
import { thingSections } from '../../src/renderer/src/components/thing-picker/thing-sources';
import {
  type BlocksItemsStudioHost,
  BlocksItemsStudioHostContext,
} from '../../src/renderer/src/studios/blocks-items/host';
import { ElementForm } from '../../src/renderer/src/studios/ElementForm';
import { NEW_NUMBER_HUD, newHudId } from '../../src/renderer/src/studios/rules/book-changes';
import { makeRulesEnv, RulesEnvContext } from '../../src/renderer/src/studios/rules/env';
import { rulesModeOf } from '../../src/renderer/src/studios/rules/mode';
import {
  ruleSubjectAt,
  vehicleWeapons,
} from '../../src/renderer/src/studios/rules/project-pickers';
import { RuleCard } from '../../src/renderer/src/studios/rules/RuleCard';
import { getAt, lacksTriggerList } from '../../src/renderer/src/studios/rules/rules-model';
import { triggersFor } from '../../src/renderer/src/studios/rules/turn-into-rules';
import type { SchemaContextState } from '../../src/renderer/src/studios/use-schema-context';
import { element } from './fixtures';
import { schemaIndex } from './forms/schemas';
import { LAZY_CHUNK_TIMEOUT_MS, PRELOAD_TIMEOUT_MS, preloadChunks } from './lazy-chunks';

const target = (builtInTargets[0] as (typeof builtInTargets)[number]).target;
const rulesKind = rulesPlugin.contributes.elementKinds?.find((kind) => kind.id === RULES_KIND);
let schema: SchemaContextState;

beforeAll(async () => {
  const index = await schemaIndex();
  const vanilla = { item: ['diamond'], block: ['stone'], entity_type: ['zombie'] };
  const registries = createRegistryIndex({ vanilla, project: {} });
  schema = {
    status: 'ready',
    context: {
      target,
      schemaIndex: index,
      vanillaRegistries: vanilla,
      registries: () => registries,
    },
  };
  // The Studio is a lazy chunk: load it here, not inside the first findBy.
  await preloadChunks(() => import('../../src/renderer/src/studios/rules/RuleBookStudio'));
}, PRELOAD_TIMEOUT_MS);
afterEach(cleanup);

const BOOK_ID = 'demo:rules' as ResourceLocation;
const TANK = 'demo:tank' as ResourceLocation;
const JEEP = 'demo:jeep' as ResourceLocation;
const DASH = 'demo:dash' as ResourceLocation;
const SCORE = 'demo:score' as ResourceLocation;

const WEAPONS: Json = [
  { id: 'cannon', projectile: 'minecraft:fire_charge' },
  { id: 'machine_gun', projectile: 'minecraft:arrow' },
];

function projectOf(book: Json, extra: Element[] = []): Project {
  return {
    formatVersion: 1,
    name: 'Demo',
    targets: [],
    plugins: [],
    settings: {},
    namespaces: [
      {
        name: 'demo',
        elements: [
          element(BOOK_ID, RULES_KIND, book),
          element(TANK, 'msm:vehicle', { format: 1, weapons: WEAPONS }),
          element(JEEP, 'msm:vehicle', { format: 1 }),
          element(DASH, 'msm:key_bind', {
            default_key: 'key.keyboard.z',
            format: 1,
            name: 'Dash',
          }),
          element('demo:ruby' as ResourceLocation, 'msm:item', { display_name: 'Ruby', format: 1 }),
          ...extra,
        ],
        assets: [],
      },
    ],
  };
}

/** A host whose `applyChanges` applies the items to the stack as one step, like the session. */
function hostFor(stack: CommandStack): BlocksItemsStudioHost {
  return {
    thumbnail: async () => new Uint8Array(),
    revision: 0,
    paintTexture: () => undefined,
    applyChanges: async (items: readonly ChangeItem[], label: string) => {
      const plan = planChangeItems(stack.state, items);
      if (plan.skipped.length > 0) throw new Error('The project changed meanwhile.');
      const parts = plan.commands;
      stack.execute({
        id: 'test.apply',
        label,
        apply(draft) {
          for (const part of parts) part.apply(draft);
        },
      });
    },
  };
}

function Harness(props: { stack: CommandStack }) {
  const { stack } = props;
  const [, rerender] = useReducer((count: number) => count + 1, 0);
  useEffect(() => stack.subscribe(() => rerender()), [stack]);
  const book = stack.state.namespaces[0]?.elements.find((entry) => entry.id === BOOK_ID) as Element;
  return (
    <ElementForm
      project={stack.state}
      element={book}
      kind={rulesKind}
      problems={[]}
      schema={schema}
      onChange={(pointer, value, options) =>
        stack.execute(commands.setElementValue(BOOK_ID, pointer, value, options ?? {}))
      }
      focusPointer={null}
      onFocused={vi.fn()}
    />
  );
}

async function renderBook(book: Json, options: { host?: boolean; extra?: Element[] } = {}) {
  const stack = new CommandStack(projectOf(book, options.extra), { coalesceWindowMs: 60_000 });
  const tree = <Harness stack={stack} />;
  render(
    options.host === true ? (
      <BlocksItemsStudioHostContext.Provider value={hostFor(stack)}>
        {tree}
      </BlocksItemsStudioHostContext.Provider>
    ) : (
      tree
    ),
  );
  await screen.findByTestId('rule-book-studio', {}, { timeout: LAZY_CHUNK_TIMEOUT_MS });
  const find = (id: string): Element | undefined =>
    stack.state.namespaces[0]?.elements.find((entry) => entry.id === id);
  const data = (): Json => find(BOOK_ID)?.data ?? null;
  return { stack, data, find };
}

const bookWith = (...rules: Json[]): Json => ({ counters: [], format: 1, rules });

/** Opens a chip's popover menu and clicks a choice in it. */
async function pickFromMenu(chip: HTMLElement, name: string | RegExp) {
  fireEvent.click(chip);
  const choice = await screen.findByRole('button', { name });
  fireEvent.click(choice);
}

describe('key and vehicle subjects', () => {
  it('reads "pick one of your keys" and offers only the project key binds', async () => {
    const { data } = await renderBook(
      bookWith({ do: [], key: 'rule', when: { trigger: 'key_pressed' } }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Thing: pick one of your keys' }));
    const picker = await screen.findByTestId('thing-picker');
    expect(within(picker).queryByRole('button', { name: 'Ruby' })).toBeNull();
    expect(within(picker).queryByRole('button', { name: 'Tank' })).toBeNull();
    // A key bind's own name (the words in Controls) names it.
    fireEvent.click(within(picker).getByRole('button', { name: 'Dash' }));
    expect(data()).toMatchObject({ rules: [{ when: { subject: DASH, trigger: 'key_pressed' } }] });
    expect(screen.getByRole('button', { name: 'Thing: Dash' })).toBeTruthy();
    expect(screen.getByTestId('rule-sentence').textContent).toBe(
      'When a player presses Dash, nothing.',
    );
  });

  it('reads "pick one of your vehicles" and offers only the project vehicles', async () => {
    const { data } = await renderBook(
      bookWith({ do: [], key: 'rule', when: { trigger: 'vehicle_mounted' } }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Thing: pick one of your vehicles' }));
    const picker = await screen.findByTestId('thing-picker');
    expect(within(picker).getByRole('button', { name: 'Jeep' })).toBeTruthy();
    expect(within(picker).queryByRole('button', { name: 'Dash' })).toBeNull();
    expect(within(picker).queryByRole('button', { name: 'Zombie' })).toBeNull();
    fireEvent.click(within(picker).getByRole('button', { name: 'Tank' }));
    expect(data()).toMatchObject({ rules: [{ when: { subject: TANK } }] });
  });

  it('lists the project things of the new sorts only', () => {
    const project = projectOf(bookWith(), [
      element(SCORE, 'msm:hud', { format: 1, type: 'text', value: { source: 'set' } }),
    ]);
    const registries = { ids: () => ['minecraft:zombie'] };
    const ids = (sort: 'key' | 'vehicle' | 'hud') =>
      thingSections({ project, registries, sort, texturesFolder: 'textures' }).flatMap((section) =>
        section.things.map((thing) => thing.id),
      );
    expect(ids('key')).toEqual([DASH]);
    expect(ids('vehicle')).toEqual([JEEP, TANK]);
    expect(ids('hud')).toEqual([SCORE]);
  });
});

describe('the HUD element of a step', () => {
  it('picks one of the project HUD elements', async () => {
    const { data } = await renderBook(
      bookWith({ do: [{ step: 'show_hud' }], key: 'rule', when: { trigger: 'player_joined' } }),
      { extra: [element(SCORE, 'msm:hud', { format: 1, type: 'bar', value: { source: 'set' } })] },
    );
    const chip = screen.getByRole('button', { name: 'On screen: pick what to show' });
    fireEvent.click(chip);
    // "Make a new on-screen number" belongs to "Show a number on screen" only.
    await screen.findByTestId(`rules-hud-${SCORE}`);
    expect(screen.queryByTestId('rules-hud-new-number')).toBeNull();
    fireEvent.click(screen.getByTestId(`rules-hud-${SCORE}`));
    expect(getAt(data(), '/rules/0/do/0/hud')).toBe(SCORE);
    expect(screen.getByRole('button', { name: 'On screen: Score' })).toBeTruthy();
  });

  it('makes a new on-screen number inline as one undo step with the rule', async () => {
    const before = bookWith({ do: [], key: 'rule', when: { trigger: 'player_joined' } });
    const { stack, data, find } = await renderBook(before, {
      host: true,
      extra: [element('demo:number' as ResourceLocation, 'msm:item', { format: 1 })],
    });
    await pickFromMenu(screen.getByTestId('rules-add-step-do'), 'Show a number on screen');
    expect(getAt(data(), '/rules/0/do/0/step')).toBe('set_hud');
    const afterStep = data();
    fireEvent.click(screen.getByRole('button', { name: 'On screen: pick what to show' }));
    expect(await screen.findByTestId('rules-hud-none')).toBeTruthy();
    fireEvent.click(screen.getByTestId('rules-hud-new-number'));
    // `demo:number` is taken by an item, so the new number gets the next free id.
    await waitFor(() => expect(find('demo:number_2')).toBeDefined());
    expect(find('demo:number_2')?.kind).toBe('msm:hud');
    expect(find('demo:number_2')?.data).toEqual(NEW_NUMBER_HUD);
    expect(getAt(data(), '/rules/0/do/0/hud')).toBe('demo:number_2');
    expect(stack.undoLabel()).toBe('Make a new on-screen number');
    act(() => {
      stack.undo();
    });
    expect(find('demo:number_2')).toBeUndefined();
    expect(data()).toEqual(afterStep);
  });

  it('does not offer a new number where the host cannot make elements', async () => {
    await renderBook(
      bookWith({ do: [{ step: 'set_hud' }], key: 'rule', when: { trigger: 'player_joined' } }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'On screen: pick what to show' }));
    expect(await screen.findByTestId('rules-hud-none')).toBeTruthy();
    expect(screen.queryByTestId('rules-hud-new-number')).toBeNull();
  });

  it('gives new numbers free ids', () => {
    const project = projectOf(bookWith(), [element('demo:number' as ResourceLocation, 'msm:hud')]);
    expect(newHudId(project, 'demo')).toBe('demo:number_2');
    expect(newHudId(project, 'other')).toBe('other:number');
  });
});

describe('the weapon of a vehicle reading', () => {
  const ammoRule = (subject: string): Json => ({
    do: [{ hud: SCORE, step: 'set_hud', value: { value: 'vehicle_ammo' } }],
    key: 'rule',
    when: { subject, trigger: 'vehicle_mounted' },
  });

  it("offers the rule's vehicle's weapons, the first by default", async () => {
    const { data } = await renderBook(bookWith(ammoRule(TANK)), {
      extra: [element(SCORE, 'msm:hud', { format: 1, type: 'text', value: { source: 'set' } })],
    });
    fireEvent.click(screen.getByTestId('rules-chip-value'));
    const select = (await screen.findByTestId('rules-weapon')) as HTMLSelectElement;
    expect([...select.options].map((option) => option.textContent)).toEqual([
      'The first weapon (Cannon)',
      'Cannon',
      'Machine gun',
    ]);
    expect(select.value).toBe('');
    fireEvent.change(select, { target: { value: 'machine_gun' } });
    expect(getAt(data(), '/rules/0/do/0/value')).toEqual({
      value: 'vehicle_ammo',
      weapon: 'machine_gun',
    });
    fireEvent.change(screen.getByTestId('rules-weapon'), { target: { value: '' } });
    expect(getAt(data(), '/rules/0/do/0/value')).toEqual({ value: 'vehicle_ammo' });
  });

  it('reads weapons from the vehicle data and the subject from the pointer', () => {
    const project = projectOf(bookWith());
    expect(vehicleWeapons(project, TANK)).toEqual(['cannon', 'machine_gun']);
    expect(vehicleWeapons(project, JEEP)).toEqual([]);
    expect(vehicleWeapons(project, undefined)).toEqual([]);
    const book = bookWith(ammoRule(TANK)) as { [key: string]: Json };
    expect(ruleSubjectAt(book, '/rules/0/do/0/value/weapon')).toBe(TANK);
    expect(ruleSubjectAt(book, '/counters/0')).toBeUndefined();
  });
});

describe('"The vehicle fires"', () => {
  const fired = triggerById('vehicle_fired');

  it('needs the vehicle to have weapons', () => {
    expect(fired).toBeDefined();
    const trigger = fired as NonNullable<typeof fired>;
    expect(lacksTriggerList(trigger, { format: 1 })).toBe(true);
    expect(lacksTriggerList(trigger, { format: 1, weapons: [] })).toBe(true);
    expect(lacksTriggerList(trigger, { format: 1, weapons: WEAPONS })).toBe(false);
    const ids = (data: Json) => triggersFor('msm:vehicle', data).map((entry) => entry.id);
    expect(ids({ format: 1 })).not.toContain('vehicle_fired');
    expect(ids({ format: 1, weapons: WEAPONS })).toContain('vehicle_fired');
    expect(ids({ format: 1 })).toContain('vehicle_mounted');
  });

  function renderFixed(subject: ResourceLocation) {
    const book = bookWith({ do: [], key: 'rule', when: { subject, trigger: 'vehicle_mounted' } });
    const project = projectOf(book);
    const env = makeRulesEnv({
      project,
      bookId: BOOK_ID,
      book: book as { [key: string]: Json },
      registries: { ids: () => [] },
      texturesFolder: 'textures',
      pictures: null,
      mode: rulesModeOf(true),
      problems: [],
      plainWords: null,
    });
    render(
      <RulesEnvContext.Provider value={env}>
        <RuleCard
          book={book as { [key: string]: Json }}
          index={0}
          onChange={vi.fn()}
          fixedSubject={{ id: subject, kind: 'msm:vehicle' }}
        />
      </RulesEnvContext.Provider>,
    );
  }

  it('is offered in the Vehicle Studio on a vehicle with weapons', async () => {
    renderFixed(TANK);
    fireEvent.click(screen.getByTestId('rules-chip-trigger'));
    expect(await screen.findByTestId('rules-trigger-vehicle_fired')).toBeTruthy();
  });

  it('is not offered on a vehicle without weapons', async () => {
    renderFixed(JEEP);
    fireEvent.click(screen.getByTestId('rules-chip-trigger'));
    expect(await screen.findByTestId('rules-trigger-vehicle_mounted')).toBeTruthy();
    expect(screen.queryByTestId('rules-trigger-vehicle_fired')).toBeNull();
  });
});
