/**
 * Fluids (ADR 0099 D1, D2, ADR 0108 D1 to D3; ADR 0112 D3): `ModFluids.java` builds one `FluidSpec`
 * per `msm/<namespace>/fluid/*.json` definition, with the runtime's `FluidParser` defaults, and
 * registers it through the shared `fluid/FluidRegistry` (the still and flowing fluid, the liquid
 * block and the bucket) before the blocks, as the runtime's registrar does; `fluid/FluidCauldrons`
 * registers the cauldrons and bottles after every block and item, and `fluid/FluidMixing` looks up
 * the mixing rules at server start. A fluid with events gets `fluid/<Name>FluidEvents.java`, whose
 * methods are the definition's events (the actor of `on_entity_inside` is the entity inside, of
 * `bottle.on_drink` the drinker). The client entrypoint registers the renderers
 * (`client/fluid/FluidRenderers`). The shared classes are copied from the runtime
 * (`templates/fluids-java.ts`).
 *
 * Minecraft 26.3, Mojang names.
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
import {
  fluidCauldronsJava,
  fluidMixingJava,
  fluidRegistryJava,
  fluidRenderersJava,
  fluidSpecJava,
  modBottleItemJava,
  modCauldronBlockJava,
  modFlowingFluidJava,
  modFluidJava,
  modLiquidBlockJava,
} from './templates/fluids-java';

const BEHAVIOURS = ['water', 'lava', 'none'] as const;
const ID = /^([a-z0-9_.-]+:)?[a-z0-9_./-]+$/;

function fullId(reader: Reader, key: string, value: string): string {
  if (!ID.test(value)) reader.fail(`${key} '${value}' is not an id`);
  return value.includes(':') ? value : `minecraft:${value}`;
}

interface FluidEntry {
  readonly input: DefinitionInput;
  readonly field: string;
  readonly specLines: string[];
  readonly hasCompanions: boolean;
}

/**
 * Generates `ModFluids.java`, the shared `fluid/` classes and the events classes; returns the
 * registrations for the mod initialiser (`ModFluids` before the blocks, `fluid.FluidCauldrons`
 * last) or `undefined` without fluids.
 */
