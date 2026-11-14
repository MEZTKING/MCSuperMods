/**
 * Potions (ADR 0063 D8): `ModPotions.java` registers one vanilla `Potion` per definition of
 * `JavaProjectInput.potions` (`msm/<namespace>/potion/*.json`, ADR 0063 D2) under its own id in
 * `BuiltInRegistries.POTION`, mirroring the runtime's `PotionDefinition` and
 * `MsmRegistrar.registerPotion`: after the status effects (a potion names them) and before the
 * blocks and items; `new Potion(name, effects...)` with `name` when given, else
 * `<namespace>.<path>`; each effect a `MobEffectInstance` with vanilla's defaults (level I, not
 * ambient, particles and icon shown). Where the runtime skips a potion naming an unknown effect
 * with an error, the generator fails: an ejected project names only vanilla effects and its
 * own. Brewing recipes and names are data files already. A project without potions writes no
 * `ModPotions`. Minecraft 26.3, Mojang names.
 *
 * @packageDocumentation
 */

import type { DefinitionInput } from '@msm/plugin-api';
import { classPath, type GenerationContext } from './context';
import { indent, JavaFile, javaInt, javaString } from './java';
import { constantName, NameTable, splitId } from './names';
import { checkFormat, readDefinition } from './read';

/**
 * The vanilla `mob_effect` registry of 26.3 (paths in the `minecraft` namespace), from the
 * vendored `vendor/mcmeta/registries.json`; a test keeps the two equal.
 */
export const VANILLA_MOB_EFFECTS: readonly string[] = [
  'absorption',
  'bad_omen',
  'blindness',
  'breath_of_the_nautilus',
  'conduit_power',
  'darkness',
  'dolphins_grace',
  'fire_resistance',
  'glowing',
  'haste',
  'health_boost',
  'hero_of_the_village',
  'hunger',
  'infested',
  'instant_damage',
  'instant_health',
  'invisibility',
  'jump_boost',
  'levitation',
  'luck',
  'mining_fatigue',
  'nausea',
  'night_vision',
  'oozing',
  'poison',
  'raid_omen',
  'regeneration',
  'resistance',
  'saturation',
  'slow_falling',
  'slowness',
  'speed',
  'strength',
  'trial_omen',
  'unluck',
  'water_breathing',
  'weakness',
  'weaving',
  'wind_charged',
  'wither',
];

const POTION_KEYS = ['format', 'name', 'effects'];
const EFFECT_KEYS = ['id', 'duration_ticks', 'amplifier', 'ambient', 'show_particles', 'show_icon'];

/** The most effects one potion may carry (`PotionDefinition.MAX_EFFECTS`). */
const MAX_EFFECTS = 8;

/** A resource location as `Identifier` parses it (the namespace is optional). */
const ID = /^([a-z0-9_.-]+:)?[a-z0-9_./-]+$/;

interface EffectSpec {
  /** Namespaced. */
  readonly id: string;
  readonly duration: number;
  readonly amplifier: number;
  readonly ambient: boolean;
  readonly showParticles: boolean;
  readonly showIcon: boolean;
}

interface PotionSpec {
  readonly input: DefinitionInput;
  readonly name: string;
  readonly effects: readonly EffectSpec[];
}

function readPotion(input: DefinitionInput, knownEffects: ReadonlySet<string>): PotionSpec {
  const reader = readDefinition(input);
  reader.onlyKeys(POTION_KEYS, 'top-level key');
  checkFormat(reader);
  if (!reader.has('effects')) reader.fail('effects is missing');
  const entries = reader.objects('effects');
  if (entries.length < 1 || entries.length > MAX_EFFECTS) {
    reader.fail(`effects must hold 1 to ${MAX_EFFECTS} effects, not ${entries.length}`);
  }
  const effects = entries.map((effect): EffectSpec => {
    effect.onlyKeys(EFFECT_KEYS, 'effect field');
    const raw = effect.requiredString('id');
    if (!ID.test(raw)) effect.fail(`id '${raw}' is not a mob effect id`);
    const id = raw.includes(':') ? raw : `minecraft:${raw}`;
    if (!knownEffects.has(id)) {
      effect.fail(
        `unknown mob effect '${id}' (neither a vanilla effect nor one of the project's); msm_runtime skips this potion`,
      );
    }
    const duration = effect.requiredInteger('duration_ticks');
    if (duration < 1) effect.fail('duration_ticks must be at least 1');
    const amplifier = effect.integer('amplifier', 0);
    if (amplifier < 0 || amplifier > 255) effect.fail('amplifier must be 0 to 255');
    return {
      id,
      duration,
      amplifier,
      ambient: effect.boolean('ambient', false),
      showParticles: effect.boolean('show_particles', true),
      showIcon: effect.boolean('show_icon', true),
    };
  });
  const { namespace, path } = splitId(input.id);
  return { input, name: reader.optionalString('name') ?? `${namespace}.${path}`, effects };
}

