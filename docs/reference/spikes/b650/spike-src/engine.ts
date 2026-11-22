// B650 spike (throwaway): a draft index, query reader, ranker and answer reader for ADR 0124
// (D3, D4, D6, D7). Good enough to measure, not to ship. Runs in Node 24 by type stripping and,
// bundled by esbuild, in a Web Worker in Electron.
import {
  bkTreeIndex,
  deletionIndex,
  editsFor,
  fold,
  idTokens,
  type Intent,
  isDropped,
  isIntentOnly,
  normalise,
  numberOf,
  rawWords,
  readIntent,
  soundKey,
  stem,
  type TypoIndex,
  trigramIndex,
} from './text.ts';
import type { Behaviour, Colour, WordGroup } from './vocab.ts';

export interface Question {
  id: string;
  label: string;
  type: string;
  default?: unknown;
  choices?: { value: string; label: string }[];
  min?: number;
  max?: number;
  pattern?: string;
  maxLength?: number;
}

export interface Entry {
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
  questions?: Question[];
}

export interface Vocabulary {
  /** Words that name a vanilla mob (single-word entity type ids), for names such as "Flying Pig". */
  mobWords?: ReadonlySet<string>;
  groups: WordGroup[];
  colours: Colour[];
  behaviours: Behaviour[];
}

type Field = 'title' | 'words' | 'answers' | 'sentence' | 'ids' | 'body';
const FIELDS: readonly Field[] = ['title', 'words', 'answers', 'sentence', 'ids', 'body'];
const WEIGHT: Record<Field, number> = { title: 3, words: 2, answers: 1.2, sentence: 1, ids: 1.2, body: 0.3 };
const B: Record<Field, number> = { title: 0.6, words: 0.5, answers: 0.3, sentence: 0.75, ids: 0.5, body: 0.75 };
const K1 = 1.2;

/** Source weight by intent (draft; ADR 0124 D6). */
const SOURCE_WEIGHT: Record<Intent, Record<string, number>> = {
  none: { flow: 1, tile: 1, starter: 0.85, example: 0.8, template: 0.7, kind: 0.55, project: 1.1, vanilla: 0.75, rule: 0.7, setting: 0.75, command: 0.75, guide: 0.6, problem: 0.45 },
  make: { flow: 1.15, tile: 1.1, starter: 0.95, example: 0.8, template: 0.75, kind: 0.6, project: 0.7, vanilla: 0.55, rule: 0.7, setting: 0.3, command: 0.5, guide: 0.5, problem: 0.3 },
  learn: { flow: 0.75, tile: 0.7, starter: 0.6, example: 0.65, template: 0.55, kind: 0.5, project: 0.5, vanilla: 0.5, rule: 0.6, setting: 0.6, command: 0.6, guide: 1.25, problem: 0.7 },
  open: { flow: 0.7, tile: 0.6, starter: 0.6, example: 0.6, template: 0.55, kind: 0.8, project: 1.3, vanilla: 0.7, rule: 0.6, setting: 1.1, command: 1, guide: 0.6, problem: 0.6 },
  fix: { flow: 0.5, tile: 0.4, starter: 0.4, example: 0.4, template: 0.4, kind: 0.4, project: 0.7, vanilla: 0.4, rule: 0.5, setting: 0.6, command: 0.6, guide: 1, problem: 1.3 },
  command: { flow: 0.6, tile: 0.6, starter: 0.5, example: 0.5, template: 0.5, kind: 0.5, project: 0.6, vanilla: 0.5, rule: 0.6, setting: 1.1, command: 1.3, guide: 0.7, problem: 0.5 },
  id: { flow: 0.5, tile: 0.3, starter: 0.5, example: 0.5, template: 0.5, kind: 0.9, project: 1.2, vanilla: 1.2, rule: 0.6, setting: 0.4, command: 0.4, guide: 0.4, problem: 0.4 },
};

/** The thing sort a flow makes, from its Creator group (behaviours apply by it). */
const SORT_OF_GROUP: Record<string, 'item' | 'block' | 'mob' | 'vehicle'> = {
  gear: 'item', blocks: 'block', food: 'item', mobs: 'mob', vehicles: 'vehicle', magic: 'item', scripts: 'item',
};

