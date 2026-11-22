// B650 spike (throwaway): collects the real search corpus from the built-in plugin registry and
// the app's own lists, per target, into the scratchpad. MSM's own text only: no jar is read here.
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import type { Json, Plugin, StarterParameter } from '@msm/plugin-api';
import { CONDITIONS, STEPS, TRIGGERS, VALUES } from '@msm/plugin-rules';
import { targetFacts } from '@msm/targets';
import { describe, expect, it } from 'vitest';
import { BUILT_IN_COMMANDS } from '../../src/renderer/src/commands/built-in-commands';
import { MAKE_TILES } from '../../src/renderer/src/components/home/tiles';
import { PLAIN_FIX_LABELS, PLAIN_PROBLEMS } from '../../src/renderer/src/session/plain-problems';
import { SHOWCASES } from '../../src/renderer/src/showcase/showcases';
import { builtInPlugins } from '../../src/renderer/src/plugins/built-in';

const OUT = process.env.B650_OUT ?? '/tmp/b650';
const ROOT = join(__dirname, '../../..');

/** A spike entry: the draft `SearchEntry` without action and preview descriptors. */
interface SpikeEntry {
  id: string;
  source: string;
  title: string;
  sentence?: string;
  words?: string[];
  body?: string;
  ids?: string[];
  plugin?: string;
  technical?: boolean;
  available: boolean;
  questions?: unknown[];
}

const questionOf = (parameter: StarterParameter): unknown => {
  const base = { id: parameter.id, label: parameter.label, type: parameter.type, group: parameter.group };
  switch (parameter.type) {
    case 'choice':
    case 'set':
      return { ...base, default: parameter.default, choices: parameter.choices };
    case 'number':
      return { ...base, default: parameter.default, min: parameter.min, max: parameter.max, step: parameter.step };
    case 'string':
      return { ...base, default: parameter.default, pattern: parameter.pattern, maxLength: parameter.maxLength };
    default:
      return { ...base, default: parameter.default as Json };
  }
};

