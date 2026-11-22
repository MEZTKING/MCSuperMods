/**
 * Game rules and statistics (ADR 0111 D5, D6 as amended after B525; ADR 0112 D3):
 * `ModGameRules.java`, one vanilla game rule per `msm/<namespace>/game_rule/*.json` definition
 * registered with Fabric's `GameRuleBuilder` (a boolean, or a whole number with `min` and `max` as
 * its range) in its category under the definition's id, and `ModStats.java`, one `custom_stat`
 * registry entry per `msm/<namespace>/stat/*.json` definition, registered with the definition's own
 * `Identifier` instance and made a statistic of `Stats.CUSTOM` with its formatter. As the runtime's
 * `MsmGameRules` and `MsmStats`; vanilla does the rest (`/gamerule <ns>:<path>`, the per-world
 * save, the scoreboard criterion `minecraft.custom:<ns>.<path>`, the language keys the lowering
 * writes). An id vanilla or another mod already has is logged and left out at start, as in the
 * runtime.
 *
 * Minecraft 26.3, Mojang names.
 *
 * @packageDocumentation
 */

import { classPath, type GenerationContext } from './context';
import { identifierExpression, indent, JavaFile, javaInt, javaString } from './java';
import { constantName, NameTable, splitId } from './names';
import { checkFormat, readDefinition } from './read';

/** The categories of `GameRuleCategory`, as `msm:game_rule` writes them (B525). */
const CATEGORIES = ['player', 'mobs', 'spawning', 'drops', 'updates', 'chat', 'misc'] as const;
/** The statistic formatters of `StatFormatter` MSM offers (limit N22: no `DIVIDE_BY_TEN`). */
const FORMATTERS = ['default', 'distance', 'time'] as const;

/** Generates `ModGameRules.java`; returns its simple name, or `undefined` without game rules. */
export function generateGameRules(context: GenerationContext): string | undefined {
  const rules = context.input.gameRules ?? [];
  if (rules.length === 0) return undefined;
  const file = new JavaFile(
    context.input.javaPackage,
    'the msm/<namespace>/game_rule/*.json definitions',
  );
  const builder = file.use('net.fabricmc.fabric.api.gamerule.v1.GameRuleBuilder');
  const category = file.use('net.minecraft.world.level.gamerules.GameRuleCategory');
  const gameRule = file.use('net.minecraft.world.level.gamerules.GameRule');
  const builtIn = file.use('net.minecraft.core.registries.BuiltInRegistries');
  const identifier = file.use('net.minecraft.resources.Identifier');
  const supplier = file.use('java.util.function.Supplier');
  const fields = new NameTable();
  const declarations: string[] = [];
  const registrations: string[] = [];
  for (const rule of rules) {
    const reader = readDefinition(rule);
    reader.onlyKeys(['format', 'kind', 'category', 'default', 'min', 'max'], 'top-level key');
    checkFormat(reader);
    const kind = reader.requiredString('kind');
    if (kind !== 'boolean' && kind !== 'integer') {
      reader.fail(`kind '${kind}' is not boolean or integer`);
    }
    const group = reader.enumConstant('category', CATEGORIES, 'misc');
    const field = fields.take(constantName(splitId(rule.id).path), (name) => [name]);
    let build: string;
    let type: string;
    if (kind === 'boolean') {
      if (reader.has('min') || reader.has('max')) {
        reader.fail(
          'min and max are not fields of a boolean game rule (the runtime does not register such a rule either)',
        );
      }
      type = 'Boolean';
      build = `${builder}.forBoolean(${reader.boolean('default', false)}).category(${category}.${group})`;
    } else {
      const min = reader.optionalNumber('min');
      const max = reader.optionalNumber('max');
      for (const [key, value] of [
        ['min', min],
        ['max', max],
      ] as const) {
        if (value !== undefined && !Number.isInteger(value))
          reader.fail(`${key} must be an integer`);
      }
      if (min !== undefined && max !== undefined && min > max) {
        reader.fail(`min ${min} is above max ${max}`);
      }
      const value = reader.has('default') ? reader.integer('default', 0) : clamp(0, min, max);
      if ((min !== undefined && value < min) || (max !== undefined && value > max)) {
        reader.fail(`default ${value} is outside min and max`);
      }
      type = 'Integer';
      build = `${builder}.forInteger(${javaInt(value)}).category(${category}.${group}).range(${min === undefined ? 'Integer.MIN_VALUE' : javaInt(min)}, ${max === undefined ? 'Integer.MAX_VALUE' : javaInt(max)})`;
    }
    declarations.push(
      `/** {@code /gamerule ${rule.id}} (${rule.path}), or null when the id was taken. */`,
      `public static ${gameRule}<${type}> ${field};`,
    );
    registrations.push(
      `${field} = register(${identifierExpression(file, rule.id)}, () -> ${build}.buildAndRegister(${identifierExpression(file, rule.id)}));`,
    );
  }
  const lines = [
    '/** The game rules, registered at start (an id that is already a game rule is logged and left out). */',
    'public final class ModGameRules {',
    ...indent(declarations),
    '',
    '    private ModGameRules() {}',
    '',
    '    /** Registers every game rule. */',
    '    public static void register() {',
    ...indent(registrations, 2),
    '    }',
    '',
    `    private static <T> ${gameRule}<T> register(${identifier} id, ${supplier}<${gameRule}<T>> build) {`,
    `        if (${builtIn}.GAME_RULE.containsKey(id)) {`,
    `            ${file.use('org.slf4j.LoggerFactory')}.getLogger(${javaString(context.input.modId)}).error("game rule {}: the id is already a game rule; not registered", id);`,
    '            return null;',
    '        }',
    '        return build.get();',
    '    }',
    '}',
  ];
  context.files.push({
    path: classPath(context, '', 'ModGameRules'),
    contents: file.render(lines),
  });
  return 'ModGameRules';
}

