/**
 * The mod initialiser: `<ModClass>.java`, a `ModInitializer` that registers its content in the
 * runtime's order: status effects first (items name them), the thrown item entity type, blocks
 * with their items, then items, then entities with their spawn eggs.
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
 * @returns The fully qualified initialiser class.
 */
export function generateMod(context: GenerationContext, registrations: readonly string[]): string {
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
    '    }',
    '}',
  ];
  context.files.push({ path: classPath(context, '', modClassName), contents: file.render(lines) });
  return `${javaPackage}.${modClassName}`;
}
