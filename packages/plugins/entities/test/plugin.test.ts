import { API_VERSION, type ElementKind, type Json } from '@msm/plugin-api';
import { MSM_SCHEMA_REFS } from '@msm/schemas';
import { builtInTargets, type TargetBundle } from '@msm/targets';
import { describe, expect, it } from 'vitest';
import plugin, {
  DEFINITION_FORMAT,
  descriptionKey,
  EntitiesLoweringError,
  entitiesKinds,
  entitiesTemplates,
  entitiesValidators,
  entityDefinition,
  entityKind,
  hasSpawnEgg,
  lowerEntity,
  SPAWN_EGG_PARENT_MODEL,
  spawnEggPath,
  splitResourceLocation,
} from '../src/index';
import { blockingProblems, element, indexesFor } from './support';

const kinds = (): ElementKind[] => plugin.contributes.elementKinds ?? [];
const firstBundle = builtInTargets[0] as TargetBundle;
const firstTarget = firstBundle.target;

const animated = { model: 'demo:entity/x', texture: 'demo:entity/x' };
const minimal = (extra: Record<string, unknown> = {}): Json =>
  ({
    format: 1,
    category: 'creature',
    size: { width: 1, height: 1 },
    components: { 'msm:animated_model': animated },
    ...extra,
  }) as Json;

