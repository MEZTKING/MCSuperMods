import { describe, expect, it } from 'vitest';
import { builtInTargets } from '../src/index';
import { clientJarPath, zipEntryBytes, zipJsonEntries } from './client-jar';

/**
 * `BlockFacts.soundTypes`, `soundModel`, `vanillaPairs` and `plantSoils` (ADR 0103 D5, ADR 0105
 * D5) against the client jar Fabric Loom caches: the default data pack's block transformers and
 * block tags are read (data files), and the sound type class only for its field names and types
 * (signatures, as javap without `-c` shows them; no method body is read). Skipped without a jar:
 * MSM never bundles Mojang files.
 */
const DATA = 'data/minecraft/';
const SOUND_TYPE_CLASS = 'net/minecraft/world/level/block/SoundType.class';
const SOUND_TYPE_DESCRIPTOR = 'Lnet/minecraft/world/level/block/SoundType;';

type Json = Record<string, unknown>;

/**
 * The names of the `public static final` fields of a class file whose descriptor is
 * `descriptor`: the constant pool and the field table only.
 */
function staticFieldsOfType(bytes: Buffer, descriptor: string): string[] {
  if (bytes.readUInt32BE(0) !== 0xcafebabe) throw new Error('not a class file');
  const count = bytes.readUInt16BE(8);
  const utf8: (string | undefined)[] = [];
  let at = 10;
  for (let index = 1; index < count; index++) {
    const tag = bytes.readUInt8(at);
    at += 1;
    switch (tag) {
      case 1: {
        const length = bytes.readUInt16BE(at);
        utf8[index] = bytes.toString('utf8', at + 2, at + 2 + length);
        at += 2 + length;
        break;
      }
      case 3:
      case 4:
      case 9:
      case 10:
      case 11:
      case 12:
      case 17:
      case 18:
        at += 4;
        break;
      case 5:
      case 6:
        at += 8;
        index++;
        break;
      case 7:
      case 8:
      case 16:
      case 19:
      case 20:
        at += 2;
        break;
      case 15:
        at += 3;
        break;
      default:
        throw new Error(`unknown constant pool tag ${tag}`);
    }
  }
  at += 6; // access flags, this class, super class
  at += 2 + 2 * bytes.readUInt16BE(at); // interfaces
  const fields = bytes.readUInt16BE(at);
  at += 2;
  const names: string[] = [];
  const publicStaticFinal = 0x0001 | 0x0008 | 0x0010;
  for (let n = 0; n < fields; n++) {
    const flags = bytes.readUInt16BE(at);
    const name = utf8[bytes.readUInt16BE(at + 2)];
    const type = utf8[bytes.readUInt16BE(at + 4)];
    const attributes = bytes.readUInt16BE(at + 6);
    at += 8;
    for (let a = 0; a < attributes; a++) at += 6 + bytes.readUInt32BE(at + 2);
    if ((flags & publicStaticFinal) === publicStaticFinal && type === descriptor && name) {
      names.push(name);
    }
  }
  return names;
}

