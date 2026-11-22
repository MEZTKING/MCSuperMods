// B650 spike (throwaway): SQ12, the 34 draft behaviour clauses checked against the Rules catalogue
// and the flows' own questions.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Plugin } from '@msm/plugin-api';
import { stepById, triggerById } from '@msm/plugin-rules';
import { describe, it } from 'vitest';
import { builtInPlugins } from '../../src/renderer/src/plugins/built-in';
import { BEHAVIOURS } from '../../../docs/reference/spikes/b650/spike-src/vocab';

describe('B650 behaviours', () => {
  it('sorts the clauses', () => {
    const starters = (builtInPlugins as Plugin[]).flatMap((p) => p.contributes.projectStarters ?? []);
    const rows = BEHAVIOURS.map((b) => {
      const problems: string[] = [];
      let kind = 'gap';
      if (b.rule) {
        kind = 'one rule';
        if (!triggerById(b.rule.when)) problems.push(`no trigger ${b.rule.when}`);
        if (!stepById(b.rule.do)) problems.push(`no step ${b.rule.do}`);
      } else if (b.beside) {
        kind = 'companion flow';
        const s = starters.find((x) => x.id === b.beside?.starter);
        if (!s) problems.push(`no flow ${b.beside.starter}`);
        for (const [k, v] of Object.entries(b.beside.values)) {
          const q = s?.parameters?.find((p) => p.id === k);
          if (!q) problems.push(`no question ${k}`);
          else if ((q.type === 'choice' || q.type === 'set') && !q.choices.some((c) => c.value === v)) problems.push(`${k}: no choice ${String(v)}`);
        }
      } else if (b.answers || b.flows) {
        kind = b.answers && !b.flows ? 'flow answers' : 'the flow itself';
        for (const f of [...Object.keys(b.answers ?? {}), ...(b.flows ?? [])]) if (!starters.some((x) => x.id === f)) problems.push(`no flow ${f}`);
        for (const [f, values] of Object.entries(b.answers ?? {})) {
          const s = starters.find((x) => x.id === f);
          for (const [k, v] of Object.entries(values)) {
            const q = s?.parameters?.find((p) => p.id === k);
            if (!q) problems.push(`${f}: no question ${k}`);
            else if (q.type === 'choice' && !q.choices.some((c) => c.value === v)) problems.push(`${f}.${k}: no choice ${String(v)}`);
            else if (q.type === 'number' && typeof v === 'number' && ((q.min ?? -Infinity) > v || (q.max ?? Infinity) < v)) problems.push(`${f}.${k}: ${v} out of range`);
          }
        }
      }
      return { id: b.id, clause: b.phrases[0], appliesTo: b.appliesTo, kind, sentence: b.sentence, ...(b.gap ? { gap: b.gap } : {}), problems };
    });
    writeFileSync(join(process.env.B650_OUT ?? '/tmp', 'behaviours.json'), JSON.stringify(rows, null, 1));
  });
});