export function generateFluids(
  context: GenerationContext,
): { before: string; after: string[] } | undefined {
  const fluids = context.input.fluids ?? [];
  if (fluids.length === 0) return undefined;
  const pkg = context.input.javaPackage;
  const fluidPackage = packageOf(context, 'fluid');
  const file = new JavaFile(pkg, 'the msm/<namespace>/fluid/*.json definitions');
  const spec = file.use(`${fluidPackage}.FluidSpec`);
  const registry = file.use(`${fluidPackage}.FluidRegistry`);
  const list = file.use('java.util.List');
  const fields = new NameTable();
  const eventClasses = new NameTable();
  eventClasses.reserve(
    'FluidSpec',
    'FluidRegistry',
    'ModFluid',
    'ModFlowingFluid',
    'ModLiquidBlock',
    'FluidMixing',
    'ModCauldronBlock',
    'ModBottleItem',
    'FluidCauldrons',
  );
  const entries: FluidEntry[] = [];
  let mixes = false;
  for (const fluid of fluids) {
    const reader = readDefinition(fluid);
    reader.onlyKeys(
      [
        'format',
        'behaves_like',
        'flow',
        'light',
        'tint',
        'explosion_resistance',
        'on_entity_inside',
        'events',
        'mixing',
        'cauldron',
        'bottle',
      ],
      'top-level key',
    );
    checkFormat(reader);
    const behaviour = reader.string('behaves_like', 'water');
    if (!(BEHAVIOURS as readonly string[]).includes(behaviour)) {
      reader.fail(`behaves_like '${behaviour}' is not one of ${BEHAVIOURS.join(', ')}`);
    }
    const lava = behaviour === 'lava';
    const flow = reader.object('flow');
    flow?.onlyKeys(['tick_delay', 'slope_distance', 'drop_off', 'infinite'], 'flow field');
    const ranged = (
      r: Reader | undefined,
      key: string,
      fallback: number,
      min: number,
      max: number,
    ) => {
      const value = r === undefined ? fallback : r.integer(key, fallback);
      if (value < min || value > max) (r ?? reader).fail(`${key} must be ${min} to ${max}`);
      return value;
    };
    const tickDelay = ranged(flow, 'tick_delay', lava ? 30 : 5, 1, 100);
    const slope = ranged(flow, 'slope_distance', lava ? 2 : 4, 1, 8);
    const dropOff = ranged(flow, 'drop_off', lava ? 2 : 1, 1, 4);
    const infinite = flow === undefined ? !lava : flow.boolean('infinite', !lava);
    const light = ranged(reader, 'light', lava ? 15 : 0, 0, 15);
    const tint = reader.has('tint') ? ranged(reader, 'tint', 0, 0, 0xffffff) : -1;
    const resistance = reader.number('explosion_resistance', 100);
    if (resistance < 0) reader.fail('explosion_resistance must be at least 0');
    const events = readEvents(reader, 'step_block', true);
    const insideEvent = reader.optionalString('on_entity_inside');
    const inside = insideEvent === undefined ? undefined : eventMethod(reader, events, insideEvent);
    // Mixing rules (ADR 0108 D1): a rule with neither side is dropped, as the runtime does.
    const mixing = reader.objects('mixing').flatMap((rule) => {
      rule.onlyKeys(['with', 'source', 'flowing'], 'mixing field');
      const withValue = rule.requiredString('with');
      const source = rule.optionalString('source');
      const flowing = rule.optionalString('flowing');
      if (source === undefined && flowing === undefined) return [];
      const keyword = withValue === 'water' || withValue === 'lava';
      const tag = keyword ? `${spec}.Behaviour.${withValue.toUpperCase()}` : 'null';
      const withFluid = keyword
        ? 'null'
        : identifierExpression(file, fullId(rule, 'with', withValue));
      const id = (value: string | undefined, key: string) =>
        value === undefined ? 'null' : identifierExpression(file, fullId(rule, key, value));
      return [
        `new ${spec}.Mixing(${tag}, ${withFluid}, ${id(source, 'source')}, ${id(flowing, 'flowing')})`,
      ];
    });
    if (reader.has('mixing') && reader.objects('mixing').length > 16) {
      reader.fail('mixing lists at most 16 rules');
    }
    if (mixing.length > 0) mixes = true;
    const cauldron = reader.object('cauldron');
    cauldron?.onlyKeys(['levels'], 'cauldron field');
    // A lava-like fluid's cauldron is full only (the runtime warns and ignores levels).
    const cauldronExpression =
      cauldron === undefined
        ? 'null'
        : `new ${spec}.Cauldron(${cauldron.boolean('levels', false) && !lava})`;
    const bottle = reader.object('bottle');
    let bottleExpression = 'null';
    let drink: string | undefined;
    if (bottle !== undefined) {
      bottle.onlyKeys(['food', 'effects', 'on_drink'], 'bottle field');
      const food = bottle.object('food');
      food?.onlyKeys(['nutrition', 'saturation', 'can_always_eat'], 'food field');
      const foodExpression =
        food === undefined
          ? 'null'
          : `new ${spec}.Food(${javaInt(food.requiredInteger('nutrition'))}, ${javaFloat(food.requiredNumber('saturation'))}, ${food.boolean('can_always_eat', false)})`;
      const effects = bottle.objects('effects').map((effect) => {
        effect.onlyKeys(['effect', 'seconds', 'amplifier', 'chance'], 'effects field');
        const seconds = effect.requiredNumber('seconds');
        if (seconds < 0) effect.fail('seconds must be at least 0');
        const amplifier = effect.integer('amplifier', 0);
        if (amplifier < 0 || amplifier > 255) effect.fail('amplifier must be 0 to 255');
        const chance = effect.number('chance', 1);
        if (chance < 0 || chance > 1) effect.fail('chance must be 0 to 1');
        // ItemComponents.ConsumeEffect.ticks(): Math.round(seconds * 20) over Java floats.
        const ticks = Math.round(Math.fround(Math.fround(seconds) * 20));
        return `new ${spec}.Effect(${identifierExpression(file, fullId(effect, 'effect', effect.requiredString('effect')))}, ${javaInt(ticks)}, ${javaInt(amplifier)}, ${javaFloat(chance)})`;
      });
      bottleExpression = `new ${spec}.Bottle(${foodExpression}, ${list}.of(${effects.join(', ')}))`;
      const drinkEvent = bottle.optionalString('on_drink');
      if (drinkEvent !== undefined) drink = eventMethod(bottle, events, drinkEvent);
    }
    const field = fields.take(constantName(splitId(fluid.id).path), (name) => [name]);
    let insideExpression = 'null';
    let drinkExpression = 'null';
    if (events.byId.size > 0) {
      const eventsClass = eventClasses.take(
        className(splitId(fluid.id).path, 'FluidEvents'),
        (name) => [name],
      );
      writeEventsClass(context, fluid, events, eventsClass, inside, drink);
      const cls = file.use(`${fluidPackage}.${eventsClass}`);
      if (inside !== undefined) insideExpression = `${cls}::inside`;
      if (drink !== undefined) drinkExpression = `${cls}::drink`;
    }
    entries.push({
      input: fluid,
      field,
      hasCompanions: cauldron !== undefined || bottle !== undefined,
      specLines: [
        `/** {@code ${fluid.id}} (${fluid.path}). */`,
        `public static final ${spec} ${field} = new ${spec}(${spec}.Behaviour.${behaviour.toUpperCase()}, ${javaInt(tickDelay)}, ${javaInt(slope)}, ${javaInt(dropOff)}, ${infinite},`,
        `        ${javaInt(light)}, ${javaInt(tint)}, ${javaFloat(resistance)},`,
        `        ${list}.of(${mixing.join(', ')}),`,
        `        ${cauldronExpression},`,
        `        ${bottleExpression},`,
        `        ${insideExpression}, ${drinkExpression});`,
      ],
    });
  }
  const lines = [
    '/** The fluids, registered before the blocks; their cauldrons and bottles after every block and item. */',
    'public final class ModFluids {',
    ...indent(entries.flatMap((entry) => ['', ...entry.specLines]).slice(1)),
    '',
    '    private ModFluids() {}',
    '',
    '    /** Registers every fluid with its liquid block and bucket. */',
    '    public static void register() {',
    ...indent(
      entries.map(
        (entry) =>
          `${registry}.register(${identifierExpression(file, entry.input.id)}, ${entry.field});`,
      ),
      2,
    ),
    '    }',
    '}',
  ];
  context.files.push({ path: classPath(context, '', 'ModFluids'), contents: file.render(lines) });
  context.usesCooldownMap = true;
  context.usesTickLimiter = true;
  const modId = context.input.modId;
  const shared: [string, string][] = [
    ['FluidSpec', fluidSpecJava(fluidPackage)],
    ['FluidRegistry', fluidRegistryJava(fluidPackage, modId)],
    ['ModFluid', modFluidJava(fluidPackage)],
    ['ModFlowingFluid', modFlowingFluidJava(fluidPackage)],
    ['ModLiquidBlock', modLiquidBlockJava(fluidPackage, pkg)],
    ['FluidMixing', fluidMixingJava(fluidPackage, modId)],
    ['ModCauldronBlock', modCauldronBlockJava(fluidPackage)],
    ['ModBottleItem', modBottleItemJava(fluidPackage)],
    ['FluidCauldrons', fluidCauldronsJava(fluidPackage, modId)],
  ];
  for (const [name, contents] of shared) {
    context.files.push({ path: classPath(context, 'fluid', name), contents });
  }
  context.files.push({
    path: classPath(context, 'client.fluid', 'FluidRenderers'),
    contents: fluidRenderersJava(packageOf(context, 'client.fluid'), fluidPackage, modId),
  });
  const after: string[] = [];
  if (mixes) after.push('fluid.FluidMixing');
  if (entries.some((entry) => entry.hasCompanions)) after.push('fluid.FluidCauldrons');
  return { before: 'ModFluids', after };
}

