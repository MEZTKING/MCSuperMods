// @vitest-environment happy-dom
/// <reference types="node" />
/**
 * Entity Studio (B118): rendered through `ElementForm` (so the Studio comes from the registry)
 * over the real schema index, with template data from `@msm/plugin-entities`, plus the pure
 * helpers. Undo runs through a real `CommandStack` with `commands.setElementValue`, as the
 * session does.
 */
import {
  CommandStack,
  commands,
  type Element,
  type Json,
  type Project,
  type ResourceLocation,
  requireSyncResult,
} from '@msm/core';
import type { ElementKind, TemplateContext } from '@msm/plugin-api';
import entitiesPlugin from '@msm/plugin-entities';
import { createRegistryIndex } from '@msm/schemas';
import { builtInTargets } from '@msm/targets';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { useEffect, useReducer } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  ENTITY_ACTIONS,
  eventNames,
  newAction,
  renameEvent,
} from '../../../../src/renderer/src/studios/blocks-items/blocks-items-model';
import { ElementForm } from '../../../../src/renderer/src/studios/ElementForm';
import {
  animationNames,
  GOALS,
  newGoal,
  projectTextureIds,
} from '../../../../src/renderer/src/studios/entities/entities-model';
import { DISCOVERED_STUDIOS } from '../../../../src/renderer/src/studios/studio-registry';
import type { StudioProps } from '../../../../src/renderer/src/studios/types';
import type { SchemaContextState } from '../../../../src/renderer/src/studios/use-schema-context';
import { element } from '../../fixtures';
import { schemaIndex } from '../../forms/schemas';

const target = (builtInTargets[0] as (typeof builtInTargets)[number]).target;
let schema: SchemaContextState;

beforeAll(async () => {
  const index = await schemaIndex();
  const registries = createRegistryIndex({ vanilla: {} });
  schema = {
    status: 'ready',
    context: { target, schemaIndex: index, vanillaRegistries: {}, registries: () => registries },
  };
});
afterEach(cleanup);

const entityKind: ElementKind = (() => {
  const kind = entitiesPlugin.contributes.elementKinds?.find((entry) => entry.id === 'msm:entity');
  if (kind === undefined) throw new Error('No msm:entity kind.');
  return kind;
})();

function templateData(templateId: string, id = 'demo:gloom'): Json {
  const template = entitiesPlugin.contributes.elementTemplates?.find(
    (entry) => entry.id === templateId,
  );
  if (template === undefined) throw new Error(`No template ${templateId}.`);
  const context: TemplateContext = {
    id: id as TemplateContext['id'],
    namespace: 'demo',
    path: id.slice(id.indexOf(':') + 1),
    projectNamespace: 'demo',
    namespaces: ['demo'],
    kindDefault: undefined,
    target,
  };
  return requireSyncResult(template.data(context), templateId);
}

const GEO = element('demo:entity/gloom', 'msm:geo_model', {
  format_version: '1.12.0',
  'minecraft:geometry': [{ description: { identifier: 'geometry.gloom' }, bones: [] }],
});
const OTHER_GEO = element('demo:entity/moth', 'msm:geo_model', {});
const ANIMATIONS = element('demo:entity/gloom_animations', 'msm:animation', {
  format_version: '1.8.0',
  animations: { idle: {}, walk: {}, attack: {}, roar: {} },
});

function projectOf(...elements: Element[]): Project {
  return {
    formatVersion: 1,
    name: 'Demo',
    targets: [],
    plugins: [],
    settings: {},
    namespaces: [
      {
        name: 'demo',
        elements: [...elements, GEO, OTHER_GEO, ANIMATIONS],
        assets: [
          { path: 'textures/entity/gloom.png', mediaType: 'image/png' },
          { path: 'textures/item/gloom_spawn_egg.png', mediaType: 'image/png' },
          { path: 'sounds/roar.ogg', mediaType: 'audio/ogg' },
        ],
      },
    ],
  };
}

/** Renders the Form tab for `subject` with a spy `onChange`. */
function renderStudio(subject: Element) {
  const onChange = vi.fn<StudioProps['onChange']>();
  const result = render(
    <ElementForm
      project={projectOf(subject)}
      element={subject}
      kind={entityKind}
      problems={[]}
      schema={schema}
      onChange={onChange}
      focusPointer={null}
      onFocused={vi.fn()}
    />,
  );
  return { ...result, onChange };
}

