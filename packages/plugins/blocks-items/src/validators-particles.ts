/**
 * `blocks-items.*` project validators of particles (ADR 0080 D7, D10): the `msm:particle` kind,
 * the resource pack's `minecraft:particle` descriptions, and every field of this plugin's
 * elements that names a particle. They read the element data, the target's particle facts
 * (`target.particles`, since plugin API 1.14.0) and the registry index (vanilla plus project
 * ids).
 *
 * - `blocks-items.particle-lifetime-range` (error): a `lifetime` range whose `min` is above its
 *   `max`; the runtime refuses the definition and registers nothing.
 * - `blocks-items.particle-frame-ticks-unused` (warning): `frame_ticks` without `animation`
 *   `loop`, the only animation that reads it.
 * - `blocks-items.particle-description-clash` (error): a `minecraft:particle` element with the
 *   id of an `msm:particle`, so both write `assets/<ns>/particles/<path>.json`. Project element
 *   ids are unique across kinds, so the host's loader already refuses the second file of a
 *   saved project; this catches projects built in memory (imports, templates, flows).
 * - `blocks-items.particle-needs-options` (error): a plain id of a vanilla particle type that
 *   takes options (the target's `particles.withOptions`, such as `minecraft:dust`) where the
 *   game needs a type without options: `spawn_particle` in a block's, item's or effect's events,
 *   `msm:ambient_particles` on a block, an effect's `particle`, a leaves block's
 *   `falling_particle` and a portal's `particles.type` (except `minecraft:dust` with a
 *   `particles.color`, which the portal turns into coloured dust). The runtime refuses such a
 *   field at load. `spawn_particle` in an entity's events is left to the schema's id check and
 *   the runtime's load error, as `light_portal` is.
 * - `blocks-items.particle-options-unknown-type` (error): an options object (`spawn_particle`,
 *   `msm:ambient_particles`) whose `type` is neither a vanilla particle type of the target nor a
 *   project particle; the runtime cannot decode it and sends nothing.
 * - `blocks-items.particle-options-invalid` (error): an options object whose fields cannot be
 *   right. Validators receive no schema index, so this is a structural check, not a check
 *   against the target's `::java::util::particle::Particle`: a type without options (vanilla
 *   or a project particle) given further fields. The fields of a type that takes options are
 *   decoded by the runtime at server start (limit K11 of the particles plan); a host with a
 *   schema index may validate the object against `::java::util::particle::Particle` itself.
 *
 * `particle-needs-options` and `particle-options-unknown-type` are skipped for a target without
 * particle facts; `particle-options-unknown-type` also when the registry knows no particle
 * types at all. A missing `type` or a value of the wrong JSON type is the schema's problem and
 * not reported again. `msm:ambient_particles` on a portal is `blocks-items.component-not-for-type`
 * of the portal validators (it is not one of `PORTAL_COMPONENTS`).
 */
import type {
  Element,
  Json,
  JsonObject,
  Problem,
  ProjectValidator,
  TargetFacts,
  ValidationRegistry,
} from '@msm/plugin-api';
import { BLOCK_KIND, EFFECT_KIND, ITEM_KIND, PARTICLE_KIND } from './kinds';
import { isRecord } from './lowering/paths';
import { DUST_PARTICLE, isPortalElement } from './validators-portals';

/** Every code the particle validators report. */
export const PARTICLE_PROBLEM_CODES = Object.freeze([
  'blocks-items.particle-lifetime-range',
  'blocks-items.particle-frame-ticks-unused',
  'blocks-items.particle-description-clash',
  'blocks-items.particle-needs-options',
  'blocks-items.particle-options-unknown-type',
  'blocks-items.particle-options-invalid',
] as const);

/** Kind id of particle descriptions, contributed by `@msm/plugin-resourcepack` (ADR 0080 D2). */
export const PARTICLE_DESCRIPTION_KIND = 'minecraft:particle';
/** The block component of ambient particles (ADR 0080 D6). */
export const AMBIENT_PARTICLES_COMPONENT = 'msm:ambient_particles';
/** The action that sends particles (ADR 0080 D5). */
export const SPAWN_PARTICLE_ACTION = 'spawn_particle';

const PARTICLE_TYPE_REGISTRY = 'particle_type';

const token = (key: string): string => key.replaceAll('~', '~0').replaceAll('/', '~1');
const pointer = (...keys: (string | number)[]): string =>
  keys.map((key) => `/${token(String(key))}`).join('');
