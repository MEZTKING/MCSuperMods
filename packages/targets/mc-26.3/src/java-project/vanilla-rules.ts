/**
 * Rules for vanilla blocks (ADR 0105 D4 and its amendment after B503; ADR 0112 D3):
 * `ModVanillaBlockRules.java`, applying every `msm/<namespace>/vanilla_block_rules/*.json` file at
 * start as the runtime's `BlockExtras.applyRules` with the 26.3 `VanillaPairs` seam does: strip,
 * flatten and till through the generated `BlockStripping`, wax through the generated `BlockWaxing`
 * (honeycomb waxes, an axe takes the wax off again), age through Fabric's
 * `OxidizableBlocksRegistry.registerNextStage` (only a block that already ages as copper does,
 * `WeatheringCopper`, takes one) and burn through Fabric's `FlammableBlockRegistry`. A block that is
 * not registered at start (unknown, or from a mod that registers later) is logged and its rule
 * skipped; the target blocks and drops are looked up on use, so they may register later. Files in
 * scan order; a later rule for the same block replaces an earlier one.
 *
 * Minecraft 26.3, Mojang names.
 *
 * @packageDocumentation
 */

import { classPath, type GenerationContext } from './context';
import { identifierExpression, indent, JavaFile, javaInt, javaString } from './java';
import { checkFormat, type Reader, readDefinition } from './read';
import { blockStrippingJava } from './templates/block-stripping-java';
import { blockWaxingJava } from './weathering';

const BLOCK_ID = /^([a-z0-9_.-]+:)?[a-z0-9_./-]+$/;

function id(reader: Reader, key: string): string {
  const value = reader.requiredString(key);
  if (!BLOCK_ID.test(value)) reader.fail(`${key} '${value}' is not an id`);
  return value.includes(':') ? value : `minecraft:${value}`;
}