export interface Options {
  typo: 'deletion' | 'trigram' | 'bk-tree';
  protect: boolean;
  dictionaryStem: boolean;
  soundAlike: boolean;
  /** The tuning pass after the first run of the query set. */
  v1: boolean;
}
export const DEFAULT_OPTIONS: Options = { typo: 'deletion', protect: true, dictionaryStem: true, soundAlike: false, v1: false };

interface Posting {
  entries: number[] | Int32Array;
  scores: number[] | Float32Array;
}

export interface Hit {
  entry: Entry;
  score: number;
  answers?: Record<string, unknown>;
  behaviour?: { id: string; sentence: string; rule?: unknown; beside?: unknown };
  why: string[];
}

export interface Understood {
  intent: Intent;
  corrected: { from: string; to: string }[];
  notUnderstood: string[];
  clause?: string;
  behaviour?: string;
}

export interface Answer {
  understood: Understood;
  hits: Hit[];
  confident: boolean;
}

export interface Index {
  entries: Entry[];
  search(text: string, mode?: 'very-easy' | 'easy' | 'advanced', limit?: number): Answer;
  stats(): Record<string, number>;
  term(word: string): string;
  typo: TypoIndex;
}

const choiceTerms = (label: string): string[] => rawWords(label.replace(/\(.*?\)/g, '').split(':')[0] ?? '').filter((w) => !isDropped(w));