/** An integer rule without `default` starts at 0 kept within `min` and `max` (as `GameRuleParser`). */
function clamp(value: number, min: number | undefined, max: number | undefined): number {
  let out = value;
  if (min !== undefined && out < min) out = min;
  if (max !== undefined && out > max) out = max;
  return out;
}

/** Generates `ModStats.java`; returns its simple name, or `undefined` without statistics. */
export function generateStats(context: GenerationContext): string | undefined {
  const stats = context.input.stats ?? [];
  if (stats.length === 0) return undefined;
  const file = new JavaFile(
    context.input.javaPackage,
    'the msm/<namespace>/stat/*.json definitions',
  );
  const registry = file.use('net.minecraft.core.Registry');
  const builtIn = file.use('net.minecraft.core.registries.BuiltInRegistries');
  const identifier = file.use('net.minecraft.resources.Identifier');
  const formatterType = file.use('net.minecraft.stats.StatFormatter');
  const statType = file.use('net.minecraft.stats.Stat');
  const statsType = file.use('net.minecraft.stats.Stats');
  const fields = new NameTable();
  const declarations: string[] = [];
  const registrations: string[] = [];
  for (const stat of stats) {
    const reader = readDefinition(stat);
    reader.onlyKeys(['format', 'formatter'], 'top-level key');
    checkFormat(reader);
    const formatter = reader.enumConstant('formatter', FORMATTERS, 'default');
    const field = fields.take(constantName(splitId(stat.id).path), (name) => [name]);
    const { namespace, path } = splitId(stat.id);
    declarations.push(
      `/** {@code ${stat.id}} (${stat.path}): the scoreboard criterion {@code minecraft.custom:${namespace}.${path.replaceAll('/', '.')}}; null when the id was taken. */`,
      `public static ${statType}<${identifier}> ${field};`,
    );
    registrations.push(
      `${field} = register(${identifierExpression(file, stat.id)}, ${formatterType}.${formatter});`,
    );
  }
  const lines = [
    '/**',
    ' * The statistics, registered at start: each id is an entry of {@code custom_stat} whose value is the same {@link',
    ` * ${identifier}} instance, then a statistic of {@code Stats.CUSTOM} (which finds a statistic by that instance). An id`,
    ' * already in {@code custom_stat} is logged and left out.',
    ' */',
    'public final class ModStats {',
    ...indent(declarations),
    '',
    '    private ModStats() {}',
    '',
    '    /** Registers every statistic. */',
    '    public static void register() {',
    ...indent(registrations, 2),
    '    }',
    '',
    `    private static ${statType}<${identifier}> register(${identifier} id, ${formatterType} formatter) {`,
    `        if (${builtIn}.CUSTOM_STAT.containsKey(id)) {`,
    `            ${file.use('org.slf4j.LoggerFactory')}.getLogger(${javaString(context.input.modId)}).error("statistic {}: the id is already a custom statistic; not registered", id);`,
    '            return null;',
    '        }',
    `        ${identifier} value = ${registry}.register(${builtIn}.CUSTOM_STAT, id, id);`,
    `        return ${statsType}.CUSTOM.get(value, formatter);`,
    '    }',
    '}',
  ];
  context.files.push({ path: classPath(context, '', 'ModStats'), contents: file.render(lines) });
  return 'ModStats';
}
