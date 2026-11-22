// B650 spike (throwaway): SQ13, search data from the sample plugin through the sandbox's describe
// path (the `node:vm` stand-in of the plugin tests), its size, and a draft check that a plugin
// names only its own things.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createPluginWorker, type PluginDescription } from '../../src/renderer/src/plugins/sandbox/host';
import { sampleBundle, vmWorkers } from '../helpers/plugins-fixtures';

const OUT = process.env.B650_OUT ?? '/tmp/b650';

/** The draft `validateSearchContributions` (B651): limits and own-things only. */
function check(description: PluginDescription, limits = { lines: 500, entries: 50, chars: 200 }): string[] {
  const problems: string[] = [];
  const c = description.contributes;
  const own = new Set<string>();
  for (const point of ['elementKinds', 'elementTemplates', 'projectStarters', 'examples', 'commands']) for (const e of c[point] ?? []) own.add(String(e.data.id));
  const words = (c.searchVocabulary ?? []).map((e) => e.data);
  if (words.length > limits.lines) problems.push(`vocabulary: ${words.length} lines, at most ${limits.lines}`);
  for (const w of words) for (const s of [w.idea, ...((w.same as unknown[]) ?? [])]) if (typeof s !== 'string' || s.length > limits.chars) problems.push(`vocabulary: a word longer than ${limits.chars}`);
  const entries = (c.searchEntries ?? []).map((e) => e.data as { id: string; opens?: { type: string; id: string } });
  if (entries.length > limits.entries) problems.push(`entries: ${entries.length}, at most ${limits.entries}`);
  for (const e of entries) if (e.opens === undefined || !own.has(e.opens.id)) problems.push(`entry ${e.id}: opens ${e.opens?.type} ${e.opens?.id}, not one of the plugin's own`);
  for (const e of c.searchEntries ?? []) if (e.functions.length > 0) problems.push(`entry: functions ${e.functions.join(', ')} are ignored`);
  return problems;
}

describe('B650 sandbox search data', () => {
  it('carries search data as described data', async () => {
    const groups = Array.from({ length: 200 }, (_, i) => `{ idea: 'greeting${i}', same: ['hello${i}', 'hi${i}', 'welcome${i}'], phrases: ['say hello ${i}'] }`).join(',\n');
    const extra = `searchVocabulary: [${groups}],
    searchEntries: [
      { id: 'greet', title: 'A greeting', sentence: 'Greets every player.', opens: { type: 'template', id: 'sample-greeting' } },
      { id: 'steal', title: 'Blue sword', sentence: 'Points at the library.', opens: { type: 'starter', id: 'weapon' } },
      { id: 'code', title: 'Code', opens: { type: 'template', id: 'sample-greeting' }, supports() { return true; } },
    ],`;
    const workers = vmWorkers();
    const t0 = performance.now();
    const worker = createPluginWorker(sampleBundle('', extra), { spawn: workers.spawn });
    const description = await worker.ready;
    const readyMs = performance.now() - t0;
    const bytes = JSON.stringify(description.contributes.searchVocabulary).length + JSON.stringify(description.contributes.searchEntries).length;
    const t1 = performance.now();
    for (let i = 0; i < 20; i++) structuredClone(description);
    const cloneMs = (performance.now() - t1) / 20;
    const t2 = performance.now();
    let problems: string[] = [];
    for (let i = 0; i < 20; i++) problems = check(description);
    const checkMs = (performance.now() - t2) / 20;
    expect(problems.some((p) => p.includes('weapon'))).toBe(true);
    writeFileSync(join(OUT, 'sandbox.json'), JSON.stringify({ lines: description.contributes.searchVocabulary?.length, entries: description.contributes.searchEntries?.length, searchDataBytes: bytes, descriptionBytes: JSON.stringify(description).length, readyMs: +readyMs.toFixed(1), structuredCloneMs: +cloneMs.toFixed(3), checkMs: +checkMs.toFixed(3), problems, codeEntryFunctions: description.contributes.searchEntries?.[2]?.functions }, null, 1));
  });
});
