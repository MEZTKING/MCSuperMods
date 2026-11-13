/**
 * Status effects (ADR 0055 D10): `ModEffects.java` (one `Holder<MobEffect>` per effect through
 * `Registry.registerForHolder`, registered before blocks and items, which may name them, as the
 * runtime's `MsmRegistrar.registerAll`), the shared `effect/MobEffectBase.java` and one
 * `effect/<Name>Effect.java` per definition, mirroring `MsmMobEffect` and
 * `MsmRegistrar.registerEffect`. Effect events run with the holder as `entity` and `other` (and
 * `player` when it is one), as the runtime's `EventContext.forEffect`. Minecraft 26.3, Mojang
 * names.
 *
 * @packageDocumentation
 */

import type { DefinitionInput } from '@msm/plugin-api';
import {
  type Events,
  eventMethod,
  eventMethods,
  fireCall,
  noteActions,
  readEvents,
} from './actions';
import { classPath, type GenerationContext, packageOf } from './context';
import { identifierExpression, indent, JavaFile, javaFloat, javaInt, javaString } from './java';
import { className, constantName, NameTable, splitId } from './names';
import { checkFormat, type Reader, readDefinition } from './read';
import { mobEffectBaseJava } from './templates/mob-effect-base-java';

const EFFECT_KEYS = [
  'format',
  'category',
  'color',
  'particle',
  'sound',
  'attribute_modifiers',
  'components',
  'events',
];
const EFFECT_COMPONENTS = ['msm:on_start', 'msm:on_tick', 'msm:on_end'];
const CATEGORIES = ['beneficial', 'harmful', 'neutral'] as const;
const OPERATIONS = ['add_value', 'add_multiplied_base', 'add_multiplied_total'] as const;

/** The runtime's default `interval_ticks` of `msm:on_tick`. */
const DEFAULT_INTERVAL = 20;

interface ModifierSpec {
  readonly attribute: string;
  readonly amount: number;
  /** An `AttributeModifier.Operation` constant. */
  readonly operation: string;
}

interface EffectSpec {
  readonly input: DefinitionInput;
  /** A `MobEffectCategory` constant. */
  readonly category: string;
  readonly color: number;
  readonly particle: string | undefined;
  readonly sound: string | undefined;
  readonly modifiers: readonly ModifierSpec[];
  /** Event method names. */
  readonly onStart: string | undefined;
  readonly onTick: { method: string; interval: number; fasterPerLevel: boolean } | undefined;
  readonly onEnd: string | undefined;
  readonly events: Events;
}

/** The event method of a `{ event }` component, or `undefined` when absent. */
function eventOf(
  component: Reader | undefined,
  events: Events,
  extra: readonly string[] = [],
): string | undefined {
  if (component === undefined) return undefined;
  component.onlyKeys(['event', ...extra], 'field');
  return eventMethod(component, events, component.requiredString('event'));
}

function readEffect(input: DefinitionInput): EffectSpec {
  const reader = readDefinition(input);
  reader.onlyKeys(EFFECT_KEYS, 'top-level key');
  checkFormat(reader);
  const color = reader.requiredInteger('color');
  if (color < 0 || color > 0xffffff) reader.fail('color must be 0 to 16777215');
  const components = reader.object('components');
  components?.onlyKeys(EFFECT_COMPONENTS, 'component');
  const events = readEvents(reader, 'effect');
  const tick = components?.object('msm:on_tick');
  let onTick: EffectSpec['onTick'];
  if (tick !== undefined) {
    const method = eventOf(tick, events, ['interval_ticks', 'faster_per_level']) as string;
    const interval = tick.integer('interval_ticks', DEFAULT_INTERVAL);
    if (interval < 1) tick.fail('interval_ticks must be at least 1');
    onTick = { method, interval, fasterPerLevel: tick.boolean('faster_per_level', false) };
  }
  if (!reader.has('category')) reader.fail('category is missing');
  return {
    input,
    category: reader.enumConstant('category', CATEGORIES, ''),
    color,
    particle: reader.optionalString('particle'),
    sound: reader.optionalString('sound'),
    modifiers: reader.objects('attribute_modifiers').map((modifier) => {
      modifier.onlyKeys(['attribute', 'amount', 'operation'], 'attribute modifier field');
      if (!modifier.has('operation')) modifier.fail('operation is missing');
      return {
        attribute: modifier.requiredString('attribute'),
        amount: modifier.requiredNumber('amount'),
        operation: modifier.enumConstant('operation', OPERATIONS, ''),
      };
    }),
    onStart: eventOf(components?.object('msm:on_start'), events),
    onTick,
    onEnd: eventOf(components?.object('msm:on_end'), events),
    events,
  };
}

/** `0xRRGGBB`. */
function hexColor(color: number): string {
  return `0x${color.toString(16).toUpperCase().padStart(6, '0')}`;
}

/**
 * Generates `ModEffects.java`, `effect/MobEffectBase.java` and the effect classes; returns
 * nothing when there are no effects.
 *
 * @returns The simple name of the registration class, or `undefined`.
 */