/** `fluid/<Name>FluidEvents.java`: the fluid's events, fired by its hooks. */
function writeEventsClass(
  context: GenerationContext,
  fluid: DefinitionInput,
  events: Events,
  name: string,
  inside: string | undefined,
  drink: string | undefined,
): void {
  const file = new JavaFile(packageOf(context, 'fluid'), fluid.path);
  const actions = noteActions(context, file, events);
  const serverLevel = file.use('net.minecraft.server.level.ServerLevel');
  const blockPos = file.use('net.minecraft.core.BlockPos');
  const entity = file.use('net.minecraft.world.entity.Entity');
  const living = file.use('net.minecraft.world.entity.LivingEntity');
  const player = file.use('net.minecraft.world.entity.player.Player');
  const vec3 = file.use('net.minecraft.world.phys.Vec3');
  const hooks: string[] = [];
  if (inside !== undefined) {
    hooks.push(
      '',
      '/** on_entity_inside: the entity inside is the player when it is one, else the entity (ADR 0058 D1). */',
      `public static void inside(${serverLevel} level, ${blockPos} pos, ${entity} entity) {`,
      `    ${player} player = entity instanceof ${player} p ? p : null;`,
      `    INSTANCE.${fireCall(inside, `level, pos, ${vec3}.atCenterOf(pos), player, player == null ? entity : null`)}`,
      '}',
    );
  }
  if (drink !== undefined) {
    hooks.push(
      '',
      '/** bottle.on_drink: the drinker is self. */',
      `public static void drink(${serverLevel} level, ${living} drinker) {`,
      `    ${player} player = drinker instanceof ${player} p ? p : null;`,
      `    INSTANCE.${fireCall(drink, `level, drinker.blockPosition(), drinker.position(), player, player == null ? drinker : null`)}`,
      '}',
    );
  }
  const lines = [
    `/** The events of the fluid {@code ${fluid.id}}. */`,
    `public final class ${name} {`,
    `    private static final String OWNER = ${javaString(fluid.id)};`,
    `    private static final ${name} INSTANCE = new ${name}();`,
    '',
    `    private ${name}() {}`,
    ...indent(hooks),
    ...indent(eventMethods(file, events, 'step_block', actions)),
    '}',
  ];
  context.files.push({ path: classPath(context, 'fluid', name), contents: file.render(lines) });
}