describe('@msm/plugin-entities', () => {
  it('declares its id and API range', () => {
    expect(plugin.id).toBe('msm.entities');
    expect(plugin.apiVersion).toBe('^0.7.0');
    const [major, minor] = API_VERSION.split('.');
    expect(plugin.apiVersion).toBe(`^${major}.${minor}.0`);
    expect(Object.isFrozen(plugin)).toBe(true);
  });

  it('contributes msm:entity with its schema, folder, registry and preview', () => {
    expect(kinds().map((kind) => kind.id)).toEqual(['msm:entity']);
    expect(entitiesKinds).toEqual([entityKind]);
    expect([
      entityKind.schema,
      entityKind.folder,
      entityKind.registry,
      entityKind.previewKind,
      entityKind.hiddenPaths,
    ]).toEqual([MSM_SCHEMA_REFS.entity, 'entity', 'entity_type', 'entity', ['/format']]);
  });

  it('has the brief default data, valid against the element schema', async () => {
    expect(entityKind.defaultData).toEqual({
      format: 1,
      category: 'creature',
      size: { width: 0.6, height: 1.8 },
      spawn_egg: {},
      components: {
        'msm:health': { max: 20 },
        'msm:movement': { speed: 0.25 },
        'msm:ai_goals': {
          goals: [{ type: 'wander' }, { type: 'look_at_player' }, { type: 'look_around' }],
        },
        'msm:animated_model': { model: '', animations: '', texture: '' },
      },
    });
    const indexes = await indexesFor(firstBundle);
    expect(blockingProblems(indexes, entityKind.schema, entityKind.defaultData as Json)).toEqual(
      [],
    );
  });

  it('contributes its templates and validators', () => {
    expect(plugin.contributes.elementTemplates?.map((t) => t.id)).toEqual(
      entitiesTemplates.map((t) => t.id),
    );
    expect(plugin.contributes.validators?.map((v) => v.id)).toEqual([
      'msm.entities.unknown-event',
      'msm.entities.event-cycle',
      'msm.entities.unknown-model',
      'msm.entities.unknown-animation-name',
      'msm.entities.textures',
      'msm.entities.group-range',
      'msm.entities.goal-needs-targets',
      'msm.entities.melee-without-attack',
    ]);
    expect(entitiesValidators).toHaveLength(8);
  });

  it('rejects unsafe ids and non-object data', () => {
    expect(() => splitResourceLocation('Bad:Id')).toThrow(EntitiesLoweringError);
    expect(() => splitResourceLocation('demo:a/../b')).toThrow(EntitiesLoweringError);
    expect(() => splitResourceLocation('nocolon')).toThrow(EntitiesLoweringError);
    expect(() => lowerEntity(element('msm:entity', 'demo:x', [1]), firstTarget)).toThrow(
      EntitiesLoweringError,
    );
  });

  it('derives keys and egg paths', () => {
    expect(descriptionKey('entity', 'demo', 'mobs/moth')).toBe('entity.demo.mobs.moth');
    expect(spawnEggPath('mobs/moth')).toBe('mobs/moth_spawn_egg');
    expect(hasSpawnEgg({})).toBe(true);
    expect(hasSpawnEgg({ spawn_egg: {} })).toBe(true);
    expect(hasSpawnEgg({ spawn_egg: false })).toBe(false);
  });

  it('strips the editor-only fields and sets the format', () => {
    const data = minimal({
      format: 7,
      display_name: 'X',
      spawn_egg: {
        creative_tab: 'minecraft:spawn_eggs',
        texture: 'demo:item/x',
        display_name: 'E',
      },
      loot_table: 'demo:entities/x',
    });
    const created = element('msm:entity', 'demo:x', data);
    const definition = entityDefinition(created);
    expect(definition.format).toBe(DEFINITION_FORMAT);
    expect(definition.display_name).toBeUndefined();
    expect(definition.spawn_egg).toEqual({ creative_tab: 'minecraft:spawn_eggs' });
    expect(definition.loot_table).toBe('demo:entities/x');
    // The element data is not mutated.
    expect((created.data as { spawn_egg: { texture: string } }).spawn_egg.texture).toBe(
      'demo:item/x',
    );
  });

  it('writes the definition only when there is nothing else to lower', () => {
    const files = lowerEntity(element('msm:entity', 'demo:x', minimal()), firstTarget);
    expect(files.map((file) => [file.path, file.layer, file.schema])).toEqual([
      ['msm/demo/entity/x.json', 'msm', MSM_SCHEMA_REFS.entityDefinition],
    ]);
  });

  it('writes language keys, defaulting the egg name from the display name', () => {
    const lang = (data: Json) =>
      lowerEntity(element('msm:entity', 'demo:x', data), firstTarget).find((file) =>
        file.path.endsWith('/en_us.json'),
      );
    expect(lang(minimal({ display_name: 'Ex' }))?.contents).toEqual({
      'entity.demo.x': 'Ex',
      'item.demo.x_spawn_egg': 'Ex Spawn Egg',
    });
    expect(
      lang(minimal({ display_name: 'Ex', spawn_egg: { display_name: 'Egg' } }))?.contents,
    ).toEqual({
      'entity.demo.x': 'Ex',
      'item.demo.x_spawn_egg': 'Egg',
    });
    expect(lang(minimal({ display_name: 'Ex', spawn_egg: false }))?.contents).toEqual({
      'entity.demo.x': 'Ex',
    });
    expect(lang(minimal({ spawn_egg: { display_name: 'Egg' } }))?.contents).toEqual({
      'item.demo.x_spawn_egg': 'Egg',
    });
    expect(lang(minimal({ spawn_egg: false, display_name: '' }))).toBeUndefined();
    expect(lang(minimal({ display_name: 'Ex' }))?.merge).toBe('object');
  });

  it('writes the egg item definition and model only with an egg texture', () => {
    const files = lowerEntity(
      element('msm:entity', 'demo:x', minimal({ spawn_egg: { texture: 'demo:item/x_egg' } })),
      firstTarget,
    );
    const { item_definition: items, model: models } = firstTarget.folders.resource;
    expect(files.slice(1)).toEqual([
      {
        path: `assets/demo/${items}/x_spawn_egg.json`,
        contents: { model: { type: 'minecraft:model', model: 'demo:item/x_spawn_egg' } },
        layer: 'resourcepack',
        schema: '::java::assets::item_definition::ItemDefinition',
      },
      {
        path: `assets/demo/${models}/item/x_spawn_egg.json`,
        contents: { parent: SPAWN_EGG_PARENT_MODEL, textures: { layer0: 'demo:item/x_egg' } },
        layer: 'resourcepack',
        schema: 'resource:model',
      },
    ]);
    expect(SPAWN_EGG_PARENT_MODEL).toBe('minecraft:item/generated');
    const noEgg = lowerEntity(
      element('msm:entity', 'demo:x', minimal({ spawn_egg: false })),
      firstTarget,
    );
    expect(noEgg).toHaveLength(1);
  });

  it('never generates a loot table', () => {
    for (const bundle of builtInTargets) {
      const files = lowerEntity(
        element(
          'msm:entity',
          'demo:x',
          minimal({ loot_table: 'demo:entities/x', display_name: 'X' }),
        ),
        bundle.target,
      );
      expect(files.some((file) => file.path.startsWith('data/'))).toBe(false);
    }
  });
});
