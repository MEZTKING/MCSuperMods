// @vitest-environment happy-dom
/// <reference types="node" />
/**
 * Entity Studio mob sections (B297, ADR 0073 D5): the Kind of mob picker as one undo step,
 * Movement, Ranged attack, Taming, Breeding, Riding, Variants and Boss bar, the renderer
 * picker's target note, the preview's variant and baby options and the jar dialog's GeckoLib
 * note by renderer. Rendered through `ElementForm` over a real `CommandStack`.
 */
import {
  CommandStack,
  commands,
  type Element,
  type Json,
  type Project,
  type ResourceLocation,
} from '@msm/core';
import type { ElementKind, Target } from '@msm/plugin-api';
import entitiesPlugin from '@msm/plugin-entities';
import { createRegistryIndex } from '@msm/schemas';
import { builtInTargets } from '@msm/targets';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { useEffect, useReducer } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  ExportFabricJarDialog,
  FABRIC_JAR_GECKOLIB_NOTE,
  FABRIC_JAR_VANILLA_RENDERER_NOTE,
  projectNeedsGeckolib,
} from '../../../../src/renderer/src/components/ExportFabricJarDialog';
import { EntityPreviewOptions } from '../../../../src/renderer/src/preview/geo/EntityPreviewOptions';
import {
  entityPreviewChoices,
  resolveGeoScene,
} from '../../../../src/renderer/src/preview/geo/subject';
import { ElementForm } from '../../../../src/renderer/src/studios/ElementForm';
import { newSpawn } from '../../../../src/renderer/src/studios/entities/entities-model';
import {
  MOB_KINDS,
  matchingKinds,
  mobKind,
  nextVariantId,
  projectileChoices,
  rendererNote,
  withMobKind,
} from '../../../../src/renderer/src/studios/entities/mob-kinds';
import type { SchemaContextState } from '../../../../src/renderer/src/studios/use-schema-context';
import { element } from '../../fixtures';
import { schemaIndex } from '../../forms/schemas';

const targetOf = (id: string): Target => {
  const entry = builtInTargets.find((candidate) => candidate.target.id === id);
  if (entry === undefined) throw new Error(`No target ${id}.`);
  return entry.target;
};
const MC263 = (builtInTargets[0] as (typeof builtInTargets)[number]).target;
const SNAPSHOT = (builtInTargets.find((entry) => entry.target.geckolib === undefined)?.target ??
  null) as Target | null;

const schemas = new Map<string, SchemaContextState>();
beforeAll(async () => {
  const index = await schemaIndex();
  const registries = createRegistryIndex({ vanilla: {} });
  for (const { target } of builtInTargets) {
    schemas.set(target.id, {
      status: 'ready',
      context: { target, schemaIndex: index, vanillaRegistries: {}, registries: () => registries },
    });
  }
});
afterEach(cleanup);

const entityKind: ElementKind = (() => {
  const kind = entitiesPlugin.contributes.elementKinds?.find((entry) => entry.id === 'msm:entity');
  if (kind === undefined) throw new Error('No msm:entity kind.');
  return kind;
})();

const GEO = element('demo:entity/gloom', 'msm:geo_model', {
  format_version: '1.12.0',
  'minecraft:geometry': [
    {
      description: { identifier: 'geometry.gloom' },
      bones: [{ name: 'body' }, { name: 'saddle', parent: 'body' }],
    },
  ],
});
const THROWABLE = element('demo:star', 'msm:item', {
  components: { 'msm:throwable': { damage: 2 } },
});

const BASE: Json = {
  format: 1,
  category: 'creature',
  size: { width: 0.9, height: 0.9 },
  display_name: 'Gloom',
  components: {
    'msm:animated_model': { model: 'demo:entity/gloom', texture: 'demo:entity/gloom' },
  },
};

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
        elements: [...elements, GEO, THROWABLE],
        assets: [
          { path: 'textures/entity/gloom.png', mediaType: 'image/png' },
          { path: 'textures/entity/gloom_red.png', mediaType: 'image/png' },
        ],
      },
    ],
  };
}

