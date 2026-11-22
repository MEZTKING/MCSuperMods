// B650 spike (throwaway): the vanilla layer from the target's vendored registries, named from the
// user's own jar when one is given (read into memory at run time, never written anywhere), and a
// made-up mod of N things for the project layer.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import type { Entry } from './engine.ts';

export const VANILLA_SORTS: Record<string, { label: string; lang?: string }> = {
  block: { label: 'block', lang: 'block' },
  item: { label: 'item', lang: 'item' },
  entity_type: { label: 'mob', lang: 'entity' },
  mob_effect: { label: 'effect', lang: 'effect' },
  enchantment: { label: 'enchantment', lang: 'enchantment' },
  potion: { label: 'potion' },
  particle_type: { label: 'particle' },
  sound_event: { label: 'sound' },
  'worldgen/biome': { label: 'biome', lang: 'biome' },
};

export function registries(repo: string, target: 'mc-26.3' | 'mc-26.4'): Record<string, string[]> {
  return JSON.parse(readFileSync(`${repo}/packages/targets/${target}/vendor/mcmeta/registries.json`, 'utf8'));
}

/** `en_us.json` of a client jar, read into memory with `unzip -p` (never saved). */
export function jarNames(jar: string): { names: Record<string, string>; bytes: number; ms: number } {
  const t0 = performance.now();
  const buf = execFileSync('unzip', ['-p', jar, 'assets/minecraft/lang/en_us.json'], { maxBuffer: 8 << 20 });
  const names = JSON.parse(buf.toString('utf8')) as Record<string, string>;
  return { names, bytes: buf.length, ms: performance.now() - t0 };
}

const wordsOf = (path: string): string => path.replace(/[_/]/g, ' ');

export function vanillaEntries(regs: Record<string, string[]>, names?: Record<string, string>): Entry[] {
  const out = new Map<string, Entry>();
  for (const [registry, sort] of Object.entries(VANILLA_SORTS)) {
    for (const path of regs[registry] ?? []) {
      const id = `minecraft:${path}`;
      const named = sort.lang !== undefined ? names?.[`${sort.lang}.minecraft.${path.replace(/\//g, '.')}`] : registry === 'potion' ? names?.[`item.minecraft.potion.effect.${path}`] : undefined;
      // a block and its item are one entry
      const key = registry === 'item' || registry === 'block' ? `thing:${path}` : `${registry}:${path}`;
      const prev = out.get(key);
      if (prev !== undefined) {
        prev.words?.push(sort.label);
        if (named !== undefined && prev.title === wordsOf(path)) prev.title = named;
        continue;
      }
      out.set(key, {
        id: `vanilla:${key}`,
        source: 'vanilla',
        title: named ?? wordsOf(path),
        words: [sort.label],
        ids: [id],
        technical: registry === 'sound_event' || registry === 'particle_type',
        available: true,
      });
    }
  }
  return [...out.values()];
}

/** The words of every vanilla id: the protected list of the stemmer (ADR 0124 D4). */
export function vanillaWords(regs: Record<string, string[]>): Set<string> {
  const out = new Set<string>();
  for (const registry of Object.keys(VANILLA_SORTS)) for (const path of regs[registry] ?? []) for (const w of path.split(/[_/.]/)) if (w.length > 3) out.add(w);
  return out;
}

const ADJ = ['ruby', 'maple', 'frost', 'ember', 'moon', 'storm', 'shadow', 'crystal', 'golden', 'ancient', 'mossy', 'royal', 'lucky', 'tiny', 'giant', 'sky', 'deep', 'wild', 'iron', 'copper'];
const NOUN = ['sword', 'block', 'bricks', 'ore', 'pickaxe', 'helmet', 'wand', 'golem', 'bat', 'apple', 'potion', 'lantern', 'door', 'slab', 'stairs', 'crate', 'boat', 'car', 'flower', 'tree', 'portal', 'rune', 'charm', 'beetle', 'fox'];
const KIND = ['item', 'block', 'entity', 'recipe', 'loot_table', 'tag/item', 'model/item', 'effect', 'rules', 'script'];

/** A made-up mod of `n` things (names, ids and kinds), deterministic. */
export function madeUpMod(n: number): Entry[] {
  const out: Entry[] = [];
  for (let i = 0; i < n; i++) {
    const a = ADJ[i % ADJ.length] as string;
    const b = NOUN[Math.floor(i / ADJ.length) % NOUN.length] as string;
    const k = KIND[(i * 7) % KIND.length] as string;
    const path = `${a}_${b}${i >= ADJ.length * NOUN.length ? `_${Math.floor(i / (ADJ.length * NOUN.length))}` : ''}`;
    out.push({ id: `project:mymod:${k}/${path}`, source: 'project', title: `${a} ${b}`.replace(/\b[a-z]/g, (c) => c.toUpperCase()), words: [k], ids: [`mymod:${path}`], available: true });
  }
  return out;
}