/** Generates `ModVanillaBlockRules.java`; returns its simple name, or `undefined` without rules files. */
export function generateVanillaBlockRules(context: GenerationContext): string | undefined {
  const files = context.input.vanillaBlockRules ?? [];
  if (files.length === 0) return undefined;
  const file = new JavaFile(
    context.input.javaPackage,
    'the msm/<namespace>/vanilla_block_rules/*.json definitions',
  );
  const flammable = file.use('net.fabricmc.fabric.api.registry.FlammableBlockRegistry');
  const oxidizable = file.use('net.fabricmc.fabric.api.registry.OxidizableBlocksRegistry');
  const weatheringCopper = file.use('net.minecraft.world.level.block.WeatheringCopper');
  const builtIn = file.use('net.minecraft.core.registries.BuiltInRegistries');
  const identifier = file.use('net.minecraft.resources.Identifier');
  const blockType = file.use('net.minecraft.world.level.block.Block');
  const logger = file.use('org.slf4j.Logger');
  const loggerFactory = file.use('org.slf4j.LoggerFactory');
  const lines: string[] = [];
  let strips = false;
  let waxes = false;
  for (const rules of files) {
    const reader = readDefinition(rules);
    reader.onlyKeys(['format', 'strip', 'flatten', 'till', 'wax', 'age', 'burn'], 'top-level key');
    checkFormat(reader);
    const source = javaString(rules.id);
    const body: string[] = [];
    const block = (r: Reader, list: string, key = 'block'): string =>
      `block(${source}, ${javaString(list)}, ${identifierExpression(file, id(r, key))})`;
    for (const pair of reader.objects('strip')) {
      pair.onlyKeys(['block', 'into'], 'strip field');
      strips = true;
      body.push(
        `ifRegistered(${block(pair, 'strip')}, b -> BlockStripping.add(b, ${identifierExpression(file, id(pair, 'into'))}));`,
      );
    }
    for (const pair of reader.objects('flatten')) {
      pair.onlyKeys(['block', 'into'], 'flatten field');
      strips = true;
      body.push(
        `ifRegistered(${block(pair, 'flatten')}, b -> BlockStripping.flatten(b, ${identifierExpression(file, id(pair, 'into'))}));`,
      );
    }
    for (const pair of reader.objects('till')) {
      pair.onlyKeys(['block', 'into', 'drops'], 'till field');
      strips = true;
      const drops = pair.has('drops') ? identifierExpression(file, id(pair, 'drops')) : 'null';
      body.push(
        `ifRegistered(${block(pair, 'till')}, b -> BlockStripping.till(b, ${identifierExpression(file, id(pair, 'into'))}, ${drops}));`,
      );
    }
    for (const pair of reader.objects('wax')) {
      pair.onlyKeys(['block', 'into'], 'wax field');
      waxes = true;
      const into = identifierExpression(file, id(pair, 'into'));
      body.push(
        `ifRegistered(${block(pair, 'wax')}, b -> {`,
        `    BlockWaxing.wax(b, ${into});`,
        `    BlockWaxing.unwax(${into}, ${builtIn}.BLOCK.getKey(b)); // an axe takes the wax off`,
        '});',
      );
    }
    for (const pair of reader.objects('age')) {
      pair.onlyKeys(['block', 'next'], 'age field');
      body.push(`age(${source}, ${block(pair, 'age')}, ${block(pair, 'age', 'next')});`);
    }
    for (const rule of reader.objects('burn')) {
      rule.onlyKeys(['block', 'burn_odds', 'ignite_odds'], 'burn field');
      const odds = (key: string): string => {
        const value = rule.requiredInteger(key);
        if (value < 0 || value > 300) rule.fail(`${key} must be 0 to 300`);
        return javaInt(value);
      };
      body.push(
        `ifRegistered(${block(rule, 'burn')}, b -> ${flammable}.getDefaultInstance().add(b, ${odds('burn_odds')}, ${odds('ignite_odds')}));`,
      );
    }
    if (body.length === 0) {
      body.push(`LOGGER.warn("{}: no rules; the file does nothing", ${source});`);
    }
    lines.push(`// ${rules.path}`, ...body);
  }
  if (strips && !context.files.some((f) => f.path === classPath(context, '', 'BlockStripping'))) {
    context.files.push({
      path: classPath(context, '', 'BlockStripping'),
      contents: blockStrippingJava(context.input.javaPackage),
    });
  }
  if (waxes && !context.files.some((f) => f.path === classPath(context, '', 'BlockWaxing'))) {
    context.files.push({
      path: classPath(context, '', 'BlockWaxing'),
      contents: blockWaxingJava(context.input.javaPackage),
    });
  }
  const consumer = file.use('java.util.function.Consumer');
  const out = [
    '/** The rules for vanilla blocks: strip, flatten, till, wax, age and burn pairs, applied once at start. */',
    'public final class ModVanillaBlockRules {',
    `    private static final ${logger} LOGGER = ${loggerFactory}.getLogger(${javaString(context.input.modId)});`,
    '',
    '    private ModVanillaBlockRules() {}',
    '',
    '    /** Applies every rule (after the blocks, so the callbacks of the blocks run first). */',
    '    public static void register() {',
    ...indent(lines, 2),
    ...(strips ? ['        BlockStripping.register();'] : []),
    ...(waxes ? ['        BlockWaxing.register();'] : []),
    '    }',
    '',
    '    /** The registered block {@code id}, or null (logged: the rule is skipped). */',
    `    private static ${blockType} block(String source, String list, ${identifier} id) {`,
    `        if (${builtIn}.BLOCK.containsKey(id)) {`,
    `            return ${builtIn}.BLOCK.getValue(id);`,
    '        }',
    '        LOGGER.warn("{}: {}: {} is not a registered block (unknown, or from a mod that registers later); the rule is skipped",',
    '                source, list, id);',
    '        return null;',
    '    }',
    '',
    `    private static void ifRegistered(${blockType} block, ${consumer}<${blockType}> rule) {`,
    '        if (block != null) {',
    '            rule.accept(block);',
    '        }',
    '    }',
    '',
    '    /** An age rule: only a block that already ages as copper does takes a next stage (26.3). */',
    `    private static void age(String source, ${blockType} block, ${blockType} next) {`,
    '        if (block == null || next == null) {',
    '            return;',
    '        }',
    `        if (!(block instanceof ${weatheringCopper})) {`,
    `            LOGGER.warn("{}: age: {} does not age as copper does, so it cannot take a next stage; the rule is skipped", source, ${builtIn}.BLOCK.getKey(block));`,
    '            return;',
    '        }',
    '        try {',
    `            ${oxidizable}.registerNextStage(block, next);`,
    '        } catch (RuntimeException e) {',
    `            LOGGER.warn("{}: age: {} -> {} could not be registered ({}); the rule is skipped", source, ${builtIn}.BLOCK.getKey(block),`,
    `                    ${builtIn}.BLOCK.getKey(next), e.getMessage());`,
    '        }',
    '    }',
    '}',
  ];
  context.files.push({
    path: classPath(context, '', 'ModVanillaBlockRules'),
    contents: file.render(out),
  });
  return 'ModVanillaBlockRules';
}