export function generateEffects(
  context: GenerationContext,
  classNames: NameTable,
): string | undefined {
  const effects = context.input.effects ?? [];
  if (effects.length === 0) return undefined;
  const specs = effects.map(readEffect);
  const fields = new NameTable();
  const file = new JavaFile(
    context.input.javaPackage,
    'the msm/<namespace>/effect/*.json definitions',
  );
  const registry = file.use('net.minecraft.core.Registry');
  const holder = file.use('net.minecraft.core.Holder');
  const builtIn = file.use('net.minecraft.core.registries.BuiltInRegistries');
  const registries = file.use('net.minecraft.core.registries.Registries');
  const resourceKey = file.use('net.minecraft.resources.ResourceKey');
  const mobEffect = file.use('net.minecraft.world.effect.MobEffect');
  const base = file.use(`${packageOf(context, 'effect')}.MobEffectBase`);

  const body: string[] = [];
  for (const spec of specs) {
    const { path } = splitId(spec.input.id);
    const field = fields.take(constantName(path));
    const name = classNames.take(className(path, 'Effect'), (n) => [`effect.${n}`], '');
    writeEffectClass(context, spec, name);
    const type = file.use(`${packageOf(context, 'effect')}.${name}`);
    body.push(
      '',
      `/** {@code ${spec.input.id}} (${spec.input.path}). */`,
      `public static final ${holder}<${mobEffect}> ${field} = ${registry}.registerForHolder(${builtIn}.MOB_EFFECT,`,
      `        ${resourceKey}.create(${registries}.MOB_EFFECT, ${identifierExpression(file, spec.input.id)}), new ${type}());`,
    );
  }
  context.files.push({
    path: classPath(context, 'effect', 'MobEffectBase'),
    contents: mobEffectBaseJava(context.input.javaPackage, context.input.modId),
  });
  const lines = [
    '/** The status effects, registered when the class loads (before the blocks and items, which may name them). */',
    'public final class ModEffects {',
    ...indent(body.slice(1)),
    '',
    '    private ModEffects() {}',
    '',
    '    /** Loads the class (registering every effect) and installs the end-of-tick queue and the on_end hook. */',
    '    public static void register() {',
    `        ${base}.registerHooks();`,
    '    }',
    '}',
  ];
  context.files.push({ path: classPath(context, '', 'ModEffects'), contents: file.render(lines) });
  return 'ModEffects';
}

function writeEffectClass(context: GenerationContext, spec: EffectSpec, name: string): void {
  const file = new JavaFile(packageOf(context, 'effect'), spec.input.path);
  const category = file.use('net.minecraft.world.effect.MobEffectCategory');
  const particle = spec.particle === undefined ? 'null' : javaString(spec.particle);
  const members: string[] = [
    `private static final String OWNER = ${javaString(spec.input.id)};`,
    '',
    `public ${name}() {`,
    `    super(OWNER, ${category}.${spec.category}, ${hexColor(spec.color)}, ${particle});`,
  ];
  if (spec.sound !== undefined) members.push(`    soundOnAdded(${javaString(spec.sound)});`);
  if (spec.modifiers.length > 0) {
    const modifier = file.use('net.minecraft.world.entity.ai.attributes.AttributeModifier');
    spec.modifiers.forEach((m, index) => {
      members.push(
        `    modifier(${javaInt(index)}, ${javaString(m.attribute)}, ${javaFloat(m.amount)}, ${modifier}.Operation.${m.operation});`,
      );
    });
  }
  members.push('}');
  const serverLevel = (): string => file.use('net.minecraft.server.level.ServerLevel');
  const living = (): string => file.use('net.minecraft.world.entity.LivingEntity');
  const fire = (method: string): string => {
    const player = file.use('net.minecraft.world.entity.player.Player');
    const other = spec.events.otherParameter ? ', holder' : '';
    return fireCall(
      method,
      `level, holder.blockPosition(), holder.position(), holder instanceof ${player} p ? p : null, holder${other}`,
    );
  };
  if (spec.onStart !== undefined) {
    members.push(
      '',
      '/** msm:on_start: the effect was added to an entity that did not have it. */',
      '@Override',
      `protected void onStart(${serverLevel()} level, ${living()} holder) {`,
      `    ${fire(spec.onStart)}`,
      '}',
    );
  }
  if (spec.onTick !== undefined) {
    const { interval, fasterPerLevel } = spec.onTick;
    members.push(
      '',
      fasterPerLevel
        ? `/** msm:on_tick every ${interval} ticks at level I, faster per level: ${interval} / level, at least 1. */`
        : `/** msm:on_tick every ${interval} ticks. */`,
      '@Override',
      'protected int tickInterval(int amplifier) {',
      fasterPerLevel
        ? `    return Math.max(1, ${javaInt(interval)} / (Math.max(0, amplifier) + 1));`
        : `    return ${javaInt(interval)};`,
      '}',
      '',
      '/** msm:on_tick, at the end of the server tick. */',
      '@Override',
      `protected void onTick(${serverLevel()} level, ${living()} holder) {`,
      `    ${fire(spec.onTick.method)}`,
      '}',
    );
  }
  if (spec.onEnd !== undefined) {
    members.push(
      '',
      '@Override',
      'protected boolean hasOnEnd() {',
      '    return true;',
      '}',
      '',
      '/** msm:on_end: the effect was removed or ran out; at the end of the server tick. */',
      '@Override',
      `protected void onEnd(${serverLevel()} level, ${living()} holder) {`,
      `    ${fire(spec.onEnd)}`,
      '}',
    );
  }
  if (spec.events.byId.size > 0) {
    const actions = noteActions(context, file, spec.events);
    members.push(...eventMethods(file, spec.events, 'effect', actions));
  }
  const lines = [
    `/** The status effect {@code ${spec.input.id}}. */`,
    `public class ${name} extends MobEffectBase {`,
    ...indent(members),
    '}',
  ];
  context.files.push({ path: classPath(context, 'effect', name), contents: file.render(lines) });
}
