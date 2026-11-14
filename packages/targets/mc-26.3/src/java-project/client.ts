/**
 * The client entrypoint (when the project has entities, throwables or tinted leaves, ADR 0055
 * D10, ADR 0068 D8): vanilla's
 * `ThrownItemRenderer` for the thrown item entity as the runtime's `MsmRuntimeClient` registers
 * it, with or without GeckoLib (ADR 0056 D4); and the GeckoLib models, mirroring the runtime's `GeckolibRenderers` and
 * `MsmGeoModel`: one `GeoEntityRenderer(ctx, model).withScale(f)` per entity type through
 * vanilla `EntityRenderers.register` (private in 26.3, widened by Fabric API's transitive
 * access wideners); and the leaf tints, mirroring `MsmRuntimeClient`: Fabric's
 * `BlockColorRegistry.register(List.of(source), block)` with vanilla's `BlockTintSources`
 * (`foliage`, `grass`, `dryFoliage`, or `constant` with full alpha). Minecraft 26.3 and
 * GeckoLib 5, Mojang names.
 *
 * @packageDocumentation
 */

import type { LeafTint } from './block-types';
import type { LeafTintEntry } from './blocks';
import { classPath, type GenerationContext, packageOf } from './context';
import type { EntityNames } from './entities';
import { identifierExpression, indent, JavaFile, javaFloat } from './java';
import { geoModelBaseJava } from './templates/geo-model-base-java';

/**
 * Generates `client/<ModClass>Client.java` and, with entities, `client/entity/GeoModelBase.java`
 * and one model class per entity; GeckoLib is imported only with entities.
 *
 * @param entities - The entities, or none.
 * @param throwables - Whether the project has throwables (the thrown item entity is written).
 * @param leafTints - The tinted leaves, or none.
 * @returns The fully qualified client entrypoint class.
 */
export function generateClient(
  context: GenerationContext,
  entities: readonly EntityNames[],
  throwables: boolean,
  leafTints: readonly LeafTintEntry[] = [],
): string {
  const clientPackage = packageOf(context, 'client');
  const modelPackage = packageOf(context, 'client.entity');
  if (entities.length > 0) {
    context.files.push({
      path: classPath(context, 'client.entity', 'GeoModelBase'),
      contents: geoModelBaseJava(modelPackage),
    });
  }

  const name = `${context.input.modClassName}Client`;
  const source = joined([
    entities.length > 0 ? 'the msm/<namespace>/entity/*.json definitions' : undefined,
    throwables ? 'the msm:throwable components' : undefined,
    leafTints.length > 0 ? 'the leaves in msm/<namespace>/block/*.json' : undefined,
  ]);
  const file = new JavaFile(clientPackage, source);
  const initializer = file.use('net.fabricmc.api.ClientModInitializer');
  const renderers = (): string => file.use('net.minecraft.client.renderer.entity.EntityRenderers');

  const body: string[] = [];
  if (throwables) {
    const thrownRenderer = file.use('net.minecraft.client.renderer.entity.ThrownItemRenderer');
    const thrown = file.use(`${packageOf(context, 'entity')}.ThrownItemEntity`);
    body.push(
      '// Thrown items: their item model as a camera-facing sprite, as a snowball.',
      `${renderers()}.register(${thrown}.TYPE, ${thrownRenderer}<${thrown}>::new);`,
    );
  }
  for (const entity of entities) {
    const renderState = file.use('net.minecraft.client.renderer.entity.state.EntityRenderState');
    const geoRenderer = file.use('com.geckolib.renderer.GeoEntityRenderer');
    const modEntities = file.use(`${context.input.javaPackage}.ModEntities`);
    const entityClass = file.use(`${packageOf(context, 'entity')}.${entity.entityClass}`);
    const modelClass = file.use(`${modelPackage}.${entity.modelClass}`);
    const variable = `${entity.modelClass.charAt(0).toLowerCase()}${entity.modelClass.slice(1)}`;
    body.push(
      `${modelClass} ${variable} = new ${modelClass}();`,
      `${renderers()}.register(${modEntities}.${entity.field}, ctx -> new ${geoRenderer}<${entityClass}, ${renderState}>(ctx, ${variable})`,
      `        .withScale(${javaFloat(entity.spec.model.scale)}));`,
    );
    writeModel(context, entity);
  }
  if (leafTints.length > 0) {
    const colours = file.use('net.fabricmc.fabric.api.client.rendering.v1.BlockColorRegistry');
    const list = file.use('java.util.List');
    const modBlocks = file.use(`${context.input.javaPackage}.ModBlocks`);
    if (body.length > 0) body.push('');
    body.push(
      "// Leaf tints: the biome's foliage, grass or dry foliage colour, or a constant colour.",
    );
    for (const { field, tint } of leafTints) {
      body.push(
        `${colours}.register(${list}.of(${tintSource(file, tint)}), ${modBlocks}.${field});`,
      );
    }
  }
  const renders = entities.length > 0 || throwables;
  const lines = [
    `/** Client entrypoint: ${joined([throwables ? "vanilla's thrown item renderer" : undefined, entities.length > 0 ? 'a GeckoLib renderer per entity type' : undefined, leafTints.length > 0 ? 'leaf tints' : undefined])}. */`,
    `public final class ${name} implements ${initializer} {`,
    ...(renders
      ? [
          '    // Renderer providers are read when the client builds its entity renderers, after client initialisation.',
        ]
      : []),
    '    @Override',
    '    public void onInitializeClient() {',
    ...indent(body, 2),
    '    }',
    '}',
  ];
  context.files.push({ path: classPath(context, 'client', name), contents: file.render(lines) });
  return `${clientPackage}.${name}`;
}

/** Parts joined as `a`, `a and b` or `a, b and c`. */
function joined(parts: readonly (string | undefined)[]): string {
  const present = parts.filter((part) => part !== undefined);
  const last = present.pop();
  return present.length === 0 ? (last ?? '') : `${present.join(', ')} and ${last}`;
}

/** The vanilla tint source of a leaf tint (`MsmRuntimeClient.tintSource`). */
function tintSource(file: JavaFile, tint: LeafTint): string {
  const sources = file.use('net.minecraft.client.color.block.BlockTintSources');
  if ('rgb' in tint) {
    // A constant colour gets full alpha, as vanilla's spruce and birch leaves.
    const argb = (0xff000000 | tint.rgb) >>> 0;
    return `${sources}.constant(0x${argb.toString(16).toUpperCase().padStart(8, '0')})`;
  }
  switch (tint.source) {
    case 'foliage':
      return `${sources}.foliage()`;
    case 'grass':
      return `${sources}.grass()`;
    case 'dry_foliage':
      return `${sources}.dryFoliage()`;
  }
}

function writeModel(context: GenerationContext, entity: EntityNames): void {
  const { model } = entity.spec;
  const file = new JavaFile(packageOf(context, 'client.entity'), entity.spec.input.path);
  const entityClass = file.use(`${packageOf(context, 'entity')}.${entity.entityClass}`);
  const lines = [
    `/** The GeckoLib model, animations and texture of {@code ${entity.spec.input.id}}. */`,
    `public class ${entity.modelClass} extends GeoModelBase<${entityClass}> {`,
    `    public ${entity.modelClass}() {`,
    `        super(${identifierExpression(file, model.model)},`,
    `                ${identifierExpression(file, model.animations)},`,
    `                ${identifierExpression(file, model.texture)});`,
    '    }',
    '}',
  ];
  context.files.push({
    path: classPath(context, 'client.entity', entity.modelClass),
    contents: file.render(lines),
  });
}
