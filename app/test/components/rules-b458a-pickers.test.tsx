// @vitest-environment happy-dom
/// <reference types="node" />
/**
 * B458a: the pickers for the command slot, the mount of "ride" (never every player), the cause
 * of an explosion (a mob type or "a block"). Original header follows.
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
import rulesPlugin, { RULES_KIND } from '@msm/plugin-rules';
import { createRegistryIndex } from '@msm/schemas';
import { builtInTargets } from '@msm/targets';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { useEffect, useReducer } from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { thingSections } from '../../src/renderer/src/components/thing-picker/thing-sources';
import { usePreferences } from '../../src/renderer/src/store/preferences';
import { ElementForm } from '../../src/renderer/src/studios/ElementForm';
import { getAt } from '../../src/renderer/src/studios/rules/rules-model';
import type { SchemaContextState } from '../../src/renderer/src/studios/use-schema-context';
import { element } from './fixtures';
import { schemaIndex } from './forms/schemas';

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
});
beforeEach(() => {
  usePreferences.setState({ mode: 'easy' });
});
afterEach(cleanup);

const BOOK_ID = 'demo:rules' as ResourceLocation;
const TANK = 'demo:tank' as ResourceLocation;
const JEEP = 'demo:jeep' as ResourceLocation;
const DASH = 'demo:dash' as ResourceLocation;

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

async function renderBook(book: Json, options: { extra?: Element[] } = {}) {
  const stack = new CommandStack(projectOf(book, options.extra), { coalesceWindowMs: 60_000 });
  render(<Harness stack={stack} />);
  await screen.findByTestId('rule-book-studio');
  const find = (id: string): Element | undefined =>
    stack.state.namespaces[0]?.elements.find((entry) => entry.id === id);
  const data = (): Json => find(BOOK_ID)?.data ?? null;
  return { stack, data, find };
}

const bookWith = (...rules: Json[]): Json => ({ counters: [], format: 1, rules });

describe('B458a pickers', () => {
  const GREET = 'demo:greet' as ResourceLocation;
  const KIT = 'demo:kit' as ResourceLocation;
  const commands2 = [
    element(GREET, 'msm:command', { format: 1, name: 'greet' }),
    element(KIT, 'msm:command', { format: 1, name: 'kit' }),
  ];

  it('picks one of the project commands, shown as /name', async () => {
    const { data } = await renderBook(
      bookWith({ do: [], key: 'rule', when: { trigger: 'command_used' } }),
      { extra: commands2 },
    );
    fireEvent.click(screen.getByRole('button', { name: 'Thing: pick one of your commands' }));
    const picker = await screen.findByTestId('thing-picker');
    expect(within(picker).queryByRole('button', { name: 'Ruby' })).toBeNull();
    expect(within(picker).queryByRole('button', { name: 'Tank' })).toBeNull();
    expect(within(picker).getByRole('button', { name: '/kit' })).toBeTruthy();
    fireEvent.click(within(picker).getByRole('button', { name: '/greet' }));
    expect(data()).toMatchObject({
      rules: [{ when: { subject: GREET, trigger: 'command_used' } }],
    });
    expect(screen.getByRole('button', { name: 'Thing: /greet' })).toBeTruthy();
  });

  it('lists the project commands as a thing sort', () => {
    const project = projectOf(bookWith(), commands2);
    const registries = { ids: () => ['minecraft:zombie'] };
    const names = thingSections({
      project,
      registries,
      sort: 'command',
      texturesFolder: 'textures',
    }).flatMap((section) => section.things.map((thing) => thing.name));
    expect(names).toEqual(['/greet', '/kit']);
  });

  it('offers the player, a mob and the other one as a mount, never every player', async () => {
    await renderBook(
      bookWith({
        do: [{ step: 'ride', who: 'player' }],
        key: 'rule',
        when: { trigger: 'player_joined' },
      }),
    );
    // The rider keeps the full menu.
    fireEvent.click(screen.getByTestId('rules-chip-who'));
    expect(await screen.findByTestId('rules-who-every_player')).toBeTruthy();
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
    cleanup();
    const { data } = await renderBook(
      bookWith({
        do: [{ step: 'ride', who: 'player' }],
        key: 'rule',
        when: { trigger: 'player_joined' },
      }),
    );
    fireEvent.click(screen.getByTestId('rules-chip-mount'));
    expect(await screen.findByTestId('rules-who-player')).toBeTruthy();
    expect(screen.queryByTestId('rules-who-every_player')).toBeNull();
    expect(screen.queryByTestId('rules-who-players_nearby')).toBeNull();
    fireEvent.click(screen.getByTestId('rules-who-player'));
    expect(getAt(data(), '/rules/0/do/0/mount')).toBe('player');
  });

  it('gives the cause of an explosion a mob picker and "a block"', async () => {
    const { data } = await renderBook(
      bookWith({
        do: [],
        only_if: { conditions: [{ condition: 'caused_by' }], match: 'all' },
        key: 'rule',
        when: { trigger: 'explosion' },
      }),
    );
    const chip = screen.getByTestId('rules-chip-cause');
    fireEvent.click(chip);
    const picker = await screen.findByTestId('thing-picker');
    fireEvent.click(within(picker).getByRole('button', { name: 'A block' }));
    expect(JSON.stringify(data())).toContain('"cause":"block"');
    expect(screen.getByTestId('rules-chip-cause').textContent).toBe('a block');
    fireEvent.click(screen.getByTestId('rules-chip-cause'));
    const again = await screen.findByTestId('thing-picker');
    fireEvent.click(within(again).getByRole('button', { name: 'Zombie' }));
    expect(JSON.stringify(data())).toContain('"cause":"minecraft:zombie"');
  });
});
