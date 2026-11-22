// B650 spike (throwaway): the text half of a draft `@msm/search` (ADR 0124 D4). Language only:
// no Minecraft word lives here; the protected words and the vocabulary are handed in.
// Node 24 runs it directly (type stripping): no enums, no parameter properties.

/** Lower case, accents stripped. */
export function normalise(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** Words of a text: split on anything not a letter or digit; ids are split at `:`, `/`, `_`. */
export function rawWords(text: string): string[] {
  return normalise(text)
    .split(/[^a-z0-9]+/)
    .filter((word) => word !== '');
}

/** Whole ids (`namespace:path`) in a text, kept as exact tokens. */
export function idTokens(text: string): string[] {
  return [...normalise(text).matchAll(/[a-z0-9_.-]+:[a-z0-9_./-]+/g)].map((match) => match[0]);
}

// --- British and American spellings (folded to the British form) ---------------------------

const FOLD_LIST: Record<string, string> = {
  armor: 'armour',
  color: 'colour',
  colored: 'coloured',
  colorful: 'colourful',
  gray: 'grey',
  defense: 'defence',
  offense: 'offence',
  center: 'centre',
  theater: 'theatre',
  liter: 'litre',
  fiber: 'fibre',
  behavior: 'behaviour',
  favorite: 'favourite',
  flavor: 'flavour',
  honor: 'honour',
  humor: 'humour',
  labor: 'labour',
  neighbor: 'neighbour',
  rumor: 'rumour',
  vapor: 'vapour',
  harbor: 'harbour',
  odor: 'odour',
  savior: 'saviour',
  valor: 'valour',
  vigor: 'vigour',
  parlor: 'parlour',
  mold: 'mould',
  plow: 'plough',
  aluminum: 'aluminium',
  catalog: 'catalogue',
  analog: 'analogue',
  jewelry: 'jewellery',
  pajamas: 'pyjamas',
  cozy: 'cosy',
  mustache: 'moustache',
  traveling: 'travelling',
  traveled: 'travelled',
  traveler: 'traveller',
  modeling: 'modelling',
  modeled: 'modelled',
  labeled: 'labelled',
  labeling: 'labelling',
  leveled: 'levelled',
  leveling: 'levelling',
  fueled: 'fuelled',
  fueling: 'fuelling',
  canceled: 'cancelled',
  canceling: 'cancelling',
  signaling: 'signalling',
  tunneling: 'tunnelling',
  jeweled: 'jewelled',
  dueling: 'duelling',
};
/** Words ending in -ize that are not the -ise spelling. */
const IZE_KEEP = new Set(['size', 'seize', 'prize', 'capsize', 'maize', 'resize', 'oversize']);

/** The British form of a word (rule plus exception list). */
export function fold(word: string): string {
  const listed = FOLD_LIST[word];
  if (listed !== undefined) return listed;
  // plural or -ed of a listed word: armors, colors, colorful handled above
  if (word.endsWith('s') && FOLD_LIST[word.slice(0, -1)] !== undefined) {
    return `${FOLD_LIST[word.slice(0, -1)]}s`;
  }
  if (word.length > 5 && !IZE_KEEP.has(word)) {
    const m = /^(.*[a-z])(iz|yz)(e|es|ed|ing|er|ers|ation|ations)$/.exec(word);
    if (m && !IZE_KEEP.has(`${m[1]}${m[2]}e`)) return `${m[1]}${m[2] === 'iz' ? 'is' : 'ys'}${m[3]}`;
  }
  return word;
}

// --- Light stemmer ------------------------------------------------------------------------

/**
 * The stem of a word: plurals, -ing and -ed. A protected word is never touched. With a
 * dictionary, -ing and -ed become the dictionary's form when it has one (`making` -> `make`).
 */
/** Words the stemmer leaves alone whatever the rules say (B650's collision list). */
export const STEM_EXCEPTIONS: ReadonlySet<string> = new Set(['news', 'series', 'species', 'lens', 'gas', 'bus', 'this', 'its', 'was', 'has', 'does', 'lives', 'yes', 'always', 'perhaps', 'canvas', 'atlas', 'lapis']);

export function stem(word: string, protect?: ReadonlySet<string>, dictionary?: ReadonlySet<string>, v1 = true): string {
  if (word.length <= 3 || /\d/.test(word) || protect?.has(word)) return word;
  if (v1 && dictionary !== undefined && STEM_EXCEPTIONS.has(word)) return word;
  const known = (candidates: string[]): string | undefined =>
    dictionary === undefined ? undefined : candidates.find((c) => dictionary.has(c) && c.length >= 3);
  if (word.endsWith('ies') && word.length > 4) return `${word.slice(0, -3)}y`;
  if (word.endsWith('sses')) return word.slice(0, -2);
  if (/(?:x|ch|sh|zz)es$/.test(word)) return word.slice(0, -2);
  if (v1 && dictionary !== undefined && word.endsWith('s') && !/(?:ss|us|is|ous)$/.test(word) && dictionary.has(word.slice(0, -1))) return word.slice(0, -1);
  if (word.endsWith('ves') && dictionary !== undefined) {
    const f = known([`${word.slice(0, -3)}f`, `${word.slice(0, -3)}fe`]);
    if (f !== undefined) return f;
  }
  if (word.endsWith('s') && !/(?:ss|us|is|ous)$/.test(word)) return word.slice(0, -1);
  for (const suffix of ['ing', 'ed']) {
    if (!word.endsWith(suffix)) continue;
    const base = word.slice(0, -suffix.length);
    if (base.length < 3) return word;
    if (suffix === 'ed' && base.endsWith('i')) return `${base.slice(0, -1)}y`;
    const undoubled = /([b-df-hj-np-tv-z])\1$/.test(base) && !/(?:ll|ss|zz)$/.test(base) ? base.slice(0, -1) : base;
    // v1: "noted" is note, not "not"; a bare base needs four letters ("coming" is not "com")
    const order = v1 ? [`${base}e`, ...(base.length >= 4 ? [base] : []), ...(undoubled.length >= 3 && undoubled !== base ? [undoubled] : [])] : [base, `${base}e`, undoubled];
    const fromDictionary = known(order);
    if (fromDictionary !== undefined) return fromDictionary;
    if (dictionary !== undefined) return word; // unknown -ing word: leave whole (fewer merges)
    return undoubled;
  }
  return word;
}

// --- Stop and intent words ---------------------------------------------------------------

export const STOP_WORDS: ReadonlySet<string> = new Set(
  'a an the i me my mine you your it its is are be to of for and or in on at by with do does did can could would should will please some any this that these those which who when where what how why so just want wanna like into from as up out about really very'.split(' '),
);

export type Intent = 'make' | 'learn' | 'open' | 'fix' | 'command' | 'id' | 'none';

const INTENT_WORDS: Readonly<Record<string, Intent>> = {
  make: 'make', create: 'make', add: 'make', new: 'make', build: 'make', want: 'make', making: 'make', craft: 'make',
  how: 'learn', why: 'learn', what: 'learn', help: 'learn', tutorial: 'learn', guide: 'learn', explain: 'learn',
  open: 'open', find: 'open', where: 'open', show: 'open', edit: 'open', rename: 'open', delete: 'open', my: 'open',
  fix: 'fix', broken: 'fix', error: 'fix', wrong: 'fix', missing: 'fix', pink: 'fix', crash: 'fix',
  play: 'command', test: 'command', export: 'command', install: 'command', undo: 'command', redo: 'command', save: 'command', turn: 'command', switch: 'command',
};
/** Intent words that carry no content once read (dropped like stop words). */
const INTENT_ONLY: ReadonlySet<string> = new Set(['make', 'create', 'add', 'new', 'build', 'want', 'making', 'how', 'why', 'what', 'help', 'tutorial', 'explain', 'find', 'where', 'show', 'my']);

/** The intent of the words, the first intent word winning; `id` for a bare `namespace:path`. */
export function readIntent(words: readonly string[], text: string): Intent {
  if (/^\s*[a-z0-9_.-]+:[a-z0-9_./-]+\s*$/.test(normalise(text))) return 'id';
  for (const word of words) {
    const intent = INTENT_WORDS[word];
    if (intent !== undefined) return intent;
  }
  return 'none';
}

export function isDropped(word: string): boolean {
  return STOP_WORDS.has(word) || INTENT_ONLY.has(word);
}

/** An intent word kept as a weak term (v1: "whats new" keeps "new"). */
export function isIntentOnly(word: string): boolean {
  return INTENT_ONLY.has(word) && !STOP_WORDS.has(word);
}

// --- Edit distance and the three typo methods ----------------------------------------------

/** Optimal string alignment distance (a swap of neighbours counts as one), stopping above `max`. */
export function osa(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const n = a.length;
  const m = b.length;
  let prev2 = new Array<number>(m + 1).fill(0);
  let prev = Array.from({ length: m + 1 }, (_, j) => j);
  for (let i = 1; i <= n; i++) {
    const cur = new Array<number>(m + 1);
    cur[0] = i;
    let rowMin = i;
    for (let j = 1; j <= m; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min((prev[j] as number) + 1, (cur[j - 1] as number) + 1, (prev[j - 1] as number) + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, (prev2[j - 2] as number) + 1);
      cur[j] = v;
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1;
    prev2 = prev;
    prev = cur;
  }
  return prev[m] as number;
}

/** The edits allowed for a word of this length (ADR 0124 D4 draft). */
export function editsFor(length: number): number {
  return length <= 3 ? 0 : length <= 7 ? 1 : 2;
}

export interface Correction {
  word: string;
  edits: number;
}

export interface TypoIndex {
  /** Candidates within the edit limit, best first (fewest edits, then most frequent). */
  correct(word: string): Correction[];
  name: string;
}

let tieBreakV1 = true;
/** B650: the first draft broke ties by frequency only; v1 adds the rules below. */
export function setTieBreak(v1: boolean): void {
  tieBreakV1 = v1;
}
const ROWS = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm'];
const adjacent = (a: string, b: string): boolean => ROWS.some((row) => { const i = row.indexOf(a); const j = row.indexOf(b); return i >= 0 && j >= 0 && Math.abs(i - j) === 1; });
/** Whether `candidate` is `word` with one letter swapped for a key next to it. */
const keyNeighbour = (word: string, candidate: string): boolean => {
  if (word.length !== candidate.length) return false;
  let diff = -1;
  for (let i = 0; i < word.length; i++) if (word[i] !== candidate[i]) { if (diff >= 0) return false; diff = i; }
  return diff >= 0 && adjacent(word[diff] as string, candidate[diff] as string);
};
const rank = (found: Map<string, number>, freq: ReadonlyMap<string, number>, word = ''): Correction[] =>
  [...found]
    .map(([w, edits]) => ({ word: w, edits }))
    .sort((a, b) => {
      if (a.edits !== b.edits) return a.edits - b.edits;
      if (tieBreakV1) {
        const first = Number(b.word[0] === word[0]) - Number(a.word[0] === word[0]);
        if (first !== 0) return first;
        const key = Number(keyNeighbour(word, b.word)) - Number(keyNeighbour(word, a.word));
        if (key !== 0) return key;
        const longer = Number(b.word.startsWith(word.slice(0, -1)) && b.word.length > word.length) - Number(a.word.startsWith(word.slice(0, -1)) && a.word.length > word.length);
        if (longer !== 0) return longer;
      }
      return (freq.get(b.word) ?? 0) - (freq.get(a.word) ?? 0) || (a.word < b.word ? -1 : 1);
    });

/** Deletion neighbourhoods (the SymSpell idea): every word's deletes up to its edit limit. */
export function deletionIndex(freq: ReadonlyMap<string, number>): TypoIndex {
  const deletes = new Map<string, string[]>();
  const add = (key: string, word: string): void => {
    const list = deletes.get(key);
    if (list === undefined) deletes.set(key, [word]);
    else if (list[list.length - 1] !== word) list.push(word);
  };
  const variants = (word: string, depth: number, out: Set<string>): void => {
    out.add(word);
    if (depth === 0 || word.length <= 1) return;
    for (let i = 0; i < word.length; i++) variants(word.slice(0, i) + word.slice(i + 1), depth - 1, out);
  };
  for (const word of freq.keys()) {
    const max = Math.max(1, editsFor(word.length));
    const out = new Set<string>();
    variants(word, max, out);
    for (const v of out) add(v, word);
  }
  return {
    name: 'deletion',
    correct(word) {
      const max = editsFor(word.length);
      if (max === 0) return [];
      const out = new Set<string>();
      variants(word, max, out);
      const found = new Map<string, number>();
      for (const v of out) {
        for (const candidate of deletes.get(v) ?? []) {
          if (found.has(candidate) || candidate === word) continue;
          const d = osa(word, candidate, max);
          if (d <= max && d <= Math.max(1, editsFor(candidate.length))) found.set(candidate, d);
        }
      }
      return rank(found, freq, word);
    },
    size: deletes.size,
  } as TypoIndex & { size: number };
}

const trigrams = (word: string): string[] => {
  const padded = `  ${word} `;
  const out: string[] = [];
  for (let i = 0; i + 3 <= padded.length; i++) out.push(padded.slice(i, i + 3));
  return out;
};

/** Trigram overlap: candidates share enough trigrams, then the edit distance decides. */
export function trigramIndex(freq: ReadonlyMap<string, number>, minShared = 0.3): TypoIndex {
  const postings = new Map<string, string[]>();
  for (const word of freq.keys()) {
    for (const g of new Set(trigrams(word))) {
      const list = postings.get(g);
      if (list === undefined) postings.set(g, [word]);
      else list.push(word);
    }
  }
  return {
    name: 'trigram',
    correct(word) {
      const max = editsFor(word.length);
      if (max === 0) return [];
      const grams = new Set(trigrams(word));
      const shared = new Map<string, number>();
      for (const g of grams) for (const w of postings.get(g) ?? []) shared.set(w, (shared.get(w) ?? 0) + 1);
      const found = new Map<string, number>();
      for (const [candidate, count] of shared) {
        if (candidate === word) continue;
        if (count / grams.size < minShared) continue;
        const d = osa(word, candidate, max);
        if (d <= max && d <= Math.max(1, editsFor(candidate.length))) found.set(candidate, d);
      }
      return rank(found, freq, word);
    },
    size: postings.size,
  } as TypoIndex & { size: number };
}

/** A BK-tree over the edit distance. */
export function bkTreeIndex(freq: ReadonlyMap<string, number>): TypoIndex {
  interface Node {
    word: string;
    kids: Map<number, Node>;
  }
  let root: Node | undefined;
  for (const word of freq.keys()) {
    if (root === undefined) {
      root = { word, kids: new Map() };
      continue;
    }
    let node = root;
    for (;;) {
      const d = osa(word, node.word, 64);
      const next = node.kids.get(d);
      if (next === undefined) {
        node.kids.set(d, { word, kids: new Map() });
        break;
      }
      node = next;
    }
  }
  return {
    name: 'bk-tree',
    correct(word) {
      const max = editsFor(word.length);
      const found = new Map<string, number>();
      if (max === 0 || root === undefined) return [];
      const stack: Node[] = [root];
      while (stack.length > 0) {
        const node = stack.pop() as Node;
        const d = osa(word, node.word, 64);
        if (d <= max && d > 0 && d <= Math.max(1, editsFor(node.word.length))) found.set(node.word, d);
        for (const [k, kid] of node.kids) if (k >= d - max && k <= d + max) stack.push(kid);
      }
      return rank(found, freq, word);
    },
  };
}

/** A cheap sound-alike key (our own, Soundex-like): first letter, then consonant classes. */
export function soundKey(word: string): string {
  const w = word.replace(/ph/g, 'f').replace(/ck/g, 'k').replace(/qu/g, 'kw').replace(/x/g, 'ks');
  const cls = (c: string): string =>
    'bfpv'.includes(c) ? '1' : 'cgjkqsz'.includes(c) ? '2' : 'dt'.includes(c) ? '3' : c === 'l' ? '4' : 'mn'.includes(c) ? '5' : c === 'r' ? '6' : '';
  let out = w[0] ?? '';
  let last = cls(out);
  for (const c of w.slice(1)) {
    const k = cls(c);
    if (k !== '' && k !== last) out += k;
    if ('aeiouyhw'.includes(c)) last = '';
    else last = k;
  }
  return out.slice(0, 5);
}

// --- Numbers -------------------------------------------------------------------------------

const NUMBER_WORDS: Readonly<Record<string, number>> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, fifteen: 15, twenty: 20, thirty: 30, fifty: 50, hundred: 100, half: 0.5,
};
export const UNIT_WORDS: ReadonlySet<string> = new Set(['heart', 'hearts', 'second', 'seconds', 'secs', 'tick', 'ticks', 'block', 'blocks', 'percent', 'level', 'levels', 'damage', 'health', 'hp', 'durability', 'uses', 'speed', 'light']);

/** The number a word stands for, or undefined. */
export function numberOf(word: string): number | undefined {
  if (/^-?\d+(?:\.\d+)?$/.test(word)) return Number(word);
  return NUMBER_WORDS[word];
}
