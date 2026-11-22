// B600 spike (throwaway, deleted before the report): every built-in plugin's function templates' lines, for 2S7.
import { writeFileSync } from 'node:fs';
import { it } from 'vitest';
import blocksItems from '../../../plugins/blocks-items/src/index';
import controls from '../../../plugins/controls/src/index';
import datapack from '../../../plugins/datapack/src/index';
import entities from '../../../plugins/entities/src/index';
import library from '../../../plugins/library/src/index';
import rules from '../../../plugins/rules/src/index';
import scripting from '../../../plugins/scripting/src/index';
import worldgen from '../../../plugins/worldgen/src/index';
import { targetFacts } from '../../../targets/all/src/index';

it('collects function template lines', () => {
  const target = targetFacts('mc-26.3');
  const out: { template: string; lines: string[] }[] = [];
  for (const p of [blocksItems, controls, datapack, entities, library, rules, scripting, worldgen]) {
    // biome-ignore lint/suspicious/noExplicitAny: throwaway
    const c = (p as any).contributes ?? {};
    for (const t of c.elementTemplates ?? []) {
      if (t.kind !== 'minecraft:function') continue;
      const data = typeof t.data === 'function' ? t.data({ id: 'my_project:f', namespace: 'my_project', path: 'f', projectNamespace: 'my_project', namespaces: ['my_project'], kindDefault: undefined, target }) : t.data;
      if (Array.isArray(data?.lines)) out.push({ template: `${p.id}/${t.id}`, lines: data.lines });
    }
  }
  writeFileSync(process.env.B600_OUT as string, JSON.stringify(out, null, 1));
});