const dataOf = (element: Element): JsonObject => (isRecord(element.data) ? element.data : {});
const record = (value: Json | undefined): JsonObject | undefined =>
  isRecord(value) ? value : undefined;
const text = (value: Json | undefined): string | undefined =>
  typeof value === 'string' && value.length > 0 ? value : undefined;
const namespaced = (id: string): string => (id.includes(':') ? id : `minecraft:${id}`);

// ---------------------------------------------------------------------------------------------
// The particle kind (ADR 0080 D1, D2)

function lifetimeRanges(particles: readonly Element[]): Problem[] {
  const problems: Problem[] = [];
  for (const element of particles) {
    const lifetime = record(dataOf(element).lifetime);
    const min = lifetime?.min;
    const max = lifetime?.max;
    if (typeof min !== 'number' || typeof max !== 'number' || min <= max) continue;
    problems.push({
      severity: 'error',
      code: 'blocks-items.particle-lifetime-range',
      elementId: element.id,
      path: pointer('lifetime', 'min'),
      message: `The shortest lifetime (${min} ticks) is longer than the longest (${max} ticks), so the game refuses this particle. Swap them, or make them equal for a fixed lifetime.`,
    });
  }
  return problems;
}

function unusedFrameTicks(particles: readonly Element[]): Problem[] {
  const problems: Problem[] = [];
  for (const element of particles) {
    const data = dataOf(element);
    if (data.frame_ticks === undefined || data.animation === 'loop') continue;
    problems.push({
      severity: 'warning',
      code: 'blocks-items.particle-frame-ticks-unused',
      elementId: element.id,
      path: pointer('frame_ticks'),
      message:
        'Ticks per frame only apply when the frames loop, so this value is not used. Set the animation to "loop", or remove it.',
    });
  }
  return problems;
}

function descriptionClashes(elements: readonly Element[]): Problem[] {
  const particles = new Set(
    elements.filter((element) => element.kind === PARTICLE_KIND).map((element) => element.id),
  );
  const problems: Problem[] = [];
  for (const element of elements) {
    if (element.kind !== PARTICLE_DESCRIPTION_KIND || !particles.has(element.id)) continue;
    problems.push({
      severity: 'error',
      code: 'blocks-items.particle-description-clash',
      elementId: element.id,
      path: '',
      message: `"${element.id}" is also a particle of this project, which writes its own picture list there. Edit the particle's pictures instead, or give this description another id.`,
    });
  }
  return problems;
}

// ---------------------------------------------------------------------------------------------
// Fields naming a particle (ADR 0080 D5, D6, D7)

/** One field of an element that names a particle. */
interface ParticleField {
  path: string;
  value: Json;
  /** The field also takes a vanilla options object (`spawn_particle`, ambient particles). */
  objects: boolean;
}

function eventFields(data: JsonObject): ParticleField[] {
  const fields: ParticleField[] = [];
  for (const [name, event] of Object.entries(record(data.events) ?? {})) {
    const actions = record(event)?.actions;
    if (!Array.isArray(actions)) continue;
    actions.forEach((action, index) => {
      const entry = record(action);
      if (entry?.type !== SPAWN_PARTICLE_ACTION || entry.particle === undefined) return;
      fields.push({
        path: pointer('events', name, 'actions', index, 'particle'),
        value: entry.particle,
        objects: true,
      });
    });
  }
  return fields;
}

/**
 * The particle fields of `element` other than a portal's `particles.type` (which has its dust
 * exception; see {@link portalNeedsOptions}).
 */
function particleFields(element: Element): ParticleField[] {
  const data = dataOf(element);
  const fields = eventFields(data);
  if (element.kind === EFFECT_KIND && data.particle !== undefined) {
    fields.push({ path: pointer('particle'), value: data.particle, objects: false });
  }
  if (element.kind === BLOCK_KIND) {
    if (data.falling_particle !== undefined) {
      fields.push({
        path: pointer('falling_particle'),
        value: data.falling_particle,
        objects: false,
      });
    }
    const ambient = record(record(data.components)?.[AMBIENT_PARTICLES_COMPONENT]);
    if (ambient?.particle !== undefined) {
      fields.push({
        path: pointer('components', AMBIENT_PARTICLES_COMPONENT, 'particle'),
        value: ambient.particle,
        objects: true,
      });
    }
  }
  return fields;
}

