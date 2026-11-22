// B650 spike (throwaway): today's matchers on the draft query set (SQ5), each over its own list.
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import type { Element, ElementTemplate, ExampleProject, Plugin } from '@msm/plugin-api';
import { describe, it } from 'vitest';
import { BUILT_IN_COMMANDS } from '../../src/renderer/src/commands/built-in-commands';
import { filterCommands } from '../../src/renderer/src/components/CommandPalette';
import { matchesSearch } from '../../src/renderer/src/components/ElementSidebar';
import { exampleMatches } from '../../src/renderer/src/components/ExamplesDialog';
import { templateMatches } from '../../src/renderer/src/components/NewElementDialog';
import { filterThings, type ThingSection, thingWords } from '../../src/renderer/src/components/thing-picker/thing-sources';
import { builtInPlugins } from '../../src/renderer/src/plugins/built-in';

const OUT = process.env.B650_OUT ?? '/tmp/b650';
const ROOT = join(__dirname, '../../..');

interface Query { q: string; class: string; project?: string; expect: string | null }

describe('B650 baseline', () => {
  it('runs today’s matchers', () => {
    const queries = (JSON.parse(readFileSync(join(ROOT, 'docs/reference/spikes/b650/queries-draft.json'), 'utf8')) as { queries: Query[] }).queries;
    const plugins = builtInPlugins as Plugin[];
    const templates: ElementTemplate[] = plugins.flatMap((p) => p.contributes.elementTemplates ?? []);
    const examples: ExampleProject[] = plugins.flatMap((p) => p.contributes.examples ?? []);
    const commands = Object.entries(BUILT_IN_COMMANDS).map(([id, c]) => ({ id, title: c.title }));
    const regs = JSON.parse(readFileSync(join(ROOT, 'packages/targets/mc-26.3/vendor/mcmeta/registries.json'), 'utf8')) as Record<string, string[]>;
    const sorts: [string, string, string][] = [['block', 'block', 'thing'], ['item', 'item', 'thing'], ['entity_type', 'mob', 'entity_type'], ['mob_effect', 'effect', 'mob_effect'], ['worldgen/biome', 'biome', 'worldgen/biome']];
    const sections: ThingSection[] = sorts.map(([registry, sort]) => ({
      id: registry,
      label: sort,
      things: (regs[registry] ?? []).map((path) => ({ id: `minecraft:${path}`, name: thingWords(`minecraft:${path}`), sort, source: 'vanilla', picture: null }) as never),
    }));
    const elements: Element[] = [];
    const dir = join(ROOT, 'fixtures/sample-mod/content');
    const walk = (path: string): void => {
      for (const name of readdirSync(path)) {
        const full = join(path, name);
        if (statSync(full).isDirectory()) walk(full);
        else if (name.endsWith('.json')) {
          const [ns, ...rest] = relative(dir, full).replace(/\.json$/, '').split('/');
          elements.push({ id: `${ns}:${rest.join('/')}`, kind: rest.slice(0, -1).join('/'), data: {} } as unknown as Element);
        }
      }
    };
    walk(dir);
    const out: unknown[] = [];
    let first = 0;
    let top3 = 0;
    const byClass: Record<string, { n: number; first: number; top3: number }> = {};
    for (const query of queries) {
      const lists: Record<string, string[]> = {
        command: filterCommands(commands, query.q).map((c) => `command:${c.id}`),
        template: templates.filter((t) => templateMatches(t, query.q)).map((t) => `template:${t.id}`),
        example: examples.filter((e) => exampleMatches(e, query.q)).map((e) => `example:${e.id}`),
        vanilla: filterThings(sections, query.q).flatMap((s) => s.things.map((t) => `vanilla:${s.id === 'block' || s.id === 'item' ? 'thing' : s.id}:${t.id.slice(10)}`)),
        project: query.project === 'sample-mod' ? elements.filter((e) => matchesSearch(e, query.q)).map((e) => `project:${e.id.split(':')[0]}:${e.id.split(':')[1]}`) : [],
      };
      const c = (byClass[query.class] ??= { n: 0, first: 0, top3: 0 });
      c.n++;
      let rank = -1;
      if (query.expect === null) rank = Object.values(lists).every((l) => l.length === 0) ? 0 : -1;
      else {
        const source = query.expect.split(':')[0] as string;
        const list = lists[source];
        rank = list === undefined ? -1 : [...new Set(list)].indexOf(query.expect);
      }
      if (rank === 0) { first++; c.first++; }
      if (rank >= 0 && rank < 3) { top3++; c.top3++; }
      out.push({ q: query.q, expect: query.expect, rank, counts: Object.fromEntries(Object.entries(lists).map(([k, v]) => [k, v.length])) });
    }
    writeFileSync(join(OUT, 'baseline.json'), JSON.stringify({ total: { n: queries.length, first, top3 }, byClass, queries: out }, null, 1));
  });
});
