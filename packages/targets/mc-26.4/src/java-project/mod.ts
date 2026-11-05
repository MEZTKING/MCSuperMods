/**
 * The mod initialiser: `<ModClass>.java`, a `ModInitializer` that registers blocks, items and
 * entities in the runtime's order (blocks with their items first, then items, then entities
 * with their spawn eggs).
 *
 * @packageDocumentation
 */

import { classPath, type GenerationContext } from './context';
import { indent, JavaFile, javaString } from './java';

/**
 * Generates `<ModClass>.java`.
 *
 * @param registrations - The simple names of the registration classes, in order.
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
      registrations.map((name) => `${name}.register();`),
      2,
    ),
    '    }',
    '}',
  ];
  context.files.push({ path: classPath(context, '', modClassName), contents: file.render(lines) });
  return `${javaPackage}.${modClassName}`;
}