const OWNERS: ReadonlySet<string> = new Set([BLOCK_KIND, ITEM_KIND, EFFECT_KIND]);

function needsOptionsProblem(
  element: Element,
  path: string,
  id: string,
  objects: boolean,
): Problem {
  const fix = objects
    ? `Write it as an options object with its fields, for example { "type": "${id}", ... }, or pick a particle type without options.`
    : 'Pick a particle type without options, such as a project particle or minecraft:end_rod.';
  return {
    severity: 'error',
    code: 'blocks-items.particle-needs-options',
    elementId: element.id,
    path,
    message: `"${id}" is a particle type that takes options (a colour, a block or an item), so the game refuses it as a plain id here. ${fix}`,
  };
}

function portalNeedsOptions(element: Element, withOptions: ReadonlySet<string>): Problem[] {
  const particles = record(dataOf(element).particles);
  const type = text(particles?.type);
  if (type === undefined || !withOptions.has(namespaced(type))) return [];
  if (namespaced(type) === DUST_PARTICLE && particles?.color !== undefined) return [];
  return [
    {
      severity: 'error',
      code: 'blocks-items.particle-needs-options',
      elementId: element.id,
      path: pointer('particles', 'type'),
      message: `"${type}" is a particle type that takes options, so the portal cannot show it and keeps its own particle. Pick a particle type without options, or remove the type and set a colour for coloured dust.`,
    },
  ];
}

function particleReferences(
  elements: readonly Element[],
  target: TargetFacts,
  registry: ValidationRegistry,
): Problem[] {
  const facts = target.particles;
  if (facts === undefined) return [];
  const withOptions = new Set(facts.withOptions);
  const projectParticles = new Set<string>(
    elements.filter((element) => element.kind === PARTICLE_KIND).map((element) => element.id),
  );
  const checkTypes = registry.ids(PARTICLE_TYPE_REGISTRY).length > 0;
  const known = (id: string): boolean =>
    projectParticles.has(id) || registry.has(PARTICLE_TYPE_REGISTRY, id);
  const problems: Problem[] = [];
  for (const element of elements) {
    if (!OWNERS.has(element.kind)) continue;
    if (isPortalElement(element)) problems.push(...portalNeedsOptions(element, withOptions));
    for (const field of particleFields(element)) {
      if (typeof field.value === 'string') {
        const id = namespaced(field.value);
        if (withOptions.has(id)) {
          problems.push(needsOptionsProblem(element, field.path, field.value, field.objects));
        }
        continue;
      }
      const options = field.objects ? record(field.value) : undefined;
      const type = text(options?.type);
      if (options === undefined || type === undefined) continue;
      const id = namespaced(type);
      if (checkTypes && !known(id)) {
        problems.push({
          severity: 'error',
          code: 'blocks-items.particle-options-unknown-type',
          elementId: element.id,
          path: `${field.path}/type`,
          message: `"${type}" is neither a particle type of the game nor a particle of this project, so nothing can be sent. Pick an existing particle type.`,
        });
        continue;
      }
      if (withOptions.has(id)) continue;
      const extra = Object.keys(options)
        .filter((key) => key !== 'type')
        .sort();
      if (extra.length === 0) continue;
      problems.push({
        severity: 'error',
        code: 'blocks-items.particle-options-invalid',
        elementId: element.id,
        path: `${field.path}${pointer(extra[0] as string)}`,
        message: `"${type}" takes no options, so ${extra.map((key) => `"${key}"`).join(', ')} cannot apply. Remove ${extra.length === 1 ? 'it' : 'them'}, or write the particle as the plain id "${type}".`,
      });
    }
  }
  return problems;
}

// ---------------------------------------------------------------------------------------------

export const particleValidators: readonly ProjectValidator[] = Object.freeze([
  {
    id: 'msm.blocks-items.particles',
    kinds: [PARTICLE_KIND, PARTICLE_DESCRIPTION_KIND],
    validate: ({ elements }) => {
      const particles = elements.filter((element) => element.kind === PARTICLE_KIND);
      return [
        ...lifetimeRanges(particles),
        ...unusedFrameTicks(particles),
        ...descriptionClashes(elements),
      ];
    },
  },
  {
    id: 'msm.blocks-items.particle-references',
    kinds: [BLOCK_KIND, ITEM_KIND, EFFECT_KIND, PARTICLE_KIND],
    validate: ({ elements, target, registry }) => particleReferences(elements, target, registry),
  },
] satisfies ProjectValidator[]);