const guideEntries = (): SpikeEntry[] => {
  const dir = join(ROOT, 'docs/guide');
  const out: SpikeEntry[] = [];
  for (const file of readdirSync(dir).filter((name) => name.endsWith('.md')).sort()) {
    const text = readFileSync(join(dir, file), 'utf8');
    const lines = text.split('\n');
    let heading: string | null = null;
    let body: string[] = [];
    let page = '';
    const flush = (): void => {
      if (heading === null) return;
      const paragraph = body.join(' ').replace(/\s+/g, ' ').trim();
      out.push({
        id: `guide:${file}#${heading.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
        source: 'guide',
        title: heading,
        sentence: paragraph.split(/(?<=\.)\s/)[0]?.slice(0, 200),
        body: paragraph.slice(0, 600),
        words: [page],
        available: true,
      });
    };
    for (const line of lines) {
      const h1 = /^# (.+)/.exec(line);
      const h = /^#{2,3} (.+)/.exec(line);
      if (h1) page = h1[1] ?? '';
      if (h) {
        flush();
        heading = h[1] ?? '';
        body = [];
      } else if (heading !== null && line.trim() !== '' && !/^\|[\s|:-]*$/.test(line)) body.push(line.replace(/\|/g, ' '));
    }
    flush();
  }
  return out;
};

const SETTINGS: SpikeEntry[] = [
  ['Official launcher folder', 'Game locations', 'Where Minecraft is installed.'],
  ['Other launchers', 'Game locations', 'Prism, MultiMC, PolyMC and CurseForge folders.'],
  ['Install target', 'Game locations', 'Which game or instance Install and Play use.'],
  ['Vanilla assets', 'Vanilla assets', "Minecraft's own pictures and models, from your jar."],
  ['Check for updates automatically', 'Updates', 'Look for a new version when the app starts.'],
  ['Play showcase clips', 'Showcase', 'Let the Showcase cards play their moving pictures.'],
  ['Keep world backups', 'World backups', 'Back up a world before Play writes to it.'],
  ['AI helper key', 'AI helper', 'Your own key for the AI helper.'],
  ['AI model', 'AI helper', 'Which model the AI helper uses.'],
  ['AI pictures key', 'AI pictures', 'Your own key for Make with AI pictures.'],
  ['Plugins', 'Plugins', 'Turn third-party plugins on or off.'],
  ['Mode', 'View', 'Very easy, Easy or Advanced.'],
].map(([title, section, sentence]) => ({
  id: `setting:${(title as string).toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
  source: 'setting',
  title: title as string,
  sentence: sentence as string,
  words: [section as string, 'settings'],
  available: true,
}));

const projectEntries = (fixture: string): SpikeEntry[] => {
  const dir = join(ROOT, 'fixtures', fixture, 'content');
  const out: SpikeEntry[] = [];
  const walk = (path: string): void => {
    for (const name of readdirSync(path)) {
      const full = join(path, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (name.endsWith('.json')) {
        const rel = relative(dir, full).replace(/\.json$/, '');
        const [ns, ...rest] = rel.split('/');
        const kindFolder = rest.slice(0, -1).join('/');
        const path2 = rest.join('/');
        const id = `${ns}:${path2}`;
        let display: string | undefined;
        try {
          const data = JSON.parse(readFileSync(full, 'utf8')) as Record<string, unknown>;
          const name2 = data.display_name ?? data.name;
          if (typeof name2 === 'string') display = name2;
        } catch {}
        out.push({
          id: `project:${id}`,
          source: 'project',
          title: display ?? (rest.at(-1) ?? '').replace(/_/g, ' '),
          words: [kindFolder],
          ids: [id],
          available: true,
        });
      }
    }
  };
  walk(dir);
  return out;
};

const collect = (targetId: string): SpikeEntry[] => {
  const target = targetFacts(targetId);
  if (target === undefined) throw new Error(targetId);
  const entries: SpikeEntry[] = [];
  for (const plugin of builtInPlugins as Plugin[]) {
    const c = plugin.contributes;
    for (const kind of c.elementKinds ?? []) {
      entries.push({
        id: `kind:${kind.id}`,
        source: 'kind',
        title: kind.id.replace(/^[a-z]+:/, '').replace(/[_/]/g, ' '),
        ids: [kind.id],
        plugin: plugin.id,
        technical: kind.id.startsWith('minecraft:'),
        available: true,
      });
    }
    for (const template of c.elementTemplates ?? []) {
      entries.push({
        id: `template:${template.id}`,
        source: 'template',
        title: template.title,
        sentence: template.description,
        words: [template.category],
        ids: [template.kind, template.id],
        plugin: plugin.id,
        technical: true,
        available: template.supports?.(target) ?? true,
      });
    }
    for (const starter of c.projectStarters ?? []) {
      entries.push({
        id: `${starter.creator ? 'flow' : 'starter'}:${starter.id}`,
        source: starter.creator ? 'flow' : 'starter',
        title: starter.title,
        sentence: starter.creator?.blurb ?? starter.description,
        body: starter.description,
        words: starter.creator ? [starter.creator.group] : [starter.category],
        ids: [starter.id],
        plugin: plugin.id,
        available: starter.supports?.(target) ?? true,
        questions: (starter.parameters ?? []).map(questionOf),
      });
    }
    for (const example of c.examples ?? []) {
      entries.push({
        id: `example:${example.id}`,
        source: 'example',
        title: example.title,
        sentence: example.description,
        words: [example.category, ...(example.tags ?? [])],
        ids: [example.kind, example.id],
        plugin: plugin.id,
        available: example.supports?.(target) ?? true,
      });
    }
    for (const command of c.commands ?? []) {
      entries.push({
        id: `command:${command.id}`,
        source: 'command',
        title: command.title,
        plugin: plugin.id,
        available: true,
      });
    }
  }
  for (const [id, { title }] of Object.entries(BUILT_IN_COMMANDS)) {
    entries.push({ id: `command:${id}`, source: 'command', title, available: true });
  }
  for (const [section, list] of [
    ['trigger', TRIGGERS],
    ['step', STEPS],
    ['condition', CONDITIONS],
    ['value', VALUES],
  ] as const) {
    for (const entry of list) {
      entries.push({
        id: `rule:${section}:${entry.id}`,
        source: 'rule',
        title: entry.label,
        sentence: entry.sentence.replace(/\{[a-z_]+\}/g, '…'),
        words: [section === 'trigger' ? 'when' : section === 'step' ? 'do' : section],
        ids: [entry.id],
        available: true,
      });
    }
  }
  for (const [code, entry] of Object.entries(PLAIN_PROBLEMS)) {
    entries.push({
      id: `problem:${code}`,
      source: 'problem',
      title: entry.words('this thing'),
      words: entry.fix ? [PLAIN_FIX_LABELS[entry.fix]] : [],
      ids: [code],
      available: true,
    });
  }
  for (const tile of MAKE_TILES) {
    entries.push({
      id: `tile:${tile.id}`,
      source: 'tile',
      title: tile.label,
      sentence: tile.sentence,
      words: [tile.group],
      ids: tile.action.type === 'flows' ? [...tile.action.flowIds, ...(tile.action.starterIds ?? [])] : [],
      available: true,
    });
  }
  for (const clip of SHOWCASES) {
    const c = clip as unknown as Record<string, unknown>;
    entries.push({
      id: `showcase:${String(c.id)}`,
      source: 'showcase',
      title: String(c.title ?? c.id),
      sentence: typeof c.sentence === 'string' ? c.sentence : typeof c.blurb === 'string' ? c.blurb : undefined,
      ids: [String(c.exampleId ?? c.flowId ?? '')],
      available: true,
    });
  }
  entries.push(...SETTINGS, ...guideEntries());
  return entries;
};

describe('B650 corpus', () => {
  it('collects both targets', () => {
    for (const id of ['mc-26.3', 'mc-26.4']) {
      const entries = collect(id);
      writeFileSync(join(OUT, `corpus-${id}.json`), JSON.stringify(entries));
      writeFileSync(join(OUT, `project-sample-mod.json`), JSON.stringify(projectEntries('sample-mod')));
      expect(entries.length).toBeGreaterThan(1000);
    }
  });
});