describe.each(builtInTargets.map((bundle) => [bundle.target.id, bundle.target] as const))(
  'block facts of %s against the client jar',
  (id, target) => {
    const jar = clientJarPath(id, target.mcVersion);

    it.skipIf(jar === undefined)('lists the sound type names of the sound model', async () => {
      const bytes = await zipEntryBytes(jar ?? '', SOUND_TYPE_CLASS);
      if (target.blocks?.soundModel === 'sound_type') {
        expect(bytes, 'SoundType class').toBeDefined();
        const names = staticFieldsOfType(bytes ?? Buffer.alloc(0), SOUND_TYPE_DESCRIPTOR)
          .map((name) => name.toLowerCase())
          .sort();
        expect(target.blocks?.soundTypes).toEqual(names);
      } else {
        // `block_sound_set`: the class is gone; the names are the registry's (per-target test).
        expect(target.blocks?.soundModel).toBe('block_sound_set');
        expect(bytes).toBeUndefined();
      }
    });

    it.skipIf(jar === undefined)(
      "lists vanilla's strip, flatten, till, wax and age pairs from the block transformers",
      async () => {
        const files = await zipJsonEntries(
          jar ?? '',
          ['block_transformer/', 'tags/block/'].map((folder) => DATA + folder),
        );
        const file = (folder: string, name: string): unknown => {
          const value = files.get(`${DATA}${folder}/${name}.json`);
          if (value === undefined) throw new Error(`${folder}/${name} is not in the jar`);
          return value;
        };
        const tag = (name: string): string[] =>
          ((file('tags/block', name) as Json).values as unknown[]).flatMap((value) => {
            const ref = typeof value === 'object' ? ((value as Json).id as string) : String(value);
            return ref.startsWith('#') ? tag(ref.slice(1).replace('minecraft:', '')) : [ref];
          });
        /** The blocks a rule's predicate matches at the used block (offset predicates skipped). */
        const blocksOf = (predicate: Json): string[] => {
          if (predicate.offset !== undefined) return [];
          switch (predicate.type) {
            case 'minecraft:matching_blocks':
              return typeof predicate.blocks === 'string'
                ? [predicate.blocks]
                : (predicate.blocks as string[]);
            case 'minecraft:matching_block_tag':
              return tag(String(predicate.tag).replace('minecraft:', ''));
            case 'minecraft:all_of':
              return (predicate.predicates as Json[]).flatMap(blocksOf);
            default:
              throw new Error(`unexpected predicate ${String(predicate.type)}`);
          }
        };
        const kinds: Record<string, string> = {
          'minecraft:item.axe.strip': 'strip',
          'minecraft:item.axe.scrape': 'scrape',
          'minecraft:item.axe.wax_off': 'waxOff',
          'minecraft:item.shovel.flatten': 'flatten',
          'minecraft:item.hoe.till': 'till',
        };
        const found: Record<string, Record<string, string>> = {};
        for (const tool of ['axe', 'shovel', 'hoe']) {
          for (const transform of file('block_transformer', tool) as Json[]) {
            const kind = kinds[String(transform.sound)];
            if (kind === undefined)
              throw new Error(`unexpected transform ${String(transform.sound)}`);
            const provider = transform.block_state_provider as Json;
            expect(provider.type).toBe('minecraft:rule_based');
            for (const rule of provider.rules as Json[]) {
              const then = rule.then as Json;
              const into =
                then.type === 'minecraft:copy_properties'
                  ? String((then.source as Json).id)
                  : String(then.id);
              for (const from of blocksOf(rule.if_true as Json)) {
                found[kind] ??= {};
                const pairs = found[kind];
                expect(pairs[from] ?? into, `${kind} ${from}`).toBe(into);
                pairs[from] = into;
              }
            }
          }
        }
        const reverse = (pairs: Record<string, string>): Record<string, string> =>
          Object.fromEntries(Object.entries(pairs).map(([from, into]) => [into, from]));
        const sorted = (pairs: Record<string, string> = {}): Record<string, string> =>
          Object.fromEntries(Object.entries(pairs).sort(([a], [b]) => (a < b ? -1 : 1)));
        expect(target.blocks?.vanillaPairs).toEqual({
          strip: sorted(found.strip),
          flatten: sorted(found.flatten),
          till: sorted(found.till),
          wax: sorted(reverse(found.waxOff ?? {})),
          age: sorted(reverse(found.scrape ?? {})),
        });
      },
    );

    it.skipIf(jar === undefined)('names plant soil tags the jar has', async () => {
      const files = await zipJsonEntries(jar ?? '', [`${DATA}tags/block/`]);
      for (const tagId of Object.values(target.blocks?.plantSoils ?? {})) {
        const name = `${DATA}tags/block/${tagId.replace('minecraft:', '')}.json`;
        expect(files.has(name), tagId).toBe(true);
      }
    });
  },
);