/** `ElementForm` over a real command stack, as the session applies edits. */
function StackHarness({ stack, id }: { stack: CommandStack; id: ResourceLocation }) {
  const [, rerender] = useReducer((count: number) => count + 1, 0);
  useEffect(() => stack.subscribe(() => rerender()), [stack]);
  const subject = stack.state.namespaces[0]?.elements.find((entry) => entry.id === id);
  if (subject === undefined) return null;
  return (
    <ElementForm
      project={stack.state}
      element={subject}
      kind={entityKind}
      problems={[]}
      schema={schema}
      onChange={(pointer, value, options) =>
        stack.execute(commands.setElementValue(id, pointer, value, options ?? {}))
      }
      focusPointer={null}
      onFocused={vi.fn()}
    />
  );
}

function renderStack(data: Json, id = 'demo:gloom' as ResourceLocation) {
  const stack = new CommandStack(projectOf(element(id, 'msm:entity', data)));
  render(<StackHarness stack={stack} id={id} />);
  return { stack, data: () => dataOf(stack, id) };
}

const lastEdit = (spy: { mock: { lastCall?: unknown[] | undefined } }): unknown[] =>
  spy.mock.lastCall?.slice(0, 2) ?? [];

const dataOf = (stack: CommandStack, id: string): Json =>
  stack.state.namespaces[0]?.elements.find((entry) => entry.id === id)?.data ?? null;

const componentsOf = (data: Json) => (data as { components: Record<string, Json> }).components;

const options = (testId: string) =>
  [...(screen.getByTestId(testId) as HTMLSelectElement).options].map((option) => option.value);

describe('Entity Studio helpers', () => {
  it('registers the Entity Studio through the area file, not the geo and animation kinds', () => {
    const entries = DISCOVERED_STUDIOS.filter((entry) => entry.id === 'msm.entities.entity');
    expect(entries.map((entry) => entry.kindId)).toEqual(['msm:entity']);
    expect(
      DISCOVERED_STUDIOS.some(
        (entry) => entry.kindId === 'msm:geo_model' || entry.kindId === 'msm:animation',
      ),
    ).toBe(false);
  });

  it('lists the six goal types and starts list goals with players', () => {
    expect(GOALS.map((goal) => goal.type)).toEqual([
      'wander',
      'look_at_player',
      'look_around',
      'melee_attack',
      'flee',
      'follow',
    ]);
    expect(newGoal('flee')).toEqual({ type: 'flee', from: ['minecraft:player'] });
    expect(newGoal('follow')).toEqual({ type: 'follow', entities: ['minecraft:player'] });
    expect(newGoal('look_around')).toEqual({ type: 'look_around' });
  });

  it('reads animation names and project textures', () => {
    const project = projectOf();
    expect(animationNames(project, 'demo:entity/gloom_animations')).toEqual([
      'idle',
      'walk',
      'attack',
      'roar',
    ]);
    expect(animationNames(project, 'demo:entity/missing')).toEqual([]);
    expect(projectTextureIds(project)).toEqual(['demo:entity/gloom', 'demo:item/gloom_spawn_egg']);
  });

  it('offers play_animation to entities and renames entity trigger references', () => {
    expect(ENTITY_ACTIONS.map((action) => action.type)).toContain('play_animation');
    expect(newAction('play_animation', [])).toEqual({ type: 'play_animation', animation: '' });
    const data = {
      events: { 'demo:hit': { actions: [] } },
      components: {
        'msm:attack': { damage: 2, on_attack: 'demo:hit' },
        'msm:on_hurt': { event: 'demo:hit' },
      },
    };
    const renamed = renameEvent(data, 'msm:entity', 'demo:hit', 'demo:smack');
    expect(eventNames(renamed)).toEqual(['demo:smack']);
    expect(renamed.components).toEqual({
      'msm:attack': { damage: 2, on_attack: 'demo:smack' },
      'msm:on_hurt': { event: 'demo:smack' },
    });
  });
});

