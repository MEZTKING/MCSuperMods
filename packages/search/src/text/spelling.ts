/**
 * British and American spellings folded to one form, the British one (ADR 0124 D4): by rule for
 * -ize and -yze (with {@link FOLD_EXCEPTIONS} for the words the rule must leave), and by list for
 * -our/-or, -re/-er, -ce/-se, -ll-/-l-, -ogue/-og and single words such as grey/gray. Inflected
 * forms of a listed word fold too (`colors`, `colored`, `centred`). Folding is idempotent: a
 * folded word folds to itself. Works on one normalised word; pure.
 */

/** Words whose British form adds a `u`: -or to -our. Their -ous, -ary and -ist forms keep no `u`. */
const OUR = [
  'arbor',
  'ardor',
  'armor',
  'behavior',
  'candor',
  'clamor',
  'color',
  'demeanor',
  'endeavor',
  'favor',
  'fervor',
  'flavor',
  'glamor',
  'harbor',
  'honor',
  'humor',
  'labor',
  'neighbor',
  'odor',
  'parlor',
  'rancor',
  'rigor',
  'rumor',
  'savior',
  'savor',
  'splendor',
  'tumor',
  'valor',
  'vapor',
  'vigor',
];
const OUR_SUFFIXES = [
  '',
  's',
  'ed',
  'ing',
  'er',
  'ers',
  'ful',
  'fully',
  'less',
  'able',
  'ably',
  'ite',
  'ites',
  'y',
  'al',
  'hood',
  'hoods',
];

/** American -er words whose British form ends in -re. */
const RE: Readonly<Record<string, string>> = {
  caliber: 'calibre',
  center: 'centre',
  centimeter: 'centimetre',
  fiber: 'fibre',
  goiter: 'goitre',
  kilometer: 'kilometre',
  liter: 'litre',
  luster: 'lustre',
  maneuver: 'manoeuvre',
  meager: 'meagre',
  meter: 'metre',
  millimeter: 'millimetre',
  miter: 'mitre',
  ocher: 'ochre',
  saber: 'sabre',
  scepter: 'sceptre',
  somber: 'sombre',
  specter: 'spectre',
  theater: 'theatre',
};
const RE_SUFFIXES = ['', 's', 'ed', 'ing', 'piece', 'pieces'];

/** Words whose American inflections keep one `l` where British doubles it (`traveled`). */
const LL = [
  'barrel',
  'bevel',
  'cancel',
  'channel',
  'chisel',
  'counsel',
  'dial',
  'duel',
  'enamel',
  'equal',
  'fuel',
  'funnel',
  'gravel',
  'grovel',
  'jewel',
  'label',
  'level',
  'libel',
  'marvel',
  'model',
  'panel',
  'pedal',
  'pummel',
  'quarrel',
  'revel',
  'rival',
  'shovel',
  'shrivel',
  'signal',
  'snorkel',
  'spiral',
  'swivel',
  'tassel',
  'total',
  'towel',
  'travel',
  'tunnel',
  'unravel',
  'yodel',
];
const LL_SUFFIXES = ['ed', 'ing', 'er', 'ers'];