export function buildIndex(input: readonly Entry[], vocab: Vocabulary, protectedWords: ReadonlySet<string>, options: Options = DEFAULT_OPTIONS): Index {
  const timings: Record<string, number> = {};
  let tMark = performance.now();
  const mark = (name: string): void => { const t = performance.now(); timings[name] = +(t - tMark).toFixed(1); tMark = t; };
  // Fold tiles and showcase cards into what they open (D6 duplicates).
  const byId = new Map<string, Entry>();
  const entries: Entry[] = [];
  for (const entry of input) {
    // a tile that opens one flow or starter folds into it; a tile with a chooser stays a result
    if (entry.source === 'showcase' || (entry.source === 'tile' && entry.ids?.length === 1)) continue;
    const copy = { ...entry, words: [...(entry.words ?? [])] };
    byId.set(copy.id, copy);
    entries.push(copy);
  }
  for (const entry of input) {
    if (entry.source !== 'showcase' && !(entry.source === 'tile' && entry.ids?.length === 1)) continue;
    const target = entry.source === 'tile'
      ? (byId.get(`flow:${entry.ids?.[0]}`) ?? byId.get(`starter:${entry.ids?.[0]}`))
      : byId.get(`example:${entry.ids?.[0]}`);
    if (target !== undefined) target.words?.push(entry.title, ...(entry.ids?.length === 1 || entry.source === 'showcase' ? [entry.sentence ?? ''] : []));
  }

  // The dictionary: every word of every field, before stemming, with document frequency.
  const rawFreq = new Map<string, number>();
  const fieldText = (entry: Entry, field: Field): string => {
    switch (field) {
      case 'title': return entry.title;
      case 'words': return (entry.words ?? []).join(' ');
      case 'answers': return (entry.questions ?? []).flatMap((q) => [q.label, ...(q.choices ?? []).map((c) => c.label)]).join(' ');
      case 'sentence': return entry.sentence ?? '';
      case 'ids': return (entry.ids ?? []).join(' ');
      case 'body': return entry.body ?? '';
    }
  };
  // each field is split once (B650 measured the second split at about a third of the build)
  const foldCache = new Map<string, string>();
  const folded1 = (w: string): string => { let f = foldCache.get(w); if (f === undefined) { f = fold(w); foldCache.set(w, f); } return f; };
  let fieldWords: string[][][] = entries.map((entry) => FIELDS.map((field) => rawWords(fieldText(entry, field))));
  for (const perField of fieldWords) {
    const seen = new Set<string>();
    for (const ws of perField) for (const w of ws) seen.add(folded1(w));
    for (const w of seen) rawFreq.set(w, (rawFreq.get(w) ?? 0) + 1);
  }
  for (const group of vocab.groups) for (const w of [group.idea, ...group.same]) for (const p of rawWords(w)) if (!rawFreq.has(fold(p))) rawFreq.set(fold(p), 1);
  const dictionary = new Set(rawFreq.keys());
  mark('dictionary');
  const protect = options.protect ? new Set([...protectedWords].map(fold)) : new Set<string>();
  for (const group of vocab.groups) protect.add(fold(group.idea));
  const termCache = new Map<string, string>();
  const term = (w: string): string => {
    let t = termCache.get(w);
    if (t === undefined) {
      t = stem(folded1(w), protect, options.dictionaryStem ? dictionary : undefined);
      termCache.set(w, t);
    }
    return t;
  };

  // Postings with BM25F per (term, entry).
  let tfs: Map<string, number>[][] = [];
  const lengths: Record<Field, number[]> = { title: [], words: [], answers: [], sentence: [], ids: [], body: [] };
  const exactIds = new Map<string, number[]>();
  entries.forEach((entry, i) => {
    const perField: Map<string, number>[] = [];
    for (const [fi, field] of FIELDS.entries()) {
      const m = new Map<string, number>();
      const ws = (fieldWords[i] as string[][])[fi] as string[];
      for (const w of ws) m.set(term(w), (m.get(term(w)) ?? 0) + 1);
      perField.push(m);
      lengths[field].push(ws.length);
    }
    tfs.push(perField);
    for (const id of entry.ids ?? []) {
      for (const tok of [normalise(id), ...idTokens(id)]) {
        const list = exactIds.get(tok) ?? [];
        list.push(i);
        exactIds.set(tok, list);
      }
    }
  });
  const avg: Record<Field, number> = {} as Record<Field, number>;
  for (const f of FIELDS) avg[f] = Math.max(1, lengths[f].reduce((a, b) => a + b, 0) / entries.length);
  const df = new Map<string, number>();
  for (const perField of tfs) {
    const seen = new Set<string>();
    for (const m of perField) for (const t of m.keys()) seen.add(t);
    for (const t of seen) df.set(t, (df.get(t) ?? 0) + 1);
  }
  const N = entries.length;
  const idf = (t: string): number => {
    const n = df.get(t) ?? 0;
    return Math.log(1 + (N - n + 0.5) / (n + 0.5));
  };
  const postings = new Map<string, Posting>();
  tfs.forEach((perField, i) => {
    const tilde = new Map<string, number>();
    FIELDS.forEach((field, fi) => {
      const m = perField[fi] as Map<string, number>;
      const norm = 1 - B[field] + (B[field] * (lengths[field][i] as number)) / avg[field];
      for (const [t, tf] of m) tilde.set(t, (tilde.get(t) ?? 0) + (WEIGHT[field] * tf) / norm);
    });
    for (const [t, tt] of tilde) {
      let p = postings.get(t);
      if (p === undefined) {
        p = { entries: [], scores: [] };
        postings.set(t, p);
      }
      p.entries.push(i);
      p.scores.push((idf(t) * tt * (K1 + 1)) / (K1 + tt));
    }
  });
  // compact: typed arrays, and the build-only tables dropped (B650 memory pass)
  for (const p of postings.values()) {
    p.entries = Int32Array.from(p.entries);
    p.scores = Float32Array.from(p.scores);
  }
  fieldWords = [];
  tfs = [];
  mark('postings');
  const titleTerms = entries.map((e) => rawWords(e.title).filter((w) => !isDropped(w)).map(term));

  // Typo dictionary over index terms' surface words (folded, unstemmed) plus their stems.
  const typoFreq = new Map<string, number>();
  for (const [w, n] of rawFreq) if (w.length >= 3 && !/^\d+$/.test(w)) typoFreq.set(w, n);
  const typo = options.typo === 'deletion' ? deletionIndex(typoFreq) : options.typo === 'trigram' ? trigramIndex(typoFreq) : bkTreeIndex(typoFreq);
  mark('typo');
  const sounds = new Map<string, string[]>();
  if (options.soundAlike) for (const w of typoFreq.keys()) if (w.length >= 4) { const k = soundKey(w); sounds.set(k, [...(sounds.get(k) ?? []), w]); }

  // Vocabulary: word -> idea headword; phrases (several words) -> idea.
  const ideaOf = new Map<string, string>();
  const phrases: { words: string[]; idea: string }[] = [];
  for (const group of vocab.groups) {
    for (const s of [...group.same, ...(group.phrases ?? [])]) {
      const ws = rawWords(s);
      if (ws.length > 1) phrases.push({ words: ws.map(fold), idea: group.idea });
      else if (ws[0] !== undefined && ws[0] !== group.idea) ideaOf.set(term(ws[0]), term(group.idea));
    }
  }
  phrases.sort((a, b) => b.words.length - a.words.length);
  const colourPhrases = vocab.colours.flatMap((c) => c.names.map((n) => ({ words: rawWords(n).map(fold), colour: c.colour, name: n }))).sort((a, b) => b.words.length - a.words.length);
  const behaviourPhrases = vocab.behaviours.flatMap((b) => b.phrases.map((p) => ({ words: rawWords(p).map(term), behaviour: b }))).sort((a, b) => b.words.length - a.words.length);

  mark('vocabulary');
  const known = (t: string): boolean => postings.has(t) || ideaOf.has(t);

  interface QTerm { surface: string; expansions: { t: string; w: number; why: string }[]; optional?: boolean; typoOnly?: boolean; }

  const readTerms = (words: string[], corrected: Understood['corrected'], notUnderstood: string[]): QTerm[] => {
    // phrases first
    const out: QTerm[] = [];
    const folded = words.map(fold);
    for (let i = 0; i < folded.length; ) {
      const ph = phrases.find((p) => p.words.every((w, k) => folded[i + k] === w));
      if (ph !== undefined) {
        out.push({ surface: ph.words.join(' '), expansions: [{ t: term(ph.idea), w: 1, why: `phrase ${ph.words.join(' ')}` }] });
        i += ph.words.length;
        continue;
      }
      const w = folded[i] as string;
      // joined words: "pick axe" -> "pickaxe"; when both parts are words too, the joined one is optional
      const next = folded[i + 1];
      if (next !== undefined && dictionary.has(w + next) && postings.has(term(w + next))) {
        if (!known(term(w)) || !known(term(next))) {
          out.push({ surface: `${w} ${next}`, expansions: [{ t: term(w + next), w: 1, why: 'joined' }] });
          i += 2;
          continue;
        }
        out.push({ surface: `${w}${next}`, expansions: [{ t: term(w + next), w: 0.6, why: 'joined (optional)' }], optional: true });
      }
      i += 1;
      const weak = options.v1 && isIntentOnly(w);
      if (isDropped(w) && !weak) continue;
      const t = term(w);
      const exp: QTerm['expansions'] = [];
      if (weak) {
        if (postings.has(t)) out.push({ surface: w, expansions: [{ t, w: 0.4, why: 'intent word' }], optional: true });
        continue;
      }
      if (postings.has(t)) exp.push({ t, w: 1, why: 'exact' });
      const idea = ideaOf.get(t);
      if (idea !== undefined) exp.push({ t: idea, w: 0.85, why: `synonym ${w}->${idea}` });
      if (exp.length === 0 && /^\d/.test(w)) continue; // a bare number is for the answers only
      if (exp.length === 0) {
        // split words: "ironsword" -> "iron" + "sword"
        let split: [string, string] | undefined;
        for (let k = 3; k <= w.length - 3 && split === undefined; k++) if (postings.has(term(w.slice(0, k))) && postings.has(term(w.slice(k)))) split = [w.slice(0, k), w.slice(k)];
        if (split !== undefined) {
          for (const part of split) out.push({ surface: part, expansions: [{ t: term(part), w: 0.9, why: 'split' }] });
          continue;
        }
        const fixes = typo.correct(w).slice(0, 2);
        let fixed = false;
        for (const fix of fixes) {
          const ft = term(fix.word);
          if (!known(ft)) continue;
          exp.push({ t: ideaOf.get(ft) ?? ft, w: 0.75 ** fix.edits, why: `typo ${w}->${fix.word}` });
          if (!fixed) corrected.push({ from: w, to: fix.word });
          fixed = true;
        }
        if (!fixed && options.soundAlike && w.length >= 4) {
          for (const cand of sounds.get(soundKey(w)) ?? []) {
            if (Math.abs(cand.length - w.length) > 2) continue;
            exp.push({ t: term(cand), w: 0.5, why: `sound ${w}->${cand}` });
            corrected.push({ from: w, to: cand });
            break;
          }
        }
      }
      if (exp.length === 0) notUnderstood.push(w);
      else out.push({ surface: w, expansions: exp, typoOnly: exp.every((e) => e.why.startsWith('typo') || e.why.startsWith('sound')) });
    }
    return out;
  };

  const answersFor = (entry: Entry, words: string[], absorbed: Set<string>): Record<string, unknown> => {
    const answers: Record<string, unknown> = {};
    const qs = entry.questions ?? [];
    const folded = words.map(fold);
    const used = new Set<number>();
    // colour
    const colourQ = qs.find((q) => q.type === 'colour');
    let colourName: string | undefined;
    if (colourQ !== undefined) {
      for (let i = 0; i < folded.length && colourName === undefined; i++) {
        const c = colourPhrases.find((p) => p.words.every((w, k) => folded[i + k] === fold(w)));
        if (c !== undefined) {
          answers[colourQ.id] = c.colour;
          colourName = c.name;
          c.words.forEach((_, k) => used.add(i + k));
        }
        const hex = /^#?([0-9a-f]{6})$/.exec(words[i] ?? '');
        if (hex) { answers[colourQ.id] = `#${hex[1]}`; used.add(i); colourName = undefined; }
      }
    }
    // choices and sets
    let thingNoun: string | undefined;
    for (const q of qs) {
      if ((q.type !== 'choice' && q.type !== 'set') || q.choices === undefined) continue;
      const fromQ = /\bfrom\b|ingredient/i.test(q.label);
      let best: { value: string; label: string; n: number; at: number[] } | undefined;
      for (const choice of q.choices) {
        const ct = choiceTerms(choice.label).map(term);
        const valueTerms = rawWords(choice.value.replace(/^minecraft:/, '')).map(term);
        const at: number[] = [];
        folded.forEach((w, i) => {
          if (used.has(i)) return;
          const t = term(w);
          if ((ct[0] === t || (ct.length === 1 && valueTerms.includes(t))) && !at.includes(i)) at.push(i);
          else if (ct.length > 1 && ct.includes(t) && at.length > 0) at.push(i);
        });
        if (at.length === 0) continue;
        const preceded = at.some((i) => ['from', 'of'].includes(folded[i - 1] ?? '') || (folded[i - 1] === 'made'));
        if (fromQ !== preceded) continue;
        if (best === undefined || at.length > best.n) best = { value: choice.value, label: choice.label, n: at.length, at };
      }
      if (best !== undefined) {
        answers[q.id] = q.type === 'set' ? [best.value] : best.value;
        for (const i of best.at) used.add(i);
        if (/type|pieces|kind/i.test(q.id + q.label) && thingNoun === undefined) thingNoun = best.label;
      }
    }
    // numbers beside a unit or a word of the question's label
    folded.forEach((w, i) => {
      const n = numberOf(w);
      if (n === undefined || used.has(i)) return;
      const near = [folded[i - 1], folded[i + 1], folded[i + 2]].filter((x): x is string => x !== undefined).map(term);
      for (const q of qs) {
        if (q.type !== 'number' || answers[q.id] !== undefined) continue;
        const lt = choiceTerms(q.label).map(term);
        if (!near.some((x) => lt.includes(x))) continue;
        if ((q.min !== undefined && n < q.min) || (q.max !== undefined && n > q.max)) { answers[`${q.id}!dropped`] = n; break; }
        answers[q.id] = n;
        used.add(i);
        break;
      }
    });
    // name: "called X" or the describing words and the thing noun
    const nameQ = qs.find((q) => q.type === 'string' && /name/i.test(q.label));
    if (nameQ !== undefined) {
      const called = /\b(?:called|named)\s+([a-z][a-z0-9 ]{0,30})$/.exec(normalise(words.join(' ')));
      const quoted = /"([^"]{1,32})"/.exec(words.join(' '));
      const title = (s: string): string => s.replace(/\b[a-z]/g, (c) => c.toUpperCase()).trim();
      if (quoted?.[1] !== undefined) answers[nameQ.id] = title(quoted[1]);
      else if (called?.[1] !== undefined) answers[nameQ.id] = title(called[1]);
      else if (colourName !== undefined && thingNoun !== undefined) answers[nameQ.id] = title(`${colourName} ${thingNoun}`);
      if (options.v1 && answers[nameQ.id] === undefined && vocab.mobWords !== undefined && /\bmob\b/i.test(entry.title)) {
        const i = folded.findIndex((w, k) => !used.has(k) && vocab.mobWords?.has(w));
        if (i >= 0) {
          answers[nameQ.id] = title(entry.title.replace(/\bmob\b/i, folded[i] as string));
          used.add(i);
        }
      }
      const v = answers[nameQ.id];
      if (typeof v === 'string' && nameQ.pattern !== undefined && !new RegExp(nameQ.pattern).test(v)) delete answers[nameQ.id];
    }
    for (const i of used) absorbed.add(term(folded[i] as string));
    return answers;
  };

  return {
    entries,
    term,
    typo,
    stats: () => ({ ...Object.fromEntries(Object.entries(timings).map(([k, v]) => [`ms.${k}`, v])), entries: entries.length, terms: postings.size, postings: [...postings.values()].reduce((a, p) => a + p.entries.length, 0), dictionary: dictionary.size, exactIds: exactIds.size, phrases: phrases.length }),
    search(text, mode = 'easy', limit = 20) {
      const corrected: Understood['corrected'] = [];
      const notUnderstood: string[] = [];
      const all = rawWords(text);
      const intent = readIntent(all, text);
      // the clause after that/which/who/when (not as a first word)
      const cut = all.findIndex((w, i) => i > 0 && (options.v1 ? ['that', 'which', 'who', 'when'] : ['that', 'which', 'who', 'when', 'and']).includes(w));
      const intentFor = options.v1 && intent === 'none' && mode === 'very-easy' ? 'make' : intent;
      const head = cut === -1 ? all : all.slice(0, cut);
      const clause = cut === -1 ? [] : all.slice(cut + 1);
      const qterms = readTerms(head, corrected, notUnderstood);
      const scores = new Map<number, { s: number; matched: Set<string>; why: string[] }>();
      // exact ids
      for (const tok of idTokens(text)) for (const i of exactIds.get(tok) ?? []) scores.set(i, { s: 30, matched: new Set(qterms.map((q) => q.surface)), why: ['exact id'] });
      for (const q of qterms) {
        const best = new Map<number, number>();
        for (const e of q.expansions) {
          const p = postings.get(e.t);
          if (p === undefined) continue;
          for (let k = 0; k < p.entries.length; k++) {
            const i = p.entries[k] as number;
            const v = (p.scores[k] as number) * e.w;
            if (v > (best.get(i) ?? 0)) best.set(i, v);
          }
        }
        for (const [i, v] of best) {
          const s = scores.get(i) ?? { s: 0, matched: new Set<string>(), why: [] };
          s.s += v;
          s.matched.add(q.surface);
          scores.set(i, s);
        }
      }
      // behaviour clause
      let behaviour: Behaviour | undefined;
      if (clause.length > 0) {
        const ct = clause.map(term);
        for (const bp of behaviourPhrases) {
          for (let i = 0; i < ct.length; i++) if (bp.words.every((w, k) => ct[i + k] === w)) { behaviour = behaviour ?? bp.behaviour; }
        }
        if (behaviour === undefined) notUnderstood.push(clause.join(' '));
      } else if (options.v1) {
        // no clause word: a behaviour phrase of two words or more anywhere ("an animal you can ride")
        const ht = head.map(term);
        for (const bp of behaviourPhrases) {
          if (bp.words.length < 2 || behaviour !== undefined) continue;
          for (let i = 0; i < ht.length; i++) if (bp.words.every((w, k) => ht[i + k] === w)) behaviour = bp.behaviour;
        }
      }
      const nTerms = Math.max(1, qterms.filter((q) => !q.optional).length);
      const hits: Hit[] = [];
      for (const [i, s] of scores) {
        const entry = entries[i] as Entry;
        const absorbed = new Set<string>();
        let answers: Record<string, unknown> | undefined;
        if (entry.questions !== undefined && entry.questions.length > 0) {
          answers = answersFor(entry, head, absorbed);
          for (const a of absorbed) if (!s.matched.has(a)) { s.s += 1.5; s.matched.add(a); }
        }
        const coverage = Math.min(1, s.matched.size / nTerms);
        let score = s.s * (0.35 + 0.65 * coverage * coverage);
        const tt = titleTerms[i] as string[];
        const qt = qterms.filter((q) => !q.optional).map((q) => q.expansions[0]?.t ?? '');
        // v1: the name before a colon ("Play: test the mod") counts as the title
        const nameTerms = options.v1 && entry.title.includes(':') ? rawWords(entry.title.split(':')[0] ?? '').filter((w) => !isDropped(w)).map(term) : undefined;
        if (nameTerms !== undefined && nameTerms.length > 0 && nameTerms.length === qt.length && nameTerms.every((t) => qt.includes(t))) { score *= 1.6; s.why.push('exact name'); }
        else if (tt.length > 0 && tt.length === qt.length && tt.every((t) => qt.includes(t))) { score *= 1.6; s.why.push('exact title'); }
        else if (qt.length > 0 && qt.every((t) => tt.includes(t))) { score *= 1.25; s.why.push('title has every word'); }
        if (coverage === 1) score *= 1.15;
        score *= SOURCE_WEIGHT[intentFor][entry.source] ?? 0.5;
        if (mode === 'very-easy' && entry.technical) score *= 0.5;
        if (!entry.available) score *= 0.3;
        let hb: Hit['behaviour'];
        if (behaviour !== undefined && entry.source === 'flow') {
          const sort = SORT_OF_GROUP[entry.words?.[0] ?? ''];
          if (behaviour.flows?.includes(entry.ids?.[0] ?? '')) { score = score * 1.5 + 2; hb = { id: behaviour.id, sentence: behaviour.sentence }; }
          else if (sort !== undefined && behaviour.appliesTo.includes(sort) && behaviour.gap === undefined) {
            hb = { id: behaviour.id, sentence: behaviour.sentence, rule: behaviour.rule, beside: behaviour.beside };
            const extra = behaviour.answers?.[entry.ids?.[0] ?? ''];
            if (extra !== undefined) answers = { ...answers, ...extra };
            score *= options.v1 ? 1.35 : 1.1;
          }
        }
        hits.push({ entry, score, ...(answers && Object.keys(answers).length > 0 ? { answers } : {}), ...(hb ? { behaviour: hb } : {}), why: s.why });
      }
      // flows a behaviour points at, even with no word of the head
      if (behaviour?.flows !== undefined) {
        for (const f of behaviour.flows) {
          const i = entries.findIndex((e) => e.id === `flow:${f}`);
          if (i >= 0 && !scores.has(i)) hits.push({ entry: entries[i] as Entry, score: 2, behaviour: { id: behaviour.id, sentence: behaviour.sentence }, why: ['behaviour'] });
        }
      }
      hits.sort((a, b) => b.score - a.score || (a.entry.title < b.entry.title ? -1 : a.entry.title > b.entry.title ? 1 : a.entry.id < b.entry.id ? -1 : 1));
      const top = hits[0]?.score ?? 0;
      // v1: not confident when fewer than half the words were read without a typo fix
      const plain = qterms.filter((q) => !q.optional && !q.typoOnly).length;
      const real = qterms.filter((q) => !q.optional).length + notUnderstood.length;
      const confident = top >= 3 && (!options.v1 || plain * 2 >= real || (real === 1 && corrected.length === 1));
      return { understood: { intent, corrected, notUnderstood, ...(clause.length ? { clause: clause.join(' ') } : {}), ...(behaviour ? { behaviour: behaviour.id } : {}) }, hits: hits.slice(0, limit), confident };
    },
  };
}

/** Typo dictionary size for the reports. */
export function editLimitTable(): Record<string, number> {
  return { '1-3': editsFor(3), '4-7': editsFor(5), '8+': editsFor(9) };
}
