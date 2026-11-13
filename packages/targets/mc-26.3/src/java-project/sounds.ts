/**
 * Project sound events (ADR 0057 D5): `ModSounds.java` registers one variable-range
 * `SoundEvent` per key of `JavaProjectInput.soundEvents` (the event keys of the resource pack's
 * `assets/<namespace>/sounds.json` files), first in the mod initialiser, mirroring the
 * runtime's `MsmRegistrar.registerSounds` and `SoundScanner`: keys in the given (sorted) order,
 * each once, the namespace `minecraft` left out, and a key already registered (by vanilla or
 * another mod) skipped. A silent project writes no `ModSounds`. Minecraft 26.3, Mojang names.
 *
 * @packageDocumentation
 */

import { classPath, type GenerationContext } from './context';
import { indent, JavaFile, javaString } from './java';

/** A namespaced sound event id: `<namespace>:<path>`, the characters `Identifier` accepts. */
const SOUND_ID = /^[a-z0-9_.-]+:[a-z0-9_./-]+$/;

/**
 * The sound event ids to register: each once, in the given order, without `minecraft`.
 * Throws for an id that is not namespaced or not a valid identifier.
 */
export function soundEventIds(soundEvents: readonly string[]): string[] {
  const out: string[] = [];
  for (const id of soundEvents) {
    if (!SOUND_ID.test(id)) {
      throw new Error(`Sound event ${JSON.stringify(id)} is not a namespaced sound event id.`);
    }
    if (id.startsWith('minecraft:') || out.includes(id)) continue;
    out.push(id);
  }
  return out;
}

/**
 * Generates `ModSounds.java`; returns nothing when the project defines no sound events.
 *
 * @returns The simple name of the registration class, or `undefined`.
 */
export function generateSounds(context: GenerationContext): string | undefined {
  const ids = soundEventIds(context.input.soundEvents ?? []);
  if (ids.length === 0) return undefined;
  const file = new JavaFile(context.input.javaPackage, 'the assets/<namespace>/sounds.json files');
  const list = file.use('java.util.List');
  const registry = file.use('net.minecraft.core.Registry');
  const builtIn = file.use('net.minecraft.core.registries.BuiltInRegistries');
  const identifier = file.use('net.minecraft.resources.Identifier');
  const soundEvent = file.use('net.minecraft.sounds.SoundEvent');
  const keys = ids.map((id, index) => `${javaString(id)}${index === ids.length - 1 ? ');' : ','}`);
  const lines = [
    '/**',
    ' * The sound events of the resource pack, registered before everything else: status effects, items, events and',
    ' * entities name them.',
    ' */',
    'public final class ModSounds {',
    '    /** The event keys of the assets/<namespace>/sounds.json files, sorted. */',
    `    public static final ${list}<String> KEYS = ${list}.of(`,
    ...indent(keys, 3),
    '',
    '    private ModSounds() {}',
    '',
    '    /** Registers one variable-range sound event per key; a key already registered (by vanilla or another mod) is skipped. */',
    '    public static void register() {',
    '        for (String key : KEYS) {',
    `            ${identifier} id = ${identifier}.parse(key);`,
    `            if (!${builtIn}.SOUND_EVENT.containsKey(id)) {`,
    `                ${registry}.register(${builtIn}.SOUND_EVENT, id, ${soundEvent}.createVariableRangeEvent(id));`,
    '            }',
    '        }',
    '    }',
    '}',
  ];
  context.files.push({ path: classPath(context, '', 'ModSounds'), contents: file.render(lines) });
  return 'ModSounds';
}