/** Single words and their inflections: American on the left, British on the right. */
const WORDS: Readonly<Record<string, string>> = {
  acknowledgment: 'acknowledgement',
  acknowledgments: 'acknowledgements',
  aging: 'ageing',
  airplane: 'aeroplane',
  airplanes: 'aeroplanes',
  aluminum: 'aluminium',
  analog: 'analogue',
  analogs: 'analogues',
  artifact: 'artefact',
  artifacts: 'artefacts',
  ax: 'axe',
  catalog: 'catalogue',
  cataloged: 'catalogued',
  cataloging: 'cataloguing',
  catalogs: 'catalogues',
  cozier: 'cosier',
  cozy: 'cosy',
  defense: 'defence',
  defenseless: 'defenceless',
  defenses: 'defences',
  dialog: 'dialogue',
  dialogs: 'dialogues',
  enroll: 'enrol',
  enrollment: 'enrolment',
  epilog: 'epilogue',
  esthetic: 'aesthetic',
  fulfill: 'fulfil',
  fulfillment: 'fulfilment',
  gray: 'grey',
  grayed: 'greyed',
  grayer: 'greyer',
  grayest: 'greyest',
  graying: 'greying',
  grayish: 'greyish',
  grayness: 'greyness',
  grays: 'greys',
  grayscale: 'greyscale',
  installment: 'instalment',
  jewelry: 'jewellery',
  judgment: 'judgement',
  judgments: 'judgements',
  license: 'licence',
  licenses: 'licences',
  mold: 'mould',
  molded: 'moulded',
  molder: 'moulder',
  molding: 'moulding',
  molds: 'moulds',
  moldy: 'mouldy',
  monolog: 'monologue',
  mustache: 'moustache',
  offense: 'offence',
  offenses: 'offences',
  pajamas: 'pyjamas',
  pickax: 'pickaxe',
  plow: 'plough',
  plowed: 'ploughed',
  plowing: 'ploughing',
  plows: 'ploughs',
  pretense: 'pretence',
  prolog: 'prologue',
  skeptic: 'sceptic',
  skeptical: 'sceptical',
  skeptics: 'sceptics',
  skillful: 'skilful',
  smolder: 'smoulder',
  smoldering: 'smouldering',
  willful: 'wilful',
  woolen: 'woollen',
  yogurt: 'yoghurt',
};

/**
 * Words the -ize and -yze rule leaves alone: they are spelt with a `z` on both sides of the
 * Atlantic. A word whose -ize stem ends in `size` (resize, oversized) is left too.
 */
export const FOLD_EXCEPTIONS: ReadonlySet<string> = new Set([
  'baize',
  'capsize',
  'maize',
  'prize',
  'seize',
]);

/** Joins a British stem and a suffix: `centre` and `ed` is `centred`, `catalogue` and `ing` `cataloguing`. */
function join(stem: string, suffix: string): string {
  if (suffix === '') return stem;
  if (stem.endsWith('e') && /^[aeiouy]/.test(suffix)) return stem.slice(0, -1) + suffix;
  return stem + suffix;
}

function buildList(): Map<string, string> {
  const list = new Map<string, string>();
  for (const base of OUR) {
    const british = `${base.slice(0, -2)}our`;
    for (const suffix of OUR_SUFFIXES) list.set(base + suffix, british + suffix);
  }
  for (const [american, british] of Object.entries(RE)) {
    for (const suffix of RE_SUFFIXES) list.set(american + suffix, join(british, suffix));
  }
  for (const base of LL) {
    for (const suffix of LL_SUFFIXES) list.set(base + suffix, `${base}l${suffix}`);
  }
  for (const [american, british] of Object.entries(WORDS)) list.set(american, british);
  // A British form is never itself an American key, so that folding stays idempotent.
  for (const british of [...list.values()]) list.delete(british);
  return list;
}

const LIST: ReadonlyMap<string, string> = buildList();

/** -ize and -yze with their inflections; group 1 the stem, 2 `iz` or `yz`, 3 the ending. */
const IZE = /^(.*[a-z])(iz|yz)(e|es|ed|ing|er|ers|ation|ations|able)$/;

/** The British spelling of one normalised word; any other word is returned as it is. */
export function fold(word: string): string {
  const listed = LIST.get(word);
  if (listed !== undefined) return listed;
  if (word.length > 5) {
    const match = IZE.exec(word);
    if (match !== null) {
      const [, stem, z, ending] = match as unknown as [string, string, string, string];
      const base = `${stem}${z}e`;
      if (!FOLD_EXCEPTIONS.has(base) && !base.endsWith('size') && !FOLD_EXCEPTIONS.has(word)) {
        return `${stem}${z === 'iz' ? 'is' : 'ys'}${ending}`;
      }
    }
  }
  return word;
}

/** Every American form the list folds, with its British form: for tests and documentation. */
export function foldList(): ReadonlyMap<string, string> {
  return LIST;
}