function StackHarness(props: { stack: CommandStack; id: ResourceLocation; targetId: string }) {
  const [, rerender] = useReducer((count: number) => count + 1, 0);
  useEffect(() => props.stack.subscribe(() => rerender()), [props.stack]);
  const subject = props.stack.state.namespaces[0]?.elements.find((entry) => entry.id === props.id);
  const schema = schemas.get(props.targetId);
  if (subject === undefined || schema === undefined) return null;
  return (
    <ElementForm
      project={props.stack.state}
      element={subject}
      kind={entityKind}
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

function renderStack(data: Json, targetId = MC263.id) {
  const id = 'demo:gloom' as ResourceLocation;
  const stack = new CommandStack(projectOf(element(id, 'msm:entity', data)));
  render(<StackHarness stack={stack} id={id} targetId={targetId} />);
  return {
    stack,
    data: () =>
      stack.state.namespaces[0]?.elements.find((entry) => entry.id === id)?.data as {
        [key: string]: Json;
      },
  };
}

const components = (data: { [key: string]: Json }) =>
  data.components as { [key: string]: { [key: string]: Json } | undefined };

describe('mob kinds', () => {
  it('lists the eight kinds of ADR 0070 D6', () => {
    expect(MOB_KINDS.map((kind) => kind.label)).toEqual([
      'Creature',
      'Farm animal',
      'Pet',
      'Monster',
      'Flying creature',
      'Water creature',
      'Fish',
      'Ambient',
    ]);
  });

  it('writes base, category, mode, placement and rule, and matches them back', () => {
    const fish = mobKind('fish');
    if (fish === undefined) throw new Error('No fish kind.');
    const withSpawn = { ...(BASE as object), spawn: newSpawn() };
    const next = withMobKind(withSpawn, fish);
    expect(next.base).toBeUndefined();
    expect(next.category).toBe('water_ambient');
    expect(components(next)['msm:movement']).toEqual({ mode: 'swim' });
    expect(next.spawn).toMatchObject({ placement: 'in_water', rule: 'water_animal' });
    expect(matchingKinds(next).map((kind) => kind.id)).toEqual(['fish']);
    const back = withMobKind(next, mobKind('creature') as NonNullable<ReturnType<typeof mobKind>>);
    expect(components(back)['msm:movement']).toBeUndefined();
    expect(newSpawn(fish)).toMatchObject({ placement: 'in_water', rule: 'water_animal' });
    expect(newSpawn(mobKind('creature'))).not.toHaveProperty('rule');
  });

  it('puts Pet first for a tameable animal', () => {
    const pet = withMobKind(BASE, mobKind('pet') as NonNullable<ReturnType<typeof mobKind>>);
    expect(matchingKinds(pet).map((kind) => kind.id)).toEqual(['farm_animal', 'pet']);
    const tamed = { ...pet, components: { ...components(pet), 'msm:tameable': { items: [] } } };
    expect(matchingKinds(tamed as Json).map((kind) => kind.id)).toEqual(['pet', 'farm_animal']);
  });

  it('offers the target projectiles then the project throwables', () => {
    expect(projectileChoices(projectOf(), ['minecraft:arrow', 'minecraft:snowball'])).toEqual([
      'minecraft:arrow',
      'minecraft:snowball',
      'demo:star',
    ]);
    expect(projectileChoices(projectOf(), MC263.entities?.projectileItems)).toContain(
      'minecraft:wind_charge',
    );
  });

  it('notes the renderer by target', () => {
    expect(rendererNote(undefined, true, '26.3')).toContain('Drawn by GeckoLib on 26.3');
    expect(rendererNote('auto', false, '26.4')).toContain(
      'drawn by the built-in renderer: no Molang',
    );
    expect(rendererNote('geckolib', false, '26.4')).toContain('cannot be exported');
    expect(rendererNote('vanilla', true, '26.3')).toContain('built-in renderer on every target');
    expect(nextVariantId([{ id: 'variant_2' }])).toBe('variant_3');
    expect(nextVariantId([{ id: 'variant_1' }])).toBe('variant_2');
  });
});

describe('Entity Studio mob sections', () => {
  it('changes the kind of mob in one undo step', () => {
    const { stack, data } = renderStack({ ...(BASE as object), spawn: newSpawn() });
    expect((screen.getByTestId('entity-kind') as HTMLSelectElement).value).toBe('creature');
    const before = data();
    fireEvent.change(screen.getByTestId('entity-kind'), { target: { value: 'water_creature' } });
    const after = data();
    expect(after.base).toBeUndefined();
    expect(after.category).toBe('water_creature');
    expect(components(after)['msm:movement']).toEqual({ mode: 'swim' });
    expect(after.spawn).toMatchObject({ placement: 'in_water', rule: 'water_animal' });
    expect((screen.getByTestId('entity-movement-mode') as HTMLSelectElement).value).toBe('swim');
    expect(screen.getByTestId('entity-breathes-air')).toBeTruthy();
    stack.undo();
    expect(data()).toEqual(before);

    fireEvent.change(screen.getByTestId('entity-kind'), { target: { value: 'pet' } });
    expect(data().base).toBe('animal');
    expect((screen.getByTestId('entity-kind') as HTMLSelectElement).value).toBe('pet');
    fireEvent.change(screen.getByTestId('entity-base'), { target: { value: 'monster' } });
    expect(data().base).toBe('monster');
    expect((screen.getByTestId('entity-kind') as HTMLSelectElement).value).toBe('');
  });

  it('edits the movement mode fields', () => {
    const { data } = renderStack(BASE);
    fireEvent.change(screen.getByTestId('entity-movement-mode'), { target: { value: 'fly' } });
    fireEvent.change(screen.getByTestId('entity-flying-speed'), { target: { value: '0.6' } });
    fireEvent.click(screen.getByTestId('entity-hovers'));
    fireEvent.change(screen.getByTestId('entity-step-height'), { target: { value: '1' } });
    expect(components(data())['msm:movement']).toEqual({
      mode: 'fly',
      flying_speed: 0.6,
      hovers: false,
      step_height: 1,
    });
    fireEvent.change(screen.getByTestId('entity-movement-mode'), { target: { value: 'swim' } });
    fireEvent.change(screen.getByTestId('entity-dry-out-ticks'), { target: { value: '600' } });
    fireEvent.click(screen.getByTestId('entity-breathes-air'));
    expect(screen.queryByTestId('entity-dry-out-ticks')).toBeNull();
    expect(components(data())['msm:movement']).toMatchObject({
      mode: 'swim',
      breathes_air: true,
      dry_out_ticks: 600,
    });
  });

  it('turns ranged attacks on, picks a project throwable and adds the goal', () => {
    const { data } = renderStack(BASE);
    expect(screen.queryByTestId('entity-ranged-projectile')).toBeNull();
    fireEvent.click(screen.getByTestId('entity-ranged-enabled'));
    expect(components(data())['msm:ranged_attack']).toEqual({ projectile: 'minecraft:arrow' });
    const projectiles = [
      ...(screen.getByTestId('entity-ranged-projectile') as HTMLSelectElement).options,
    ].map((option) => option.value);
    expect(projectiles).toContain('minecraft:snowball');
    expect(projectiles.at(-1)).toBe('demo:star');
    fireEvent.change(screen.getByTestId('entity-ranged-projectile'), {
      target: { value: 'demo:star' },
    });
    fireEvent.change(screen.getByTestId('entity-ranged-interval-ticks'), {
      target: { value: '30' },
    });
    fireEvent.click(screen.getByTestId('entity-ranged-add-goal'));
    expect(components(data())['msm:ranged_attack']).toEqual({
      projectile: 'demo:star',
      interval_ticks: 30,
    });
    expect(components(data())['msm:ai_goals']).toEqual({
      goals: [{ type: 'ranged_attack', targets: ['minecraft:player'] }],
    });
    expect(screen.queryByTestId('entity-ranged-add-goal')).toBeNull();
    fireEvent.click(screen.getByTestId('entity-ranged-enabled'));
    expect(components(data())['msm:ranged_attack']).toBeUndefined();
    fireEvent.click(screen.getByTestId('entity-ranged-enabled'));
    expect(components(data())['msm:ranged_attack']).toMatchObject({ projectile: 'demo:star' });
  });

  it('edits taming and breeding, and notes the animal base', () => {
    const { data } = renderStack(BASE);
    expect(screen.getByTestId('entity-taming-needs-animal')).toBeTruthy();
    fireEvent.change(screen.getByTestId('entity-kind'), { target: { value: 'pet' } });
    expect(screen.queryByTestId('entity-taming-needs-animal')).toBeNull();
    fireEvent.click(screen.getByTestId('entity-tameable'));
    fireEvent.change(screen.getByTestId('entity-taming-chance'), { target: { value: '0.5' } });
    fireEvent.click(screen.getByTestId('entity-taming-sit'));
    fireEvent.change(screen.getByTestId('entity-follow-start'), { target: { value: '12' } });
    expect(components(data())['msm:tameable']).toEqual({
      items: ['minecraft:bone'],
      chance: 0.5,
      sit: false,
      follow: { start_distance: 12 },
    });
    fireEvent.change(screen.getByTestId('entity-follow-start'), { target: { value: '' } });
    expect(components(data())['msm:tameable']).not.toHaveProperty('follow');

    fireEvent.click(screen.getByTestId('entity-breedable'));
    fireEvent.change(screen.getByTestId('entity-baby-scale'), { target: { value: '0.4' } });
    fireEvent.click(screen.getByTestId('entity-breeding-follow-parents'));
    expect(components(data())['msm:breedable']).toEqual({
      items: ['minecraft:wheat'],
      baby_scale: 0.4,
      follow_parents: false,
    });
    const food = screen.getByTestId('entity-breeding');
    fireEvent.change(within(food).getByLabelText('New entry in Breeding food'), {
      target: { value: 'minecraft:carrot' },
    });
    fireEvent.click(within(food).getByRole('button', { name: 'Add to Breeding food' }));
    expect(components(data())['msm:breedable']?.items).toEqual([
      'minecraft:wheat',
      'minecraft:carrot',
    ]);
  });

  it('edits riding with the saddle bone from the model', () => {
    const { data } = renderStack(BASE);
    fireEvent.click(screen.getByTestId('entity-rideable'));
    expect(components(data())['msm:rideable']).toEqual({ saddle_bone: 'saddle' });
    expect(
      [...(screen.getByTestId('entity-riding-saddle-bone') as HTMLSelectElement).options].map(
        (option) => option.value,
      ),
    ).toEqual(['', 'body', 'saddle']);
    fireEvent.change(screen.getByTestId('entity-riding-controlled-by'), {
      target: { value: 'owner' },
    });
    expect(screen.getByTestId('entity-riding-needs-taming')).toBeTruthy();
    fireEvent.change(screen.getByTestId('entity-riding-jump'), { target: { value: '0.7' } });
    fireEvent.click(screen.getByTestId('entity-riding-offset-enabled'));
    fireEvent.change(screen.getByTestId('entity-riding-offset-y'), { target: { value: '1.4' } });
    expect(components(data())['msm:rideable']).toEqual({
      saddle_bone: 'saddle',
      controlled_by: 'owner',
      jump: 0.7,
      rider_offset: [0, 1.4, 0],
    });
    fireEvent.click(screen.getByTestId('entity-riding-saddle'));
    expect(screen.queryByTestId('entity-riding-saddle-bone')).toBeNull();
    expect(components(data())['msm:rideable']).toMatchObject({ saddle: false });
  });

  it('adds, edits and removes variants', () => {
    const { data } = renderStack(BASE);
    fireEvent.click(screen.getByTestId('entity-variants-enabled'));
    expect(components(data())['msm:variants']).toEqual({
      variants: [{ id: 'variant_1', texture: 'demo:entity/gloom' }],
    });
    fireEvent.click(screen.getByTestId('entity-add-variant'));
    fireEvent.change(screen.getByTestId('entity-variant-1-texture'), {
      target: { value: 'demo:entity/gloom_red' },
    });
    fireEvent.change(screen.getByTestId('entity-variant-1-id'), { target: { value: 'red' } });
    fireEvent.change(screen.getByTestId('entity-variants-choose'), { target: { value: 'biome' } });
    const second = screen.getByTestId('entity-variant-1');
    fireEvent.change(within(second).getByLabelText('New entry in Variant 2 biomes'), {
      target: { value: 'minecraft:desert' },
    });
    fireEvent.click(within(second).getByRole('button', { name: 'Add to Variant 2 biomes' }));
    expect(components(data())['msm:variants']).toEqual({
      choose: 'biome',
      variants: [
        { id: 'variant_1', texture: 'demo:entity/gloom' },
        { id: 'red', texture: 'demo:entity/gloom_red', biomes: ['minecraft:desert'] },
      ],
    });
    fireEvent.click(screen.getByRole('button', { name: 'Remove Variant 1' }));
    expect(components(data())['msm:variants']?.variants).toEqual([
      { id: 'red', texture: 'demo:entity/gloom_red', biomes: ['minecraft:desert'] },
    ]);
    expect(
      (screen.getByRole('button', { name: 'Remove Variant 1' }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it('edits the boss bar', () => {
    const { data } = renderStack(BASE);
    fireEvent.click(screen.getByTestId('entity-boss-bar-enabled'));
    expect(components(data())['msm:boss_bar']).toEqual({});
    fireEvent.change(screen.getByTestId('entity-boss-bar-colour'), { target: { value: 'red' } });
    fireEvent.change(screen.getByTestId('entity-boss-bar-overlay'), {
      target: { value: 'notched_10' },
    });
    fireEvent.click(screen.getByTestId('entity-boss-bar-darken'));
    fireEvent.change(screen.getByTestId('entity-boss-bar-range'), { target: { value: '64' } });
    expect(components(data())['msm:boss_bar']).toEqual({
      colour: 'red',
      overlay: 'notched_10',
      darken_sky: true,
      range: 64,
    });
    fireEvent.change(screen.getByTestId('entity-boss-bar-colour'), {
      target: { value: 'purple' },
    });
    expect(components(data())['msm:boss_bar']).not.toHaveProperty('colour');
  });

  it('picks the renderer and the state animations, with a note on the target', () => {
    const { data } = renderStack(BASE);
    expect(screen.getByTestId('entity-renderer-note').textContent).toContain('GeckoLib');
    fireEvent.change(screen.getByTestId('entity-renderer'), { target: { value: 'vanilla' } });
    expect(components(data())['msm:animated_model']?.renderer).toBe('vanilla');
    fireEvent.change(screen.getByTestId('entity-renderer'), { target: { value: 'auto' } });
    expect(components(data())['msm:animated_model']).not.toHaveProperty('renderer');
    for (const name of ['sit', 'fly', 'swim', 'shoot']) {
      expect(screen.getByTestId(`entity-${name}-animation`)).toBeTruthy();
    }
  });

  it('notes the built-in renderer on a target without GeckoLib', () => {
    if (SNAPSHOT === null) return;
    renderStack(BASE, SNAPSHOT.id);
    expect(screen.getByTestId('entity-renderer-note').textContent).toBe(
      rendererNote(undefined, false, SNAPSHOT.mcVersion),
    );
    expect(targetOf(SNAPSHOT.id).entities?.projectileItems).toContain('minecraft:ice_ball');
  });
});

describe('entity preview options', () => {
  const data = {
    components: {
      'msm:animated_model': { model: 'demo:entity/gloom', texture: 'demo:entity/gloom', scale: 2 },
      'msm:variants': { variants: [{ id: 'red', texture: 'demo:entity/gloom_red' }] },
      'msm:breedable': { items: ['minecraft:wheat'], baby_scale: 0.25 },
    },
  };
  const subject = { previewKind: 'entity' as const, id: 'demo:gloom', data };

  it('lists the variants and baby size', () => {
    expect(entityPreviewChoices(data)).toEqual({
      variants: [{ id: 'red', texture: 'demo:entity/gloom_red' }],
      babyScale: 0.25,
    });
    expect(entityPreviewChoices({ components: { 'msm:breedable': {} } }).babyScale).toBe(0.5);
    expect(entityPreviewChoices({})).toEqual({ variants: [], babyScale: null });
  });

  it('draws the chosen variant texture and the baby size', () => {
    const project = projectOf();
    expect(resolveGeoScene(project, subject)).toMatchObject({
      ok: true,
      textureId: 'demo:entity/gloom',
      scale: 2,
    });
    expect(resolveGeoScene(project, subject, { variant: 'red', baby: true })).toMatchObject({
      ok: true,
      textureId: 'demo:entity/gloom_red',
      scale: 0.5,
    });
    expect(resolveGeoScene(project, subject, { variant: 'gone' })).toMatchObject({
      textureId: 'demo:entity/gloom',
    });
  });

  it('switches variant and baby', () => {
    const onChange = vi.fn();
    render(
      <EntityPreviewOptions choices={entityPreviewChoices(data)} value={{}} onChange={onChange} />,
    );
    fireEvent.change(screen.getByLabelText('Variant'), { target: { value: 'red' } });
    expect(onChange).toHaveBeenLastCalledWith({ variant: 'red' });
    fireEvent.click(screen.getByLabelText('Show as a baby'));
    expect(onChange).toHaveBeenLastCalledWith({ baby: true });
    cleanup();
    const { container } = render(
      <EntityPreviewOptions choices={entityPreviewChoices({})} value={{}} onChange={onChange} />,
    );
    expect(container.innerHTML).toBe('');
  });
});

describe('jar dialog GeckoLib note by renderer', () => {
  const entityWith = (renderer?: string) =>
    element('demo:gloom', 'msm:entity', {
      components: {
        'msm:animated_model': renderer === undefined ? {} : { renderer },
      },
    });
  const projectWith = (...elements: Element[]): Project => ({
    ...projectOf(),
    namespaces: [{ name: 'demo', elements, assets: [] }],
  });

  it('needs GeckoLib for geckolib, and for auto only on a target with GeckoLib', () => {
    const withGeckolib = { geckolib: {} };
    expect(projectNeedsGeckolib(projectWith(entityWith()), withGeckolib)).toBe(true);
    expect(projectNeedsGeckolib(projectWith(entityWith()), {})).toBe(false);
    expect(projectNeedsGeckolib(projectWith(entityWith('geckolib')), {})).toBe(true);
    expect(projectNeedsGeckolib(projectWith(entityWith('vanilla')), withGeckolib)).toBe(false);
    expect(projectNeedsGeckolib(projectWith(), withGeckolib)).toBe(false);
    expect(projectNeedsGeckolib(null, withGeckolib)).toBe(false);
  });

  it('shows the built-in renderer note when no entity needs GeckoLib', () => {
    render(
      <ExportFabricJarDialog
        options={[]}
        hasEntities
        needsGeckolib={false}
        onExport={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByTestId('fabric-jar-vanilla-renderer-note').textContent).toBe(
      FABRIC_JAR_VANILLA_RENDERER_NOTE,
    );
    expect(screen.queryByTestId('fabric-jar-geckolib-note')).toBeNull();
    cleanup();
    render(
      <ExportFabricJarDialog
        options={[]}
        hasEntities
        needsGeckolib
        onExport={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByTestId('fabric-jar-geckolib-note').textContent).toBe(
      FABRIC_JAR_GECKOLIB_NOTE,
    );
  });
});
