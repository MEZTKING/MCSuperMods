/**
 * The mod initialiser: `<ModClass>.java`, a `ModInitializer` that registers its content in the
 * runtime's order: the project's sound events first (ADR 0057 D5), status effects (items name
 * them), potions (ADR 0063 D8), the thrown item entity type, blocks
 * with their items, the block entity types and machine recipe types (ADR 0074 D9, ADR 0075 D11),
 * then items, then entities with their spawn eggs; with portals (ADR 0077 D9) the portal index
 * attachment, the igniter callback and the start-up check of the portals' levels last, as
 * `MsmRuntime.onInitialize` does.
 *
 * @packageDocumentation
 */

import { classPath, type GenerationContext } from './context';
import { indent, JavaFile, javaString } from './java';

/**
 * Generates `<ModClass>.java`.
 *
 * @param registrations - The registration classes, in order: simple names in the mod package,
 *   or `<sub-package>.<Name>` (for example `entity.ThrownItemEntity`).
 * @param after - Lines after the registrations (statements of `onInitialize`), given the file
 *   for imports.
 * @returns The fully qualified initialiser class.
 */
export function generateMod(
  context: GenerationContext,
  registrations: readonly string[],
  after?: (file: JavaFile) => string[],
): string {
  const { javaPackage, modClassName, modId } = context.input;
  const file = new JavaFile(javaPackage, 'the project');
  const initializer = file.use('net.fabricmc.api.ModInitializer');
  const lines = [
    `/** The mod {@code ${modId}}: registers its content at start-up. */`,
    `public final class ${modClassName} implements ${initializer} {`,
    `    public static final String MOD_ID = ${javaString(modId)};`,
    '',
    '    @Override',
    '    public void onInitialize() {',
    ...indent(
      registrations.map(
        (name) => `${name.includes('.') ? file.use(`${javaPackage}.${name}`) : name}.register();`,
      ),
      2,
    ),
    ...indent(after?.(file) ?? [], 2),
    '    }',
    '}',
  ];
  context.files.push({ path: classPath(context, '', modClassName), contents: file.render(lines) });
  return `${javaPackage}.${modClassName}`;
}
