/**
 * The client entrypoint (when the project has entities or throwables, ADR 0055 D10): vanilla's
 * `ThrownItemRenderer` for the thrown item entity as the runtime's `MsmRuntimeClient` registers
 * it, with or without GeckoLib (ADR 0056 D4); and the GeckoLib models, mirroring the runtime's `GeckolibRenderers` and
 * `MsmGeoModel`: one `GeoEntityRenderer(ctx, model).withScale(f)` per entity type through
 * vanilla `EntityRenderers.register` (private in 26.3, widened by Fabric API's transitive
 * access wideners). Minecraft 26.3 and GeckoLib 5, Mojang names.
 *
 * @packageDocumentation
 */

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
 * @returns The fully qualified client entrypoint class.
 */
export function generateClient(
  context: GenerationContext,
  entities: readonly EntityNames[],
  throwables: boolean,
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
  const source =
    entities.length === 0
      ? 'the msm:throwable components'
      : throwables
        ? 'the msm/<namespace>/entity/*.json definitions and the msm:throwable components'
        : 'the msm/<namespace>/entity/*.json definitions';
  const file = new JavaFile(clientPackage, source);
  const initializer = file.use('net.fabricmc.api.ClientModInitializer');
  const renderers = file.use('net.minecraft.client.renderer.entity.EntityRenderers');

  const body: string[] = [];
  if (throwables) {
    const thrownRenderer = file.use('net.minecraft.client.renderer.entity.ThrownItemRenderer');
    const thrown = file.use(`${packageOf(context, 'entity')}.ThrownItemEntity`);
    body.push(
      '// Thrown items: their item model as a camera-facing sprite, as a snowball.',
      `${renderers}.register(${thrown}.TYPE, ${thrownRenderer}<${thrown}>::new);`,
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
      `${renderers}.register(${modEntities}.${entity.field}, ctx -> new ${geoRenderer}<${entityClass}, ${renderState}>(ctx, ${variable})`,
      `        .withScale(${javaFloat(entity.spec.model.scale)}));`,
    );
    writeModel(context, entity);
  }
  const lines = [
    `/** Client entrypoint: ${[throwables ? "vanilla's thrown item renderer" : undefined, entities.length > 0 ? 'a GeckoLib renderer per entity type' : undefined].filter((part) => part !== undefined).join(' and ')}. */`,
    `public final class ${name} implements ${initializer} {`,
    '    // Renderer providers are read when the client builds its entity renderers, after client initialisation.',
    '    @Override',
    '    public void onInitializeClient() {',
    ...indent(body, 2),
    '    }',
    '}',
  ];
  context.files.push({ path: classPath(context, 'client', name), contents: file.render(lines) });
  return `${clientPackage}.${name}`;
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
