/**
 * The vehicle templates (ADR 0091 D3): ids, titles and category; pure data with only vanilla ids
 * and ids derived from the element's own id; and, per target, zero problems (schema, every
 * validator of the plugin, lowered files) once the project holds the template's starter
 * geometry and pictures, with goldens of the lowered files
 * (`fixtures/<target id>/expected/templates/<id>.json`).
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  ElementTemplate,
  Json,
  JsonObject,
  ResourceLocation,
  TargetFacts,
  TemplateContext,
} from '@msm/plugin-api';
import { MSM_SCHEMA_REFS } from '@msm/schemas';
import { builtInTargets, type TargetBundle } from '@msm/targets';
import { describe, expect, it } from 'vitest';
import plugin, {
  VEHICLE_SHAPES,
  VEHICLE_TEMPLATE_SHAPES,
  type VehicleShape,
  vehicleGeometry,
  vehicleKind,
  vehicleTemplates,
} from '../src/index';
import { blockingProblems, element, indexesFor, sortedJson } from './support';
import { ownIds, registryWith } from './vehicle-support';

const UPDATE = process.env.UPDATE_GOLDENS === '1';

const {
  javaProject: _javaProject,
  migrateFrom: _migrateFrom,
  ...FIRST_TARGET
} = (builtInTargets[0] as TargetBundle).target;

const IDS = [
  'msm_vehicle_go_kart',
  'msm_vehicle_car',
  'msm_vehicle_tank',
  'msm_vehicle_biplane',
  'msm_vehicle_helicopter',
  'msm_vehicle_motorboat',
  'msm_vehicle_raft',
  'msm_vehicle_hovercraft',
];

function contextFor(id: ResourceLocation, target: TargetFacts = FIRST_TARGET): TemplateContext {
  const colon = id.indexOf(':');
  return {
    id,
    namespace: id.slice(0, colon),
    path: id.slice(colon + 1),
    projectNamespace: 'demo',
    namespaces: ['demo'],
    kindDefault: structuredClone(vehicleKind.defaultData) as Json,
    target,
  };
}

const templateOf = (id: string): ElementTemplate =>
  vehicleTemplates.find((entry) => entry.id === id) as ElementTemplate;

describe('vehicle templates', () => {
  it('has the eight ids in picker order, after the mob templates', () => {
    expect(vehicleTemplates.map((template) => template.id)).toEqual(IDS);
    expect(plugin.contributes.elementTemplates?.slice(-8).map((template) => template.id)).toEqual(
      IDS,
    );
    expect(Object.keys(VEHICLE_TEMPLATE_SHAPES)).toEqual(IDS);
    expect(Object.values(VEHICLE_TEMPLATE_SHAPES)).toEqual([...VEHICLE_SHAPES]);
  });

  it('are msm:vehicle templates in "Vehicles" with titles and a model note', () => {
    expect(vehicleTemplates.map((template) => template.title)).toEqual([
      'Go-kart',
      'Car',
      'Tank',
      'Biplane',
      'Helicopter',
      'Motorboat',
      'Raft',
      'Hovercraft',
    ]);
    for (const template of vehicleTemplates) {
      expect(template.kind, template.id).toBe('msm:vehicle');
      expect(template.category, template.id).toBe('Vehicles');
      expect(template.description, template.id).toContain('reported missing');
      expect(template.supports, template.id).toBeUndefined();
    }
  });

  it('cover the five modes, and the tank has a turret and two weapons', async () => {
    const modes = new Set<string>();
    for (const template of vehicleTemplates) {
      const data = (await template.data(contextFor('demo:sample'))) as {
        movement: { mode: string };
      };
      modes.add(data.movement.mode);
    }
    expect([...modes].sort()).toEqual(['air', 'amphibious', 'ground', 'hover', 'water']);
    const tank = (await templateOf('msm_vehicle_tank').data(contextFor('demo:sample'))) as {
      turret: JsonObject;
      weapons: JsonObject[];
      health: JsonObject;
    };
    expect(tank.turret).toMatchObject({ bone: 'turret', pitch_bone: 'barrel' });
    expect(tank.weapons.map((weapon) => weapon.key)).toEqual(['fire', 'second']);
    expect(tank.health.max).toBe(120);
  });

  it('return fresh data on every call and never mutate the context', async () => {
    for (const template of vehicleTemplates) {
      const context = contextFor('demo:sample');
      const before = structuredClone(context);
      const first = await template.data(context);
      const second = await template.data(context);
      expect(second, template.id).toEqual(first);
      expect(second).not.toBe(first);
      expect(context, template.id).toEqual(before);
    }
  });

  it('use only vanilla ids or ids derived from the new element id', async () => {
    for (const template of vehicleTemplates) {
      const context = { ...contextFor('zz:own'), projectNamespace: 'zz' };
      const text = JSON.stringify(await template.data(context)).replaceAll(
        /"zz:(entity|item)\/own(_[a-z_]+)?"/g,
        '',
      );
      expect(text, template.id).not.toMatch(
        /"(?!minecraft:|#minecraft:)[a-z0-9_.-]+:[a-z0-9_./-]+"/,
      );
    }
  });

  it('derive the model, paints and item picture from a nested id', async () => {
    const data = (await templateOf('msm_vehicle_car').data(contextFor('mod:cars/racer'))) as {
      display_name: string;
      model: JsonObject;
      item: JsonObject;
    };
    expect(data.display_name).toBe('Racer');
    expect(data.model).toMatchObject({
      geometry: 'mod:entity/cars/racer',
      texture: 'mod:entity/cars/racer',
    });
    expect((data.model.paints as JsonObject[]).map((paint) => paint.texture)).toEqual([
      'mod:entity/cars/racer_red',
      'mod:entity/cars/racer_blue',
    ]);
    expect(data.item).toEqual({ texture: 'mod:item/cars/racer' });
  });

  it('starter geometries have whole-number boxes, unique bones and no "root" bone', () => {
    for (const shape of VEHICLE_SHAPES) {
      const model = vehicleGeometry(shape, shape) as {
        'minecraft:geometry': {
          description: { identifier: string; texture_width: number; texture_height: number };
          bones: { name: string; cubes: { size: number[]; uv: number[] }[] }[];
        }[];
      };
      const [geometry] = model['minecraft:geometry'];
      expect(geometry?.description.identifier).toBe(`geometry.${shape}`);
      const names = geometry?.bones.map((bone) => bone.name) ?? [];
      expect(new Set(names).size, shape).toBe(names.length);
      expect(names, shape).not.toContain('root');
      const size = geometry?.description.texture_width as number;
      expect(geometry?.description.texture_height).toBe(size);
      for (const bone of geometry?.bones ?? []) {
        for (const cube of bone.cubes) {
          for (const value of [...cube.size, ...cube.uv]) {
            expect(Number.isInteger(value), `${shape} ${bone.name}`).toBe(true);
          }
          const [w, h, d] = cube.size as [number, number, number];
          const [u, v] = cube.uv as [number, number];
          expect(u + 2 * (w + d), `${shape} ${bone.name}`).toBeLessThanOrEqual(size);
          expect(v + d + h, `${shape} ${bone.name}`).toBeLessThanOrEqual(size);
        }
      }
    }
  });
});

describe.each(builtInTargets.map((bundle) => [bundle.target.id, bundle] as const))(
  'vehicle templates for %s',
  (targetId, bundle) => {
    it.each(IDS.map((id) => [id] as const))(
      '%s has zero problems with its geometry and pictures, and lowers cleanly',
      async (id) => {
        const template = templateOf(id);
        const context = contextFor('demo:sample', bundle.target);
        const data = await template.data(context);
        const created = element(vehicleKind.id, context.id, data);
        const shape = VEHICLE_TEMPLATE_SHAPES[id] as VehicleShape;
        const geometry = element(
          'msm:geo_model',
          `${context.namespace}:entity/${context.path}`,
          vehicleGeometry(shape, context.path),
        );
        const base = await indexesFor(bundle);
        const indexes = { ...base, registries: registryWith(base, ownIds(created)) };
        expect(blockingProblems(indexes, vehicleKind.schema, data)).toEqual([]);
        expect(blockingProblems(indexes, MSM_SCHEMA_REFS.geoModel, geometry.data)).toEqual([]);
        const problems = (
          await Promise.all(
            (plugin.contributes.validators ?? []).map((validator) =>
              validator.validate({
                elements: [created, geometry],
                target: bundle.target,
                registry: indexes.registries,
              }),
            ),
          )
        ).flat();
        expect(problems).toEqual([]);
        // Without its geometry, only the model is reported.
        const alone = (
          await Promise.all(
            (plugin.contributes.validators ?? []).map((validator) =>
              validator.validate({
                elements: [created],
                target: bundle.target,
                registry: indexes.registries,
              }),
            ),
          )
        ).flat();
        expect(alone.map((problem) => problem.code)).toEqual(['vehicles.unknown-geometry']);
        const files = await vehicleKind.lower(created, bundle.target);
        for (const file of files) {
          if (file.schema === undefined) continue;
          expect(blockingProblems(indexes, file.schema, file.contents as Json), file.path).toEqual(
            [],
          );
        }
        const actual = sortedJson(
          files.map((file) => ({
            contents: file.contents,
            layer: file.layer,
            merge: file.merge,
            path: file.path,
          })),
        );
        const url = new URL(
          `./fixtures/${targetId}/expected/templates/${id}.json`,
          import.meta.url,
        );
        if (UPDATE) {
          await mkdir(dirname(fileURLToPath(url)), { recursive: true });
          await writeFile(url, actual);
        }
        expect(actual).toBe(await readFile(url, 'utf8'));
      },
    );
  },
);