describe('Entity Studio', () => {
  it('renders template data in every section', () => {
    renderStudio(element('demo:gloom', 'msm:entity', templateData('msm_entity_monster')));
    expect(screen.getByTestId('entity-studio')).toBeTruthy();
    for (const section of [
      'entity-identity',
      'entity-appearance',
      'entity-stats',
      'entity-attack',
      'entity-behaviour',
      'entity-spawning',
      'entity-spawn-egg',
      'msm-events',
    ]) {
      expect(screen.getByTestId(section)).toBeTruthy();
    }
    expect((screen.getByTestId('entity-display-name') as HTMLInputElement).value).toBe('Gloom');
    expect((screen.getByTestId('entity-category') as HTMLSelectElement).value).toBe('monster');
    expect(options('entity-category')).toContain('water_creature');
    expect((screen.getByTestId('entity-health') as HTMLInputElement).value).toBe('24');
    expect((screen.getByTestId('entity-model') as HTMLSelectElement).value).toBe(
      'demo:entity/gloom',
    );
    expect(options('entity-model')).toEqual(['', 'demo:entity/gloom', 'demo:entity/moth']);
    expect(options('entity-animations')).toEqual(['', 'demo:entity/gloom_animations']);
    expect(options('entity-texture')).toEqual([
      '',
      'demo:entity/gloom',
      'demo:item/gloom_spawn_egg',
    ]);
    expect(options('entity-idle')).toEqual(['', 'idle', 'walk', 'attack', 'roar']);
    expect((screen.getByTestId('entity-attack-enabled') as HTMLInputElement).checked).toBe(true);
    expect(screen.getAllByTestId(/^entity-goal-\d+$/)).toHaveLength(4);
    expect((screen.getByTestId('entity-spawns') as HTMLInputElement).checked).toBe(true);
    expect(options('entity-spawn-rule')).toContain('surface_monster');
    expect(options('entity-spawn-placement')).toContain('in_water');
    expect(options('entity-spawn-heightmap')).toContain('world_surface');
    expect((screen.getByTestId('entity-has-egg') as HTMLInputElement).checked).toBe(true);
  });

  it('writes Identity and Appearance fields at their pointers', () => {
    const { onChange } = renderStudio(
      element('demo:gloom', 'msm:entity', templateData('msm_entity_creature')),
    );
    fireEvent.change(screen.getByTestId('entity-display-name'), { target: { value: 'Glum' } });
    expect(onChange).toHaveBeenLastCalledWith('/display_name', 'Glum', {
      coalesce: 'typing:/display_name',
    });
    fireEvent.change(screen.getByTestId('entity-category'), { target: { value: 'ambient' } });
    expect(lastEdit(onChange)).toEqual(['/category', 'ambient']);
    fireEvent.change(screen.getByTestId('entity-width'), { target: { value: '1.2' } });
    expect(lastEdit(onChange)).toEqual(['/size/width', 1.2]);
    fireEvent.change(screen.getByTestId('entity-height'), { target: { value: '2.5' } });
    expect(lastEdit(onChange)).toEqual(['/size/height', 2.5]);
    fireEvent.change(screen.getByTestId('entity-eye-height'), { target: { value: '2' } });
    expect(lastEdit(onChange)).toEqual(['/eye_height', 2]);
    fireEvent.change(screen.getByTestId('entity-model'), {
      target: { value: 'demo:entity/moth' },
    });
    expect(lastEdit(onChange)).toEqual([
      '/components/msm:animated_model/model',
      'demo:entity/moth',
    ]);
    fireEvent.change(screen.getByTestId('entity-texture'), {
      target: { value: 'demo:entity/gloom' },
    });
    expect(lastEdit(onChange)).toEqual([
      '/components/msm:animated_model/texture',
      'demo:entity/gloom',
    ]);
    fireEvent.change(screen.getByTestId('entity-walk'), { target: { value: 'roar' } });
    expect(lastEdit(onChange)).toEqual(['/components/msm:animated_model/walk', 'roar']);
    fireEvent.change(screen.getByTestId('entity-scale'), { target: { value: '1.5' } });
    expect(lastEdit(onChange)).toEqual(['/components/msm:animated_model/scale', 1.5]);
    fireEvent.change(screen.getByTestId('entity-animations'), { target: { value: '' } });
    expect(lastEdit(onChange)).toEqual(['/components/msm:animated_model/animations', undefined]);
  });

  it('writes Stats and removes empty components', () => {
    const { data } = renderStack({
      ...(templateData('msm_entity_creature') as object),
      components: {
        'msm:health': { max: 10 },
        'msm:movement': { speed: 0.3 },
        'msm:animated_model': { model: '', texture: '' },
      },
    });
    fireEvent.change(screen.getByTestId('entity-health'), { target: { value: '40' } });
    expect(componentsOf(data())['msm:health']).toEqual({ max: 40 });
    fireEvent.change(screen.getByTestId('entity-health'), { target: { value: '' } });
    expect(componentsOf(data())['msm:health']).toBeUndefined();
    fireEvent.change(screen.getByTestId('entity-follow-range'), { target: { value: '24' } });
    fireEvent.change(screen.getByTestId('entity-knockback-resistance'), {
      target: { value: '0.5' },
    });
    fireEvent.click(screen.getByTestId('entity-swims'));
    fireEvent.click(screen.getByTestId('entity-fire-immune'));
    expect(componentsOf(data())['msm:movement']).toEqual({
      speed: 0.3,
      follow_range: 24,
      knockback_resistance: 0.5,
      swims: true,
      fire_immune: true,
    });
    fireEvent.click(screen.getByTestId('entity-swims'));
    fireEvent.click(screen.getByTestId('entity-fire-immune'));
    fireEvent.change(screen.getByTestId('entity-follow-range'), { target: { value: '' } });
    fireEvent.change(screen.getByTestId('entity-knockback-resistance'), { target: { value: '' } });
    fireEvent.change(screen.getByTestId('entity-speed'), { target: { value: '' } });
    expect(componentsOf(data())['msm:movement']).toBeUndefined();
  });

  it('turns the attack off and back on with its fields restored', () => {
    const { data } = renderStack(templateData('msm_entity_monster'));
    fireEvent.change(screen.getByLabelText('New event id'), { target: { value: 'demo:hit' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add event' }));
    fireEvent.change(screen.getByTestId('entity-attack-damage'), { target: { value: '6' } });
    fireEvent.change(screen.getByTestId('entity-attack-knockback'), { target: { value: '1' } });
    fireEvent.change(screen.getByTestId('entity-on-attack'), { target: { value: 'demo:hit' } });
    const attack = { damage: 6, knockback: 1, on_attack: 'demo:hit' };
    expect(componentsOf(data())['msm:attack']).toEqual(attack);
    fireEvent.click(screen.getByTestId('entity-attack-enabled'));
    expect(componentsOf(data())['msm:attack']).toBeUndefined();
    expect(screen.queryByTestId('entity-attack-damage')).toBeNull();
    fireEvent.click(screen.getByTestId('entity-attack-enabled'));
    expect(componentsOf(data())['msm:attack']).toEqual(attack);
  });

  it('adds, edits, reorders and removes goals, one undo step each', () => {
    const { stack, data } = renderStack(templateData('msm_entity_creature'));
    const goals = () =>
      (componentsOf(data())['msm:ai_goals'] as { goals: { type: string }[] }).goals;
    expect(goals().map((goal) => goal.type)).toEqual(['wander', 'look_at_player', 'look_around']);

    const picker = screen.getByTestId('entity-new-goal-type') as HTMLSelectElement;
    expect(screen.getByLabelText('New goal type')).toBe(picker);
    expect([...picker.options].map((option) => [option.value, option.textContent])).toEqual([
      ['wander', 'Wander'],
      ['look_at_player', 'Look at player'],
      ['look_around', 'Look around'],
      ['melee_attack', 'Melee attack'],
      ['flee', 'Flee'],
      ['follow', 'Follow'],
    ]);
    fireEvent.change(screen.getByTestId('entity-new-goal-type'), { target: { value: 'flee' } });
    fireEvent.click(screen.getByTestId('entity-add-goal'));
    expect(goals().at(-1)).toEqual({ type: 'flee', from: ['minecraft:player'] });

    const flee = screen.getByTestId('entity-goal-3');
    fireEvent.change(within(flee).getByLabelText('Goal 4 distance'), { target: { value: '10' } });
    expect(goals()[3]).toEqual({ type: 'flee', from: ['minecraft:player'], distance: 10 });
    fireEvent.change(within(flee).getByLabelText('New entry in Goal 4 runs from'), {
      target: { value: 'minecraft:wolf' },
    });
    fireEvent.click(within(flee).getByRole('button', { name: 'Add to Goal 4 runs from' }));
    expect(goals()[3]).toMatchObject({ from: ['minecraft:player', 'minecraft:wolf'] });

    fireEvent.click(screen.getByRole('button', { name: 'Move Goal 4 up' }));
    expect(goals().map((goal) => goal.type)).toEqual([
      'wander',
      'look_at_player',
      'flee',
      'look_around',
    ]);
    fireEvent.click(screen.getByRole('button', { name: 'Move Goal 1 down' }));
    expect(goals().map((goal) => goal.type)).toEqual([
      'look_at_player',
      'wander',
      'flee',
      'look_around',
    ]);

    // The wander goal's "Avoid water" defaults to on; unticking writes false.
    const wander = screen.getByTestId('entity-goal-1');
    const avoid = within(wander).getByLabelText('Avoid water') as HTMLInputElement;
    expect(avoid.checked).toBe(true);
    fireEvent.click(avoid);
    expect(goals()[1]).toEqual({ type: 'wander', avoid_water: false });
    fireEvent.click(within(wander).getByLabelText('Avoid water'));
    expect(goals()[1]).toEqual({ type: 'wander' });

    fireEvent.click(screen.getByRole('button', { name: 'Remove Goal 3' }));
    expect(goals().map((goal) => goal.type)).toEqual(['look_at_player', 'wander', 'look_around']);
    act(() => {
      stack.undo();
    });
    expect(goals().map((goal) => goal.type)).toEqual([
      'look_at_player',
      'wander',
      'flee',
      'look_around',
    ]);
  });

  it('adds the first goal when the entity has no goal list', () => {
    const base = templateData('msm_entity_creature') as { components: Record<string, Json> };
    const { 'msm:ai_goals': _goals, ...components } = base.components;
    const { data } = renderStack({ ...base, components });
    fireEvent.change(screen.getByTestId('entity-new-goal-type'), { target: { value: 'follow' } });
    fireEvent.click(screen.getByTestId('entity-add-goal'));
    expect(componentsOf(data())['msm:ai_goals']).toEqual({
      goals: [{ type: 'follow', entities: ['minecraft:player'] }],
    });
  });

  it('turns natural spawning on with defaults, edits biomes and numbers, and off', () => {
    const { spawn: _spawn, ...base } = templateData('msm_entity_creature') as Record<string, Json>;
    const { data } = renderStack(base);
    const spawnOf = () => (data() as { spawn?: Record<string, Json> }).spawn;
    expect(spawnOf()).toBeUndefined();
    fireEvent.click(screen.getByTestId('entity-spawns'));
    expect(spawnOf()).toEqual({
      biomes: ['#minecraft:is_overworld'],
      weight: 10,
      min_group: 1,
      max_group: 3,
    });
    fireEvent.change(screen.getByLabelText('New entry in Biomes'), {
      target: { value: 'minecraft:plains' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add to Biomes' }));
    fireEvent.change(screen.getByTestId('entity-spawn-weight'), { target: { value: '25' } });
    fireEvent.change(screen.getByTestId('entity-spawn-min-group'), { target: { value: '2' } });
    fireEvent.change(screen.getByTestId('entity-spawn-max-group'), { target: { value: '5' } });
    fireEvent.change(screen.getByTestId('entity-spawn-placement'), {
      target: { value: 'in_water' },
    });
    fireEvent.change(screen.getByTestId('entity-spawn-heightmap'), {
      target: { value: 'ocean_floor' },
    });
    fireEvent.change(screen.getByTestId('entity-spawn-rule'), { target: { value: 'always' } });
    const spawn = {
      biomes: ['#minecraft:is_overworld', 'minecraft:plains'],
      weight: 25,
      min_group: 2,
      max_group: 5,
      placement: 'in_water',
      heightmap: 'ocean_floor',
      rule: 'always',
    };
    expect(spawnOf()).toEqual(spawn);
    fireEvent.click(screen.getByTestId('entity-spawns'));
    expect(spawnOf()).toBeUndefined();
    fireEvent.click(screen.getByTestId('entity-spawns'));
    expect(spawnOf()).toEqual(spawn);
  });

  it('turns the spawn egg off as false, back on, and edits its fields', () => {
    const { data } = renderStack({
      ...(templateData('msm_entity_creature') as object),
      spawn_egg: { creative_tab: 'minecraft:spawn_eggs' },
    });
    const egg = () => (data() as { spawn_egg?: Json }).spawn_egg;
    fireEvent.change(screen.getByTestId('entity-egg-texture'), {
      target: { value: 'demo:item/gloom_spawn_egg' },
    });
    fireEvent.change(screen.getByTestId('entity-egg-display-name'), {
      target: { value: 'Gloom Egg' },
    });
    const full = {
      creative_tab: 'minecraft:spawn_eggs',
      texture: 'demo:item/gloom_spawn_egg',
      display_name: 'Gloom Egg',
    };
    expect(egg()).toEqual(full);
    fireEvent.click(screen.getByTestId('entity-has-egg'));
    expect(egg()).toBe(false);
    expect(screen.queryByTestId('entity-egg-texture')).toBeNull();
    fireEvent.click(screen.getByTestId('entity-has-egg'));
    expect(egg()).toEqual(full);
  });

  it('creates the spawn egg object when the first egg field is set', () => {
    const base = templateData('msm_entity_creature') as Record<string, Json>;
    const { spawn_egg: _egg, ...rest } = base;
    const { data } = renderStack(rest);
    fireEvent.change(screen.getByTestId('entity-egg-texture'), {
      target: { value: 'demo:item/gloom_spawn_egg' },
    });
    expect((data() as { spawn_egg?: Json }).spawn_egg).toEqual({
      texture: 'demo:item/gloom_spawn_egg',
    });
  });

  it('reuses the events editor with entity triggers and play_animation', () => {
    const { data } = renderStack(templateData('msm_entity_monster'));
    fireEvent.change(screen.getByLabelText('New event id'), { target: { value: 'demo:roar' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add event' }));
    const event = screen.getByTestId('msm-event-demo:roar');
    const type = within(event).getByLabelText('New action type for demo:roar') as HTMLSelectElement;
    expect([...type.options].map((option) => option.value)).toContain('play_animation');
    fireEvent.change(type, { target: { value: 'play_animation' } });
    fireEvent.click(within(event).getByRole('button', { name: 'Add action to demo:roar' }));
    const animation = within(event).getByLabelText(
      'demo:roar action 1 animation',
    ) as HTMLSelectElement;
    expect([...animation.options].map((option) => option.value)).toEqual([
      '',
      'idle',
      'walk',
      'attack',
      'roar',
    ]);
    fireEvent.change(animation, { target: { value: 'roar' } });
    expect((data() as { events: Json }).events).toEqual({
      'demo:roar': { actions: [{ type: 'play_animation', animation: 'roar' }] },
    });

    for (const [testId, component] of [
      ['entity-on-hurt', 'msm:on_hurt'],
      ['entity-on-death', 'msm:on_death'],
      ['entity-on-interact', 'msm:on_interact'],
    ] as const) {
      fireEvent.change(screen.getByTestId(testId), { target: { value: 'demo:roar' } });
      expect(componentsOf(data())[component]).toEqual({ event: 'demo:roar' });
    }
    fireEvent.change(screen.getByTestId('entity-on-death'), { target: { value: '' } });
    expect(componentsOf(data())['msm:on_death']).toBeUndefined();

    // Renaming the event rewrites the triggers.
    fireEvent.change(within(event).getByLabelText('Event id demo:roar'), {
      target: { value: 'demo:howl' },
    });
    fireEvent.blur(within(screen.getByTestId('msm-event-demo:roar')).getByLabelText(/Event id/));
    expect(eventNames(data())).toEqual(['demo:howl']);
    expect(componentsOf(data())['msm:on_hurt']).toEqual({ event: 'demo:howl' });
  });

  it('switches to the schema form under Advanced', () => {
    renderStudio(element('demo:gloom', 'msm:entity', templateData('msm_entity_ambient')));
    fireEvent.click(screen.getByTestId('entity-advanced-toggle'));
    expect(screen.queryByTestId('entity-identity')).toBeNull();
    expect(screen.getByTestId('entity-studio')).toBeTruthy();
  });
});