/**
 * Generates `ModPotions.java`; returns nothing when the project has no potions.
 *
 * @returns The simple name of the registration class, or `undefined`.
 */
export function generatePotions(context: GenerationContext): string | undefined {
  const potions = context.input.potions ?? [];
  if (potions.length === 0) return undefined;
  const knownEffects = new Set([
    ...VANILLA_MOB_EFFECTS.map((path) => `minecraft:${path}`),
    ...(context.input.effects ?? []).map((effect) => {
      const { namespace, path } = splitId(effect.id);
      return `${namespace}:${path}`;
    }),
  ]);
  const specs = potions.map((potion) => readPotion(potion, knownEffects));
  const file = new JavaFile(
    context.input.javaPackage,
    'the msm/<namespace>/potion/*.json definitions',
  );
  const registry = file.use('net.minecraft.core.Registry');
  const holder = file.use('net.minecraft.core.Holder');
  const builtIn = file.use('net.minecraft.core.registries.BuiltInRegistries');
  const registries = file.use('net.minecraft.core.registries.Registries');
  const identifier = file.use('net.minecraft.resources.Identifier');
  const resourceKey = file.use('net.minecraft.resources.ResourceKey');
  const mobEffect = file.use('net.minecraft.world.effect.MobEffect');
  const instance = file.use('net.minecraft.world.effect.MobEffectInstance');
  const potion = file.use('net.minecraft.world.item.alchemy.Potion');
  const fields = new NameTable();
  const body: string[] = [];
  for (const spec of specs) {
    const field = fields.take(constantName(splitId(spec.input.id).path));
    const effects = spec.effects.map((effect, index) => {
      const args = [
        `effect(${javaString(effect.id)})`,
        javaInt(effect.duration),
        javaInt(effect.amplifier),
      ];
      if (effect.ambient || !effect.showParticles || !effect.showIcon) {
        args.push(String(effect.ambient), String(effect.showParticles), String(effect.showIcon));
      }
      const end = index === spec.effects.length - 1 ? ');' : ',';
      return `        new ${instance}(${args.join(', ')})${end}`;
    });
    body.push(
      '',
      `/** {@code ${spec.input.id}} (${spec.input.path}). */`,
      `public static final ${holder}<${potion}> ${field} = register(${javaString(spec.input.id)}, ${javaString(spec.name)},`,
      ...effects,
    );
  }
  const lines = [
    '/**',
    ' * The potions, registered when the class loads: after the status effects (which they name) and before the blocks and',
    ' * items. Each is a vanilla Potion under its own id; brewing recipes and names are data files.',
    ' */',
    'public final class ModPotions {',
    ...indent(body.slice(1)),
    '',
    '    private ModPotions() {}',
    '',
    '    /** Loads the class, registering every potion. */',
    '    public static void register() {}',
    '',
    `    private static ${holder}<${potion}> register(String id, String name, ${instance}... effects) {`,
    `        return ${registry}.registerForHolder(${builtIn}.POTION, ${resourceKey}.create(${registries}.POTION, ${identifier}.parse(id)),`,
    `                new ${potion}(name, effects));`,
    '    }',
    '',
    '    /** A registered mob effect: vanilla, or one of ModEffects (registered before this class loads). */',
    `    private static ${holder}<${mobEffect}> effect(String id) {`,
    `        return ${builtIn}.MOB_EFFECT.get(${identifier}.parse(id))`,
    '                .orElseThrow(() -> new IllegalStateException("unknown mob effect " + id));',
    '    }',
    '}',
  ];
  context.files.push({ path: classPath(context, '', 'ModPotions'), contents: file.render(lines) });
  return 'ModPotions';
}
