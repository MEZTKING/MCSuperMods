// B650 spike: SQ6, which questions of the 62 flows can be answered from label words alone.
import { readFileSync } from 'node:fs';
import type { Entry, Question } from './engine.ts';
import { fold, isDropped, rawWords, stem } from './text.ts';

const OUT = process.env.B650_OUT as string;
const target = process.env.TARGET ?? 'mc-26.3';
const corpus = JSON.parse(readFileSync(`${OUT}/corpus-${target}.json`, 'utf8')) as Entry[];
const flows = corpus.filter((e) => e.source === 'flow');
const GENERIC = new Set(['like', 'only', 'none', 'no', 'own', 'custom', 'other', 'any', 'same', 'new', 'set', 'numbers', 'below', 'version', 'variant', 'nowhere', 'anywhere']);
const head = (label: string): string | undefined => rawWords(label.replace(/\(.*?\)/g, '').split(':')[0] ?? '').map((w) => stem(fold(w))).find((w) => !isDropped(w) && !GENERIC.has(w));
const contentWords = (label: string): string[] => rawWords(label).map((w) => stem(fold(w))).filter((w) => !isDropped(w) && !GENERIC.has(w) && !/^\d+$/.test(w));

const byType: Record<string, { questions: number; fromLabels: number; needHint: number }> = {};
const needHints: string[] = [];
const clashes: Record<string, string[]> = {};
const add = (type: string, ok: boolean, why: string): void => {
  const t = (byType[type] ??= { questions: 0, fromLabels: 0, needHint: 0 });
  t.questions++;
  if (ok) t.fromLabels++;
  else {
    t.needHint++;
    needHints.push(why);
  }
};
let choices = 0;
let reachableChoices = 0;
for (const flow of flows) {
  const qs = (flow.questions ?? []) as Question[];
  const wordQuestions = new Map<string, string[]>();
  const numberWords = new Map<string, number>();
  for (const q of qs) if (q.type === 'number' || q.type === 'boolean') for (const w of new Set(contentWords(q.label))) numberWords.set(w, (numberWords.get(w) ?? 0) + 1);
  let colours = 0;
  let names = 0;
  for (const q of qs) {
    const variant = /^variant_\d/.test(q.id);
    const where = `${flow.ids?.[0]}.${q.id} (${q.type}) "${q.label}"`;
    switch (q.type) {
      case 'colour':
        colours++;
        add('colour', colours === 1 && !variant, `${where}: not the first colour question; needs role main-colour or words`);
        break;
      case 'string':
        if (/name/i.test(q.label)) {
          names++;
          add('name', names === 1, `${where}: a second name question`);
        } else add('text', false, `${where}: free text with no role`);
        break;
      case 'choice':
      case 'set': {
        const heads = (q.choices ?? []).map((c) => head(c.label));
        const counts = new Map<string, number>();
        for (const h of heads) if (h !== undefined) counts.set(h, (counts.get(h) ?? 0) + 1);
        let ok = 0;
        heads.forEach((h, i) => {
          choices++;
          if (h !== undefined && counts.get(h) === 1) {
            ok++;
            reachableChoices++;
            const list = wordQuestions.get(h) ?? [];
            if (!list.includes(q.id)) list.push(q.id);
            wordQuestions.set(h, list);
          } else if (i >= 0) {
            /* a generic or shared head word */
          }
        });
        add(q.type, !variant && ok >= Math.ceil(heads.length * 0.8), `${where}: ${ok} of ${heads.length} choices by their own first word${variant ? '; a variant question' : ''}`);
        break;
      }
      case 'number': {
        const own = contentWords(q.label).filter((w) => numberWords.get(w) === 1);
        add('number', !variant && own.length > 0, `${where}: no word of its own in the label`);
        break;
      }
      case 'boolean': {
        const own = contentWords(q.label).filter((w) => numberWords.get(w) === 1);
        add('boolean', own.length > 0, `${where}: no word of its own in the label`);
        break;
      }
      default:
        add(q.type, false, `${where}: a file, not from words`);
    }
  }
  for (const [w, list] of wordQuestions) if (list.length > 1) (clashes[flow.ids?.[0] as string] ??= []).push(`${w}: ${list.join(' / ')}`);
}
console.log(JSON.stringify({ target, flows: flows.length, byType, choices: { total: choices, reachableByOwnFirstWord: reachableChoices }, clashCount: Object.values(clashes).reduce((n, l) => n + l.length, 0), clashes, needHints }, null, 1));
